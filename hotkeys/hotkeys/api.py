import frappe
import re

def normalize(text):
    text = re.sub(r'[أإآ]', 'ا', text)
    text = re.sub(r'ة', 'ه', text)
    # Strip common Arabic prefixes
    text = re.sub(r'^[بوكلف]', '', text.strip())
    return text.strip()

@frappe.whitelist()
def search_items_and_customers(item_keywords, customer_keyword):
    keywords = [k.strip() for k in item_keywords.split(',') if k.strip()]
    
    item_results = {}
    for keyword in keywords:
        norm = normalize(keyword)
        items = frappe.db.sql("""
            SELECT name FROM `tabItem`
            WHERE REPLACE(REPLACE(REPLACE(item_name,'أ','ا'),'إ','ا'),'آ','ا')
            LIKE %s
            LIMIT 5
        """, f'%{norm}%', as_dict=True)
        item_results[keyword] = [i['name'] for i in items]
    
    norm_cust = normalize(customer_keyword)
    customers = frappe.db.sql("""
        SELECT name FROM `tabCustomer`
        WHERE REPLACE(REPLACE(REPLACE(customer_name,'أ','ا'),'إ','ا'),'آ','ا')
        LIKE %s
        LIMIT 5
    """, f'%{norm_cust}%', as_dict=True)
    
    return {
        'items': item_results,
        'customers': [c['name'] for c in customers]
    }
