import frappe
from frappe.utils import get_datetime

# ------------------------------
# ITEM SEARCH
# ------------------------------
@frappe.whitelist()
def search_items(doctype, txt, searchfield, start, page_len, filters):
    # 1. Split search text into multiple keywords
    search_terms = txt.strip().split()
    if not search_terms:
        return []

    # 2. Base query
    query = """
        SELECT item_code, CONCAT(item_name, '\n', IFNULL(description, '')) AS item_label
        FROM `tabItem`
        WHERE disabled = 0
    """

    # 3. Add dynamic AND conditions (case-insensitive)
    for idx, term in enumerate(search_terms):
        query += f"""
            AND (
                LOWER(item_code) LIKE %(term_{idx})s
                OR LOWER(item_name) LIKE %(term_{idx})s
                OR LOWER(description) LIKE %(term_{idx})s
            )
        """

    # 4. Pagination
    query += " LIMIT %(start)s, %(page_len)s"

    # 5. Bind params
    params = {
        "start": start,
        "page_len": page_len
    }
    for idx, term in enumerate(search_terms):
        params[f"term_{idx}"] = f"%{term.lower()}%"

    return frappe.db.sql(query, params)


# ------------------------------
# DELIVERY NOTE ITEM VALIDATION
# ------------------------------
@frappe.whitelist()
def validate_item(dni, validated):
    frappe.db.set_value("Delivery Note Item", dni, "custom_validated", int(validated))
    frappe.db.commit()
    return True


# ------------------------------
# POLLING CHECK (OLD METHOD)
# ------------------------------
@frappe.whitelist()
def has_new_customer_item_delivery(last_timestamp):
    """Check if there are any new or modified Delivery Notes after last_timestamp"""
    try:
        last_dt = get_datetime(last_timestamp)
    except Exception as e:
        frappe.log_error(f"Invalid timestamp: {last_timestamp} ({e})", "Customer Item Delivery Check")
        return False

    latest = frappe.db.get_value(
        "Delivery Note",
        {"docstatus": 1},
        "modified",
        order_by="modified desc"
    )

    frappe.logger().info(f"🕒 Checking: last={last_dt}, latest={latest}")

    if not latest:
        return False

    result = latest > last_dt
    frappe.logger().info(f"🔍 has_new_customer_item_delivery → {result}")
    return result


# ------------------------------
# 🔔 REALTIME PUSH NOTIFICATION (NEW)
# ------------------------------
@frappe.whitelist()
def broadcast_customer_item_delivery_update(doc=None, method=None):
    """
    Broadcast a realtime event when a new Delivery Note is inserted or updated.
    This allows the 'Customer Item Delivery' report to auto-refresh instantly.
    """
    try:
        frappe.publish_realtime(
            event="customer_item_delivery_update",
            message={"docname": doc.name if doc else None},
            after_commit=True
        )
        frappe.logger().info(f"📢 Realtime broadcast for Delivery Note: {getattr(doc, 'name', None)}")
    except Exception as e:
        frappe.log_error(f"Realtime broadcast failed: {e}", "Customer Item Delivery Push")
