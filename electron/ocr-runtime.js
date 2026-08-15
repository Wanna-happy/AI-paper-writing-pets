const fs = require('fs');
const path = require('path');

const OCR_VERSION = 1;
const OCR_LANGUAGES = ['chi_sim', 'eng'];

class OcrRuntime {
  constructor({ assetsPath, cachePath }) {
    this.assetsPath = assetsPath;
    this.cachePath = cachePath;
    this.workerPromise = null;
  }

  getStatus() {
    const missing = OCR_LANGUAGES.filter((language) => {
      return !fs.existsSync(path.join(this.assetsPath, `${language}.traineddata.gz`))
        && !fs.existsSync(path.join(this.assetsPath, `${language}.traineddata`));
    });
    return {
      available: missing.length === 0,
      version: OCR_VERSION,
      languages: OCR_LANGUAGES,
      missing,
      assetsPath: this.assetsPath,
      error: missing.length ? `缺少本地 OCR 语言模型：${missing.join('、')}` : null,
    };
  }

  async getWorker() {
    const status = this.getStatus();
    if (!status.available) throw new Error(`${status.error}。请将对应 traineddata(.gz) 放入 assets/ocr。`);
    if (!this.workerPromise) {
      this.workerPromise = (async () => {
        const { createWorker } = require('tesseract.js');
        fs.mkdirSync(this.cachePath, { recursive: true });
        return createWorker(OCR_LANGUAGES, 1, {
          langPath: this.assetsPath,
          cachePath: this.cachePath,
          cacheMethod: 'readOnly',
          gzip: fs.existsSync(path.join(this.assetsPath, 'chi_sim.traineddata.gz')),
          logger: () => {},
        });
      })().catch((error) => {
        this.workerPromise = null;
        throw error;
      });
    }
    return this.workerPromise;
  }

  async recognizeImage(image) {
    const worker = await this.getWorker();
    const result = await worker.recognize(image);
    return {
      text: String(result.data?.text || '').replace(/\r\n/g, '\n').trim(),
      confidence: Number(result.data?.confidence) || 0,
    };
  }

  async recognizePdf(filePath, { maxPages = 80, scale = 2 } = {}) {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { createCanvas, DOMMatrix, ImageData, Path2D } = require('@napi-rs/canvas');
    globalThis.DOMMatrix ||= DOMMatrix;
    globalThis.ImageData ||= ImageData;
    globalThis.Path2D ||= Path2D;
    const data = new Uint8Array(fs.readFileSync(filePath));
    const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
    const pages = [];
    const confidence = [];
    for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPages); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const result = await this.recognizeImage(canvas.toBuffer('image/png'));
      if (result.text) pages.push(`[第 ${pageNumber} 页]\n${result.text}`);
      confidence.push(result.confidence);
    }
    return {
      text: pages.join('\n\n'),
      confidence: confidence.length ? confidence.reduce((sum, value) => sum + value, 0) / confidence.length : 0,
      pageCount: Math.min(pdf.numPages, maxPages),
      truncated: pdf.numPages > maxPages,
    };
  }

  async close() {
    if (!this.workerPromise) return;
    try {
      const worker = await this.workerPromise;
      await worker.terminate();
    } finally {
      this.workerPromise = null;
    }
  }
}

module.exports = { OCR_LANGUAGES, OCR_VERSION, OcrRuntime };
