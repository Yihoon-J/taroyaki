import logger from './logger.js';

let config = {
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
let isAutocompleteVisible = false;
let isEmptySession = false;
let cardAutocompleteInitialized = false;

// 전역 변수로 WebSocket 연결 상태 추적
let isConnecting = false;
let connectionQueue = [];

let typingAnimation = null;
let refreshTimer = null;
let sessionToDelete = null;
let currentSessionId = null;
let socket = null;
let sessionLoadingAnimation = null;
let loadingSessionId = null;
let currentRequestId = null;
let processedRequestIds = new Set();

let retryCount = 0;
let maxRetries = 4;
let retryDelay = 3000; // 초기 재시도 간격 (밀리초)
let retryBackoffFactor = 1.5; // 지수 백오프 계수
let retryMessageId = null; // 재시도 중 표시되는 메시지의 ID
let retryTypingIndicator = null;
let lastSentMessage = '';

let selectedCardIndex = -1;
let filteredCards = [];
let drawnCards = [];

const tarotCardMapping = {
    // 메이저 아르카나
    'The Fool': 'the_fool',
    'The Magician': 'the_magician',
    'The High Priestess': 'the_high_priestess',
    'The Empress': 'the_empress',
    'The Emperor': 'the_emperor',
    'The Hierophant': 'the_hierophant',
    'The Lovers': 'the_lovers',
    'The Chariot': 'the_chariot',
    'Strength': 'strength',
    'The Hermit': 'the_hermit',
    'Wheel of Fortune': 'wheel_of_fortune',
    'Justice': 'justice',
    'The Hanged Man': 'the_hanged_man',
    'Death': 'death',
    'Temperance': 'temperance',
    'The Devil': 'the_devil',
    'The Tower': 'the_tower',
    'The Star': 'the_star',
    'The Moon': 'the_moon',
    'The Sun': 'the_sun',
    'Judgement': 'judgement',
    'The World': 'the_world',
    
    // 완드 (Wands)
    'Ace of Wands': 'ace_of_wands',
    'Two of Wands': 'two_of_wands',
    'Three of Wands': 'three_of_wands',
    'Four of Wands': 'four_of_wands',
    'Five of Wands': 'five_of_wands',
    'Six of Wands': 'six_of_wands',
    'Seven of Wands': 'seven_of_wands',
    'Eight of Wands': 'eight_of_wands',
    'Nine of Wands': 'nine_of_wands',
    'Ten of Wands': 'ten_of_wands',
    'Page of Wands': 'page_of_wands',
    'Knight of Wands': 'knight_of_wands',
    'Queen of Wands': 'queen_of_wands',
    'King of Wands': 'king_of_wands',
    
    // 컵스 (Cups)
    'Ace of Cups': 'ace_of_cups',
    'Two of Cups': 'two_of_cups',
    'Three of Cups': 'three_of_cups',
    'Four of Cups': 'four_of_cups',
    'Five of Cups': 'five_of_cups',
    'Six of Cups': 'six_of_cups',
    'Seven of Cups': 'seven_of_cups', 
    'Eight of Cups': 'eight_of_cups',
    'Nine of Cups': 'nine_of_cups',
    'Ten of Cups': 'ten_of_cups',
    'Page of Cups': 'page_of_cups',
    'Knight of Cups': 'knight_of_cups',
    'Queen of Cups': 'queen_of_cups',
    'King of Cups': 'king_of_cups',
    
    // 소드 (Swords)
    'Ace of Swords': 'ace_of_swords',
    'Two of Swords': 'two_of_swords',
    'Three of Swords': 'three_of_swords',
    'Four of Swords': 'four_of_swords',
    'Five of Swords': 'five_of_swords',
    'Six of Swords': 'six_of_swords',
    'Seven of Swords': 'seven_of_swords',
    'Eight of Swords': 'eight_of_swords',
    'Nine of Swords': 'nine_of_swords',
    'Ten of Swords': 'ten_of_swords',
    'Page of Swords': 'page_of_swords',
    'Knight of Swords': 'knight_of_swords',
    'Queen of Swords': 'queen_of_swords',
    'King of Swords': 'king_of_swords',
    
    // 펜타클 (Pentacles)
    'Ace of Pentacles': 'ace_of_pentacles',
    'Two of Pentacles': 'two_of_pentacles',
    'Three of Pentacles': 'three_of_pentacles',
    'Four of Pentacles': 'four_of_pentacles',
    'Five of Pentacles': 'five_of_pentacles',
    'Six of Pentacles': 'six_of_pentacles',
    'Seven of Pentacles': 'seven_of_pentacles',
    'Eight of Pentacles': 'eight_of_pentacles',
    'Nine of Pentacles': 'nine_of_pentacles',
    'Ten of Pentacles': 'ten_of_pentacles',
    'Page of Pentacles': 'page_of_pentacles',
    'Knight of Pentacles': 'knight_of_pentacles',
    'Queen of Pentacles': 'queen_of_pentacles',
    'King of Pentacles': 'king_of_pentacles'
  };

// 설정 로드
async function loadConfig() {
    try {
        const configApiUrl = 'https://1arn0hzfhc.execute-api.us-east-1.amazonaws.com/product/config';
        const response = await fetch(configApiUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to load config: ${response.status}`);
        }
        
        const responseData = await response.json();
        console.log('API 응답 전체:', responseData);
        
        // API 응답이 { body: "..." } 형태인지 확인
        let loadedConfig;
        if (responseData.body && typeof responseData.body === 'string') {
            try {
                // body가 JSON 문자열인 경우 파싱
                loadedConfig = JSON.parse(responseData.body);
                console.log('파싱된 body:', loadedConfig);
            } catch (e) {
                // 문자열 파싱 실패 시 그대로 사용
                loadedConfig = responseData;
            }
        } else {
            // body 속성이 없는 경우 응답 전체 사용
            loadedConfig = responseData;
        }
        
        // 로드된 설정을 전역 설정과 병합
        config = { ...config, ...loadedConfig };
        
        console.log('최종 config 객체:', config);
        console.log('domain 값:', config.domain);
        
        // 설정 로드 완료 이벤트 발생
        const configLoadedEvent = new Event('configLoaded');
        document.dispatchEvent(configLoadedEvent);
        
        return true;
    } catch (error) {
        console.error('Error loading configuration:', error);
        
        // 설정 로드 실패 처리
        if (typeof window.handleConfigError === 'function') {
            window.handleConfigError();
        }
        
        return false;
    }
}

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



function handleLogin() {
    const loginUrl = `${config.domain}/login?lang=ko&response_type=code&client_id=${config.clientId}&redirect_uri=${config.redirectUri}`;
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
    console.log('received token successfully');
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
    console.log('userdata received');
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
                console.log('too many auth retries');
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
        enablePostLoginFeatures();
        initializeTarotDrawing();
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
        console.log('handle authentication complete');
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
    static REFRESH_THRESHOLD = 10 * 60; // 10분

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
            console.log('refresh token expired');
            return false;
        }

        // ID 또는 Access 토큰이 만료 임박한 경우
        if (now >= idExpiration - this.REFRESH_THRESHOLD * 1000 ||
            now >= accessExpiration - this.REFRESH_THRESHOLD * 1000) {
            try {
                await refreshTokens(refreshToken);
                conlsole.log('token refreshed');
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
    console.log('handlelogout');
}

function disablePreLoginFeatures() {
    // 새 대화 버튼 비활성화
    const newChatButton = document.getElementById('newChatButton');
    if (newChatButton) {
        newChatButton.disabled = true;
        newChatButton.style.cursor = 'not-allowed';
    }
    const collapsedNewChatBtn = document.getElementById('collapsedNewChatBtn');
    if (collapsedNewChatBtn) {
        collapsedNewChatBtn.disabled = true;
    }
    // 카드 뽑기 버튼 비활성화
    const drawTarotBtn = document.getElementById('drawTarotBtn');
    const drawTarotBtnIcon = document.getElementById('drawTarotBtnIcon')
    if (drawTarotBtn) {
        drawTarotBtn.disabled = true;
        drawTarotBtnIcon.style.opacity = 0.5;
    }
    // 프로필 모달 비활성화
    const ProfileBtn = document.getElementById('ProfileBtn')
    if(ProfileBtn) {
        ProfileBtn.disabled = true;
        ProfileBtn.style.cursor = 'not-allowed';
    }
    // 메시지 입력 필드 비활성화
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.disabled = true;
        messageInput.style.cursor = 'not-allowed';
    }
}

function enablePostLoginFeatures() {
    // 새 대화 버튼 활성화
    const newChatButton = document.getElementById('newChatButton');
    if (newChatButton) {
        newChatButton.disabled = false;
        newChatButton.style.cursor = 'pointer';
    }

    const collapsedNewChatBtn = document.getElementById('collapsedNewChatBtn');
    if (collapsedNewChatBtn) {
        collapsedNewChatBtn.disabled = false;
        collapsedNewChatBtn.style.cursor = 'pointer';
    }
    
    // 카드 뽑기 버튼 활성화
    const drawTarotBtn = document.getElementById('drawTarotBtn');
    const drawTarotBtnIcon = document.getElementById('drawTarotBtnIcon')
    if (drawTarotBtn) {
        drawTarotBtn.disabled = false;
        drawTarotBtn.style.cursor = 'pointer';
        drawTarotBtnIcon.style.opacity = 1;
    }
    const ProfileBtn = document.getElementById('ProfileBtn')
    if(ProfileBtn) {
        ProfileBtn.disabled = false;
        ProfileBtn.style.cursor = 'pointer';
    }

    // 메시지 입력 필드 활성화
    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.disabled = false;
        messageInput.style.cursor = 'text';
    }

    const beforelogin = document.getElementById('beforelogin');
    if (beforelogin) {
        beforelogin.style.display = "none";
    }

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
    chatBox.innerHTML = '<div class="message ai-message temporary-welcome"><div class="message-content">어떤 이야기를 하고 싶나요?</div></div>';
}

// WebSocket 연결 상태 체크
function isWebSocketConnected() {
    return socket !== null && socket.readyState === WebSocket.OPEN;
}

// 안전한 WebSocket 닫기
function safeCloseWebSocket() {
    if (socket) {
        try {
            // 이벤트 핸들러 제거하여 불필요한 콜백 방지
            socket.onopen = null;
            socket.onmessage = null;
            socket.onclose = null;
            socket.onerror = null;
            
            socket.close();
            console.log('WebSocket safely closed');
        } catch (e) {
            console.error('Error closing WebSocket:', e);
        } finally {
            socket = null;
        }
    }
}

// WebSocket 연결 및 세션 초기화 함수 수정
async function connectWebSocket() {
    // 이미 연결 중이면 큐에 추가하고 대기
    if (isConnecting) {
        return new Promise((resolve, reject) => {
            connectionQueue.push({ resolve, reject });
        });
    }
    
    isConnecting = true;
    
    try {
        // 기존 연결이 있으면 먼저 닫기
        if (socket) {
            console.log('Explicitly closing existing WebSocket connection');
            socket.onclose = null; // 이벤트 핸들러 제거
            socket.close();
            socket = null;
        }
        
        const accessToken = localStorage.getItem('access_token');
        if (!accessToken || !userId || !currentSessionId) {
            throw new Error('Missing required parameters for WebSocket connection');
        }
        
        const wsUrl = `${config.wsEndpoint}?token=${accessToken}&userId=${userId}&sessionId=${currentSessionId}`;
        console.log('Connecting WebSocket for session:', currentSessionId);
        
        socket = new WebSocket(wsUrl);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                socket.close();
                socket = null;
                isConnecting = false;
                reject(new Error('WebSocket connection timeout'));
            }, 5000);
            
            socket.onopen = function() {
                clearTimeout(timeout);
                console.log('WebSocket successfully connected for session:', currentSessionId);
                
                try {
                    initSession();
                } catch (error) {
                    console.error('Failed to send initSession message:', error);
                }
                
                isConnecting = false;
                
                // 대기 중인 연결 요청 처리
                while (connectionQueue.length > 0) {
                    const { resolve } = connectionQueue.shift();
                    resolve();
                }
                
                resolve();
            };
            
            socket.onmessage = function(event) {
                const data = JSON.parse(event.data);
                
                if (data.type === 'connection_replaced') {
                    console.log('Connection replaced by another client');
                    socket.close();
                    socket = null;
                    return;
                }
                
                handleIncomingMessage(data);
            };
            
            socket.onclose = function(event) {
                console.log('WebSocket closed:', event.code, event.reason);
                socket = null;
                isConnecting = false;
            };
            
            socket.onerror = function(error) {
                console.error('WebSocket error:', error);
                clearTimeout(timeout);
                socket = null;
                isConnecting = false;
                
                // 대기 중인 연결 요청에 에러 전파
                while (connectionQueue.length > 0) {
                    const { reject } = connectionQueue.shift();
                    reject(error);
                }
                
                reject(error);
            };
        });
    } catch (error) {
        isConnecting = false;
        throw error;
    }
}

// 세션 초기화 요청 함수 (새로 추가)
function initSession() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.error('WebSocket is not connected');
        return;
    }
    
    console.log('Initializing session:', currentSessionId);
    
    const payload = {
        action: 'initSession',
        userId: userId,
        sessionId: currentSessionId
    };
    
    socket.send(JSON.stringify(payload));
}

async function startNewChat() {
    // 기존 WebSocket 연결이 있으면 먼저 닫기
    if (socket) {
        console.log('Closing existing WebSocket connection before starting new chat');
        socket.close();
        socket = null;
    }
    
    if (currentSessionId) {
        await disconnectCurrentSession();
    }

    // 현재 세션 ID 초기화
    currentSessionId = null;
    
    // 채팅 박스 초기화
    document.getElementById('chatBox').innerHTML = '';
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
                document.getElementById('chatBox').innerHTML = '';
                appendMessage('ai', result.welcomeMessage);
            }

            isEmptySession = true;
            updateNewChatButtonState();

            console.log('Attempting WebSocket connection...');
            try {
                await connectWebSocket();
                console.log('WebSocket connection established');
            } catch (wsError) {
                console.error('Failed to establish WebSocket connection:', wsError);
                // WebSocket 연결 실패해도 계속 진행 (UI는 이미 업데이트됨)
                appendMessage('ai', '실시간 연결에 실패했습니다. 페이지를 새로고침해 주세요.');
            }
        } else {
            throw new Error('Session ID not received from server');
        }
    } catch (error) {
        console.error('Error in startNewChat:', error);
        appendMessage('ai', '새 대화를 시작하는데 실패했습니다. 다시 시도해 주세요.');
    } finally {
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
    
    // 마지막 전송 메시지 저장
    lastSentMessage = message;
    
    // 요청 ID 생성
    currentRequestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const payload = {
        action: 'sendMessage',
        message: message,
        userId: userId,
        sessionId: currentSessionId,
        requestId: currentRequestId
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
        displayWelcomeMessage();
        logger.logSessionFetch(userId, sessions.length);
 
        return sessions;
    } catch (error) {
        console.error('Error fetching sessions:', error);
        hideSessionLoadingIndicator();
        logger.logSessionFetch(userId, 0);
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
        
        // 현재 선택된 세션에 active 클래스 추가
        if (session.SessionId === currentSessionId) {
            sessionElement.classList.add('active');
        }
        
        // 로딩 중인 세션에 loading 클래스 유지
        if (session.SessionId === loadingSessionId) {
            sessionElement.classList.add('loading');
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
    console.log(`clicked session: ${sessionId}`)
    if (sessionId && sessionId !== currentSessionId) {
        // 중복 클릭 방지
        if (sessionElement.classList.contains('loading')) return;
        
        // 로딩 상태 저장
        loadingSessionId = sessionId;
        
        // 로딩 클래스 추가
        sessionElement.classList.add('loading');
        
        // 세션 로드
        loadSession(sessionId).finally(() => {
            // 로딩 완료 시 상태 초기화
            loadingSessionId = null;
            
            // loadSession이 완료된 후에만 로딩 클래스 제거
            const updatedElement = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
            if (updatedElement) {
                updatedElement.classList.remove('loading');
            }
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
        console.log('session deleted')

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
        console.log(`Disconnecting current session: ${currentSessionId}`);
        socket.close();
        socket = null; // 소켓 객체 명시적으로 초기화
        
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
                    
                // 3. 세션 삭제 - UI에서 먼저 해당 요소 제거
                const sessionToRemove = document.querySelector(`.session-item[data-session-id="${currentSessionId}"]`);
                if (sessionToRemove) {
                    sessionToRemove.remove();
                }
                
                console.log('Empty session deleted.');
                
                // 백그라운드에서 API 호출하여 서버에서 삭제
                fetch(`${config.restEndpoint}/sessions/${currentSessionId}?userId=${userId}`, {
                    method: 'DELETE',
                    credentials: 'include'
                }).catch(error => {
                    console.error('Error deleting empty session:', error);
                    // 에러 발생 시에만 세션 목록 새로고침
                    fetchSessions(userId);
                });
                
            }
        } catch (error) {
            console.error('Error handling session disconnect:', error);
        }
    }
}

// loadSession 함수 수정
async function loadSession(sessionId) {
    if (currentSessionId === sessionId) {
        return;
    }

    try {
        // 로딩 UI 설정
        const previousActive = document.querySelector('.session-item.active');
        if (previousActive) {
            previousActive.classList.remove('active');
        }
        
        const newActive = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
        if (newActive) {
            newActive.classList.add('active');
            newActive.classList.add('loading');
        }
        
        // WebSocket 연결 해제
        if (socket) {
            console.log('Closing previous WebSocket connection');
            socket.onclose = null; // 이벤트 핸들러 제거
            socket.close();
            socket = null;
        }
        
        // 현재 세션 연결 해제
        if (currentSessionId) {
            await disconnectCurrentSession();
        }
        
        // 세션 ID 업데이트
        currentSessionId = sessionId;
        
        // 채팅창 초기화 및 로딩 표시
        document.getElementById('chatBox').innerHTML = '';
        showTypingIndicator();
        
        // 1. REST API를 통해 세션 메시지 로드
        try {
            const token = localStorage.getItem('auth_token');
            if (!token) {
                throw new Error('No auth token available');
            }
            
            await ensureValidToken();
            
            console.log('Fetching session messages for session:', sessionId);
            const response = await fetch(`${config.restEndpoint}/sessions/${sessionId}?userId=${userId}`, {
                method: 'GET',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch session messages: ${response.status}`);
            }
            
            const messages = await response.json();
            console.log('Session messages loaded:', messages.length);
            
            // 메시지 표시
            hideTypingIndicator();
            
            if (Array.isArray(messages) && messages.length > 0) {
                displayMessages(messages);
                isEmptySession = checkEmptySession(messages);
            } else {
                displayWelcomeMessage();
                isEmptySession = true;
            }
            
            updateNewChatButtonState();
        } catch (error) {
            console.error('Error loading session messages:', error);
            hideTypingIndicator();
            appendMessage('ai', '대화 내역을 불러오는데 실패했습니다. 다시 시도해 주세요.');
            throw error;
        }
        
        // 2. REST API 로드가 성공한 후에만 WebSocket 연결 시도
        try {
            await connectWebSocket();
            console.log('loadSession success with WebSocket connected');
        } catch (wsError) {
            console.error('WebSocket connection error:', wsError);
            appendMessage('ai', '실시간 연결에 실패했습니다. 페이지를 새로고침해 주세요.');
        }
    } catch (error) {
        console.error('Error in loadSession:', error);
        currentSessionId = null;
        hideTypingIndicator();
        appendMessage('ai', '세션 로드에 실패했습니다. 다시 시도해 주세요.');
    } finally {
        // 로딩 상태 제거
        const loadingElement = document.querySelector(`.session-item[data-session-id="${sessionId}"]`);
        if (loadingElement) {
            loadingElement.classList.remove('loading');
        }
        loadingSessionId = null;
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
    const contentWrapper = document.getElementById('contentWrapper');
    const serviceguide = document.getElementById('serviceguide');
    
    if (window.innerWidth < 1200) {
        // 작은 화면에서는 접힌 사이드바로 전환
        sidebar.classList.add('slide-out');
        if (!collapsedSidebar.classList.contains('slide-in')) {
            collapsedSidebar.style.display = 'flex';
            setTimeout(() => {
                collapsedSidebar.classList.add('slide-in');
                contentWrapper.classList.add('collapsed');
                if (serviceguide) serviceguide.classList.add('collapsed');
            }, 10);
            setTimeout(() => {
                if (sidebar.classList.contains('slide-out')) {
                    sidebar.style.display = 'none';
                }
            }, 300);
        }
    }
}

