const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const appRoot=path.resolve(__dirname,'..'),output=path.join(appRoot,'.ui-smoke/upload-preview-ipc-20261016');app.setPath('userData',output);
app.whenReady().then(async()=>{
  let win;
  try{
    fs.mkdirSync(output,{recursive:true});
    const fixture=JSON.parse(fs.readFileSync(path.join(appRoot,'.ui-smoke/native-office-latest.json'),'utf8'));
    const {prepareConversationFiles}=require('../electron/conversation-files');
    const pdfBytes=require('./pdf-preview-fixture.cjs')();const pdfPath=path.join(output,'continuous.pdf');fs.writeFileSync(pdfPath,pdfBytes);
    const attachments=await prepareConversationFiles([fixture.word,fixture.excel,pdfPath]);
    const project={id:'p',conversations:[{id:'c'}],projectFiles:attachments.map(a=>({...a,projectId:'p',scope:'project'}))};
    let calls=0;
    ipcMain.handle('uploaded-file-preview',(event,projectId,conversationId,id,page,sheet)=>{
      require('../electron/app-security').assertTrustedSender(event,[win],appRoot);calls++;
      return require('../electron/upload-preview').previewUpload({store:{loadWorkspace:()=>({projects:[project]})},projectId,conversationId,id,page,sheet});
    });
    ipcMain.handle('file-bytes-preview',(event,payload)=>{require('../electron/app-security').assertTrustedSender(event,[win],appRoot);return require('../electron/upload-preview').previewEncodedBytes(payload);});
    ipcMain.handle('file-bytes-search',(event,payload)=>{require('../electron/app-security').assertTrustedSender(event,[win],appRoot);return require('../electron/upload-preview').searchEncodedDocument(payload);});
    win=new BrowserWindow({show:false,width:1500,height:1000,webPreferences:{preload:path.join(__dirname,'ui-smoke-preload.cjs'),sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true,backgroundThrottling:false,additionalArguments:['--real-upload-ipc']}});
    require('../electron/app-security').secureWindow(win,appRoot);
    win.webContents.on('console-message',event=>console.log('Renderer:',event.message));
    await win.loadFile(path.join(appRoot,'src/feed.html'));
    await win.webContents.executeJavaScript(`(async()=>{for(let i=0;i<100&&!settings;i++)await new Promise(r=>setTimeout(r,20));switchView('workbench');conversationAttachments=${JSON.stringify(attachments)};renderConversationAttachments();document.querySelector('#conversation-file-list .attachment-tile').click();})()`);
    async function frameReady(suffix,query){
      for(let i=0;i<200;i++){
        const frame=win.webContents.mainFrame.frames.find(f=>f.url.endsWith(suffix));
        if(frame&&await frame.executeJavaScript(query))return frame;
        await new Promise(r=>setTimeout(r,30));
      }throw new Error('Preview failed: '+await win.webContents.executeJavaScript(`el['empirical-preview-content'].textContent`));
    }
    let frame=await frameReady('/docx-preview.html',`document.querySelectorAll('section.docx').length===5`);
    const word=await frame.executeJavaScript(`({pages:document.querySelectorAll('section.docx').length,tables:document.querySelectorAll('table').length,images:document.querySelectorAll('img').length,last:document.body.textContent.includes('Native Word Preview Page 5'),ipc:!!window.petAPI})`);
    assert(word.pages===5&&word.tables===5&&word.images===5&&word.last&&!word.ipc);
    assert(await win.webContents.executeJavaScript(`!!document.querySelector('.preview-toolbar [aria-label="文档缩放"]')&&!el['empirical-preview-content'].querySelector('[aria-label="文档缩放"]')`));
    await win.webContents.executeJavaScript(`{const z=document.querySelector('[aria-label="文档缩放"]');z.value='150';z.dispatchEvent(new Event('change'));}`);
    for(let i=0;i<100;i++){if(await frame.executeJavaScript(`document.querySelector('.docx-wrapper').style.zoom==='1.5'`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await frame.executeJavaScript(`document.querySelector('.docx-wrapper').style.zoom==='1.5'`));
    await win.webContents.executeJavaScript(`{const z=document.querySelector('[aria-label="文档缩放"]');z.value='fit';z.dispatchEvent(new Event('change'));}`);
    await win.webContents.capturePage();await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(output,'word-right-panel.png'),(await win.webContents.capturePage()).toPNG());
    async function waitFor(query){for(let i=0;i<300;i++){if(await win.webContents.executeJavaScript(query))return;await new Promise(r=>setTimeout(r,30));}throw new Error('Condition timed out: '+query);}
    async function checkPdf(){
      await waitFor(`document.querySelectorAll('.pdf-preview-page').length===16`);
      assert(await win.webContents.executeJavaScript(`!el['empirical-preview-content'].querySelector('.reading-tools[open]')&&!!document.querySelector('.preview-toolbar [aria-label="文档缩放"]')&&!/上一页|下一页/.test(el['empirical-preview-content'].textContent)`));
      await win.webContents.executeJavaScript(`el['empirical-preview-content'].querySelector('[data-page="16"]').scrollIntoView()`);
      await waitFor(`!!el['empirical-preview-content'].querySelector('[data-page="16"][data-loaded="true"] img')`);
      await win.webContents.executeJavaScript(`{const zoom=document.querySelector('[aria-label="文档缩放"]');zoom.value='150';zoom.dispatchEvent(new Event('change'));}`);
      assert(await win.webContents.executeJavaScript(`document.querySelector('.pdf-continuous-pages').style.width==='1224px'`));
      assert(await win.webContents.executeJavaScript(`(()=>{const page=document.querySelector('.pdf-preview-page[data-page="16"]').getBoundingClientRect(),view=el['empirical-preview-content'].getBoundingClientRect();return page.top<view.bottom&&page.bottom>view.top;})()`),'缩放后应继续停留在正在阅读的末页');
    }
    await win.webContents.executeJavaScript(`document.querySelectorAll('#conversation-file-list .attachment-tile')[2].click()`);await checkPdf();
    await win.webContents.capturePage();await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(output,'pdf-upload-last-page.png'),(await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async()=>{const name='生成的分析报告.pdf',data=await window.petAPI.previewFileBytes({name,dataBase64:${JSON.stringify(pdfBytes.toString('base64'))}});renderArtifactPreview([{type:'text',name,filePreview:data,source:{kind:'generated-report'}}]);})()`);await checkPdf();
    await win.webContents.executeJavaScript(`{const host=node('div');el.conversation.append(host);ChatMarkdown.render(host,'[生成的清洗文件](artifact://preparation/clean-test)');host.querySelector('a').click();}`);
    let csvFrame=await frameReady('/spreadsheet-preview.html',`document.querySelector('[data-cell="A2"]')?.textContent==='1'`);
    assert(await win.webContents.executeJavaScript(`!!document.querySelector('.preview-toolbar [aria-label="文档缩放"]')&&!el['preview-open-menu'].hidden`));
    // An unsent upload can still be previewed with no conversation selected.
    await win.webContents.executeJavaScript(`workspace.projects[0].conversations=[];workspace.projects[0].activeConversationId=null;document.querySelectorAll('#conversation-file-list .attachment-tile')[1].dispatchEvent(new MouseEvent('click',{detail:2,bubbles:true}));`);
    frame=await frameReady('/spreadsheet-preview.html',`document.body.textContent.includes('完整格式预览')`);
    const locked=await win.webContents.executeJavaScript(`el['preview-open-menu'].hidden&&!el['empirical-preview'].hidden`);assert(locked);
    await win.webContents.executeJavaScript(`void openUploadedAttachment({id:'not-owned',name:'不可用.docx'})`);
    for(let i=0;i<100;i++){if(await win.webContents.executeJavaScript(`!!el['empirical-preview-content'].querySelector('[role="alert"]')`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await win.webContents.executeJavaScript(`!el['empirical-preview'].hidden&&!!el['empirical-preview-content'].querySelector('[role="alert"]')&&el['empirical-preview-content'].textContent.includes('重试预览')`));
    console.log(JSON.stringify({realImport:true,realIpcCalls:calls,productionSecurity:true,sandbox:true,word,uploadedPdf16Pages:true,generatedPdf16Pages:true,generatedCsvLink:true,zoom:true,unsentUpload:true,readOnly:locked,errorVisible:true}));
    win.destroy();app.exit(0);
  }catch(error){console.error(error.stack);if(win&&!win.isDestroyed()){fs.writeFileSync(path.join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());win.destroy();}app.exit(1);}
});
