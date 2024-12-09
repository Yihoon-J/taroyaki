import express from 'express';
import dotenv from 'dotenv';

dotenv.config(); // .env 파일 로드

const app = express();
const PORT = 3002;

// API 엔드포인트: 환경 변수 전달
app.get('/api/config', (req, res) => {
    res.json({
        apiUrl: process.env.API_URL,
        wsUrl: process.env.WS_URL
    });
});

// 정적 파일 제공
app.use(express.static('public'));

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});