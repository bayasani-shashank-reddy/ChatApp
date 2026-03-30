// Main Application Logic for Dashboard

let stompClient = null;
let currentChatUser = null;
let currentGroup = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

// Global UI State
let unreadCounts = {}; // username -> count
let lastMessages = {}; // username -> message content
let cachedUsers = [];  // snapshot for re-rendering

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.isAuthenticated()) {
        window.location.href = '/login.html';
        return;
    }

    const user = Auth.getUser();
    document.getElementById('currentUserName').textContent = user.username;

    // Connect WebSocket
    connectWebSocket();

    // Event Listeners
    document.getElementById('logoutBtn').addEventListener('click', Auth.logout);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    loadUsers();
    loadStories();
});

async function loadStories() {
    try {
        const stories = await fetchApi('/stories/feed');
        const container = document.getElementById('storiesContainer');
        const addBtnHTML = `
            <div class="story-item" onclick="createStory()">
                <div class="story-avatar" style="background: rgba(255,255,255,0.1);">
                    <div class="icon"><i class="fas fa-plus"></i></div>
                </div>
                <span class="story-name">Add Story</span>
            </div>
        `;
        container.innerHTML = addBtnHTML;

        if (stories && stories.length > 0) {
            stories.forEach(s => {
                const item = document.createElement('div');
                item.className = 'story-item';
                item.onclick = () => viewStory(s);

                let previewHTML = '';
                if (s.fileType === 'image') previewHTML = `<img src="${s.fileUrl}">`;
                else if (s.fileType === 'video') previewHTML = `<div class="icon"><i class="fas fa-video"></i></div>`;
                else previewHTML = `<div class="icon"><i class="fas fa-font"></i></div>`;

                item.innerHTML = `
                    <div class="story-avatar">
                        ${previewHTML}
                    </div>
                    <span class="story-name">Story</span>
                `;
                container.appendChild(item);
            });
        }
    } catch (e) {
        console.error("Error loading stories", e);
    }
}

function createStory() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*';
    input.onchange = async (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        const formData = new FormData();
        formData.append('file', file);
        insertTempLoading("Uploading story...");

        try {
            const res = await fetch('/api/upload', { method: 'POST', body: formData });
            const data = await res.json();

            await fetchApi('/stories', 'POST', {
                fileUrl: data.url,
                fileType: data.fileType,
                content: "My Story"
            });
            removeTempLoading();
            showToast("Story posted!");
            loadStories();
        } catch (err) {
            removeTempLoading();
            showToast("Failed to post story", true);
        }
    };
    input.click();
}

function viewStory(story) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay glass-panel';
    overlay.style.zIndex = '3000';
    overlay.onclick = () => overlay.remove();

    let content = '';
    if (story.fileType === 'image') content = `<img src="${story.fileUrl}" style="max-width:90vw; max-height:80vh; border-radius:16px;">`;
    else if (story.fileType === 'video') content = `<video src="${story.fileUrl}" autoplay controls style="max-width:90vw; max-height:80vh; border-radius:16px;"></video>`;
    else content = `<h2 style="color:white;">${story.content}</h2>`;

    overlay.innerHTML = `
        <div style="position:relative; text-align:center;">
            <div style="position:absolute; top:-40px; right:0; color:white; font-size:2rem; cursor:pointer;" onclick="this.parentElement.parentElement.remove()">&times;</div>
            ${content}
        </div>
    `;
    document.body.appendChild(overlay);
}


function connectWebSocket() {
    const socket = new SockJS('/ws');
    stompClient = Stomp.over(socket);
    stompClient.debug = null; // Disable debug

    const token = Auth.getToken();
    stompClient.connect({ 'Authorization': `Bearer ${token}` }, (frame) => {
        console.log('Connected via STOMP');

        // Listen to personal messages
        stompClient.subscribe('/user/queue/messages', (msg) => {
            handleIncomingMessage(JSON.parse(msg.body));
        });

        // Listen to WebRTC Call Signals
        stompClient.subscribe('/user/queue/call', (msg) => {
            handleCallSignal(JSON.parse(msg.body));
        });

    }, (error) => {
        showToast('Connection lost. Please refresh.', true);
    });
}

async function loadUsers() {
    const listContainer = document.getElementById('chatsListContainer');
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Loading contacts...</div>';

    try {
        const users = await fetchApi('/users');
        cachedUsers = users || [];
        renderUsers();
    } catch (e) {
        console.error("Error loading users", e);
        listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--danger);">Failed to load contacts.</div>';
    }
}

function renderUsers() {
    const listContainer = document.getElementById('chatsListContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '';

    const me = (Auth.getUser() || {}).username;

    cachedUsers.forEach(u => {
        if (u.username === me) return;

        const div = document.createElement('div');
        div.className = `contact-item ${currentChatUser && currentChatUser.username === u.username ? 'active' : ''}`;

        const unreadCount = unreadCounts[u.username] || 0;
        const lastMsgData = lastMessages[u.username] || { content: 'Start a conversation', time: '' };
        const isOnline = u.online;

        div.innerHTML = `
            <div class="avatar">
                <i class="${u.avatar || 'fas fa-user-circle'}"></i>
                <span class="status-indicator ${isOnline ? 'online' : ''}"></span>
                ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
            </div>
            <div class="contact-info">
                <div class="contact-name">
                    <span>${u.username}</span>
                    <span style="font-size:0.7rem; color:var(--text-muted); font-weight:400;">${lastMsgData.time}</span>
                </div>
                <div class="last-msg">
                    ${lastMsgData.content}
                </div>
            </div>
        `;
        div.onclick = () => {
            unreadCounts[u.username] = 0; // Clear unread on click
            selectChatUser(u);
            renderUsers(); // Refresh sidebar to remove Badge
        };
        listContainer.appendChild(div);
    });
}

function selectChatUser(user) {
    currentChatUser = user;
    currentGroup = null;

    document.getElementById('activeChatInfo').style.display = 'flex';
    document.getElementById('chatActions').style.display = 'flex';
    document.getElementById('inputContainer').style.display = 'flex';

    document.getElementById('activeChatName').textContent = user.username;
    document.getElementById('activeStatus').textContent = user.online ? 'Online' : 'Offline';
    document.getElementById('activeStatus').className = `status ${user.online ? 'online' : ''}`;
    document.getElementById('activeAvatar').innerHTML = `<i class="${user.avatar || 'fas fa-user'}"></i>`;

    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    appendLog(`Chat with ${user.username}`, 'system');

    // Load full message history from backend
    const myUsername = Auth.getUser().username;
    fetchApi(`/messages/${myUsername}/${user.username}`)
        .then(messages => {
            if (messages && messages.length > 0) {
                messages.forEach(msg => renderMessageObj(msg, msg.sender === myUsername));
                container.scrollTop = container.scrollHeight;
            }
        })
        .catch(e => console.error('Failed to load messages:', e));
}


// ── Messaging ─────────────────────────────────────────────────────────────

function handleIncomingMessage(msg) {
    const sender = msg.sender || msg.senderId;
    const content = msg.content || msg.text || (msg.fileUrl ? "Sent a file" : "");
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Update last message snippet and time
    if (sender) {
        lastMessages[sender] = { content, time };
    }

    if (currentChatUser && sender === currentChatUser.username) {
        renderMessageObj(msg, false);
        const container = document.getElementById('messagesContainer');
        if (container) container.scrollTop = container.scrollHeight;
    } else {
        // Increment unread count
        if (sender) {
            unreadCounts[sender] = (unreadCounts[sender] || 0) + 1;
            showToast(`New message from ${sender}`);
            // Play notification sound if needed
        }
    }

    // Always refresh sidebar to show snippet/badge
    renderUsers();
}

function sendMessage() {
    const input = document.getElementById('messageInput');
    const content = input.value.trim();
    if (!content && !currentChatUser && !currentGroup) return;

    sendPayload({ content: content });
    input.value = '';
}

function sendPayload(payloadObj) {
    if (!stompClient) return;

    if (currentGroup) {
        const messageObj = {
            sender: Auth.getUser().username,
            group: currentGroup.id,
            ...payloadObj
        };
        stompClient.send("/app/chat.sendGroupMessage", {}, JSON.stringify(messageObj));
        // Optimistic render for sent group message
        renderMessageObj(messageObj, true);
    } else if (currentChatUser) {
        const messageObj = {
            sender: Auth.getUser().username,
            receiver: currentChatUser.username,
            ...payloadObj
        };
        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(messageObj));
        renderMessageObj(messageObj, true);
    }
}

