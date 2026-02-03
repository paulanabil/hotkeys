import frappe
from frappe.utils import today, cint, fmt_money, slug

def execute(filters=None):
    today_date = today()

    company = frappe.get_cached_value("Global Defaults", None, "default_company") or frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        frappe.throw("Please set default company in Global Defaults")
    company_currency = frappe.get_cached_value("Company", company, "default_currency")

    columns = [
        {"label": "تم التسجيل", "fieldname": "registered", "fieldtype": "Check", "width": 40},
        {"label": "الزبون", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 120},
        {"label": "اسم البند", "fieldname": "item_name", "fieldtype": "Data", "width": 300},
        {"label": "العدد", "fieldname": "qty", "fieldtype": "Data", "width": 60},
        {"label": "تأكيد", "fieldname": "custom_validated", "fieldtype": "Check", "width": 40},
        {"label": "", "fieldname": "separator", "fieldtype": "Data", "width": 40},
        {"label": "اسم العميل", "fieldname": "against", "fieldtype": "Data", "width": 180},
        {"label": f"مدان", "fieldname": "debit", "fieldtype": "Data", "width": 130},
        {"label": f"دائن", "fieldname": "credit", "fieldtype": "Currency", "width": 130},
        {"label": f"Balance", "fieldname": "balance", "fieldtype": "Currency", "width": 130},
        {"label":  "تاكيد", "fieldname": "manual_confirm", "fieldtype": "Check", "width": 40},
        {"label": "", "fieldname": "separator2", "fieldtype": "Data", "width": 40},
    ]

    # Define the modes
    modes = ["بنك مصر", "بوسطه", "فودافون كاش بولا 01006131346", "فودافون كاش المحل 01020202513"]
    mode_slugs = [slug(mode) for mode in modes]
    mode_accounts = {}
    mode_balances = {}

    for mode in modes:
        # Get default account for the mode
        account = frappe.db.get_value("Mode of Payment Account", {"parent": mode, "company": company}, "default_account")
        if account:
            mode_accounts[mode] = account
            # Get all-time balance: sum(debit - credit)
            balance_query = """
                SELECT SUM(debit - credit)
                FROM `tabGL Entry`
                WHERE account = %s AND company = %s AND is_cancelled = 0
            """
            balance = frappe.db.sql(balance_query, (account, company))[0][0] or 0.0
            mode_balances[mode] = balance
        else:
            mode_accounts[mode] = None
            mode_balances[mode] = 0.0

        # Add columns for each mode - simplified labels
        columns.append({"label": mode, "fieldname": f"party_{slug(mode)}", "fieldtype": "Data", "width": 150})
        columns.append({"label": mode, "fieldname": f"amount_{slug(mode)}", "fieldtype": "Currency", "width": 130})
        columns.append({"label": mode, "fieldname": f"confirm_{slug(mode)}", "fieldtype": "Check", "width": 40})

    dn_items = frappe.db.sql("""
        SELECT
            dni.name AS dni,
            dn.name AS delivery_note,
            dn.customer,
            dni.item_name,
            dni.qty,
            dni.custom_validated,
            CASE WHEN dn.status IN ('Closed', 'Completed') THEN 1 ELSE 0 END AS registered
        FROM `tabDelivery Note` dn
        JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
        WHERE dn.docstatus = 1
          AND (dn.status = 'To Bill' OR (dn.status IN ('Closed', 'Completed') AND dn.posting_date = %(today)s))
        ORDER BY registered DESC, dn.posting_date ASC, dn.modified ASC
    """, {"today": today_date}, as_dict=True)

    gl_entries = frappe.db.sql("""
        SELECT
            posting_date,
            account,
            against,
            debit,
            credit,
            voucher_type,
            voucher_no,
            party_type,
            party,
            remarks
        FROM `tabGL Entry`
        WHERE account = 'Cash - EMP'
          AND company = %(company)s
          AND posting_date = %(today)s
          AND is_cancelled = 0
        ORDER BY posting_date, creation
    """, {"company": company, "today": today_date}, as_dict=True)

    balance = 0.0
    gl_rows = []
    for gle in gl_entries:
        balance += gle.debit - gle.credit
        gle.balance = balance

        gle.debit = fmt_money(gle.debit, currency=company_currency)
        gle.credit = fmt_money(gle.credit, currency=company_currency)
        gle.balance = fmt_money(gle.balance, currency=company_currency)

        if gle.voucher_type == "Payment Entry":
            pe = frappe.db.get_value("Payment Entry", gle.voucher_no,
                                    ["mode_of_payment", "modified_by", "custom_تم_التأكيد_من_الخزنه"],
                                    as_dict=True)
            if pe:
                gle.manual_confirm = cint(pe.custom_تم_التأكيد_من_الخزنه or 0)
            else:
                continue
        else:
            gle.manual_confirm = 0

        gl_rows.append(gle)

    # Fetch Payment Entries for each mode today - organize by mode
    pe_by_mode = {mode: [] for mode in modes}
    
    for mode in modes:
        pes = frappe.db.sql("""
            SELECT
                pe.name AS voucher_no,
                pe.party,
                cust.customer_name AS party_name,
                pe.received_amount AS amount,
                pe.mode_of_payment,
                pe.custom_تم_التأكيد_من_الخزنه AS confirmed
            FROM `tabPayment Entry` pe
            LEFT JOIN `tabCustomer` cust ON cust.name = pe.party
            WHERE pe.mode_of_payment = %(mode)s
              AND pe.posting_date = %(today)s
              AND pe.docstatus = 1
              AND pe.payment_type = 'Receive'
              AND pe.party_type = 'Customer'
              AND pe.company = %(company)s
            ORDER BY pe.creation
        """, {"mode": mode, "today": today_date, "company": company}, as_dict=True)

        for pe in pes:
            pe_by_mode[mode].append({
                "voucher_no": pe.voucher_no,
                "party_name": pe.party_name or pe.party,
                "amount": pe.amount,
                "mode": mode,
                "confirmed": cint(pe.confirmed or 0)
            })

    final_data = []

    # Add all DN items first
    for row in dn_items:
        if row.qty is not None:
            row.qty = "{:,.0f}".format(row.qty) if row.qty == int(row.qty) else "{:,.2f}".format(row.qty)

        row.against = None
        row.debit = None
        row.credit = None
        row.balance = None
        row.manual_confirm = 0
        row.separator2 = None
        row._is_gl_only = 0
        row._is_pe_row = 0
        row._is_total = 0
        
        # Initialize all mode fields
        for mode in modes:
            slug_mode = slug(mode)
            row[f"party_{slug_mode}"] = None
            row[f"amount_{slug_mode}"] = None
            row[f"confirm_{slug_mode}"] = 0
        
        final_data.append(row)

    # Find max rows needed for GL and PE sections
    max_pe_rows = max([len(pe_by_mode[mode]) for mode in modes]) if any(pe_by_mode.values()) else 0
    max_rows = max(len(gl_rows), max_pe_rows)
    
    for i in range(max_rows):
        # Create a combined row
        combined_row = frappe._dict({
            "dni": None,
            "delivery_note": None,
            "customer": None,
            "item_name": None,
            "qty": None,
            "custom_validated": None,
            "registered": None,
            "separator": None,
            "separator2": None,
            "_is_gl_only": 0,
            "_is_pe_row": 0,
            "_is_total": 0,
        })
        
        # Add GL data if available
        if i < len(gl_rows):
            gl_row = gl_rows[i]
            combined_row.against = gl_row.against
            combined_row.debit = gl_row.debit
            combined_row.credit = gl_row.credit
            combined_row.balance = gl_row.balance
            combined_row.manual_confirm = gl_row.manual_confirm
            combined_row.voucher_type = gl_row.voucher_type
            combined_row.voucher_no = gl_row.voucher_no
            combined_row._is_gl_only = 1
        else:
            combined_row.against = None
            combined_row.debit = None
            combined_row.credit = None
            combined_row.balance = None
            combined_row.manual_confirm = 0
        
        # Add PE data for each mode if available
        for mode in modes:
            slug_mode = slug(mode)
            if i < len(pe_by_mode[mode]):
                pe_row = pe_by_mode[mode][i]
                combined_row[f"party_{slug_mode}"] = pe_row["party_name"]
                combined_row[f"amount_{slug_mode}"] = pe_row["amount"]
                combined_row[f"confirm_{slug_mode}"] = pe_row["confirmed"]
                combined_row[f"voucher_no_{slug_mode}"] = pe_row["voucher_no"]
            else:
                combined_row[f"party_{slug_mode}"] = None
                combined_row[f"amount_{slug_mode}"] = None
                combined_row[f"confirm_{slug_mode}"] = 0
                combined_row[f"voucher_no_{slug_mode}"] = None
        
        final_data.append(combined_row)

    # Add total row
    total_row = frappe._dict({
        "item_name": "Total Balances",
        "_is_total": 1,
        "_is_gl_only": 0,
        "_is_pe_row": 0,
        "separator2": None,
    })
    for mode in modes:
        slug_mode = slug(mode)
        total_row[f"amount_{slug_mode}"] = mode_balances[mode]
    final_data.append(total_row)

    return columns, final_data

def trigger_refresh(doc, method):
    if doc.doctype == "Payment Entry" and doc.payment_type == "Receive" and doc.party_type == "Customer":
        frappe.publish_realtime("customer_item_delivery_update")
