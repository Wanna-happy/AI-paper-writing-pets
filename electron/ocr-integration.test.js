const assert = require('assert');
const path = require('path');
const os = require('os');
const { createCanvas } = require('@napi-rs/canvas');
const { OcrRuntime } = require('./ocr-runtime');
async function test() {
  const ocr = new OcrRuntime({ assetsPath: path.resolve(__dirname, '../assets/ocr'), cachePath: path.join(os.tmpdir(), 'paper-pet-ocr-test') });
  assert.equal(ocr.getStatus().available, true);
  const canvas = createCanvas(1000, 180);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1000, 180);
  ctx.fillStyle = 'black'; ctx.font = '48px Arial';
  ctx.fillText('Academic research evidence 2026', 24, 85);
  ctx.font = '40px "Microsoft YaHei"';
  ctx.fillText('学术研究需要真实证据', 24, 150);
  try {
    const result = await ocr.recognizeImage(canvas.toBuffer('image/png'));
    assert.match(result.text, /research/i);
    assert.match(result.text, /2026/);
    assert(result.text.replace(/\s/g, '').includes('研究'));
    console.log('offline OCR real model recognition passed');
  } finally { await ocr.close(); }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
