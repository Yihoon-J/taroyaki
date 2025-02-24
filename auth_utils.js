export const TokenManager = {
    setTokens(accessToken, refreshToken, expiresIn) {
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('tokenExpiry', Date.now() + (expiresIn * 1000));
    },
    
    getAccessToken() {
        return localStorage.getItem('accessToken');
    },
    
    getRefreshToken() {
        return localStorage.getItem('refreshToken');
    },
    
    getTokenExpiry() {
        return localStorage.getItem('tokenExpiry');
    },
    
    clearTokens() {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('tokenExpiry');
    },
    
    isTokenExpired() {
        const expiry = this.getTokenExpiry();
        return !expiry || Date.now() > expiry - 60000; // 1분 여유
    }
};