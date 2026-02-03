frappe.query_reports["Customer Item Delivery"] = {
    onload: function(report) {
        frappe.realtime.on("customer_item_delivery_update", function (data) {
            report.refresh();
        });

        if (!document.getElementById("customer-item-delivery-css")) {
            const style = document.createElement("style");
            style.id = "customer-item-delivery-css";
            style.innerHTML = `
                .dt-column[data-fieldname="separator"], .dt-column[data-fieldname="separator2"] {
                    background-color: black;
                    width: 40px !important;
                }
                .dt-cell[data-fieldname="separator"], .dt-cell[data-fieldname="separator2"] {
                    background-color: black !important;
                }
            `;
            document.head.appendChild(style);
        }
    },

    after_datatable_render: function(datatable) {
        // Add borders to specific cells
        setTimeout(() => {
            const rows = document.querySelectorAll('.dt-row');
            
            rows.forEach((row) => {
                const cells = row.querySelectorAll('.dt-cell');
                
                // Check row type by examining cell content
                let isDnRow = false;
                let isGlRow = false;
                let isTotalRow = false;
                
                cells.forEach(cell => {
                    const fieldname = cell.getAttribute('data-fieldname');
                    const content = cell.textContent.trim();
                    
                    if (fieldname === 'customer' && content !== '') isDnRow = true;
                    if (fieldname === 'against' && content !== '') isGlRow = true;
                    if (fieldname === 'item_name' && content.includes('Total Balances')) isTotalRow = true;
                });
                
                // Apply borders based on row type
                cells.forEach(cell => {
                    const fieldname = cell.getAttribute('data-fieldname');
                    const content = cell.textContent.trim();
                    
                    // DN row borders
                    if (isDnRow && ['registered', 'customer', 'item_name', 'qty', 'custom_validated'].includes(fieldname)) {
                        cell.style.border = '1px solid #d1d8dd';
                    }
                    // GL row borders
                    else if (isGlRow && ['against', 'debit', 'credit', 'balance', 'manual_confirm'].includes(fieldname)) {
                        cell.style.border = '1px solid #d1d8dd';
                    }
                    // PE columns in GL rows - only if they have content (excluding empty checkboxes)
                    else if (isGlRow && (fieldname.startsWith('party_') || fieldname.startsWith('amount_'))) {
                        if (content !== '') {
                            cell.style.border = '1px solid #d1d8dd';
                        }
                    }
                    // Confirm checkboxes - only show border if there's a checkbox with content
                    else if (isGlRow && fieldname.startsWith('confirm_')) {
                        const checkbox = cell.querySelector('input[type="checkbox"]');
                        if (checkbox) {
                            cell.style.border = '1px solid #d1d8dd';
                        }
                    }
                    // Total row borders
                    else if (isTotalRow && (fieldname === 'item_name' || fieldname.startsWith('amount_'))) {
                        cell.style.border = '1px solid #d1d8dd';
                        cell.style.backgroundColor = '#f5f5f5';
                    }
                });
            });
        }, 100);
        
        setTimeout(() => {
            const container = document.querySelector(".dt-scrollable") || document.querySelector(".report-table-wrapper");
            if (container) {
                requestAnimationFrame(() => {
                    container.scrollTop = container.scrollHeight;
                });
            }
        }, 150);
    },

    formatter: function(value, row, column, data, default_formatter) {
        value = default_formatter(value, row, column, data);

        // Hide DN columns for GL rows and total
        if (data._is_gl_only || data._is_total) {
            if (["customer", "item_name", "qty", "custom_validated", "registered"].includes(column.fieldname)) {
                return "";
            }
        }

        // Hide GL columns for DN rows and total
        if (!data._is_gl_only) {
            if (["against", "debit", "credit", "balance", "manual_confirm"].includes(column.fieldname)) {
                return "";
            }
        }

        // For total row, hide irrelevant columns
        if (data._is_total) {
            if (["customer", "item_name", "qty", "custom_validated", "registered", "against", "debit", "credit", "balance", "manual_confirm", "separator"].includes(column.fieldname)) {
                return "";
            }
        }

        // Handle mode columns - show for GL rows and total
        const modes = ["بنك مصر", "بوسطه", "فودافون كاش بولا 01006131346", "فودافون كاش المحل 01020202513"];
        modes.forEach(mode => {
            const slug_mode = mode.replace(/\s+/g, '-');
            const party_field = `party_${slug_mode}`;
            const amount_field = `amount_${slug_mode}`;
            const confirm_field = `confirm_${slug_mode}`;
            
            // Hide mode columns for DN rows
            if (!data._is_gl_only && !data._is_total && [party_field, amount_field, confirm_field].includes(column.fieldname)) {
                return "";
            }
            
            // For GL rows - hide empty party/amount/confirm fields
            if (data._is_gl_only && column.fieldname === party_field && !data[party_field]) {
                return "";
            }
            if (data._is_gl_only && column.fieldname === amount_field && !data[amount_field]) {
                return "";
            }
            
            // For total row, show only amount fields
            if (data._is_total) {
                if (column.fieldname === party_field || column.fieldname === confirm_field) {
                    return "";
                }
                if (column.fieldname === amount_field) {
                    value = `<strong>${value}</strong>`;
                }
            }
        });

        if (column.fieldname === "separator" || column.fieldname === "separator2") {
            return `<div style="width:100%; height:100%; display:block;"></div>`;
        }

        if (column.fieldname === "item_name" && data.dni && data.delivery_note) {
            const url = frappe.utils.get_form_link("Delivery Note", data.delivery_note);
            value = `<a href="${url}" target="_blank" style="color:#1b8fbb; font-weight:600; text-decoration:underline;">
                        ${data.item_name}
                    </a>`;
        }

        // Make "Against Account" clickable to open the voucher
        if (column.fieldname === "against" && data._is_gl_only && data.voucher_no && data.voucher_type) {
            const url = frappe.utils.get_form_link(data.voucher_type, data.voucher_no);
            value = `<a href="${url}" target="_blank" style="color:#1b8fbb; font-weight:600; text-decoration:underline;">
                        ${value}
                    </a>`;
        }

        // For GL rows, make party fields clickable to Payment Entry
        modes.forEach(mode => {
            const slug_mode = mode.replace(/\s+/g, '-');
            const party_field = `party_${slug_mode}`;
            const voucher_field = `voucher_no_${slug_mode}`;
            
            if (column.fieldname === party_field && data._is_gl_only && data[voucher_field]) {
                const url = frappe.utils.get_form_link("Payment Entry", data[voucher_field]);
                value = `<a href="${url}" target="_blank" style="color:#1b8fbb; font-weight:600; text-decoration:underline;">
                            ${value}
                        </a>`;
            }
        });

        // GL manual confirm checkbox
        if (column.fieldname === "manual_confirm") {
            if (data._is_gl_only && data.voucher_type === "Payment Entry") {
                const checked = data.manual_confirm ? "checked" : "";
                value = `<input type="checkbox" ${checked}
                        onchange="frappe.call({
                            method: 'frappe.client.set_value',
                            args: {
                                doctype: 'Payment Entry',
                                name: '${data.voucher_no}',
                                fieldname: 'custom_تم_التأكيد_من_الخزنه',
                                value: this.checked ? 1 : 0
                            },
                            callback: (r) => {
                                if (!r.exc) {
                                    frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                                } else {
                                    this.checked = !this.checked;
                                }
                            }
                        })">`;
            } else {
                return "";
            }
        }

        // Payment Entry confirm checkboxes for each mode - ONLY show if there's actual data
        modes.forEach(mode => {
            const slug_mode = mode.replace(/\s+/g, '-');
            const confirm_field = `confirm_${slug_mode}`;
            const voucher_field = `voucher_no_${slug_mode}`;
            const party_field = `party_${slug_mode}`;
            
            if (column.fieldname === confirm_field) {
                // Only render checkbox if there's actual payment entry data
                if (data._is_gl_only && data[voucher_field] && data[party_field]) {
                    const checked = data[confirm_field] ? "checked" : "";
                    value = `<input type="checkbox" ${checked}
                            onchange="frappe.call({
                                method: 'frappe.client.set_value',
                                args: {
                                    doctype: 'Payment Entry',
                                    name: '${data[voucher_field]}',
                                    fieldname: 'custom_تم_التأكيد_من_الخزنه',
                                    value: this.checked ? 1 : 0
                                },
                                callback: (r) => {
                                    if (!r.exc) {
                                        frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                                        cur_report.refresh();
                                    } else {
                                        this.checked = !this.checked;
                                    }
                                }
                            })">`;
                } else {
                    // Return empty string - don't show anything
                    return "";
                }
            }
        });

        if (column.fieldname === "qty" && data.qty && parseFloat(data.qty.replace(/,/g, "")) < 0) {
            value = `<span style="color:red; font-weight:bold;">${value}</span>`;
        }

        if (column.fieldname === "registered") {
            const checked = data.registered ? "checked" : "";
            value = `<input type="checkbox" disabled ${checked}>`;
        }

        if (column.fieldname === "custom_validated") {
            const checked = data.custom_validated ? "checked" : "";
            value = `<input type="checkbox" ${checked}
                    onchange="frappe.call({
                        method: 'hotkeys.api.validate_item',
                        args: { dni: '${data.dni}', validated: this.checked ? 1 : 0 },
                        callback: (r) => {
                            if (!r.exc) {
                                frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                            } else {
                                this.checked = !this.checked;
                            }
                        }
                    })">`;
        }

        // For total row, bold the item_name
        if (data._is_total && column.fieldname === "item_name") {
            value = `<strong>${value}</strong>`;
        }

        return value;
    }
};
