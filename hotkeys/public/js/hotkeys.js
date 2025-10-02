document.addEventListener('DOMContentLoaded', () => {
    frappe.ui.keys.add_shortcut({
        shortcut: 'ctrl+i',
        action: () => {
            console.log('Ctrl+I triggered at', new Date().toLocaleString());
            // Clear saved user settings to remove sticky filters
            frappe.model.user_settings.save('Sales Invoice', 'List', {});
            console.log('User settings cleared for Sales Invoice list');
            
            // Navigate to Sales Invoice list with empty filters
            frappe.set_route('List', 'Sales Invoice', {
                'filters': JSON.stringify([])
            });
            console.log('Navigated to Sales Invoice list with empty filters');
            
            // Ensure filters are cleared after page load
            setTimeout(() => {
                if (frappe.get_route()[0] === 'List' && frappe.get_route()[1] === 'Sales Invoice') {
                    let list_view = frappe.ui.form.get_open_list_view();
                    if (list_view && list_view.filter_area) {
                        console.log('ListView loaded, clearing filters');
                        list_view.filter_area.clear();
                        list_view.refresh();
                        console.log('Filters cleared, current filters:', list_view.filter_area.get());
                    } else {
                        console.log('ListView or filter_area not found after delay');
                    }
                } else {
                    console.log('Not on Sales Invoice list page after delay');
                }
            }, 1000); // 1-second delay to ensure ListView loads
        },
        description: 'Open Sales Invoice list with all filters cleared'
    });
});
