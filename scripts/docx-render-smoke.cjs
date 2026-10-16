const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.ui-smoke/docx-render'); app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({ show: false, width: 1540, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, sandbox: false, backgroundThrottling: false } });
    win.webContents.on('console-message', (_event, _level, message) => console.log('Browser:', message));
    require('../electron/app-security').secureWindow(win,path.resolve(__dirname,'..'));
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    await win.webContents.executeJavaScript(`(async () => { for(let i=0;i<100&&!document.querySelector('.assistant-reply');i++)await new Promise(r=>setTimeout(r,20)); switchView('workbench'); await openUploadedAttachment({id:'real-docx',name:'完整格式.docx'}); el['preview-expand'].click(); })()`);
    let frame;
    for (let i = 0; i < 100; i++) {
      frame = win.webContents.mainFrame.frames.find(item => item.url.endsWith('/docx-preview.html'));
      const rendered = frame && await frame.executeJavaScript(`document.querySelectorAll('section.docx').length`);
      if (rendered >= 5) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!frame) throw new Error('DOCX frame did not load');
    const result = await frame.executeJavaScript(`({pages:document.querySelectorAll('section.docx').length,tables:document.querySelectorAll('table').length,images:document.querySelectorAll('img').length,header:document.body.textContent.includes('ORIGINAL HEADER'),footer:document.body.textContent.includes('ORIGINAL FOOTER'),last:document.body.textContent.includes('Native Word Preview Page 5'),styled:[...document.querySelectorAll('span')].some(item=>getComputedStyle(item).color==='rgb(29, 78, 216)'),editable:!!document.querySelector('[contenteditable="true"],textarea')})`);
    assert(result.pages >= 5 && result.tables >= 5 && result.images >= 5 && result.header && result.footer && result.last && result.styled && !result.editable, JSON.stringify(result));
    await win.webContents.executeJavaScript(`document.querySelector('.docx-native-frame').contentWindow.postMessage({type:'preview-find',query:'Native Word Preview Page 5',index:0},'*')`);
    for(let i=0;i<100;i++){if(await frame.executeJavaScript(`!!document.querySelector('.preview-search-hit')`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await frame.executeJavaScript(`document.querySelector('.preview-search-hit').textContent.includes('Native Word Preview Page 5')`));
    await win.webContents.capturePage(); await new Promise(resolve => setTimeout(resolve, 500)); fs.writeFileSync(path.join(root,'first-page.png'), (await win.webContents.capturePage()).toPNG());
    await frame.executeJavaScript(`document.querySelectorAll('section.docx')[4].scrollIntoView()`);
    await new Promise(resolve => setTimeout(resolve, 400)); fs.writeFileSync(path.join(root,'last-page.png'), (await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({...result,findInDocument:true})); win.destroy(); app.exit(0);
  } catch(error) { console.error(error.stack); if(win)fs.writeFileSync(path.join(root,'failure.png'),(await win.webContents.capturePage()).toPNG()); win?.destroy(); app.exit(1); }
});
