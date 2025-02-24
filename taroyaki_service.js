const config = {
    clientId: "76pqubnjqg6o5ng1l3235j27sl",
    clientSecret: "1l33vpl1rqj8ibbiae4pd2tslgu5hchp54cgg6f7n89affpccc9j",
    domain: "https://us-east-1ofs2k3zki.auth.us-east-1.amazoncognito.com",
    redirectUri: "https://dje3vsz99xjr1.cloudfront.net/index.html",
    authEndpoint: "https://idqujgb116.execute-api.us-east-1.amazonaws.com/product/userinfo",
    restEndpoint: "https://blgg29wto5.execute-api.us-east-1.amazonaws.com/product",
    wsEndpoint: "wss://tt0ikgb3sd.execute-api.us-east-1.amazonaws.com/production/",
    logoutRedirectUri: "https://dje3vsz99xjr1.cloudfront.net/index.html",
    tokenRefreshThreshold: 5 * 60
};

let userId;
let isWaitingForResponse = false;
let isInputFocused = false;
let typingAnimation = null;
let refreshTimer = null;
let isEmptySession = false;
let sessionToDelete = null;
let currentSessionId = null;
let socket = null;
let sessionLoadingAnimation = null;


function handleLogin() {
    const loginUrl = `${config.domain}/login?response_type=code&client_id=${config.clientId}&redirect_uri=${config.redirectUri}`;
    window.location.href = loginUrl;
}

async function getToken(authCode) {
    const headers = new Headers({
        'Authorization': 'Basic ' + btoa(config.clientId + ':' + config.clientSecret),
        'Content-Type': 'application/x-www-form-urlencoded'
    });

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authCode,
        redirect_uri: config.redirectUri
    });

    const response = await fetch(`${config.domain}/oauth2/token`, {
        method: 'POST',
        headers,
        body
    });

    const data = await response.json();
    
    // 모든 토큰을 저장
    localStorage.setItem('auth_token', data.id_token);
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    
    return data;
}

async function getUserInfo(token) {
    // API 호출 전 토큰 유효성 확인 및 갱신
    await ensureValidToken();
    
    // 갱신된 토큰으로 API 호출
    const currentToken = localStorage.getItem('auth_token');
    const response = await fetch(config.authEndpoint, {
        headers: { Authorization: currentToken }
    });
    const userData = await response.json();
    return JSON.parse(userData.body);
}

async function handleAuthenticationFlow() {

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');

        if (!authCode) return;

        const tokenData = await getToken(authCode);
        const token = tokenData.id_token;
        localStorage.setItem('auth_token', token);

        const loginbutton = document.getElementById('LoginBtn');
        loginbutton.style.display = "none";
        showSessionLoadingIndicator();

        const userInfo = await getUserInfo(token);
        console.log('userInfo:', userInfo)
        document.getElementById('userinfo1').innerText = 
            `${userInfo.email}`;
            document.getElementById('userinfo2').innerText = 
            `${userInfo.email}`;
        updateProfileButton(userInfo);
        
    } catch (error) {
        console.error('Authentication error:', error);
        document.getElementById('userinfo').innerText = 'Error fetching user info.';
    }
}

function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(c => {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error('Token parsing failed:', e);
        return null;
    }
}

function isTokenExpired(token) {
    if (!token) return true;
    
    const parsed = parseJwt(token);
    if (!parsed) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return parsed.exp <= currentTime;
}

function needsRefresh(token) {
    if (!token) return true;
    
    const parsed = parseJwt(token);
    if (!parsed) return true;
    
    const currentTime = Math.floor(Date.now() / 1000);
    return parsed.exp - currentTime <= config.tokenRefreshThreshold;
}