function renderMessageObj(msg, isSent) {
    const mainContainer = document.getElementById('messagesContainer');
    const gameContainer = document.getElementById('gameChatMessages');

    // Normalise field names
    const sender = msg.sender || msg.from || 'User';
    const text = msg.content || msg.text || msg.message || '';
    const fileUrl = msg.fileUrl || msg.url || '';
    const fileType = msg.fileType || msg.type || '';
    const fileName = msg.fileName || msg.name || 'File';
    const lat = msg.latitude;
    const lng = msg.longitude;

    // Determine timestamp
    let ts = '';
    if (msg.timestamp) {
        try { ts = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) { }
    } else { ts = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }

    function createBubble(isSentSide) {
        const div = document.createElement('div');
        div.className = `message-bubble ${isSentSide ? 'sent' : 'received'}`;

        let contentHTML = '';
        if (text) {
            contentHTML += `<span>${text.replace(/</g, '&lt;')}</span>`;
        }

        if (fileUrl) {
            const ext = fileUrl.split('.').pop().toLowerCase();
            const isImage = fileType === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
            const isAudio = fileType === 'audio' || ['mp3', 'wav', 'ogg', 'm4a'].includes(ext);
            const isVideo = fileType === 'video' || ['mp4', 'webm', 'mov'].includes(ext);
            const isPdf = ext === 'pdf';
            const isDoc = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext);

            if (isImage) {
                contentHTML += `<br><img src="${fileUrl}" class="attachment" style="max-width:260px;max-height:220px;border-radius:12px;margin-top:8px;display:block;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);" onclick="window.open('${fileUrl}','_blank')">`;
            } else if (isAudio) {
                contentHTML += `<br><audio controls src="${fileUrl}" style="max-width:240px;margin-top:8px;display:block;"></audio>`;
            } else if (isVideo) {
                contentHTML += `<br><video controls src="${fileUrl}" style="max-width:260px;border-radius:12px;margin-top:8px;display:block;"></video>`;
            } else if (isPdf) {
                contentHTML += `<br><a href="${fileUrl}" target="_blank" style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;padding:10px 16px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:12px;color:#fca5a5;text-decoration:none;font-size:0.85rem;"><i class="fas fa-file-pdf" style="color:#ef4444;"></i> ${fileName}</a>`;
            } else if (isDoc) {
                // Office online preview link
                const previewUrl = `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(window.location.protocol + '//' + window.location.host + fileUrl)}`;
                contentHTML += `<br><div style="margin-top:10px;display:flex;flex-direction:column;gap:6px;">
                    <a href="${fileUrl}" download="${fileName}" style="display:inline-flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);border-radius:12px;color:#93c5fd;text-decoration:none;font-size:0.85rem;"><i class="fas fa-file-word" style="color:#3b82f6;"></i> ${fileName}</a>
                    <a href="${previewUrl}" target="_blank" style="font-size:0.75rem;color:#60a5fa;text-decoration:underline;margin-left:4px;">Open in Word/Excel Online</a>
                </div>`;
            } else {
                contentHTML += `<br><a href="${fileUrl}" download="${fileName}" style="display:inline-flex;align-items:center;gap:8px;margin-top:10px;padding:10px 16px;background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.3);border-radius:12px;color:#c4b5fd;text-decoration:none;font-size:0.85rem;"><i class="fas fa-file-download"></i> ${fileName}</a>`;
            }
        }

        // Add sender name for group chats
        const showSenderName = (currentGroup && !isSentSide);
        div.innerHTML = `
            ${showSenderName ? `<div style="font-size:0.75rem;color:#a78bfa;margin-bottom:4px;font-weight:600;">${sender}</div>` : ''}
            ${contentHTML}
            <span class="message-time">${ts}</span>
        `;
        return div;
    }

    // Append to main chat if it's the right person/group
    if (mainContainer) {
        const isTarget = currentGroup ? (msg.group === currentGroup.id) : (currentChatUser && (msg.sender === currentChatUser.username || msg.receiver === currentChatUser.username));
        // Special case: if msg just has sender but no receiver/group yet (sent message history)
        if (isTarget || (isSent && !msg.receiver && !msg.group)) {
            mainContainer.appendChild(createBubble(isSent));
            mainContainer.scrollTop = mainContainer.scrollHeight;
        }
    }

    // Append to game chat panel if visible
    if (gameContainer && document.getElementById('activeGameModal').style.display !== 'none') {
        const sideChatType = document.getElementById('gameChatTypeSelect').value;
        let shouldShowInSide = false;

        if (sideChatType === 'current') {
            shouldShowInSide = currentGroup ? (msg.group === currentGroup.id) : (currentChatUser && (msg.sender === currentChatUser.username || msg.receiver === currentChatUser.username));
        } else if (sideChatType === 'groups') {
            shouldShowInSide = !!msg.group; // show any group message in group mode
        }

        if (shouldShowInSide) {
            gameContainer.appendChild(createBubble(isSent));
            gameContainer.scrollTop = gameContainer.scrollHeight;
        }
    }
}

function appendLog(text, type) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.style.textAlign = 'center';
    div.style.color = 'var(--text-secondary)';
    div.style.fontSize = '0.8rem';
    div.style.margin = '10px 0';
    div.textContent = text;
    container.appendChild(div);
}

// ── File Uploads & Map ────────────────────────────────────────────────────

async function uploadFile(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    insertTempLoading("Uploading file...");

    try {
        const token = Auth.getToken();
        const response = await fetch('/api/upload', {
            method: 'POST',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed: ' + response.status);
        const result = await response.json();
        removeTempLoading();

        if (result.url) {
            sendPayload({
                fileUrl: result.url,
                fileName: result.fileName,
                fileType: result.fileType
            });
        } else {
            showToast('Upload error: ' + (result.error || 'Unknown'), true);
        }
    } catch (e) {
        removeTempLoading();
        console.error('Upload error:', e);
        showToast('Error uploading file: ' + e.message, true);
    }
}

function sendLocation() {
    if ("geolocation" in navigator) {
        insertTempLoading("Fetching location...");
        navigator.geolocation.getCurrentPosition((pos) => {
            removeTempLoading();
            sendPayload({
                content: "Shared a location",
                fileType: "location",
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude
            });
        }, () => {
            removeTempLoading();
            showToast("Location sharing denied", true);
        });
    } else {
        showToast("Geolocation not supported", true);
    }
}

function toggleRecording() {
    const btn = document.getElementById('recordBtn');

    if (isRecording) {
        // Stop recording
        mediaRecorder.stop();
        isRecording = false;
        btn.innerHTML = '<i class="fas fa-microphone"></i>';
        btn.style.color = '';
    } else {
        navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = e => audioChunks.push(e.data);

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                // We fake-upload it for demo (since we'd need FormData append blob)
                // In full prod, we append it to /api/upload
                const formData = new FormData();
                formData.append('file', audioBlob, 'voicenote.webm');
                insertTempLoading("Uploading voice note...");
                const res = await fetch('/api/upload', { method: 'POST', body: formData });
                const json = await res.json();
                removeTempLoading();
                sendPayload({ fileUrl: json.url, fileType: 'audio' });
            };

            mediaRecorder.start();
            isRecording = true;
            btn.innerHTML = '<i class="fas fa-stop"></i>';
            btn.style.color = '#ef4444'; // Red
        });
    }
}

