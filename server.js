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

if (!OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set in .env file');
    process.exit(1); // Exit the application
} else {
    console.log('OPENAI_API_KEY is set');
}

// public 디렉토리에서 정적 파일 제공
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    console.log('Serving index.html');
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/create-app', (req, res) => {
    const prompt = req.body.prompt;
    console.log(`Received prompt: ${prompt}`);

    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI 작품 분석</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          h1 {
            color: #2c3e50;
            text-align: center;
          }
          .container {
            background-color: white;
            padding: 20px;
            border-radius: 5px;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
          }
          #uploadArea {
            border: 2px dashed #3498db;
            border-radius: 5px;
            padding: 20px;
            text-align: center;
            margin-bottom: 20px;
          }
          #imagePreview {
            max-width: 100%;
            margin-top: 20px;
          }
          button {
            background-color: #3498db;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
          }
          button:hover {
            background-color: #2980b9;
          }
          #result {
            margin-top: 20px;
            padding: 10px;
            background-color: #e8f6fd;
            border-radius: 4px;
          }
        </style>
    </head>
    <body>
      <h1>Art Class Drawing Analysis</h1>
      <div class="container">
        <div id="uploadArea">
          <p>Please take a picture of your artwork!</p>
          <input type="file" id="fileInput" accept="image/*" style="display: none;">
          <button onclick="document.getElementById('fileInput').click()">Upload Image</button>
        </div>
        <img id="imagePreview" style="display: none;">
        <button id="analyzeBtn" onclick="analyzeArtwork()" style="display: none;">Analyze</button>
        <div id="result"></div>
      </div>

      <script>
        document.getElementById('fileInput').addEventListener('change', function(event) {
          const file = event.target.files[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
              const img = document.getElementById('imagePreview');
              img.src = e.target.result;
              img.style.display = 'block';
              document.getElementById('analyzeBtn').style.display = 'block';
            }
            reader.readAsDataURL(file);
          }
        });

        async function analyzeArtwork() {
          document.getElementById('result').innerHTML = 'Analyzing your artwork...';
          const file = document.getElementById('fileInput').files[0];
          const formData = new FormData();
          formData.append('image', file);

          try {
            const response = await fetch('/analyze', {
              method: 'POST',
              body: formData
            });

            if (!response.ok) {
              throw new Error('Network response was not ok');
            }

            const result = await response.json();
            document.getElementById('result').innerHTML = \`
              <h3>Analysis Results:</h3>
              <ul>
                ${result.analysis.map(item => `<li>${item}</li>`).join('')}
              </ul>
              <p>Great job! Keep exploring and developing your artistic skills.</p>
            \`;
          } catch (error) {
            document.getElementById('result').innerHTML = 'Error analyzing image.';
            console.error('Error:', error);
          }
        }
      </script>
    </body>
    </html>
    `;

    try {
        fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), htmlContent);
        console.log('HTML content written to public/index.html');
    } catch (error) {
        console.error('Error writing HTML content:', error);
        res.status(500).json({ error: 'Error writing HTML content', details: error.message });
        return;
    }

    console.log('Deploying to Firebase...');
    exec('firebase deploy --only hosting', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error during deployment: ${stderr}`);
            res.status(500).json({ error: '배포 중 오류가 발생했습니다.', details: stderr });
            return;
        }
        console.log(`Deployment successful: ${stdout}`);
        
        const urlMatch = stdout.match(/Hosting URL:\s*(https:\/\/[^\s]+)/);
        const deployedUrl = urlMatch ? urlMatch[1] : null;

        if (deployedUrl) {
            console.log(`Deployed URL: ${deployedUrl}`);
            res.json({ url: deployedUrl });
        } else {
            console.error('Deployed URL not found');
            res.status(500).json({ error: '배포 URL을 찾을 수 없습니다.' });
        }
    });
});

app.post('/analyze', upload.single('image'), async (req, res) => {
    try {
        const imagePath = req.file.path;
        const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
        console.log('Image file read successfully');

        console.log('Sending image to OpenAI API...');
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

        console.log('Received response from OpenAI API');
        res.json({ analysis: response.data.choices[0].text });
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
