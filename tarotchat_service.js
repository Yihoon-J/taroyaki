let socket;
let userId;
let currentSessionId;
let sessionToDelete = null;
let isWaitingForResponse = false;
let isInputFocused = false;
let accessToken = null;
let tokenExpiryTime = null;
let refreshTimer = null;

let API_URL, WS_URL, CONFIG_URL, REDIRECT_URI, COGNITO_DOMAIN, CLIENT_ID, FLASK_URL;

async function fetchConfig() {
    try {
        const response = await fetch('http://localhost:3002/api/config');
        if (!response.ok) throw new Error('Failed to fetch configuration');

        const config = await response.json();

        // 설정값 할당
        API_URL = config.apiUrl;
        WS_URL = config.wsUrl;
        REDIRECT_URI = config.redUri;
        CONFIG_URL = config.confURL;
        COGNITO_DOMAIN = config.cogDom;
        CLIENT_ID = config.cliId;
        FLASK_URL = config.flaUrl;

        // 필수 설정값 검증
        const requiredFields = ['apiUrl', 'wsUrl', 'redUri', 'cogDom', 'cliId'];
        const missingFields = requiredFields.filter(field => !config[field]);
        
        if (missingFields.length > 0) {
            throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
        }
        
        console.log('Configuration loaded successfully');
    } catch (error) {
        console.error('Error fetching config:', error);
        throw error;
    }
}

function redirectToLogin() {
    if (!COGNITO_DOMAIN || !CLIENT_ID || !REDIRECT_URI) {
        console.error('Missing required configuration');
        return;
    }
    
    // 강제로 새로운 로그인을 요청하는 파라미터 추가
    const loginUrl = `${COGNITO_DOMAIN}/login?` +
        `client_id=${CLIENT_ID}&` +
        `response_type=code&` +
        `scope=email+openid+profile&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `prompt=login&` +  // 강제로 로그인 화면 표시
        `max_age=0`;       // 이전 세션 무시
    
    window.location.href = loginUrl;
}

async function initializePage() {
    try {
        // 1. 설정 로드
        await fetchConfig();
        
        // 2. URL의 인증 코드 확인
        const code = getAuthorizationCode();
        
        // 인증 코드가 없는 경우 기존 세션 검증 시도
        if (!code) {
            try {
                const response = await fetch(`${FLASK_URL}/api/user-info`, {
                    credentials: 'include'
                });
                
                // 401 Unauthorized가 아닌 경우에만 세션 유효로 판단
                if (!response.ok) {
                    throw new Error('No valid session');
                }
                
                const userInfo = await response.json();
                if (!userInfo || !userInfo.sub) {
                    throw new Error('Invalid user info');
                }
                
                userId = userInfo.sub;
                updateUserInfo(userInfo);
                fetchSessions();
                updateProfileButton(userInfo);
                setupTokenRefresh(3600);
                return;
            } catch (error) {
                // 세션이 유효하지 않은 경우 로그인 페이지로 리다이렉션
                console.log('No valid session found, redirecting to login');
                redirectToLogin();
                return;
            }
        }

        // 인증 코드가 있는 경우의 처리 (기존 코드)
        try {
            const tokenResponse = await exchangeCodeForTokens(code);
            if (tokenResponse.success) {
                setupTokenRefresh(tokenResponse.expires_in);
                accessToken = tokenResponse.access_token;
                
                const userInfo = await fetchUserInfo();
                if (userInfo) {
                    userId = userInfo.sub;
                    updateUserInfo(userInfo);
                    fetchSessions();
                    updateProfileButton(userInfo);
                    displayWelcomeMessage();
                    
                    window.history.replaceState({}, document.title, window.location.pathname);
                    return;
                }
            }
        } catch (error) {
            console.error('Authentication error:', error);
            redirectToLogin();
        }
        
    } catch (error) {
        console.error('Failed to initialize page:', error);
        document.getElementById('userDetails').textContent = 'Failed to load application configuration';
    }
}

function setupTokenRefresh(expiresIn) {
    // 토큰 만료 10분 전에 갱신
    const refreshTime = (expiresIn - 600) * 1000;
    
    if (refreshTimer) {
        clearTimeout(refreshTimer);
    }
    
    refreshTimer = setTimeout(async () => {
        try {
            const response = await fetch('/auth/refresh', {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success) {
                    accessToken = data.access_token;
                    setupTokenRefresh(data.expires_in);
                }
            } else {
                redirectToLogin();
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            redirectToLogin();
        }
    }, refreshTime);
}

async function fetchUserInfo() {
    try {
        const response = await fetch(`${FLASK_URL}/api/user-info`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch user info');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error fetching user info:', error);
        throw error;
    }
}

function getAuthorizationCode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code');
}

async function exchangeCodeForTokens(code) {
    try {
        const response = await fetch(`${FLASK_URL}/auth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ code })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            console.error('Token exchange error:', errorData);
            throw new Error(errorData.error || 'Token exchange failed');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Token exchange error:', error);
        throw error;
    }
}

