const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../.ui-smoke/gateway-upload');
app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({ show: false, width: 1540, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    await win.webContents.executeJavaScript('(' + (async () => {
      for (let i = 0; i < 100 && !document.querySelector('.assistant-reply'); i++) await new Promise(r => setTimeout(r, 20));
      const check = (value, message) => { if (!value) throw new Error(message); };
      check(!document.querySelector('#api-provider option[value="custom"]') && !document.getElementById('api-models-button'), '本期中转站入口没有移除');
      switchView('workbench');
      const files = ['论文.pdf','方案.docx','数据.xlsx','说明.txt','补充.md'].map((name, index) => ({ id: 'f' + index, name }));
      files.push({ id: 'environment', name: '.venv-thesis\\Lib\\internal.py' });
      const view = appendStreamingExchange('查看上传资料', files);
      check([...view.exchange.querySelector('.message-attachments').children].filter(item => item.classList.contains('attachment-tile')).length === 4, '附件默认展示过多');
      check(!view.exchange.textContent.includes('internal.py') && view.exchange.querySelector('.more-uploaded-files'), '旧环境文件或其他附件没有收敛展示');
      view.exchange.querySelector('.attachment-tile').click();
      for (let i = 0; i < 100 && !el['empirical-preview-content'].textContent.includes('原始上传内容'); i++) await new Promise(r => setTimeout(r, 10));
      check(!el['empirical-preview'].hidden && el['empirical-preview-content'].textContent.includes('只读预览'), '上传文件不可预览');
      check(!el['empirical-preview-content'].querySelector('textarea,[contenteditable="true"],.plan-edit-panel') && el['preview-open-menu'].hidden, '上传文件出现编辑或覆盖入口');
      const original = previewSelectedArtifact;
      await savePreviewArtifact(false); check(previewSelectedArtifact === original, '原文件不应被覆盖或转换为可编辑文档');
      el['chat-scroll'].style.scrollBehavior = 'auto'; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); scrollConversation();
    }).toString() + ')()');
    await new Promise(resolve => setTimeout(resolve, 250)); fs.writeFileSync(path.join(root, '01-upload-readonly.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Relay entry removed, clickable read-only upload preview and collapsed/filtered attachments passed');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error.stack); win?.destroy(); app.exit(1); }
});
