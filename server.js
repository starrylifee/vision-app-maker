const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const multer = require('multer');
const OpenAI = require('openai');
const cors = require('cors');
const axios = require('axios');
const { GoogleAuth } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY is not set in .env file');
  process.exit(1); 
} else {
  console.log('OPENAI_API_KEY is set');
}

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  console.log('Serving index.html');
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.post('/create-app', async (req, res) => {
  const prompt = req.body.prompt;
  console.log(`Received prompt: ${prompt}`);

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <base href="/">
    <title>Art Class Drawing Analysis</title>
    <style>
      body {
        font-family: Arial, sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 800px;
        margin: 0 auto;
        padding: 20px;
        background-color: #f0f0f0;
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
              \${result.analysis.map(item => \`<li>\${item}</li>\`).join('')}
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
    fs.writeFileSync(path.join(__dirname, 'public', 'student.html'), htmlContent);
    console.log('HTML content written to public/student.html');
  } catch (error) {
    console.error('Error writing HTML content:', error.message);
    res.status(500).json({ error: 'Error writing HTML content', details: error.message });
    return;
  }

  console.log('Deploying to Firebase...');
  exec('firebase deploy --only hosting --json', async (err, stdout, stderr) => {
    if (err) {
      console.error(`Error during deployment: ${stderr}`);
      res.status(500).json({ error: '배포 중 오류가 발생했습니다.', details: stderr });
      return;
    }

    try {
      const outputJson = JSON.parse(stdout);
      const versionPath = outputJson.result?.hosting;

      if (versionPath) {
        const actualVersionName = versionPath.split('/').pop();
        const projectId = 'vision-app-maker';
        const apiUrl = `https://firebasehosting.googleapis.com/v1beta1/projects/${projectId}/sites/vision-app-maker/versions/${actualVersionName}`;

        async function getAccessToken() {
          const auth = new GoogleAuth({
            keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
            scopes: ['https://www.googleapis.com/auth/firebase.hosting']
          });
          const client = await auth.getClient();
          const accessToken = await client.getAccessToken();
          return accessToken.token;
        }

        const accessToken = await getAccessToken();

        try {
          const response = await axios.get(apiUrl, {
            headers: {
              Authorization: `Bearer ${accessToken}`
            }
          });

          const deployedUrl = response.data.config.previewUrl;
          console.log(`Deployed URL: ${deployedUrl}`);
          res.json({ url: deployedUrl });
        } catch (error) {
          console.error('Error fetching deployed URL:', error.message);
          res.status(500).json({ error: '배포 URL을 가져오는 중 오류가 발생했습니다.' });
        }
      } else {
        res.status(500).json({ error: '배포 URL을 찾을 수 없습니다.' });
      }
    } catch (parseError) {
      console.error('Error parsing Firebase CLI output:', parseError.message);
      res.status(500).json({ error: 'Firebase CLI 출력 분석 중 오류가 발생했습니다.' });
    }
  });
});

app.post('/analyze', upload.single('image'), async (req, res) => {
  const image = req.file;

  if (!image) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  try {
    const analysis = await openai.createImageAnalysis({ image: fs.createReadStream(image.path) });
    res.json({ analysis });
  } catch (error) {
    console.error('Error analyzing image:', error.message);
    res.status(500).json({ error: 'Error analyzing image', details: error.message });
  } finally {
    fs.unlinkSync(image.path);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
