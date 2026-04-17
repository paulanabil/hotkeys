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
            "fieldtype": "Select",
            "options": "Customer\nSupplier",
            "default": "Customer",
            "onchange": function() {
                let partyType = frappe.query_report.get_filter_value('party_type') || 'Customer';

                // Clear party value
                frappe.query_report.set_filter_value('party', '');

                // Update the party filter's input data-target directly
                let partyFilter = frappe.query_report.get_filter('party');
                if (partyFilter) {
                    partyFilter.df.options = partyType;
                    if (partyFilter.$input) {
                        partyFilter.$input.attr('data-target', partyType);
                        partyFilter.$input.attr('placeholder', partyType);
                        // Force awesomplete to re-read the new target
                        if (partyFilter.awesomplete) {
                            partyFilter.awesomplete._list = [];
                        }
                    }
                }

                let rawInput = document.querySelector('[data-fieldname="party"] input');
                if (rawInput) {
                    rawInput.setAttribute('data-target', partyType);
                    rawInput.setAttribute('placeholder', partyType);
                    rawInput.value = '';
                }

                // Remove stale arrow
                let arrow = document.getElementById('customer-arrow-link');
                if (arrow) arrow.remove();
            }
        },
        {
            "fieldname": "party",
            "label": __("Party"),
            "fieldtype": "Link",
            "options": "Customer",
            "default": "",
            "onchange": function() {
                let party = frappe.query_report.get_filter_value('party');
                updateReportTitle(party);
                addCustomerArrowLink(party);
            }
        }
    ],

    after_datatable_render: function(datatable) {
        setTimeout(() => {
            let scrollContainer = document.querySelector(".dt-scrollable");
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }, 300);

        let party = frappe.query_report.get_filter_value('party');
        updateReportTitle(party);
        hideIndexColumn();
        addCustomPrintButton(frappe.query_report);
        addCustomerArrowLink(party);
        linkVisibleRows();
        setupScrollLinkInjection();
        stopClickRefresh();
    },

    onload: function(report) {
        let party = frappe.query_report.get_filter_value('party');
        updateReportTitle(party);
        addCustomStyles();
        addCustomPrintButton(report);

        // Patch frappe's link search so the party field queries the right doctype
        patchLinkSearch();

        setTimeout(() => {
            setupCustomPrint(report);
            addCustomerArrowLink(party);
        }, 600);
    }
};

// ─── Patch frappe link search ─────────────────────────────────────────────────

function patchLinkSearch() {
    let attempts = 0;
    let interval = setInterval(() => {
        let partyInput = document.querySelector('[data-fieldname="party"] input');
        if (!partyInput) { if (++attempts > 20) clearInterval(interval); return; }
        clearInterval(interval);

        partyInput.addEventListener('input', function() {
            let partyType = frappe.query_report.get_filter_value('party_type') || 'Customer';
            this.setAttribute('data-target', partyType);

            let f = frappe.query_report.get_filter('party');
            if (f) {
                f.df.options = partyType;
                if (f.$input) f.$input.attr('data-target', partyType);
            }
        }, true);

        partyInput.addEventListener('focus', function() {
            let partyType = frappe.query_report.get_filter_value('party_type') || 'Customer';
            this.setAttribute('data-target', partyType);
            let f = frappe.query_report.get_filter('party');
            if (f) {
                f.df.options = partyType;
                if (f.$input) f.$input.attr('data-target', partyType);
            }
        }, true);

    }, 200);
}

// ─── Customer/Supplier Arrow Link ─────────────────────────────────────────────

function addCustomerArrowLink(party) {
    let existing = document.getElementById('customer-arrow-link');
    if (existing) existing.remove();
    if (!party) return;

    let partyType = frappe.query_report.get_filter_value('party_type') || 'Customer';
    let slug = partyType.toLowerCase().replace(/ /g, '-');

    let ctrl = document.querySelector('[data-fieldname="party"] .link-field');
    if (!ctrl) return;

    let awesomplete = ctrl.querySelector('.awesomplete');
    if (!awesomplete) return;

    let btn = document.createElement('a');
    btn.id = 'customer-arrow-link';
    btn.href = `/app/${slug}/${encodeURIComponent(party)}`;
    btn.target = '_blank';
    btn.title = party;
    btn.className = 'link-btn';
    btn.style.cssText = 'padding: 0 4px; cursor: pointer; color: #8D99A6; display: inline-flex; align-items: center; text-decoration: none; vertical-align: middle; position: absolute; right: 28px; top: 50%; transform: translateY(-50%); z-index: 1;';
    btn.innerHTML = `<svg class="icon icon-sm" style="width:14px;height:14px;"><use href="#icon-arrow-right"></use></svg>`;

    ctrl.style.position = 'relative';
    awesomplete.insertAdjacentElement('afterend', btn);
}

