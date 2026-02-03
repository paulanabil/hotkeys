// ai_chat.js - Standalone AI Chat for ERPNext using n8n webhook
// Paula Nabil - January 2026 - HTTPS via nginx proxy
// Webhook: https://emp111.duckdns.org/n8n/webhook/d82a8cf7-9418-4708-99a7-74dddc2710c4/chat

frappe.pages['ai-chat'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'AI Assistant',
        single_column: true
    });

    $(page.body).html(`
        <style>
            .ai-chat-container {
                height: calc(100vh - 100px);
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                position: relative;
                overflow: hidden;
                color: white;
            }
            .messages-container {
                height: calc(100% - 80px);
                padding: 20px;
                overflow-y: auto;
            }
            .message {
                margin-bottom: 15px;
                max-width: 80%;
                padding: 10px 15px;
                border-radius: 15px;
            }
            .message.user {
                background: #667eea;
                align-self: flex-end;
                margin-left: auto;
            }
            .message.bot {
                background: rgba(255,255,255,0.2);
            }
            .input-area {
                position: absolute;
                bottom: 0;
                width: 100%;
                padding: 10px;
                background: rgba(255,255,255,0.1);
                display: flex;
            }
            .input-field {
                flex: 1;
                padding: 10px;
                border-radius: 10px;
                border: none;
                background: white;
                color: black;
            }
            .send-btn {
                margin-left: 10px;
                padding: 10px 20px;
                background: #764ba2;
                border: none;
                border-radius: 10px;
                color: white;
                cursor: pointer;
            }
            .send-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
            }
            .typing {
                font-style: italic;
                opacity: 0.7;
            }
        </style>

        <div class="ai-chat-container">
            <div class="messages-container" id="messages"></div>
            <div class="input-area">
                <textarea class="input-field" id="message-input" placeholder="Type your message..."></textarea>
                <button class="send-btn" id="send-btn">Send</button>
            </div>
        </div>
    `);

    const $messages = $('#messages');
    const $input = $('#message-input');
    const $sendBtn = $('#send-btn');

    // Add message
    function addMessage(text, isUser = false) {
        const className = isUser ? 'user' : 'bot';
        $messages.append(`<div class="message ${className}">${text}</div>`);
        $messages.scrollTop($messages[0].scrollHeight);
    }

    // Show typing
    function showTyping() {
        addMessage('<span class="typing">Typing...</span>', false);
    }

    function removeTyping() {
        $messages.find('.typing').parent().remove();
    }

    // Send to n8n webhook via nginx proxy
    async function sendMessage() {
        const text = $input.val().trim();
        if (!text) return;

        addMessage(text, true);
        $input.val('');
        showTyping();
        $sendBtn.prop('disabled', true);

        try {
            // Using relative path through nginx proxy - no more mixed content issues!
            const response = await fetch('/n8n/webhook/d82a8cf7-9418-4708-99a7-74dddc2710c4/chat', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    chatInput: text,
                    user: frappe.session.user
                })
            });

            removeTyping();

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const data = await response.json();
            addMessage(data.reply || data.output || 'No reply received', false);
        } catch (err) {
            removeTyping();
            addMessage('Error: ' + err.message, false);
            console.error('Chat error:', err);
        } finally {
            $sendBtn.prop('disabled', false);
        }
    }

    $sendBtn.on('click', sendMessage);
    $input.on('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Initial message
    addMessage('Hi! How can I help?', false);
};
