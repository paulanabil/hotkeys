// First, completely remove any existing 'ar-custom' locale
if (moment.locales().indexOf('ar-custom') !== -1) {
    moment.updateLocale('ar-custom', null);
}

// Configure custom Arabic locale for moment.js with complete override
moment.defineLocale('ar-custom', {
    months: 'يناير_فبراير_مارس_أبريل_مايو_يونيو_يوليو_أغسطس_سبتمبر_أكتوبر_نوفمبر_ديسمبر'.split('_'),
    monthsShort: 'يناير_فبراير_مارس_أبريل_مايو_يونيو_يوليو_أغسطس_سبتمبر_أكتوبر_نوفمبر_ديسمبر'.split('_'),
    weekdays: 'الأحد_الإثنين_الثلاثاء_الأربعاء_الخميس_الجمعة_السبت'.split('_'),
    weekdaysShort: 'أحد_إثنين_ثلاثاء_أربعاء_خميس_جمعة_سبت'.split('_'),
    weekdaysMin: 'ح_ن_ث_ر_خ_ج_س'.split('_'),
    longDateFormat: {
        LT: 'HH:mm',
        LTS: 'HH:mm:ss',
        L: 'DD/MM/YYYY',
        LL: 'D MMMM YYYY',
        LLL: 'D MMMM YYYY HH:mm',
        LLLL: 'dddd D MMMM YYYY HH:mm'
    },
    calendar: {
        sameDay: '[اليوم على الساعة] LT',
        nextDay: '[غدا على الساعة] LT',
        nextWeek: 'dddd [على الساعة] LT',
        lastDay: '[أمس على الساعة] LT',
        lastWeek: 'dddd [على الساعة] LT',
        sameElse: 'L'
    },
    relativeTime: {
        future: 'في %s',
        past: 'منذ %s',
        s: 'ثوان',
        ss: '%d ثانية',
        m: 'دقيقة',
        mm: '%d دقائق',
        h: 'ساعة',
        hh: '%d ساعات',
        d: 'يوم',
        dd: '%d أيام',
        M: 'شهر',
        MM: '%d أشهر',
        y: 'سنة',
        yy: '%d سنوات'
    },
    preparse: function (string) {
        return string;
    },
    postformat: function (string) {
        return string;
    },
    week: {
        dow: 0, // Sunday is the first day of the week
        doy: 6  // The week that contains Jan 1st is the first week of the year
    }
});

// Force set the locale to our custom Arabic locale
moment.locale('ar-custom');

console.log('Current locale:', moment.locale());
console.log('Test translation:', moment().subtract(5, 'days').fromNow());

// Function to update all timestamp elements
function updateTimestamps() {
    // Make absolutely sure we're using ar-custom
    moment.locale('ar-custom');
    
    $('.frappe-timestamp').each(function() {
        var $el = $(this);
        var timestamp = $el.attr('data-timestamp');
        if (timestamp) {
            // Recalculate the relative time using moment
            var newText = moment(timestamp).fromNow();
            console.log('Updating:', timestamp, '->', newText);
            $el.text(newText);
        }
    });
}

// Run when document is ready
$(document).ready(function() {
    // Force locale again just to be sure
    moment.locale('ar-custom');
    
    // Update timestamps on initial load
    setTimeout(updateTimestamps, 100);
    
    // Update timestamps periodically (every 60 seconds)
    setInterval(function() {
        moment.locale('ar-custom'); // Re-force locale before each update
        updateTimestamps();
    }, 60000);
    
    // Watch for DOM changes and update new timestamps
    var observer = new MutationObserver(function(mutations) {
        var shouldUpdate = false;
        mutations.forEach(function(mutation) {
            if (mutation.addedNodes.length) {
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1) { // Element node
                        if ($(node).hasClass('frappe-timestamp') || $(node).find('.frappe-timestamp').length) {
                            shouldUpdate = true;
                        }
                    }
                });
            }
        });
        if (shouldUpdate) {
            setTimeout(function() {
                moment.locale('ar-custom');
                updateTimestamps();
            }, 50);
        }
    });
    
    // Start observing the document body for changes
    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
    
    console.log('Custom Arabic timestamps initialized! Current locale:', moment.locale());
});

// Also hook into frappe's page rendering if available
if (typeof frappe !== 'undefined' && frappe.router) {
    frappe.router.on('change', function() {
        moment.locale('ar-custom');
        setTimeout(updateTimestamps, 100);
    });
}
