const {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  TextRun,
  FootnoteReferenceRun,
  ImageRun,
  PageNumber,
  Table,
  TableCell,
  TableRow,
} = require('docx');
const fs = require('fs');
const path = require('path');

const FONT_BODY = '宋体';
const FONT_HEADING = '黑体';
const FONT_LATIN = 'Times New Roman';
const PAGE = {
  size: { width: 11906, height: 16838 },
  // A4 thesis body: top/right/bottom 2.75 cm, left 3.10 cm, header/footer 1.27 cm.
  margin: { top: 1559, right: 1559, bottom: 1559, left: 1757, header: 720, footer: 720, gutter: 0 },
};

function textRun(text, options = {}) {
  return new TextRun({
    text,
    font: { ascii: FONT_LATIN, eastAsia: options.heading ? FONT_HEADING : FONT_BODY, hAnsi: FONT_LATIN },
    size: options.size || 28,
    bold: Boolean(options.bold),
    italics: Boolean(options.italics),
  });
}

function inlineRuns(text, options = {}) {
  return String(text || '').split(/(<strong>.*?<\/strong>|<em>.*?<\/em>|<sup\s+data-footnote="\d+">\d+<\/sup>)/g).filter(Boolean).map((part) => {
    if (part.startsWith('<strong>')) return textRun(stripHtml(part), { ...options, bold: true });
    if (part.startsWith('<em>')) return textRun(stripHtml(part), { ...options, italics: true });
    const footnote = part.match(/data-footnote="(\d+)"/);
    if (footnote) return new FootnoteReferenceRun(Number(footnote[1]));
    return textRun(stripHtml(part), options);
  });
}

function decodeHtml(text) {
  return String(text || '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

function readEmbeddedImage(source) {
  const match = String(source || '').match(/^data:(image\/(?:png|jpeg|svg\+xml));base64,([A-Za-z0-9+/=]+)$/i);
  if (match) {
    const mimeType = match[1].toLowerCase();
    return { data: Buffer.from(match[2], 'base64'), extension: mimeType === 'image/png' ? '.png' : mimeType === 'image/svg+xml' ? '.svg' : '.jpg' };
  }
  if (!fs.existsSync(source)) return null;
  return { data: fs.readFileSync(source), extension: path.extname(source).toLowerCase() };
}

function stripHtml(text) {
  return decodeHtml(String(text || '').replace(/<[^>]+>/g, ''));
}

function parsePaperHtml(content) {
  const source = String(content || '').replace(/<section\s+class="footnotes">[\s\S]*?<\/section>/gi, '');
  const blocks = [];
  const token = /<(h[1-3]|p|table|figure)(?:\s+[^>]*)?>[\s\S]*?<\/\1>/gi;
  let match;
  while ((match = token.exec(source))) {
    const html = match[0];
    const tag = match[1].toLowerCase();
    if (tag.startsWith('h')) {
      blocks.push({ type: 'heading', level: Number(tag[1]), text: html.replace(/^<[^>]+>|<\/[^>]+>$/g, '') });
    } else if (tag === 'p') {
      const className = (html.match(/class="([^"]+)"/) || [])[1] || '';
      blocks.push({ type: className.includes('table-title') ? 'table-title' : className.includes('table-note') ? 'table-note' : 'paragraph', text: html.replace(/^<[^>]+>|<\/p>$/g, '') });
    } else if (tag === 'table') {
      const header = [...html.matchAll(/<th>([\s\S]*?)<\/th>/gi)].map((item) => stripHtml(item[1]));
      const rows = [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)].slice(1).map((row) => [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/gi)].map((cell) => stripHtml(cell[1])));
      blocks.push({ type: 'table', header, rows });
    } else if (tag === 'figure') {
      const image = html.match(/<img\s+[^>]*src="([^"]+)"[^>]*>/i);
      const caption = html.match(/<figcaption>([\s\S]*?)<\/figcaption>/i);
      if (image) blocks.push({ type: 'image', src: decodeHtml(image[1]), caption: stripHtml(caption?.[1] || '') });
    }
  }
  return blocks;
}