// ─── Stop click-refresh ────────────────────────────────────────────────────────

function stopClickRefresh() {
    let scrollable = document.querySelector('.dt-scrollable');
    if (!scrollable || scrollable._clickBlocked) return;
    scrollable._clickBlocked = true;

    scrollable.addEventListener('click', function(e) {
        if (e.target.tagName === 'A' || e.target.closest('a')) return;
        e.stopPropagation();
    }, true);
}

// ─── Virtual scroll link injection ────────────────────────────────────────────

let _scrollListenerAttached = false;
let _descColIndexCache = null;

function setupScrollLinkInjection() {
    _descColIndexCache = null;

    let scrollable = document.querySelector('.dt-scrollable');
    if (!scrollable || _scrollListenerAttached) return;
    _scrollListenerAttached = true;

    let scrollTimer = null;
    scrollable.addEventListener('scroll', function() {
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(linkVisibleRows, 80);
    });
}

function linkVisibleRows() {
    let data = frappe.query_report.data || [];
    if (!data.length) return;

    let descColIndex = getDescColIndex();

    document.querySelectorAll('.dt-scrollable .dt-row').forEach(rowEl => {
        let rowIndex = parseInt(rowEl.getAttribute('data-row-index'));
        if (isNaN(rowIndex) || rowIndex >= data.length) return;

        let row = data[rowIndex];
        if (!row) return;

        let href  = buildHref(row);
        let title = buildTitle(row);
        if (!href) return;

        let descCell = rowEl.querySelector(`.dt-cell[data-col-index="${descColIndex}"]`);
        if (!descCell) return;

        let contentEl = descCell.querySelector('.dt-cell__content');
        if (!contentEl) return;
        if (contentEl.querySelector('a')) return;

        let text = contentEl.textContent.trim();
        if (!text) return;

        let a = document.createElement('a');
        a.href = href;
        a.target = '_blank';
        a.title = title;
        a.style.cssText = getLinkStyle(row);
        a.addEventListener('click', function(e) { e.stopPropagation(); });
        a.textContent = text;
        contentEl.textContent = '';
        contentEl.appendChild(a);
    });
}

function getLinkStyle(row) {
    let voucherType = row.voucher_type || '';
    let itemCode    = row.item_code    || '';
    let desc        = row.description  || '';

    let base = 'text-decoration: underline; text-underline-offset: 3px; cursor: pointer;';

    if (itemCode)                                                                   return base + ' color: #2490ef;';
    if (voucherType === 'Sales Invoice' || voucherType === 'Purchase Invoice') {
        if (desc.includes('مرتجع') || desc.includes('إشعار دائن'))                 return base + ' color: #cc0000;';
        return base + ' color: #2490ef;';
    }
    if (voucherType === 'Payment Entry')                                            return base + ' color: #28a745;';
    if (voucherType === 'Journal Entry')                                            return base + ' color: #cc0000;';
    return base + ' color: inherit;';
}

function getDescColIndex() {
    if (_descColIndexCache !== null) return _descColIndexCache;
    document.querySelectorAll('.dt-header .dt-cell').forEach(cell => {
        let content = cell.querySelector('.dt-cell__content');
        if (content && content.textContent.trim() === 'الوصف') {
            _descColIndexCache = cell.getAttribute('data-col-index');
        }
    });
    if (_descColIndexCache === null) _descColIndexCache = '2';
    return _descColIndexCache;
}

function buildHref(row) {
    let voucherNo   = row.voucher_no   || '';
    let voucherType = row.voucher_type || '';
    let itemCode    = row.item_code    || '';

    if (itemCode)                                        return `/app/item/${encodeURIComponent(itemCode)}`;
    if (voucherNo && voucherType === 'Sales Invoice')    return `/app/sales-invoice/${encodeURIComponent(voucherNo)}`;
    if (voucherNo && voucherType === 'Purchase Invoice') return `/app/purchase-invoice/${encodeURIComponent(voucherNo)}`;
    if (voucherNo && voucherType === 'Payment Entry')    return `/app/payment-entry/${encodeURIComponent(voucherNo)}`;
    if (voucherNo && voucherType === 'Journal Entry')    return `/app/journal-entry/${encodeURIComponent(voucherNo)}`;
    return null;
}

function buildTitle(row) {
    let voucherType = row.voucher_type || '';
    let itemCode    = row.item_code    || '';
    if (itemCode)                              return 'فتح صفحة الصنف';
    if (voucherType === 'Sales Invoice')       return 'فتح الفاتورة';
    if (voucherType === 'Purchase Invoice')    return 'فتح فاتورة الشراء';
    if (voucherType === 'Payment Entry')       return 'فتح قيد الدفع';
    if (voucherType === 'Journal Entry')       return 'فتح قيد اليومية';
    return '';
}