async function refreshTokens(refreshToken) {
    try {
        const headers = new Headers({
            'Authorization': 'Basic ' + btoa(config.clientId + ':' + config.clientSecret),
            'Content-Type': 'application/x-www-form-urlencoded'
        });

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
            client_id: config.clientId
        });

        const response = await fetch(`${config.domain}/oauth2/token`, {
            method: 'POST',
            headers,
            body
        });

        if (!response.ok) {
            throw new Error('Token refresh failed');
        }

        const data = await response.json();
        
        // 새로운 토큰들을 저장
        localStorage.setItem('auth_token', data.id_token);
        localStorage.setItem('access_token', data.access_token);
        // refresh_token이 새로 발급된 경우에만 저장
        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }

        return data;
    } catch (error) {
        console.error('Token refresh failed:', error);
        // 갱신 실패 시 로그아웃 처리
        handleLogout();
        throw error;
    }
}

async function ensureValidToken() {
    const idToken = localStorage.getItem('auth_token');
    const refreshToken = localStorage.getItem('refresh_token');
    const loginbutton=document.getElementById('LoginBtn')

    if (!idToken || !refreshToken) {
        throw new Error('No tokens available');
    }

    if (isTokenExpired(idToken)) {
        // 토큰이 만료된 경우 갱신 시도
        await refreshTokens(refreshToken);
    } else if (needsRefresh(idToken)) {
        // 만료가 임박한 경우 갱신 시도
        try {
            await refreshTokens(refreshToken);
        } catch (error) {
            // 갱신 실패했지만 현재 토큰이 아직 유효한 경우 계속 진행
            if (!isTokenExpired(idToken)) {
                console.warn('Token refresh failed, but current token is still valid');
            } else {
                throw error;
            }
        }
    }
}

function handleLogout() {
    // 모든 토큰 제거
    localStorage.removeItem('auth_token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('userId')
    
    const userinfoElement = document.getElementById('userinfo');
    if (userinfoElement) {
        userinfoElement.innerText = '';
    }
    
    const logoutUrl = `${config.domain}/logout?client_id=${config.clientId}&logout_uri=${encodeURIComponent(config.logoutRedirectUri)}`;
    window.location.href = logoutUrl;
}

function initializeProfileModal() {
    const profileModal = document.getElementById("profileModal");
    const profileBtn = document.getElementById("ProfileBtn");
    
    if (profileModal && profileBtn) {
        profileBtn.onclick = function() {
            // 현재 모달의 표시 상태 확인
            const isModalVisible = profileModal.style.display === "block";
            // 현재 상태의 반대로 토글
            profileModal.style.display = isModalVisible ? "none" : "block";
        }
    }

    // 기존의 window onclick 핸들러 수정
    window.onclick = function(event) {
        const settingsModal = document.getElementById("settingsModal");
        const profileModal = document.getElementById("profileModal");
        const profileBtn = document.getElementById("ProfileBtn");

        if (!profileBtn.contains(event.target) && !profileModal.querySelector('.modalB-content').contains(event.target)) {
            profileModal.style.display = "none";
        }
        
        if (event.target == settingsModal) {
            settingsModal.style.display = "none";
        }
    }
}

function updateProfileButton(userInfo) {
    const profileButton = document.getElementById('ProfileBtn');
    if (profileButton && userInfo.nickname) {
        profileButton.textContent = userInfo.nickname.charAt(0).toUpperCase();
    }    
}

function displayWelcomeMessage() {
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = '<div class="message ai-message"><div class="message-content">어떤 이야기를 하고 싶나요?</div></div>';
}

async function connectWebSocket() {
    const accessToken = localStorage.getItem('access_token');
    if (!accessToken || !userId || !currentSessionId) {
        console.error('Missing required parameters for WebSocket connection');
        throw new Error('WebSocket connection failed: Missing parameters');
    }

    const wsUrl = `${config.wsEndpoint}?token=${accessToken}&userId=${userId}&sessionId=${currentSessionId}`;
    console.log('Attempting to connect WebSocket with URL:', wsUrl);
    
    if (socket) {
        socket.close();
    }

    socket = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
        socket.onopen = function() {
            console.log('WebSocket connected for session:', currentSessionId);
            resolve();
        };

        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            handleIncomingMessage(data);
        };

        socket.onclose = function(event) {
            console.log('WebSocket closed:', event.code, event.reason);
        };

        socket.onerror = function(error) {
            console.error('WebSocket error:', error);
            reject(error);
        };

        // 연결 타임아웃 설정
        const timeout = setTimeout(() => {
            socket.close();
            reject(new Error('WebSocket connection timeout'));
        }, 5000); // 5초 타임아웃

        socket.onopen = function() {
            clearTimeout(timeout);
            console.log('WebSocket connected for session:', currentSessionId);
            resolve();
        };
    });
}

