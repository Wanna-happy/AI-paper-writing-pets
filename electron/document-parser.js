const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const PARSER_VERSION = 2;
const MAX_TEXT_LENGTH = 500000;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
const SUPPORTED_EXTENSIONS = new Set(['.txt', '.md', '.pdf', '.docx', '.csv', '.xlsx', '.bib', ...IMAGE_EXTENSIONS]);

function decodeXml(value) {
  return String(value || '')
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripXml(value) {
  return decodeXml(String(value || '').replace(/<[^>]+>/g, ''));
}

function decodeTextBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.subarray(3).toString('utf8');
  const utf8 = buffer.toString('utf8');
  const replacementCount = (utf8.match(/\uFFFD/g) || []).length;
  if (replacementCount <= Math.max(1, Math.floor(utf8.length * 0.002))) return utf8;
  try {
    return new TextDecoder('gb18030').decode(buffer);
  } catch {
    return utf8;
  }
}

function trimText(text) {
  return String(text || '').replace(/\r\n/g, '\n').replace(/[ \t]+\n/g, '\n').trim().slice(0, MAX_TEXT_LENGTH);
}

async function extractPdf(filePath) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const pages = [];
  const pageLimit = Math.min(pdf.numPages, 200);
  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str).join(' ').replace(/\s+/g, ' ').trim();
    if (text) pages.push(`[第 ${pageNumber} 页]\n${text}`);
  }
  return trimText(pages.join('\n\n'));
}

function extractWordText(xml) {
  const blocks = String(xml || '').match(/<w:p\b[\s\S]*?<\/w:p>/g) || [];
  const paragraphs = [];
  for (const block of blocks) {
    const fragments = [];
    const tokens = block.match(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>|<w:tab\s*\/?>|<w:(?:br|cr)\s*\/?>/g) || [];
    for (const token of tokens) {
      if (/^<w:tab/.test(token)) fragments.push('\t');
      else if (/^<w:(?:br|cr)/.test(token)) fragments.push('\n');
      else fragments.push(stripXml(token));
    }
    const text = fragments.join('').replace(/[ \t]+/g, ' ').trim();
    if (text) paragraphs.push(`[段落 ${paragraphs.length + 1}]\n${text}`);
  }
  return trimText(paragraphs.join('\n\n'));
}

async function extractDocx(filePath) {
  const archive = await JSZip.loadAsync(fs.readFileSync(filePath));
  const documentFile = archive.file('word/document.xml');
  if (!documentFile) throw new Error('DOCX 中缺少 word/document.xml');
  return extractWordText(await documentFile.async('string'));
}

