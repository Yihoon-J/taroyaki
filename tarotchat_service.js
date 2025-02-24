let socket;
let userId;
let accessToken;
let sessionToDelete = null;
let isWaitingForResponse = false;
let isInputFocused = false;
let typingAnimation = null;
let refreshTimer = null;
let isEmptySession = false;
let idToken;
let tokenExpiryTime;
let currentSessionId;

const API_URL = window.ENV.API_URL;
const WS_URL = window.ENV.WS_URL;
const REDIRECT_URI = window.ENV.REDIRECT_URI;
const COGNITO_DOMAIN = window.ENV.COGNITO_DOMAIN;
const CLIENT_ID = window.ENV.CLIENT_ID;
const FLASK_URL = window.ENV.FLASK_URL;

console.log('API_URL:', window.ENV.API_URL);
console.log('FLASK_URL:', window.ENV.FLASK_URL);

async function validateConfig() {
    const requiredFields = ['API_URL', 'WS_URL', 'REDIRECT_URI', 'COGNITO_DOMAIN', 'CLIENT_ID', 'FLASK_URL'];
    const missingFields = requiredFields.filter(field => !window.ENV[field]);
    
    if (missingFields.length > 0) {
        throw new Error(`Missing required configuration fields: ${missingFields.join(', ')}`);
    }
    
    return true;
}

function redirectToLogin() {
    if (!COGNITO_DOMAIN || !CLIENT_ID || !REDIRECT_URI) {
        console.error('Missing required configuration');
        return;
    }

    const loginUrl = `${COGNITO_DOMAIN}/login?` +
        `client_id=${CLIENT_ID}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent('openid email profile')}&` +
        `redirect_uri=${encodeURIComponent(REDIRECT_URI)}&` +
        `prompt=consent`; // 'login' 대신 'consent'로 수정

    window.location.href = loginUrl;
}


async function validateTokenBeforeRequest() {
    const token = localStorage.getItem('accessToken');
    const expiry = localStorage.getItem('tokenExpiry');
    
    if (!token || !expiry || Date.now() >= parseInt(expiry)) {
        // 토큰 갱신 필요
        await refreshTokens();
    }
    return localStorage.getItem('accessToken');
}

async function apiCall(url, options = {}) {
    try {
        const token = await validateTokenBeforeRequest();
        if (!token) {
            throw new Error('No access token available');
        }

        const response = await fetch(url, {
            ...options,
            credentials: 'include',  // credentials 추가
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            }
        });

        if (response.status === 401) {
            // 토큰 갱신 시도
            const newToken = await refreshTokens();
            // 갱신된 토큰으로 재시도
            return fetch(url, {
                ...options,
                credentials: 'include',
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${newToken}`,
                    'Accept': 'application/json'
                }
            });
        }

        return response;
    } catch (error) {
        console.error('API call failed:', error);
        throw error;
    }
}

async function initializePage() {
    try {
        console.log('1. Starting initialization...');
        await validateConfig();

        const code = getAuthorizationCode(); // URL에서 인증 코드 추출
        console.log('3. Authorization code:', code ? 'Present' : 'Not present');

        if (!code) {
            console.log('No authorization code, redirecting to login...');
            redirectToLogin();
            return;
        }

        try {
            console.log('Processing authorization code...');
            const tokenResponse = await exchangeCodeForTokens(code); // code 전달
            console.log('Token exchange successful:', tokenResponse);

            localStorage.setItem('accessToken', tokenResponse.access_token);
            localStorage.setItem('refreshToken', tokenResponse.refresh_token);
            localStorage.setItem('tokenExpiry', Date.now() + (tokenResponse.expires_in * 1000));

            // 사용자 정보 가져오기
            const userInfo = await fetchUserInfo();
            if (userInfo) {
                console.log('User info received:', userInfo);
                updateUserInfo(userInfo);
            }

            // URL에서 인증 코드 제거
            window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
            console.error('Authentication error:', error);
            redirectToLogin();
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        redirectToLogin();
    }
}

async function setupTokenRefresh(expiresIn) {
    const refreshTime = (expiresIn - 300) * 1000;
    refreshTimer = setTimeout(async () => {
        try {
            console.log('Attempting token refresh...');
            const response = await apiCall(`${FLASK_URL}/auth/refresh`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            console.log('Refresh response status:', response.status);
            
            if (!response.ok) {
                throw new Error('Token refresh failed');
            }

            const data = await response.json();
            console.log('Refresh response:', data);

            if (data.success) {
                accessToken = data.access_token;
                tokenexpiryTime = Date.now() + (data.expires_in * 1000);
                setupTokenRefresh(data.expires_in);
            } else {
                throw new Error(data.error || 'Invalid refresh response');
            }
        } catch (error) {
            console.error('Token refresh failed:', error);
            redirectToLogin();
        }
    }, refreshTime);
}

async function refreshTokens() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
        throw new Error('No refresh token available');
    }

    try {
        const response = await fetch(`${FLASK_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ refresh_token: refreshToken })
        });

        if (response.ok) {
            const data = await response.json();
            
            // 전역 변수와 localStorage 모두 업데이트
            accessToken = data.access_token;
            tokenExpiryTime = Date.now() + (data.expires_in * 1000);
            
            localStorage.setItem('accessToken', data.access_token);
            localStorage.setItem('tokenExpiry', tokenExpiryTime.toString());
            
            return data.access_token;
        } else {
            throw new Error('Token refresh failed');
        }
    } catch (error) {
        localStorage.clear();
        redirectToLogin();
        throw error;
    }
}

