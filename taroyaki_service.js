const config = {
    clientId: "76pqubnjqg6o5ng1l3235j27sl",
    clientSecret: "1l33vpl1rqj8ibbiae4pd2tslgu5hchp54cgg6f7n89affpccc9j",
    domain: "https://us-east-1ofs2k3zki.auth.us-east-1.amazoncognito.com",
    redirectUri: "https://dje3vsz99xjr1.cloudfront.net/index.html",
    authEndpoint: "https://idqujgb116.execute-api.us-east-1.amazonaws.com/product/userinfo",
    restEndpoint: "https://blgg29wto5.execute-api.us-east-1.amazonaws.com/product",
    wsEndpoint: "wss://tt0ikgb3sd.execute-api.us-east-1.amazonaws.com/production/",
    logoutRedirectUri: "https://dje3vsz99xjr1.cloudfront.net/index.html",
    tokenRefreshThreshold: 5 * 60,
    sessionDuration: 3 * 60, // 3분
    tokenExpirations: {
        id: 60 * 60,     // 60분
        access: 60 * 60,  // 60분
        refresh: 5 * 24 * 60 * 60  // 5일
    }
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
let isAutocompleteVisible = false;
let selectedCardIndex = -1;
let filteredCards = [];

// 타로 카드 목록 정의
const tarotCards = [
    // 메이저 아르카나 (22장)
    "The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
    "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
    "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
    "The Devil", "The Tower", "The Star", "The Moon", "The Sun",
    "Judgement", "The World",
    
    // 마이너 아르카나 - 완드 (14장)
    "Ace of Wands", "Two of Wands", "Three of Wands", "Four of Wands", "Five of Wands",
    "Six of Wands", "Seven of Wands", "Eight of Wands", "Nine of Wands", "Ten of Wands",
    "Page of Wands", "Knight of Wands", "Queen of Wands", "King of Wands",
    
    // 마이너 아르카나 - 컵스 (14장)
    "Ace of Cups", "Two of Cups", "Three of Cups", "Four of Cups", "Five of Cups",
    "Six of Cups", "Seven of Cups", "Eight of Cups", "Nine of Cups", "Ten of Cups",
    "Page of Cups", "Knight of Cups", "Queen of Cups", "King of Cups",
    
    // 마이너 아르카나 - 소드 (14장)
    "Ace of Swords", "Two of Swords", "Three of Swords", "Four of Swords", "Five of Swords",
    "Six of Swords", "Seven of Swords", "Eight of Swords", "Nine of Swords", "Ten of Swords",
    "Page of Swords", "Knight of Swords", "Queen of Swords", "King of Swords",
    
    // 마이너 아르카나 - 펜타클 (14장)
    "Ace of Pentacles", "Two of Pentacles", "Three of Pentacles", "Four of Pentacles", "Five of Pentacles",
    "Six of Pentacles", "Seven of Pentacles", "Eight of Pentacles", "Nine of Pentacles", "Ten of Pentacles",
    "Page of Pentacles", "Knight of Pentacles", "Queen of Pentacles", "King of Pentacles"
];

// 타로 카드 뽑기 관련 변수와 함수
let drawnCards = [];

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

async function authenticatedFetch(url, options = {}) {
    let retryCount = 0;
    const MAX_RETRIES = 1;

    while (retryCount <= MAX_RETRIES) {
        try {
            const isValid = await TokenManager.validateTokenSet();
            if (!isValid) {
                throw new Error('Token validation failed');
            }

            const accessToken = localStorage.getItem('access_token');
            const authenticatedOptions = {
                ...options,
                headers: {
                    ...options.headers,
                    'Authorization': `Bearer ${accessToken}`
                }
            };

            const response = await fetch(url, authenticatedOptions);
            
            if (response.status === 401 && retryCount < MAX_RETRIES) {
                retryCount++;
                continue;
            }

            return response;
        } catch (error) {
            if (retryCount === MAX_RETRIES) {
                await handleLogout();
                throw error;
            }
            retryCount++;
        }
    }
}

async function handleAuthenticationFlow() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');

        if (!authCode) return false;

        const tokenData = await getToken(authCode);
        
        // URL에서 인증 코드 제거
        window.history.replaceState({}, document.title, window.location.pathname);

        const beforelogin = document.getElementById('beforelogin');
        if (beforelogin) beforelogin.style.display = "none";
        
        showSessionLoadingIndicator();

        // userId 설정
        const tokenPayload = parseJwt(tokenData.id_token);
        if (tokenPayload?.sub) {
            userId = tokenPayload.sub;
            localStorage.setItem('userId', userId);
        }

        const userInfo = await getUserInfo(tokenData.id_token);
        document.getElementById('userinfo1').innerText = userInfo.email;
        document.getElementById('userinfo2').innerText = userInfo.email;
        updateProfileButton(userInfo);

        // UI 초기화
        initializeEventListeners();
        if (userId) {
            await fetchSessions(userId);
        }

        // 세션 체크 초기화
        initializeSessionCheck();
        
        return true;

    } catch (error) {
        console.error('Authentication error:', error);
        document.getElementById('userinfo').innerText = 'Error fetching user info.';
        return false;
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

class TokenManager {
    static REFRESH_THRESHOLD = 10 * 60; // 10분으로 증가

    static getTokenExpiration(token) {
        const decoded = parseJwt(token);
        return decoded ? decoded.exp * 1000 : 0; // milliseconds로 변환
    }

    static async validateTokenSet() {
        const idToken = localStorage.getItem('auth_token');
        const accessToken = localStorage.getItem('access_token');
        const refreshToken = localStorage.getItem('refresh_token');

        if (!idToken || !accessToken || !refreshToken) {
            return false;
        }

        const now = Date.now();
        const idExpiration = this.getTokenExpiration(idToken);
        const accessExpiration = this.getTokenExpiration(accessToken);
        const refreshExpiration = this.getTokenExpiration(refreshToken);

        // Refresh 토큰이 만료된 경우
        if (now >= refreshExpiration) {
            await handleLogout();
            return false;
        }

        // ID 또는 Access 토큰이 만료 임박한 경우
        if (now >= idExpiration - this.REFRESH_THRESHOLD * 1000 ||
            now >= accessExpiration - this.REFRESH_THRESHOLD * 1000) {
            try {
                await refreshTokens(refreshToken);
                return true;
            } catch (error) {
                console.error('Token refresh failed:', error);
                await handleLogout();
                return false;
            }
        }

        return true;
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
    const settingbtnB = document.getElementById("settingbtnB");
    const settingsModal = document.getElementById("settings");
    
    if (profileModal && profileBtn) {
        profileBtn.onclick = function() {
            // 현재 모달의 표시 상태 확인
            const isModalVisible = profileModal.style.display === "block";
            // 현재 상태의 반대로 토글
            profileModal.style.display = isModalVisible ? "none" : "block";
        }
    }

    // 프로필 모달 내 설정 버튼 클릭 시 설정 모달로 전환
    if (settingbtnB && settingsModal) {
        settingbtnB.onclick = function() {
            profileModal.style.display = "none"; // 프로필 모달 닫기
            settingsModal.style.display = "block"; // 설정 모달 열기
        }
    }

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
        background-color: #38383A;
        color: #EBE4D4;
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

function initializeTarotDrawing() {
    const drawTarotBtn = document.getElementById('drawTarotBtn');
    const tarotBottomSheet = document.getElementById('tarotBottomSheet');
    const drawOneBtn = document.getElementById('drawOneBtn');
    const drawThreeBtn = document.getElementById('drawThreeBtn');
    const tarotResult = document.getElementById('tarotResult');
    const copyResultBtn = document.getElementById('copyResultBtn');
    const chatBox = document.getElementById('chatBox');
    
    // 뽑기 버튼 클릭 시 bottom sheet 토글
    if (drawTarotBtn) {
        drawTarotBtn.addEventListener('click', () => {
            if (tarotBottomSheet.classList.contains('open')) {
                closeTarotBottomSheet();
            } else {
                openTarotBottomSheet();
            }
        });
    }
        
    // 외부 클릭 시 bottom sheet 닫기
    document.addEventListener('click', (event) => {
        if (tarotBottomSheet && tarotBottomSheet.classList.contains('open')) {
            const bottomSheetContent = tarotBottomSheet.querySelector('.bottom-sheet-content');
            if (bottomSheetContent && !bottomSheetContent.contains(event.target) && 
                event.target !== drawTarotBtn && 
                !drawTarotBtn.contains(event.target)) {
                closeTarotBottomSheet();
            }
        }
    });
    
    // 1개 뽑기 버튼 클릭 이벤트
    if (drawOneBtn) {
        drawOneBtn.addEventListener('click', () => {
            const card = drawRandomCards(1);
            displayDrawnCards(card);
        });
    }
    
    // 3개 뽑기 버튼 클릭 이벤트
    if (drawThreeBtn) {
        drawThreeBtn.addEventListener('click', () => {
            const cards = drawRandomCards(3);
            displayDrawnCards(cards);
        });
    }
    
    // 복사 버튼 클릭 이벤트 (div 요소에 맞게 수정)
    if (copyResultBtn) {
        copyResultBtn.addEventListener('click', () => {
            copyToClipboard(); // 매개변수 제거, 함수 내에서 직접 textContent 참조
        });
    }
    
    // 결과 내용이 변경될 때 복사 버튼 활성화/비활성화
    if (tarotResult) {
        const observer = new MutationObserver(() => {
            updateCopyButtonState();
        });
        
        observer.observe(tarotResult, { 
            attributes: true, 
            characterData: true, 
            childList: true,
            subtree: true
        });
    }
}

// 랜덤 카드 뽑기 함수
function drawRandomCards(count) {
    // 새로운 뽑기를 시작할 때 이전에 뽑은 카드 초기화
    drawnCards = [];
    
    const selectedCards = [];
    const availableCards = [...tarotCards]; // 원본 배열을 복사
    
    for (let i = 0; i < count; i++) {
        if (availableCards.length === 0) break;
        
        const randomIndex = Math.floor(Math.random() * availableCards.length);
        const selectedCard = availableCards.splice(randomIndex, 1)[0];
        
        selectedCards.push(selectedCard);
        drawnCards.push(selectedCard);
    }
    
    return selectedCards;
}

// 뽑은 카드 표시 함수
function displayDrawnCards(cards) {
    const tarotResult = document.getElementById('tarotResult');
    if (!tarotResult) return;
    
    if (Array.isArray(cards)) {
        // 쉼표와 공백으로 구분하여 한 줄로 표시
        tarotResult.textContent = cards.join(', ');
    } else {
        tarotResult.textContent = cards;
    }
    
    updateCopyButtonState();
}

// 클립보드에 복사하는 함수
function copyToClipboard() {
    const tarotResult = document.getElementById('tarotResult');
    if (!tarotResult || !tarotResult.textContent.trim()) return;
    
    navigator.clipboard.writeText(tarotResult.textContent)
        .then(() => {
            // 토스트 메시지 표시
            showToast();
            
            // 복사 성공 시 일시적으로 버튼 스타일 변경
            const copyBtn = document.getElementById('copyResultBtn');
            if (copyBtn) {
                copyBtn.style.backgroundColor = '#90EE90';
                setTimeout(() => {
                    copyBtn.style.backgroundColor = '';
                }, 1000);
            }
        })
        .catch(err => {
            console.error('클립보드 복사 실패:', err);
        });
}

function showToast() {
    const toast = document.getElementById('toastMessage');
    if (!toast) return;
    
    // 토스트 메시지 표시
    toast.classList.add('show');
    
    // 2초 후 토스트 메시지 숨기기
    setTimeout(() => {
        toast.classList.remove('show');
    }, 2000);
}

// 복사 버튼 상태 업데이트
function updateCopyButtonState() {
    const tarotResult = document.getElementById('tarotResult');
    const copyResultBtn = document.getElementById('copyResultBtn');
    
    if (tarotResult && copyResultBtn) {
        if (tarotResult.textContent.trim() === '') {
            copyResultBtn.disabled = true;
        } else {
            copyResultBtn.disabled = false;
        }
    }
}

// Bottom sheet 열기
function openTarotBottomSheet() {
    const tarotBottomSheet = document.getElementById('tarotBottomSheet');
    const chatBox = document.getElementById('chatBox');
    
    if (tarotBottomSheet) {
        tarotBottomSheet.classList.add('open');
        if (chatBox) {
            chatBox.classList.add('with-bottom-sheet');
        }
    }
}

// Bottom sheet 닫기
function closeTarotBottomSheet() {
    const tarotBottomSheet = document.getElementById('tarotBottomSheet');
    const chatBox = document.getElementById('chatBox');
    
    if (tarotBottomSheet) {
        tarotBottomSheet.classList.remove('open');
        if (chatBox) {
            chatBox.classList.remove('with-bottom-sheet');
        }
    }
}

// 자동완성 모달 초기화
function initializeCardAutocomplete() {
    const messageInput = document.getElementById('messageInput');
    const autocompleteModal = document.getElementById('tarotCardAutocomplete');
    const suggestionList = document.getElementById('cardSuggestionList');
    
    if (!messageInput || !autocompleteModal || !suggestionList) return;
    
    // 입력 이벤트 리스너
    messageInput.addEventListener('input', function(e) {
        handleInputChange(e);
    });
    
    // 키 다운 이벤트 리스너
    messageInput.addEventListener('keydown', function(e) {
        handleKeyDown(e);
    });
    
    // 클릭 이벤트 리스너
    suggestionList.addEventListener('click', function(e) {
        const item = e.target.closest('li');
        if (item) {
            const cardName = item.getAttribute('data-card');
            insertCardName(cardName);
        }
    });
    
    // 외부 클릭 시 자동완성 닫기
    document.addEventListener('click', function(e) {
        if (!autocompleteModal.contains(e.target) && e.target !== messageInput) {
            hideAutocomplete();
        }
    });
}

// 입력 변경 핸들러
function handleInputChange(e) {
    const input = e.target;
    const cursorPosition = input.selectionStart;
    const text = input.value;
    
    // 커서 위치 이전의 텍스트에서 마지막 '/' 위치 찾기
    const lastSlashIndex = text.substring(0, cursorPosition).lastIndexOf('/');
    
    // '/'가 있는 경우 자동완성 표시 (스페이스가 있어도 계속 표시)
    if (lastSlashIndex !== -1) {
        const searchTerm = text.substring(lastSlashIndex + 1, cursorPosition).toLowerCase();
        showAutocomplete(searchTerm);
    } else {
        hideAutocomplete();
    }
}

// 키 입력 핸들러
function handleKeyDown(e) {
    if (!isAutocompleteVisible) return;
    
    switch (e.key) {
        case 'ArrowDown':
            e.preventDefault();
            selectNextCard();
            break;
        case 'ArrowUp':
            e.preventDefault();
            selectPreviousCard();
            break;
        case 'Enter':
            if (isAutocompleteVisible && selectedCardIndex >= 0 && selectedCardIndex < filteredCards.length) {
                e.preventDefault();
                insertCardName(filteredCards[selectedCardIndex]);
                return;
            }
            break;
        case 'Escape':
            e.preventDefault();
            hideAutocomplete();
            break;
    }
}

// 자동완성 표시
function showAutocomplete(searchTerm) {
    const autocompleteModal = document.getElementById('tarotCardAutocomplete');
    const suggestionList = document.getElementById('cardSuggestionList');
    
    if (!autocompleteModal || !suggestionList) return;
    
    // 검색어가 있으면 필터링, 없으면 전체 목록
    if (searchTerm) {
        // 검색어에 공백이 있는 경우 각 단어를 개별적으로 처리
        const searchTerms = searchTerm.trim().split(/\s+/).filter(term => term.length > 0);
        
        if (searchTerms.length > 0) {
            filteredCards = tarotCards.filter(card => {
                const lowerCard = card.toLowerCase();
                // 모든 검색어가 카드 이름에 포함되어야 함
                return searchTerms.every(term => lowerCard.includes(term));
            });
        } else {
            filteredCards = [...tarotCards];
        }
    } else {
        filteredCards = [...tarotCards];
    }
    
    // 필터링된 카드가 없으면 자동완성 숨김
    if (filteredCards.length === 0) {
        hideAutocomplete();
        return;
    }
    
    // 목록 렌더링
    renderCardSuggestions(suggestionList, filteredCards, searchTerm);
    
    // 모달 표시
    autocompleteModal.style.display = 'block';
    isAutocompleteVisible = true;
    
    // 첫 번째 항목 선택
    selectedCardIndex = 0;
    updateSelectedCard();
}

// 카드 제안 렌더링
function renderCardSuggestions(container, cards, searchTerm) {
    container.innerHTML = '';
    
    cards.forEach((card, index) => {
        const li = document.createElement('li');
        li.setAttribute('data-card', card);
        li.setAttribute('data-index', index);
        
        if (searchTerm && searchTerm.trim()) {
            // 공백으로 검색어 분리
            const searchTerms = searchTerm.toLowerCase().trim().split(/\s+/).filter(term => term.length > 0);
            
            if (searchTerms.length > 0) {
                // 메인 텍스트 내용을 먼저 비움
                li.textContent = '';
                
                const lowerCard = card.toLowerCase();
                const matches = [];
                
                // 모든 검색어 매치 찾기
                searchTerms.forEach(term => {
                    if (term.length === 0) return;
                    
                    const regex = new RegExp(term, 'gi');
                    let match;
                    while ((match = regex.exec(card)) !== null) {
                        matches.push({
                            start: match.index,
                            end: match.index + match[0].length,
                            text: match[0]
                        });
                    }
                });
                
                // 매치 없는 경우
                if (matches.length === 0) {
                    li.textContent = card;
                    container.appendChild(li);
                    return;
                }
                
                // 겹치는 매치 처리 및 정렬
                matches.sort((a, b) => a.start - b.start);
                const mergedMatches = [];
                let current = matches[0];
                
                for (let i = 1; i < matches.length; i++) {
                    if (matches[i].start <= current.end) {
                        // 겹치는 매치 합치기
                        current.end = Math.max(current.end, matches[i].end);
                    } else {
                        // 다음 매치와 겹치지 않음
                        mergedMatches.push(current);
                        current = matches[i];
                    }
                }
                mergedMatches.push(current);
                
                // 카드 이름을 하이라이트된 부분과 일반 부분으로 나누어 추가
                let lastEnd = 0;
                
                mergedMatches.forEach(match => {
                    // 하이라이트 전 텍스트 추가
                    if (match.start > lastEnd) {
                        const textBefore = document.createTextNode(card.substring(lastEnd, match.start));
                        li.appendChild(textBefore);
                    }
                    
                    // 하이라이트된 텍스트 추가
                    const highlightSpan = document.createElement('span');
                    highlightSpan.className = 'highlighted';
                    highlightSpan.textContent = card.substring(match.start, match.end);
                    li.appendChild(highlightSpan);
                    
                    lastEnd = match.end;
                });
                
                // 마지막 하이라이트 이후 텍스트 추가
                if (lastEnd < card.length) {
                    const textAfter = document.createTextNode(card.substring(lastEnd));
                    li.appendChild(textAfter);
                }
            } else {
                li.textContent = card;
            }
        } else {
            li.textContent = card;
        }
        
        container.appendChild(li);
    });
}

// 자동완성 숨김
function hideAutocomplete() {
    const autocompleteModal = document.getElementById('tarotCardAutocomplete');
    if (autocompleteModal) {
        autocompleteModal.style.display = 'none';
    }
    isAutocompleteVisible = false;
    selectedCardIndex = -1;
    filteredCards = [];
}

// 다음 카드 선택
function selectNextCard() {
    if (filteredCards.length === 0) return;
    
    selectedCardIndex = (selectedCardIndex + 1) % filteredCards.length;
    updateSelectedCard();
}

// 이전 카드 선택
function selectPreviousCard() {
    if (filteredCards.length === 0) return;
    
    selectedCardIndex = (selectedCardIndex - 1 + filteredCards.length) % filteredCards.length;
    updateSelectedCard();
}

// 선택된 카드 업데이트
function updateSelectedCard() {
    const items = document.querySelectorAll('#cardSuggestionList li');
    
    items.forEach(item => {
        item.classList.remove('selected');
    });
    
    if (selectedCardIndex >= 0 && selectedCardIndex < items.length) {
        items[selectedCardIndex].classList.add('selected');
        // 선택된 항목이 보이도록 스크롤
        items[selectedCardIndex].scrollIntoView({ block: 'nearest' });
    }
}

// 카드 이름 삽입
function insertCardName(cardName) {
    const messageInput = document.getElementById('messageInput');
    if (!messageInput) return;
    
    const cursorPosition = messageInput.selectionStart;
    const text = messageInput.value;
    
    // 마지막 '/' 위치 찾기
    const lastSlashIndex = text.substring(0, cursorPosition).lastIndexOf('/');
    
    if (lastSlashIndex !== -1) {
        // 슬래시를 포함한 검색어를 카드 이름으로 교체
        const newText = text.substring(0, lastSlashIndex) + cardName + ' ' + text.substring(cursorPosition);
        messageInput.value = newText;
        
        // 커서 위치 업데이트 (카드 이름 뒤로)
        const newCursorPosition = lastSlashIndex + cardName.length + 1;
        messageInput.setSelectionRange(newCursorPosition, newCursorPosition);
    }
    
    hideAutocomplete();
    messageInput.focus();
    
    // 입력 영역 스타일 업데이트
    updateInputAreaStyle();
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
    
    // AI 메시지인 경우 인디케이터 추가 (별도 요소로)
    if (sender === 'ai') {
        const indicatorElement = document.createElement('div');
        indicatorElement.className = 'ai-indicator';
        chatBox.insertBefore(indicatorElement, messageElement.nextSibling);
    }
    
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

function initializeSessionCheck() {
    let lastActivity = Date.now();
    
    // 사용자 활동 감지
    ['click', 'keypress', 'scroll', 'mousemove'].forEach(event => {
        document.addEventListener(event, () => {
            lastActivity = Date.now();
        });
    });

    // 주기적으로 세션 상태 체크
    setInterval(async () => {
        const inactiveTime = (Date.now() - lastActivity) / 1000;
        if (inactiveTime >= config.sessionDuration) {
            await handleLogout();
        }
    }, 60000); // 1분마다 체크
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

    // Initialize tarot drawing 
    initializeTarotDrawing();

    initializeCardAutocomplete();

}

async function initializePage() {
    try {
        // 1. 기본 이벤트 리스너 초기화를 먼저 수행
        initializeEventListeners();

        // 2. URL 파라미터 체크
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');

        if (authCode) {
            await handleAuthenticationFlow();
            return;
        }

        // 3. 인증 코드가 없는 경우 토큰 유효성 검증
        const isValid = await TokenManager.validateTokenSet();
        if (!isValid) {
            const beforelogin = document.getElementById('beforelogin');
            if (beforelogin) {
                beforelogin.style.display = "block";
            }
            return;
        }

        // 4. 유효한 토큰이 있는 경우의 초기화
        const idToken = localStorage.getItem('auth_token');
        if (idToken) {
            const tokenPayload = parseJwt(idToken);
            if (tokenPayload?.sub) {
                userId = tokenPayload.sub;
                localStorage.setItem('userId', userId);
                
                // UI 업데이mo
                try {
                    const userInfo = await getUserInfo(idToken);
                    document.getElementById('userinfo1').innerText = userInfo.email;
                    document.getElementById('userinfo2').innerText = userInfo.email;
                    updateProfileButton(userInfo);
                    
                    const beforelogin = document.getElementById('beforelogin');
                    if (beforelogin) {
                        beforelogin.style.display = "none";
                    }

                    // 5. 세션 관련 초기화
                    if (userId) {
                        await fetchSessions(userId);
                    }
                    
                    initializeSessionCheck();
                } catch (error) {
                    console.error('User info validation failed:', error);
                    const loginButton = document.getElementById('LoginBtn');
                    if (loginButton) {
                        loginButton.style.display = "block";
                    }
                }
            }
        }
    } catch (error) {
        console.error('Initialization failed:', error);
        const loginButton = document.getElementById('LoginBtn');
        if (loginButton) {
            loginButton.style.display = "block";
        }
    }
}

document.addEventListener('DOMContentLoaded', initializePage);