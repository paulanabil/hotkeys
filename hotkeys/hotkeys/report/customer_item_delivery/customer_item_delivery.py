import frappe
from frappe.utils import today, cint, fmt_money, slug, nowdate

@frappe.whitelist()
def get_delivery_note_items_for_customer(customer):
    """Get all delivery note items for a customer that are ready to be billed
    Handles: returns, credit notes, partial billing, and sales orders"""
    
    # Get all delivery note items
    items = frappe.db.sql("""
        SELECT 
            dni.item_code,
            dni.item_name,
            dni.description,
            dni.qty,
            dni.stock_qty,
            dni.uom,
            dni.stock_uom,
            dni.conversion_factor,
            dni.rate,
            dni.amount,
            dni.warehouse,
            dni.item_group,
            dni.brand,
            dn.name as delivery_note,
            dni.name as dn_detail,
            dni.custom_validated,
            COALESCE(dni.billed_amt, 0) as billed_amt,
            dni.amount as total_amount,
            dni.so_detail,
            dni.against_sales_order,
            COALESCE(
                (SELECT SUM(sii.qty)
                 FROM `tabSales Invoice Item` sii
                 INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
                 WHERE sii.dn_detail = dni.name
                   AND si.docstatus = 1
                   AND si.is_return = 0),
                0
            ) as billed_qty,
            COALESCE(
                (SELECT SUM(ABS(rdni.qty))
                 FROM `tabDelivery Note Item` rdni
                 INNER JOIN `tabDelivery Note` rdn ON rdn.name = rdni.parent
                 WHERE rdni.dn_detail = dni.name
                   AND rdn.docstatus = 1
                   AND rdn.is_return = 1),
                0
            ) as returned_qty,
            COALESCE(
                (SELECT SUM(ABS(sii.qty))
                 FROM `tabSales Invoice Item` sii
                 INNER JOIN `tabSales Invoice` si ON si.name = sii.parent
                 WHERE sii.dn_detail = dni.name
                   AND si.docstatus = 1
                   AND si.is_return = 1),
                0
            ) as credit_note_qty
        FROM `tabDelivery Note Item` dni
        INNER JOIN `tabDelivery Note` dn ON dn.name = dni.parent
        WHERE dn.customer = %s
            AND dn.docstatus = 1
            AND dn.is_return = 0
            AND dn.status IN ('To Bill', 'Completed')
        ORDER BY dn.posting_date, dn.creation, dni.idx
    """, (customer,), as_dict=1)
    
    # Filter out fully billed/returned items and adjust quantities
    unbilled_items = []
    
    for item in items:
        # Calculate pending quantity
        net_deliverable_qty = item.qty - item.returned_qty - item.credit_note_qty
        pending_qty = net_deliverable_qty - item.billed_qty
        
        # Check if amount is fully billed
        billed_amt = item.billed_amt or 0
        total_amt = item.total_amount or 0
        pending_amount = total_amt - billed_amt
        
        # Only include if there's pending quantity
        if pending_qty > 0.001:
            # Adjust the quantity to only the unbilled amount
            item.qty = pending_qty
            item.stock_qty = pending_qty * (item.conversion_factor or 1)
            item.amount = pending_qty * item.rate
            
            # If billed_amt tracking is used and there's a discrepancy, use the pending amount
            if total_amt > 0 and pending_amount > 0 and pending_amount < item.amount:
                item.amount = pending_amount
            
            unbilled_items.append(item)
    
    return unbilled_items