function parseDelimitedRows(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(field.trim());
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function detectDelimiter(text) {
  const sample = String(text || '').split(/\r?\n/, 6).join('\n');
  const candidates = [',', '\t', ';'];
  return candidates.map((delimiter) => ({ delimiter, count: sample.split(delimiter).length - 1 }))
    .sort((left, right) => right.count - left.count)[0].delimiter;
}

function formatTabularRows(rows, locationLabel) {
  if (!rows.length) return '';
  const headers = rows[0].map((value, index) => value || `第 ${index + 1} 列`);
  return trimText(rows.slice(1).map((row, index) => {
    const values = row.map((value, columnIndex) => value ? `${headers[columnIndex] || `第 ${columnIndex + 1} 列`}: ${value}` : '').filter(Boolean);
    return values.length ? `[${locationLabel(index + 2)}]\n${values.join('；')}` : '';
  }).filter(Boolean).join('\n\n'));
}

function extractCsv(filePath) {
  const source = decodeTextBuffer(fs.readFileSync(filePath));
  const rows = parseDelimitedRows(source, detectDelimiter(source));
  return formatTabularRows(rows, (rowNumber) => `CSV 第 ${rowNumber} 行`);
}

function getXmlAttribute(source, name) {
  const match = String(source || '').match(new RegExp(`\\b${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : '';
}

function normalizeZipTarget(target) {
  const source = String(target || '').replace(/^\//, '');
  const normalized = path.posix.normalize(source.startsWith('xl/') ? source : path.posix.join('xl', source));
  return normalized.startsWith('xl/') ? normalized : `xl/${path.posix.basename(normalized)}`;
}

function extractSharedStrings(xml) {
  return (String(xml || '').match(/<si\b[\s\S]*?<\/si>/g) || []).map((item) => {
    const textNodes = item.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) || [];
    return textNodes.map(stripXml).join('');
  });
}

function columnName(reference) {
  return String(reference || '').match(/[A-Z]+/i)?.[0]?.toUpperCase() || '';
}

function extractSheetRows(xml, sharedStrings) {
  const rows = [];
  const rowBlocks = String(xml || '').match(/<row\b[\s\S]*?<\/row>/g) || [];
  for (const rowBlock of rowBlocks) {
    const rowNumber = Number(getXmlAttribute(rowBlock.match(/^<row\b[^>]*>/)?.[0], 'r')) || rows.length + 1;
    const cells = [];
    const cellBlocks = rowBlock.match(/<c\b[\s\S]*?<\/c>/g) || [];
    for (const cellBlock of cellBlocks) {
      const openingTag = cellBlock.match(/^<c\b[^>]*>/)?.[0] || '';
      const reference = getXmlAttribute(openingTag, 'r');
      const type = getXmlAttribute(openingTag, 't');
      const rawValue = stripXml(cellBlock.match(/<v>[\s\S]*?<\/v>/)?.[0] || '');
      const inlineValue = (cellBlock.match(/<t(?:\s[^>]*)?>[\s\S]*?<\/t>/g) || []).map(stripXml).join('');
      const value = type === 's' ? (sharedStrings[Number(rawValue)] || '') : (inlineValue || rawValue);
      if (value) cells.push({ column: columnName(reference), value });
    }
    if (cells.length) rows.push({ rowNumber, cells });
  }
  return rows;
}

async function extractXlsx(filePath) {
  const archive = await JSZip.loadAsync(fs.readFileSync(filePath));
  const workbookFile = archive.file('xl/workbook.xml');
  const relationsFile = archive.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relationsFile) throw new Error('XLSX 工作簿结构不完整');
  const workbookXml = await workbookFile.async('string');
  const relationsXml = await relationsFile.async('string');
  const sharedFile = archive.file('xl/sharedStrings.xml');
  const sharedStrings = sharedFile ? extractSharedStrings(await sharedFile.async('string')) : [];
  const relations = new Map((relationsXml.match(/<Relationship\b[^>]*\/?>/g) || []).map((tag) => [
    getXmlAttribute(tag, 'Id'),
    normalizeZipTarget(getXmlAttribute(tag, 'Target')),
  ]));
  const sections = [];
  const sheetTags = workbookXml.match(/<sheet\b[^>]*\/?>/g) || [];
  for (const [sheetIndex, sheetTag] of sheetTags.entries()) {
    const sheetName = getXmlAttribute(sheetTag, 'name') || `工作表 ${sheetIndex + 1}`;
    const sheetPath = relations.get(getXmlAttribute(sheetTag, 'r:id'));
    const sheetFile = sheetPath ? archive.file(sheetPath) : null;
    if (!sheetFile) continue;
    const rows = extractSheetRows(await sheetFile.async('string'), sharedStrings);
    for (const row of rows) {
      const values = row.cells.map((cell) => `${cell.column || '列'}: ${cell.value}`);
      sections.push(`[工作表 ${sheetName} · 第 ${row.rowNumber} 行]\n${values.join('；')}`);
    }
  }
  return trimText(sections.join('\n\n'));
}

function extractBibtex(filePath) {
  const source = decodeTextBuffer(fs.readFileSync(filePath));
  const entries = [];
  for (let cursor = 0; cursor < source.length;) {
    const start = source.indexOf('@', cursor);
    if (start < 0) break;
    const opening = source.slice(start).match(/^@(\w+)\s*([({])/);
    if (!opening) {
      cursor = start + 1;
      continue;
    }
    const openCharacter = opening[2];
    const closeCharacter = openCharacter === '{' ? '}' : ')';
    let depth = 0;
    let quoted = false;
    let end = start + opening[0].length;
    for (; end < source.length; end += 1) {
      const character = source[end];
      if (character === '"' && source[end - 1] !== '\\') quoted = !quoted;
      if (quoted) continue;
      if (character === openCharacter) depth += 1;
      if (character === closeCharacter) {
        if (depth === 0) break;
        depth -= 1;
      }
    }
    const body = source.slice(start + opening[0].length, end).trim();
    const separator = body.indexOf(',');
    const citationKey = (separator >= 0 ? body.slice(0, separator) : body).trim();
    const fieldsSource = separator >= 0 ? body.slice(separator + 1) : '';
    const fields = [];
    const fieldPattern = /(\w[\w-]*)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|([^,\r\n]+))/g;
    for (const match of fieldsSource.matchAll(fieldPattern)) {
      fields.push(`${match[1]}: ${(match[2] || match[3] || match[4] || '').replace(/[{}]/g, '').trim()}`);
    }
    entries.push(`[BibTeX 条目 ${entries.length + 1} · ${opening[1]}:${citationKey || '未命名'}]\n${fields.join('；') || fieldsSource.trim()}`);
    cursor = Math.min(source.length, end + 1);
  }
  return trimText(entries.join('\n\n'));
}

async function parseDocument(filePath, options = {}) {
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    return { status: 'parse-failed', text: '', error: `暂不支持 ${extension || '无扩展名'} 格式` };
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    if (!options.ocr) return { status: 'ocr-needed', text: '', error: '图片资料需要本地 OCR' };
    try {
      const result = await options.ocr.recognizeImage(filePath);
      const recognizedText = trimText(result.text);
      return recognizedText.length >= 4
        ? { status: 'parsed', text: trimText(`[图片 OCR]\n${recognizedText}`), error: null, ocr: { confidence: result.confidence } }
        : { status: 'parse-failed', text: '', error: 'OCR 未识别到足够文字' };
    } catch (error) {
      return { status: 'ocr-needed', text: '', error: error.message };
    }
  }
  try {
    let text = '';
    if (extension === '.txt' || extension === '.md') text = trimText(decodeTextBuffer(fs.readFileSync(filePath)));
    else if (extension === '.pdf') {
      text = await extractPdf(filePath);
      if (text.length < 80 && options.ocr) {
        const result = await options.ocr.recognizePdf(filePath);
        text = trimText(result.text);
        if (text.length >= 80) return { status: 'parsed', text, error: null, ocr: { confidence: result.confidence, pageCount: result.pageCount, truncated: result.truncated } };
      }
    }
    else if (extension === '.docx') text = await extractDocx(filePath);
    else if (extension === '.csv') text = extractCsv(filePath);
    else if (extension === '.xlsx') text = await extractXlsx(filePath);
    else if (extension === '.bib') text = extractBibtex(filePath);
    const minimumLength = extension === '.pdf' ? 80 : 4;
    if (text.length < minimumLength) {
      const needsOcr = extension === '.pdf';
      return {
        status: needsOcr ? 'ocr-needed' : 'parse-failed',
        text,
        error: needsOcr ? 'PDF 未提取到足够文字，需要 OCR' : '未提取到足够的可检索文字',
      };
    }
    return { status: 'parsed', text, error: null };
  } catch (error) {
    return { status: 'parse-failed', text: '', error: error.message };
  }
}

module.exports = {
  PARSER_VERSION,
  decodeTextBuffer,
  extractBibtex,
  extractCsv,
  extractDocx,
  extractWordText,
  extractXlsx,
  parseDelimitedRows,
  parseDocument,
};
