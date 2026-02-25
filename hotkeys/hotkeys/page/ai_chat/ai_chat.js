// ai_chat.js - Standalone AI Chat for ERPNext using n8n webhook
// Paula Nabil - January 2026 - HTTPS via nginx proxy
// Supports text chat + voice recording for Delivery Note generation

frappe.pages['ai-chat'].on_page_load = function(wrapper) {
    const page = frappe.ui.make_app_page({
        parent: wrapper,
        title: 'AI Assistant',
        single_column: true
    });

    $(page.body).html(`
        <style>
            @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@300;400;500&display=swap');

            * { box-sizing: border-box; }

            .ai-chat-container {
                height: calc(100vh - 100px);
                background: #0d0d0d;
                position: relative;
                overflow: hidden;
                color: #e8e8e8;
                font-family: 'IBM Plex Sans', sans-serif;
                display: flex;
                flex-direction: column;
            }

            /* Header bar */
            .chat-header {
                background: #111;
                border-bottom: 1px solid #2a2a2a;
                padding: 12px 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                flex-shrink: 0;
            }
            .chat-header .dot {
                width: 8px; height: 8px;
                border-radius: 50%;
                background: #00ff88;
                box-shadow: 0 0 6px #00ff88;
                animation: pulse 2s infinite;
            }
            @keyframes pulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.4; }
            }
            .chat-header span {
                font-family: 'IBM Plex Mono', monospace;
                font-size: 12px;
                color: #888;
                letter-spacing: 0.1em;
                text-transform: uppercase;
            }
            .chat-header .mode-badge {
                margin-left: auto;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 10px;
                padding: 3px 8px;
                border-radius: 3px;
                background: #1a1a1a;
                border: 1px solid #333;
                color: #666;
            }

            /* Messages area */
            .messages-container {
                flex: 1;
                padding: 20px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                scrollbar-width: thin;
                scrollbar-color: #2a2a2a transparent;
            }
            .messages-container::-webkit-scrollbar { width: 4px; }
            .messages-container::-webkit-scrollbar-track { background: transparent; }
            .messages-container::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 2px; }

            .message {
                max-width: 78%;
                padding: 10px 14px;
                border-radius: 4px;
                font-size: 14px;
                line-height: 1.6;
                word-wrap: break-word;
            }
            .message.user {
                background: #1a2a1a;
                border: 1px solid #2a4a2a;
                align-self: flex-end;
                color: #b8ffb8;
            }
            .message.user.voice-msg {
                border-color: #00ff88;
                background: #0d1f0d;
            }
            .message.user.voice-msg::before {
                content: '🎤 ';
                font-size: 12px;
            }
            .message.bot {
                background: #1a1a1a;
                border: 1px solid #2a2a2a;
                align-self: flex-start;
                color: #e0e0e0;
            }
            .message.bot pre {
                background: #0d0d0d;
                border: 1px solid #333;
                padding: 8px 10px;
                border-radius: 3px;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 12px;
                overflow-x: auto;
                margin: 6px 0 0;
                white-space: pre-wrap;
            }
            .typing-indicator {
                display: flex;
                gap: 4px;
                padding: 12px 14px;
                background: #1a1a1a;
                border: 1px solid #2a2a2a;
                border-radius: 4px;
                align-self: flex-start;
                width: fit-content;
            }
            .typing-indicator span {
                width: 6px; height: 6px;
                background: #555;
                border-radius: 50%;
                animation: bounce 1.2s infinite;
            }
            .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
            .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
            @keyframes bounce {
                0%, 60%, 100% { transform: translateY(0); background: #555; }
                30% { transform: translateY(-5px); background: #00ff88; }
            }

            /* Input area */
            .input-area {
                padding: 12px 16px;
                background: #111;
                border-top: 1px solid #2a2a2a;
                display: flex;
                gap: 8px;
                align-items: flex-end;
                flex-shrink: 0;
            }
            .input-field {
                flex: 1;
                padding: 10px 12px;
                border-radius: 4px;
                border: 1px solid #2a2a2a;
                background: #1a1a1a;
                color: #e8e8e8;
                font-family: 'IBM Plex Sans', sans-serif;
                font-size: 14px;
                resize: none;
                min-height: 42px;
                max-height: 120px;
                outline: none;
                transition: border-color 0.2s;
            }
            .input-field:focus { border-color: #444; }
            .input-field::placeholder { color: #444; }

            /* Buttons */
            .btn-icon {
                width: 42px; height: 42px;
                border: 1px solid #2a2a2a;
                border-radius: 4px;
                background: #1a1a1a;
                color: #888;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                transition: all 0.15s;
                flex-shrink: 0;
            }
            .btn-icon:hover { border-color: #444; color: #ccc; background: #222; }
            .btn-icon:disabled { opacity: 0.3; cursor: not-allowed; }

            .send-btn {
                padding: 0 16px;
                height: 42px;
                border: 1px solid #2a4a2a;
                border-radius: 4px;
                background: #1a2a1a;
                color: #00ff88;
                cursor: pointer;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 12px;
                letter-spacing: 0.05em;
                transition: all 0.15s;
                flex-shrink: 0;
            }
            .send-btn:hover { background: #223a22; border-color: #00ff88; }
            .send-btn:disabled { opacity: 0.3; cursor: not-allowed; }

            /* Voice recording button */
            .voice-btn {
                position: relative;
                overflow: visible;
            }
            .voice-btn.recording {
                border-color: #ff3344 !important;
                background: #2a1010 !important;
                color: #ff3344 !important;
                animation: recordPulse 1s infinite;
            }
            @keyframes recordPulse {
                0%, 100% { box-shadow: 0 0 0 0 rgba(255,51,68,0); }
                50% { box-shadow: 0 0 0 6px rgba(255,51,68,0.15); }
            }
            .voice-btn .rec-time {
                position: absolute;
                top: -22px;
                left: 50%;
                transform: translateX(-50%);
                background: #ff3344;
                color: white;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 10px;
                padding: 2px 6px;
                border-radius: 2px;
                white-space: nowrap;
                display: none;
            }
            .voice-btn.recording .rec-time { display: block; }

            /* Status bar */
            .status-bar {
                padding: 4px 16px;
                background: #0d0d0d;
                border-top: 1px solid #1a1a1a;
                font-family: 'IBM Plex Mono', monospace;
                font-size: 10px;
                color: #444;
                display: flex;
                gap: 16px;
                flex-shrink: 0;
            }
            .status-bar .status-item { display: flex; align-items: center; gap: 4px; }
            .status-bar .status-dot { width: 5px; height: 5px; border-radius: 50%; }
            .status-bar .status-dot.green { background: #00ff88; }
            .status-bar .status-dot.yellow { background: #ffaa00; }
        </style>

        <div class="ai-chat-container">
            <div class="chat-header">
                <div class="dot"></div>
                <span>AI Assistant — Delivery Notes</span>
                <div class="mode-badge" id="mode-badge">TEXT</div>
            </div>

            <div class="messages-container" id="messages"></div>

            <div class="input-area">
                <textarea class="input-field" id="message-input" placeholder="Type a message, or use 🎤 to speak..." rows="1"></textarea>
                <button class="btn-icon voice-btn" id="voice-btn" title="Hold to record voice message">
                    <span class="rec-time" id="rec-time">0:00</span>
                    🎤
                </button>
                <button class="send-btn" id="send-btn">SEND</button>
            </div>

            <div class="status-bar">
                <div class="status-item">
                    <div class="status-dot green"></div>
                    <span>n8n connected</span>
                </div>
                <div class="status-item">
                    <div class="status-dot yellow"></div>
                    <span id="status-text">ready</span>
                </div>
            </div>
        </div>
    `);

    const $messages = $('#messages');
    const $input = $('#message-input');
    const $sendBtn = $('#send-btn');
    const $voiceBtn = $('#voice-btn');
    const $modeBadge = $('#mode-badge');
    const $statusText = $('#status-text');

    // ── Auto-resize textarea ──────────────────────────────────────────
    $input.on('input', function() {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 120) + 'px';
    });

    // ── Message rendering ─────────────────────────────────────────────
    function addMessage(text, isUser = false, isVoice = false) {
        const cls = isUser ? 'user' + (isVoice ? ' voice-msg' : '') : 'bot';
        // Simple markdown: wrap ```...``` in <pre>
        const html = text.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>');
        const $msg = $(`<div class="message ${cls}">${html}</div>`);
        $messages.append($msg);
        $messages.scrollTop($messages[0].scrollHeight);
        return $msg;
    }

    let $typingEl = null;
    function showTyping() {
        $typingEl = $(`
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        `);
        $messages.append($typingEl);
        $messages.scrollTop($messages[0].scrollHeight);
    }
    function removeTyping() {
        if ($typingEl) { $typingEl.remove(); $typingEl = null; }
    }

    function setStatus(text) { $statusText.text(text); }
    function setBusy(busy) {
        $sendBtn.prop('disabled', busy);
        $voiceBtn.prop('disabled', busy);
    }

    // ── Session ID (stable per user per browser session) ─────────────
    const sessionId = frappe.session.user + '_' + Date.now();

    // ── Text message send ─────────────────────────────────────────────
    async function sendTextMessage() {
        const text = $input.val().trim();
        if (!text) return;

        addMessage(text, true, false);
        $input.val('');
        $input.css('height', 'auto');
        showTyping();
        setBusy(true);
        setStatus('sending...');
        $modeBadge.text('TEXT');

        try {
            const response = await fetch('/n8n/webhook/d82a8cf7-9418-4708-99a7-74dddc2710c4/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chatInput: text, user: frappe.session.user, sessionId: sessionId })
            });

            removeTyping();
            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            const data = await response.json();
            addMessage(data.reply || data.output || 'No reply received', false);
            setStatus('ready');
        } catch (err) {
            removeTyping();
            addMessage('⚠ Error: ' + err.message, false);
            setStatus('error');
            console.error('Chat error:', err);
        } finally {
            setBusy(false);
        }
    }

    $sendBtn.on('click', sendTextMessage);
    $input.on('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage();
        }
    });

    // ── Voice recording ───────────────────────────────────────────────
    let mediaRecorder = null;
    let audioChunks = [];
    let recordingTimer = null;
    let recordingSeconds = 0;

    function formatTime(s) {
        return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    async function startRecording() {
        if (mediaRecorder) return;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioChunks = [];
            recordingSeconds = 0;

            // Pick best supported format
            const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
                ? 'audio/webm;codecs=opus'
                : MediaRecorder.isTypeSupported('audio/webm')
                    ? 'audio/webm'
                    : 'audio/ogg';

            mediaRecorder = new MediaRecorder(stream, { mimeType });

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop());
                clearInterval(recordingTimer);
                $voiceBtn.removeClass('recording');
                $modeBadge.text('TEXT');
                setStatus('processing audio...');
                setBusy(true);
                showTyping();

                const audioBlob = new Blob(audioChunks, { type: mimeType });
                await sendVoiceMessage(audioBlob, mimeType);
            };

            mediaRecorder.start(250); // collect chunks every 250ms

            // Timer
            recordingTimer = setInterval(() => {
                recordingSeconds++;
                $('#rec-time').text(formatTime(recordingSeconds));
                // Auto-stop at 2 minutes
                if (recordingSeconds >= 120) stopRecording();
            }, 1000);

            $voiceBtn.addClass('recording');
            $('#rec-time').text('0:00');
            $modeBadge.text('REC ●');
            setStatus('recording...');

        } catch (err) {
            addMessage('⚠ Microphone access denied: ' + err.message, false);
            setStatus('mic error');
        }
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
            mediaRecorder = null;
        }
    }

    // Click to toggle recording
    $voiceBtn.on('click', function() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            stopRecording();
        } else {
            startRecording();
        }
    });

    // ── Send audio to n8n ─────────────────────────────────────────────
    async function sendVoiceMessage(audioBlob, mimeType) {
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const formData = new FormData();
        formData.append('audio', audioBlob, `voice_note.${ext}`);
        formData.append('user', frappe.session.user);
        formData.append('sessionId', sessionId);
        formData.append('type', 'voice_delivery_note');

        try {
            const response = await fetch('/n8n/webhook/d82a8cf7-9418-4708-99a7-74dddc2710c4/chat', {
                method: 'POST',
                // No Content-Type header — browser sets multipart boundary automatically
                body: formData
            });

            removeTyping();

            if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

            const data = await response.json();
            const replyText = data.reply || data.output || 'No reply received';

            // Show transcription if returned
            if (data.transcription) {
                addMessage(data.transcription, true, true);
            } else {
                addMessage('[voice message]', true, true);
            }

            addMessage(replyText, false);
            setStatus('ready');

        } catch (err) {
            removeTyping();
            addMessage('⚠ Voice error: ' + err.message, false);
            setStatus('error');
            console.error('Voice error:', err);
        } finally {
            setBusy(false);
        }
    }

    // ── Initial greeting ──────────────────────────────────────────────
    addMessage(
        'Hi! I can create Delivery Notes from your voice.\n\n' +
        'Press **🎤** and say something like:\n' +
        '```\n"Customer: Ahmed Ali\nItems: 10 boxes of apples, 5 bags of rice"\n```\n' +
        'I\'ll transcribe it and create the Delivery Note in ERPNext.',
        false
    );
};
