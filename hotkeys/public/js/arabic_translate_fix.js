// arabic_duration_fix.js - FIXED & SHORTER (v2) for ERPNext 16
// Only Arabic users + removes "منذ" + uses your exact short style (5 يوم, 2 سنه, 4 دقيقه ...)

(function() {
    $(document).ready(function() {
        // Check if user is using Arabic (works in ERPNext 16)
        const userLang = (frappe && frappe.boot && frappe.boot.user && frappe.boot.user.language) || moment.locale();
        
        if (userLang.startsWith('ar')) {
            
            // === OVERRIDE the existing Arabic locale (no new locale = more stable) ===
            moment.updateLocale('ar', {
                relativeTime: {
                    future: '%s',
                    past:   '%s',           // removes "منذ" and "في"
                    s:  'ثوان',
                    ss: '%d ثانية',
                    m:  'دقيقة',
                    mm: '%d دقيقة',         // your style: always "دقيقة"
                    h:  'ساعة',
                    hh: '%d ساعة',          // your style
                    d:  'يوم',
                    dd: '%d يوم',           // your style: "5 يوم" not "5 أيام"
                    M:  'شهر',
                    MM: '%d شهر',           // your style
                    y:  'سنة',
                    yy: '%d سنة'            // your style: "2 سنه"
                }
            });

            // Update all frappe timestamps
            function updateTimestamps() {
                $('.frappe-timestamp').each(function() {
                    const ts = $(this).attr('data-timestamp');
                    if (ts) {
                        $(this).text(moment(ts).fromNow());
                    }
                });
            }

            // Run immediately + every 60 seconds + on DOM changes
            setTimeout(updateTimestamps, 100);
            setInterval(updateTimestamps, 60000);

            const observer = new MutationObserver(() => setTimeout(updateTimestamps, 80));
            observer.observe(document.body, { childList: true, subtree: true });

            // ERPNext page/route change support
            if (frappe && frappe.router) {
                frappe.router.on('change', () => setTimeout(updateTimestamps, 120));
            }

            console.log('✅ Short Arabic timestamps activated (ERPNext 16)');
        }
    });
})();
