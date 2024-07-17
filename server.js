const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.post('/create-app', (req, res) => {
    const prompt = req.body.prompt;
    console.log(`Received prompt: ${prompt}`);

    if (!prompt) {
        return res.status(400).json({ error: '프롬프트가 제공되지 않았습니다.' });
    }

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
                if (!file) {
                    alert('파일을 선택해주세요.');
                    return;
                }
                const formData = new FormData();
                formData.append('image', file);
                formData.append('prompt', "${prompt}");

                try {
                    const response = await fetch('/analyze', {
                        method: 'POST',
                        body: formData
                    });
                    if (!response.ok) {
                        throw new Error('서버 응답 오류');
                    }
                    const result = await response.json();
                    document.getElementById('result').innerText = result.analysis;
                } catch (error) {
                    console.error('분석 중 오류 발생:', error);
                    alert('이미지 분석 중 오류가 발생했습니다.');
                }
            }
        </script>
    </body>
    </html>
    `;

    const publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir);
    }
    fs.writeFileSync(path.join(publicDir, 'index.html'), htmlContent);

    console.log('Deploying to Firebase...');
    exec('firebase deploy --only hosting', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error during deployment: ${stderr}`);
            return res.status(500).json({ error: '배포 중 오류가 발생했습니다.', details: stderr });
        }
        console.log(`Deployment successful: ${stdout}`);
        
        const urlMatch = stdout.match(/Hosting URL:\s*(https:\/\/[^\s]+)/);
        const deployedUrl = urlMatch ? urlMatch[1] : null;

        if (deployedUrl) {
            res.json({ url: deployedUrl });
        } else {
            res.status(500).json({ error: '배포 URL을 찾을 수 없습니다.' });
        }
    });
});

app.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: '이미지 파일이 제공되지 않았습니다.' });
        }

        const imagePath = req.file.path;
        const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });

        if (!OPENAI_API_KEY) {
            throw new Error('OpenAI API 키가 설정되지 않았습니다.');
        }

        console.log('Sending image to OpenAI API...');
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: "gpt-4-vision-preview",
                messages: [
                    {
                        role: "user",
                        content: [
                            { type: "text", text: `미술시간에 그린 그림입니다. 학생의 작품을 분석해주세요: ${req.body.prompt}` },
                            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
                        ]
                    }
                ],
                max_tokens: 300
            },
            {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Received response from OpenAI API');
        res.json({ analysis: response.data.choices[0].message.content });
        fs.unlinkSync(imagePath);
    } catch (error) {
        console.error('Error analyzing image:', error);
        res.status(500).json({ error: '이미지 분석 중 오류가 발생했습니다.', details: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});