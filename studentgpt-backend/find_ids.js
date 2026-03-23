const fs = require('fs');
const data = JSON.parse(fs.readFileSync('models.json', 'utf8'));
const qwenModels = data.data.filter(m => m.id.toLowerCase().includes('qwen'));
const deepseekModels = data.data.filter(m => m.id.toLowerCase().includes('deepseek'));

console.log('--- QWEN MODELS ---');
qwenModels.forEach(m => console.log(m.id));
console.log('--- DEEPSEEK MODELS ---');
deepseekModels.forEach(m => console.log(m.id));