// ─── Unchanged helpers ─────────────────────────────────────────────────────────

function updateReportTitle(party) {
    if (party) {
        setTimeout(() => {
            let titleElement = document.querySelector('.page-title .title-text');
            if (titleElement) {
                titleElement.textContent = 'كشف حساب م/ ' + party;
            }
        }, 100);
    }
}

function hideIndexColumn() {
    if (!document.getElementById('hide-index-column')) {
        const style = document.createElement('style');
        style.id = 'hide-index-column';
        style.textContent = `
            .dt-scrollable table thead tr th:first-child,
            .dt-scrollable table tbody tr td:first-child { display: none !important; }
            .dt-cell--col-0 { display: none !important; }
        `;
        document.head.appendChild(style);
    }
}

function addCustomStyles() {
    if (!document.getElementById('custom-report-styles')) {
        const style = document.createElement('style');
        style.id = 'custom-report-styles';
        style.textContent = `
            .dt-scrollable table thead tr th:first-child,
            .dt-scrollable table tbody tr td:first-child { display: none !important; }
            @media print {
                .dt-scrollable table thead tr th:first-child,
                .dt-scrollable table tbody tr td:first-child { display: none !important; }
                .dt-scrollable table thead tr th:nth-child(2),
                .dt-scrollable table tbody tr td:nth-child(2) { display: none !important; }
                .scale-controls { display: none !important; }
            }
        `;
        document.head.appendChild(style);
    }
}

function addCustomPrintButton(report) {
    if (document.getElementById('custom-print-btn')) return;

    function insertBtn() {
        if (document.getElementById('custom-print-btn')) return true;
        let toolbar = document.querySelector('.page-head .standard-actions')
                    || document.querySelector('.page-head-content .standard-actions')
                    || document.querySelector('.standard-actions');
        if (!toolbar) return false;

        const printBtn = document.createElement('button');
        printBtn.id = 'custom-print-btn';
        printBtn.className = 'btn btn-default btn-sm';
        printBtn.innerHTML = '<svg class="icon icon-sm"><use href="#icon-printer"></use></svg> Print';
        printBtn.style.marginLeft = '8px';
        printBtn.onclick = function() {
            setupCustomPrint(frappe.query_report);
            frappe.query_report.print_report();
        };
        toolbar.prepend(printBtn);
        return true;
    }

    if (insertBtn()) return;
    const observer = new MutationObserver(() => { if (insertBtn()) observer.disconnect(); });
    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 10000);
}