async function startNewChat() {
    if (socket) {
        socket.close();
    }
    
    if (currentSessionId) {
        await disconnectCurrentSession();
    }

    currentSessionId = null;
    
    document.getElementById('chatBox').innerHTML = 
        '<div class="message ai-message temporary-welcome"><div class="message-content">어떤 이야기를 하고 싶나요?</div></div>';
    
    try {
        const idToken = localStorage.getItem('auth_token');  // idToken 가져오기
        if (!idToken) {
            throw new Error('No auth token available');
        }

        // API 호출 전 토큰 유효성 확인
        await ensureValidToken();
        
        console.log('Creating new session for userId:', userId);
        const response = await fetch(`${config.restEndpoint}/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            credentials: 'include',
            body: JSON.stringify({ userId: userId })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('New session created:', result);
        
        if (result.sessionId) {
            currentSessionId = result.sessionId;
            await fetchSessions(userId); 

            if (result.welcomeMessage) {
                const tempWelcome = document.querySelector('.temporary-welcome');
                if (tempWelcome) {
                    tempWelcome.remove();
                }
                appendMessage('ai', result.welcomeMessage);
            }

            isEmptySession = true;
            updateNewChatButtonState();

            console.log('Attempting WebSocket connection...');
            await connectWebSocket();
            console.log('WebSocket connection established');
        } else {
            throw new Error('Session ID not received from server');
        }
    } catch (error) {
        console.error('Error in startNewChat:', error);
        enableInput();
    }
}

async function createAndConnectNewSession(initialMessage) {
    try {
        const response = await fetch(`${config.restEndpoint}/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ userId: userId })
        });
        const result = await response.json();
        
        if (response.ok) {
            currentSessionId = result.sessionId;
            document.getElementById('chatBox').innerHTML = '';
            fetchSessions(userId);

            if (result.welcomeMessage) {
                appendMessage('ai', result.welcomeMessage);
            }

            // 새 세션은 빈 세션으로 시작
            isEmptySession = true;
            updateNewChatButtonState();

            await connectWebSocket();

            if (initialMessage) {
                sendMessageToCurrentSession(initialMessage);
            }
        } else {
            console.error('Error creating new session:', result.error);
            appendMessage('ai', '세션 생성에 실패했어요. 증상이 계속되면 제작자에게 문의해주세요.')
        }
    } catch (error) {
        console.error('Error creating new session:', error);
        appendMessage('ai', '세션 생성에 실패했어요. 증상이 계속되면 제작자에게 문의해주세요.')
    }
}

function sendMessageToCurrentSession(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
    }
    appendMessage('user', message);
    
    // 메시지를 보내면 더 이상 빈 세션이 아님
    isEmptySession = false;
    updateNewChatButtonState();
    
    const payload = {
        action: 'sendMessage',
        message: message,
        userId: userId,
        sessionId: currentSessionId
    };
    socket.send(JSON.stringify(payload));
}

