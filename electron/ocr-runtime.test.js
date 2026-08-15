const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { OcrRuntime } = require('./ocr-runtime');
const { parseDocument } = require('./document-parser');

async function run() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-ocr-'));
  try {
    const runtime = new OcrRuntime({ assetsPath: folder, cachePath: path.join(folder, 'cache') });
    const status = runtime.getStatus();
    assert.strictEqual(status.available, false);
    assert.deepStrictEqual(status.missing, ['chi_sim', 'eng']);

    const imagePath = path.join(folder, 'scan.png');
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    const unavailable = await parseDocument(imagePath, { ocr: runtime });
    assert.strictEqual(unavailable.status, 'ocr-needed');
    assert.match(unavailable.error, /traineddata|语言模型/);

    const fakeOcr = { recognizeImage: async () => ({ text: '数字治理与公共服务可及性研究', confidence: 91 }) };
    const parsed = await parseDocument(imagePath, { ocr: fakeOcr });
    assert.strictEqual(parsed.status, 'parsed');
    assert.match(parsed.text, /数字治理/);
    assert.strictEqual(parsed.ocr.confidence, 91);

    const emptyOcr = { recognizeImage: async () => ({ text: '', confidence: 0 }) };
    const empty = await parseDocument(imagePath, { ocr: emptyOcr });
    assert.strictEqual(empty.status, 'parse-failed');
    assert.strictEqual(empty.text, '');
    console.log('ocr runtime test passed');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
