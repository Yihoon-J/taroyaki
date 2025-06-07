# 🔮 Taroyaki

[**Service URL**](https://dje3vsz99xjr1.cloudfront.net/) 비용 문제로 운영이 중단된 상태입니다. 기본적인 대화는 나눌 수 있으나 RAG가 동작하지 않아 리딩과 관련된 질의가 불가합니다.

> AI 기반 타로 카드 상담 챗봇

## 📖 프로젝트 소개

AI 기반의 타로 카드 상담 챗봇으로, 사용자가 타로 카드를 뽑아 그에 대한 상담을 수 있는 웹 애플리케이션입니다.

타로 카드를 쉽게 배우고, AI와의 대화를 통해 상황에 대한 상담을 받음은 물론, 타로 카드를 해석하는 방법을 배우는 데 도움을 주기 위해 설계되었습니다.

### ✨ 주요 기능

- **타로 카드 뽑기**: 78장의 완전한 타로 덱에서 1장 또는 3장 카드 선택
- **Claude Sonnet 3.5 V2 기반 에이전트**: 뽑은 카드를 바탕으로 상담 가능
- **실시간 채팅**: WebSocket 기반의 부드러운 대화
- **스마트 카드 입력**: 채팅창에서 `/`를 입력하면 나타나는 카드 자동완성 모달
- **반응형 디자인**: 데스크톱과 모바일 모든 환경 지원
- **카드 시각화**: 텍스트에서 카드 이미지를 추출하여 실시간 렌더링

## 🛠 기술 스택

### Frontend
- **JavaScript (ES6+)** - 메인 프로그래밍 언어
- **HTML5 & CSS3** - 마크업 및 스타일링
- **WebSocket** - 실시간 통신
- **Lottie** - 애니메이션 효과

### Backend & Infrastructure
- **AWS API Gateway** - REST API 및 WebSocket API 관리
- **AWS Lambda** - 서버리스 컴퓨팅
- **Amazon DynamoDB** - 세션 및 사용자 데이터 저장
- **Amazon Aurora** - PostgreSQL Vector RAG
- **AWS Cognito** - 사용자 인증 및 권한 관리

### Authentication
- **OAuth 2.0** - Cognito User Pool 기반 사용자 인증
- **OIDC** - Kakao 로그인 구현
- **JWT** - 토큰 기반 세션 관리
- **자동 토큰 갱신**

### Monitoring
- **Amazon Cloudwatch** - 백엔드 인프라 모니터링
- **Amazon Data Firehose** - 사용자 로그 스트림 저장
- **Amazon S3** - 사용자 로그 저장
- **Amazon Athena** - 로그 쿼리 플랫폼
- **Grafana** Cloudwatch Metrics 대시보드
- **Tableau** 사용자 로그 대시보드 *(구현 예정)*

## 🏗 아키텍처
![](https://i.ibb.co/C3T5VCtq/2025-06-07-18-13-48.png)

프로젝트는 Full serverless 아키텍처로 구성:

```
사용자 (Web Browser)
    ↓
AWS CloudFront (CDN)
    ↓
AWS API Gateway (REST + WebSocket)
    ↓
AWS Lambda Functions
    ↓ ↙ ↘
DynamoDB    Aurora DB    Bedrock
(세션관리)   (리딩 관련 RAG)  (AI 상담)
```

## 🚀 시작하기

### 필요 조건
- 최신 웹 브라우저
- 인터넷 연결

### 로컬 개발 환경 설정
```bash
# 저장소 클론
git clone https://github.com/your-username/taroyaki.git
cd taroyaki

# 정적 파일 서버 실행 (예: Python)
python -m http.server 8000

# 또는 Node.js를 사용하는 경우
npx serve .
```

**참고**: 환경 변수 및 AWS 설정은 보안상의 이유로 별도 제공되지 않습니다.

## 📱 사용 방법

1. **로그인**: Kakao 계정으로 로그인
2. **상담 요청**: 새 세션을 시작하고 자신의 고민을 이야기하기
3. **카드 뽑기**: 자신의 카드를 직접 뽑거나, 혹은 버튼을 클릭하여 카드 선택
4. **카드명 자동입력 입력**: 채팅창에서 `/`를 입력하면 카드 자동완성 모달 활성화
5. **세션 관리**: 좌측 사이드바에서 이전 상담 내역 확인 및 관리

## 🎨 Key Featrues

### 카드명 자동 입력 시스템
- `/` 입력 시 타로 카드 자동완성 모달 활성화
- 실시간 검색 및 필터링
- 키보드 내비게이션 지원

### 타로 카드 시각화
- 각 카드는 Wikimedia Commons의 이미지 렌더링

### 재시도 시스템  
- 네트워크 오류 및 RAG 휴면 상태일 경우 지수 백오프를 사용한 자동 재시도 (최대 4회)
- DB 재개 상황 감지 및 사용자 표시

### 반응형 사이드바 및 애니메이션
- 화면 크기에 따른 자동 접기/펼치기 구현
- 로그인 및 세션 로드 시 애니메이션 구현

### 세션 관리
- 실시간 세션 생성 및 관리
- 빈 세션 자동 정리
- 중복 연결 방지 및 안전한 WebSocket 관리

## 🔒 보안

- **OAuth 2.0** 기반 안전한 사용자 인증
- **JWT 토큰** 자동 갱신 (만료 10분 전 자동 리프레시)
- **CORS 정책** 적용으로 크로스 오리진 요청 제어
- **XSS 및 CSRF** 보호
- **토큰 유효성 검증** 및 자동 로그아웃
- **WebSocket 연결 보안** 및 중복 연결 차단

## 🎯 성능 최적화

- **서버리스 아키텍처**로 자동 스케일링
- **CloudFront CDN**을 통한 https 지원 및 글로벌 배포
- **지연 로딩** 및 **코드 스플리팅**
- **이미지 최적화** 및 **캐싱 전략**
- **WebSocket 연결 풀링** 및 **재연결 로직**

## 📊 모니터링 & 로깅

- **AWS CloudWatch**를 통한 실시간 모니터링 - Grafana 대시보드 구축
- **DynamoDB** 사용량 및 성능 메트릭
- **사용자 행동 분석** (세션 생성, 카드 뽑기, 메시지 전송) - Tableau 대시보드 구축

## 📄 라이선스

이 프로젝트는 [MIT License](LICENSE)하에 배포됩니다. 자유롭게 사용, 수정, 배포하실 수 있습니다.

```
MIT License

Copyright (c) 2024 Taroyaki

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## ⚡ 주의사항

이 애플리케이션은 **타로 교육 및 가벼운 리딩**을 목적으로 제작되었으며, 전문적인 상담이나 의사결정을 대체할 수 없습니다. 중요한 인생 결정은 반드시 전문가와 상의하시기 바랍니다.

본 Readme 파일은 Claude의 도움을 받아 작성되었음을 밝힙니다.
