from __future__ import unicode_literals
import frappe
from frappe import _
from frappe.utils import flt, getdate, add_days, nowdate, get_datetime
from collections import OrderedDict
from datetime import datetime

def execute(filters=None):
    columns = get_columns()
    data = get_data(filters or {})
    
    return columns, data

def get_columns():
    return [
        {
            "label": _("التاريخ"),
            "fieldname": "posting_date",
            "fieldtype": "Date",
            "width": 120
        },
        {
            "label": _("الوصف"),
            "fieldname": "description",
            "fieldtype": "Data",
            "width": 300
        },
        {
            "label": _("السعر"),
            "fieldname": "rate",
            "fieldtype": "float",
            "precision": 2,
            "width": 70
        },
        {
            "label": _("العدد"),
            "fieldname": "quantity",
            "fieldtype": "float",
            "precision": 2,
            "width": 70
        },
        {
            "label": _("ا.الضرب"),
            "fieldname": "amount",
            "fieldtype": "float",
            "precision": 2,
            "width": 80
        },
        {
            "label": _("الاجمالى"),
            "fieldname": "total",
            "fieldtype": "float",
            "precision": 2,
            "width": 90
        }
    ]

def get_data(filters):
    party = filters.get("party")
    if not party:
        return []

    days = flt(filters.get("days")) or 999  # Increased default for broader history
    to_date = getdate(nowdate())
    from_date = getdate(add_days(to_date, -days))
    company = filters.get("company") or frappe.db.get_single_value("Global Defaults", "default_company")
    party_type = filters.get("party_type") or "Customer"

    # Get the default Accounts Receivable account (consider multi-currency later if needed)
    account = frappe.db.get_value("Company", company, "default_receivable_account")
    if not account:
        frappe.throw(_("Default Accounts Receivable account not set for company {0}").format(company))

    # Calculate opening balance (matches standard report: sum prior debits - credits)
    opening_balance = get_balance_on(account, from_date, party_type=party_type, party=party)

    # Fetch ALL GL Entries for party/account/date (no voucher type limit)
    gl_entries = get_gl_entries(filters, account, from_date, to_date)

    # Consolidate (group by date/voucher, like standard)
    consolidated_gle = consolidate_entries(gl_entries)

    data = []
    running_balance = flt(opening_balance)

    # Add opening balance row
    data.append({
        "posting_date": None,
        "description": _("ما قبله"),
        "rate": None,
        "quantity": None,
        "amount": None,
        "total": running_balance
    })

    # Process GL Entries (handle all voucher types)
    for entry in consolidated_gle:
        raw_date = entry["posting_date"]
        dt_object = get_datetime(raw_date)
        post_date = getdate(dt_object)

        # Full GL impact (debit - credit); no allocation adjustment
        amount = flt(entry["debit"] - entry["credit"])

        description = ""
        if entry.get("voucher_type") == "Sales Invoice":
            # Add item details
            items = frappe.db.sql("""
                SELECT item_name, item_code, rate, qty, amount
                FROM `tabSales Invoice Item`
                WHERE parent = %s AND docstatus = 1
                ORDER BY idx
            """, (entry.get("voucher_no"),), as_dict=True)

            for item in items:
                data.append({
                    "posting_date": post_date,
                    "description": f'{item.item_name}',
                    "rate": flt(item.rate),
                    "quantity": flt(item.qty),
                    "amount": flt(item.amount),
                    "total": None
                })

            description = f'فاتوره يوم {post_date}'

        elif entry.get("voucher_type") == "Payment Entry":
            mode_of_payment = frappe.db.get_value("Payment Entry", entry.get("voucher_no"), "mode_of_payment") or _("غير محدد")
            # Replace "Cash" with Arabic equivalent
            if mode_of_payment == "Cash":
                mode_of_payment = "كاش نقداً"
            custom_information = frappe.db.get_value("Payment Entry", entry.get("voucher_no"), "custom_information") or ""
            description = f'{mode_of_payment} تنزيل {post_date} {custom_information}'

        elif entry.get("voucher_type") == "Journal Entry":
            # Use remark or fallback
            user_remark = frappe.db.get_value("Journal Entry", entry.get("voucher_no"), "user_remark") or ""
            description = f'Journal Entry: {user_remark}' if user_remark else f'Journal Entry on {post_date}'

        else:
            # Fallback for other types (e.g., Sales Return)
            description = f'{entry.get("voucher_type")} on {post_date}'

        # Add transaction row if amount != 0
        if amount != 0:
            data.append({
                "posting_date": post_date,
                "description": description,
                "rate": None,
                "quantity": None,
                "amount": None,
                "total": amount  # Show transaction impact here
            })

            # Update running balance (cumulative, like standard report)
            running_balance += amount

            # Add subtotal row
            data.append({
                "posting_date": post_date,
                "description": _("الاجمالى"),
                "rate": None,
                "quantity": None,
                "amount": None,
                "total": running_balance
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

    values = [filters.get("party_type"), filters.get("party"), account, from_date, to_date] + condition_values

    # Fetch ALL vouchers for party/account/date (no valid_vouchers limit)
    query = """
        SELECT
            g.posting_date, g.voucher_type, g.voucher_no,
            SUM(g.debit) as debit, SUM(g.credit) as credit, MIN(g.creation) as creation
        FROM `tabGL Entry` g
        WHERE g.party_type = %s
        AND g.party = %s
        AND g.account = %s
        AND g.posting_date BETWEEN %s AND %s
        AND g.is_cancelled = 0
        {0}
        GROUP BY g.posting_date, g.voucher_type, g.voucher_no
        ORDER BY g.posting_date, creation
    """.format("AND " + conditions if conditions else "")

    gl_entries = frappe.db.sql(query, values, as_dict=True)
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

    # Exclude specific journal entries (as in your original)
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
        err_names = [x[0] for x in err_journals]
        conditions.append("g.voucher_no not in ({})".format(",".join(["%s"] * len(err_names))))
        values.extend(err_names)

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
        sys_names = [x[0] for x in system_generated_cr_dr_journals]
        conditions.append("g.voucher_no not in ({})".format(",".join(["%s"] * len(sys_names))))
        values.extend(sys_names)

    return " AND ".join(conditions), values
