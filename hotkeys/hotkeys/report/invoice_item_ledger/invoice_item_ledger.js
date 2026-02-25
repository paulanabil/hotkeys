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
            "default": "",
            "onchange": function() {
                let party = frappe.query_report.get_filter_value('party');
                updateReportTitle(party);
            }
        }
    ],

    after_datatable_render: function(datatable) {
        // Scroll to bottom of the report table
        setTimeout(() => {
            let scrollContainer = document.querySelector(".dt-scrollable");
            if (scrollContainer) {
                scrollContainer.scrollTop = scrollContainer.scrollHeight;
            }
        }, 300);
        
        // Update report title with party name
        let party = frappe.query_report.get_filter_value('party');
        updateReportTitle(party);
        
        // Hide the index column using CSS
        hideIndexColumn();
    },
    
    onload: function(report) {
        // Set initial title if party is already selected
        let party = frappe.query_report.get_filter_value('party');
        updateReportTitle(party);
        
        // Add custom styles to hide index column
        addCustomStyles();
        
        // Add custom print button
        addCustomPrintButton(report);
        
        // Override the print functionality
        setTimeout(() => {
            setupCustomPrint(report);
        }, 500);
    }
};

function updateReportTitle(party) {
    if (party) {
        setTimeout(() => {
            let titleElement = document.querySelector('.page-title .title-text');
            if (titleElement) {
                titleElement.textContent = 'كشف حساب - ' + party;
            }
        }, 100);
    }
}

