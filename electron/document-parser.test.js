const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const {
  extractBibtex,
  extractCsv,
  extractDocx,
  extractXlsx,
  parseDocument,
} = require('./document-parser');

async function createDocx(filePath) {
  const archive = new JSZip();
  archive.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
      <w:p><w:r><w:t>数字治理研究</w:t></w:r></w:p>
      <w:p><w:r><w:t>公共服务可及性得到改善。</w:t></w:r></w:p>
    </w:body></w:document>`);
  fs.writeFileSync(filePath, await archive.generateAsync({ type: 'nodebuffer' }));
}

async function createXlsx(filePath) {
  const archive = new JSZip();
  archive.file('xl/workbook.xml', `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="样本" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  archive.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0"?><Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`);
  archive.file('xl/sharedStrings.xml', `<?xml version="1.0"?><sst><si><t>地区</t></si><si><t>北京</t></si><si><t>上海</t></si></sst>`);
  archive.file('xl/worksheets/sheet1.xml', `<?xml version="1.0"?><worksheet><sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="inlineStr"><is><t>得分</t></is></c></row>
    <row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>92</v></c></row>
    <row r="3"><c r="A3" t="s"><v>2</v></c><c r="B3"><v>88</v></c></row>
  </sheetData></worksheet>`);
  fs.writeFileSync(filePath, await archive.generateAsync({ type: 'nodebuffer' }));
}

async function run() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-parser-'));
  try {
    const docxPath = path.join(folder, 'sample.docx');
    const xlsxPath = path.join(folder, 'sample.xlsx');
    const csvPath = path.join(folder, 'sample.csv');
    const bibPath = path.join(folder, 'sample.bib');
    const imagePath = path.join(folder, 'sample.png');
    await createDocx(docxPath);
    await createXlsx(xlsxPath);
    fs.writeFileSync(csvPath, '\uFEFF地区,年份,得分\n北京,2024,92\n上海,2024,88', 'utf8');
    fs.writeFileSync(bibPath, '@article{zhang2024, title={数字治理与公共服务}, author={张三 and 李四}, year={2024}, journal={公共管理评论}}', 'utf8');
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    const docx = await extractDocx(docxPath);
    assert.match(docx, /\[段落 1\]/);
    assert.match(docx, /公共服务可及性/);

    const csv = extractCsv(csvPath);
    assert.match(csv, /\[CSV 第 2 行\]/);
    assert.match(csv, /地区: 北京/);

    const xlsx = await extractXlsx(xlsxPath);
    assert.match(xlsx, /\[工作表 样本 · 第 2 行\]/);
    assert.match(xlsx, /A: 北京/);
    assert.match(xlsx, /B: 92/);

    const bibtex = extractBibtex(bibPath);
    assert.match(bibtex, /article:zhang2024/);
    assert.match(bibtex, /title: 数字治理与公共服务/);

    for (const filePath of [docxPath, csvPath, xlsxPath, bibPath]) {
      const result = await parseDocument(filePath);
      assert.strictEqual(result.status, 'parsed', `${path.extname(filePath)} should be parsed`);
      assert.ok(result.text.length >= 20);
    }
    const image = await parseDocument(imagePath);
    assert.strictEqual(image.status, 'ocr-needed');
    assert.match(image.error, /OCR/);
    console.log('document parser test passed');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
