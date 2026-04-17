import frappe
from frappe.utils import today, cint, fmt_money, slug, nowdate, get_datetime, now_datetime, date_diff

@frappe.whitelist()
def get_delivery_note_items_for_customer(customer):
    items = frappe.db.sql("""
        SELECT 
            dni.item_code, dni.item_name, dni.description, dni.qty, dni.stock_qty,
            dni.uom, dni.stock_uom, dni.conversion_factor, dni.rate, dni.amount,
            dni.warehouse, dni.item_group, dni.brand,
            dn.name as delivery_note, dni.name as dn_detail, dni.custom_validated,
            COALESCE(dni.billed_amt, 0) as billed_amt, dni.amount as total_amount,
            dni.so_detail, dni.against_sales_order,
            COALESCE((SELECT SUM(sii.qty) FROM `tabSales Invoice Item` sii
                INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
                WHERE sii.dn_detail = dni.name AND si.docstatus = 1 AND si.is_return = 0), 0) as billed_qty,
            COALESCE((SELECT SUM(ABS(rdni.qty)) FROM `tabDelivery Note Item` rdni
                INNER JOIN `tabDelivery Note` rdn ON rdn.name = rdni.parent
                WHERE rdni.dn_detail = dni.name AND rdn.docstatus = 1 AND rdn.is_return = 1), 0) as returned_qty,
            COALESCE((SELECT SUM(ABS(sii.qty)) FROM `tabSales Invoice Item` sii
                INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
                WHERE sii.dn_detail = dni.name AND si.docstatus = 1 AND si.is_return = 1), 0) as credit_note_qty
        FROM `tabDelivery Note Item` dni
        INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
        WHERE dn.customer = %s AND dn.docstatus = 1 AND dn.is_return = 0
          AND dn.status IN ('To Bill', 'Partially Billed', 'Completed')
        ORDER BY dn.posting_date, dn.creation, dni.idx
    """, (customer,), as_dict=1)

    unbilled_items = []
    for item in items:
        net_deliverable_qty = item.qty - item.returned_qty - item.credit_note_qty
        pending_qty = net_deliverable_qty - item.billed_qty
        billed_amt = item.billed_amt or 0
        total_amt = item.total_amount or 0
        pending_amount = total_amt - billed_amt
        if pending_qty > 0.001:
            item.qty = pending_qty
            item.stock_qty = pending_qty * (item.conversion_factor or 1)
            item.amount = pending_qty * item.rate
            if total_amt > 0 and pending_amount > 0 and pending_amount < item.amount:
                item.amount = pending_amount
            unbilled_items.append(item)
    return unbilled_items


