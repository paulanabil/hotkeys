app_name = "hotkeys"
app_title = "hotkeys"
app_publisher = "Paul"
app_description = "hotkeys"
app_email = "paul@paul.com"
app_license = "mit"

app_include_js = [
    "/assets/hotkeys/js/hotkeys.js",
    "/assets/hotkeys/js/arabic_duration_fix.js"
]

# 🔔 Realtime trigger when related documents are updated
doc_events = {
    "Delivery Note": {
        "on_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_cancel": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_update": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "after_insert": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh"
    },
    "Payment Entry": {
        "on_submit": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh",
        "on_cancel": "hotkeys.hotkeys.report.customer_item_delivery.customer_item_delivery.trigger_refresh"
    }
}
