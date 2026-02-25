frappe.query_reports["Customer Item Delivery"] = {
    onload: function(report) {
        // Store reference to current report
        this.report = report;
        
        // Track if we're in the middle of a checkbox update
        window._checkbox_update_in_progress = false;
        
        frappe.realtime.on("customer_item_delivery_update", function (data) {
            // Don't refresh if a checkbox update is in progress
            if (!window._checkbox_update_in_progress) {
                report.refresh();
            }
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
                /* Hide the row number column */
                .dt-row-index {
                    display: none !important;
                }
                .dt-cell--col-0 {
                    display: none !important;
                }
                
                /* Print page styling - 100% font and fixed zoom controls */
                .print-format {
                    font-size: 100% !important;
                    -webkit-text-size-adjust: 100% !important;
                    text-size-adjust: 100% !important;
                }
                
                .print-format * {
                    font-size: 100% !important;
                }
                
                /* Fix zoom controls at bottom */
                .page-break-message {
                    position: fixed !important;
                    bottom: 0 !important;
                    left: 0 !important;
                    right: 0 !important;
                    z-index: 1000 !important;
                    background: white !important;
                    box-shadow: 0 -2px 10px rgba(0,0,0,0.1) !important;
                }
                
                /* Ensure print content doesn't go under fixed controls */
                .print-format-gutter {
                    padding-bottom: 80px !important;
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
                let hasPeData = false;
                
                cells.forEach(cell => {
                    const fieldname = cell.getAttribute('data-fieldname');
                    const content = cell.textContent.trim();
                    
                    if (fieldname === 'customer' && content !== '') isDnRow = true;
                    if (fieldname === 'against' && content !== '') isGlRow = true;
                    if (fieldname === 'item_name' && content.includes('Total Balances')) isTotalRow = true;
                    if (fieldname && fieldname.startsWith('party_') && content !== '') hasPeData = true;
                });
                
                // Apply borders based on row type
                cells.forEach(cell => {
                    const fieldname = cell.getAttribute('data-fieldname');
                    const content = cell.textContent.trim();
                    
                    // DN row borders
                    if (isDnRow && ['registered', 'customer', 'create_invoice', 'item_name', 'qty', 'custom_validated'].includes(fieldname)) {
                        cell.style.border = '1px solid #d1d8dd';
                    }
                    // GL row borders
                    else if (isGlRow && ['against', 'debit', 'credit', 'balance', 'manual_confirm'].includes(fieldname)) {
                        cell.style.border = '1px solid #d1d8dd';
                    }
                    // PE columns - show border if there's content
                    else if ((isGlRow || hasPeData) && (fieldname.startsWith('party_') || fieldname.startsWith('amount_'))) {
                        if (content !== '') {
                            cell.style.border = '1px solid #d1d8dd';
                        }
                    }
                    // Confirm checkboxes - only show border if there's a checkbox with content
                    else if ((isGlRow || hasPeData) && fieldname.startsWith('confirm_')) {
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

        // Define slug function - exactly matches Python's frappe.utils.slug()
        const makeSlug = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\w\u0600-\u06FF]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '');
        };

        const modes = ["بنك مصر", "بوسطه", "فودافون كاش بولا 01006131346", "فودافون كاش المحل 01020202513", "فودافون كاش بولا 01055757330", "Cash"];

        // Check if this row has any PE data (not a DN row and not total row)
        const isDnRow = data.customer || data.item_name && !data._is_total;
        const isPeRow = !isDnRow && !data._is_total;

        // Hide DN columns for PE rows and total
        if (isPeRow || data._is_total) {
            if (["customer", "create_invoice", "item_name", "qty", "custom_validated", "registered"].includes(column.fieldname)) {
                return "";
            }
        }

        // Hide GL columns for DN rows
        if (isDnRow) {
            if (["against", "debit", "credit", "balance", "manual_confirm"].includes(column.fieldname)) {
                return "";
            }
        }

        // For total row, hide irrelevant columns
        if (data._is_total) {
            if (["against", "debit", "credit", "balance", "manual_confirm", "separator"].includes(column.fieldname)) {
                return "";
            }
        }

        // Handle the new "Create Invoice" column
        if (column.fieldname === "create_invoice" && data.customer) {
            value = `<a href="#" onclick="
                event.preventDefault();
                const customer = '${data.customer.replace(/'/g, "\\'")}';
                
                // Open new tab with Sales Invoice
                const newWindow = window.open('/app/sales-invoice/new-sales-invoice-1', '_blank');
                
                // Wait for new window to load, then set customer and fetch delivery notes
                if (newWindow) {
                    const checkInterval = setInterval(() => {
                        try {
                            if (newWindow.cur_frm && newWindow.cur_frm.doc && newWindow.frappe) {
                                clearInterval(checkInterval);
                                
                                // Set customer first
                                newWindow.cur_frm.set_value('customer', customer);
                                
                                // Wait for customer to be set, then fetch all delivery note items
                                setTimeout(() => {
                                    // Call our custom whitelisted method
                                    newWindow.frappe.call({
                                        method: 'hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.get_delivery_note_items_for_customer',
                                        args: {
                                            customer: customer
                                        },
                                        callback: function(r) {
                                            if (r.message && r.message.length > 0) {
                                                // Clear existing items
                                                newWindow.cur_frm.clear_table('items');
                                                
                                                // Add each delivery note item to sales invoice
                                                r.message.forEach(function(dn_item) {
                                                    const row = newWindow.cur_frm.add_child('items');
                                                    
                                                    // Map delivery note item fields to sales invoice item fields
                                                    row.item_code = dn_item.item_code;
                                                    row.item_name = dn_item.item_name;
                                                    row.description = dn_item.description;
                                                    row.qty = dn_item.qty;
                                                    row.stock_qty = dn_item.stock_qty;
                                                    row.uom = dn_item.uom;
                                                    row.stock_uom = dn_item.stock_uom;
                                                    row.conversion_factor = dn_item.conversion_factor;
                                                    row.rate = dn_item.rate;
                                                    row.amount = dn_item.amount;
                                                    row.delivery_note = dn_item.delivery_note;
                                                    row.dn_detail = dn_item.dn_detail;
                                                    row.warehouse = dn_item.warehouse;
                                                    row.item_group = dn_item.item_group;
                                                    row.brand = dn_item.brand;
                                                    row.income_account = 'Sales - EMP';
                                                    
                                                    // Sales order references
                                                    if (dn_item.so_detail) {
                                                        row.so_detail = dn_item.so_detail;
                                                    }
                                                    if (dn_item.against_sales_order) {
                                                        row.against_sales_order = dn_item.against_sales_order;
                                                    }
                                                    
                                                    // Copy custom fields if they exist
                                                    if (dn_item.custom_validated) {
                                                        row.custom_validated = dn_item.custom_validated;
                                                    }
                                                });
                                                
                                                newWindow.cur_frm.refresh_field('items');
                                                newWindow.cur_frm.dirty();
                                                
                                                // Now force price list prices
                                                setTimeout(() => {
                                                    const price_list = newWindow.cur_frm.doc.selling_price_list;
                                                    if (price_list && newWindow.cur_frm.doc.items?.length) {
                                                        newWindow.frappe.dom.freeze('جاري تحديث الأسعار...');
                                                        
                                                        const promises = newWindow.cur_frm.doc.items
                                                            .filter(item => item.item_code)
                                                            .map(item =>
                                                                newWindow.frappe.call({
                                                                    method: 'frappe.client.get_value',
                                                                    args: {
                                                                        doctype: 'Item Price',
                                                                        filters: {
                                                                            price_list: price_list,
                                                                            item_code: item.item_code
                                                                        },
                                                                        fieldname: ['price_list_rate']
                                                                    }
                                                                }).then(res => ({
                                                                    row: item,
                                                                    price: res?.message?.price_list_rate || 0
                                                                }))
                                                            );
                                                        
                                                        Promise.allSettled(promises).then(results => {
                                                            let updated = false;
                                                            let missing = [];
                                                            
                                                            results.forEach(res => {
                                                                if (res.status === 'fulfilled') {
                                                                    const { row, price } = res.value;
                                                                    if (price) {
                                                                        newWindow.frappe.model.set_value(row.doctype, row.name, 'price_list_rate', price);
                                                                        newWindow.frappe.model.set_value(row.doctype, row.name, 'rate', price);
                                                                        updated = true;
                                                                    } else {
                                                                        missing.push(row.item_code);
                                                                    }
                                                                }
                                                            });
                                                            
                                                            if (missing.length) {
                                                                newWindow.frappe.show_alert({
                                                                    message: 'لا يوجد سعر لـ: ' + missing.join(', '),
                                                                    indicator: 'orange'
                                                                }, 5);
                                                            }
                                                            
                                                            if (updated) {
                                                                newWindow.cur_frm.trigger('calculate_taxes_and_totals');
                                                                newWindow.cur_frm.dirty();
                                                            }
                                                            
                                                            newWindow.frappe.dom.unfreeze();
                                                            
                                                            // Now update purchase prices
                                                            setTimeout(async () => {
                                                                try {
                                                                    const rows = newWindow.cur_frm.doc.items || [];
                                                                    const item_codes = Array.from(new Set(
                                                                        rows.map(r => r.item_code && r.item_code.trim()).filter(Boolean)
                                                                    ));
                                                                    
                                                                    if (item_codes.length > 0) {
                                                                        const resp = await newWindow.frappe.call({
                                                                            method: 'frappe.client.get_list',
                                                                            args: {
                                                                                doctype: 'Item Price',
                                                                                filters: [
                                                                                    ['Item Price', 'item_code', 'in', item_codes],
                                                                                    ['Item Price', 'price_list', '=', 'purchase price only']
                                                                                ],
                                                                                fields: ['item_code', 'price_list_rate'],
                                                                                limit_page_length: 1000
                                                                            }
                                                                        });
                                                                        
                                                                        const prices = (resp && resp.message) || [];
                                                                        const price_map = {};
                                                                        prices.forEach(p => {
                                                                            price_map[p.item_code] = p.price_list_rate;
                                                                        });
                                                                        
                                                                        let changed = false;
                                                                        rows.forEach(row => {
                                                                            const code = row.item_code && row.item_code.trim();
                                                                            if (!code) return;
                                                                            const rate = price_map[code];
                                                                            if (rate !== null && rate !== undefined && row.purchase_price !== rate) {
                                                                                newWindow.frappe.model.set_value(row.doctype, row.name, 'purchase_price', rate);
                                                                                changed = true;
                                                                            }
                                                                        });
                                                                        
                                                                        if (changed) {
                                                                            newWindow.cur_frm.refresh_field('items');
                                                                        }
                                                                    }
                                                                } catch (err) {
                                                                    console.error('Purchase price update error:', err);
                                                                }
                                                                
                                                                newWindow.frappe.show_alert({
                                                                    message: 'تم إضافة ' + r.message.length + ' بند وتحديث الأسعار',
                                                                    indicator: 'green'
                                                                });
                                                            }, 300);
                                                        });
                                                    } else {
                                                        newWindow.frappe.show_alert({
                                                            message: 'تم إضافة ' + r.message.length + ' بند من مذكرات التسليم',
                                                            indicator: 'green'
                                                        });
                                                    }
                                                }, 500);
                                            } else {
                                                newWindow.frappe.show_alert({
                                                    message: 'لا توجد مذكرات تسليم لهذا العميل',
                                                    indicator: 'orange'
                                                });
                                            }
                                        }
                                    });
                                }, 1000);
                            }
                        } catch (e) {
                            // Cross-origin or window not ready yet
                            console.log('Error:', e);
                        }
                    }, 500);
                    
                    // Stop trying after 10 seconds
                    setTimeout(() => clearInterval(checkInterval), 10000);
                }
                
                return false;" 
                style="color:#28a745; font-weight:600; text-decoration:underline;">
                اعمل فاتوره
            </a>`;
        }

        // Handle mode columns
        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const slug_mode = makeSlug(mode);
            const party_field = `party_${slug_mode}`;
            const amount_field = `amount_${slug_mode}`;
            const confirm_field = `confirm_${slug_mode}`;
            const payment_type_field = `payment_type_${slug_mode}`;
            
            // Hide mode columns for DN rows ONLY
            if (isDnRow && [party_field, amount_field, confirm_field].includes(column.fieldname)) {
                return "";
            }
            
            // For PE rows - hide empty party/amount fields (but show the row itself)
            if (isPeRow && column.fieldname === party_field && !data[party_field]) {
                return "";
            }
            if (isPeRow && column.fieldname === amount_field && !data[amount_field]) {
                return "";
            }
            
            // For total row, show only amount fields
            if (data._is_total) {
                if (column.fieldname === party_field || column.fieldname === confirm_field) {
                    return "";
                }
                if (column.fieldname === amount_field) {
                    // Check if amount is negative
                    const numValue = parseFloat(String(data[amount_field]).replace(/,/g, ""));
                    if (numValue < 0) {
                        value = `<strong style="color:red;">${value}</strong>`;
                    } else {
                        value = `<strong>${value}</strong>`;
                    }
                }
            }
            
            // Highlight payment entry party name in red if it's a Pay type (purchase)
            if (column.fieldname === party_field && data[payment_type_field] === "Pay") {
                value = `<span style="color:red; font-weight:bold;">${value}</span>`;
            }
            
            // Highlight payment entry amount in red if negative or if it's a Pay type (purchase)
            if (column.fieldname === amount_field && !data._is_total) {
                const numValue = parseFloat(String(data[amount_field]).replace(/,/g, ""));
                if (numValue < 0 || data[payment_type_field] === "Pay") {
                    value = `<span style="color:red; font-weight:bold;">${value}</span>`;
                }
            }
        }

        if (column.fieldname === "separator" || column.fieldname === "separator2") {
            return `<div style="width:100%; height:100%; display:block;"></div>`;
        }

        if (column.fieldname === "item_name" && data.dni && data.delivery_note) {
            const url = frappe.utils.get_form_link("Delivery Note", data.delivery_note);
            // Check if qty is negative
            const qtyValue = data.qty ? parseFloat(String(data.qty).replace(/,/g, "")) : 0;
            const color = qtyValue < 0 ? "red" : "#1b8fbb";
            value = `<a href="${url}" target="_blank" style="color:${color}; font-weight:600; text-decoration:underline;">
                        ${data.item_name}
                    </a>`;
        }

        // Make customer name clickable and open in new tab
        if (column.fieldname === "customer" && data.customer) {
            const url = frappe.utils.get_form_link("Customer", data.customer);
            value = `<a href="${url}" target="_blank" style="color:#1b8fbb; font-weight:600; text-decoration:underline;">
                        ${data.customer}
                    </a>`;
        }

        // Make "Against Account" clickable to open the voucher
        // Highlight in red if debit is negative
        if (column.fieldname === "against" && data.voucher_no && data.voucher_type) {
            const url = frappe.utils.get_form_link(data.voucher_type, data.voucher_no);
            const debitValue = parseFloat(String(data.debit || "0").replace(/,/g, ""));
            const color = debitValue < 0 ? "red" : "#1b8fbb";
            value = `<a href="${url}" target="_blank" style="color:${color}; font-weight:600; text-decoration:underline;">
                        ${value}
                    </a>`;
        }

        // Highlight debit in red if negative
        if (column.fieldname === "debit") {
            const numValue = parseFloat(String(value).replace(/,/g, "").replace(/<[^>]*>/g, ""));
            if (numValue < 0) {
                value = `<span style="color:red; font-weight:bold;">${value}</span>`;
            }
        }

        // Highlight credit in red if negative
        if (column.fieldname === "credit") {
            const numValue = parseFloat(String(value).replace(/,/g, "").replace(/<[^>]*>/g, ""));
            if (numValue < 0) {
                value = `<span style="color:red; font-weight:bold;">${value}</span>`;
            }
        }

        // Highlight balance in red if negative
        if (column.fieldname === "balance") {
            const numValue = parseFloat(String(value).replace(/,/g, "").replace(/<[^>]*>/g, ""));
            if (numValue < 0) {
                value = `<span style="color:red; font-weight:bold;">${value}</span>`;
            }
        }

        // For all rows with PE data, make party fields clickable to Payment Entry
        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const slug_mode = makeSlug(mode);
            const party_field = `party_${slug_mode}`;
            const voucher_field = `voucher_no_${slug_mode}`;
            const payment_type_field = `payment_type_${slug_mode}`;
            
            if (column.fieldname === party_field && data[voucher_field] && data[party_field]) {
                const url = frappe.utils.get_form_link("Payment Entry", data[voucher_field]);
                const color = data[payment_type_field] === "Pay" ? "red" : "#1b8fbb";
                value = `<a href="${url}" target="_blank" style="color:${color}; font-weight:600; text-decoration:underline;">
                            ${value}
                        </a>`;
            }
        }

        // GL manual confirm checkbox
        if (column.fieldname === "manual_confirm") {
            if (data.voucher_type === "Payment Entry" && data.voucher_no) {
                const checked = data.manual_confirm ? "checked" : "";
                value = `<input type="checkbox" ${checked}
                        data-docname="${data.voucher_no}"
                        onchange="
                            const checkbox = this;
                            const newValue = checkbox.checked ? 1 : 0;
                            window._checkbox_update_in_progress = true;
                            frappe.call({
                                method: 'frappe.client.set_value',
                                args: {
                                    doctype: 'Payment Entry',
                                    name: '${data.voucher_no}',
                                    fieldname: 'custom_تم_التأكيد_من_الخزنه',
                                    value: newValue
                                },
                                callback: (r) => {
                                    window._checkbox_update_in_progress = false;
                                    if (!r.exc) {
                                        frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                                        data.manual_confirm = newValue;
                                    } else {
                                        checkbox.checked = !checkbox.checked;
                                    }
                                }
                            })">`;
            } else {
                return "";
            }
        }

        // Payment Entry confirm checkboxes for each mode
        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const slug_mode = makeSlug(mode);
            const confirm_field = `confirm_${slug_mode}`;
            const voucher_field = `voucher_no_${slug_mode}`;
            const party_field = `party_${slug_mode}`;
            
            if (column.fieldname === confirm_field) {
                // Only render checkbox if there's actual payment entry data
                if (data[voucher_field] && data[party_field]) {
                    const checked = data[confirm_field] ? "checked" : "";
                    value = `<input type="checkbox" ${checked}
                            data-docname="${data[voucher_field]}"
                            onchange="
                                const checkbox = this;
                                const newValue = checkbox.checked ? 1 : 0;
                                window._checkbox_update_in_progress = true;
                                frappe.call({
                                    method: 'frappe.client.set_value',
                                    args: {
                                        doctype: 'Payment Entry',
                                        name: '${data[voucher_field]}',
                                        fieldname: 'custom_تم_التأكيد_من_الخزنه',
                                        value: newValue
                                    },
                                    callback: (r) => {
                                        window._checkbox_update_in_progress = false;
                                        if (!r.exc) {
                                            frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                                            data['${confirm_field}'] = newValue;
                                        } else {
                                            checkbox.checked = !checkbox.checked;
                                        }
                                    }
                                })">`;
                    return value;
                } else {
                    // Return empty string - don't show anything
                    return "";
                }
            }
        }

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
                    data-docname="${data.dni}"
                    onchange="
                        const checkbox = this;
                        const newValue = checkbox.checked ? 1 : 0;
                        frappe.call({
                            method: 'hotkeys.api.validate_item',
                            args: { dni: '${data.dni}', validated: newValue },
                            callback: (r) => {
                                if (!r.exc) {
                                    frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                                    // Update data object to prevent refresh from reverting
                                    data.custom_validated = newValue;
                                } else {
                                    checkbox.checked = !checkbox.checked;
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
