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
