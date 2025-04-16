/**
 * logger.js - 타로야키 서비스 로깅 모듈
 * 사용자 행동 패턴을 추적하고 분석하기 위한 로깅 기능을 제공합니다.
 */

class TaroyakiLogger {
    constructor(options = {}) {
        this.endpoint = options.endpoint || 'https://blgg29wto5.execute-api.us-east-1.amazonaws.com/product/logs';
        this.batchSize = options.batchSize || 10;
        this.flushInterval = options.flushInterval || 30000; // 30초마다 자동 플러시
        this.debugMode = options.debugMode || false;

        this.logQueue = [];
        this.lastFlush = Date.now();

        // 자동 플러시 타이머 설정
        this.timer = setInterval(() => this.flush(), this.flushInterval);

        // 페이지 언로드 시 로그 전송
        window.addEventListener('beforeunload', () => this.flush());
    }

    /**
     * 세션 로드 이벤트 로깅
     * @param {string} userId - 사용자 ID
     * @param {number} sessionCount - 로드된 세션 수
     */
    logSessionFetch(userId, sessionCount) {
        this._log({
            eventType: 'SESSION_FETCH',
            userId,
            timestamp: new Date().toISOString(),
            data: {
                sessionCount
            }
        });
    }

    /**
     * 내부 로깅 메소드
     * @private
     */
    _log(logEntry) {
        // 로그 대기열에 추가
        this.logQueue.push({
            ...logEntry,
            clientTimestamp: new Date().toISOString()
        });

        // 디버그 모드에서는 콘솔에 출력
        if (this.debugMode) {
            console.log('[TaroyakiLogger]', logEntry);
        }

        // 대기열이 배치 크기 이상이면 플러시
        if (this.logQueue.length >= this.batchSize) {
            this.flush();
        }
    }

    /**
     * 로그 대기열을 서버로 전송
     */
    async flush() {
        if (this.logQueue.length === 0) return;

        const logsToSend = [...this.logQueue];
        this.logQueue = [];
        this.lastFlush = Date.now();

        try {
            // 토큰이 있으면 인증된 요청으로 전송
            const accessToken = localStorage.getItem('access_token');
            const headers = {
                'Content-Type': 'application/json'
            };

            if (accessToken) {
                headers['Authorization'] = `Bearer ${accessToken}`;
            }

            await fetch(this.endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify({ events: logsToSend }) // logs를 events로 변경
            });

            if (this.debugMode) {
                console.log(`[TaroyakiLogger] ${logsToSend.length} logs sent successfully`);
            }
        } catch (error) {
            // 오류 발생 시 로그를 다시 대기열에 추가
            this.logQueue = [...logsToSend, ...this.logQueue];
            
            if (this.debugMode) {
                console.error('[TaroyakiLogger] Error sending logs:', error);
            }

            // 로컬 스토리지에 백업
            this._backupLogs(logsToSend);
        }
    }

    /**
     * 전송 실패한 로그를 로컬 스토리지에 백업
     * @private
     */
    _backupLogs(logs) {
        try {
            const existingBackup = JSON.parse(localStorage.getItem('taroyaki_log_backup') || '[]');
            const updatedBackup = [...existingBackup, ...logs];
            
            // 백업 크기 제한 (최대 100개)
            const trimmedBackup = updatedBackup.slice(-100);
            
            localStorage.setItem('taroyaki_log_backup', JSON.stringify(trimmedBackup));
        } catch (error) {
            console.error('[TaroyakiLogger] Failed to backup logs:', error);
        }
    }

    /**
     * 로컬 스토리지에 백업된 로그 복구 시도
     */
    recoverBackupLogs() {
        try {
            const backupLogs = JSON.parse(localStorage.getItem('taroyaki_log_backup') || '[]');
            
            if (backupLogs.length > 0) {
                this.logQueue = [...backupLogs, ...this.logQueue];
                localStorage.removeItem('taroyaki_log_backup');
                
                if (this.debugMode) {
                    console.log(`[TaroyakiLogger] Recovered ${backupLogs.length} logs from backup`);
                }
                
                // 로그 수가 많으면 즉시 플러시
                if (this.logQueue.length >= this.batchSize) {
                    this.flush();
                }
            }
        } catch (error) {
            console.error('[TaroyakiLogger] Failed to recover backup logs:', error);
        }
    }

    /**
     * 로거 정리 (타이머 해제)
     */
    dispose() {
        if (this.timer) {
            clearInterval(this.timer);
        }
        this.flush();
    }
}

// 싱글톤 인스턴스 생성 및 노출
const logger = new TaroyakiLogger({
    debugMode: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
});

// 초기화 시 백업 로그 복구 시도
logger.recoverBackupLogs();

export default logger;