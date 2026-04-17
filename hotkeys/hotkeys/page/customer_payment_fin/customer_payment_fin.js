frappe.pages['customer-payment-fin'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'دفع مدفوعات العميل',
        single_column: true
    });

    const style = document.createElement('style');
    style.textContent = `
        .cps-container { max-width:600px; margin:40px auto; padding:0 20px; direction:rtl; }
        .cps-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:32px; box-shadow:0 2px 12px rgba(0,0,0,0.06); }
        .cps-title { font-size:19px; font-weight:700; color:#1a202c; margin-bottom:24px; padding-bottom:14px; border-bottom:2px solid #edf2f7; }

        .cps-balance-box {
            background:linear-gradient(135deg,#667eea,#764ba2);
            border-radius:10px; padding:22px; color:white; margin-bottom:24px;
            display:none; flex-direction:column; align-items:center; text-align:center;
        }
        .cps-balance-box.visible { display:flex; }
        .cps-balance-label { font-size:13px; opacity:0.85; margin-bottom:6px; }
        .cps-balance-amount { font-size:32px; font-weight:800; letter-spacing:-0.5px; }
        .cps-balance-currency { font-size:13px; opacity:0.7; margin-top:4px; }

        .cps-payment-section { display:none; }
        .cps-payment-section.visible { display:block; }

        .cps-field { margin-bottom:16px; }
        .cps-field label { display:block; font-size:12px; font-weight:600; color:#4a5568; margin-bottom:5px; }
        .cps-field input[type="number"], .cps-field select {
            width:100%; border:1px solid #cbd5e0; border-radius:7px; padding:9px 12px;
            font-size:14px; color:#2d3748; background:white; box-sizing:border-box;
            direction:rtl; transition:border-color 0.2s; appearance:auto;
        }
        .cps-field input:focus, .cps-field select:focus {
            outline:none; border-color:#4299e1; box-shadow:0 0 0 3px rgba(66,153,225,0.12);
        }

        .cps-result-box {
            border-radius:8px; padding:13px 16px; margin-bottom:12px;
            justify-content:space-between; align-items:center; display:none;
        }
        .cps-result-box.visible { display:flex; }
        .cps-result-box .lbl { font-size:13px; font-weight:500; }
        .cps-result-box .val { font-size:16px; font-weight:700; }
        .box-after-payment { background:#ebf8ff; border:1px solid #90cdf4; color:#1a365d; }
        .box-discount      { background:#fff5f5; border:1px solid #feb2b2; color:#742a2a; }
        .box-after-all     { background:#f0fff4; border:1px solid #9ae6b4; color:#1c4532; }

        .cps-discount-toggle {
            display:flex; align-items:center; gap:10px; padding:12px 14px;
            border:2px solid #e2e8f0; border-radius:8px; margin-bottom:16px;
            cursor:pointer; user-select:none; transition:border-color 0.2s, background 0.2s;
        }
        .cps-discount-toggle:hover { border-color:#4299e1; background:#ebf8ff; }
        .cps-discount-toggle.active { border-color:#e53e3e; background:#fff5f5; }
        .cps-discount-toggle input { width:17px; height:17px; accent-color:#e53e3e; cursor:pointer; }
        .cps-discount-toggle span { font-size:14px; font-weight:600; color:#2d3748; }

        .cps-discount-fields {
            background:#fffaf0; border:1px solid #fbd38d; border-radius:8px;
            padding:14px 16px; margin-bottom:16px; display:none;
        }
        .cps-discount-fields.visible { display:block; }

        .cps-submit-btn {
            width:100%; padding:13px; background:linear-gradient(135deg,#3182ce,#2c5282);
            color:white; border:none; border-radius:8px; font-size:15px; font-weight:700;
            cursor:pointer; margin-top:6px; transition:all 0.2s;
        }
        .cps-submit-btn:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 4px 12px rgba(49,130,206,0.35); }
        .cps-submit-btn:disabled { background:#a0aec0; cursor:not-allowed; }

        .cps-loading { display:none; text-align:center; padding:16px; color:#718096; font-size:13px; }
        .cps-loading.visible { display:block; }
        .cps-spinner {
            display:inline-block; width:18px; height:18px;
            border:2px solid #e2e8f0; border-top-color:#3182ce;
            border-radius:50%; animation:cps-spin 0.7s linear infinite; vertical-align:middle; margin-left:6px;
        }
        @keyframes cps-spin { to { transform:rotate(360deg); } }
        #cps-customer-wrapper .link-field .form-control,
        #cps-customer-wrapper input {
            text-align: left !important;
            direction: ltr !important;
        }
        #cps-customer-wrapper .link-field .form-control,
        #cps-customer-wrapper input {
            text-align: left !important;
            direction: ltr !important;
        }
        .cps-error {
            background:#fff5f5; border:1px solid #fc8181; border-radius:7px;
            padding:10px 14px; color:#742a2a; font-size:13px; margin-bottom:12px; display:none;
        }
    `;
    document.head.appendChild(style);

    $(wrapper).find('.page-content').html(`
        <div class="cps-container">
            <div class="cps-card">
                <div class="cps-title">💳 دفع مدفوعات العميل</div>

                <div class="cps-field">
                    <label>اسم العميل</label>
                    <div id="cps-customer-wrapper"></div>
                </div>

                <div class="cps-loading" id="cps-loading">
                    <span class="cps-spinner"></span> جاري تحميل بيانات العميل...
                </div>

                <div class="cps-balance-box" id="cps-balance-box">
                    <div class="cps-balance-label">إجمالي المبلغ غير المسدد</div>
                    <div class="cps-balance-amount" id="cps-balance-amount">0.00</div>
                    <div class="cps-balance-currency" id="cps-balance-currency"></div>
                </div>

                <div class="cps-payment-section" id="cps-payment-section">
                    <div class="cps-field">
                        <label>طريقة الدفع</label>
                        <select id="cps-mop"><option value="">جاري التحميل...</option></select>
                    </div>

                    <div class="cps-field">
                        <label>المبلغ المدفوع</label>
                        <input type="number" id="cps-paid" min="0" step="0.01" placeholder="0.00">
                    </div>

                    <div class="cps-result-box box-after-payment" id="box-after-payment">
                        <span class="lbl">الرصيد بعد الدفع</span>
                        <span class="val" id="val-after-payment">0.00</span>
                    </div>

                    <label class="cps-discount-toggle" id="discount-toggle">
                        <input type="checkbox" id="chk-discount">
                        <span>🏷️ اعمل خصم</span>
                    </label>

                    <div class="cps-discount-fields" id="discount-fields">
                        <div class="cps-field" style="margin-bottom:0">
                            <label>مبلغ الخصم</label>
                            <input type="number" id="cps-discount" min="0" step="0.01" placeholder="0.00">
                        </div>
                    </div>

                    <div class="cps-result-box box-discount" id="box-discount-amount">
                        <span class="lbl">مبلغ الخصم</span>
                        <span class="val" id="val-discount-amount">0.00</span>
                    </div>

                    <div class="cps-result-box box-after-all" id="box-final">
                        <span class="lbl">الرصيد المتبقي بعد الدفع</span>
                        <span class="val" id="val-final">0.00</span>
                    </div>

                    <div class="cps-field">
                        <label>معلومات إضافية (اختياري)</label>
                        <input type="text" id="cps-info" style="width:100%;border:1px solid #cbd5e0;border-radius:7px;padding:9px 12px;font-size:14px;box-sizing:border-box;direction:rtl;">
                    </div>

                    <div class="cps-error" id="cps-error"></div>
                    <button class="cps-submit-btn" id="cps-submit-btn">✅ تنفيذ الدفع</button>
                </div>
            </div>
        </div>
    `);

    let state = { customer: null, invoices: [], total: 0, currency: '' };

    // Load Mode of Payment from DB — type = General means actual payment modes
    frappe.call({
        method: 'frappe.client.get_list',
        args: { doctype: 'Mode of Payment', fields: ['name', 'type'], limit: 100, order_by: 'name asc' }
    }).then(r => {
        const sel = document.getElementById('cps-mop');
        sel.innerHTML = '';
        (r.message || []).filter(m => m.type !== 'General').forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = m.name;
            if (m.name === 'Cash') opt.selected = true;
            sel.appendChild(opt);
        });
    });

    // Customer link field
    const customer_field = frappe.ui.form.make_control({
        parent: document.getElementById('cps-customer-wrapper'),
        df: { fieldtype: 'Link', fieldname: 'customer', options: 'Customer', placeholder: 'ابحث عن عميل...' },
        render_input: true, doc: {}
    });
    customer_field.refresh();
    // Trigger on selection from dropdown (no click-away needed)
    customer_field.$input.on('awesomplete-selectcomplete change', function() {
        setTimeout(() => {
            const val = customer_field.get_value();
            if (val) load_customer(val); else reset_all();
        }, 100);
    });

    async function load_customer(customer) {
        reset_payment();
        show_loading(true);
        hide_error();

        try {
            // Fetch invoices + Payment Ledger Entry in parallel
            // Payment Ledger Entry tracks ALL settlements (PE + JE) per invoice
            const [inv_res, ple_res] = await Promise.all([
                frappe.call({
                    method: 'frappe.client.get_list',
                    args: {
                        doctype: 'Sales Invoice',
                        filters: [
                            ['customer', '=', customer],
                            ['docstatus', '=', 1],
                            ['outstanding_amount', '!=', 0]
                        ],
                        fields: ['name', 'outstanding_amount', 'currency', 'posting_date', 'is_return'],
                        limit: 500,
                        order_by: 'posting_date asc'
                    }
                }),
                // Get PLE balance via the page's own whitelisted Python method
                frappe.call({
                    method: 'erpnext.accounts.page.customer_payment_fin.utils.get_customer_outstanding',
                    args: { customer: customer }
                })
            ]);

            show_loading(false);

            // Verify customer exists even if they have no invoices
            state.customer = customer;
            state.invoices = (inv_res.message || []).filter(i => !i.is_return && flt(i.outstanding_amount) > 0);

            // Get currency: from invoices, or from customer's default currency, or fallback
            let currency = (inv_res.message && inv_res.message[0]) ? inv_res.message[0].currency || '' : '';
            if (!currency) {
                const cust_res = await frappe.call({
                    method: 'frappe.client.get_value',
                    args: { doctype: 'Customer', filters: customer, fieldname: 'default_currency' }
                });
                currency = (cust_res.message && cust_res.message.default_currency) || 'EGP';
            }
            state.currency = currency;

            // PLE balance = true outstanding including JE discounts
            const inv_sum = (inv_res.message || []).reduce((s, i) => s + flt(i.outstanding_amount), 0);
            if (ple_res.message && flt(ple_res.message.outstanding) > 0) {
                state.total = flt(ple_res.message.outstanding);
            } else {
                state.total = inv_sum;
            }

            // Always show balance and payment section — even if total is 0 (advance payment)
            document.getElementById('cps-balance-amount').textContent = fmt(state.total);
            document.getElementById('cps-balance-currency').textContent = state.currency;

            $('#cps-balance-box').addClass('visible');
            $('#cps-payment-section').addClass('visible');
            recalc();

        } catch(e) {
            show_loading(false);
            show_error('خطأ في تحميل بيانات العميل: ' + e.message);
        }
    }


    function recalc() {
        const total    = state.total;
        const paid     = flt(document.getElementById('cps-paid').value) || 0;
        const use_disc = document.getElementById('chk-discount').checked;
        const discount = use_disc ? (flt(document.getElementById('cps-discount').value) || 0) : 0;

        if (paid > 0) {
            document.getElementById('val-after-payment').textContent = fmt(Math.max(0, total - paid)) + ' ' + state.currency;
            $('#box-after-payment').addClass('visible');
        } else {
            $('#box-after-payment').removeClass('visible');
        }

        if (use_disc) {
            if (discount > 0) {
                document.getElementById('val-discount-amount').textContent = fmt(discount) + ' ' + state.currency;
                $('#box-discount-amount').addClass('visible');
            } else {
                $('#box-discount-amount').removeClass('visible');
            }
            if (paid > 0 || discount > 0) {
                document.getElementById('val-final').textContent = fmt(Math.max(0, total - paid - discount)) + ' ' + state.currency;
                $('#box-final').addClass('visible');
            } else {
                $('#box-final').removeClass('visible');
            }
        } else {
            $('#box-discount-amount, #box-final').removeClass('visible');
        }
    }

    document.getElementById('cps-paid').addEventListener('input', recalc);
    document.getElementById('cps-discount').addEventListener('input', recalc);
    document.getElementById('chk-discount').addEventListener('change', function() {
        if (this.checked) {
            $('#discount-fields').addClass('visible');
            $('#discount-toggle').addClass('active');
        } else {
            $('#discount-fields, #box-discount-amount, #box-final').removeClass('visible');
            $('#discount-toggle').removeClass('active');
            document.getElementById('cps-discount').value = '';
        }
        recalc();
    });

    document.getElementById('cps-submit-btn').addEventListener('click', async function() {
        hide_error();
        const paid     = flt(document.getElementById('cps-paid').value) || 0;
        const use_disc = document.getElementById('chk-discount').checked;
        const discount = use_disc ? (flt(document.getElementById('cps-discount').value) || 0) : 0;
        const mop      = document.getElementById('cps-mop').value || 'Cash';
        const info     = document.getElementById('cps-info').value;
        const total    = state.total;

        if (!state.customer)                        { show_error('يرجى اختيار عميل.'); return; }
        if (paid <= 0 && (!use_disc || discount <= 0)) { show_error('يرجى إدخال المبلغ المدفوع أو مبلغ الخصم.'); return; }
        if (use_disc && discount <= 0)              { show_error('يرجى إدخال مبلغ الخصم.'); return; }
        if (use_disc && total > 0 && (paid + discount) > total + 0.01) { show_error('مجموع المدفوع والخصم أكبر من إجمالي الفواتير.'); return; }
        if (!use_disc && total > 0 && paid > total + 0.01) { show_error('المبلغ المدفوع أكبر من إجمالي الفواتير.'); return; }

        this.disabled = true; this.textContent = '⏳ جاري الدفع...';
        if (use_disc && paid <= 0) await run_discount_only(discount, info);
        else if (use_disc) await run_discounted_payment(paid, discount, mop, info);
        else await run_normal_payment(paid, mop, info);
        this.disabled = false; this.textContent = '✅ تنفيذ الدفع';
    });

    // ── Build one Payment Entry with all invoices in references table ──
    async function build_single_pe(first_inv_name, all_invoices, paid_amount, mop, info, discount, discount_account, cost_center) {
        // Use first invoice to get the PE template (party, accounts, currency etc.)
        // If no invoices (advance payment), get_payment_entry won't work —
        // in that case we skip references entirely and create a simple PE
        let pe;
        if (first_inv_name) {
            const pe_resp = await frappe.call({
                method: 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
                args: { dt: 'Sales Invoice', dn: first_inv_name }
            });
            if (pe_resp.exc || !pe_resp.message) throw new Error('Failed to get payment entry template: ' + (pe_resp.exc || ''));
            pe = pe_resp.message;
        } else {
            // Advance payment — no invoices to reference
            // Just build a minimal PE; ERPNext will handle it as unallocated
            throw new Error('لا توجد فواتير لربطها بالدفعة. يرجى إنشاء دفعة مقدمة يدوياً من شاشة Payment Entry.');
        }
        pe.posting_date    = frappe.datetime.get_today();
        pe.mode_of_payment = mop;
        pe.paid_amount     = paid_amount;
        pe.received_amount = paid_amount;
        if (info) pe.custom_information = info;

        // ERPNext rule: sum(allocated_amount) must equal paid_amount + sum(deductions)
        // When using JE for discount, deductions=0, so total_to_allocate = paid_amount only
        const total_outstanding = all_invoices.reduce((s, i) => s + flt(i.outstanding_amount), 0);
        const total_to_allocate = paid_amount;
        const last_idx = all_invoices.length - 1;
        let allocated_distributed = 0;

        pe.references = all_invoices.map((inv, idx) => {
            let alloc;
            if (idx === last_idx) {
                // Last invoice absorbs rounding remainder
                alloc = Math.round((total_to_allocate - allocated_distributed) * 100) / 100;
            } else {
                alloc = Math.round((flt(inv.outstanding_amount) / total_outstanding) * total_to_allocate * 100) / 100;
                allocated_distributed += alloc;
            }
            return {
                doctype: 'Payment Entry Reference',
                reference_doctype: 'Sales Invoice',
                reference_name: inv.name,
                due_date: inv.posting_date,
                total_amount: flt(inv.outstanding_amount),
                outstanding_amount: flt(inv.outstanding_amount),
                allocated_amount: alloc
            };
        });

        // Single deduction row for the full discount
        if (discount > 0) {
            pe.deductions = [{
                doctype: 'Payment Entry Deduction',
                account: discount_account,
                cost_center: cost_center,
                amount: discount,
                description: `خصم على فواتير العميل ${pe.party}`
            }];
        } else {
            pe.deductions = [];
        }

        pe.difference_amount = 0;
        return pe;
    }

    async function run_discount_only(discount, info) {
        const discount_account = 'خصم - EMP';
        const cost_center      = 'Main - EMP';
        const today            = frappe.datetime.get_today();

        try {
            frappe.show_progress('Creating Payment', 20, 100, 'جاري تجهيز البيانات...');
            const pe_tmpl_resp = await frappe.call({
                method: 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
                args: { dt: 'Sales Invoice', dn: state.invoices[0].name }
            });
            if (pe_tmpl_resp.exc || !pe_tmpl_resp.message) throw new Error('فشل تحميل بيانات الفاتورة');
            const tmpl            = pe_tmpl_resp.message;
            const receivable_acct = tmpl.paid_from;
            const company         = tmpl.company;
            const customer        = tmpl.party;

            frappe.show_progress('Creating Payment', 50, 100, 'جاري إنشاء قيد اليومية للخصم...');
            const je_doc = {
                doctype: 'Journal Entry',
                voucher_type: 'Journal Entry',
                posting_date: today,
                company: company,
                user_remark: info || `خصم على فواتير العميل ${customer}`,
                accounts: [
                    {
                        doctype: 'Journal Entry Account',
                        account: discount_account,
                        cost_center: cost_center,
                        debit_in_account_currency: discount,
                        credit_in_account_currency: 0,
                        debit: discount,
                        credit: 0
                    },
                    {
                        doctype: 'Journal Entry Account',
                        account: receivable_acct,
                        party_type: 'Customer',
                        party: customer,
                        debit_in_account_currency: 0,
                        credit_in_account_currency: discount,
                        debit: 0,
                        credit: discount
                    }
                ]
            };

            const je_ins = await frappe.call({ method: 'frappe.client.insert', args: { doc: je_doc } });
            if (je_ins.exc || !je_ins.message) throw new Error('فشل إنشاء قيد اليومية: ' + (je_ins.exc || ''));

            frappe.show_progress('Creating Payment', 70, 100, 'جاري تأكيد قيد اليومية...');
            const je_sub = await frappe.call({ method: 'frappe.client.submit', args: { doc: je_ins.message } });
            if (je_sub.exc) throw new Error('فشل تأكيد قيد اليومية: ' + je_sub.exc);
            const je_name_only = je_sub.message.name;

            frappe.show_progress('Creating Payment', 88, 100, 'جاري ربط الخصم بالفواتير...');
            try {
                await frappe.call({
                    method: 'erpnext.accounts.page.customer_payment_fin.utils.reconcile_je_with_invoices',
                    args: {
                        company: company,
                        party: customer,
                        receivable_account: receivable_acct,
                        je_name: je_name_only,
                        je_amount: discount,
                        invoice_names: JSON.stringify(state.invoices.map(i => i.name))
                    }
                });
            } catch(rec_err) {
                console.warn('Reconciliation warning (non-fatal):', rec_err);
            }

            frappe.hide_progress();
            finish([], [], discount, je_name_only);

        } catch(e) {
            frappe.hide_progress();
            show_error('خطأ: ' + e.message);
        }
    }

    async function run_normal_payment(paid, mop, info) {
        frappe.show_progress('Creating Payment', 30, 100, 'جاري إنشاء قيد الدفع...');
        try {
            // If no outstanding invoices, create advance payment (no references)
            const first_inv = state.invoices.length > 0 ? state.invoices[0].name : null;
            const pe = await build_single_pe(
                first_inv, state.invoices,
                paid, mop, info, 0, null, null
            );
            frappe.show_progress('Creating Payment', 60, 100, 'جاري حفظ قيد الدفع...');
            const ins = await frappe.call({ method: 'frappe.client.insert', args: { doc: pe } });
            if (ins.exc || !ins.message) throw new Error(ins.exc || 'Insert failed');
            frappe.show_progress('Creating Payment', 85, 100, 'جاري تأكيد قيد الدفع...');
            const sub = await frappe.call({ method: 'frappe.client.submit', args: { doc: ins.message } });
            if (sub.exc) throw new Error(sub.exc);
            frappe.hide_progress();
            finish([sub.message.name], [], 0);
        } catch(e) {
            frappe.hide_progress();
            show_error('فشل إنشاء قيد الدفع: ' + e.message);
        }
    }

    async function run_discounted_payment(paid, discount, mop, info) {
        const discount_account   = 'خصم - EMP';
        const cost_center        = 'Main - EMP';
        const today              = frappe.datetime.get_today();

        try {
            // ── Step 1: Get PE template to learn receivable account + company ──
            frappe.show_progress('Creating Payment', 10, 100, 'جاري تجهيز البيانات...');
            const pe_tmpl_resp = await frappe.call({
                method: 'erpnext.accounts.doctype.payment_entry.payment_entry.get_payment_entry',
                args: { dt: 'Sales Invoice', dn: state.invoices[0].name }
            });
            if (pe_tmpl_resp.exc || !pe_tmpl_resp.message) throw new Error('فشل تحميل بيانات الدفع');
            const tmpl            = pe_tmpl_resp.message;
            const receivable_acct = tmpl.paid_from;   // e.g. "Debtors - EMP"
            const company         = tmpl.company;
            const customer        = tmpl.party;

            // ── Step 2: Create Journal Entry for the discount ──────────────
            // Debit:  Receivable account  (reduces what customer owes)
            // Credit: Discount account    (records the discount expense)
            frappe.show_progress('Creating Payment', 25, 100, 'جاري إنشاء قيد اليومية للخصم...');

            const je_doc = {
                doctype: 'Journal Entry',
                voucher_type: 'Journal Entry',
                posting_date: today,
                company: company,
                user_remark: info || `خصم على فواتير العميل ${customer}`,
                accounts: [
                    {
                        // Debit the discount account (discount expense)
                        doctype: 'Journal Entry Account',
                        account: discount_account,
                        cost_center: cost_center,
                        debit_in_account_currency: discount,
                        credit_in_account_currency: 0,
                        debit: discount,
                        credit: 0
                    },
                    {
                        // Credit the receivable account (reduce customer balance)
                        doctype: 'Journal Entry Account',
                        account: receivable_acct,
                        party_type: 'Customer',
                        party: customer,
                        debit_in_account_currency: 0,
                        credit_in_account_currency: discount,
                        debit: 0,
                        credit: discount
                    }
                ]
            };

            const je_ins = await frappe.call({ method: 'frappe.client.insert', args: { doc: je_doc } });
            if (je_ins.exc || !je_ins.message) throw new Error('فشل إنشاء قيد اليومية: ' + (je_ins.exc || ''));

            frappe.show_progress('Creating Payment', 45, 100, 'جاري تأكيد قيد اليومية...');
            const je_sub = await frappe.call({ method: 'frappe.client.submit', args: { doc: je_ins.message } });
            if (je_sub.exc) throw new Error('فشل تأكيد قيد اليومية: ' + je_sub.exc);
            const je_name = je_sub.message.name;

            // ── Step 3: Reconcile JE against invoices ─────────────────
            frappe.show_progress('Creating Payment', 55, 100, 'جاري ربط الخصم بالفواتير...');
            try {
                await frappe.call({
                    method: 'erpnext.accounts.page.customer_payment_fin.utils.reconcile_je_with_invoices',
                    args: {
                        company: company,
                        party: customer,
                        receivable_account: receivable_acct,
                        je_name: je_name,
                        je_amount: discount,
                        invoice_names: JSON.stringify(state.invoices.map(i => i.name))
                    }
                });
            } catch(rec_err) {
                console.warn('Reconciliation warning (non-fatal):', rec_err);
            }

            // ── Step 4: Create normal Payment Entry for the paid amount ────
            frappe.show_progress('Creating Payment', 60, 100, 'جاري إنشاء قيد الدفع...');
            const pe = await build_single_pe(
                state.invoices[0].name, state.invoices,
                paid, mop, info, 0, null, null
            );

            frappe.show_progress('Creating Payment', 78, 100, 'جاري حفظ قيد الدفع...');
            const pe_ins = await frappe.call({ method: 'frappe.client.insert', args: { doc: pe } });
            if (pe_ins.exc || !pe_ins.message) throw new Error('فشل إنشاء قيد الدفع: ' + (pe_ins.exc || ''));

            frappe.show_progress('Creating Payment', 90, 100, 'جاري تأكيد قيد الدفع...');
            const pe_sub = await frappe.call({ method: 'frappe.client.submit', args: { doc: pe_ins.message } });
            if (pe_sub.exc) throw new Error('فشل تأكيد قيد الدفع: ' + pe_sub.exc);

            frappe.hide_progress();
            finish([pe_sub.message.name], [], discount, je_name);

        } catch(e) {
            frappe.hide_progress();
            show_error('خطأ: ' + e.message);
        }
    }

    function finish(created, failed, discount, je_name) {
        let msg = '';
        if (created.length > 0) msg += `✅ قيد الدفع: ${created[0]}`;
        if (je_name) msg += (msg ? '\n' : '') + `✅ قيد اليومية (خصم): ${je_name}`;
        if (!msg) msg = 'فشل إنشاء القيود.';
        if (discount > 0) msg += `\nالخصم الإجمالي: ${fmt(discount)} ${state.currency}`;
        if (failed.length > 0) msg += `\n\nفشل في: ${failed.join(', ')}`;
        frappe.msgprint({ title: 'تم الدفع', message: msg, indicator: created.length > 0 ? 'green' : 'red' });
        document.getElementById('cps-paid').value = '';
        document.getElementById('cps-discount').value = '';
        document.getElementById('chk-discount').checked = false;
        document.getElementById('cps-info').value = '';
        $('#discount-fields, #box-discount-amount, #box-final').removeClass('visible');
        $('#discount-toggle').removeClass('active');
        load_customer(state.customer);
    }

    function show_loading(v) { v ? $('#cps-loading').addClass('visible') : $('#cps-loading').removeClass('visible'); }
    function show_error(msg) { const el = document.getElementById('cps-error'); el.textContent = msg; el.style.display = 'block'; }
    function hide_error() { document.getElementById('cps-error').style.display = 'none'; }
    function reset_payment() {
        $('#cps-balance-box, #cps-payment-section').removeClass('visible');
        $('#box-after-payment, #box-discount-amount, #box-final').removeClass('visible');
        document.getElementById('cps-paid').value = '';
        document.getElementById('cps-discount').value = '';
        document.getElementById('chk-discount').checked = false;
        document.getElementById('cps-info').value = '';
        $('#discount-fields').removeClass('visible');
        $('#discount-toggle').removeClass('active');
    }
    function reset_all() { reset_payment(); state.customer = null; state.invoices = []; state.total = 0; }
    function fmt(n) { return flt(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
};