function contentParagraph(block) {
  if (block.type === 'table') {
    const none = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    const row = (cells, bold = false) => new TableRow({
      children: cells.map((cell) => new TableCell({
        borders: { top: none, bottom: bold ? { style: BorderStyle.SINGLE, size: 4, color: '000000' } : none, left: none, right: none },
        children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [textRun(cell, { size: 20, bold })] })],
      })),
    });
    return new Table({
      rows: [row(block.header, true), ...block.rows.map((cells) => row(cells))],
      width: { size: 100, type: 'pct' },
      borders: {
        top: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
    });
  }
  if (block.type === 'image') {
    const image = readEmbeddedImage(block.src);
    if (!image) return new Paragraph({ children: [textRun(`图像文件不可用：${block.caption || block.src}`, { size: 20 })] });
    const extension = image.extension;
    if (extension !== '.png' && extension !== '.jpg' && extension !== '.jpeg' && extension !== '.svg') return new Paragraph({ children: [textRun(`图像格式暂不支持 Word 嵌入：${block.caption || block.src}`, { size: 20 })] });
    return [
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new ImageRun({ data: image.data, transformation: { width: 500, height: 310 }, type: extension === '.png' ? 'png' : extension === '.svg' ? 'svg' : 'jpg' })] }),
      ...(block.caption ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 80, after: 160 }, children: [textRun(block.caption, { size: 22 })] })] : []),
    ];
  }
  if (block.type === 'heading') {
    const levels = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3];
    const sizes = [36, 32, 28];
    return new Paragraph({
      heading: levels[block.level - 1],
      keepNext: true,
      alignment: block.level === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { before: block.level === 1 ? 360 : 240, after: 180, line: 420 },
      children: inlineRuns(block.text, { heading: true, size: sizes[block.level - 1], bold: true }),
    });
  }
  if (block.type === 'table-title') return new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 180, after: 80 }, children: inlineRuns(block.text, { bold: true }) });
  if (block.type === 'table-note') return new Paragraph({ alignment: AlignmentType.LEFT, spacing: { before: 60, after: 120 }, children: inlineRuns(block.text, { size: 20 }) });
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 560 },
    spacing: { after: 0, line: 420, lineRule: 'auto' },
    widowControl: true,
    children: inlineRuns(block.text),
  });
}

function createHeader(project) {
  return new Header({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    border: { bottom: { color: '808080', style: BorderStyle.SINGLE, size: 4, space: 4 } },
    children: [textRun(project.title || '论文项目', { size: 18 })],
  })] });
}

function createFooter() {
  return new Footer({ children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [textRun('— ', { size: 18 }), new TextRun({ children: [PageNumber.CURRENT], size: 18, font: FONT_LATIN }), textRun(' —', { size: 18 })],
  })] });
}

async function buildAcademicDocx(project, draft) {
  const blocks = parsePaperHtml(draft.content);
  const footnotes = {};
  for (const note of String(draft.content || '').matchAll(/<p\s+data-footnote="(\d+)"><sup>\d+<\/sup>\s*([\s\S]*?)<\/p>/g)) {
    footnotes[note[1]] = { children: [new Paragraph({ children: [textRun(stripHtml(note[2]), { size: 20 })] })] };
  }
  const document = new Document({
    creator: 'AI 论文宠物',
    title: draft.title || project.title || '论文内容',
    description: `${project.type || '学术论文'}当前交付内容`,
    styles: {
      default: { document: { run: { font: FONT_BODY, size: 28 }, paragraph: { spacing: { line: 420 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: '一级标题', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT_HEADING, size: 36, bold: true }, paragraph: { alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 360, after: 280 }, outlineLevel: 0 } },
        { id: 'Heading2', name: '二级标题', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT_HEADING, size: 32, bold: true }, paragraph: { keepNext: true, spacing: { before: 260, after: 180 }, outlineLevel: 1 } },
        { id: 'Heading3', name: '三级标题', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: FONT_HEADING, size: 28, bold: true }, paragraph: { keepNext: true, spacing: { before: 220, after: 140 }, outlineLevel: 2 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'academic-bullets', levels: [{ level: 0, format: LevelFormat.BULLET, text: '●', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
        { reference: 'academic-numbers', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
      ],
    },
    footnotes,
    sections: [{
      properties: { page: PAGE },
      headers: { default: createHeader(project) },
      footers: { default: createFooter() },
      children: blocks.length ? blocks.flatMap(contentParagraph) : [new Paragraph({ children: [textRun('') ] })],
    }],
  });
  return Packer.toBuffer(document);
}

module.exports = { buildAcademicDocx, parsePaperHtml };