async function fetchUserInfo() {
    try {
        const storedToken = localStorage.getItem('accessToken');
        console.log('Token being used for user-info:', storedToken?.substring(0, 20) + '...');
        
        const response = await apiCall(`${FLASK_URL}/api/user-info`);
        return response.json();
    } catch (error) {
        console.error('Error in fetchUserInfo:', error);
        throw error;
    }
}

function getAuthorizationCode() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('code');
}

async function exchangeCodeForTokens(code) {
    const response = await fetch(`${COGNITO_DOMAIN}/oauth2/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            code: code
        }).toString()
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('Token exchange failed:', errorText);
        throw new Error(`Token exchange failed with status ${response.status}`);
    }

    return await response.json();
}


function updateUserInfo(userInfo) {
    console.log('userInfo:', userInfo);
    document.getElementById('userDetails').textContent = 
        `${userInfo.name} (${userInfo.email})`;
        
    const profileModal = document.getElementById('profileModal');
    
    const modalContent = profileModal?.querySelector('.modalB-content');
    
    if (!profileModal || !modalContent) {
        console.error('Required DOM elements not found');
        return;
    }
    
    const existingUserInfo = modalContent.querySelector('.user-info');
    
    if (existingUserInfo) {
        existingUserInfo.remove();
    }
    
    const userInfoElement = document.createElement('div');
    userInfoElement.className = 'user-info';
    userInfoElement.textContent = `${userInfo.email}`;
    
    try {
        modalContent.insertBefore(userInfoElement, modalContent.firstChild);
    } catch (error) {
        console.error('Error inserting element:', error);
    }

    console.log('updateUserInfo Finished!');
}

function displayWelcomeMessage() {
    const chatBox = document.getElementById('chatBox');
    chatBox.innerHTML = '<div class="message ai-message"><div class="message-content">어떤 이야기를 하고 싶나요?</div></div>';
}

async function fetchSessions() {
    console.log('fetching sessions...')
    try {
        const response = await apiCall(`${API_URL}/sessions?userId=${userId}`);
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

function checkEmptySession(messages) {
    return Array.isArray(messages) && 
           messages.length === 1 && 
           messages[0].type === 'ai' && 
           messages[0].content === "어떤 이야기를 하고 싶나요?";
}

async function disconnectCurrentSession() {
    if (socket) {
        socket.close();
        
        try {
            // 1. 세션의 대화 내역 가져오기
            const response = await apiCall(`${API_URL}/sessions/${currentSessionId}?userId=${userId}`, {
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
                const deleteResponse = await apiCall(`${API_URL}/sessions/${currentSessionId}?userId=${userId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                });
                
                if (!deleteResponse.ok) {
                    throw new Error('Failed to delete empty session');
                }
                
                // 4. 세션 목록 새로고침
                await fetchSessions();
            }
        } catch (error) {
            console.error('Error handling session disconnect:', error);
        }
    }
}

function updateProfileButton(userInfo) {
    const profileButton = document.getElementById('ProfileBtn');
    if (profileButton && userInfo.name) {
        profileButton.textContent = userInfo.name.charAt(0).toUpperCase();
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
    if (currentSessionId === sessionId) {
        return;
    }

    if (currentSessionId) {
        await disconnectCurrentSession();
    }

    const previousActive = document.querySelector('.session-item.active');
    if (previousActive) {
        previousActive.classList.remove('active');
    }

    const newActive = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
    if (newActive) {
        newActive.classList.add('active');
    }

    currentSessionId = sessionId;
    try {
        const response = await apiCall(`${API_URL}/sessions/${sessionId}?userId=${userId}`, {
            headers: {
                'Authorization': `Bearer ${idToken}`
            }
        });
        const messages = await response.json();
        
        // 빈 세션 여부 체크
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
        connectWebSocket();
    } catch (error) {
        console.error('Error loading session:', error);
    }
}

// 프로덕션 용
async function connectWebSocket() {
    if (!accessToken || !userId || !currentSessionId) {
    console.error('Missing required parameters for WebSocket connection');
    return;
    }

    const wsUrl = `${WS_URL}?token=${accessToken}&userId=${userId}&sessionId=${currentSessionId}`;
    console.log('Attempting to connect WebSocket with URL:', wsUrl);
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
        });
    }