function hideIndexColumn() {
    const style = document.createElement('style');
    style.id = 'hide-index-column';
    if (!document.getElementById('hide-index-column')) {
        style.textContent = `
            /* Hide the index column in datatable */
            .dt-scrollable table thead tr th:first-child,
            .dt-scrollable table tbody tr td:first-child {
                display: none !important;
            }
            .dt-cell--col-0 {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }
}

function addCustomStyles() {
    const style = document.createElement('style');
    style.id = 'custom-report-styles';
    if (!document.getElementById('custom-report-styles')) {
        style.textContent = `
            /* Hide index column */
            .dt-scrollable table thead tr th:first-child,
            .dt-scrollable table tbody tr td:first-child {
                display: none !important;
            }
            
            /* Print styles */
            @media print {
                /* Hide index column when printing */
                .dt-scrollable table thead tr th:first-child,
                .dt-scrollable table tbody tr td:first-child {
                    display: none !important;
                }
                /* Hide date column when printing (second column after index) */
                .dt-scrollable table thead tr th:nth-child(2),
                .dt-scrollable table tbody tr td:nth-child(2) {
                    display: none !important;
                }
                .scale-controls {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function addCustomPrintButton(report) {
    // Add custom print button to the report page
    setTimeout(() => {
        // Check if button already exists
        if (document.getElementById('custom-print-btn')) {
            return;
        }
        
        // Find the report toolbar
        let toolbar = document.querySelector('.page-head-content .standard-actions');
        if (!toolbar) {
            toolbar = document.querySelector('.page-head-content');
        }
        
        if (toolbar) {
            // Create print button
            const printBtn = document.createElement('button');
            printBtn.id = 'custom-print-btn';
            printBtn.className = 'btn btn-default btn-sm';
            printBtn.innerHTML = '<svg class="icon icon-sm"><use href="#icon-printer"></use></svg> Print';
            printBtn.style.marginLeft = '8px';
            
            printBtn.onclick = function() {
                if (report && report.print_report) {
                    report.print_report();
                }
            };
            
            toolbar.appendChild(printBtn);
        }
    }, 1000);
}

function setupCustomPrint(report) {
    // Override the print_report method
    report.print_report = function() {
        const party = frappe.query_report.get_filter_value('party');
        const company = frappe.query_report.get_filter_value('company');
        const days = frappe.query_report.get_filter_value('days');
        const data = frappe.query_report.data || [];
        
        // Create print window
        const printWindow = window.open('', '_blank');
        
        // Generate HTML
        let html = `
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>كشف حساب - ${party || ''}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        @page {
            size: A4 portrait;
            margin: 1.5cm;
        }
        
        body {
            font-family: Arial, sans-serif;
            direction: rtl;
            text-align: right;
            padding: 20px;
            max-width: 21cm;
            margin: 0 auto;
            background-color: #f5f5f5;
        }
        
        .print-container {
            background-color: white;
            padding: 30px 40px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
            min-height: 29.7cm;
        }
        
        .report-header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 15px;
            border-bottom: 3px solid #333;
        }
        
        .report-title {
            font-size: 28pt;
            font-weight: bold;
            margin-bottom: 10px;
            color: #333;
        }
        
        .company-name {
            font-size: 16pt;
            color: #666;
            margin-top: 5px;
        }
        
        .report-filters {
            font-size: 11pt;
            color: #666;
            margin-top: 10px;
        }
        
        .scale-controls {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 1000;
            padding: 12px 20px;
            background: #ffffff;
            border: 2px solid #ddd;
            border-radius: 6px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        
        .scale-controls label {
            font-size: 14px;
            font-weight: bold;
            color: #333;
            margin-right: 8px;
        }
        
        .scale-controls input {
            width: 80px;
            padding: 8px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 4px;
            text-align: center;
            margin-right: 8px;
        }
        
        .scale-controls button {
            padding: 10px 20px;
            margin-left: 8px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            font-weight: bold;
        }
        
        .scale-controls button:hover {
            background-color: #45a049;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            font-size: 12pt;
        }
        
        table thead tr th {
            background-color: #ffffff;
            color: #000000;
            border: 1px solid #000;
            padding: 12px 8px;
            text-align: right;
            font-weight: bold;
            font-size: 13pt;
        }
        
        table tbody tr td {
            border: 1px solid #ddd;
            padding: 10px 8px;
            text-align: right;
        }
        
        table tbody tr:nth-child(even) {
            background-color: #f9f9f9;
        }
        
        .number-cell {
            text-align: center;
        }
        
        /* Negative numbers in bold dark red */
        .negative-number {
            color: #8B0000;
            font-weight: bold;
        }
        
        /* Entire row with negative values in dark red */
        .negative-row td {
            color: #8B0000;
            font-weight: bold;
        }
        
        .opening-balance-row {
            font-weight: bold;
            font-size: 13pt;
        }
        
        .opening-balance-row td {
            font-weight: bold;
        }
        
        .total-row {
            font-weight: bold;
            border-top: 3px solid #000 !important;
            border-bottom: 3px solid #000 !important;
        }
        
        .total-row td {
            font-weight: bold;
            border-top: 3px solid #000 !important;
            border-bottom: 3px solid #000 !important;
        }
        
        .invoice-header-row {
            font-weight: bold;
            font-style: italic;
        }
        
        .payment-row {
            font-weight: normal;
        }
        
        @media print {
            @page {
                size: A4 portrait;
                margin: 1.5cm;
            }
            
            body {
                max-width: 100%;
                background-color: white;
                padding: 0;
            }
            
            .print-container {
                box-shadow: none;
                padding: 0;
            }
            
            .scale-controls {
                display: none !important;
            }
            
            .company-name {
                display: none !important;
            }
            
            body {
                font-size: 9.6pt; /* 20% smaller: 12pt * 0.8 = 9.6pt */
            }
            
            table {
                font-size: 9.6pt; /* 20% smaller */
            }
            
            table thead tr th {
                font-size: 10.4pt; /* 20% smaller: 13pt * 0.8 = 10.4pt */
                padding: 9.6px 6.4px; /* 20% smaller padding */
            }
            
            table tbody tr td {
                padding: 8px 6.4px; /* 20% smaller padding */
            }
            
            .report-title {
                font-size: 22.4pt; /* 20% smaller: 28pt * 0.8 = 22.4pt */
            }
            
            .report-filters {
                font-size: 8.8pt; /* 20% smaller: 11pt * 0.8 = 8.8pt */
            }
            
            .opening-balance-row {
                font-size: 10.4pt; /* 20% smaller: 13pt * 0.8 = 10.4pt */
            }
            
            /* Enhanced print styles for grayscale */
            table thead tr th {
                background-color: #ffffff;
                color: #000000;
                border: 1px solid #000;
            }
            
            table tbody tr:nth-child(even) {
                background-color: transparent;
            }
            
            /* Negative numbers in bold dark red */
            .negative-number {
                color: #000000;
                font-weight: bold;
                text-decoration: underline;
            }
            
            /* Entire row with negative values in dark red - print version */
            .negative-row td {
                color: #000000;
                font-weight: bold;
                text-decoration: underline;
            }
            
            .opening-balance-row {
                background-color: transparent !important;
                font-weight: bold;
            }
            
            .opening-balance-row td {
                font-weight: bold;
            }
            
            .total-row {
                background-color: transparent !important;
                border-top: 3px solid #000 !important;
                border-bottom: 3px solid #000 !important;
            }
            
            .total-row td {
                border-top: 3px solid #000 !important;
                border-bottom: 3px solid #000 !important;
                font-weight: bold;
            }
            
            .invoice-header-row {
                background-color: transparent !important;
                font-weight: bold;
                font-style: italic;
            }
            
            .payment-row {
                background-color: transparent !important;
                font-weight: normal;
            }
            
            table {
                page-break-inside: auto;
            }
            
            tr {
                page-break-inside: avoid;
                page-break-after: auto;
            }
            
            thead {
                display: table-header-group;
            }
        }
    </style>
</head>
<body>
    <div class="scale-controls">
        <label>Scale (%): </label>
        <input id="contentScale" type="number" value="80" min="50" max="200" step="5">
        <button onclick="applyContentScale()">Apply Scale</button>
        <button onclick="window.print()" style="background-color: #2196F3;">Print</button>
    </div>
    
    <div class="print-container">
        <div class="report-header">
            <div class="report-title">كشف حساب - ${party || ''}</div>
            ${days ? '<div class="report-filters">آخر ' + days + ' يوم</div>' : ''}
        </div>
        
        <table>
            <thead>
                <tr>
                    <th style="width: 40%;">الوصف</th>
                    <th style="width: 12%;" class="number-cell">السعر</th>
                    <th style="width: 12%;" class="number-cell">العدد</th>
                    <th style="width: 15%;" class="number-cell">ا.الضرب</th>
                    <th style="width: 15%;" class="number-cell">الاجمالى</th>
                </tr>
            </thead>
            <tbody>`;
        
        // Add data rows
        data.forEach(row => {
            let rowClass = '';
            const desc = row.description || '';
            
            // Check if this row has any negative numbers
            const hasNegative = (row.rate && row.rate < 0) || 
                               (row.quantity && row.quantity < 0) || 
                               (row.amount && row.amount < 0) || 
                               (row.total && row.total < 0);
            
            if (desc === 'ما قبله') {
                rowClass = 'opening-balance-row';
            } else if (desc === 'الاجمالى') {
                rowClass = 'total-row';
            } else if (desc.includes('فاتوره')) {
                rowClass = 'invoice-header-row';
            } else if (desc.includes('تنزيل')) {
                rowClass = 'payment-row';
            }
            
            // Add negative-row class if row has negative numbers
            if (hasNegative && rowClass !== 'opening-balance-row' && rowClass !== 'total-row') {
                rowClass += ' negative-row';
            }
            
            // Helper function to format number with negative styling
            const formatNumber = (val) => {
                if (!val && val !== 0) return '';
                const formatted = val.toFixed(2);
                if (val < 0) {
                    return `<span class="negative-number">${formatted}</span>`;
                }
                return formatted;
            };
            
            // Replace Cash with كاش نقداً in description
            let displayDesc = desc.replace(/\bCash\b/g, 'كاش نقداً');
            
            html += `<tr class="${rowClass}">
                <td>${displayDesc}</td>
                <td class="number-cell">${formatNumber(row.rate)}</td>
                <td class="number-cell">${formatNumber(row.quantity)}</td>
                <td class="number-cell">${formatNumber(row.amount)}</td>
                <td class="number-cell">${formatNumber(row.total)}</td>
            </tr>`;
        });
        
        html += `
            </tbody>
        </table>
    </div>
    
    <script>
        function applyContentScale() {
            const scale = document.getElementById("contentScale").value;
            if (!scale || scale <= 0) return;
            
            const oldStyle = document.getElementById("dynamic-content-scale");
            if (oldStyle) oldStyle.remove();
            
            const style = document.createElement("style");
            style.id = "dynamic-content-scale";
            style.textContent = \`
                body, p, h1, h2, h3, h4, h5, h6, td, th, span, div {
                    font-size: calc(12pt * \${scale}/100) !important;
                }
                table {
                    font-size: calc(12pt * \${scale}/100) !important;
                }
                table thead tr th {
                    font-size: calc(13pt * \${scale}/100) !important;
                }
                .report-title {
                    font-size: calc(28pt * \${scale}/100) !important;
                }
                .company-name {
                    font-size: calc(16pt * \${scale}/100) !important;
                }
                .report-filters {
                    font-size: calc(11pt * \${scale}/100) !important;
                }
            \`;
            document.head.appendChild(style);
        }
        
        // Set default scale to 80% on load
        window.onload = function() {
            applyContentScale();
        };
    </script>
</body>
</html>`;
        
        printWindow.document.write(html);
        printWindow.document.close();
    };
}

function addScaleControlToPrint() {
    // Check if we're in print view
    const printView = document.querySelector('.print-format-container') || 
                     document.querySelector('.page-container');
    
    if (printView && !document.getElementById('scale-control-box')) {
        const scaleBox = document.createElement('div');
        scaleBox.id = 'scale-control-box';
        scaleBox.className = 'scale-controls';
        scaleBox.innerHTML = `
            <div style="margin: 10px 0; text-align: center; padding: 10px; background: #f8f9fa; border: 1px solid #ddd; border-radius: 4px;">
                <label style="font-size: 14px; font-weight: bold;">Scale (%): </label>
                <input id="contentScale" type="number" value="100" min="10" max="200"
                       style="width: 80px; padding: 6px; font-size: 14px; border: 1px solid #ccc; border-radius: 3px;">
                <button onclick="applyContentScale()" 
                        style="padding: 8px 18px; margin-left: 10px; background-color: #4CAF50; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 14px;">
                    Apply Scale
                </button>
            </div>
        `;
        
        printView.insertBefore(scaleBox, printView.firstChild);
        
        // Add the scale function to window if not exists
        if (!window.applyContentScale) {
            window.applyContentScale = function() {
                const scale = document.getElementById("contentScale").value;
                if (!scale || scale <= 0) return;
                
                const oldStyle = document.getElementById("dynamic-content-scale");
                if (oldStyle) oldStyle.remove();
                
                const style = document.createElement("style");
                style.id = "dynamic-content-scale";
                style.textContent = `
                    body, p, h1, h2, h3, h4, h5, h6, td, th, span, div {
                        font-size: calc(12pt * ${scale}/100) !important;
                    }
                    table {
                        font-size: calc(12pt * ${scale}/100) !important;
                    }
                    .page-title {
                        font-size: calc(18pt * ${scale}/100) !important;
                    }
                `;
                document.head.appendChild(style);
            };
        }
    }
}
