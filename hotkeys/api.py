import frappe

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
