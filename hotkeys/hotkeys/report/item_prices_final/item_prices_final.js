// Copyright (c) 2016, Frappe Technologies Pvt. Ltd. and contributors
     // For license information, please see license.txt

     frappe.query_reports["Item Prices final"] = {
       filters: [
         {
           fieldname: "items",
           label: __("Items Filter"),
           fieldtype: "Select",
           options: "Enabled Items only\nDisabled Items only\nAll Items",
           default: "Enabled Items only",
         },
         {
           fieldname: "item_name",
           label: __("Item Name"),
           fieldtype: "Data",
           placeholder: __("Enter item name to search"),
         },
       ],
     };