function updateUserInfo(userInfo) {
    // 기존 userDetails 업데이트
    document.getElementById('userDetails').textContent = 
        `${userInfo.name} (${userInfo.email})`;
        
    // ProfileModal 내용 업데이트
    const profileModal = document.getElementById('profileModal');
    const modalContent = profileModal.querySelector('.modalB-content');
    
    // 기존 사용자 정보 요소가 있다면 제거
    const existingUserInfo = modalContent.querySelector('.user-info');
    if (existingUserInfo) {
        existingUserInfo.remove();
    }
    
    // 새로운 사용자 정보 요소 생성
    const userInfoElement = document.createElement('div');
    userInfoElement.className = 'user-info';
    userInfoElement.textContent = `${userInfo.email}`;
    
    // modalContent의 첫 번째 요소 다음에 삽입
    modalContent.insertBefore(userInfoElement, modalContent.firstChild);
}

function displayWelcomeMessage() {
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = '<div class="message ai-message"><div class="message-content">어떤 이야기를 하고 싶나요?</div></div>';
}

async function fetchSessions() {
    try {
        const response = await fetch(`${API_URL}/sessions?userId=${userId}`, {
            credentials: 'include'
        });
        const sessions = await response.json();
        displaySessions(sessions);
    } catch (error) {
        console.error('Error fetching sessions:', error);
    }
}

function displaySessions(sessions) {
    const sessionList = document.getElementById('sessionList');
    sessionList.innerHTML = '';
    sessions.forEach(session => {
        const sessionElement = document.createElement('div');
        sessionElement.className = 'session-item';
        
        const sessionName = document.createElement('span');
        sessionName.textContent = session.SessionName;
        sessionName.onclick = () => loadSession(session.SessionId);
        
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.onclick = (e) => {
            e.stopPropagation(); // 세션 로드 방지
            showDeleteModal(session.SessionId);
        };
        
        sessionElement.appendChild(sessionName);
        sessionElement.appendChild(deleteButton);
        sessionElement.setAttribute('data-session-id', session.SessionId);
        
        if (session.SessionId === currentSessionId) {
            sessionElement.classList.add('active');
        }
        
        sessionList.appendChild(sessionElement);
    });
}

