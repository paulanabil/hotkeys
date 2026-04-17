# ============================================================
# Custom Page: item-price-cleanup
# File: item_price_cleanup.py  (place in your app under pages/)
# ============================================================

import frappe
from frappe import _


@frappe.whitelist()
def get_duplicate_prices():
    """
    Returns all groups where an item has more than one price
    in the same price list (selling or buying).
    Groups are sorted newest-first so the first row = keeper.
    """
    sql = """
        SELECT
            ip.name,
            ip.item_code,
            ip.item_name,
            ip.price_list,
            ip.buying,
            ip.selling,
            ip.price_list_rate,
            ip.currency,
            ip.valid_from,
            ip.valid_upto,
            ip.creation,
            ip.modified
        FROM `tabItem Price` ip
        INNER JOIN (
            SELECT item_code, price_list
            FROM `tabItem Price`
            GROUP BY item_code, price_list
            HAVING COUNT(*) > 1
        ) dup ON ip.item_code = dup.item_code
               AND ip.price_list = dup.price_list
        ORDER BY ip.item_code, ip.price_list, ip.modified DESC
    """
    rows = frappe.db.sql(sql, as_dict=True)

    # Group into { "item_code||price_list": [rows...] }
    groups = {}
    for row in rows:
        key = f"{row['item_code']}||{row['price_list']}"
        groups.setdefault(key, []).append(row)

    # Each group: first row is keeper (newest modified), rest are duplicates
    result = []
    for key, entries in groups.items():
        keeper = entries[0]
        duplicates = entries[1:]
        result.append({
            "item_code": keeper["item_code"],
            "item_name": keeper.get("item_name") or keeper["item_code"],
            "price_list": keeper["price_list"],
            "selling": keeper.get("selling"),
            "buying": keeper.get("buying"),
            "keeper": keeper,
            "duplicates": duplicates,
            "duplicate_count": len(duplicates),
        })

    return {
        "groups": result,
        "total_duplicates": sum(g["duplicate_count"] for g in result),
        "total_groups": len(result),
    }


@frappe.whitelist()
def delete_duplicate_prices(names_to_delete):
    """
    Safely deletes a list of Item Price names.
    Verifies each is actually a duplicate before deleting.
    Returns summary.
    """
    import json
    if isinstance(names_to_delete, str):
        names_to_delete = json.loads(names_to_delete)

    if not names_to_delete:
        return {"deleted": 0, "errors": []}

    deleted = 0
    errors = []

    for name in names_to_delete:
        try:
            doc = frappe.get_doc("Item Price", name)
            # Safety check: confirm there IS another price for same item+pricelist
            count = frappe.db.count(
                "Item Price",
                {"item_code": doc.item_code, "price_list": doc.price_list},
            )
            if count <= 1:
                errors.append(f"{name}: only one price exists for this item+pricelist, skipped")
                continue

            frappe.delete_doc("Item Price", name, ignore_permissions=False)
            deleted += 1
        except Exception as e:
            errors.append(f"{name}: {str(e)}")

    frappe.db.commit()
    return {"deleted": deleted, "errors": errors}
