const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const personaPrompt = process.argv[2];  // 교사 입력 프롬프트

// HTML 템플릿 작성
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
    <script src="app.js"></script>
</body>
</html>
`;

const jsContent = `
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
`;

// 'public' 디렉토리 생성
if (!fs.existsSync('public')) {
    fs.mkdirSync('public');
}

// HTML 및 JavaScript 파일 생성
fs.writeFileSync(path.join(__dirname, 'public', 'index.html'), htmlContent);
fs.writeFileSync(path.join(__dirname, 'public', 'app.js'), jsContent);

// Firebase 배포
exec('firebase deploy', (err, stdout, stderr) => {
    if (err) {
        console.error(`Error during deployment: ${stderr}`);
        return;
    }
    console.log(`Deployment successful: ${stdout}`);
});