function insertTempLoading(text) {
    const container = document.getElementById('messagesContainer');
    const div = document.createElement('div');
    div.id = 'tempLoading';
    div.className = 'message-bubble sent';
    div.innerHTML = `<i class="fas fa-circle-notch fa-spin"></i> ${text}`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}
function removeTempLoading() {
    const el = document.getElementById('tempLoading');
    if (el) el.remove();
}

// ── WebRTC Voice/Video Calls ─────────────────────────────────────────────

let peerConnection = null;
let localStream = null;
const ICE_SERVERS = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] };

async function startAudioCall() {
    if (!currentChatUser) { showToast('Select a user to call first', true); return; }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        await setupPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal('offer', { sdp: offer, callType: 'audio' });
        showCallUI('Audio Call');
    } catch (e) {
        showToast('Microphone access denied or error: ' + e.message, true);
        console.error('Audio call error:', e);
    }
}

async function startVideoCall() {
    if (!currentChatUser) { showToast('Select a user to call first', true); return; }
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        const localVideo = document.getElementById('localVideo');
        localVideo.srcObject = localStream;
        localVideo.style.display = 'block';
        await setupPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal('offer', { sdp: offer, callType: 'video' });
        showCallUI('Video Call');
    } catch (e) {
        showToast('Camera/mic access denied: ' + e.message, true);
    }
}

async function setupPeerConnection() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // When remote stream arrives → play it
    peerConnection.ontrack = (event) => {
        const remoteAudio = document.getElementById('remoteAudio') || createRemoteAudio();
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(() => { });
        document.getElementById('callStatusText').textContent = 'Connected 🔊';
    };

    // ICE candidates → send via WebSocket
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            sendSignal('candidate', { candidate: event.candidate });
        }
    };

    peerConnection.onconnectionstatechange = () => {
        if (['disconnected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
            endCall();
        }
    };
}

function createRemoteAudio() {
    const audio = document.createElement('audio');
    audio.id = 'remoteAudio';
    audio.autoplay = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);
    return audio;
}

function endCall() {
    if (peerConnection) { peerConnection.close(); peerConnection = null; }
    if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
    const remoteAudio = document.getElementById('remoteAudio');
    if (remoteAudio) remoteAudio.srcObject = null;
    document.getElementById('callOverlay').style.display = 'none';
    document.getElementById('answerCallBtn').style.display = 'none';
    sendSignal('leave', {});
    appendLog('Call ended', 'system');
}

function showCallUI(type) {
    document.getElementById('callOverlay').style.display = 'flex';
    document.getElementById('callTargetName').textContent = currentChatUser ? currentChatUser.username : 'User';
    document.getElementById('callStatusText').textContent = `${type} – Connecting...`;
}

function sendSignal(type, payload) {
    if (!stompClient || !currentChatUser) return;
    stompClient.send('/app/call.signal', {}, JSON.stringify({
        senderId: Auth.getUser().username,
        targetId: currentChatUser.username,
        type,
        payload
    }));
}

async function handleCallSignal(msg) {
    if (msg.type === 'offer') {
        // Show incoming call UI
        currentChatUser = { username: msg.senderId };
        showCallUI('Incoming Call');
        document.getElementById('callTargetName').textContent = msg.senderId;
        document.getElementById('callStatusText').textContent = 'Incoming call...';
        document.getElementById('answerCallBtn').style.display = 'flex';

        // Setup peer to be ready to answer
        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: !!msg.payload?.callType?.includes('video') });
        } catch (e) { console.warn('Mic denied on incoming call'); }
        await setupPeerConnection();
        await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));

    } else if (msg.type === 'answer') {
        document.getElementById('callStatusText').textContent = 'Connected 🔊';
        if (peerConnection) await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));

    } else if (msg.type === 'candidate') {
        if (peerConnection && msg.payload.candidate) {
            try { await peerConnection.addIceCandidate(new RTCIceCandidate(msg.payload.candidate)); } catch (e) { }
        }

    } else if (msg.type === 'leave') {
        endCall();
        appendLog('Call ended by remote', 'system');
    }
}

async function answerCall() {
    document.getElementById('answerCallBtn').style.display = 'none';
    document.getElementById('callStatusText').textContent = 'Connecting...';
    try {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal('answer', { sdp: answer });
    } catch (e) {
        showToast('Failed to answer call: ' + e.message, true);
    }
}

// ── UI Tabs & Status ──────────────────────────────────────────────────────

function switchMainTab(tabName) {
    // Update active button state
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

    // Hide all main areas
    document.querySelectorAll('.main-area').forEach(area => area.style.display = 'none');
    document.querySelectorAll('.list-container').forEach(list => list.style.display = 'none');

    // Show selected
    if (tabName === 'chats') {
        document.getElementById('chatsArea').style.display = 'block';
        document.getElementById('chatsListContainer').style.display = 'block';
    } else if (tabName === 'games') {
        document.getElementById('gamesArea').style.display = 'block';
        document.getElementById('chatsListContainer').style.display = 'block'; // Keep user list visible for invites
    } else if (tabName === 'groups') {
        document.getElementById('chatsArea').style.display = 'block';
        document.getElementById('groupsListContainer').style.display = 'block';
        loadGroups();
    } else if (tabName === 'calls') {
        // Calls stub (could show history)
        document.getElementById('chatsArea').style.display = 'block';
        document.getElementById('chatsListContainer').style.display = 'block';
    }
}

