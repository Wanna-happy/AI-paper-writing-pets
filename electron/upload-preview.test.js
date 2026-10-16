const assert = require('node:assert/strict'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const JSZip = require('jszip');
const { previewUpload } = require('./upload-preview');
const { expandPaths } = require('./project-files');
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'upload-preview-'));
  const files = [], project = { id: 'p', conversations: [{ id: 'c' }], projectFiles: files };
  const store = { loadWorkspace: () => ({ projects: [project] }) };
  async function preview(name, bytes, options = {}) {
    fs.writeFileSync(path.join(root, name), bytes); const id = 'f' + files.length; files.push({ id, name, projectId: 'p' });
    const result = await previewUpload({ store, projectId: 'p', conversationId: 'c', id, resolve: file => path.join(root, file.name), ...options });
    assert.equal(result.readOnly, true); assert.deepEqual(fs.readFileSync(path.join(root, name)), Buffer.from(bytes)); return result;
  }
  try {
    const csv=await preview('data.csv','x,y\n1,2');assert.equal(csv.type,'spreadsheet');assert.equal(Buffer.from(csv.dataBase64,'base64').toString(),'x,y\n1,2');
    const unsent=await previewUpload({store,projectId:'p',id:'f0',resolve:file=>path.join(root,file.name)});assert.equal(unsent.type,'spreadsheet');
    const doc = new JSZip(); doc.file('word/document.xml', '<w:document><w:p><w:t>只读原文</w:t></w:p></w:document>');
    const docBytes = await doc.generateAsync({ type: 'nodebuffer' });
    const wordPreview = await preview('paper.docx', docBytes);
    assert.equal(wordPreview.type, 'docx'); assert.deepEqual(Buffer.from(wordPreview.dataBase64, 'base64'), docBytes);
    const book = new JSZip(); book.file('xl/sharedStrings.xml','<sst><si><t>变量</t></si></sst>'); book.file('xl/worksheets/sheet1.xml','<worksheet><row><c r="A1" t="s"><v>0</v></c><c r="B1"><v>7</v></c></row></worksheet>');
    const bookBytes=await book.generateAsync({type:'nodebuffer'}),bookPreview=await preview('data.xlsx',bookBytes);
    assert.equal(bookPreview.type,'spreadsheet');assert.deepEqual(Buffer.from(bookPreview.dataBase64,'base64'),bookBytes);
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R 5 0 R 7 0 R 9 0 R 11 0 R] /Count 5 >>'];
    for(let index=0;index<5;index++)objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents ${4+index*2} 0 R >>`,'<< /Length 0 >>\nstream\n\nendstream');
    let pdf = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const xref = Buffer.byteLength(pdf), count=objects.length+1; pdf += `xref\n0 ${count}\n0000000000 65535 f \n` + offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
    const lastPdfPage=await preview('paper.pdf', pdf,{page:5});assert(lastPdfPage.dataUrl.startsWith('data:image/png;base64,'));assert.equal(lastPdfPage.totalPages,5);assert.equal(lastPdfPage.page,5);
    await assert.rejects(preview('paper.pdf',pdf,{page:6}),/页码超出/);
    assert.equal((await preview('long.txt', '完整文本'.repeat(60000))).text.length, 240000);
    project.documents=[{id:'library-only',name:'library.txt',storedPath:path.join(root,'library.txt')}];fs.writeFileSync(project.documents[0].storedPath,'资料库原文');
    assert.equal((await previewUpload({store,projectId:'p',conversationId:'c',id:'library-only'})).text,'资料库原文');
    project.documents=[];await assert.rejects(()=>previewUpload({store,projectId:'p',conversationId:'c',id:'library-only'}),/不属于当前项目/);
    await assert.rejects(previewUpload({ store, projectId: 'other', conversationId: 'c', id: 'f0' }), /不属于当前项目/);
    await assert.rejects(previewUpload({ store, projectId: 'p', conversationId: 'c', id: '../secret' }), /不属于当前项目/);
    fs.mkdirSync(path.join(root, '.venv-thesis', 'Lib'), { recursive: true }); fs.writeFileSync(path.join(root, '.venv-thesis', 'Lib', 'internal.py'), 'secret');
    assert(!expandPaths([root]).files.some(file => file.path.includes('.venv-thesis')));
    console.log('Read-only Word/Excel/text previews, unchanged bytes, upload ownership and virtualenv folder filtering passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