async function fetchSessions(userId) {
    if (!userId) {
        console.error('User ID is required to fetch sessions');
        return;
    }

    try {
        const token = localStorage.getItem('auth_token');
        if (!token) {
            console.error('No auth token available');
            return;
        }

        // API 호출 전 토큰 유효성 확인
        await ensureValidToken();
        
        const response = await fetch(`${config.restEndpoint}/sessions?userId=${userId}`, {
            method: 'GET',
            headers: {
                'Authorization': localStorage.getItem('auth_token'),
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const sessions = await response.json();
        hideSessionLoadingIndicator();
        displaySessions(sessions);
        return sessions;
    } catch (error) {
        console.error('Error fetching sessions:', error);
        hideSessionLoadingIndicator();
        if (error.message.includes('token')) {
            handleLogout();
        }
    }
}

function displaySessions(sessions) {
    const sessionList = document.getElementById('sessionList');
    if (!sessionList) return;
    
    // 이벤트 위임을 위한 단일 이벤트 리스너
    if (!sessionList.hasEventListener) {
        sessionList.addEventListener('click', handleSessionClick);
        sessionList.hasEventListener = true;
    }
    
    sessionList.innerHTML = '';
    
    sessions.forEach(session => {
        const sessionElement = document.createElement('div');
        sessionElement.className = 'session-item';
        sessionElement.setAttribute('data-session-id', session.SessionId);
        sessionElement.setAttribute('role', 'button');
        sessionElement.setAttribute('tabindex', '0');  // 키보드 접근성 추가
        
        const sessionName = document.createElement('span');
        sessionName.textContent = session.SessionName;
        sessionName.className = 'session-name';
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.setAttribute('data-action', 'delete');
        deleteButton.setAttribute('aria-label', 'Delete session');
        
        sessionElement.appendChild(sessionName);
        sessionElement.appendChild(deleteButton);
        
        if (session.SessionId === currentSessionId) {
            sessionElement.classList.add('active');
        }
        
        sessionList.appendChild(sessionElement);
    });
}

function handleSessionClick(event) {
    const sessionElement = event.target.closest('.session-item');
    if (!sessionElement) return;
    
    const deleteButton = event.target.closest('[data-action="delete"]');
    if (deleteButton) {
        event.stopPropagation();
        const sessionId = sessionElement.getAttribute('data-session-id');
        showDeleteModal(sessionId);
        return;
    }
    
    const sessionId = sessionElement.getAttribute('data-session-id');
    if (sessionId && sessionId !== currentSessionId) {
        // 중복 클릭 방지
        if (sessionElement.classList.contains('loading')) return;
        
        sessionElement.classList.add('loading');
        loadSession(sessionId).finally(() => {
            sessionElement.classList.remove('loading');
        });
    }
}

const sessionstyle = document.createElement('style');
sessionstyle.textContent = `
    .session-item {
        cursor: pointer;
        position: relative;
    }
    
    .session-item.loading {
        pointer-events: none;
        opacity: 0.7;
    }
    
    .session-name {
        display: block;
        width: calc(100% - 30px);
    }
`;
document.head.appendChild(sessionstyle);

async function deleteSession() {
    if (!sessionToDelete) return;

    try {
        // 1. UI에서 해당 세션 아이템 즉시 제거
        const sessionElement = document.querySelector(`.session-item[data-session-id="${sessionToDelete}"]`);
        if (sessionElement) {
            sessionElement.remove();
        }

        // 2. 현재 세션이 삭제되는 세션인 경우 채팅창 초기화
        if (currentSessionId === sessionToDelete) {
            currentSessionId = null;
            document.getElementById('chatBox').innerHTML = '';
            displayWelcomeMessage();
        }

        // 3. 토큰 유효성 확인
        await ensureValidToken();
        const idToken = localStorage.getItem('auth_token');
        
        // 4. 백엔드에서 세션 삭제 처리
        const response = await fetch(`${config.restEndpoint}/sessions/${sessionToDelete}?userId=${userId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${idToken}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('Failed to delete session');
        }

        // 5. 세션 목록 새로고침 (백그라운드에서 수행)
        fetchSessions(userId).catch(error => {
            console.error('Error refreshing sessions:', error);
        });

    } catch (error) {
        console.error('Error deleting session:', error);
        
        // 6. 에러 발생 시 세션 목록 다시 불러와서 실제 상태 반영
        await fetchSessions(userId);
        
        // 7. 사용자에게 에러 알림
        alert('세션 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
        // 8. 모달 닫기 및 삭제할 세션 ID 초기화
        closeDeleteModal();
        sessionToDelete = null;
    }
}

async function disconnectCurrentSession() {
    if (socket) {
        socket.close();
        
        try {
            // 1. 세션의 대화 내역 가져오기
            const response = await fetch(`${config.restEndpoint}/sessions/${currentSessionId}?userId=${userId}`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error('Failed to fetch session data');
            }
            
            const messages = await response.json();
            
            // 2. 빈 대화 확인 (메시지가 하나이고 초기 AI 메시지만 있는 경우)
            if (Array.isArray(messages) && 
                messages.length === 1 && 
                messages[0].type === 'ai' && 
                messages[0].content === "어떤 이야기를 하고 싶나요?") {
                    
                // 3. 세션 삭제
                console.log('Empty session deleted.')
                const deleteResponse = await fetch(`${config.restEndpoint}/sessions/${currentSessionId}?userId=${userId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete empty session');
                }
                
                // 4. 세션 목록 새로고침
                await fetchSessions(userId);
            }
        } catch (error) {
            console.error('Error handling session disconnect:', error);
        }
    }
}

async function loadSession(sessionId) {
    if (currentSessionId === sessionId) {
        return;
    }

    // 이전 active 클래스 제거
    const previousActive = document.querySelector('.session-item.active');
    if (previousActive) {
        previousActive.classList.remove('active');
    }

    if (currentSessionId) {
        await disconnectCurrentSession();
    }

    currentSessionId = sessionId;

    try {
        const idToken = localStorage.getItem('auth_token');
        if (!idToken) {
            console.error('No auth token available');
            return;
        }

        await ensureValidToken();
        
        const response = await fetch(`${config.restEndpoint}/sessions/${sessionId}?userId=${userId}`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        const messages = await response.json();
        
        isEmptySession = checkEmptySession(messages);
        updateNewChatButtonState();

        if (!Array.isArray(messages)) {
            console.error('Unexpected response format');
            return;
        }

        if (messages.length === 0) {
            displayWelcomeMessage();
        } else {
            displayMessages(messages);
        }

        // WebSocket 연결 시도
        await connectWebSocket();

        // WebSocket 연결이 성공한 후에만 active 클래스 추가
        const newActive = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
        if (newActive) {
            newActive.classList.add('active');
        }

    } catch (error) {
        console.error('Error loading session:', error);
        // 에러 발생 시 currentSessionId 롤백
        currentSessionId = null;
    }
}

function checkEmptySession(messages) {
    return Array.isArray(messages) && 
           messages.length === 1 && 
           messages[0].type === 'ai' && 
           messages[0].content === "어떤 이야기를 하고 싶나요?";
}

function updateSessionName(newName) {
    const sessionElement = document.querySelector(`.session-item[data-session-id="${currentSessionId}"]`);
    if (sessionElement) {
        const sessionNameSpan = sessionElement.querySelector('span');
        if (sessionNameSpan) {
            sessionNameSpan.textContent = newName;
        }
    }
}

function updateNewChatButtonState() {
    const newChatButton = document.getElementById('newChatButton');
    const collapsedNewChatBtn = document.getElementById('collapsedNewChatBtn');
    
    if (isEmptySession) {
        newChatButton.disabled = true;
        newChatButton.classList.add('disabled');
        collapsedNewChatBtn.disabled = true;
        collapsedNewChatBtn.classList.add('disabled');
    } else {
        newChatButton.disabled = false;
        newChatButton.classList.remove('disabled');
        collapsedNewChatBtn.disabled = false;
        collapsedNewChatBtn.classList.remove('disabled');
    }
}

function showDeleteModal(sessionId) {
    sessionToDelete = sessionId;
    const modal = document.getElementById('deleteSessionModal');
    modal.style.display = 'block';
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteSessionModal');
    modal.style.display = 'none';
    sessionToDelete = null;
}

function handleSidebarDisplay() {
    const sidebar = document.getElementById('sidebar');
    const collapsedSidebar = document.getElementById('collapsedSidebar');
    
    if (window.innerWidth < 1000) {
        sidebar.style.display = 'none';
        collapsedSidebar.style.display = 'flex';
    }
}

function handleIncomingMessage(data) {
    if (data.type === 'stream') {
        const content = extractContent(data.content);
        const lastMessage = document.querySelector('.message:first-child');
        
        if (lastMessage && lastMessage.classList.contains('ai-message')) {
            const contentDiv = lastMessage.querySelector('.message-content');
            if (contentDiv) {
                contentDiv.innerHTML += content.replace(/\n/g, '<br>');
            } else {
                hideTypingIndicator();
                appendMessage('ai', content);
            }
        } else {
            hideTypingIndicator();
            appendMessage('ai', content);
        }

        scrollToBottom();
    } else if (data.type === 'end') {
        hideTypingIndicator();
        console.log('Stream ended');
        scrollToBottom();
        enableInput();
    } else if (data.type === 'error') {
        hideTypingIndicator();
        console.error('Error:', data.message);
        enableInput();
    } else if (data.type === 'session_name_update') {
        updateSessionName(data.name);
    }
}

function displayMessages(messages) {
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = '';
    messages.forEach((message, index) => {
        const role = message.type === 'human' ? 'user' : 'ai';
        let content = message.content;
        if (content) {
            appendMessage(role, content);
        }
    });
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    if (message && !isWaitingForResponse) {
        disableInput();
        if (!currentSessionId) {
            await createAndConnectNewSession(message);
        } else {
            sendMessageToCurrentSession(message);
        }
        showTypingIndicator();
        messageInput.value = '';
    }
}

function appendMessage(sender, message) {
    const chatBox = document.getElementById('chatBox');

    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.innerHTML = message.replace(/\n/g, '<br>');
    
    messageElement.appendChild(contentElement);
    
    chatBox.insertBefore(messageElement, chatBox.firstChild);
    scrollToBottom();
}

function scrollToBottom() {
    const chatBox = document.getElementById('chatBox');
    chatBox.scrollTop = chatBox.scrollHeight;
}

function disableInput() {
    document.getElementById('messageInput').disabled = true;
    document.getElementById('SendButton').disabled = true;
    isWaitingForResponse = true;
}

function enableInput() {
    document.getElementById('messageInput').disabled = false;
    document.getElementById('SendButton').disabled = false;
    isWaitingForResponse = false;
}

function updateInputAreaStyle() {
    const messageInput = document.getElementById('messageInput');
    const inputArea = document.getElementById('inputArea');
    const sendButton = document.getElementById('SendButton');

    if (messageInput.value.trim() === '') {
        sendButton.classList.add('disabled');
        sendButton.disabled = true;
        
        if (!isInputFocused) {
            inputArea.classList.add('disabled');
        } else {
            inputArea.classList.remove('disabled');
        }
    } else {
        inputArea.classList.remove('disabled');
        sendButton.classList.remove('disabled');
        sendButton.disabled = false;
    }
}

function extractContent(contentData) {
    if (typeof contentData === 'string') {
        return contentData;
    } else if (typeof contentData === 'object' && contentData !== null) {
        return contentData.content || JSON.stringify(contentData);
    }
    return JSON.stringify(contentData);
}

function showTypingIndicator() {
    // 기존 인디케이터가 있다면 제거
    const existingIndicator = document.querySelector('.typing-indicator');
    if (existingIndicator) {
        existingIndicator.remove();
    }

    const chatBox = document.getElementById('chatBox');
    const indicatorContainer = document.createElement('div');
    indicatorContainer.className = 'message ai-message typing-indicator visible';
    
    // 첫 번째 메시지(가장 최근 메시지) 찾기
    const firstMessage = chatBox.firstChild;
    
    // 첫 번째 메시지 이전에 인디케이터 삽입
    if (firstMessage) {
        chatBox.insertBefore(indicatorContainer, firstMessage);
    } else {
        chatBox.appendChild(indicatorContainer);
    }

    // Lottie 애니메이션 로드
    typingAnimation = lottie.loadAnimation({
        container: indicatorContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'https://lottie.host/e15076d7-141c-418d-bb17-02e547264ea0/IkeGLKFkDC.json'
    });
}

function hideTypingIndicator() {
    if (typingAnimation) {
        typingAnimation.destroy();
        typingAnimation = null;
    }
    
    const indicator = document.querySelector('.typing-indicator');
    if (indicator) {
        indicator.remove();
    }
}

function showSessionLoadingIndicator() {
    const sessionList = document.getElementById('sessionList');
    
    // 기존 컨텐츠를 임시로 숨김
    sessionList.style.opacity = '0';
    
    // 로딩 컨테이너 생성
    const loadingContainer = document.createElement('div');
    loadingContainer.id = 'sessionLoadingIndicator';
    loadingContainer.style.position = 'absolute';
    loadingContainer.style.left = '20px';
    loadingContainer.style.top = '212px';  //titlebox(80px) + newChatButton (55px) + 상단 마진(16px) + 하단 마진(16px) + 구분선 높이(1px) + 마진(14px)
    loadingContainer.style.width = '327px';
    loadingContainer.style.mixBlendMode = 'multiply';
    
    // 컨테이너를 sessionList 앞에 삽입
    sessionList.parentNode.insertBefore(loadingContainer, sessionList);
    
    // Lottie 애니메이션 로드
    sessionLoadingAnimation = lottie.loadAnimation({
        container: loadingContainer,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'https://lottie.host/2120a1f0-3fda-4cb2-8270-184bb0dde94e/dRqDNWoeF2.json'
    });
}

function hideSessionLoadingIndicator() {
    if (sessionLoadingAnimation) {
        sessionLoadingAnimation.destroy();
        sessionLoadingAnimation = null;
    }
    
    const loadingIndicator = document.getElementById('sessionLoadingIndicator');
    if (loadingIndicator) {
        loadingIndicator.remove();
    }
    
    // 세션 리스트 다시 표시
    const sessionList = document.getElementById('sessionList');
    sessionList.style.opacity = '1';
}

function initializeSidebarControls() {
    const sidebar = document.getElementById('sidebar');
    const collapsedSidebar = document.getElementById('collapsedSidebar');
    const collapseBtn = document.getElementById('collapseBtn');
    const expandBtn = document.getElementById('expandBtn');
    const newchatBtn=document.getElementById('newChatButton');
    const collapsedNewChatBtn = document.getElementById('collapsedNewChatBtn');
    const collapsedSettingsBtn = document.getElementById('collapsedSettingsBtn');

    // 초기 로드 시 화면 크기에 따른 사이드바 상태 설정
    handleSidebarDisplay();

    // 윈도우 크기 변경 이벤트 리스너 추가
    window.addEventListener('resize', handleSidebarDisplay);

    if (collapseBtn && sidebar && collapsedSidebar) {
        collapseBtn.addEventListener('click', () => {
            sidebar.style.display = 'none';
            collapsedSidebar.style.display = 'flex';
        });
    }

    if (expandBtn && sidebar && collapsedSidebar && window.innerWidth >= 1000) {
        expandBtn.addEventListener('click', () => {
            sidebar.style.display = 'flex';
            collapsedSidebar.style.display = 'none';
        });
    }

    if (newchatBtn) {
        newchatBtn.addEventListener('click', startNewChat);
    }

    if (collapsedNewChatBtn) {
        collapsedNewChatBtn.addEventListener('click', startNewChat);
    }

    if (collapsedSettingsBtn) {
        collapsedSettingsBtn.addEventListener('click', () => {
            const settingsBtn = document.getElementById('Settings');
            if (settingsBtn) settingsBtn.click();
        });
    }
}

function initializeEventListeners() {
    document.getElementById('LoginBtn')?.addEventListener('click', handleLogin);    
    document.getElementById('logoutbtn')?.addEventListener('click', handleLogout);

    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('SendButton');
    if (messageInput && sendButton) {
            // Message input and send button listeners
            console.log('window.ENV:', window.ENV);
            messageInput.addEventListener('input', updateInputAreaStyle);
            messageInput.addEventListener('keypress', function(e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                }
            });
            
            isInputFocused = false;
            updateInputAreaStyle();

            messageInput.addEventListener('focus', () => {
                isInputFocused = true;
                updateInputAreaStyle();
            });
    
            messageInput.addEventListener('blur', () => {
                isInputFocused = false;
                updateInputAreaStyle();
            });
    
            sendButton.addEventListener('click', sendMessage);
        }
    
    //profile modal
    initializeProfileModal();
    
    // Settings Modal
    const settingsModal = document.getElementById('settings');
    const settingsBtn = document.getElementById('SettingsButton');
    const collapsedSettingsBtn = document.getElementById('collapsedSettingsBtn');
    const settingsCloseButtons = document.querySelectorAll('.settingsclose');
    const profileModal = document.getElementById('profileModal');

    function closeProfileModal() {
        if (profileModal) {
            profileModal.style.display = 'none';
        }
    }

    function openSettingsModal() {
        if (settingsModal) {
            closeProfileModal(); // 설정 모달을 열 때 프로필 모달 닫기
            settingsModal.style.display = 'block';
        }
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', openSettingsModal);
    }

    if (collapsedSettingsBtn) {
        collapsedSettingsBtn.addEventListener('click', openSettingsModal);
    }

    settingsCloseButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (settingsModal) settingsModal.style.display = 'none';
        });
    });

    // Delete Session Modal
    const deleteModal = document.getElementById('deleteSessionModal');
    if (deleteModal) {
        const closeBtn = deleteModal.querySelector('.close');
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');

        if (closeBtn) closeBtn.onclick = closeDeleteModal;
        if (confirmBtn) confirmBtn.onclick = deleteSession;
        if (cancelBtn) cancelBtn.onclick = closeDeleteModal;
    }
    
    // Global click handler for modals
    window.onclick = function(event) {
        const settingsModal = document.getElementById("settings");
        const profileModal = document.getElementById("profileModal");
        const profileBtn = document.getElementById("ProfileBtn");
        const deleteModal = document.getElementById('deleteSessionModal');

         /// 설정 모달 외부 클릭 처리
        if (settingsModal && event.target === settingsModal) {
            const modalContent = settingsModal.querySelector('.modalA-content');
            // 클릭된 요소가 모달 콘텐츠 영역 외부인 경우에만 모달 닫기
            if (!modalContent.contains(event.target)) {
                settingsModal.style.display = "none";
            }
        }
        
        // ProfileBtn이나 profileModal의 내부를 클릭한 경우가 아닐 때만 모달을 닫음
        if (!profileBtn.contains(event.target) && !profileModal.querySelector('.modalB-content').contains(event.target)) {
            profileModal.style.display = "none";
        }

        if (event.target === deleteModal) {
            closeDeleteModal();
        }
    }

    // Initialize sidebar controls
    initializeSidebarControls();
}

async function initializePage() {
    initializeEventListeners();
    await handleAuthenticationFlow();
    try {
        // localStorage에서 userId 확인
        userId = localStorage.getItem('userId');
        
        // userId가 없다면 토큰에서 추출 시도
        if (!userId) {
            const idToken = localStorage.getItem('auth_token');
            if (idToken) {
                const tokenPayload = parseJwt(idToken);
                if (tokenPayload && tokenPayload.sub) {
                    userId = tokenPayload.sub;
                    localStorage.setItem('userId', userId);
                }
            }
        }
        
        // userId가 있으면 세션 목록 가져오기
        if (userId) {
            await fetchSessions(userId);
        }
        console.log('userid:', userId)
    } catch (error) {
        console.error('Error initializing page:', error);
        hideSessionLoadingIndicator();
    }
    
    // URL에서 인증 코드 제거
    window.history.replaceState({}, document.title, window.location.pathname);

    // fake welcome message 표시
    displayWelcomeMessage();
}

document.addEventListener('DOMContentLoaded', initializePage);