def execute(filters=None):
    today_date = nowdate()
    company = frappe.get_cached_value("Global Defaults", None, "default_company") or frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        frappe.throw("Please set default company in Global Defaults")
    company_currency = frappe.get_cached_value("Company", company, "default_currency")

    columns = [
        {"label": "العميل",     "fieldname": "cust_name",        "fieldtype": "Data",     "width": 180},
        {"label": "المديونية",  "fieldname": "cust_outstanding",  "fieldtype": "Currency", "width": 130},
        {"label": "",           "fieldname": "separator0",         "fieldtype": "Data",     "width": 40},
        {"label": "تم التسجيل","fieldname": "registered",         "fieldtype": "Check",    "width": 40},
        {"label": "الزبون",    "fieldname": "customer",           "fieldtype": "Link", "options": "Customer", "width": 140},
        {"label": "فاتورة",    "fieldname": "create_invoice",     "fieldtype": "Data",     "width": 80},
        {"label": "اسم البند", "fieldname": "item_name",          "fieldtype": "Data",     "width": 300},
        {"label": "العدد",     "fieldname": "qty",                "fieldtype": "Data",     "width": 60},
        {"label": "تأكيد",     "fieldname": "custom_validated",   "fieldtype": "Check",    "width": 40},
        {"label": "",           "fieldname": "separator",          "fieldtype": "Data",     "width": 40},
        {"label": "اسم العميل","fieldname": "against",            "fieldtype": "Data",     "width": 180},
        {"label": "مدان",      "fieldname": "debit",              "fieldtype": "Data",     "width": 130},
        {"label": "دائن",      "fieldname": "credit",             "fieldtype": "Currency", "width": 130},
        {"label": "Balance",   "fieldname": "balance",            "fieldtype": "Currency", "width": 130},
        {"label": "تاكيد",     "fieldname": "manual_confirm",     "fieldtype": "Check",    "width": 40},
        {"label": "",           "fieldname": "separator2",         "fieldtype": "Data",     "width": 40},
    ]

    modes = ["بنك مصر", "بوسطه", "فودافون كاش بولا 01006131346", "فودافون كاش المحل 01020202513", "فودافون كاش بولا 01055757330", "Cash"]
    mode_accounts = {}
    mode_balances = {}

    for mode in modes:
        account = frappe.db.get_value("Mode of Payment Account", {"parent": mode, "company": company}, "default_account")
        if account:
            mode_accounts[mode] = account
            balance = frappe.db.sql("SELECT SUM(debit - credit) FROM `tabGL Entry` WHERE account = %s AND company = %s AND is_cancelled = 0", (account, company))[0][0] or 0.0
            mode_balances[mode] = balance
        else:
            mode_accounts[mode] = None
            mode_balances[mode] = 0.0
        columns.append({"label": mode, "fieldname": f"party_{slug(mode)}", "fieldtype": "Data", "width": 200})
        columns.append({"label": mode, "fieldname": f"amount_{slug(mode)}", "fieldtype": "Currency", "width": 130})
        columns.append({"label": mode, "fieldname": f"confirm_{slug(mode)}", "fieldtype": "Check", "width": 40})

    # --- Outstanding customers ---
    outstanding_customers = frappe.db.sql("""
        SELECT ple.party AS customer, COALESCE(cust.customer_name, ple.party) AS customer_name,
            SUM(ple.amount) AS total_outstanding, last_pe.last_payment_date
        FROM `tabPayment Ledger Entry` ple
        LEFT JOIN `tabCustomer` cust ON cust.name = ple.party
        LEFT JOIN (
            SELECT party, MAX(posting_date) AS last_payment_date
            FROM `tabPayment Entry`
            WHERE party_type = 'Customer' AND docstatus = 1 AND payment_type = 'Receive'
            GROUP BY party
        ) last_pe ON last_pe.party = ple.party
        WHERE ple.party_type = 'Customer' AND ple.docstatus = 1 AND ple.company = %(company)s
        GROUP BY ple.party
        HAVING total_outstanding > 0
        ORDER BY last_payment_date IS NULL ASC, last_payment_date DESC
    """, {"company": company}, as_dict=True)

    for oc in outstanding_customers:
        if oc.last_payment_date:
            days = date_diff(today_date, oc.last_payment_date)
            oc.days_label = f"{oc.customer_name} (اليوم)" if days == 0 else f"{oc.customer_name} ({days} يوم)"
        else:
            oc.days_label = f"{oc.customer_name} (لا يوجد)"
        oc.customer_id = oc.customer

    total_outstanding = sum(oc.total_outstanding for oc in outstanding_customers)
    oc_count = len(outstanding_customers)

    # --- DN items ---
    # Show in the dashboard:
    #   - is_return = 0:
    #       * 'To Bill' or 'Partly Billed' → always show (pending billing, any date)
    #       * 'Closed' or 'Completed'      → only show if posted today (for reference)
    #   - is_return = 1 → only show if posted today
    dn_items = frappe.db.sql("""
        SELECT dni.name AS dni, dn.name AS delivery_note, dn.customer, dni.item_name, dni.qty,
            dni.custom_validated, dn.is_return,
            CASE WHEN dn.status IN ('Closed', 'Completed') THEN 1 ELSE 0 END AS registered
        FROM `tabDelivery Note` dn
        JOIN `tabDelivery Note Item` dni ON dni.parent = dn.name
        WHERE dn.docstatus = 1
          AND (
            (dn.is_return = 0 AND (
                dn.status IN ('To Bill', 'Partially Billed')
                OR (dn.status IN ('Closed', 'Completed') AND dn.posting_date = %(today)s)
            ))
            OR (dn.is_return = 1 AND dn.posting_date = %(today)s)
          )
        ORDER BY registered DESC, dn.posting_date ASC, dn.modified ASC
    """, {"today": today_date}, as_dict=True)
    dn_count = len(dn_items)

    # --- Cash PE today (GL section) ---
    cash_pes = frappe.db.sql("""
        SELECT pe.name AS voucher_no, pe.posting_date, pe.received_amount, pe.party,
            COALESCE(cust.customer_name, pe.party) AS customer_name,
            pe.`custom_تم_التأكيد_من_الخزنه` AS manual_confirm
        FROM `tabPayment Entry` pe
        LEFT JOIN `tabCustomer` cust ON cust.name = pe.party
        WHERE pe.company = %(company)s AND pe.posting_date = %(today)s AND pe.docstatus = 1
          AND pe.payment_type = 'Receive' AND pe.party_type = 'Customer' AND pe.mode_of_payment = 'Cash'
        ORDER BY pe.posting_date ASC, pe.creation ASC
    """, {"company": company, "today": today_date}, as_dict=True)

    balance = 0.0
    gl_rows = []
    for pe in cash_pes:
        balance += pe.received_amount or 0
        gl_rows.append(frappe._dict({
            "posting_date": pe.posting_date, "voucher_type": "Payment Entry",
            "voucher_no": pe.voucher_no, "against": pe.customer_name,
            "debit": fmt_money(pe.received_amount or 0, currency=company_currency),
            "credit": fmt_money(0, currency=company_currency),
            "balance": fmt_money(balance, currency=company_currency),
            "manual_confirm": cint(pe.manual_confirm or 0),
        }))
    gl_count = len(gl_rows)

    # --- PE entries per mode ---
    pe_by_mode = {mode: [] for mode in modes}
    for mode in modes:
        mode_account = mode_accounts.get(mode) or ""
        pes = frappe.db.sql("""
            SELECT pe.name AS voucher_no, pe.party, pe.party_type,
                COALESCE(cust.customer_name, pe.party) AS party_name,
                CASE WHEN pe.payment_type = 'Internal Transfer' THEN pe.paid_amount
                     WHEN pe.payment_type = 'Pay' THEN pe.paid_amount
                     ELSE pe.received_amount END AS amount,
                pe.mode_of_payment, pe.paid_from, pe.paid_to,
                pe.`custom_تم_التأكيد_من_الخزنه` AS confirmed,
                pe.posting_date, pe.creation, pe.payment_type
            FROM `tabPayment Entry` pe
            LEFT JOIN `tabCustomer` cust ON cust.name = pe.party AND pe.party_type = 'Customer'
            WHERE pe.docstatus = 1
              AND (pe.mode_of_payment = %(mode)s
                   OR (%(account)s != '' AND pe.paid_from = %(account)s)
                   OR (%(account)s != '' AND pe.paid_to = %(account)s))
            ORDER BY pe.posting_date DESC, pe.creation DESC
        """, {"mode": mode, "account": mode_account}, as_dict=True)
        pes.reverse()

        for pe in pes:
            diff = now_datetime() - get_datetime(pe.creation)
            days, hours = diff.days, diff.seconds // 3600
            time_ago = f"{days} يوم" if days > 0 else (f"{hours} ساعه" if hours > 0 else "الآن")
            if pe.payment_type == "Internal Transfer":
                display_name = f"{pe.paid_from} ← {pe.paid_to} ({time_ago})"
            else:
                display_name = f"{pe.party_name or pe.party or ''} ({time_ago})"
            pe_by_mode[mode].append({
                "voucher_no": pe.voucher_no, "party_name": display_name,
                "amount": pe.amount, "mode": mode,
                "confirmed": cint(pe.confirmed or 0), "payment_type": pe.payment_type
            })

    # -------------------------------------------------------------------------
    # ROW LAYOUT
    # -------------------------------------------------------------------------
    oc_extra = max(0, oc_count - dn_count)
    total_body_rows = max(oc_count, dn_count) + gl_count

    null_pe = {"voucher_no": None, "party_name": None, "amount": None,
               "mode": None, "confirmed": 0, "payment_type": None}

    for mode in modes:
        pe_list = pe_by_mode[mode]
        if len(pe_list) > oc_count:
            pe_list = pe_list[-oc_count:]
        top_pad = oc_count - len(pe_list)
        pe_list = ([dict(null_pe, mode=mode)] * top_pad) + pe_list
        pe_list = pe_list + ([dict(null_pe, mode=mode)] * (total_body_rows - oc_count))
        pe_by_mode[mode] = pe_list

    def get_pe_for_row(report_row_index):
        result = {}
        for mode in modes:
            slug_mode = slug(mode)
            pe_row = pe_by_mode[mode][report_row_index] if report_row_index < len(pe_by_mode[mode]) else dict(null_pe)
            result[f"party_{slug_mode}"]    = pe_row["party_name"]
            result[f"amount_{slug_mode}"]   = pe_row["amount"]
            result[f"confirm_{slug_mode}"]  = pe_row["confirmed"]
            result[f"voucher_no_{slug_mode}"] = pe_row["voucher_no"]
            result[f"payment_type_{slug_mode}"] = pe_row["payment_type"]
        return result

    def get_oc_for_row(report_row_index):
        if report_row_index < oc_count:
            oc = outstanding_customers[report_row_index]
            return {"cust_name": oc.days_label, "cust_outstanding": oc.total_outstanding, "cust_customer_id": oc.customer_id}
        return {"cust_name": None, "cust_outstanding": None, "cust_customer_id": None}

    final_data = []

    # --- Extra OC+PE rows at top (rows 0 .. oc_extra-1) ---
    for i in range(oc_extra):
        row = frappe._dict({
            "dni": None, "delivery_note": None, "customer": None, "item_name": None,
            "qty": None, "custom_validated": None, "registered": None, "is_return": 0,
            "separator": None, "separator2": None,
            "_is_gl_only": 0, "_is_pe_row": 0, "_is_total": 0,
            "against": None, "debit": None, "credit": None, "balance": None, "manual_confirm": 0,
        })
        row.update(get_oc_for_row(i))
        row.update(get_pe_for_row(i))
        final_data.append(row)

    # --- DN rows (rows oc_extra .. oc_extra+dn_count-1) ---
    for i, dn_row in enumerate(dn_items):
        report_row = oc_extra + i
        if dn_row.qty is not None:
            dn_row.qty = "{:,.0f}".format(dn_row.qty) if dn_row.qty == int(dn_row.qty) else "{:,.2f}".format(dn_row.qty)
        dn_row.against = None
        dn_row.debit = None
        dn_row.credit = None
        dn_row.balance = None
        dn_row.manual_confirm = 0
        dn_row.separator2 = None
        dn_row._is_gl_only = 0
        dn_row._is_pe_row = 0
        dn_row._is_total = 0
        dn_row.is_return = cint(dn_row.is_return or 0)
        dn_row.update(get_oc_for_row(report_row))
        dn_row.update(get_pe_for_row(report_row))
        final_data.append(dn_row)

    # --- GL rows (rows oc_extra+dn_count .. total-1) — no OC, no PE ---
    for j, gl_row in enumerate(gl_rows):
        report_row = oc_extra + dn_count + j
        combined_row = frappe._dict({
            "dni": None, "delivery_note": None, "customer": None, "item_name": None,
            "qty": None, "custom_validated": None, "registered": None, "is_return": 0,
            "separator": None, "separator2": None,
            "_is_gl_only": 1, "_is_pe_row": 0, "_is_total": 0,
            "against": gl_row.against, "debit": gl_row.debit, "credit": gl_row.credit,
            "balance": gl_row.balance, "manual_confirm": gl_row.manual_confirm,
            "voucher_type": gl_row.voucher_type, "voucher_no": gl_row.voucher_no,
            "cust_name": None, "cust_outstanding": None, "cust_customer_id": None,
        })
        for mode in modes:
            slug_mode = slug(mode)
            combined_row[f"party_{slug_mode}"] = None
            combined_row[f"amount_{slug_mode}"] = None
            combined_row[f"confirm_{slug_mode}"] = 0
            combined_row[f"voucher_no_{slug_mode}"] = None
            combined_row[f"payment_type_{slug_mode}"] = None
        final_data.append(combined_row)

    # --- Total row ---
    total_row = frappe._dict({
        "item_name": "Total Balances", "_is_total": 1, "_is_gl_only": 0,
        "_is_pe_row": 0, "is_return": 0, "separator2": None,
        "cust_name": None, "cust_outstanding": total_outstanding, "cust_customer_id": None,
    })
    for mode in modes:
        slug_mode = slug(mode)
        total_row[f"amount_{slug_mode}"] = mode_balances[mode]
    final_data.append(total_row)

    return columns, final_data


def trigger_refresh(doc, method):
    try:
        should_refresh = False
        if doc.doctype == "Payment Entry":
            if hasattr(doc, 'payment_type') and hasattr(doc, 'party_type'):
                if doc.payment_type == "Receive" and doc.party_type == "Customer":
                    should_refresh = True
        elif doc.doctype == "Delivery Note":
            should_refresh = True
            frappe.logger().info(f"Delivery Note trigger fired: {doc.name}, status: {doc.status}, method: {method}")
        elif doc.doctype == "GL Entry":
            if hasattr(doc, 'account') and hasattr(doc, 'is_cancelled'):
                if doc.account == "Cash - EMP" and doc.is_cancelled == 0:
                    should_refresh = True
        if should_refresh:
            frappe.publish_realtime("customer_item_delivery_update")
            frappe.logger().info(f"Published realtime update for {doc.doctype}: {doc.name}")
    except Exception as e:
        frappe.log_error(f"Error in customer_item_delivery trigger_refresh: {str(e)}")