// 테스트용: 세션 연결만 되면 애니메이션 항상 표시
// async function connectWebSocket() {
//     if (!accessToken || !userId || !currentSessionId) {
//         console.error('Missing required parameters for WebSocket connection');
//         return;
//     }
    
//     const wsUrl = `${WS_URL}?token=${accessToken}&userId=${userId}&sessionId=${currentSessionId}`;
//     console.log('Attempting to connect WebSocket with URL:', wsUrl);
//     socket = new WebSocket(wsUrl);

//     return new Promise((resolve, reject) => {
//         socket.onopen = function() {
//             console.log('WebSocket connected for session:', currentSessionId);
//             // WebSocket 연결 성공 시 로딩 애니메이션 표시
//             showTypingIndicator();
//             resolve();
//         };

//         socket.onmessage = function(event) {
//             const data = JSON.parse(event.data);
//             handleIncomingMessage(data);
//         };

//         socket.onclose = function(event) {
//             console.log('WebSocket closed:', event.code, event.reason);
//             // WebSocket 연결 종료 시 애니메이션 제거
//             hideTypingIndicator();
//         };

//         socket.onerror = function(error) {
//             console.error('WebSocket error:', error);
//             // 에러 발생 시 애니메이션 제거
//             hideTypingIndicator();
//             reject(error);
//         };
//     });
// }

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
        showTypingIndicator();
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
        const response = await apiCall(`${API_URL}/sessions`, {
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

            // 새 세션은 빈 세션으로 시작
            isEmptySession = true;
            updateNewChatButtonState();

            await connectWebSocket();

            if (initialMessage) {
                sendMessageToCurrentSession(initialMessage);
            }
        } else {
            console.error('Error creating new session:', result.error);
        }
    } catch (error) {
        console.error('Error creating new session:', error);
        enableInput();
    }
}

// 현재 세션에 메시지 전송
function sendMessageToCurrentSession(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
    }

    appendMessage('user', message);
    console.log('appending message: ', message);
    
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
        
        if (lastMessage && lastMessage.classList.contains('ai-message')) {
            lastMessage.querySelector('.message-content').innerHTML += content.replace(/\n/g, '<br>');
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
        console.log('Creating new session for userId:', userId);
        const response = await apiCall(`${API_URL}/sessions`, {
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
            await fetchSessions();

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

function showDeleteModal(sessionId) {
    sessionToDelete = sessionId;
    const modal = document.getElementById('deleteSessionModal');
    modal.style.display = 'block';
}

async function deleteSession() {
    if (!sessionToDelete) return;

    try {
        const response = await apiCall(`${API_URL}/sessions/${sessionToDelete}?userId=${userId}`, {
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
}

async function logout() {
    try {
        if (!COGNITO_DOMAIN || !CLIENT_ID || !REDIRECT_URI) {
            console.error('Missing required configuration');
            return;
        }

        // 1. 백엔드 세션 클리어
        await apiCall(`${FLASK_URL}/auth/logout`, {
            method: 'POST',
            credentials: 'include'
        });

        // 2. 모든 도메인의 모든 경로에 대한 쿠키 삭제
        document.cookie.split(';').forEach(cookie => {
            const cookieName = cookie.split('=')[0].trim();
            // 루트 경로 쿠키 삭제
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
            // /tarot 경로 쿠키 삭제
            document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/tarot;`;
            // Cognito 관련 쿠키 명시적 삭제
            if (cookieName.includes('CognitoIdentityServiceProvider') || 
                cookieName.includes('cognito') || 
                cookieName.includes('XSRF')) {
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/;`;
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/tarot;`;
            }
        });

        // 3. 스토리지 클리어
        localStorage.clear();
        sessionStorage.clear();

        // 4. Cognito 글로벌 로그아웃으로 리다이렉트
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
        console.log('window.ENV:', window.ENV);
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
    
    //Profile Modal
    initializeProfileModal();

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

         // settings 모달이 클릭되었고, 클릭된 요소가 모달 콘텐츠가 아닌 경우에만 닫기
        if (event.target === settingsModal) {
            settingsModal.style.display = "none";
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