async function loadGroups() {
    const listContainer = document.getElementById('groupsListContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Loading groups...</div>';

    try {
        const user = Auth.getUser();
        if (!user || !user.username) {
            console.warn("No authenticated user for group loading");
            return;
        }

        const userId = user.username;
        console.log(`Fetching groups for: ${userId}`);

        // Clear list and add Create button
        listContainer.innerHTML = '';
        const createBtn = document.createElement('div');
        createBtn.className = 'contact-item active';
        createBtn.style.background = 'rgba(124, 58, 237, 0.15)';
        createBtn.innerHTML = `
            <div class="avatar" style="background:#7c3aed;"><i class="fas fa-plus"></i></div>
            <div class="contact-info">
                <div class="contact-name" style="color:#c4b5fd;">Create New Group</div>
                <div class="last-msg">Start a new group chat</div>
            </div>
        `;
        createBtn.onclick = createNewGroupPrompt;
        listContainer.appendChild(createBtn);

        const groups = await fetchApi(`/groups/user/${userId}`);
        if (groups && Array.isArray(groups) && groups.length > 0) {
            groups.forEach(g => {
                const div = document.createElement('div');
                div.className = 'group-card';
                div.innerHTML = `
                    <div class="avatar" style="width:40px; height:40px;"><i class="fas fa-users"></i></div>
                    <div style="flex:1;">
                        <div style="font-weight:600; color:white;">${g.name || 'Unnamed Group'}</div>
                        <div style="font-size:0.8rem; color:var(--text-secondary);">${(g.members || []).length} members</div>
                    </div>
                `;
                div.onclick = () => selectGroupChat(g);
                listContainer.appendChild(div);
            });
        } else {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:20px;text-align:center;color:var(--text-secondary);font-size:0.9rem;';
            empty.textContent = 'No groups yet. Create one!';
            listContainer.appendChild(empty);
        }
    } catch (e) {
        console.error("Error loading groups:", e);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'padding:20px;text-align:center;color:#fca5a5;font-size:0.9rem;background:rgba(239,68,68,0.05);border-radius:12px;margin:10px;';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle" style="margin-right:8px;"></i> Failed to load groups. <br><small style="opacity:0.7;">${e.message || 'Server error'}</small>`;
        listContainer.appendChild(errorDiv);
    }
}


function createNewGroupPrompt() {
    const name = prompt("Enter group name:");
    if (!name || !name.trim()) return;
    const myUsername = Auth.getUser().username;
    fetchApi('/groups', 'POST', {
        name: name.trim(),
        members: [myUsername],
        admins: [myUsername],
        createdBy: myUsername
    }).then(res => {
        showToast('Group "' + name.trim() + '" created!');
        loadGroups();
    }).catch(e => showToast('Failed to create group: ' + e.message, true));
}


const groupSubscriptions = {}; // groupId -> stomp subscription

function selectGroupChat(group) {
    currentChatUser = null;
    currentGroup = group;

    document.getElementById('activeChatInfo').style.display = 'flex';
    document.getElementById('chatActions').style.display = 'flex';
    document.getElementById('inputContainer').style.display = 'flex';

    document.getElementById('activeChatName').textContent = group.name;
    document.getElementById('activeStatus').textContent = `${(group.members || []).length} members`;
    document.getElementById('activeStatus').className = `status`;
    document.getElementById('activeAvatar').innerHTML = `<i class="fas fa-users"></i>`;

    const container = document.getElementById('messagesContainer');
    container.innerHTML = '';
    appendLog(`Group: ${group.name}`, 'system');

    // Load group message history
    fetchApi(`/groups/${group.id}/messages`)
        .then(messages => {
            if (messages && messages.length > 0) {
                messages.forEach(msg => {
                    // group messages may have 'content' or 'message' field
                    if (!msg.content && msg.message) msg.content = msg.message;
                    renderMessageObj(msg, msg.sender === Auth.getUser().username);
                });
                container.scrollTop = container.scrollHeight;
            }
        })
        .catch(e => console.error('Failed to load group messages', e));

    // Subscribe to group topic — only once per group
    if (stompClient && !groupSubscriptions[group.id]) {
        groupSubscriptions[group.id] = stompClient.subscribe(`/topic/group.${group.id}`, (frame) => {
            const data = JSON.parse(frame.body);
            if (!data.content && data.message) data.content = data.message;
            // Only show if the current group is this one
            if (currentGroup && currentGroup.id === group.id) {
                if (data.sender !== Auth.getUser().username) {
                    renderMessageObj(data, false);
                    document.getElementById('messagesContainer').scrollTop = 99999;
                }
            } else {
                showToast(`New message in ${group.name}`);
            }
        });
    }
}

async function updateStatus(newStatus) {
    // Send to backend StatusController (we'll implement this if missing)
    try {
        await fetchApi('/status', 'POST', { status: newStatus });
        const user = Auth.getUser();
        user.status = newStatus;
        localStorage.setItem('user', JSON.stringify(user));
        showToast(`Status updated to ${newStatus}`);
    } catch (e) {
        showToast("Failed to update status", true);
    }
}

// ── Games Logic ───────────────────────────────────────────────────────────

let currentGameRoom = null;

async function createGameRoom(gameId) {
    const tempRoomId = gameId + '-' + Date.now().toString(36).slice(-4) + Math.random().toString(36).substring(2, 5);

    // Call server API to persist room validation
    try {
        const payload = {
            roomId: tempRoomId,
            gameType: gameId,
            players: [Auth.getUser().username]
        };
        const res = await fetchApi('/games/create', 'POST', payload);
        currentGameRoom = res.roomId;
    } catch (e) {
        showToast("Failed to create game room", true);
        return;
    }

    gameState.mySymbol = 'X';
    gameState.myUsername = Auth.getUser().username;

    // Show centered panel
    const modal = document.getElementById('activeGameModal');
    modal.style.display = 'flex';
    document.getElementById('gameTitle').textContent = gameId.charAt(0).toUpperCase() + gameId.slice(1).replace(/([a-z])([A-Z])/g, '$1 $2');
    document.getElementById('gameRoomCodeDisplay').textContent = currentGameRoom;
    document.getElementById('gameStatusContainer').innerHTML =
        `<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Waiting for opponent...`;

    // Load side chat
    toggleGameChatTarget();

    // Subscribe to game topic
    if (stompClient) {
        stompClient.subscribe(`/topic/game/${currentGameRoom}`, handleGameUpdate);
    }
    renderGameBoard(gameId);
}

async function checkGameRoom() {
    const code = document.getElementById('joinGameInput').value.trim();
    if (!code) { showToast('Please enter a room code', true); return; }

    const guessedGameType = code.split('-')[0] || 'unknown';
    try {
        const res = await fetchApi(`/games/${code}`, 'GET');
        if (res && res.roomId) {
            currentGameRoom = res.roomId;
            document.getElementById('joinGamePreview').style.display = 'block';
            document.getElementById('joinGamePreviewText').innerHTML = `<i class="fas fa-check-circle" style="color:#10b981;margin-right:8px;"></i> Found Game: ${(res.gameType || guessedGameType).toUpperCase()}`;
        } else { throw new Error('Not found'); }
    } catch (e) {
        currentGameRoom = code;
        document.getElementById('joinGamePreview').style.display = 'block';
        document.getElementById('joinGamePreviewText').innerHTML = `<i class="fas fa-link" style="color:#a78bfa;margin-right:8px;"></i> Joining: ${guessedGameType.toUpperCase()} — ${code}`;
    }
}

function joinGameAction() {
    if (!currentGameRoom) return;
    document.getElementById('joinGamePreview').style.display = 'none';
    document.getElementById('joinGameInput').value = '';

    gameState.mySymbol = 'O';
    gameState.myUsername = Auth.getUser().username;

    // Show centered panel
    const modal = document.getElementById('activeGameModal');
    modal.style.display = 'flex';
    const gameId = currentGameRoom.split('-')[0];
    document.getElementById('gameTitle').textContent = gameId.charAt(0).toUpperCase() + gameId.slice(1);
    document.getElementById('gameRoomCodeDisplay').textContent = currentGameRoom;
    document.getElementById('gameStatusContainer').innerHTML = `<i class="fas fa-check" style="margin-right:8px;"></i> Connected!`;

    renderGameBoard(gameId);

    if (stompClient) {
        stompClient.subscribe(`/topic/game/${currentGameRoom}`, handleGameUpdate);
        stompClient.send(`/app/game.join`, {}, JSON.stringify({
            roomId: currentGameRoom,
            player: Auth.getUser().username,
            action: 'JOIN'
        }));
    }

    // Initial side chat load
    toggleGameChatTarget();
}

// ── Game-side Chat Functions (right panel) ───────────────────────────────
// Game state management
let gameState = {
    mySymbol: null,     // 'X' or 'O'
    opponentName: null, // username of opponent
    board: [],
    turn: null,         // username of who should move next
    myUsername: null,
    gameOver: false
};

function isMyTurn() {
    return gameState.turn === gameState.myUsername;
}

function setTurnStatus() {
    if (gameState.gameOver) return;
    const myTurn = isMyTurn();
    const statusEl = document.getElementById('gameStatusContainer');
    if (!statusEl) return;
    if (myTurn) {
        statusEl.innerHTML = `<i class="fas fa-hand-point-right" style="color:#10b981;margin-right:8px;"></i> <strong style="color:#10b981;">Your turn! (${gameState.mySymbol})</strong>`;
    } else {
        statusEl.innerHTML = `<i class="fas fa-hourglass-half" style="margin-right:8px;color:#f59e0b;"></i> <span style="color:#f59e0b;">Opponent's turn...</span>`;
    }
}

function handleGameUpdate(msg) {
    const data = JSON.parse(msg.body);
    const myName = Auth.getUser().username;

    if (data.action === 'JOIN') {
        const isMe = (data.player === myName);
        console.log(`Player JOINED: ${data.player} (Me: ${isMe}) Payload:`, data);

        // data.players is a list of [host, joiner]
        const players = data.players || [];
        const host = data.host || players[0];

        // Find opponent: if I am the host, opponent is the first joiner. 
        // If I am the joiner, opponent is the host.
        if (isMe) {
            // I just joined. 
            gameState.opponentName = (host === myName) ? (players[1] || null) : host;
        } else {
            // Someone else joined.
            gameState.opponentName = data.player;
        }

        gameState.gameOver = false;
        // Initially, host goes first
        gameState.turn = host;

        setTurnStatus();
        const shareInfo = document.getElementById('gameRoomCodeShare');
        if (shareInfo && shareInfo.parentElement) shareInfo.parentElement.style.display = 'none';

        renderGameBoard(data.gameType || currentGameRoom.split('-')[0]);
    } else if (data.action === 'MOVE') {
        // Only process moves SENT BY the opponent (not echoes of our own move)
        if (data.player === myName) return;
        const gameId = currentGameRoom.split('-')[0];
        if (gameId === 'tictactoe') {
            applyTicTacToeMove(data, false);
        } else if (gameId === 'connect4') {
            applyConnect4Move(data, false);
        } else if (gameId === 'rps') {
            showRpsResult(data);
        } else if (gameId === 'chess') {
            if (data.position) {
                applyChessMove(data.position);
                gameState.turn = myName;
                setTurnStatus();
            }
        } else if (gameId === 'nutsandbolts') {
            // apply opponent's tile slide
            if (data.position && nabState) {
                const [fr, fc, tr, tc] = data.position.split(',').map(Number);
                nabState.grid[tr][tc] = nabState.grid[fr][fc];
                nabState.grid[fr][fc] = 0;
                const boardEl = document.getElementById('gameBoard');
                if (boardEl) drawNabBoard(boardEl);
            }
            gameState.turn = myName;
            setTurnStatus();
        }
        gameState.turn = myName;
        if (!gameState.gameOver) setTurnStatus();

    } else if (data.action === 'CHAT') {
        if (data.sender !== myName) {
            appendGameChatMessage(data.sender, data.text, false);
        }

    } else if (data.action === 'LEAVE') {
        // Opponent left the game
        if (data.player !== myName) {
            gameState.gameOver = true;
            const statusEl = document.getElementById('gameStatusContainer');
            if (statusEl) {
                statusEl.innerHTML = `<i class="fas fa-door-open" style="color:#f59e0b;margin-right:8px;"></i>
                    <strong style="color:#f59e0b;">${data.player} left the game.</strong>`;
                showPlayAgainRequest();
            }
            showToast(`${data.player} left the game!`, true);
        }

    } else if (data.action === 'PLAY_AGAIN_REQUEST') {
        // The requester sees nothing (filtered below), opponent sees accept/decline
        if (data.player !== myName) {
            const statusEl = document.getElementById('gameStatusContainer');
            if (!statusEl) return;
            statusEl.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:10px;">
                    <span style="font-size:1rem;"><i class="fas fa-redo" style="color:#a78bfa;margin-right:6px;"></i>
                        <strong>${data.player}</strong> wants to play again!</span>
                    <div style="display:flex;gap:12px;">
                        <button onclick="confirmPlayAgain(true)" style="padding:10px 22px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:10px;color:white;cursor:pointer;font-family:inherit;font-size:0.9rem;">✅ Accept</button>
                        <button onclick="confirmPlayAgain(false)" style="padding:10px 22px;background:rgba(239,68,68,0.3);border:1px solid #ef4444;border-radius:10px;color:white;cursor:pointer;font-family:inherit;font-size:0.9rem;">❌ Decline</button>
                    </div>
                </div>`;
        }

    } else if (data.action === 'PLAY_AGAIN_ACCEPTED') {
        if (data.player !== myName) {
            resetGameForNewRound();
        }

    } else if (data.action === 'PLAY_AGAIN_DECLINED') {
        if (data.player !== myName) {
            document.getElementById('gameStatusContainer').innerHTML =
                `<i class="fas fa-times-circle" style="color:#ef4444;margin-right:8px;"></i> Opponent declined to play again.`;
        }
    }
}

function renderGameBoard(gameId) {
    const board = document.getElementById('gameBoard');
    board.innerHTML = '';
    board.className = 'game-board-container';
    board.style.display = 'block';
    board.style.margin = '20px auto';

    if (gameId === 'tictactoe') {
        board.style.display = 'grid';
        board.style.gridTemplateColumns = 'repeat(3, 100px)';
        board.style.gridTemplateRows = 'repeat(3, 100px)';
        board.style.gap = '8px';
        board.style.justifyContent = 'center';
        gameState.board = Array(9).fill('');

        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.index = i;
            cell.style.cssText = 'width:100px;height:100px;background:rgba(255,255,255,0.06);border:2px solid rgba(255,255,255,0.15);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:2.5rem;cursor:pointer;transition:all 0.2s;';
            cell.onclick = () => makeGameMove(i);
            cell.onmouseenter = () => { if (!cell.textContent) cell.style.background = 'rgba(99,102,241,0.2)'; };
            cell.onmouseleave = () => { if (!cell.textContent) cell.style.background = 'rgba(255,255,255,0.06)'; };
            board.appendChild(cell);
        }

    } else if (gameId === 'connect4') {
        board.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;';
        gameState.board = Array(6).fill(null).map(() => Array(7).fill(''));

        // Column drop buttons
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex;gap:6px;';
        for (let c = 0; c < 7; c++) {
            const btn = document.createElement('button');
            btn.innerHTML = `<i class="fas fa-chevron-down"></i>`;
            btn.style.cssText = 'width:50px;height:32px;background:rgba(99,102,241,0.5);border:none;border-radius:8px;color:white;cursor:pointer;font-size:0.8rem;transition:background 0.2s;';
            btn.onmouseenter = () => btn.style.background = 'rgba(99,102,241,0.9)';
            btn.onmouseleave = () => btn.style.background = 'rgba(99,102,241,0.5)';
            btn.onclick = () => makeGameMove(c);
            btnRow.appendChild(btn);
        }
        board.appendChild(btnRow);

        for (let r = 0; r < 6; r++) {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;gap:6px;';
            for (let c = 0; c < 7; c++) {
                const cell = document.createElement('div');
                cell.id = `c4-${r}-${c}`;
                cell.style.cssText = 'width:50px;height:50px;border-radius:50%;background:rgba(255,255,255,0.05);border:2px solid rgba(255,255,255,0.1);transition:background 0.3s;';
                row.appendChild(cell);
            }
            board.appendChild(row);
        }

    } else if (gameId === 'rps') {
        board.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:20px;padding:20px;';
        const choices = [{ label: '🪨 Rock', val: 'rock' }, { label: '📄 Paper', val: 'paper' }, { label: '✂️ Scissors', val: 'scissors' }];
        const choiceRow = document.createElement('div');
        choiceRow.style.cssText = 'display:flex;gap:15px;';
        choices.forEach(ch => {
            const btn = document.createElement('button');
            btn.textContent = ch.label;
            btn.style.cssText = 'padding:18px 28px;font-size:1.3rem;background:rgba(255,255,255,0.07);border:2px solid rgba(255,255,255,0.15);border-radius:16px;color:white;cursor:pointer;transition:all 0.2s;';
            btn.onmouseenter = () => btn.style.background = 'rgba(99,102,241,0.3)';
            btn.onmouseleave = () => btn.style.background = 'rgba(255,255,255,0.07)';
            btn.onclick = () => {
                document.querySelectorAll('#gameBoard button').forEach(b => b.disabled = true);
                makeGameMove(ch.val);
                btn.style.background = 'rgba(16,185,129,0.3)';
                btn.style.borderColor = '#10b981';
                document.getElementById('gameStatusContainer').innerHTML = `<i class="fas fa-hourglass-half" style="margin-right: 8px;"></i> Waiting for opponent...`;
            };
            choiceRow.appendChild(btn);
        });
        board.appendChild(choiceRow);
        const resultDiv = document.createElement('div');
        resultDiv.id = 'rps-result';
        resultDiv.style.cssText = 'font-size:1.3rem;color:white;font-weight:600;min-height:40px;text-align:center;';
        board.appendChild(resultDiv);

    } else if (gameId === 'chess') {
        renderChessBoard(board);

    } else if (gameId === 'nutsandbolts') {
        renderNutsAndBolts(board);
    }
}

function makeGameMove(index) {
    if (gameState.gameOver) return;
    const gameId = currentGameRoom.split('-')[0];

    // For local puzzle, don't block turn
    if (!isMyTurn() && gameId !== 'nutsandbolts') {
        showToast("It's not your turn!", true);
        return;
    }

    const payload = {
        roomId: currentGameRoom,
        player: Auth.getUser().username,
        action: 'MOVE',
        position: index.toString(),
        gameType: gameId
    };

    // Optimistic local updates
    if (gameId === 'tictactoe') {
        if (gameState.board[index] !== '') return;
        applyTicTacToeMove(payload, true);
        if (!gameState.gameOver) {
            gameState.turn = gameState.opponentName;
            setTurnStatus();
        }
    } else if (gameId === 'connect4') {
        applyConnect4Move(payload, true);
        if (!gameState.gameOver) {
            gameState.turn = gameState.opponentName;
            setTurnStatus();
        }
    }

    if (stompClient) {
        stompClient.send('/app/game.move', {}, JSON.stringify(payload));
    }
}

function sendGameSideMessage() {
    const input = document.getElementById('gameChatInput');
    const content = input.value.trim();
    if (!content) return;
    sendMessageFromInput(content);
    input.value = '';
}

function sendMessageFromInput(content) {
    if (!stompClient) return;
    if (currentGroup) {
        const msg = { sender: Auth.getUser().username, group: currentGroup.id, content };
        stompClient.send("/app/chat.sendGroupMessage", {}, JSON.stringify(msg));
        renderMessageObj(msg, true);
    } else if (currentChatUser) {
        const msg = { sender: Auth.getUser().username, receiver: currentChatUser.username, content };
        stompClient.send("/app/chat.sendMessage", {}, JSON.stringify(msg));
        renderMessageObj(msg, true);
    }
}

function toggleGameChatTarget() {
    const type = document.getElementById('gameChatTypeSelect').value;
    const container = document.getElementById('gameChatMessages');
    container.innerHTML = '';

    // Re-fill based on history
    if (type === 'current') {
        if (currentChatUser) {
            fetchApi(`/messages/${Auth.getUser().username}/${currentChatUser.username}`)
                .then(msgs => msgs.forEach(m => renderMessageObj(m, m.sender === Auth.getUser().username)));
        } else if (currentGroup) {
            fetchApi(`/groups/${currentGroup.id}/messages`)
                .then(msgs => msgs.forEach(m => renderMessageObj(m, m.sender === Auth.getUser().username)));
        }
    } else if (type === 'groups' && currentGroup) {
        fetchApi(`/groups/${currentGroup.id}/messages`)
            .then(msgs => msgs.forEach(m => renderMessageObj(m, m.sender === Auth.getUser().username)));
    }
}

// ── Full Chess Implementation ─────────────────────────────────────────────

const CHESS_PIECES = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟️'
};

let chessBoard = null; // 8×8 array of piece strings or '' 
let chessSelected = null; // {r, c} of selected piece
let chessMoves = []; // legal moves for selected piece as [[r,c],...]
let chessMyColor = null; // 'white' or 'black'
let chessTurn = 'white'; // whose turn

function initChessBoard() {
    chessBoard = [
        ['bR', 'bN', 'bB', 'bQ', 'bK', 'bB', 'bN', 'bR'],
        ['bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP', 'bP'],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP', 'wP'],
        ['wR', 'wN', 'wB', 'wQ', 'wK', 'wB', 'wN', 'wR']
    ];
    chessTurn = 'white';
    chessSelected = null;
    chessMoves = [];
    chessMyColor = gameState.mySymbol === 'X' ? 'white' : 'black';
}

function renderChessBoard(container) {
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px;';
    if (!chessBoard) initChessBoard();
    drawChess(container);
}

function drawChess(container) {
    container.innerHTML = '';
    const info = document.createElement('div');
    info.style.cssText = 'color:#a78bfa;font-size:0.85rem;margin-bottom:6px;font-weight:600;';
    info.textContent = chessMyColor === 'white' ? 'You: White ♔ (host)' : 'You: Black ♚ (joiner)';
    container.appendChild(info);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(8,46px);grid-template-rows:repeat(8,46px);border:2px solid rgba(255,255,255,0.2);border-radius:8px;overflow:hidden;';

    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const cell = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            const isSelected = chessSelected && chessSelected.r === r && chessSelected.c === c;
            const isLegal = chessMoves.some(m => m[0] === r && m[1] === c);

            let bg = isLight ? 'rgba(240,217,181,0.9)' : 'rgba(181,136,99,0.9)';
            if (isSelected) bg = 'rgba(99,242,111,0.8)';
            if (isLegal) bg = 'rgba(99,220,242,0.8)';

            cell.style.cssText = `width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:${bg};cursor:pointer;font-size:1.7rem;transition:background 0.15s;user-select:none;`;
            cell.textContent = chessBoard[r][c] ? CHESS_PIECES[chessBoard[r][c]] || '?' : '';
            cell.onclick = () => handleChessClick(r, c, container);
            grid.appendChild(cell);
        }
    }
    container.appendChild(grid);

    const turnInfo = document.createElement('div');
    turnInfo.style.cssText = 'margin-top:8px;font-size:0.8rem;color:var(--text-secondary);text-align:center;';
    turnInfo.textContent = `Turn: ${chessTurn === 'white' ? 'White ♔' : 'Black ♚'}`;
    container.appendChild(turnInfo);
}

function handleChessClick(r, c, container) {
    if (gameState.gameOver) return;
    const myColor = chessMyColor;
    const myTurnNow = (chessTurn === myColor) && isMyTurn();
    const piece = chessBoard[r][c];

    if (chessSelected) {
        const isLegal = chessMoves.some(m => m[0] === r && m[1] === c);
        if (isLegal) {
            // Make the move
            const from = chessSelected;
            chessBoard[r][c] = chessBoard[from.r][from.c];
            chessBoard[from.r][from.c] = '';
            // Pawn promotion
            if (chessBoard[r][c] === 'wP' && r === 0) chessBoard[r][c] = 'wQ';
            if (chessBoard[r][c] === 'bP' && r === 7) chessBoard[r][c] = 'bQ';
            chessSelected = null;
            chessMoves = [];
            chessTurn = chessTurn === 'white' ? 'black' : 'white';
            gameState.turn = gameState.opponentName;
            setTurnStatus();
            drawChess(container);
            // Broadcast move
            makeGameMove(`${from.r},${from.c},${r},${c}`);
            return;
        }
        // Click elsewhere: deselect
        chessSelected = null;
        chessMoves = [];
    }

    // Select a piece
    if (piece && piece.startsWith(myColor[0]) && myTurnNow) {
        chessSelected = { r, c };
        chessMoves = getLegalChessMoves(r, c, piece, chessBoard);
    }
    drawChess(container);
}

function applyChessMove(moveStr) {
    // moveStr = "fr,fc,tr,tc"
    const [fr, fc, tr, tc] = moveStr.split(',').map(Number);
    chessBoard[tr][tc] = chessBoard[fr][fc];
    chessBoard[fr][fc] = '';
    if (chessBoard[tr][tc] === 'wP' && tr === 0) chessBoard[tr][tc] = 'wQ';
    if (chessBoard[tr][tc] === 'bP' && tr === 7) chessBoard[tr][tc] = 'bQ';
    chessTurn = chessTurn === 'white' ? 'black' : 'white';
    const board = document.getElementById('gameBoard');
    if (board) drawChess(board);
}

function getLegalChessMoves(r, c, piece, b) {
    const color = piece[0]; // 'w' or 'b'
    const type = piece[1]; // K Q R B N P
    const moves = [];
    const enemy = color === 'w' ? 'b' : 'w';
    const addIfValid = (tr, tc) => {
        if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return false;
        if (b[tr][tc].startsWith(color)) return false; // own piece
        moves.push([tr, tc]);
        return !b[tr][tc]; // returns true if empty (can continue sliding)
    };
    const slide = (dr, dc) => { let nr = r + dr, nc = c + dc; while (addIfValid(nr, nc)) { nr += dr; nc += dc; } };

    if (type === 'R') { [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (type === 'B') { [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (type === 'Q') { [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (type === 'N') { [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => addIfValid(r + dr, c + dc)); }
    else if (type === 'K') { [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => addIfValid(r + dr, c + dc)); }
    else if (type === 'P') {
        const dir = color === 'w' ? -1 : 1;
        const start = color === 'w' ? 6 : 1;
        // Forward move
        if (!b[r + dir]?.[c]) {
            moves.push([r + dir, c]);
            if (r === start && !b[r + 2 * dir]?.[c]) moves.push([r + 2 * dir, c]);
        }
        // Captures
        [-1, 1].forEach(dc => {
            const tc = c + dc;
            if (tc >= 0 && tc < 8 && b[r + dir]?.[tc]?.startsWith(enemy)) moves.push([r + dir, tc]);
        });
    }
    return moves;
}

// ── Nuts & Bolts Puzzle Game ──────────────────────────────────────────────

let nabState = null;

function renderNutsAndBolts(container) {
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;';
    nabState = {
        grid: generateNabPuzzle(),
        goal: null,
        moves: 0,
        size: 4
    };
    nabState.goal = nabState.grid.map(r => [...r].sort((a, b) => a - b));
    nabState.grid = shuffleNab(nabState.grid.flat(), nabState.size);
    drawNabBoard(container);
}

function generateNabPuzzle() {
    // 4×4 grid numbered 1-15 + blank (0)
    const nums = Array.from({ length: 15 }, (_, i) => i + 1);
    nums.push(0);
    return [nums.slice(0, 4), nums.slice(4, 8), nums.slice(8, 12), nums.slice(12, 16)];
}

function shuffleNab(arr, size) {
    // Fisher-Yates
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    const grid = [];
    for (let i = 0; i < size; i++) grid.push(arr.slice(i * size, (i + 1) * size));
    return grid;
}

function drawNabBoard(container) {
    container.innerHTML = '';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:1rem;font-weight:600;color:#a78bfa;';
    title.textContent = `⚙️ Nuts & Bolts Puzzle — Moves: ${nabState.moves}`;
    container.appendChild(title);
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:0.8rem;color:var(--text-secondary);';
    hint.textContent = 'Click a tile next to the blank space to slide it';
    container.appendChild(hint);

    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(4,64px);gap:6px;';
    const g = nabState.grid;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const cell = document.createElement('div');
        const val = g[r][c];
        cell.style.cssText = `width:64px;height:64px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;cursor:pointer;transition:all 0.15s;` +
            (val === 0 ? 'background:rgba(255,255,255,0.04);border:2px dashed rgba(255,255,255,0.1);' :
                'background:linear-gradient(135deg,rgba(99,102,241,0.6),rgba(139,92,246,0.6));color:white;border:2px solid rgba(99,102,241,0.5);');
        cell.textContent = val === 0 ? '' : val;
        if (val !== 0) {
            cell.onmouseenter = () => cell.style.transform = 'scale(1.06)';
            cell.onmouseleave = () => cell.style.transform = 'scale(1)';
            cell.onclick = () => handleNabClick(r, c, container);
        }
        grid.appendChild(cell);
    }
    container.appendChild(grid);
}

function handleNabClick(r, c, container) {
    if (gameState.gameOver) return;
    if (!isMyTurn()) { showToast("It's not your turn!", true); return; }
    const g = nabState.grid;
    // Find blank
    let br = -1, bc = -1;
    for (let i = 0; i < 4 && br < 0; i++) for (let j = 0; j < 4; j++) { if (g[i][j] === 0) { br = i; bc = j; break; } }
    // Must be adjacent
    if ((Math.abs(r - br) + Math.abs(c - bc)) === 1) {
        g[br][bc] = g[r][c];
        g[r][c] = 0;
        nabState.moves++;
        makeGameMove(`${r},${c},${br},${bc}`);
        drawNabBoard(container);
        // Check win
        const flat = g.flat();
        const goal = [...Array.from({ length: 15 }, (_, i) => i + 1), 0];
        if (JSON.stringify(flat) === JSON.stringify(goal)) {
            gameState.gameOver = true;
            document.getElementById('gameStatusContainer').innerHTML =
                `<i class="fas fa-trophy" style="color:#fbbf24;margin-right:8px;"></i> 🏆 Puzzle Solved in ${nabState.moves} moves!`;
            showPlayAgainRequest();
        }
    }
}

function resetGameForNewRound() {
    const gameId = currentGameRoom.split('-')[0];
    if (gameId === 'connect4') {
        gameState.board = Array(6).fill(null).map(() => Array(7).fill(''));
    } else if (gameId === 'chess') {
        chessBoard = null;
        initChessBoard();
    } else {
        gameState.board = Array(9).fill('');
    }
    gameState.gameOver = false;
    // Swap who goes first each round
    gameState.turn = gameState.opponentName || gameState.myUsername;
    renderGameBoard(gameId);
    setTurnStatus();
}

function confirmPlayAgain(accepted) {
    if (!stompClient || !currentGameRoom) return;
    const action = accepted ? 'PLAY_AGAIN_ACCEPTED' : 'PLAY_AGAIN_DECLINED';
    stompClient.send('/app/game.move', {}, JSON.stringify({
        roomId: currentGameRoom,
        player: Auth.getUser().username,
        action: action
    }));
    if (accepted) resetGameForNewRound();
    else document.getElementById('gameStatusContainer').innerHTML =
        `<i class="fas fa-times-circle" style="color:#ef4444;margin-right:8px;"></i> You declined to play again.`;
}

function applyTicTacToeMove(data, isMe) {
    const pos = parseInt(data.position);
    const symbol = isMe ? gameState.mySymbol : (gameState.mySymbol === 'X' ? 'O' : 'X');
    if (gameState.board[pos]) return; // already occupied
    gameState.board[pos] = symbol;
    const cells = document.querySelectorAll('.cell');
    if (cells[pos]) {
        cells[pos].textContent = symbol;
        cells[pos].style.color = symbol === 'X' ? '#6366f1' : '#ec4899';
        cells[pos].style.fontWeight = 'bold';
        cells[pos].style.cursor = 'default';
        cells[pos].onclick = null;
        cells[pos].onmouseenter = null;
        cells[pos].onmouseleave = null;
    }
    // Check win
    const winner = checkTTTWin(gameState.board);
    if (winner) {
        gameState.gameOver = true;
        const winnerLabel = isMe ? '🏆 You Win!' : '😢 You Lose!';
        document.getElementById('gameStatusContainer').innerHTML =
            `<i class="fas fa-trophy" style="color:#fbbf24;margin-right:8px;"></i> ${winnerLabel}`;
        document.querySelectorAll('.cell').forEach(c => { c.onclick = null; c.style.cursor = 'default'; });
        showPlayAgainRequest();
    } else if (gameState.board.every(c => c)) {
        gameState.gameOver = true;
        document.getElementById('gameStatusContainer').innerHTML =
            `<i class="fas fa-handshake" style="margin-right:8px;"></i> It's a draw!`;
        showPlayAgainRequest();
    }
}

function checkTTTWin(board) {
    const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
    for (const [a, b, c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
}

function applyConnect4Move(data, isMe) {
    const col = parseInt(data.position);
    const color = isMe ? '#6366f1' : '#ec4899';
    for (let r = 5; r >= 0; r--) {
        if (!gameState.board[r][col]) {
            gameState.board[r][col] = isMe ? 'me' : 'opp';
            const cell = document.getElementById(`c4-${r}-${col}`);
            if (cell) { cell.style.background = color; cell.style.boxShadow = `0 0 12px ${color}`; }
            // Check for C4 win (4 in a row)
            if (checkConnect4Win(isMe ? 'me' : 'opp')) {
                gameState.gameOver = true;
                document.getElementById('gameStatusContainer').innerHTML =
                    `<i class="fas fa-trophy" style="color:#fbbf24;margin-right:8px;"></i> ${isMe ? '🏆 You Win!' : '😢 You Lose!'}`;
                showPlayAgainRequest();
            }
            break;
        }
    }
}

function checkConnect4Win(symbol) {
    const b = gameState.board;
    const rows = 6, cols = 7;
    // Horizontal, vertical, diagonal
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (b[r][c] !== symbol) continue;
        if (c + 3 < cols && b[r][c + 1] === symbol && b[r][c + 2] === symbol && b[r][c + 3] === symbol) return true;
        if (r + 3 < rows && b[r + 1][c] === symbol && b[r + 2][c] === symbol && b[r + 3][c] === symbol) return true;
        if (r + 3 < rows && c + 3 < cols && b[r + 1][c + 1] === symbol && b[r + 2][c + 2] === symbol && b[r + 3][c + 3] === symbol) return true;
        if (r + 3 < rows && c - 3 >= 0 && b[r + 1][c - 1] === symbol && b[r + 2][c - 2] === symbol && b[r + 3][c - 3] === symbol) return true;
    }
    return false;
}

function showRpsResult(data) {
    const el = document.getElementById('rps-result');
    if (!el) return;
    const myName = Auth.getUser().username;
    if (data.result) {
        const icons = { rock: '🪨', paper: '📄', scissors: '✂️' };
        const opponentChoice = icons[data.opponentChoice] || '?';
        let resultText = data.result === 'win' ? '🏆 You Win!' : data.result === 'draw' ? '🤝 Draw!' : '😢 You Lose!';
        el.innerHTML = `<div>You: ${icons[data.myChoice] || '?'} vs Opponent: ${opponentChoice}</div><div style="font-size:1.8rem;margin-top:10px;">${resultText}</div>`;
        // Re-enable buttons for next round
        setTimeout(() => {
            document.querySelectorAll('#gameBoard button').forEach(b => {
                b.disabled = false;
                b.style.background = 'rgba(255,255,255,0.07)';
                b.style.borderColor = 'rgba(255,255,255,0.15)';
            });
            if (el) el.innerHTML = '';
        }, 2000);
    }
}

function quitGame() {
    // Broadcast leave event to opponent before quitting
    if (stompClient && currentGameRoom) {
        stompClient.send('/app/game.move', {}, JSON.stringify({
            roomId: currentGameRoom,
            player: Auth.getUser().username,
            action: 'LEAVE'
        }));
    }

    // Hide game panel
    const gamePanel = document.getElementById('gameFloatPanel');
    if (gamePanel) gamePanel.remove();
    // Legacy modal fallback
    const modal = document.getElementById('activeGameModal');
    if (modal) { modal.style.display = 'none'; modal.style.flexDirection = ''; }
    const boardEl = document.getElementById('gameBoard');
    if (boardEl) { boardEl.style.display = 'none'; boardEl.innerHTML = ''; }
    const panel = document.getElementById('gameSidePanel');
    if (panel) panel.remove();
    currentGameRoom = null;
    chessBoard = null;
    nabState = null;
    gameState = { mySymbol: null, board: [], turn: null, myUsername: null, opponentName: null, gameOver: false };
    appendLog('Game disconnected', 'system');
}

// Global Enter listener for game chat


// Legacy Game Side Chat Logic Removed

function shareGameRoomCode() {
    if (!currentGameRoom || !stompClient) return;
    const code = currentGameRoom;
    const msg = `🎮 Join my game! Room code: **${code}**`;

    // If we have an active DM or group, send it directly
    if (currentChatUser) {
        stompClient.send('/app/chat.sendMessage', {}, JSON.stringify({
            sender: Auth.getUser().username,
            receiver: currentChatUser.username,
            content: msg
        }));
        showToast('Code shared to private chat!');
        // Also render locally
        renderMessageObj({ sender: Auth.getUser().username, content: msg, timestamp: new Date() }, true);
    } else if (currentGroup) {
        stompClient.send('/app/chat.sendGroupMessage', {}, JSON.stringify({
            sender: Auth.getUser().username,
            group: currentGroup.id,
            content: msg
        }));
        showToast('Code shared to group!');
    } else {
        // Just copy to clipboard and notify
        navigator.clipboard.writeText(code).then(() => {
            showToast('Code copied! Paste it in any chat.', false);
        });
    }
}

function showPlayAgainRequest() {
    const statusEl = document.getElementById('gameStatusContainer');
    if (!statusEl) return;
    // Keep existing innerHTML (win/draw message) and append button below
    const btn = document.createElement('button');
    btn.innerHTML = `<i class="fas fa-redo" style="margin-right:6px;"></i> Play Again`;
    btn.style.cssText = 'margin-top:12px; padding:10px 24px; background:linear-gradient(135deg,#6366f1,#ec4899); border:none; border-radius:12px; color:white; font-size:0.95rem; cursor:pointer; display:inline-block;';
    btn.onclick = () => {
        btn.disabled = true;
        btn.textContent = 'Request sent...';
        if (stompClient && currentGameRoom) {
            stompClient.send('/app/game.move', {}, JSON.stringify({
                roomId: currentGameRoom,
                player: Auth.getUser().username,
                action: 'PLAY_AGAIN_REQUEST'
            }));
        }
    };
    const wrapper = document.createElement('div');
    wrapper.style.textAlign = 'center';
    wrapper.appendChild(btn);
    statusEl.appendChild(wrapper);
}

// Side chat global Enter listener
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        const inp = document.getElementById('gameChatInput');
        if (inp && document.activeElement === inp) {
            sendGameSideMessage();
        }
    }
});
