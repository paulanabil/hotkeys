app_name = "hotkeys"
app_title = "hotkeys"
app_publisher = "Paul"
app_description = "hotkeys"
app_email = "paul@paul.com"
app_license = "mit"

app_include_js = [
    "/assets/hotkeys/js/hotkeys.js",
    "/assets/hotkeys/js/route_workspace_pin.js?v=2",
    "/assets/hotkeys/js/arabic_translate_fix.js",
]

# 🔔 Realtime trigger when related documents are updated
doc_events = {
    "Delivery Note": {
        "on_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_update_after_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "before_update_after_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_cancel": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh"
    },
    "Payment Entry": {
        "on_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_update_after_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_cancel": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh"
    },
    "GL Entry": {
        "after_insert": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_update": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh"
    }
}

fixtures = [
    {"dt": "Custom Field", "filters": [["dt", "in", ["Sales Invoice"]]]},
    {"dt": "DocType", "filters": [["name", "in", ["Sales Invoice Purchase Item"]]]},
]
