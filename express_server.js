import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config(); // .env 파일 로드

const app = express();
const PORT = 3002;


app.use(cors({
    origin: 'http://localhost:3001',  // 서비스가 실행되는 포트
    credentials: true
}));

// API 엔드포인트: 환경 변수 전달
app.get('/api/config', (req, res) => {
    res.json({
        message: 'Config fetched successfully',
        apiUrl: process.env.API_URL,
        wsUrl: process.env.WS_URL,
        redUri: process.env.REDIRECT_URI,
        cogDom: process.env.COGNITO_DOMAIN,
        cliId: process.env.CLIENT_ID,
        confURL: process.env.CONFIG_URL,
        flaUrl: process.env.FLASK_URL
    });
});

// 정적 파일 제공
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});