function initializeTarotDrawing() {
    const drawTarotBtn = document.getElementById('drawTarotBtn');
    const tarotBottomSheet = document.getElementById('tarotBottomSheet');
    const bottomSheetContent = document.querySelector('.bottom-sheet-content');
    const drawOneBtn = document.getElementById('drawOneBtn');
    const drawThreeBtn = document.getElementById('drawThreeBtn');
    const tarotResult = document.getElementById('tarotResult');
    const copyResultBtn = document.getElementById('copyResultBtn');
    
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
    
    // 1개 뽑기 버튼 클릭 이벤트
    if (drawOneBtn) {
        drawOneBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 이벤트 버블링 방지
            const card = drawRandomCards(1);
            displayDrawnCards(card);
        });
    }
    
    // 3개 뽑기 버튼 클릭 이벤트
    if (drawThreeBtn) {
        drawThreeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 이벤트 버블링 방지
            const cards = drawRandomCards(3);
            displayDrawnCards(cards);
        });
    }
    
    // 복사 버튼 클릭 이벤트
    if (copyResultBtn) {
        copyResultBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 이벤트 버블링 방지
            copyToClipboard();
            // 복사와 동시에 출력된 결과 초기화
            const tarotResult = document.getElementById('tarotResult');
            if (tarotResult) {
                tarotResult.textContent = '';
                updateCopyButtonState();
            }
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
    
    // 바텀 시트 콘텐츠 영역 클릭 시 이벤트 버블링 방지
    if (bottomSheetContent) {
        bottomSheetContent.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
    
    // 바텀 시트 바깥 영역 클릭 시 닫히는 이벤트 추가
    document.addEventListener('click', (e) => {
        if (tarotBottomSheet && tarotBottomSheet.classList.contains('open') && 
            !drawTarotBtn.contains(e.target)) {
            closeTarotBottomSheet();
        }
    });
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
            const copyIcn = document.getElementById('copyResultIcon');
            if (copyIcn) {
                copyIcn.style.backgroundImage = "url('https://yihoon-tarotchat-bucket.s3.us-east-1.amazonaws.com/icons/copied.png')";
                setTimeout(() => {
                    copyIcn.style.backgroundImage = "url('https://yihoon-tarotchat-bucket.s3.us-east-1.amazonaws.com/icons/copy-card.png')";
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

// 툴팁 생성
const tooltip = document.createElement('div');
tooltip.className = 'tarot-tooltip';
tooltip.textContent = '카드 뽑기';
document.body.appendChild(tooltip);

// 버튼 호버 시 동작
function setupTooltip() {
    const drawTarotBtn = document.getElementById('drawTarotBtn');
    if (!drawTarotBtn) return;
    
    let hoverTimer;
    
    drawTarotBtn.addEventListener('mouseenter', () => {
      // Only show tooltip if button is not disabled
      if (drawTarotBtn.disabled) return;
      
      // Start timer on hover
      hoverTimer = setTimeout(() => {
        // Position the tooltip relative to the button
        const buttonRect = drawTarotBtn.getBoundingClientRect();
        tooltip.style.left = `${buttonRect.left}px`;
        tooltip.style.bottom = `${window.innerHeight - buttonRect.top + 10}px`;
        
        // Show tooltip
        tooltip.style.opacity = '1';
        tooltip.style.visibility = 'visible';
      }, 500); // 0.5 second delay
    });
    
    drawTarotBtn.addEventListener('mouseleave', () => {
      // Clear timer if mouse leaves before delay completes
      clearTimeout(hoverTimer);
      
      // Hide tooltip
      tooltip.style.opacity = '0';
      tooltip.style.visibility = 'hidden';
    });
  }

// Initialize tooltip after DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupTooltip);
} else {
  setupTooltip();
}

// If tooltip needs to be repositioned on window resize
window.addEventListener('resize', () => {
  const drawTarotBtn = document.getElementById('drawTarotBtn');
  if (drawTarotBtn && tooltip.style.visibility === 'visible') {
    const buttonRect = drawTarotBtn.getBoundingClientRect();
    tooltip.style.left = `${buttonRect.left}px`;
    tooltip.style.bottom = `${window.innerHeight - buttonRect.top + 10}px`;
  }
});

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
    // 이미 초기화되었으면 중복 실행 방지
    if (cardAutocompleteInitialized) return;
    
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
    
    // 초기화 완료 플래그 설정
    cardAutocompleteInitialized = true;
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
    
    // 마지막 slash 위치 찾기
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
    // 요청 ID 확인 및 처리
    const requestId = data.requestId;
    
    // 중복 요청 응답인 경우 무시
    if (data.type === "duplicate_request") {
        console.log(`중복 요청 감지: ${data.requestId}`);
        return;
    }
    
    // 이미 처리된 요청이거나 현재 요청이 아닌 경우 무시
    if (requestId && processedRequestIds.has(requestId) && data.type === 'stream') {
        console.log(`이미 처리된 요청: ${requestId}`);
        return;
    }
    
    // 현재 진행 중인 요청이 아니고, 스트림 시작인 경우 무시
    if (requestId && currentRequestId && requestId !== currentRequestId && data.type === 'stream') {
        console.log(`다른 요청 ID의 응답 무시: ${requestId}, 현재 요청: ${currentRequestId}`);
        return;
    }

    // 재시도 성공 시 재시도 메시지 및 인디케이터 제거
    if ((data.type === 'stream' || data.type === 'end') && retryMessageId) {
        removeRetryMessage();
    }

    if (data.type === 'stream') {
        const content = extractContent(data.content);
        const lastMessage = document.querySelector('.message:first-child:not(.retry-message)');
        
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
        
        // 스트림 종료 시 누적된 전체 메시지에 대해 타로 카드 처리 적용
        const lastMessage = document.querySelector('.message:first-child:not(.retry-message)');
        if (lastMessage && lastMessage.classList.contains('ai-message')) {
            const contentDiv = lastMessage.querySelector('.message-content');
            if (contentDiv) {
                const rawContent = contentDiv.innerText;
                const processedContent = processTarotCardNames(rawContent);
                contentDiv.innerHTML = processedContent.replace(/\n/g, '<br>');
            }
        }
        
        console.log('Stream ended');
        scrollToBottom();
        enableInput();
        
        // 성공적으로 완료되면 재시도 카운터 초기화
        resetRetryCounter();
        
        // 요청 ID가 있는 경우 처리 완료 표시
        if (requestId) {
            processedRequestIds.add(requestId);
            
            // 세트 크기 제한 (메모리 관리)
            if (processedRequestIds.size > 20) {
                const iterator = processedRequestIds.values();
                processedRequestIds.delete(iterator.next().value);
            }
            
            // 현재 요청 완료
            if (requestId === currentRequestId) {
                currentRequestId = null;
            }
        }
    } else if (data.type === 'error') {
        hideTypingIndicator();
        console.error('Error:', data.message);
        
        // 에러 메시지에 DB 재개 관련 내용이 포함되어 있는지 확인
        if (data.message.includes('Aurora DB instance') && data.message.includes('resuming')) {
            handleDBResumingError();
        } else {
            // 다른 종류의 에러는 그대로 표시
            enableInput();
            
            // 현재 요청 초기화 (다른 요청도 무시되지 않도록)
            if (requestId === currentRequestId) {
                currentRequestId = null;
            }
        }
    } else if (data.type === 'session_name_update') {
        updateSessionName(data.name);
        console.log(`세션명 업데이트됨: ${data.name}`);
    } else if (data.type === 'session_history') {
        // 세션 히스토리 수신 처리 (새로 추가)
        handleSessionHistory(data.history);
    }
}

// 세션 히스토리 처리 함수 (개선)
function handleSessionHistory(historyData) {
    try {
        // 이미 JSON 문자열인 경우 파싱
        const messages = typeof historyData === 'string' 
            ? JSON.parse(historyData) 
            : historyData;
        
        if (!Array.isArray(messages)) {
            console.error('Unexpected history format:', historyData);
            return;
        }
        
        console.log('Received session history via WebSocket:', messages.length, 'messages');
        
        // 이 함수는 WebSocket에서 session_history 타입 메시지를 받았을 때만 호출됨
        // REST API를 통해 이미 메시지를 로드했으므로 여기서는 새로운 메시지만 처리
        
        // 현재 메시지 목록이 비어있는 경우에만 메시지 표시
        const chatBox = document.getElementById('chatBox');
        if (chatBox && chatBox.childElementCount === 0 && messages.length > 0) {
            // 대화 내역 표시
            displayMessages(messages);
            
            // 세션이 비어있는지 확인
            isEmptySession = checkEmptySession(messages);
            updateNewChatButtonState();
            
            console.log('Displayed messages from WebSocket session history');
        } else {
            console.log('Skipping WebSocket session history display (messages already loaded)');
        }
    } catch (error) {
        console.error('Error handling session history:', error);
    }
}

function handleDBResumingError() {
    if (retryCount === 0) {
        // 첫 번째 에러 발생 시 준비 중 메시지 표시 (별도의 말풍선으로)
        retryMessageId = 'retry-' + Date.now();
        showRetryMessage();
    } else {
        // 이미 재시도 중인 경우 메시지 업데이트
        updateRetryMessage();
    }
    
    if (retryCount < maxRetries) {
        // 지수 백오프를 사용한 재시도
        const currentDelay = retryDelay * Math.pow(retryBackoffFactor, retryCount);
        console.log(`재시도 ${retryCount + 1}/${maxRetries}, ${currentDelay}ms 후 시도`);
        
        setTimeout(() => {
            retryCount++;
            // 재시도 메시지 업데이트
            updateRetryMessage();
            // 메시지 재전송
            retrySendMessage();
        }, currentDelay);
    } else {
        // 최대 재시도 횟수 초과
        if (retryMessageId) {
            removeRetryMessage();
            appendMessage('ai', '타로 책에 문제가 있나 봐요! 증상이 계속되면 제작자에게 문의해주세요.');
        }
        enableInput();
        resetRetryCounter();
    }
}

function showRetryMessage() {
    const chatBox = document.getElementById('chatBox');
    
    // 재시도 메시지 요소 생성
    const retryElement = document.createElement('div');
    retryElement.className = 'message ai-message retry-message';
    retryElement.id = retryMessageId;
    
    // 메시지 내용
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    contentElement.innerHTML = `타로 책을 펼치는 중이에요. 잠시만 기다려 주세요. (${retryCount+1}/${maxRetries})`;
    
    retryElement.appendChild(contentElement);
    
    // 타이핑 인디케이터 추가
    const indicatorElement = document.createElement('div');
    indicatorElement.className = 'retry-typing-indicator';
    retryElement.appendChild(indicatorElement);
    
    // 챗박스에 추가
    chatBox.insertBefore(retryElement, chatBox.firstChild);
    
    // 타이핑 인디케이터 애니메이션 - 제거
    // startRetryTypingIndicator(indicatorElement);
    
    scrollToBottom();
}

function startRetryTypingIndicator(container) {
    // 기존 인디케이터가 있으면 제거
    if (retryTypingIndicator) {
        retryTypingIndicator.destroy();
    }
    
    // Lottie 애니메이션 로드
    retryTypingIndicator = lottie.loadAnimation({
        container: container,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        path: 'https://lottie.host/e15076d7-141c-418d-bb17-02e547264ea0/IkeGLKFkDC.json'
    });
}

function updateRetryMessage() {
    const retryMessage = document.getElementById(retryMessageId);
    if (retryMessage) {
        const contentDiv = retryMessage.querySelector('.message-content');
        if (contentDiv) {
            contentDiv.innerHTML = `타로 책을 펼치는 중이에요. 잠시만 기다려 주세요. (${retryCount+1}/${maxRetries})`;
        }
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

// ID로 메시지 제거
function removeMessageById(messageId) {
    const message = document.querySelector(`.message[data-id="${messageId}"]`);
    if (message) {
        message.remove();
    }
}

// 메시지 재전송
function retrySendMessage() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
        try {
            connectWebSocket().then(() => {
                // 재연결 성공 시, 새 요청 ID 생성 (기존 ID 유지)
                const payload = {
                    action: 'sendMessage',
                    message: lastSentMessage,
                    userId: userId,
                    sessionId: currentSessionId,
                    requestId: currentRequestId // 기존 요청 ID 유지
                };
                socket.send(JSON.stringify(payload));
            }).catch(error => {
                console.error('WebSocket 재연결 실패:', error);
                handleDBResumingError(); // 재시도 로직 다시 실행
            });
        } catch (error) {
            console.error('WebSocket 재연결 시도 중 오류:', error);
            handleDBResumingError(); // 재시도 로직 다시 실행
        }
    } else {
        const payload = {
            action: 'sendMessage',
            message: lastSentMessage,
            userId: userId,
            sessionId: currentSessionId,
            requestId: currentRequestId // 기존 요청 ID 유지
        };
        socket.send(JSON.stringify(payload));
    }
}

function removeRetryMessage() {
    const retryMessage = document.getElementById(retryMessageId);
    if (retryMessage) {
        // 애니메이션 효과와 함께 제거
        retryMessage.style.opacity = '0';
        retryMessage.style.transform = 'translateY(-10px)';
        
        // 애니메이션 후 실제 요소 제거
        setTimeout(() => {
            retryMessage.remove();
        }, 300);
        
        // 타이핑 인디케이터 정리
        if (retryTypingIndicator) {
            retryTypingIndicator.destroy();
            retryTypingIndicator = null;
        }
    }
    retryMessageId = null;
}

function resetRetryCounter() {
    retryCount = 0;
    // 재시도 메시지가 있으면 제거
    if (retryMessageId) {
        removeRetryMessage();
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
        console.log(`message sent: ${message}`);
        showTypingIndicator();
        messageInput.value = '';
    }
}

function appendMessage(sender, message, messageId = null) {
    const chatBox = document.getElementById('chatBox');

    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}-message`;
    
    // 메시지 ID가 제공된 경우 데이터 속성 추가
    if (messageId) {
        messageElement.setAttribute('data-id', messageId);
    }
    
    const contentElement = document.createElement('div');
    contentElement.className = 'message-content';
    
    // AI 메시지인 경우 타로 카드 처리
    if (sender === 'ai') {
        const processedMessage = processTarotCardNames(message);
        contentElement.innerHTML = processedMessage.replace(/\n/g, '<br>');
    } else {
        contentElement.innerHTML = message.replace(/\n/g, '<br>');
    }
    
    messageElement.appendChild(contentElement);
    
    chatBox.insertBefore(messageElement, chatBox.firstChild);
    
    // AI 메시지인 경우 인디케이터 추가
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

//이미지 URL 생성
function getTarotCardImageUrl(cardName) {
  // 카드 이름과 위키미디어 URL을 직접 매핑하는 객체
  const cardImageUrls = {
    'The Fool': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/RWS_Tarot_00_Fool.jpg/120px-RWS_Tarot_00_Fool.jpg',
    'The Magician': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/RWS_Tarot_01_Magician.jpg/120px-RWS_Tarot_01_Magician.jpg',
    'The High Priestess': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/RWS_Tarot_02_High_Priestess.jpg/120px-RWS_Tarot_02_High_Priestess.jpg',
    'The Empress': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/RWS_Tarot_03_Empress.jpg/120px-RWS_Tarot_03_Empress.jpg',
    'The Emperor': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/RWS_Tarot_04_Emperor.jpg/120px-RWS_Tarot_04_Emperor.jpg',
    'The Hierophant': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/RWS_Tarot_05_Hierophant.jpg/120px-RWS_Tarot_05_Hierophant.jpg',
    'The Lovers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/RWS_Tarot_06_Lovers.jpg/120px-RWS_Tarot_06_Lovers.jpg',
    'The Chariot': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/RWS_Tarot_07_Chariot.jpg/120px-RWS_Tarot_07_Chariot.jpg',
    'Strength': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/RWS_Tarot_08_Strength.jpg/120px-RWS_Tarot_08_Strength.jpg',
    'The Hermit': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/RWS_Tarot_09_Hermit.jpg/120px-RWS_Tarot_09_Hermit.jpg',
    'Wheel of Fortune': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/RWS_Tarot_10_Wheel_of_Fortune.jpg/120px-RWS_Tarot_10_Wheel_of_Fortune.jpg',
    'Justice': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/RWS_Tarot_11_Justice.jpg/120px-RWS_Tarot_11_Justice.jpg',
    'The Hanged Man': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/RWS_Tarot_12_Hanged_Man.jpg/120px-RWS_Tarot_12_Hanged_Man.jpg',
    'Death': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/RWS_Tarot_13_Death.jpg/120px-RWS_Tarot_13_Death.jpg',
    'Temperance': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/RWS_Tarot_14_Temperance.jpg/120px-RWS_Tarot_14_Temperance.jpg',
    'The Devil': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/55/RWS_Tarot_15_Devil.jpg/120px-RWS_Tarot_15_Devil.jpg',
    'The Tower': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/53/RWS_Tarot_16_Tower.jpg/120px-RWS_Tarot_16_Tower.jpg',
    'The Star': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/RWS_Tarot_17_Star.jpg/120px-RWS_Tarot_17_Star.jpg',
    'The Moon': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7f/RWS_Tarot_18_Moon.jpg/120px-RWS_Tarot_18_Moon.jpg',
    'The Sun': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/RWS_Tarot_19_Sun.jpg/120px-RWS_Tarot_19_Sun.jpg',
    'Judgement': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dd/RWS_Tarot_20_Judgement.jpg/120px-RWS_Tarot_20_Judgement.jpg',
    'The World': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/RWS_Tarot_21_World.jpg/120px-RWS_Tarot_21_World.jpg',
    
    // 완드 (Wands)
    'Ace of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/11/Wands01.jpg/120px-Wands01.jpg',
    'Two of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0f/Wands02.jpg/120px-Wands02.jpg',
    'Three of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Wands03.jpg/120px-Wands03.jpg',
    'Four of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a4/Wands04.jpg/120px-Wands04.jpg',
    'Five of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Wands05.jpg/120px-Wands05.jpg',
    'Six of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/Wands06.jpg/120px-Wands06.jpg',
    'Seven of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Wands07.jpg/120px-Wands07.jpg',
    'Eight of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Wands08.jpg/120px-Wands08.jpg',
    'Nine of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4d/Tarot_Nine_of_Wands.jpg/120px-Tarot_Nine_of_Wands.jpg',
    'Ten of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Wands10.jpg/120px-Wands10.jpg',
    'Page of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Wands11.jpg/120px-Wands11.jpg',
    'Knight of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Wands12.jpg/120px-Wands12.jpg',
    'Queen of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/Wands13.jpg/120px-Wands13.jpg',
    'King of Wands': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Wands14.jpg/120px-Wands14.jpg',
    
    // 컵스 (Cups)
    'Ace of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/Cups01.jpg/120px-Cups01.jpg',
    'Two of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Cups02.jpg/120px-Cups02.jpg',
    'Three of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Cups03.jpg/120px-Cups03.jpg',
    'Four of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Cups04.jpg/120px-Cups04.jpg',
    'Five of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Cups05.jpg/120px-Cups05.jpg',
    'Six of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Cups06.jpg/120px-Cups06.jpg',
    'Seven of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Cups07.jpg/120px-Cups07.jpg',
    'Eight of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/60/Cups08.jpg/120px-Cups08.jpg',
    'Nine of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Cups09.jpg/120px-Cups09.jpg',
    'Ten of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/84/Cups10.jpg/120px-Cups10.jpg',
    'Page of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Cups11.jpg/120px-Cups11.jpg',
    'Knight of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Cups12.jpg/120px-Cups12.jpg',
    'Queen of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Cups13.jpg/120px-Cups13.jpg',
    'King of Cups': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/Cups14.jpg/120px-Cups14.jpg',
    
    // 소드 (Swords)
    'Ace of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Swords01.jpg/120px-Swords01.jpg',
    'Two of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Swords02.jpg/120px-Swords02.jpg',
    'Three of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Swords03.jpg/120px-Swords03.jpg',
    'Four of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Swords04.jpg/120px-Swords04.jpg',
    'Five of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Swords05.jpg/120px-Swords05.jpg',
    'Six of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Swords06.jpg/120px-Swords06.jpg',
    'Seven of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/34/Swords07.jpg/120px-Swords07.jpg',
    'Eight of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Swords08.jpg/120px-Swords08.jpg',
    'Nine of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Swords09.jpg/120px-Swords09.jpg',
    'Ten of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Swords10.jpg/120px-Swords10.jpg',
    'Page of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/Swords11.jpg/120px-Swords11.jpg',
    'Knight of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Swords12.jpg/120px-Swords12.jpg',
    'Queen of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Swords13.jpg/120px-Swords13.jpg',
    'King of Swords': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Swords14.jpg/120px-Swords14.jpg',
    
    // 펜타클 (Pentacles)
    'Ace of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Pents01.jpg/120px-Pents01.jpg',
    'Two of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9f/Pents02.jpg/120px-Pents02.jpg',
    'Three of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Pents03.jpg/120px-Pents03.jpg',
    'Four of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Pents04.jpg/120px-Pents04.jpg',
    'Five of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/96/Pents05.jpg/120px-Pents05.jpg',
    'Six of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a6/Pents06.jpg/120px-Pents06.jpg',
    'Seven of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/Pents07.jpg/120px-Pents07.jpg',
    'Eight of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/49/Pents08.jpg/120px-Pents08.jpg',
    'Nine of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Pents09.jpg/120px-Pents09.jpg',
    'Ten of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/42/Pents10.jpg/120px-Pents10.jpg',
    'Page of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Pents11.jpg/120px-Pents11.jpg',
    'Knight of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Pents12.jpg/120px-Pents12.jpg',
    'Queen of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/Pents13.jpg/120px-Pents13.jpg',
    'King of Pentacles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1c/Pents14.jpg/120px-Pents14.jpg'
  };

  // 카드 이름을 정확히 찾아 URL 반환
  if (cardImageUrls[cardName]) {
    return cardImageUrls[cardName];
  }
  
  // 찾지 못한 경우 경고 메시지와 함께 null 반환
  console.warn(`타로 카드 이미지를 찾을 수 없음: ${cardName}`);
  return null;
}

// 메시지 내용에서 타로 카드 이름 찾아 이미지 삽입
function processTarotCardNames(messageContent) {
    
    // 대괄호로 감싸진 카드 이름을 찾는 정규식 패턴
    const bracketPattern = /\[([^\]]+)\]/g;
    
    // 기존 패턴도 유지 (대괄호 패턴이 적용되지 않은 이전 메시지를 위해)
    const legacyPatterns = [
        /([^(]+)\s+\(([^)]+)\):/g,  // "현재 상황 (Eight of Wands):" 패턴
        /([^:]+):\s+([A-Z][a-zA-Z\s]+of\s+[A-Z][a-zA-Z]+|[A-Z][a-zA-Z\s]+)/g // "카드명: Eight of Wands" 패턴
    ];

    let processedContent = messageContent;
    
    // 1. 대괄호 패턴 처리 (새로운 형식)
    processedContent = processedContent.replace(bracketPattern, (match, cardName) => {
        // 카드 이름으로 이미지 URL 가져오기
        const imageUrl = getTarotCardImageUrl(cardName);
        if (imageUrl) {
        return `<div class="tarot-card-block">
                    <span class="tarot-card-name">[${cardName}]</span>
                    <img src="${imageUrl}" alt="${cardName}" class="tarot-card-image">
                </div>`;
        }
        return match; // 이미지 URL을 찾지 못한 경우 원본 텍스트 유지
    });
    
    // 2. 기존 패턴 처리 (이전 형식 호환성 유지)
    
    // 첫 번째 패턴: "xxx (카드이름):" 형식 처리
    // processedContent = processedContent.replace(legacyPatterns[0], (match, prefix, cardName) => {
    //   // 카드 이름이 매핑에 있는지 확인
    //   if (tarotCardMapping[cardName]) {
    //     const imageUrl = getTarotCardImageUrl(cardName);
    //     return `<div class="tarot-section">
    //               <div class="tarot-header">${prefix} (${cardName}):</div>
    //               <div class="tarot-card-container">
    //                 <img src="${imageUrl}" alt="${cardName}" class="tarot-card-image">
    //               </div>
    //             </div>`;
    //   }
    //   return match; // 매핑이 없으면 원본 텍스트 반환
    // });
    
    // 두 번째 패턴: "카드명: Eight of Wands" 형식 처리
    // processedContent = processedContent.replace(legacyPatterns[1], (match, prefix, cardName) => {
    //   if (tarotCardMapping[cardName]) {
    //     const imageUrl = getTarotCardImageUrl(cardName);
    //     return `<div class="tarot-section">
    //               <div class="tarot-header">${prefix}:</div>
    //               <div class="tarot-card-container">
    //                 <img src="${imageUrl}" alt="${cardName}" class="tarot-card-image">
    //                 <div class="tarot-card-name">${cardName}</div>
    //               </div>
    //             </div>`;
    //   }
    //   return match;
    // });
    
    return processedContent;
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
    const contentWrapper = document.getElementById('contentWrapper');
    const serviceguide = document.getElementById('serviceguide');
    const newchatBtn = document.getElementById('newChatButton');
    const collapsedNewChatBtn = document.getElementById('collapsedNewChatBtn');
    const collapsedSettingsBtn = document.getElementById('collapsedSettingsBtn');

    // 초기 설정
    if (window.innerWidth < 1200) {
        // 작은 화면에서는 접힌 사이드바로 시작
        sidebar.classList.add('slide-out');
        collapsedSidebar.classList.add('slide-in');
        collapsedSidebar.style.display = 'flex';
        contentWrapper.classList.add('collapsed');
        if (serviceguide) serviceguide.classList.add('collapsed');
    } else {
        // 큰 화면에서는 펼쳐진 사이드바로 시작
        sidebar.style.display = 'flex';
        collapsedSidebar.style.display = 'none';
    }

    // 접기 버튼 클릭 시
    if (collapseBtn && sidebar && collapsedSidebar) {
        collapseBtn.addEventListener('click', () => {
            // 펼쳐진 사이드바 슬라이드 아웃
            sidebar.classList.add('slide-out');
            
            // 접힌 사이드바 표시하고 슬라이드 인
            collapsedSidebar.style.display = 'flex';
            
            // 약간의 딜레이 후 애니메이션 적용 (DOM 렌더링 시간 고려)
            setTimeout(() => {
                collapsedSidebar.classList.add('slide-in');
                contentWrapper.classList.add('collapsed');
                if (serviceguide) serviceguide.classList.add('collapsed');
            }, 10);
            
            // 애니메이션 완료 후 처리
            setTimeout(() => {
                if (sidebar.classList.contains('slide-out')) {
                    sidebar.style.display = 'none';
                }
            }, 300); // 트랜지션 시간과 동일하게 설정
        });
    }

    // 펼치기 버튼 클릭 시
    if (expandBtn && sidebar && collapsedSidebar) {
        expandBtn.addEventListener('click', () => {
            // 접힌 사이드바 슬라이드 아웃
            collapsedSidebar.classList.remove('slide-in');
            
            // 펼쳐진 사이드바 표시하고 슬라이드 인
            sidebar.style.display = 'flex';
            
            // 약간의 딜레이 후 애니메이션 적용 (DOM 렌더링 시간 고려)
            setTimeout(() => {
                sidebar.classList.remove('slide-out');
                contentWrapper.classList.remove('collapsed');
                if (serviceguide) serviceguide.classList.remove('collapsed');
            }, 10);
            
            // 애니메이션 완료 후 처리
            setTimeout(() => {
                if (!collapsedSidebar.classList.contains('slide-in')) {
                    collapsedSidebar.style.display = 'none';
                }
            }, 300); // 트랜지션 시간과 동일하게 설정
        });
    }

    // 윈도우 크기 변경 이벤트 처리
    window.addEventListener('resize', () => {
        if (window.innerWidth < 1200) {
            if (!sidebar.classList.contains('slide-out')) {
                // 작은 화면에서 펼쳐진 사이드바가 있으면 접기
                sidebar.classList.add('slide-out');
                collapsedSidebar.style.display = 'flex';
                setTimeout(() => {
                    collapsedSidebar.classList.add('slide-in');
                    contentWrapper.classList.add('collapsed');
                    if (serviceguide) serviceguide.classList.add('collapsed');
                }, 10);
                setTimeout(() => {
                    if (sidebar.classList.contains('slide-out')) {
                        sidebar.style.display = 'none';
                    }
                }, 300);
            }
        }
    });

    // 새 대화 버튼 이벤트 핸들러
    if (newchatBtn) {
        newchatBtn.addEventListener('click', startNewChat);
    }

    if (collapsedNewChatBtn) {
        collapsedNewChatBtn.addEventListener('click', startNewChat);
    }

    if (collapsedSettingsBtn) {
        collapsedSettingsBtn.addEventListener('click', () => {
            const settingsBtn = document.getElementById('SettingsButton');
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
        // 1. 설정 로드
        const configLoaded = await loadConfig();
        if (!configLoaded) {
            console.error('Failed to load configuration');
            return;
        }

        // 2. 기본 이벤트 리스너 초기화를 먼저 수행
        initializeEventListeners();
        disablePreLoginFeatures();

        // 3. URL 파라미터 체크
        const urlParams = new URLSearchParams(window.location.search);
        const authCode = urlParams.get('code');

        if (authCode) {
            await handleAuthenticationFlow();
            return;
        }

        // 4. 인증 코드가 없는 경우 토큰 유효성 검증
        const isValid = await TokenManager.validateTokenSet();
        if (!isValid) {
            const beforelogin = document.getElementById('beforelogin');
            
            if (beforelogin) {
                beforelogin.style.display = "block";
                // 로그인 화면이 표시된 후에만 애니메이션 적용
                setTimeout(() => {
                    const beforeLoginElements = [
                        'bl_logo', 
                        'bl_title', 
                        'bl_subtitle', 
                        'extext1', 
                        'extext2', 
                        'extext3',
                        'LoginBtn'
                    ];
                    
                    beforeLoginElements.forEach(id => {
                        const element = document.getElementById(id);
                        if (element) {
                            element.classList.add('beforelogin-appear');
                        }
                    });
                }, 50); // 약간의 지연을 주어 DOM이 업데이트된 후 애니메이션 적용
            }
            return;
        }

        enablePostLoginFeatures();
        
        // 5. 유효한 토큰이 있는 경우의 초기화
        const idToken = localStorage.getItem('auth_token');
        if (idToken) {
            const tokenPayload = parseJwt(idToken);
            if (tokenPayload?.sub) {
                userId = tokenPayload.sub;
                localStorage.setItem('userId', userId);
                
                // UI 업데이트
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