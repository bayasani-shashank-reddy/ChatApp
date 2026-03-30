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
    if (!user) {
        console.warn("No authenticated user found. Redirecting...");
        window.location.href = '/login.html';
        return;
    }
    document.getElementById('currentUserName').textContent = user.displayName || user.username;

    // Top Profile UI Update
    const avatarEl = document.getElementById('currentUserAvatar');
    if (user.avatar && user.avatar.startsWith('fas ')) {
        avatarEl.innerHTML = `<i class="${user.avatar}"></i>`;
    } else if (user.avatar) {
        avatarEl.innerHTML = `<img src="${user.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
        avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
    }

    // Connect WebSocket
    connectWebSocket();

    // Event Listeners
    document.getElementById('logoutBtn').addEventListener('click', Auth.logout);
    document.getElementById('sendBtn').addEventListener('click', sendMessage);
    document.getElementById('messageInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    loadUsers();
    loadGroups();
    loadStories();
    loadRecentActivity();
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

                const displayName = s.username || "User";
                const initial = displayName[0].toUpperCase();

                let previewHTML = '';
                if (s.fileType === 'image') {
                    previewHTML = `<img src="${s.fileUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
                } else if (s.fileType === 'video') {
                    previewHTML = `<div class="icon" style="background: var(--primary); color: white;"><i class="fas fa-video"></i></div>`;
                } else {
                    // Text story or other - show initial gracefully
                    previewHTML = `<div class="icon" style="background: var(--primary); color: white; font-weight: bold; font-size: 1.2rem;">${initial}</div>`;
                }

                item.innerHTML = `
                    <div class="story-avatar">
                        ${previewHTML}
                    </div>
                    <span class="story-name">${displayName}</span>
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
            const uploadBase = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL && !BACKEND_URL.includes('YOUR-RENDER')) ? BACKEND_URL : '';
            const res = await fetch(uploadBase + '/api/upload', { method: 'POST', body: formData });
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
    const currentUser = Auth.getUser();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'z-index: 3000; background: rgba(0,0,0,0.9); display: flex; align-items: center; justify-content: center;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    let content = '';
    if (story.fileType === 'image') content = `<img src="${story.fileUrl}" style="max-width:90vw; max-height:80vh; border-radius:16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">`;
    else if (story.fileType === 'video') content = `<video src="${story.fileUrl}" autoplay controls style="max-width:90vw; max-height:80vh; border-radius:16px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);"></video>`;
    else content = `<h2 style="color:white; font-size: 2rem; padding: 40px; background: var(--glass-bg); border-radius: 20px;">${story.content}</h2>`;

    const isAuthor = currentUser && currentUser.id === story.userId;
    const deleteBtn = isAuthor ? `<button onclick="deleteStory('${story.id}', event)" class="primary-btn" style="background: #ef4444; border:none; padding: 8px 15px; border-radius: 8px; font-size: 0.8rem;"><i class="fas fa-trash"></i> Delete</button>` : '';

    overlay.innerHTML = `
        <div style="position:relative; max-width: 90vw; display: flex; flex-direction: column; gap: 15px;">
            <!-- Story Header -->
            <div style="display:flex; justify-content: space-between; align-items: center; padding: 10px 0;">
                <div style="display:flex; align-items: center; gap: 12px;">
                    <div class="avatar" style="width: 40px; height: 40px; font-size: 1rem; background: var(--primary);">
                        <i class="fas fa-user"></i>
                    </div>
                    <div style="text-align: left;">
                        <div style="color: white; font-weight: 600;">${story.username || 'User'}</div>
                        <div style="color: rgba(255,255,255,0.6); font-size: 0.75rem;">${new Date(story.createdAt).toLocaleTimeString()}</div>
                    </div>
                </div>
                <div style="display:flex; gap: 15px; align-items: center;">
                    ${deleteBtn}
                    <div style="color:white; font-size:1.5rem; cursor:pointer;" onclick="this.closest('.modal-overlay').remove()">&times;</div>
                </div>
            </div>
            
            <!-- Progress Bar -->
            <div style="width: 100%; height: 3px; background: rgba(255,255,255,0.2); border-radius: 3px; overflow: hidden;">
                <div id="storyProgress" style="width: 0%; height: 100%; background: var(--primary); transition: width 5s linear;"></div>
            </div>

            ${content}
        </div>
    `;
    document.body.appendChild(overlay);

    // Animate progress bar
    setTimeout(() => {
        const bar = document.getElementById('storyProgress');
        if (bar) bar.style.width = '100%';
    }, 50);

    // Auto close after 5s if not video
    if (story.fileType !== 'video') {
        setTimeout(() => {
            if (document.body.contains(overlay)) overlay.remove();
        }, 5000);
    }
}

async function deleteStory(id, event) {
    event.stopPropagation();
    if (!confirm("Are you sure you want to delete this story?")) return;

    try {
        await fetchApi(`/stories/${id}`, 'DELETE');
        showToast("Story deleted");
        const overlay = document.querySelector('.modal-overlay:has(#storyProgress)');
        if (overlay) overlay.remove();
        loadStories();
    } catch (e) {
        showToast("Error deleting story: " + e.message, true);
    }
}


function connectWebSocket() {
    const wsBase = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL && !BACKEND_URL.includes('YOUR-RENDER')) ? BACKEND_URL : '';
    const socket = new SockJS(wsBase + '/ws');
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

async function loadRecentActivity() {
    try {
        const user = Auth.getUser();
        if (!user) return;
        const recent = await fetchApi(`/messages/recent/${user.username}`);
        if (recent) {
            for (const contact in recent) {
                const msg = recent[contact];
                lastMessages[contact] = {
                    content: msg.content || (msg.fileUrl ? "Sent a file" : ""),
                    time: new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };
            }
            renderUsers(); // Refresh sidebar with snippets
        }
    } catch (e) {
        console.error("Error loading recent activity", e);
    }
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

        let avatarHtml = `<i class="${u.avatar || 'fas fa-user'}"></i>`;
        if (u.avatar && !u.avatar.startsWith('fas ')) {
            avatarHtml = `<img src="${u.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
        }

        div.innerHTML = `
            <div class="avatar" style="background: var(--primary);">
                ${avatarHtml}
                <span class="status-indicator ${isOnline ? 'online' : ''}"></span>
                ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
            </div>
            <div class="contact-info">
                <div class="contact-name">
                    <span>${u.username}</span>
                    <span style="font-size:0.7rem; color:var(--text-muted); font-weight:400;">${lastMsgData.time}</span>
                </div>
                <div class="last-msg">
                    ${u.status && u.status !== 'Available' ? `<span style="font-size:0.75rem; color:var(--primary); font-weight:600; margin-right:6px;">${u.status}</span>` : ''}
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

    updateGameSelectToCurrent();

    document.getElementById('activeChatName').textContent = user.username;
    document.getElementById('activeStatus').textContent = user.online ? 'Online' : 'Offline';
    document.getElementById('activeStatus').className = `status ${user.online ? 'online' : ''}`;

    let avatarHtml = `<i class="${user.avatar || 'fas fa-user'}"></i>`;
    if (user.avatar && !user.avatar.startsWith('fas ')) {
        avatarHtml = `<img src="${user.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    }
    document.getElementById('activeAvatar').innerHTML = avatarHtml;

    // Populate Right Pane
    document.getElementById('rightPaneName').textContent = user.displayName || user.username;
    document.getElementById('rightPaneStatus').textContent = user.online ? 'Online' : 'Offline';
    document.getElementById('rightPaneAbout').textContent = user.status || 'Available';
    document.getElementById('rightPaneEmail').textContent = user.email || 'Not Provided';
    document.getElementById('rightPanePhone').textContent = user.phone || 'Not Provided';
    document.getElementById('rightPaneAvatar').innerHTML = avatarHtml;

    // Hide add member button for private chats
    const addMemberBtn = document.getElementById('addGroupMemberBtn');
    if (addMemberBtn) addMemberBtn.style.display = 'none';

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
        const uploadBase = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL && !BACKEND_URL.includes('YOUR-RENDER')) ? BACKEND_URL : '';
        const response = await fetch(uploadBase + '/api/upload', {
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
                const voiceUploadBase = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL && !BACKEND_URL.includes('YOUR-RENDER')) ? BACKEND_URL : '';
                const res = await fetch(voiceUploadBase + '/api/upload', { method: 'POST', body: formData });
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
        const stream = event.streams[0];
        const hasVideo = stream.getVideoTracks().length > 0;

        const remoteVideo = document.getElementById('remoteVideo');

        if (hasVideo) {
            if (remoteVideo) {
                remoteVideo.srcObject = stream;
                remoteVideo.style.display = 'block';
                remoteVideo.play().catch(() => {});
            }
        } else {
            // Audio-only call: use a persistent <audio> element
            let remoteAudio = document.getElementById('remoteAudio');
            if (!remoteAudio) remoteAudio = createRemoteAudio();
            remoteAudio.srcObject = stream;
            remoteAudio.play().catch(e => console.warn('Audio play blocked:', e));
        }
        document.getElementById('callStatusText').textContent = 'Connected ' + (hasVideo ? '🎬' : '🔊');
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

async function endCall() {
    // Send leave signal
    sendSignal('leave', null);

    // Log call end
    if (currentCallId) {
        try {
            await fetchApi('/calls/log', {
                method: 'POST',
                body: JSON.stringify({
                    id: currentCallId,
                    endTime: new Date().toISOString()
                })
            });
        } catch (e) {
            console.error("Failed to log call end", e);
        }
    }

    cleanupCallTokens();
}

function cleanupCallTokens() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            track.stop();
        });
        localStream = null;
    }
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    document.getElementById('callOverlay').style.display = 'none';
    // Reset button visibility to defaults
    document.getElementById('answerCallBtn').style.display = 'none';
    document.getElementById('denyCallBtn').style.display = 'none';
    document.getElementById('endCallBtn').style.display = 'flex';
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) { remoteVideo.srcObject = null; remoteVideo.style.display = 'none'; }
    const localVideo = document.getElementById('localVideo');
    if (localVideo) { localVideo.srcObject = null; localVideo.style.display = 'none'; }
    const remoteAudio = document.getElementById('remoteAudio');
    if (remoteAudio) { remoteAudio.srcObject = null; }
    currentCallId = null;
    currentCallType = null;
    isCaller = false;

    // Refresh call logs if we're on the calls tab
    if (document.querySelector('.tab-btn[data-tab="calls"]').classList.contains('active')) {
        loadCallLogs();
    }
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
        document.getElementById('callStatusText').textContent = '📞 Incoming call...';
        document.getElementById('answerCallBtn').style.display = 'flex';
        document.getElementById('denyCallBtn').style.display = 'flex';
        document.getElementById('endCallBtn').style.display = 'none'; // Hide end btn until answered

        // Store offer SDP to use when answering
        window._pendingOffer = msg.payload;

        // Setup peer connection early so we're ready to answer
        try {
            const isVideoCall = !!(msg.payload && msg.payload.callType && msg.payload.callType.includes('video'));
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isVideoCall });
            if (isVideoCall) {
                const localVideo = document.getElementById('localVideo');
                if (localVideo) {
                    localVideo.srcObject = localStream;
                    localVideo.style.display = 'block';
                }
            }
        } catch (e) { console.warn('Mic/Camera denied on incoming call'); }
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

    } else if (msg.type === 'deny') {
        // Caller receives this when callee declines
        showToast(msg.senderId + ' declined the call.', true);
        cleanupCallTokens();
    }
}

