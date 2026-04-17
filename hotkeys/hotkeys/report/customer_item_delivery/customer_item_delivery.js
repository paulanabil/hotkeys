frappe.query_reports["Customer Item Delivery"] = {
    onload: function(report) {
        this.report = report;
        window._checkbox_update_in_progress = false;
        window._checkbox_state = {};

        frappe.realtime.on("customer_item_delivery_update", function (data) {
            if (!window._checkbox_update_in_progress) {
                window._checkbox_state = {};
                report.refresh();
            }
        });

        // Patch checkboxes from cache — attach directly to the scroll container
        // scroll doesn't bubble so we can't use delegation, must attach after element exists
        window._cid_patch_checkboxes = function() {
            if (!window._checkbox_state || !Object.keys(window._checkbox_state).length) return;
            document.querySelectorAll('.dt-scrollable input[type="checkbox"][data-cachekey]').forEach(cb => {
                const key = cb.getAttribute('data-cachekey');
                if (window._checkbox_state[key] !== undefined) {
                    cb.checked = window._checkbox_state[key] === 1;
                }
            });
        };

        // Attach scroll listener once the datatable container is in the DOM
        // Use requestAnimationFrame during scroll to patch before browser paint
        const _attach_scroll = setInterval(() => {
            const scroller = document.querySelector('.dt-scrollable');
            if (scroller && !scroller._cid_scroll_attached) {
                let _raf_pending = false;
                let _scroll_end_timer = null;
                scroller.addEventListener('scroll', function() {
                    scroller.classList.add('is-scrolling');
                    clearTimeout(_scroll_end_timer);
                    if (!_raf_pending) {
                        _raf_pending = true;
                        requestAnimationFrame(() => {
                            window._cid_patch_checkboxes();
                            _raf_pending = false;
                        });
                    }
                    _scroll_end_timer = setTimeout(() => {
                        window._cid_patch_checkboxes();
                        scroller.classList.remove('is-scrolling');
                    }, 50);
                });
                scroller._cid_scroll_attached = true;
                clearInterval(_attach_scroll);
            }
        }, 300);

        // Delegated listener on document for all report checkboxes
        $(document).off('change.cid').on('change.cid', '.dt-scrollable input[type="checkbox"]', function() {
            const checkbox = this;
            const docname = checkbox.getAttribute('data-docname');
            if (!docname) return;

            const cell = checkbox.closest('[data-fieldname]');
            if (!cell) return;
            const fieldname = cell.getAttribute('data-fieldname');
            if (!fieldname || fieldname === 'registered') return;

            const isCustomValidated = fieldname === 'custom_validated';
            const isConfirm = fieldname === 'manual_confirm' || fieldname.startsWith('confirm_');
            if (!isCustomValidated && !isConfirm) return;

            const newValue = checkbox.checked ? 1 : 0;
            window._checkbox_state[fieldname + '__' + docname] = newValue;
            window._checkbox_update_in_progress = true;

            if (isCustomValidated) {
                frappe.call({
                    method: 'hotkeys.api.validate_item',
                    args: { dni: docname, validated: newValue },
                    callback: (r) => {
                        window._checkbox_update_in_progress = false;
                        if (!r.exc) {
                            frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                        } else {
                            checkbox.checked = !checkbox.checked;
                            window._checkbox_state[fieldname + '__' + docname] = checkbox.checked ? 1 : 0;
                        }
                    }
                });
            } else {
                frappe.call({
                    method: 'frappe.client.set_value',
                    args: {
                        doctype: 'Payment Entry',
                        name: docname,
                        fieldname: 'custom_تم_التأكيد_من_الخزنه',
                        value: newValue
                    },
                    callback: (r) => {
                        window._checkbox_update_in_progress = false;
                        if (!r.exc) {
                            frappe.show_alert({message: 'تم التأكيد', indicator: 'green'});
                        } else {
                            checkbox.checked = !checkbox.checked;
                            window._checkbox_state[fieldname + '__' + docname] = checkbox.checked ? 1 : 0;
                        }
                    }
                });
            }
        });

        if (!document.getElementById("customer-item-delivery-css")) {
            const style = document.createElement("style");
            style.id = "customer-item-delivery-css";
            style.innerHTML = `
                .dt-column[data-fieldname="separator"],
                .dt-column[data-fieldname="separator2"],
                .dt-column[data-fieldname="separator0"] {
                    background-color: black;
                    width: 40px !important;
                }
                .dt-cell[data-fieldname="separator"],
                .dt-cell[data-fieldname="separator2"],
                .dt-cell[data-fieldname="separator0"] {
                    background-color: black !important;
                }
                .dt-row-index { display: none !important; }
                .dt-cell--col-0 { display: none !important; }
                .print-format { font-size: 100% !important; -webkit-text-size-adjust: 100% !important; text-size-adjust: 100% !important; }
                .print-format * { font-size: 100% !important; }
                .page-break-message { position: fixed !important; bottom: 0 !important; left: 0 !important; right: 0 !important; z-index: 1000 !important; background: white !important; box-shadow: 0 -2px 10px rgba(0,0,0,0.1) !important; }
                .print-format-gutter { padding-bottom: 80px !important; }


            `;
            document.head.appendChild(style);
        }
    },

    after_datatable_render: function(datatable) {
        // After every render (including scroll), patch checkbox states from cache
        setTimeout(() => {
            if (!window._checkbox_state) return;
            document.querySelectorAll('.dt-scrollable input[type="checkbox"][data-docname]').forEach(cb => {
                const docname = cb.getAttribute('data-docname');
                const cell = cb.closest('[data-fieldname]');
                if (!cell) return;
                const fieldname = cell.getAttribute('data-fieldname');
                if (!fieldname || fieldname === 'registered') return;
                const key = fieldname + '__' + docname;
                if (window._checkbox_state[key] !== undefined) {
                    cb.checked = window._checkbox_state[key] === 1;
                }
            });
        }, 0);


        setTimeout(() => {
            const rows = document.querySelectorAll('.dt-row');
            rows.forEach((row) => {
                const cells = row.querySelectorAll('.dt-cell');
                let isDnRow = false, isGlRow = false, isTotalRow = false, hasPeData = false, hasOcData = false;

                cells.forEach(cell => {
                    const fieldname = cell.getAttribute('data-fieldname');
                    const content = cell.textContent.trim();
                    if (fieldname === 'customer' && content !== '') isDnRow = true;
                    if (fieldname === 'against' && content !== '') isGlRow = true;
                    if (fieldname === 'item_name' && content.includes('Total Balances')) isTotalRow = true;
                    if (fieldname && fieldname.startsWith('party_') && content !== '') hasPeData = true;
                    if (fieldname === 'cust_name' && content !== '') hasOcData = true;
                });

                cells.forEach(cell => {
                    const fieldname = cell.getAttribute('data-fieldname');
                    const content = cell.textContent.trim();

                    if ((isDnRow || hasOcData) && ['cust_name', 'cust_outstanding'].includes(fieldname) && content !== '') {
                        cell.style.border = '1px solid #d1d8dd';
                    } else if (isDnRow && ['registered', 'customer', 'create_invoice', 'item_name', 'qty', 'custom_validated'].includes(fieldname)) {
                        cell.style.border = '1px solid #d1d8dd';
                    } else if (isGlRow && ['against', 'debit', 'credit', 'balance', 'manual_confirm'].includes(fieldname)) {
                        cell.style.border = '1px solid #d1d8dd';
                    } else if (hasPeData && (fieldname.startsWith('party_') || fieldname.startsWith('amount_'))) {
                        if (content !== '') cell.style.border = '1px solid #d1d8dd';
                    } else if (hasPeData && fieldname.startsWith('confirm_')) {
                        if (cell.querySelector('input[type="checkbox"]')) cell.style.border = '1px solid #d1d8dd';
                    } else if (isTotalRow && ['cust_outstanding', 'item_name'].includes(fieldname) || (isTotalRow && fieldname.startsWith('amount_'))) {
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

        const makeSlug = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\w\u0600-\u06FF]+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-+|-+$/g, '');
        };

        const modes = ["بنك مصر", "بوسطه", "فودافون كاش بولا 01006131346", "فودافون كاش المحل 01020202513", "فودافون كاش بولا 01055757330", "Cash"];

        const isDnRow = !!(data.customer || (data.item_name && !data._is_total && !data._is_gl_only && !data._is_pe_row));
        const isGlRow = !!data._is_gl_only;
        const isPeRow = !!data._is_pe_row;

        // --- Outstanding customer columns ---
        if (column.fieldname === "cust_name") {
            if (data._is_total || isGlRow) return "";
            if (!data.cust_name) return "";
            const customerId = data.cust_customer_id || "";
            const url = customerId ? frappe.utils.get_form_link("Customer", customerId) : "#";
            return `<a href="${url}" target="_blank"
                style="color:#8B4513; font-weight:600; text-decoration:underline;"
            >${data.cust_name}</a>`;
        }

        if (column.fieldname === "cust_outstanding") {
            if (isGlRow) return "";
            if (data._is_total) {
                return `<strong style="color:#8B4513;">${value}</strong>`;
            }
            if (!data.cust_outstanding) return "";
            return `<span style="color:#8B4513; font-weight:600;">${value}</span>`;
        }

        // Extra OC-only rows (beyond dn+gl) — hide all non-OC columns
        const isExtraOcRow = !isDnRow && !isGlRow && !isPeRow && !data._is_total && (data.cust_name || data.cust_outstanding);
        if (isExtraOcRow) {
            if (!["cust_name", "cust_outstanding", "separator0"].includes(column.fieldname) &&
                !column.fieldname.startsWith("party_") &&
                !column.fieldname.startsWith("amount_") &&
                !column.fieldname.startsWith("confirm_")) {
                return "";
            }
        }

        if (column.fieldname === "separator0") {
            return `<div style="width:100%; height:100%; display:block;"></div>`;
        }

        // Hide DN columns for GL-only rows, pure PE rows, and total row
        if ((isGlRow || isPeRow || data._is_total) && !isDnRow) {
            if (["customer", "create_invoice", "item_name", "qty", "custom_validated", "registered"].includes(column.fieldname)) {
                return "";
            }
        }

        // Hide GL columns for DN rows and pure PE rows
        if (isDnRow || isPeRow) {
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

        // Handle the "Create Invoice" column
        if (column.fieldname === "create_invoice" && data.customer) {
            value = `<a href="#" onclick="
                event.preventDefault();
                const customer = '${data.customer.replace(/'/g, "\\'")}';
                const newWindow = window.open('/app/sales-invoice/new-sales-invoice-1', '_blank');
                if (newWindow) {
                    const checkInterval = setInterval(() => {
                        try {
                            if (newWindow.cur_frm && newWindow.cur_frm.doc && newWindow.frappe) {
                                clearInterval(checkInterval);
                                newWindow.cur_frm.set_value('customer', customer);
                                setTimeout(() => {
                                    newWindow.frappe.call({
                                        method: 'hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.get_delivery_note_items_for_customer',
                                        args: { customer: customer },
                                        callback: function(r) {
                                            if (r.message && r.message.length > 0) {
                                                newWindow.cur_frm.clear_table('items');
                                                r.message.forEach(function(dn_item) {
                                                    const row = newWindow.cur_frm.add_child('items');
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
                                                    if (dn_item.so_detail) row.so_detail = dn_item.so_detail;
                                                    if (dn_item.against_sales_order) row.against_sales_order = dn_item.against_sales_order;
                                                    if (dn_item.custom_validated) row.custom_validated = dn_item.custom_validated;
                                                });
                                                newWindow.cur_frm.refresh_field('items');
                                                newWindow.cur_frm.dirty();
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
                                                                        filters: { price_list: price_list, item_code: item.item_code },
                                                                        fieldname: ['price_list_rate']
                                                                    }
                                                                }).then(res => ({ row: item, price: res?.message?.price_list_rate || 0 }))
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
                                                                newWindow.frappe.show_alert({ message: 'لا يوجد سعر لـ: ' + missing.join(', '), indicator: 'orange' }, 5);
                                                            }
                                                            if (updated) {
                                                                newWindow.cur_frm.trigger('calculate_taxes_and_totals');
                                                                newWindow.cur_frm.dirty();
                                                            }
                                                            newWindow.frappe.dom.unfreeze();
                                                            setTimeout(async () => {
                                                                try {
                                                                    const rows = newWindow.cur_frm.doc.items || [];
                                                                    const item_codes = Array.from(new Set(rows.map(r => r.item_code && r.item_code.trim()).filter(Boolean)));
                                                                    if (item_codes.length > 0) {
                                                                        const resp = await newWindow.frappe.call({
                                                                            method: 'frappe.client.get_list',
                                                                            args: {
                                                                                doctype: 'Item Price',
                                                                                filters: [['Item Price', 'item_code', 'in', item_codes], ['Item Price', 'price_list', '=', 'purchase price only']],
                                                                                fields: ['item_code', 'price_list_rate'],
                                                                                limit_page_length: 1000
                                                                            }
                                                                        });
                                                                        const prices = (resp && resp.message) || [];
                                                                        const price_map = {};
                                                                        prices.forEach(p => { price_map[p.item_code] = p.price_list_rate; });
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
                                                                        if (changed) newWindow.cur_frm.refresh_field('items');
                                                                    }
                                                                } catch (err) {
                                                                    console.error('Purchase price update error:', err);
                                                                }
                                                                newWindow.frappe.show_alert({ message: 'تم إضافة ' + r.message.length + ' بند وتحديث الأسعار', indicator: 'green' });
                                                            }, 300);
                                                        });
                                                    } else {
                                                        newWindow.frappe.show_alert({ message: 'تم إضافة ' + r.message.length + ' بند من مذكرات التسليم', indicator: 'green' });
                                                    }
                                                }, 500);
                                            } else {
                                                newWindow.frappe.show_alert({ message: 'لا توجد مذكرات تسليم لهذا العميل', indicator: 'orange' });
                                            }
                                        }
                                    });
                                }, 1000);
                            }
                        } catch (e) {
                            console.log('Error:', e);
                        }
                    }, 500);
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

            if (isDnRow && [party_field, amount_field, confirm_field].includes(column.fieldname)) {
                if (!data[party_field] && !data[amount_field]) return "";
            }

            if (isPeRow && column.fieldname === party_field && !data[party_field]) return "";
            if (isPeRow && column.fieldname === amount_field && !data[amount_field]) return "";

            if (data._is_total) {
                if (column.fieldname === party_field || column.fieldname === confirm_field) return "";
                if (column.fieldname === amount_field) {
                    const numValue = parseFloat(String(data[amount_field]).replace(/,/g, ""));
                    value = numValue < 0 ? `<strong style="color:red;">${value}</strong>` : `<strong>${value}</strong>`;
                }
            }

            if (column.fieldname === party_field && data[payment_type_field] === "Pay") {
                value = `<span style="color:red; font-weight:bold;">${value}</span>`;
            }

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
            const qtyValue = data.qty ? parseFloat(String(data.qty).replace(/,/g, "")) : 0;
            const color = (data.is_return || qtyValue < 0) ? "red" : "#1b8fbb";
            value = `<a href="${url}" target="_blank" style="color:${color}; font-weight:600; text-decoration:underline;">${data.item_name}</a>`;
        }

        if (column.fieldname === "customer" && data.customer) {
            const url = frappe.utils.get_form_link("Customer", data.customer);
            const customerColor = data.is_return ? "red" : "#1b8fbb";
            value = `<a href="${url}" target="_blank" style="color:${customerColor}; font-weight:600; text-decoration:underline;">${data.customer}</a>`;
        }

        if (column.fieldname === "against" && data.voucher_no && data.voucher_type) {
            const url = frappe.utils.get_form_link(data.voucher_type, data.voucher_no);
            const debitValue = parseFloat(String(data.debit || "0").replace(/,/g, ""));
            const color = debitValue < 0 ? "red" : "#1b8fbb";
            value = `<a href="${url}" target="_blank" style="color:${color}; font-weight:600; text-decoration:underline;">${value}</a>`;
        }

        if (column.fieldname === "debit") {
            const numValue = parseFloat(String(value).replace(/,/g, "").replace(/<[^>]*>/g, ""));
            if (numValue < 0) value = `<span style="color:red; font-weight:bold;">${value}</span>`;
        }

        if (column.fieldname === "credit") {
            const numValue = parseFloat(String(value).replace(/,/g, "").replace(/<[^>]*>/g, ""));
            if (numValue < 0) value = `<span style="color:red; font-weight:bold;">${value}</span>`;
        }

        if (column.fieldname === "balance") {
            const numValue = parseFloat(String(value).replace(/,/g, "").replace(/<[^>]*>/g, ""));
            if (numValue < 0) value = `<span style="color:red; font-weight:bold;">${value}</span>`;
        }

        // Make party fields clickable
        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const slug_mode = makeSlug(mode);
            const party_field = `party_${slug_mode}`;
            const voucher_field = `voucher_no_${slug_mode}`;
            const payment_type_field = `payment_type_${slug_mode}`;

            if (column.fieldname === party_field && data[voucher_field] && data[party_field]) {
                const url = frappe.utils.get_form_link("Payment Entry", data[voucher_field]);
                const color = data[payment_type_field] === "Pay" ? "red" : "#1b8fbb";
                value = `<a href="${url}" target="_blank" style="color:${color}; font-weight:600; text-decoration:underline;">${value}</a>`;
            }
        }

        if (column.fieldname === "manual_confirm") {
            if (data.voucher_type === "Payment Entry" && data.voucher_no) {
                const _mc_key = 'manual_confirm__' + data.voucher_no;
                const _mc_val = (window._checkbox_state[_mc_key] !== undefined) ? window._checkbox_state[_mc_key] : data.manual_confirm;
                const checked = _mc_val ? "checked" : "";
                return `<input type="checkbox" ${checked} data-docname="${data.voucher_no}" data-cachekey="manual_confirm__${data.voucher_no}"
                    onchange="
                        const cb = this;
                        const val = cb.checked ? 1 : 0;
                        window._checkbox_state['manual_confirm__${data.voucher_no}'] = val;
                        window._checkbox_update_in_progress = true;
                        frappe.call({
                            method: 'frappe.client.set_value',
                            args: { doctype: 'Payment Entry', name: '${data.voucher_no}', fieldname: 'custom_تم_التأكيد_من_الخزنه', value: val },
                            callback: (r) => {
                                window._checkbox_update_in_progress = false;
                                if (!r.exc) { frappe.show_alert({message:'تم التأكيد',indicator:'green'}); }
                                else { cb.checked = !cb.checked; window._checkbox_state['manual_confirm__${data.voucher_no}'] = cb.checked?1:0; }
                            }
                        })">`;
            } else {
                return "";
            }
        }

        for (let i = 0; i < modes.length; i++) {
            const mode = modes[i];
            const slug_mode = makeSlug(mode);
            const confirm_field = `confirm_${slug_mode}`;
            const voucher_field = `voucher_no_${slug_mode}`;
            const party_field = `party_${slug_mode}`;

            if (column.fieldname === confirm_field) {
                if (data[voucher_field] && data[party_field]) {
                    const _cf_key = confirm_field + '__' + data[voucher_field];
                    const _cf_val = (window._checkbox_state[_cf_key] !== undefined) ? window._checkbox_state[_cf_key] : data[confirm_field];
                    const checked = _cf_val ? "checked" : "";
                    return `<input type="checkbox" ${checked} data-docname="${data[voucher_field]}" data-cachekey="${confirm_field}__${data[voucher_field]}"
                        onchange="
                            const cb = this;
                            const val = cb.checked ? 1 : 0;
                            window._checkbox_state['${confirm_field}__${data[voucher_field]}'] = val;
                            window._checkbox_update_in_progress = true;
                            frappe.call({
                                method: 'frappe.client.set_value',
                                args: { doctype: 'Payment Entry', name: '${data[voucher_field]}', fieldname: 'custom_تم_التأكيد_من_الخزنه', value: val },
                                callback: (r) => {
                                    window._checkbox_update_in_progress = false;
                                    if (!r.exc) { frappe.show_alert({message:'تم التأكيد',indicator:'green'}); }
                                    else { cb.checked = !cb.checked; window._checkbox_state['${confirm_field}__${data[voucher_field]}'] = cb.checked?1:0; }
                                }
                            })">`;
                } else {
                    return "";
                }
            }
        }

        if (column.fieldname === "qty" && data.qty && (parseFloat(data.qty.replace(/,/g, "")) < 0 || data.is_return)) {
            value = `<span style="color:red; font-weight:bold;">${value}</span>`;
        }

        if (column.fieldname === "registered") {
            const checked = data.registered ? "checked" : "";
            value = `<input type="checkbox" disabled ${checked}>`;
        }

        if (column.fieldname === "custom_validated") {
            const _cv_key = 'custom_validated__' + data.dni;
            const _cv_val = (window._checkbox_state[_cv_key] !== undefined) ? window._checkbox_state[_cv_key] : data.custom_validated;
            const checked = _cv_val ? "checked" : "";
            value = `<input type="checkbox" ${checked} data-docname="${data.dni}" data-cachekey="custom_validated__${data.dni}"
                onchange="
                    const cb = this;
                    const val = cb.checked ? 1 : 0;
                    window._checkbox_state['custom_validated__${data.dni}'] = val;
                    frappe.call({
                        method: 'hotkeys.api.validate_item',
                        args: { dni: '${data.dni}', validated: val },
                        callback: (r) => {
                            if (!r.exc) { frappe.show_alert({message:'تم التأكيد',indicator:'green'}); }
                            else { cb.checked = !cb.checked; window._checkbox_state['custom_validated__${data.dni}'] = cb.checked?1:0; }
                        }
                    })">`;
        }

        if (data._is_total && column.fieldname === "item_name") {
            value = `<strong>${value}</strong>`;
        }

        return value;
    }
};
