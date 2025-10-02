frappe.query_reports["Invoice Item Ledger"] = {
    "filters": [
        {
            "fieldname": "company",
            "label": __("Company"),
            "fieldtype": "Link",
            "options": "Company",
            "default": frappe.defaults.get_user_default("Company")
        },
        {
            "fieldname": "days",
            "label": __("Days Back"),
            "fieldtype": "Int",
            "default": 999
        },
        {
            "fieldname": "party_type",
            "label": __("Party Type"),
            "fieldtype": "Link",
            "options": "DocType",
            "default": "Customer"
        },
        {
            "fieldname": "party",
            "label": __("Party"),
            "fieldtype": "Link",
            "options": "Customer",
            "default": ""
        }
    ],

    after_datatable_render: function(datatable) {
        // Scroll to bottom of the report table
        setTimeout(() => {
            let scrollContainer = document.querySelector(".dt-scrollable");
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }, 300); // small delay to ensure table is rendered
    }
};