def execute(filters=None):
    # Use nowdate() which respects system timezone settings
    today_date = nowdate()

    company = frappe.get_cached_value("Global Defaults", None, "default_company") or frappe.db.get_single_value("Global Defaults", "default_company")
    if not company:
        frappe.throw("Please set default company in Global Defaults")
    company_currency = frappe.get_cached_value("Company", company, "default_currency")

    columns = [
        {"label": "تم التسجيل", "fieldname": "registered", "fieldtype": "Check", "width": 40},
        {"label": "الزبون", "fieldname": "customer", "fieldtype": "Link", "options": "Customer", "width": 120},
        {"label": "فاتورة", "fieldname": "create_invoice", "fieldtype": "Data", "width": 80},
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
    modes = ["بنك مصر", "بوسطه", "فودافون كاش بولا 01006131346", "فودافون كاش المحل 01020202513", "فودافون كاش بولا 01055757330", "Cash"]
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
        columns.append({"label": mode, "fieldname": f"party_{slug(mode)}", "fieldtype": "Data", "width": 200})
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

    # Fetch Payment Entry details for each mode
    pe_by_mode = {mode: [] for mode in modes}
    
    for mode in modes:
        # Get last 12 Payment Entries for this mode
        pes = frappe.db.sql("""
            SELECT
                pe.name AS voucher_no,
                pe.party,
                COALESCE(cust.customer_name, pe.party) AS party_name,
                pe.received_amount AS amount,
                pe.mode_of_payment,
                pe.custom_تم_التأكيد_من_الخزنه AS confirmed,
                pe.posting_date,
                pe.creation,
                pe.payment_type
            FROM `tabPayment Entry` pe
            LEFT JOIN `tabCustomer` cust ON cust.name = pe.party AND pe.party_type = 'Customer'
            WHERE pe.mode_of_payment = %(mode)s
              AND pe.docstatus = 1
            ORDER BY pe.posting_date DESC, pe.creation DESC
            LIMIT 12
        """, {"mode": mode}, as_dict=True)
        
        # Reverse to show oldest to newest
        pes.reverse()

        
        for pe in pes:
            # Calculate time ago from posting_date
            from datetime import datetime
            from frappe.utils import get_datetime, now_datetime
            
            posting_datetime = get_datetime(pe.posting_date)
            now = now_datetime()
            diff = now - posting_datetime
            
            days = diff.days
            hours = diff.seconds // 3600
            
            if days > 0:
                time_ago = f"{days} يوم"
            elif hours > 0:
                time_ago = f"{hours} ساعه"
            else:
                time_ago = "الآن"
            
            party_with_time = f"{pe.party_name} ({time_ago})"
            
            pe_by_mode[mode].append({
                "voucher_no": pe.voucher_no,
                "party_name": party_with_time,
                "amount": pe.amount,
                "mode": mode,
                "confirmed": cint(pe.confirmed or 0),
                "payment_type": pe.payment_type
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
            row[f"voucher_no_{slug_mode}"] = None
            row[f"payment_type_{slug_mode}"] = None
        
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
                combined_row[f"payment_type_{slug_mode}"] = pe_row["payment_type"]
            else:
                combined_row[f"party_{slug_mode}"] = None
                combined_row[f"amount_{slug_mode}"] = None
                combined_row[f"confirm_{slug_mode}"] = 0
                combined_row[f"voucher_no_{slug_mode}"] = None
                combined_row[f"payment_type_{slug_mode}"] = None
        
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
    """Trigger report refresh on relevant document changes"""
    try:
        should_refresh = False
        
        # Payment Entry - trigger for any Receive from Customer (including cancelled)
        if doc.doctype == "Payment Entry":
            if hasattr(doc, 'payment_type') and hasattr(doc, 'party_type'):
                if doc.payment_type == "Receive" and doc.party_type == "Customer":
                    should_refresh = True
        
        # Delivery Note - trigger for any change (including cancellation)
        # The SQL query filters by docstatus=1, so cancelled ones won't show
        elif doc.doctype == "Delivery Note":
            should_refresh = True
            # Debug logging
            frappe.logger().info(f"Delivery Note trigger fired: {doc.name}, status: {doc.status}, method: {method}")
        
        # GL Entry - only for Cash account entries
        elif doc.doctype == "GL Entry":
            if hasattr(doc, 'account') and hasattr(doc, 'is_cancelled'):
                if doc.account == "Cash - EMP" and doc.is_cancelled == 0:
                    should_refresh = True
        
        if should_refresh:
            frappe.publish_realtime("customer_item_delivery_update")
            frappe.logger().info(f"Published realtime update for {doc.doctype}: {doc.name}")
    except Exception as e:
        # Log error but don't break the document save
        frappe.log_error(f"Error in customer_item_delivery trigger_refresh: {str(e)}")
