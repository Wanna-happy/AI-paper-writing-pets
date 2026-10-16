const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const spreadsheetFixture = require('./spreadsheet-fixture.cjs');
const { Document, Packer, Paragraph, TextRun, Header, Footer, Table, TableRow, TableCell, ImageRun } = require('docx');
const { createCanvas } = require('@napi-rs/canvas');
const { previewUpload } = require('../electron/upload-preview');
(async () => {
  const root = path.resolve(__dirname, '../.ui-smoke/native-office-' + Date.now()); fs.mkdirSync(root, { recursive: true });
  const canvas = createCanvas(400,100), context = canvas.getContext('2d'); context.fillStyle = '#166534'; context.fillRect(0,0,400,100); context.fillStyle = '#fff'; context.font = '28px Arial'; context.fillText('EMBEDDED FIGURE', 25,60);
  const children = [];
  for (let index = 1; index <= 5; index++) {
    children.push(new Paragraph({ pageBreakBefore: index > 1, children: [new TextRun({ text: 'Native Word Preview Page ' + index, bold: true, color: '1D4ED8', size: 42 })] }));
    children.push(new Paragraph('Full document content remains available. Page ' + index));
    children.push(new Table({ rows: [new TableRow({ children: ['Variable','Value','Notes'].map(text => new TableCell({ children: [new Paragraph(text)] })) }), new TableRow({ children: ['Policy','42','Original table layout'].map(text => new TableCell({ children: [new Paragraph(text)] })) })] }));
    children.push(new Paragraph({ children: [new ImageRun({ data: canvas.toBuffer('image/png'), type: 'png', transformation: { width: 300, height: 75 } })] }));
  }
  const document = new Document({ sections: [{ headers: { default: new Header({ children: [new Paragraph('ORIGINAL HEADER')] }) }, footers: { default: new Footer({ children: [new Paragraph('ORIGINAL FOOTER')] }) }, children }] });
  const word = path.join(root, 'layout.docx'); fs.writeFileSync(word, await Packer.toBuffer(document));
  const excel = path.join(root, 'layout.xlsx');
  const fixture=await spreadsheetFixture();fs.writeFileSync(excel,fixture.xlsx);fs.writeFileSync(path.join(root,'layout.xls'),fixture.xls);
  const originals = { word: fs.readFileSync(word), excel: fs.readFileSync(excel) };
  const project = { id: 'p', conversations: [{ id: 'c' }], projectFiles: [{ id: 'word', name: 'layout.docx' }, { id: 'excel', name: 'layout.xlsx' }] };
  const store = { loadWorkspace: () => ({ projects: [project] }) }, resolve = file => file.id === 'word' ? word : excel;
  const call = (id, page = 1, sheet = 0) => previewUpload({ store, projectId:'p',conversationId:'c',id,page,sheet,resolve });
  const first = await call('word'); assert.equal(first.type, 'docx'); assert.deepEqual(Buffer.from(first.dataBase64,'base64'), originals.word);
  const workbook = await call('excel'); assert.equal(workbook.type, 'spreadsheet');
  assert.deepEqual(Buffer.from(workbook.dataBase64,'base64'),originals.excel);
  const X=require('../src/vendor/xlsx.full.min.js'),parsed=X.read(Buffer.from(workbook.dataBase64,'base64'),{cellStyles:true});
  assert.equal(parsed.SheetNames.length,2);assert.equal(parsed.Sheets.SheetOne.AJ260.v,'R260C36');assert.equal(parsed.Sheets.SheetTwo.B3.w,'12.35%');
  assert.deepEqual(fs.readFileSync(word), originals.word); assert.deepEqual(fs.readFileSync(excel), originals.excel);
  fs.writeFileSync(path.resolve(__dirname, '../.ui-smoke/native-office-latest.json'), JSON.stringify({ root, word, excel }));
  console.log(JSON.stringify({ root, completeDocxPackage: true, sheets: parsed.SheetNames, officeRequired:false, beyondOldLimit: true, originalBytesUnchanged: true }));
})().catch(error => { console.error(error.diagnostic || error); process.exitCode = 1; });
