const fs = require('node:fs'), path = require('node:path');
const JSZip = require('jszip');
const { resolveConversationAttachment } = require('./conversation-files');
async function previewUpload({ store, projectId, conversationId, id, page = 1, sheet = 0, resolve = resolveConversationAttachment }) {
  const project = store.loadWorkspace().projects.find(item => item.id === projectId);
  if (!project || (conversationId && !project.conversations?.some(item => item.id === conversationId))) throw new Error('对话不属于当前项目');
  const turns = conversationId ? [...(project.messages || []), ...(project.drafts || [])].filter(item => item.conversationId === conversationId) : [];
  const files = [...(project.projectFiles || []), ...turns.flatMap(item => item.attachments || [])];
  const file = files.find(item => item.id === id && (!item.projectId || item.projectId === projectId));
  const document=(project.documents||[]).find(item=>item.id===id);
  if (!file&&!document) throw new Error('文件不属于当前项目或对话');
  const source = file ? resolve(file) : document.storedPath;
  if (!source || !fs.existsSync(source)) throw new Error('上传文件已不可用');
  if (fs.statSync(source).size > 100 * 1024 * 1024) throw new Error('该文件超过预览大小限制');
  return previewBytes({bytes:fs.readFileSync(source),name:file?.name||document.name,extension:path.extname(source).toLowerCase(),page,sheet});
}
async function previewBytes({bytes,name,extension=path.extname(name||'').toLowerCase(),page=1,sheet=0}){
  if(!Buffer.isBuffer(bytes))bytes=Buffer.from(bytes);
  if(bytes.length>100*1024*1024)throw new Error('该文件超过预览大小限制');
  const result = { name, readOnly: true, format: extension };
  if (extension === '.docx') return { ...result, type: 'docx', dataBase64: bytes.toString('base64'), note: 'DOCX 原格式只读预览 · 完整文档，包含样式、表格、图片、页眉页脚。' };
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(extension)) return { ...result, type: 'image', dataUrl: `data:image/${extension === '.jpg' ? 'jpeg' : extension.slice(1)};base64,${bytes.toString('base64')}` };
  if (['.xlsx', '.xls', '.csv', '.tsv'].includes(extension)) {
    return { ...result, type: 'spreadsheet', dataBase64: bytes.toString('base64'), sheet, note: '本地只读表格预览 · 保留单元格样式，可查看全部工作表和行列。' };
  }
  if (extension === '.pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
    const resource=folder=>path.join(pdfRoot,folder).replaceAll('\\','/')+'/';
    const document = await pdfjs.getDocument({ data: new Uint8Array(bytes), disableWorker: true,standardFontDataUrl:resource('standard_fonts'),cMapUrl:resource('cmaps'),cMapPacked:true,wasmUrl:resource('wasm'),useSystemFonts:true }).promise;
    try {
      if (!Number.isInteger(page) || page < 1 || page > document.numPages) throw new Error('页码超出文档范围');
      const current = await document.getPage(page), size = current.getViewport({ scale: 1 });
      const viewport = current.getViewport({ scale: Math.min(1.5, 1800 / size.width, 2600 / size.height) });
      const { createCanvas } = require('@napi-rs/canvas');
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      await current.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      return { ...result, type: 'document', dataUrl: canvas.toDataURL('image/png'), page, totalPages: document.numPages, pageWidth:size.width,pageHeight:size.height,...(page===1?{dataBase64:bytes.toString('base64')}:{}), sheet: 0, sheets: [], note: '原版式只读预览 · 可连续浏览全部页面。' };
    } finally { await document.destroy(); }
  }
  if (extension === '.zip') {
    const archive = await JSZip.loadAsync(bytes);
    return { ...result, type: 'text', text: Object.keys(archive.files).join('\n'), note: '完整压缩包目录只读预览。' };
  }
  if (!['.txt', '.md', '.csv', '.tsv', '.json', '.py', '.r', '.bib', '.log'].includes(extension)) throw new Error('此类型暂不支持内嵌预览');
  return { ...result, type: 'text', text: bytes.toString('utf8'), note: '完整原文只读预览。' };
}
function previewEncodedBytes(payload){
  if(!payload||typeof payload.name!=='string'||typeof payload.dataBase64!=='string'||payload.dataBase64.length>140*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload.dataBase64))throw new Error('文件内容无效或超过预览限制');
  return previewBytes({name:payload.name,bytes:Buffer.from(payload.dataBase64,'base64'),page:payload.page??1});
}
async function searchEncodedDocument(payload){
  if(!payload||typeof payload.query!=='string'||!payload.query.trim()||payload.query.length>200||typeof payload.dataBase64!=='string'||payload.dataBase64.length>140*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(payload.dataBase64))throw new Error('查找内容或文件无效');
  const bytes=Buffer.from(payload.dataBase64,'base64');if(bytes.length>100*1024*1024)throw new Error('文件超过查找限制');
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs'),pdfRoot=path.dirname(require.resolve('pdfjs-dist/package.json'));
  const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),disableWorker:true,standardFontDataUrl:path.join(pdfRoot,'standard_fonts').replaceAll('\\','/')+'/'}).promise;
  const matches=[];try{for(let page=1;page<=doc.numPages;page++){const current=await doc.getPage(page),content=await current.getTextContent(),text=content.items.map(i=>i.str).join(' '),index=text.toLowerCase().indexOf(payload.query.trim().toLowerCase());if(index>=0)matches.push({page,excerpt:text.slice(Math.max(0,index-30),index+payload.query.length+70)});current.cleanup();}return {matches,totalPages:doc.numPages};}finally{await doc.destroy();}
}
module.exports = { previewUpload,previewBytes,previewEncodedBytes,searchEncodedDocument };