function setupCustomPrint(report) {
    report.print_report = function() {
        const party = frappe.query_report.get_filter_value('party');
        const days  = frappe.query_report.get_filter_value('days');
        const data  = frappe.query_report.data || [];

        const printWindow = window.open('', '_blank');

        let html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>كشف حساب م/ ${party || ''}</title>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        @page { size: A4 portrait; margin: 1.5cm; }
        body { font-family: Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; max-width: 21cm; margin: 0 auto; background-color: #f5f5f5; }
        .print-container { background-color: white; padding: 30px 40px; box-shadow: 0 0 10px rgba(0,0,0,0.1); min-height: 29.7cm; }
        .report-header { text-align: center; margin-bottom: 30px; padding-bottom: 15px; border-bottom: 3px solid #333; }
        .report-title { font-size: 28pt; font-weight: bold; margin-bottom: 10px; color: #333; }
        .report-filters { font-size: 11pt; color: #666; margin-top: 10px; }
        .scale-controls { margin-top: 30px; padding: 14px 20px; background: #fff; border: 2px solid #ddd; border-radius: 6px; text-align: center; }
        .scale-controls label { font-size: 14px; font-weight: bold; color: #333; margin-right: 8px; }
        .scale-controls input { width: 80px; padding: 8px; font-size: 14px; border: 1px solid #ccc; border-radius: 4px; text-align: center; margin-right: 8px; }
        .scale-controls button { padding: 10px 20px; margin-left: 8px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12pt; }
        table thead tr th { background-color: #fff; color: #000; border: 1px solid #000; padding: 12px 8px; text-align: right; font-weight: bold; font-size: 13pt; }
        table tbody tr td { border: 1px solid #ddd; padding: 10px 8px; text-align: right; }
        table tbody tr:nth-child(even) { background-color: #f9f9f9; }
        .number-cell { text-align: center; }
        .negative-number { color: #8B0000; font-weight: bold; }
        .negative-row td { color: #8B0000; font-weight: bold; }
        .discount-row td { color: #cc0000; font-weight: bold; }
        .credit-note-row td { color: #cc0000; font-weight: bold; font-style: italic; }
        .opening-balance-row td { font-weight: bold; font-size: 13pt; }
        .total-row td { font-weight: bold; border-top: 3px solid #000 !important; border-bottom: 3px solid #000 !important; }
        .invoice-header-row { font-weight: bold; font-style: italic; }
        .payment-row { font-weight: normal; }
        @media print {
            @page { size: A4 portrait; margin: 1.5cm; }
            body { max-width: 100%; background-color: white; padding: 0; font-size: 9.6pt; }
            .print-container { box-shadow: none; padding: 0; }
            .scale-controls { display: none !important; }
            table { font-size: 9.6pt; }
            table thead tr th { font-size: 10.4pt; padding: 9.6px 6.4px; }
            table tbody tr td { padding: 8px 6.4px; }
            table tbody tr:nth-child(even) { background-color: transparent; }
            .report-title { font-size: 22.4pt; }
            .report-filters { font-size: 8.8pt; }
            .negative-number { color: #000; font-weight: bold; text-decoration: underline; }
            .negative-row td { color: #000; font-weight: bold; text-decoration: underline; }
            .discount-row td { color: #000; font-weight: bold; text-decoration: underline; }
            .opening-balance-row td { font-weight: bold; }
            .total-row td { border-top: 3px solid #000 !important; border-bottom: 3px solid #000 !important; font-weight: bold; }
            .invoice-header-row { font-weight: bold; font-style: italic; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
            thead { display: table-header-group; }
        }
    </style>
</head>
<body>
    <div class="print-container">
        <div class="report-header">
            <div class="report-title">كشف حساب م/ ${party || ''}</div>
            ${days ? '<div class="report-filters">آخر ' + days + ' يوم</div>' : ''}
        </div>
        <table>
            <thead>
                <tr>
                    <th style="width:40%;">الوصف</th>
                    <th style="width:12%;" class="number-cell">السعر</th>
                    <th style="width:12%;" class="number-cell">العدد</th>
                    <th style="width:15%;" class="number-cell">ا.الضرب</th>
                    <th style="width:15%;" class="number-cell">الاجمالى</th>
                </tr>
            </thead>
            <tbody>`;

        data.forEach(row => {
            let rowClass = '';
            const desc = (row.description || '').trim();
            const hasNegative = (row.rate && row.rate < 0) || (row.quantity && row.quantity < 0) ||
                                (row.amount && row.amount < 0) || (row.total && row.total < 0);
            const isDiscount = desc === 'خصم' || desc.includes('خصم');

            if (desc === 'ما قبله')                                          rowClass = 'opening-balance-row';
            else if (desc === 'الاجمالى')                                    rowClass = 'total-row';
            else if (desc.includes('مرتجع') || desc.includes('إشعار دائن')) rowClass = 'credit-note-row';
            else if (desc.includes('فاتوره') || desc.includes('فاتورة'))    rowClass = 'invoice-header-row';
            else if (desc.includes('تنزيل'))                                 rowClass = 'payment-row';
            else if (isDiscount)                                             rowClass = 'discount-row';

            if (hasNegative && !['opening-balance-row','total-row','discount-row'].includes(rowClass)) {
                rowClass += ' negative-row';
            }

            const fmt = (val) => {
                if (val == null || val === '') return '';
                const f = Number(val).toFixed(2);
                return val < 0 ? `<span class="negative-number">${f}</span>` : f;
            };

            let displayDesc = desc.replace(/\bCash\b/g, 'كاش نقداً');

            html += `<tr class="${rowClass}">
                <td>${displayDesc}</td>
                <td class="number-cell">${fmt(row.rate)}</td>
                <td class="number-cell">${fmt(row.quantity)}</td>
                <td class="number-cell">${fmt(row.amount)}</td>
                <td class="number-cell">${fmt(row.total)}</td>
            </tr>`;
        });

        html += `</tbody></table></div>
    <div class="scale-controls">
        <label>Scale (%): </label>
        <input id="contentScale" type="number" value="100" min="50" max="200" step="5">
        <button onclick="applyContentScale()">Apply Scale</button>
        <button onclick="window.print()" style="background-color:#2196F3;">Print</button>
    </div>
    <script>
        function applyContentScale() {
            const scale = document.getElementById("contentScale").value;
            if (!scale || scale <= 0) return;
            const old = document.getElementById("dcs"); if (old) old.remove();
            const s = document.createElement("style"); s.id = "dcs";
            s.textContent = \`body,td,th,span,div{font-size:calc(12pt*\${scale}/100) !important;}
            .report-title{font-size:calc(28pt*\${scale}/100) !important;}
            .report-filters{font-size:calc(11pt*\${scale}/100) !important;}\`;
            document.head.appendChild(s);
        }
        window.onload = function() { applyContentScale(); };
    <\/script>
</body></html>`;

        printWindow.document.write(html);
        printWindow.document.close();
    };
}
