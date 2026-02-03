# hotkeys/hotkeys/page/ai_chat/ai_chat.py

"""
AI Chat Page - uses n8n Chat Trigger via iframe
No backend methods needed - chat runs entirely in browser
"""

import frappe

# No @frappe.whitelist methods needed
# The iframe communicates directly with n8n