async function answerCall() {
    document.getElementById('answerCallBtn').style.display = 'none';
    document.getElementById('denyCallBtn').style.display = 'none';
    document.getElementById('endCallBtn').style.display = 'flex'; // Show hang-up
    document.getElementById('callStatusText').textContent = 'Connecting...';
    try {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal('answer', { sdp: answer });
    } catch (e) {
        showToast('Failed to answer call: ' + e.message, true);
    }
}

function denyCall() {
    // Tell the caller we declined
    sendSignal('deny', null);
    // Clean up everything locally
    cleanupCallTokens();
    showToast('Call declined.');
}

async function loadCallLogs() {
    const listContainer = document.getElementById('callsListContainer');
    if (!listContainer) return;
    listContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-secondary);">Loading call logs...</div>';

    try {
        const user = Auth.getUser();
        if (!user || !user.username) return;

        const logs = await fetchApi(`/calls/user/${user.username}`);
        listContainer.innerHTML = ''; // Clear loading message

        if (logs && Array.isArray(logs) && logs.length > 0) {
            logs.forEach(log => {
                const div = document.createElement('div');
                div.className = 'call-log-item';
                const callTypeIcon = log.callType === 'video' ? '<i class="fas fa-video"></i>' : '<i class="fas fa-phone"></i>';
                const directionIcon = log.caller === user.username ? '<i class="fas fa-arrow-up" style="color:var(--primary-color);"></i>' : '<i class="fas fa-arrow-down" style="color:var(--accent-color);"></i>';
                const participant = log.caller === user.username ? log.receiver : log.caller;
                const startTime = new Date(log.startTime).toLocaleString();
                const endTime = log.endTime ? new Date(log.endTime).toLocaleString() : 'Ongoing';

                div.innerHTML = `
                    <div class="call-log-icon">${callTypeIcon}</div>
                    <div class="call-log-info">
                        <div class="call-log-name">${directionIcon} ${participant}</div>
                        <div class="call-log-time">${startTime} - ${endTime}</div>
                    </div>
                `;
                listContainer.appendChild(div);
            });
        } else {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:20px;text-align:center;color:var(--text-secondary);font-size:0.9rem;';
            empty.textContent = 'No call logs found.';
            listContainer.appendChild(empty);
        }
    } catch (e) {
        console.error("Error loading call logs:", e);
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = 'padding:20px;text-align:center;color:#fca5a5;font-size:0.9rem;background:rgba(239,68,68,0.05);border-radius:12px;margin:10px;';
        errorDiv.innerHTML = `<i class="fas fa-exclamation-circle" style="margin-right:8px;"></i> Failed to load call logs. <br><small style="opacity:0.7;">${e.message || 'Server error'}</small>`;
        listContainer.appendChild(errorDiv);
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
    const storiesContainer = document.getElementById('storiesContainer');
    if (storiesContainer) storiesContainer.style.display = 'none';

    if (tabName === 'chats') {
        document.getElementById('chatsArea').style.display = 'flex';
        document.getElementById('chatsListContainer').style.display = 'block';
        if (storiesContainer) storiesContainer.style.display = 'flex';
        document.querySelector('.search-bar').style.display = 'flex';
    } else if (tabName === 'games') {
        document.getElementById('gamesArea').style.display = 'flex';
        document.getElementById('chatsListContainer').style.display = 'block'; // Keep user list visible for invites
        document.querySelector('.search-bar').style.display = 'none';
    } else if (tabName === 'groups') {
        document.getElementById('chatsArea').style.display = 'flex';
        document.getElementById('groupsListContainer').style.display = 'block';
        if (storiesContainer) storiesContainer.style.display = 'flex';
        document.querySelector('.search-bar').style.display = 'flex';
        loadGroups();
    } else if (tabName === 'calls') {
        document.getElementById('chatsArea').style.display = 'flex';
        document.getElementById('callsListContainer').style.display = 'block';
        if (storiesContainer) storiesContainer.style.display = 'none';
        document.querySelector('.search-bar').style.display = 'flex';
        loadCallLogs();
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

    updateGameSelectToCurrent();

    document.getElementById('activeChatName').textContent = group.name;
    document.getElementById('activeStatus').textContent = `${(group.members || []).length} members`;
    document.getElementById('activeStatus').className = `status`;
    document.getElementById('activeAvatar').innerHTML = `<i class="fas fa-users"></i>`;

    // Show add member button for groups
    const addMemberBtn = document.getElementById('addGroupMemberBtn');
    if (addMemberBtn) addMemberBtn.style.display = 'flex';

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
        console.log(`Subscribing to group: ${group.id}`);
        groupSubscriptions[group.id] = stompClient.subscribe(`/topic/group.${group.id}`, (frame) => {
            const data = JSON.parse(frame.body);
            console.log("Incoming group message:", data);
            if (!data.content && data.message) data.content = data.message;
            // Only show if the current group is this one
            if (currentGroup && currentGroup.id === group.id) {
                if (data.sender !== Auth.getUser().username) {
                    renderMessageObj(data, false);
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
        localStorage.setItem('chat_user', JSON.stringify(user));
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
    gameState.turn = null; // Wait for opponent

    // Show centered panel
    const modal = document.getElementById('activeGameModal');
    modal.style.display = 'flex';
    const gameNames = {
        tictactoe: 'Tic Tac Toe',
        connect4: 'Connect Four',
        rps: 'Rock Paper Scissors',
        chess: 'Chess',
        nutsandbolts: 'Nuts & Bolts Puzzle'
    };
    document.getElementById('gameTitle').textContent = gameNames[gameId] || gameId;
    document.getElementById('gameRoomCodeDisplay').textContent = currentGameRoom;
    document.getElementById('gameStatusContainer').innerHTML =
        `<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i> Waiting for opponent...`;

    // Show waiting UI on board
    const board = document.getElementById('gameBoard');
    board.style.display = 'flex';
    board.innerHTML = `
        <div style="text-align:center; color:white; padding:40px; display:flex; flex-direction:column; align-items:center; gap:20px;">
            <div style="font-size:4rem; animation: pulse 2s infinite;">⏳</div>
            <h2 style="font-size:1.8rem; font-weight:700;">Waiting for Opponent</h2>
            <p style="color:rgba(255,255,255,0.6); max-width:300px;">Share the room code below with a friend. The game will start automatically when they join!</p>
            <div style="font-size:1.5rem; font-family:monospace; font-weight:bold; letter-spacing:4px; background:rgba(255,255,255,0.05); padding:15px 30px; border-radius:16px; border:1px solid rgba(255,255,255,0.1); color:#a78bfa; margin-top:10px;">
                ${currentGameRoom}
            </div>
            <button onclick="shareGameRoomCode()" class="primary-btn" style="margin-top:10px;"><i class="fas fa-share-alt" style="margin-right:8px;"></i> Share Code</button>
        </div>
    `;

    // Load side chat
    toggleGameChatTarget();

    // Subscribe and Join
    if (stompClient) {
        stompClient.subscribe(`/topic/game/${currentGameRoom}`, handleGameUpdate);
        stompClient.send(`/app/game.join`, {}, JSON.stringify({
            roomId: currentGameRoom,
            player: Auth.getUser().username,
            action: 'JOIN'
        }));
    }
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
    const gameId = currentGameRoom ? currentGameRoom.split('-')[0] : '';
    let symbolDisplay = `(${gameState.mySymbol})`;
    if (gameId === 'chess') {
        symbolDisplay = chessMyColor === 'white' ? '♔' : '♚';
    } else if (gameId === 'nutsandbolts') {
        symbolDisplay = '⚙️';
    }
    if (myTurn) {
        statusEl.innerHTML = `<i class="fas fa-hand-point-right" style="color:#10b981;margin-right:8px;"></i> <strong style="color:#10b981;">Your turn! ${symbolDisplay}</strong>`;
    } else {
        statusEl.innerHTML = `<i class="fas fa-hourglass-half" style="margin-right:8px;color:#f59e0b;"></i> <span style="color:#f59e0b;">Opponent's turn...</span>`;
    }
}

function handleGameUpdate(msg) {
    const data = JSON.parse(msg.body);
    const myName = Auth.getUser().username;

    if (data.action === 'JOIN') {
        const isMe = (data.player === myName);
        console.log(`Player JOINED: ${data.player} (Me: ${isMe}) Payload: `, data);

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

        // SYNC: If I am the host and someone joined, broadcast my current board state
        if (isMe === false && host === myName) {
            if (nabState) {
                stompClient.send('/app/game.move', {}, JSON.stringify({
                    roomId: currentGameRoom,
                    player: myName,
                    action: 'SYNC_BOARD',
                    grid: nabState.grid,
                    size: nabState.size
                }));
            }
        }

        // Only start (render board) if we have 2 players
        if (players.length >= 2) {
            renderGameBoard(data.gameType || currentGameRoom.split('-')[0]);
        }
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
            // Apply opponent's chess move
            if (data.position && typeof data.position === 'string' && data.position.includes(',')) {
                applyChessMoveString(data.position);
                const boardEl = document.getElementById('gameBoard');
                if (boardEl) drawChess(boardEl);
                gameState.turn = myName;

                const status = getChessGameStatus(chessTurn);
                if (status !== 'playing') {
                    gameState.gameOver = true;
                    setTimeout(() => showToast("Game Over: " + status, true), 500);
                }
                setTurnStatus();
            }
        } else if (gameId === 'nutsandbolts') {
            // apply opponent's tile slide
            if (data.position && nabState) {
                applyNabMove(data.position);
            }
            gameState.turn = myName;
            setTurnStatus();
        } else if (data.action === 'SYNC_BOARD') {
            // Apply synced board state (puzzles)
            if (data.grid && nabState) {
                nabState.grid = data.grid;
                nabState.size = data.size || 4;
                const boardEl = document.getElementById('gameBoard');
                if (boardEl) drawNabBoard(boardEl);
            }
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
                        <button onclick="handlePlayAgain(true)" style="padding:10px 22px;background:linear-gradient(135deg,#10b981,#059669);border:none;border-radius:10px;color:white;cursor:pointer;font-family:inherit;font-size:0.9rem;">✅ Accept</button>
                        <button onclick="handlePlayAgain(false)" style="padding:10px 22px;background:rgba(239,68,68,0.3);border:1px solid #ef4444;border-radius:10px;color:white;cursor:pointer;font-family:inherit;font-size:0.9rem;">❌ Decline</button>
                    </div>
                </div>`;
        }

    } else if (data.action === 'PLAY_AGAIN_ACCEPTED') {
        showToast('Play again request accepted!');
        document.getElementById('gameStatusContainer').innerHTML = '';
        currentGameRoom = data.roomId;
        gameBoard = Array(9).fill(null);
        currentTurn = data.host || 'X';
        const cells = document.querySelectorAll('.tictactoe-cell');
        cells.forEach(cell => { cell.textContent = ''; cell.classList.remove('x', 'o'); });
        resetGameForNewRound(currentTurn);
    } else if (data.action === 'PLAY_AGAIN_DECLINED') {
        if (data.player !== myName) {
            document.getElementById('gameStatusContainer').innerHTML =
                `<i class="fas fa-times-circle" style="color:#ef4444;margin-right:8px;"></i> Opponent declined to play again.`;
        }
    }
}

function renderGameBoard(gameId) {
    const board = document.getElementById('gameBoard');
    if (!board) return;
    board.innerHTML = '';
    board.className = 'game-board-container';
    board.style.display = 'flex';
    board.style.flexDirection = 'column';
    board.style.alignItems = 'center';
    board.style.justifyContent = 'center';
    board.style.margin = '0 auto';
    board.style.width = '100%';
    board.style.height = '100%';

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
                window._myRpsChoice = ch.val; // Store for result calculation
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
    'K': '♚', 'Q': '♛', 'R': '♜', 'B': '♝', 'N': '♞', 'P': '♟'
};

let chessBoard = null;
let chessSelected = null;
let chessMoves = [];
let chessMyColor = null;
let chessTurn = 'white';
let chessEnPassant = null; // {r, c} of the target square (the empty square the capturing pawn moves to)
let chessCastling = { wK: true, wQ: true, bK: true, bQ: true };

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
    chessEnPassant = null;
    chessCastling = { wK: true, wQ: true, bK: true, bQ: true };
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

    // To display from perspective
    const ranks = chessMyColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
    const files = chessMyColor === 'black' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    for (const r of ranks) {
        for (const c of files) {
            const cell = document.createElement('div');
            const isLight = (r + c) % 2 === 0;
            const isSelected = chessSelected && chessSelected.r === r && chessSelected.c === c;
            const isLegal = chessMoves.some(m => m[0] === r && m[1] === c);

            let bg = isLight ? 'rgba(240,217,181,0.9)' : 'rgba(181,136,99,0.9)';
            if (isSelected) bg = 'rgba(99,242,111,0.8)';
            if (isLegal) bg = 'rgba(99,220,242,0.8)';

            const pieceCode = chessBoard[r][c];
            const pColor = pieceCode && pieceCode.startsWith('w') ? '#ffffff' : '#0f172a';
            const pShadow = pieceCode && pieceCode.startsWith('w')
                ? 'drop-shadow(0 2px 2px rgba(0,0,0,0.8))'
                : 'drop-shadow(0 1px 1px rgba(255,255,255,0.4))';

            cell.style.cssText = `width:46px;height:46px;display:flex;align-items:center;justify-content:center;background:${bg};cursor:pointer;font-size:2.4rem;transition:background 0.15s;user-select:none;color:${pColor};filter:${pShadow};`;
            const type = pieceCode ? pieceCode[1] : '';
            cell.textContent = type ? CHESS_PIECES[type] : '';
            cell.onclick = () => handleChessClick(r, c, container);
            grid.appendChild(cell);
        }
    }
    container.appendChild(grid);

    const turnInfo = document.createElement('div');
    turnInfo.style.cssText = 'margin-top:8px;font-size:0.8rem;color:var(--text-secondary);text-align:center;';
    turnInfo.textContent = `Turn: ${chessTurn === 'white' ? 'White' : 'Black'}`;
    container.appendChild(turnInfo);
}

function handleChessClick(r, c, container) {
    if (gameState.gameOver) return;
    const myColor = chessMyColor;
    const myTurnNow = (chessTurn === myColor) && isMyTurn();
    const piece = chessBoard[r][c];

    if (chessSelected) {
        const move = chessMoves.find(m => m[0] === r && m[1] === c);
        if (move) {
            const from = chessSelected;
            // Auto promotion to Queen for simplicity
            let promo = '';
            if (chessBoard[from.r][from.c].endsWith('P') && (r === 0 || r === 7)) {
                promo = 'Q';
            }
            const moveStr = `${from.r},${from.c},${r},${c},${promo}`;

            applyChessMoveString(moveStr);
            gameState.turn = gameState.opponentName;

            const status = getChessGameStatus(chessTurn);
            if (status !== 'playing') {
                gameState.gameOver = true;
                setTimeout(() => showToast("Game Over: " + status, true), 500);
            }

            setTurnStatus();
            drawChess(container);
            makeGameMove(moveStr);
            return;
        }
        chessSelected = null;
        chessMoves = [];
    }

    if (piece && piece.startsWith(myColor[0]) && myTurnNow) {
        chessSelected = { r, c };
        chessMoves = getFullyLegalMoves(r, c, piece);
    }
    drawChess(container);
}

function applyChessMoveString(moveStr) {
    const parts = moveStr.split(',');
    const fr = Number(parts[0]), fc = Number(parts[1]), tr = Number(parts[2]), tc = Number(parts[3]);
    const promo = parts[4] || '';

    const piece = chessBoard[fr][fc];
    const color = piece[0];
    const type = piece[1];

    if (type === 'P' && fc !== tc && chessBoard[tr][tc] === '') {
        chessBoard[fr][tc] = '';
    }

    chessEnPassant = null;
    if (type === 'P' && Math.abs(fr - tr) === 2) {
        chessEnPassant = { r: (fr + tr) / 2, c: fc };
    }

    if (type === 'K' && Math.abs(fc - tc) === 2) {
        if (tc > fc) {
            chessBoard[fr][tc - 1] = chessBoard[fr][7];
            chessBoard[fr][7] = '';
        } else {
            chessBoard[fr][tc + 1] = chessBoard[fr][0];
            chessBoard[fr][0] = '';
        }
    }

    if (type === 'K') {
        if (color === 'w') { chessCastling.wK = false; chessCastling.wQ = false; }
        else { chessCastling.bK = false; chessCastling.bQ = false; }
    }
    if (type === 'R') {
        if (fr === 7 && fc === 0) chessCastling.wQ = false;
        if (fr === 7 && fc === 7) chessCastling.wK = false;
        if (fr === 0 && fc === 0) chessCastling.bQ = false;
        if (fr === 0 && fc === 7) chessCastling.bK = false;
    }

    chessBoard[tr][tc] = piece;
    chessBoard[fr][fc] = '';

    if (promo) {
        chessBoard[tr][tc] = color + promo;
    }

    chessTurn = chessTurn === 'white' ? 'black' : 'white';
}

function getFullyLegalMoves(r, c, piece) {
    const pseudoMoves = getPseudoLegalMoves(r, c, piece, chessBoard);
    const color = piece[0];
    const legalMoves = [];

    for (const move of pseudoMoves) {
        if (!isMoveExposingKing(r, c, move[0], move[1], color)) {
            legalMoves.push(move);
        }
    }

    if (piece[1] === 'K' && !isKingInCheck(color, chessBoard)) {
        if (color === 'w') {
            if (chessCastling.wK && chessBoard[7][5] === '' && chessBoard[7][6] === '' && !isSquareAttacked(7, 5, 'b', chessBoard) && !isSquareAttacked(7, 6, 'b', chessBoard)) legalMoves.push([7, 6]);
            if (chessCastling.wQ && chessBoard[7][1] === '' && chessBoard[7][2] === '' && chessBoard[7][3] === '' && !isSquareAttacked(7, 2, 'b', chessBoard) && !isSquareAttacked(7, 3, 'b', chessBoard)) legalMoves.push([7, 2]);
        } else {
            if (chessCastling.bK && chessBoard[0][5] === '' && chessBoard[0][6] === '' && !isSquareAttacked(0, 5, 'w', chessBoard) && !isSquareAttacked(0, 6, 'w', chessBoard)) legalMoves.push([0, 6]);
            if (chessCastling.bQ && chessBoard[0][1] === '' && chessBoard[0][2] === '' && chessBoard[0][3] === '' && !isSquareAttacked(0, 2, 'w', chessBoard) && !isSquareAttacked(0, 3, 'w', chessBoard)) legalMoves.push([0, 2]);
        }
    }

    return legalMoves;
}

function getPseudoLegalMoves(row, col, piece, b) {
    const color = piece[0];
    const type = piece[1];
    const moves = [];
    const enemy = color === 'w' ? 'b' : 'w';

    const addIfValid = (tr, tc) => {
        if (tr < 0 || tr > 7 || tc < 0 || tc > 7) return false;
        if (b[tr][tc].startsWith(color)) return false;
        moves.push([tr, tc]);
        return b[tr][tc] === '';
    };
    const slide = (dr, dc) => { let nr = row + dr, nc = col + dc; while (addIfValid(nr, nc)) { nr += dr; nc += dc; } };

    if (type === 'R') { [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (type === 'B') { [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (type === 'Q') { [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([dr, dc]) => slide(dr, dc)); }
    else if (type === 'N') { [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].forEach(([dr, dc]) => addIfValid(row + dr, col + dc)); }
    else if (type === 'K') { [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]].forEach(([dr, dc]) => addIfValid(row + dr, col + dc)); }
    else if (type === 'P') {
        const dir = color === 'w' ? -1 : 1;
        const start = color === 'w' ? 6 : 1;
        if (row + dir >= 0 && row + dir < 8 && b[row + dir][col] === '') {
            moves.push([row + dir, col]);
            if (row === start && b[row + 2 * dir][col] === '') moves.push([row + 2 * dir, col]);
        }
        [-1, 1].forEach(dc => {
            const tc = col + dc;
            if (tc >= 0 && tc < 8 && row + dir >= 0 && row + dir < 8) {
                if (b[row + dir][tc].startsWith(enemy)) {
                    moves.push([row + dir, tc]);
                } else if (chessEnPassant && chessEnPassant.r === (row + dir) && chessEnPassant.c === tc) {
                    moves.push([row + dir, tc]);
                }
            }
        });
    }
    return moves;
}

function isMoveExposingKing(fr, fc, tr, tc, color) {
    const clone = chessBoard.map(row => [...row]);
    const type = clone[fr][fc][1];

    if (type === 'P' && fc !== tc && clone[tr][tc] === '') clone[fr][tc] = ''; // En passant removal
    clone[tr][tc] = clone[fr][fc];
    clone[fr][fc] = '';

    return isKingInCheck(color, clone);
}

function isKingInCheck(color, b) {
    let kr = -1, kc = -1;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) if (b[r][c] === color + 'K') { kr = r; kc = c; break; }
        if (kr !== -1) break;
    }
    if (kr === -1) return false;
    return isSquareAttacked(kr, kc, color === 'w' ? 'b' : 'w', b);
}

function isSquareAttacked(tr, tc, enemyColor, b) {
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const p = b[r][c];
            if (p && p.startsWith(enemyColor)) {
                if (getPseudoLegalMoves(r, c, p, b).some(m => m[0] === tr && m[1] === tc)) return true;
            }
        }
    }
    return false;
}

function getChessGameStatus(turnColor) {
    const colorChar = turnColor[0];
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            if (chessBoard[r][c].startsWith(colorChar)) {
                if (getFullyLegalMoves(r, c, chessBoard[r][c]).length > 0) return 'playing';
            }
        }
    }
    return isKingInCheck(colorChar, chessBoard) ? 'Checkmate' : 'Stalemate';
}

// ── Nuts & Bolts Puzzle (Water Sort Style) ────────────────────────────────

let nabState = null;

function renderNutsAndBolts(container, difficulty = 'hard') {
    container.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:15px;padding:20px;';

    // Difficulty Selectors
    const diffContainer = document.createElement('div');
    diffContainer.style.cssText = 'display:flex;gap:10px;margin-bottom:10px;';
    ['easy', 'medium', 'hard'].forEach(diff => {
        const btn = document.createElement('button');
        btn.textContent = diff.charAt(0).toUpperCase() + diff.slice(1);
        btn.style.cssText = `padding:6px 14px; font-size:0.8rem; border-radius:12px; border:1px solid rgba(255,255,255,0.1); background:${difficulty === diff ? 'var(--primary-color)' : 'rgba(255,255,255,0.05)'}; color:white; cursor:pointer;`;
        btn.onclick = () => renderNutsAndBolts(container, diff);
        diffContainer.appendChild(btn);
    });

    // Status Bar
    const statusBar = document.createElement('div');
    statusBar.id = 'nab-status-bar';
    statusBar.style.cssText = 'font-size:0.9rem;color:var(--text-secondary);display:flex;justify-content:space-between;width:100%;max-width:500px;';

    // Initialization Logic
    let numColors = 12, numBolts = 14;
    if (difficulty === 'easy') { numColors = 6; numBolts = 8; }
    else if (difficulty === 'medium') { numColors = 8; numBolts = 10; }

    const colors = ["#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ffa500", "#800080", "#ffc0cb", "#00ffff", "#32cd32", "#808080", "#a52a2a", "#ff00ff"];
    let allNuts = [];
    for (let i = 0; i < numColors; i++) {
        for (let j = 0; j < 4; j++) allNuts.push(colors[i]);
    }

    // Shuffle
    for (let i = allNuts.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allNuts[i], allNuts[j]] = [allNuts[j], allNuts[i]];
    }

    const board = Array.from({ length: numBolts }, () => []);
    let nutIndex = 0;
    for (let i = 0; i < numColors; i++) {
        for (let j = 0; j < 4; j++) board[i].push(allNuts[nutIndex++]);
    }

    nabState = {
        difficulty: difficulty,
        board: board,
        numBolts: numBolts,
        moves: 0,
        selectedIdx: null,
        hintFrom: null,
        hintTo: null
    };

    const boardDiv = document.createElement('div');
    boardDiv.id = 'nab-board-container';
    boardDiv.style.cssText = 'display:flex; flex-wrap:wrap; justify-content:center; gap:20px; max-width:600px; padding:10px;';

    container.appendChild(diffContainer);
    container.appendChild(statusBar);
    container.appendChild(boardDiv);

    const controls = document.createElement('div');
    controls.innerHTML = `<button onclick="getNabHint()" class="primary-btn" style="padding:6px 14px; font-size:0.8rem;"><i class="fas fa-lightbulb"></i> Hint</button>`;
    container.appendChild(controls);

    drawNabBoard();
}

function drawNabBoard() {
    const container = document.getElementById('nab-board-container');
    if (!container) return;
    container.innerHTML = '';

    const status = document.getElementById('nab-status-bar');
    if (status && !gameState.gameOver) status.innerHTML = `<span>Moves: <b>${nabState.moves}</b></span><span>Click a bolt to move its top nut</span>`;

    nabState.board.forEach((bolt, index) => {
        const boltDiv = document.createElement('div');
        let bgStyle = 'rgba(255,255,255,0.05)';
        let borderStyle = '2px solid transparent';

        if (nabState.selectedIdx === index) {
            bgStyle = 'rgba(124,58,237,0.15)';
            borderStyle = '2px solid var(--primary-color)';
        } else if (nabState.hintFrom === index || nabState.hintTo === index) {
            borderStyle = '2px dashed var(--accent-color)';
        }

        boltDiv.style.cssText = `width:56px; height:180px; background:${bgStyle}; border:${borderStyle}; border-radius:30px; display:flex; flex-direction:column-reverse; align-items:center; padding:5px 0; cursor:pointer; transition:all 0.2s; position:relative; box-shadow:inset 0 10px 20px rgba(0,0,0,0.5); overflow:hidden;`;

        // Stem visual
        const stem = document.createElement('div');
        stem.style.cssText = 'position:absolute; width:12px; height:100%; background:linear-gradient(90deg, #475569, #94a3b8, #475569); z-index:0; top:0;';
        boltDiv.appendChild(stem);

        bolt.forEach((color, i) => {
            const nut = document.createElement('div');
            let transformStr = '';
            if (nabState.selectedIdx === index && i === bolt.length - 1) {
                // levitate top nut when selected
                transformStr = 'translateY(-15px) scale(1.1)';
            }
            nut.style.cssText = `width:46px; height:32px; background-color:${color}; border-radius:6px; margin-top:3px; z-index:1; border:2px solid rgba(0,0,0,0.3); box-shadow:inset 0 4px 6px rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.5); transition:transform 0.2s; transform:${transformStr};`;
            boltDiv.appendChild(nut);
        });

        boltDiv.onclick = () => handleNabClick(index);
        container.appendChild(boltDiv);
    });
}

function handleNabClick(index) {
    if (gameState.gameOver) return;
    if (!isMyTurn()) { showToast("It's not your turn!", true); return; }

    if (nabState.selectedIdx === null) {
        if (nabState.board[index].length > 0) {
            nabState.selectedIdx = index;
            drawNabBoard();
        }
    } else {
        if (nabState.selectedIdx === index) {
            nabState.selectedIdx = null; // deselect
            drawNabBoard();
        } else {
            // Attempt move
            const fromIdx = nabState.selectedIdx;
            const toIdx = index;
            const fromBolt = nabState.board[fromIdx];
            const toBolt = nabState.board[toIdx];

            if (toBolt.length < 4) {
                const topNut = fromBolt[fromBolt.length - 1];
                if (toBolt.length === 0 || toBolt[toBolt.length - 1] === topNut) {
                    // Valid Move
                    toBolt.push(fromBolt.pop());
                    nabState.moves++;
                    nabState.hintFrom = null; nabState.hintTo = null;
                    makeGameMove(`${fromIdx},${toIdx}`);
                    checkNabWin();
                } else {
                    showToast("Colors don't match!", true);
                }
            } else {
                showToast("Bolt is full!", true);
            }
            nabState.selectedIdx = null;
            drawNabBoard();
        }
    }
}

function applyNabMove(moveStr) {
    const [fromIdx, toIdx] = moveStr.split(',').map(Number);
    const fromBolt = nabState.board[fromIdx];
    nabState.board[toIdx].push(fromBolt.pop());
    nabState.moves++;
    drawNabBoard();
    checkNabWin();
}

function checkNabWin() {
    let win = true;
    for (let bolt of nabState.board) {
        if (bolt.length > 0 && bolt.length !== 4) { win = false; break; }
        if (bolt.length === 4) {
            const color = bolt[0];
            if (!bolt.every(c => c === color)) { win = false; break; }
        }
    }
    if (win) {
        gameState.gameOver = true;
        document.getElementById('gameStatusContainer').innerHTML = `<i class="fas fa-trophy" style="color:#fbbf24;margin-right:8px;"></i> 🏆 Puzzle Solved in ${nabState.moves} moves!`;
        showPlayAgainRequest();
    }
}

function getNabHint() {
    if (gameState.gameOver) return;
    for (let i = 0; i < nabState.numBolts; i++) {
        for (let j = 0; j < nabState.numBolts; j++) {
            if (i === j) continue;
            const from = nabState.board[i];
            const to = nabState.board[j];
            if (from.length === 0 || to.length >= 4) continue;

            const topNut = from[from.length - 1];
            if (to.length > 0 && to[to.length - 1] === topNut && to.length < 4) {
                nabState.hintFrom = i; nabState.hintTo = j;
                drawNabBoard();
                setTimeout(() => { nabState.hintFrom = null; nabState.hintTo = null; drawNabBoard(); }, 2000);
                return;
            }
        }
    }
    // Try empty bolt strategy
    for (let i = 0; i < nabState.numBolts; i++) {
        for (let j = 0; j < nabState.numBolts; j++) {
            if (i === j) continue;
            const from = nabState.board[i];
            const to = nabState.board[j];
            if (from.length === 0 || to.length > 0) continue;
            // Only move to empty if fromBolt has mixed colors
            const firstColor = from[0];
            if (!from.every(c => c === firstColor)) {
                nabState.hintFrom = i; nabState.hintTo = j;
                drawNabBoard();
                setTimeout(() => { nabState.hintFrom = null; nabState.hintTo = null; drawNabBoard(); }, 2000);
                return;
            }
        }
    }
    showToast("No obvious single moves left.", false);
}


function resetGameForNewRound(firstPlayerTurn) {
    const gameId = currentGameRoom ? currentGameRoom.split('-')[0] : '';
    if (gameId === 'connect4') {
        gameState.board = Array(6).fill(null).map(() => Array(7).fill(''));
        resetConnect4Board();
    } else if (gameId === 'chess') {
        chessBoard = null;
        initChessBoard();
    } else if (gameId === 'rps') {
        gameState.board = [];
        const result = document.getElementById('rps-result');
        if (result) result.textContent = '';
        document.querySelectorAll('#gameBoard button').forEach(b => {
            b.disabled = false;
            b.style.background = 'rgba(255,255,255,0.07)';
            b.style.borderColor = 'rgba(255,255,255,0.15)';
        });
    } else if (gameId === 'nab') {
        if (nabState) {
            renderNutsAndBolts(document.getElementById('gameBoard'), nabState.difficulty);
        }
    } else {
        gameState.board = Array(9).fill('');
    }

    gameState.gameOver = false;
    currentTurn = firstPlayerTurn || 'X';

    // Attempt re-render if active game is open
    const modal = document.getElementById('activeGameModal');
    if (modal && modal.style.display !== 'none' && gameId) {
        if (gameId === 'tictactoe' || gameId === 'connect4' || gameId === 'rps') {
            renderGameBoard(gameId);
        } else if (gameId === 'chess') {
            renderChessBoard(document.getElementById('gameBoard'));
        } else if (gameId === 'nab') {
            renderNutsAndBolts(document.getElementById('gameBoard'), nabState.size);
        }
        updateGameStatus();
    }
}

function handlePlayAgain(accepted) {
    if (!stompClient || !currentGameRoom) return;
    const action = accepted ? 'PLAY_AGAIN_ACCEPTED' : 'PLAY_AGAIN_DECLINED';
    stompClient.send('/app/game.move', {}, JSON.stringify({
        roomId: currentGameRoom,
        player: Auth.getUser().username,
        action: action
    }));
    if (accepted) {
        resetGameForNewRound(Auth.getUser().username);
        const statusEl = document.getElementById('gameStatusContainer');
        if (statusEl) statusEl.innerHTML = `<i class="fas fa-check" style="margin-right:8px;"></i> Game Reset!`;
    } else {
        const statusEl = document.getElementById('gameStatusContainer');
        if (statusEl) statusEl.innerHTML = `You declined.`;
    }
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
    const icons = { rock: '🪨', paper: '📄', scissors: '✂️' };

    // Determine if this update has the opponent's choice
    if (data.opponentChoice || data.position) {
        // Server broadcasts the move with player + position
        const opponentChoice = data.opponentChoice || data.position;
        // Retrieve my stored choice
        const myChoice = window._myRpsChoice || 'rock';

        // Calculate winner client-side
        let resultText = '';
        if (myChoice === opponentChoice) {
            resultText = '🤝 Draw!';
        } else if (
            (myChoice === 'rock' && opponentChoice === 'scissors') ||
            (myChoice === 'paper' && opponentChoice === 'rock') ||
            (myChoice === 'scissors' && opponentChoice === 'paper')
        ) {
            resultText = '🏆 You Win!';
        } else {
            resultText = '😢 You Lose!';
        }

        el.innerHTML = `
            <div style="font-size:1.1rem;">You: ${icons[myChoice] || '?'} vs Opponent: ${icons[opponentChoice] || '?'}</div>
            <div style="font-size:1.8rem;margin-top:10px;">${resultText}</div>
        `;

        // Re-enable buttons for next round
        setTimeout(() => {
            document.querySelectorAll('#gameBoard button').forEach(b => {
                b.disabled = false;
                b.style.background = 'rgba(255,255,255,0.07)';
                b.style.borderColor = 'rgba(255,255,255,0.15)';
            });
            if (el) el.innerHTML = '';
            window._myRpsChoice = null;
        }, 2500);
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


// Side Chat Logic

let gameChatMode = 'opponent';

function toggleGameChatTarget() {
    const select = document.getElementById('gameChatTypeSelect');
    if (!select) return;
    gameChatMode = select.value;
    loadGameSideMessages();
}

function updateGameSelectToCurrent() {
    const modal = document.getElementById('activeGameModal');
    if (modal && modal.style.display === 'flex') {
        const select = document.getElementById('gameChatTypeSelect');
        if (select) {
            select.value = 'current';
            toggleGameChatTarget();
        }
    }
}

function loadGameSideMessages() {
    const container = document.getElementById('gameChatMessages');
    if (!container) return;
    container.innerHTML = '';

    // Display recent messages based on selected mode
    if (gameChatMode === 'opponent' && gameState.opponentName) {
        const myUsername = Auth.getUser().username;
        fetchApi(`/messages/${myUsername}/${gameState.opponentName}`)
            .then(messages => {
                if (messages && messages.length > 0) {
                    messages.forEach(msg => appendGameChatMessage(msg.sender, msg.content, msg.sender === myUsername));
                }
                container.scrollTop = container.scrollHeight;
            })
            .catch(e => console.error('Failed to load side chat', e));
    } else if (gameChatMode === 'current' && currentChatUser) {
        const myUsername = Auth.getUser().username;
        fetchApi(`/messages/${myUsername}/${currentChatUser.username}`)
            .then(messages => {
                if (messages && messages.length > 0) {
                    messages.forEach(msg => appendGameChatMessage(msg.sender, msg.content, msg.sender === myUsername));
                }
                container.scrollTop = container.scrollHeight;
            })
            .catch(e => console.error('Failed to load side chat', e));
    } else if (gameChatMode === 'current' && currentGroup) {
        fetchApi(`/groups/${currentGroup.id}/messages`)
            .then(messages => {
                if (messages && messages.length > 0) {
                    messages.forEach(msg => {
                        const content = msg.content || msg.message;
                        appendGameChatMessage(msg.sender, content, msg.sender === Auth.getUser().username);
                    });
                }
                container.scrollTop = container.scrollHeight;
            })
            .catch(e => console.error('Failed to load group side chat', e));
    } else {
        container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-secondary); font-size:0.9rem;">
            No active chat selected. Select a chat or group from the sidebar first, or change the dropdown.
        </div>`;
    }
}

function sendGameSideMessage() {
    const input = document.getElementById('gameChatInput');
    const content = input.value.trim();
    if (!content) return;

    if (gameChatMode === 'opponent' && gameState.opponentName) {
        stompClient.send('/app/chat.sendMessage', {}, JSON.stringify({
            sender: Auth.getUser().username,
            receiver: gameState.opponentName,
            content: content
        }));
        appendGameChatMessage(Auth.getUser().username, content, true);
    } else if (gameChatMode === 'current' && currentChatUser) {
        stompClient.send('/app/chat.sendMessage', {}, JSON.stringify({
            sender: Auth.getUser().username,
            receiver: currentChatUser.username,
            content: content
        }));
        appendGameChatMessage(Auth.getUser().username, content, true);
    } else if (gameChatMode === 'current' && currentGroup) {
        stompClient.send(`/app/group.sendMessage/${currentGroup.id}`, {}, JSON.stringify({
            sender: Auth.getUser().username,
            groupId: currentGroup.id,
            content: content
        }));
        // Group messages will echo back via subscription, but we can optimistically render:
        appendGameChatMessage(Auth.getUser().username, content, true);
    } else {
        showToast("No active chat to send to", true);
        return;
    }
    input.value = '';
    const container = document.getElementById('gameChatMessages');
    if (container) setTimeout(() => container.scrollTop = container.scrollHeight, 50);
}

function appendGameChatMessage(sender, text, isMe) {
    const container = document.getElementById('gameChatMessages');
    if (!container) return;
    const div = document.createElement('div');
    const color = isMe ? '#a78bfa' : '#34d399';
    div.style.cssText = `display:flex; flex-direction:column; align-items:${isMe ? 'flex-end' : 'flex-start'}; gap:4px;`;
    div.innerHTML = `
        <span style="font-size:0.75rem; color:${color}; font-weight:700;">${sender}</span>
        <div style="background:${isMe ? 'linear-gradient(135deg, #7c3aed, #6d28d9)' : 'rgba(255,255,255,0.06)'}; color:white; padding:8px 12px; border-radius:${isMe ? '12px 12px 2px 12px' : '12px 12px 12px 2px'}; font-size:0.85rem; max-width:85%; word-break:break-word;">
            ${text}
        </div>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
}

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
        }
    }
});

async function loadCallLogs() {
    try {
        const calls = await fetchApi(`/calls/user/${Auth.getUser().username}`);
        const list = document.getElementById('callsList');
        if (!list) return;

        list.innerHTML = '';
        if (calls.length === 0) {
            list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);"><i class="fas fa-phone-slash fa-2x" style="margin-bottom:10px;opacity:0.5;"></i><br>No recent calls</div>';
            return;
        }

        calls.forEach(call => {
            const isOutgoing = call.callerId === Auth.getUser().username;
            const otherUser = isOutgoing ? call.receiverId : call.callerId;
            const iconColor = isOutgoing ? '#3b82f6' : '#10b981'; // Blue for outgoing, Green for incoming
            const iconFlip = isOutgoing ? '' : 'transform: scaleX(-1);';
            const callDirIcon = `<i class="fas fa-arrow-up" style="color:${iconColor}; font-size: 0.7rem; ${iconFlip}"></i>`;

            // Format duration
            let durationText = "Missed / 0s";
            if (call.duration > 0) {
                const m = Math.floor(call.duration / 60);
                const s = call.duration % 60;
                durationText = m > 0 ? `${m}m ${s}s` : `${s}s`;
            }

            // Format Time
            const dateObj = new Date(call.startTime);
            const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });

            const div = document.createElement('div');
            div.className = 'contact-item';
            div.innerHTML = `
                <div class="avatar" style="background:linear-gradient(135deg, var(--primary), var(--primary-hover))"><i class="fas fa-phone-alt"></i></div>
                <div class="contact-info">
                    <div class="contact-name">
                        <span>${otherUser}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: normal;">${dateStr}</span>
                    </div>
                    <div class="last-msg" style="display:flex; align-items:center; gap:6px;">
                        ${callDirIcon} ${call.callType.toUpperCase()} • ${durationText}
                    </div>
                </div>
            `;
            // Quick call back
            div.onclick = () => {
                selectContact(otherUser);
            };
            list.appendChild(div);
        });
    } catch (e) {
        console.error("Error loading call logs:", e);
    }
}

// ── Profile Settings ──────────────────────────────────────────────────────

function openProfileModal() {
    const user = Auth.getUser();
    if (!user) return;

    document.getElementById('profileUsername').value = user.username;
    document.getElementById('profileDisplayName').value = user.displayName || user.username || '';
    document.getElementById('profileEmail').value = user.email || '';
    document.getElementById('profilePhone').value = user.phone || '';
    document.getElementById('profileAvatarUrl').value = user.avatar || '';
    document.getElementById('profileStatus').value = user.status || '';
    document.getElementById('profilePassword').value = '';

    const preview = document.getElementById('profileAvatarPreview');
    if (user.avatar && user.avatar.startsWith('fas ')) {
        preview.innerHTML = `<i class="${user.avatar}"></i>`;
    } else if (user.avatar) {
        preview.innerHTML = `<img src="${user.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
    } else {
        preview.innerHTML = `<i class="fas fa-user"></i>`;
    }

    document.getElementById('profileModal').style.display = 'flex';
}

function closeProfileModal() {
    const modal = document.getElementById('profileModal');
    if (modal) modal.style.display = 'none';
}

function previewAvatar() {
    const urlValue = document.getElementById('profileAvatarUrl').value.trim();
    const preview = document.getElementById('profileAvatarPreview');
    if (!preview) return;

    if (urlValue.startsWith('fas ')) {
        preview.innerHTML = `<i class="${urlValue}"></i>`;
    } else if (urlValue) {
        preview.innerHTML = `<img src="${urlValue}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" onerror="this.src='https://via.placeholder.com/100?text=Error'">`;
    } else {
        preview.innerHTML = `<i class="fas fa-user"></i>`;
    }
}

async function saveProfileChanges() {
    const username = document.getElementById('profileUsername').value;
    const displayName = document.getElementById('profileDisplayName').value;
    const email = document.getElementById('profileEmail').value;
    const phone = document.getElementById('profilePhone').value;
    const avatar = document.getElementById('profileAvatarUrl').value;
    const status = document.getElementById('profileStatus').value;
    const password = document.getElementById('profilePassword').value;

    const payload = { username, displayName, email, phone, avatar, status };
    if (password) payload.password = password;

    try {
        const updatedUser = await fetchApi('/users/profile', 'PUT', payload);
        if (updatedUser) {
            const currentUser = Auth.getUser();
            Object.assign(currentUser, updatedUser);
            localStorage.setItem('chat_user', JSON.stringify(currentUser));

            document.getElementById('currentUserName').textContent = currentUser.displayName || currentUser.username;
            const avatarEl = document.getElementById('currentUserAvatar');
            if (currentUser.avatar && currentUser.avatar.startsWith('fas ')) {
                avatarEl.innerHTML = `<i class="${currentUser.avatar}"></i>`;
            } else if (currentUser.avatar) {
                avatarEl.innerHTML = `<img src="${currentUser.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                avatarEl.innerHTML = `<i class="fas fa-user"></i>`;
            }

            showToast("Profile updated successfully!");
            closeProfileModal();
            loadUsers();
        }
    } catch (e) {
        showToast("Failed to update profile: " + e.message, true);
    }
}

async function handleProfilePhotoUpload(input) {
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];
    const formData = new FormData();
    formData.append('file', file);

    // Quick preview
    const preview = document.getElementById('profileAvatarPreview');
    const reader = new FileReader();
    reader.onload = (e) => {
        preview.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; opacity:0.6;">`;
    };
    reader.readAsDataURL(file);

    try {
        const token = Auth.getToken();
        const profileUploadBase = (typeof BACKEND_URL !== 'undefined' && BACKEND_URL && !BACKEND_URL.includes('YOUR-RENDER')) ? BACKEND_URL : '';
        const response = await fetch(profileUploadBase + '/api/upload', {
            method: 'POST',
            headers: token ? { Authorization: 'Bearer ' + token } : {},
            body: formData
        });
        if (!response.ok) throw new Error('Upload failed');
        const result = await response.json();

        if (result.url) {
            document.getElementById('profileAvatarUrl').value = result.url;
            preview.innerHTML = `<img src="${result.url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            showToast('Photo uploaded successfully');
        }
    } catch (e) {
        showToast('Error uploading photo', true);
        preview.innerHTML = `<i class="fas fa-user"></i>`;
    }
}

function toggleRightPane() {
    const pane = document.getElementById('rightProfilePane');
    if (pane.style.display === 'none') {
        pane.style.display = 'flex';
    } else {
        pane.style.display = 'none';
    }
}

function toggleChatMenu() {
    const menu = document.getElementById('chatDropdownMenu');
    if (menu.style.display === 'none') {
        menu.style.display = 'flex';
    } else {
        menu.style.display = 'none';
    }
}

// Close dropdown if clicked outside
document.addEventListener('click', function (e) {
    const dropdown = document.querySelector('.dropdown-container');
    const menu = document.getElementById('chatDropdownMenu');
    if (menu && dropdown && !dropdown.contains(e.target)) {
        menu.style.display = 'none';
    }
});

function focusSearch() {
    const searchInput = document.getElementById('chatSearchInput');
    if (searchInput) {
        searchInput.focus();
        searchInput.style.border = '1px solid var(--primary)';
        setTimeout(() => {
            searchInput.style.border = '1px solid var(--glass-border)';
        }, 2000);
    }
}

async function clearActiveChat() {
    const user = Auth.getUser();
    if (!user) return;

    let targetName = "";
    let clearUrl = "";

    if (currentGroup) {
        targetName = currentGroup.name;
        clearUrl = `/groups/clear/${currentGroup.id}`; // Handled separately or redirected
        showToast("Clearing group history is not yet supported", true);
        return;
    } else if (currentChatUser) {
        targetName = currentChatUser.displayName || currentChatUser.username;
        clearUrl = `/messages/clear/${user.username}/${currentChatUser.username}`;
    } else {
        return;
    }

    if (!confirm(`Are you sure you want to clear all messages with ${targetName}?`)) return;

    try {
        await fetchApi(clearUrl, 'DELETE');
        showToast(`Chat with ${targetName} cleared`);
        document.getElementById('messagesContainer').innerHTML = "";
    } catch (e) {
        showToast("Error clearing chat: " + e.message, true);
    }
}

// ── Group Management ──────────────────────────────────────────────────────

async function addGroupMemberPrompt() {
    if (!currentGroup) return;
    const usernamesStr = prompt("Enter usernames to add (comma separated):");
    if (!usernamesStr) return;

    const usernames = usernamesStr.split(',').map(u => u.trim()).filter(u => u);
    if (usernames.length === 0) return;

    try {
        const updatedGroup = await fetchApi(`/groups/${currentGroup.id}/members`, 'POST', usernames);
        showToast(`Added ${usernames.length} members to ${currentGroup.name}`);

        // Update current group state
        currentGroup = updatedGroup;
        document.getElementById('activeStatus').textContent = `${(updatedGroup.members || []).length} members`;
    } catch (e) {
        showToast("Failed to add members: " + e.message, true);
    }
}