function updateProfileButton(userInfo) {
    const profileButton = document.getElementById('ProfileBtn');
    if (profileButton && userInfo.name) {
        profileButton.textContent = userInfo.name.charAt(0).toUpperCase();
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

function extractContent(contentData) {
    if (typeof contentData === 'string') {
        return contentData;
    } else if (typeof contentData === 'object' && contentData !== null) {
        return contentData.content || JSON.stringify(contentData);
    }
    return JSON.stringify(contentData);
}

async function loadSession(sessionId) {
    // Remove 'active' class from previously active session
    const previousActive = document.querySelector('.session-item.active');
    if (previousActive) {
        previousActive.classList.remove('active');
    }
    
    // Add 'active' class to newly selected session
    const newActive = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (newActive) {
        newActive.classList.add('active');
    }

    currentSessionId = sessionId;
    try {
        const response = await fetch(`${API_URL}/sessions/${sessionId}?userId=${userId}`, {
            credentials: 'include'
        });
        const messages = await response.json();
        console.log('API Response:', messages);
        
        if (!Array.isArray(messages)) {
            console.error('Unexpected response format. Expected an array, got:', typeof messages);
            return;
        }

        if (messages.length === 0) {
            displayWelcomeMessage(); // 메시지가 없는 경우 웰컴 메시지 표시
        } else {
            displayMessages(messages);
        }
        connectWebSocket();
    } catch (error) {
        console.error('Error loading session:', error);
    }
}

async function connectWebSocket() {
    if (socket) {
        socket.close();
    }
    
    const wsUrl = `${WS_URL}?userId=${encodeURIComponent(userId)}&sessionId=${currentSessionId}`;
    socket = new WebSocket(wsUrl);

    return new Promise((resolve, reject) => {
        socket.onopen = function() {
            console.log('WebSocket connected');
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
    });
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
        messageInput.value = '';
    }
}


// 세션 생성과 연결 동시에 수행
async function createAndConnectNewSession(initialMessage) {
    try {
        const response = await fetch(`${API_URL}/sessions`, {
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
            fetchSessions();

            if (result.welcomeMessage) {
                appendMessage('ai', result.welcomeMessage);
            }

            // WebSocket 연결을 Promise로 감싸서 연결 완료를 보장
            await new Promise((resolve, reject) => {
                connectWebSocket().then(() => {
                    // WebSocket이 실제로 연결될 때까지 대기
                    const checkConnection = setInterval(() => {
                        if (socket.readyState === WebSocket.OPEN) {
                            clearInterval(checkConnection);
                            resolve();
                        }
                    }, 100);

                    // 10초 후에도 연결되지 않으면 타임아웃
                    setTimeout(() => {
                        clearInterval(checkConnection);
                        reject(new Error('WebSocket connection timeout'));
                    }, 10000);
                });
            });

            // WebSocket 연결이 완료된 후에 초기 메시지 전송
            if (initialMessage) {
                sendMessageToCurrentSession(initialMessage);
            }
        } else {
            console.error('Error creating new session:', result.error);
        }
    } catch (error) {
        console.error('Error creating new session:', error);
        enableInput(); // 에러 발생 시 입력 활성화
    }
}

// 현재 세션에 메시지 전송
function sendMessageToCurrentSession(message) {
    // WebSocket 상태 확인
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
    }

    appendMessage('user', message);
    console.log('appending message: ', message);
    const payload = {
        action: 'sendMessage',
        message: message,
        userId: userId,
        sessionId: currentSessionId
    };
    socket.send(JSON.stringify(payload));
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

function handleIncomingMessage(data) {
    if (data.type === 'stream') {
        const content = extractContent(data.content);
        const lastMessage = document.querySelector('.message:first-child');
        const spacer = document.querySelector('.message-spacer');
        
        if (lastMessage && lastMessage.classList.contains('ai-message')) {
            lastMessage.querySelector('.message-content').innerHTML += content.replace(/\n/g, '<br>');
        } else {
            appendMessage('ai', content);
        }

        // AI 메시지가 시작되면 spacer 제거
        if (spacer) {
            spacer.remove();
        }

        scrollToBottom();
    } else if (data.type === 'end') {
        console.log('Stream ended');
        scrollToBottom();
        enableInput();
    } else if (data.type === 'error') {
        console.error('Error:', data.message);
        enableInput();
    } else if (data.type === 'session_name_update') {
        updateSessionName(data.name);
    }
}

// 세션 이름 업데이트
function updateSessionName(newName) {
    const sessionElement = document.querySelector(`.session-item[data-session-id="${currentSessionId}"]`);
    if (sessionElement) {
        const sessionNameSpan = sessionElement.querySelector('span');
        if (sessionNameSpan) {
            sessionNameSpan.textContent = newName;
        }
    }
}

async function startNewChat() {
    currentSessionId = null;
    document.getElementById('chatBox').innerHTML = '';
    displayWelcomeMessage();
    await createAndConnectNewSession('');
}

function showDeleteModal(sessionId) {
    sessionToDelete = sessionId;
    const modal = document.getElementById('deleteSessionModal');
    modal.style.display = 'block';
}

async function deleteSession() {
    if (!sessionToDelete) return;

    try {
        const response = await fetch(`${API_URL}/sessions/${sessionToDelete}?userId=${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });

        if (response.ok) {
            console.log('Session deleted successfully');
            fetchSessions(); // 세션 목록 새로고침
            if (currentSessionId === sessionToDelete) {
                currentSessionId = null;
                document.getElementById('chatBox').innerHTML = '';
            }
        } else {
            console.error('Error deleting session:', await response.text());
        }
    } catch (error) {
        console.error('Error deleting session:', error);
    }

    closeDeleteModal();
}

function closeDeleteModal() {
    const modal = document.getElementById('deleteSessionModal');
    modal.style.display = 'none';
    sessionToDelete = null;
}

async function logout() {
    try {
        if (!COGNITO_DOMAIN || !CLIENT_ID || !REDIRECT_URI) {
            console.error('Missing required configuration');
            return;
        }

        // 1. 백엔드 세션 클리어
        await fetch(`${FLASK_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        // 2. Cognito 쿠키들을 명시적으로 삭제
        document.cookie = `CognitoIdentityServiceProvider.${CLIENT_ID}.*=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
        document.cookie = `cognitoIdentityServiceProvider.*=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
        document.cookie = `XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;

        // 3. 로컬 스토리지와 세션 스토리지 클리어
        localStorage.clear();
        sessionStorage.clear();

        // 4. Cognito 로그아웃 URL로 리다이렉트
        const logoutUrl = `${COGNITO_DOMAIN}/logout?` +
            `client_id=${CLIENT_ID}&` +
            `logout_uri=${encodeURIComponent(REDIRECT_URI)}&` +
            `response_type=code&` +
            `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
            `global=true`;

        window.location.href = logoutUrl;

    } catch (error) {
        console.error('Logout failed:', error);
    }
}

function initializeEventListeners() {
    const messageInput = document.getElementById('messageInput');
    const sendButton = document.getElementById('SendButton');

    if (messageInput && sendButton) {
        // Message input and send button listeners
        messageInput.addEventListener('input', updateInputAreaStyle);
        messageInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

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

    // Settings Modal
    const settingsModal = document.getElementById('settings');
    const settingsBtn = document.getElementById('SettingsButton');
    const collapsedSettingsBtn = document.getElementById('collapsedSettingsBtn');
    const settingsCloseButtons = document.querySelectorAll('.settingsclose');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            if (settingsModal) settingsModal.style.display = 'block';
        });
    }

    if (collapsedSettingsBtn) {
        collapsedSettingsBtn.addEventListener('click', () => {
            if (settingsModal) settingsModal.style.display = 'block';
        });
    }

    settingsCloseButtons.forEach(button => {
        button.addEventListener('click', () => {
            if (settingsModal) settingsModal.style.display = 'none';
        });
    }); 

    // Profile Modal
    const profileModal = document.getElementById("profileModal");
    const profileBtn = document.getElementById("ProfileBtn");
    
    if (profileModal && profileBtn) {
        profileBtn.onclick = function() {
            profileModal.style.display = "block";
        }
    }

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
        const settingsModal = document.getElementById("settingsModal");
        const profileModal = document.getElementById("profileModal");
        const profileBtn = document.getElementById("ProfileBtn");
        const deleteModal = document.getElementById('deleteSessionModal');

        // ProfileBtn이나 profileModal의 내부를 클릭한 경우가 아닐 때만 모달을 닫음
        if (!profileBtn.contains(event.target) && !profileModal.querySelector('.modalB-content').contains(event.target)) {
            profileModal.style.display = "none";
        }
        
        if (event.target == settingsModal) {
            settingsModal.style.display = "none";
        }
        if (event.target == deleteModal) {
            closeDeleteModal();
        }
    }

    // Initialize sidebar controls
    initializeSidebarControls();

    // logout
    const logoutButton = document.getElementById('logoutbtn');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
}

function initializeSidebarControls() {
    const sidebar = document.getElementById('sidebar');
    const collapsedSidebar = document.getElementById('collapsedSidebar');
    const collapseBtn = document.getElementById('collapseBtn');
    const expandBtn = document.getElementById('expandBtn');
    const newchatBtn=document.getElementById('newChatButton');
    const collapsedNewChatBtn = document.getElementById('collapsedNewChatBtn');
    const collapsedSettingsBtn = document.getElementById('collapsedSettingsBtn');

    if (collapseBtn && sidebar && collapsedSidebar) {
        collapseBtn.addEventListener('click', () => {
            sidebar.style.display = 'none';
            collapsedSidebar.style.display = 'flex';
        });
    }

    if (expandBtn && sidebar && collapsedSidebar) {
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

// 필요한 함수들을 export
export {
    initializePage,
    initializeEventListeners,
    startNewChat,
    sendMessage,
    logout
};

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    await fetchConfig();
    initializePage();
    initializeEventListeners();
});