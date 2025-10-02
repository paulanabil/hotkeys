from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt, getdate, add_days, nowdate, get_datetime
from collections import OrderedDict
from datetime import datetime

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters)
    return columns, data

def get_columns():
    return [
        {
            "label": _("Posting Date"),
            "fieldname": "posting_date",
            "fieldtype": "Date",
            "width": 150
        },
        {
            "label": _("Description"),
            "fieldname": "description",
            "fieldtype": "Data",
            "width": 300
        },
        {
            "label": _("Rate"),
            "fieldname": "rate",
            "fieldtype": "Currency",
            "width": 100
        },
        {
            "label": _("Quantity"),
            "fieldname": "quantity",
            "fieldtype": "Float",
            "width": 100
        },
        {
            "label": _("Amount"),
            "fieldname": "amount",
            "fieldtype": "Currency",
            "width": 150
        },
        {
            "label": _("Total"),
            "fieldname": "total",
            "fieldtype": "Currency",
            "width": 150
        }
    ]

def get_data(filters):
    if not filters.get("party"):
        frappe.throw(_("Please select Party"))

    party = filters.get("party")
    days = flt(filters.get("days")) or 7
    to_date = getdate(nowdate())
    from_date = getdate(add_days(to_date, -days))
    company = filters.get("company") or frappe.db.get_single_value("Global Defaults", "default_company")
    party_type = filters.get("party_type") or "Customer"

    # Get the default Accounts Receivable account
    account = frappe.db.get_value("Company", company, "default_receivable_account")
    if not account:
        frappe.throw(_("Default Accounts Receivable account not set for company {0}").format(company))

    # Calculate opening balance
    opening_balance = get_balance_on(account, from_date, party_type=party_type, party=party)

    # Fetch GL Entries
    gl_entries = get_gl_entries(filters, account, from_date, to_date)

    # Consolidate GL Entries
    consolidated_gle = consolidate_entries(gl_entries)

    data = []
    running_balance = flt(opening_balance)

    # Add opening balance row
    data.append({
        "description": _("Opening Balance"),
        "rate": None,
        "quantity": None,
        "amount": None,
        "total": running_balance,
        "posting_date": None
    })

    # Process consolidated GL Entries
    for entry in consolidated_gle:
        raw_date = entry["posting_date"]
        dt_object = get_datetime(raw_date)
        post_date = getdate(dt_object)

        amount = flt(entry["debit"] - entry["credit"])

        # Validate Payment Entry allocations
        if entry["voucher_type"] == "Payment Entry":
            allocated_amount = frappe.db.sql("""
                SELECT SUM(allocated_amount) as total
                FROM `tabPayment Entry Reference`
                WHERE parent = %s
                AND docstatus = 1
            """, entry["voucher_no"])[0][0] or 0.0
            custom_information = frappe.db.get_value("Payment Entry", entry["voucher_no"], "custom_information") or ""
            if abs(flt(amount) + flt(allocated_amount)) > 0.01:
                amount = -allocated_amount if allocated_amount else amount

        # If Sales Invoice, fetch item details
        if entry["voucher_type"] == "Sales Invoice":
            invoice_total = frappe.db.sql("""
                SELECT SUM(amount) as total
                FROM `tabSales Invoice Item`
                WHERE parent = %s
                AND docstatus = 1
            """, entry["voucher_no"])[0][0] or 0.0
            if abs(flt(amount) - flt(invoice_total)) > 0.01:
                amount = invoice_total

            items = frappe.db.sql("""
                SELECT item_name, item_code, rate, qty, amount
                FROM `tabSales Invoice Item`
                WHERE parent = %s
                AND docstatus = 1
                ORDER BY idx
            """, entry["voucher_no"], as_dict=True)
            for item in items:
                data.append({
                    "description": f'<a href="/app/item/{item.item_code}">{item.item_name}</a>',
                    "rate": flt(item.rate),
                    "quantity": flt(item.qty),
                    "amount": flt(item.amount),
                    "total": None,
                    "posting_date": post_date
                })

        # Add Invoice or Payment row
        if entry["voucher_type"] == "Payment Entry":
            description = f'<a href="/app/payment-entry/{entry["voucher_no"]}">نقداً يوم {post_date} {custom_information}</a>'
        else:
            description = f'<a href="/app/sales-invoice/{entry["voucher_no"]}">فاتوره يوم {post_date}</a>'
        
        data.append({
            "description": description,
            "rate": None,
            "quantity": None,
            "amount": None,
            "total": amount,
            "posting_date": post_date
        })

        running_balance += amount
        # Add balance row
        data.append({
            "description": _("الاجمالى"),
            "rate": None,
            "quantity": None,
            "amount": None,
            "total": running_balance,
            "posting_date": post_date
        })

    return data

