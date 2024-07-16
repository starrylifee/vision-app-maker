const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const axios = require('axios');
require('dotenv').config();

const app = express();
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

// OpenAI API 설정
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/create-app', (req, res) => {
    const prompt = req.body.prompt;

    // 웹 애플리케이션 HTML 템플릿 생성
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI 작품 분석</title>
    </head>
    <body>
        <h1>작품을 찍어주세요!</h1>
        <input type="file" accept="image/*" capture="camera" id="upload">
        <button onclick="analyzeImage()">분석하기</button>
        <div id="result"></div>
        <script>
            async function analyzeImage() {
                const file = document.getElementById('upload').files[0];
                const formData = new FormData();
                formData.append('image', file);

                const response = await fetch('/analyze', {
                    method: 'POST',
                    body: formData
                });
                const result = await response.json();
                document.getElementById('result').innerText = result.analysis;
            }
        </script>
    </body>
    </html>
    `;

    // 'public' 디렉토리에 HTML 파일 저장
    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir);
    }
    fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

    // Firebase 배포
    exec('firebase deploy', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error during deployment: ${stderr}`);
            res.status(500).send('배포 중 오류가 발생했습니다.');
            return;
        }
        console.log(`Deployment successful: ${stdout}`);
        
        // 배포된 URL 추출
        const urlMatch = stdout.match(/Hosting URL:\s*(https:\/\/[^\s]+)/);
        const deployedUrl = urlMatch ? urlMatch[1] : '배포 URL을 찾을 수 없습니다.';
        
        res.json({ url: deployedUrl });
    });
});

app.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file.path;

        // 이미지 파일을 읽고 base64로 인코딩
        const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });

        // OpenAI API에 요청
        const response = await axios.post(
            'https://api.openai.com/v1/images/analyze',
            {
                prompt: `미술시간에 그린 그림입니다. 학생의 작품을 분석해주세요: ${req.body.prompt}`,
                image: imageBase64,
                model: 'gpt-4-vision'
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 분석 결과 반환
        res.json({ analysis: response.data.choices[0].text });

        // 업로드된 파일 삭제
        fs.unlinkSync(imagePath);
    } catch (error) {
        console.error('Error analyzing image:', error);
        res.status(500).send('이미지 분석 중 오류가 발생했습니다.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