def get_balance_on(account, date, party_type=None, party=None):
    if not account:
        return 0.0

    condition = "and posting_date < %s"
    values = [account, date]

    if party_type and party:
        condition += " and party_type = %s and party = %s"
        values += [party_type, party]

    balance = frappe.db.sql("""
        SELECT SUM(debit) - SUM(credit)
        FROM `tabGL Entry`
        WHERE account = %s
        AND is_cancelled = 0
        {0}
    """.format(condition), values)[0][0] or 0.0

    return flt(balance)

def get_gl_entries(filters, account, from_date, to_date):
    conditions, condition_values = get_conditions(filters, account)
    query_values = [filters.get("party_type"), filters.get("party"), account, from_date, to_date] + condition_values

    # Pre-filter valid voucher_nos
    valid_vouchers = frappe.db.sql("""
        SELECT name
        FROM `tabPayment Entry`
        WHERE docstatus = 1 AND payment_type = 'Receive'
        AND posting_date BETWEEN %s AND %s
        UNION
        SELECT name
        FROM `tabSales Invoice`
        WHERE docstatus = 1
        AND posting_date BETWEEN %s AND %s
    """, (from_date, to_date, from_date, to_date), as_dict=True)

    voucher_nos = [v.name for v in valid_vouchers]
    if not voucher_nos:
        return []

    gl_entries = frappe.db.sql("""
        SELECT
            g.posting_date, g.voucher_type, g.voucher_no,
            SUM(g.debit) as debit, SUM(g.credit) as credit, MIN(g.creation) as creation
        FROM `tabGL Entry` g
        WHERE g.party_type = %s
        AND g.party = %s
        AND g.account = %s
        AND g.posting_date BETWEEN %s AND %s
        AND g.is_cancelled = 0
        AND g.voucher_no IN %s
        {0}
        GROUP BY g.posting_date, g.voucher_type, g.voucher_no
        ORDER BY g.posting_date, g.creation
    """.format("AND " + conditions if conditions else ""), query_values + [tuple(voucher_nos)], as_dict=True)

    return gl_entries

def consolidate_entries(gl_entries):
    consolidated_gle = []
    immutable_ledger = frappe.db.get_single_value("Accounts Settings", "enable_immutable_ledger")
    seen_keys = set()

    for gle in gl_entries:
        key = (gle.posting_date, gle.voucher_type, gle.voucher_no)
        if immutable_ledger:
            key += (gle.creation,)
        if key not in seen_keys:
            seen_keys.add(key)
            consolidated_gle.append(gle)

    return sorted(consolidated_gle, key=lambda x: (x["posting_date"], x["creation"]))

def get_conditions(filters, account):
    conditions = []
    values = []

    # Exclude specific journal entries
    err_journals = frappe.db.get_all(
        "Journal Entry",
        filters={
            "company": filters.get("company"),
            "docstatus": 1,
            "voucher_type": ("in", ["Exchange Rate Revaluation", "Exchange Gain Or Loss"]),
        },
        fields=["name"],
        as_list=True,
    )
    if err_journals:
        conditions.append("g.voucher_no not in ({})".format(",".join(["%s"] * len(err_journals))))
        values.extend([x[0] for x in err_journals])

    system_generated_cr_dr_journals = frappe.db.get_all(
        "Journal Entry",
        filters={
            "company": filters.get("company"),
            "docstatus": 1,
            "voucher_type": ("in", ["Credit Note", "Debit Note"]),
            "is_system_generated": 1,
        },
        fields=["name"],
        as_list=True,
    )
    if system_generated_cr_dr_journals:
        conditions.append("g.voucher_no not in ({})".format(",".join(["%s"] * len(system_generated_cr_dr_journals))))
        values.extend([x[0] for x in system_generated_cr_dr_journals])

    return " AND ".join(conditions), values
