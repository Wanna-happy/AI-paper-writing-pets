const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../.ui-smoke/native-preview-ui'); app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({ show: false, width: 1540, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    await win.webContents.executeJavaScript('(' + (async () => {
      for (let i = 0; i < 100 && !document.querySelector('.assistant-reply'); i++) await new Promise(r => setTimeout(r, 20));
      const check = (value, message) => { if (!value) throw new Error(message); };
      check(!document.querySelector('#api-provider option[value="custom"]') && !document.querySelector('#api-models-button'), '中转站入口未移除');
      check(!PROVIDERS.custom, '子 Agent 配置仍可选择中转站');
      const savedSettings=settings;
      await window.petAPI.saveAgentApi('analysis',{enabled:true,provider:'custom',model:'legacy',baseUrl:'https://unused.example/v1'});
      settings={...settings,api:{provider:'custom',model:'custom-model',baseUrl:'https://unused.example/v1',agents:{analysis:{enabled:true,provider:'custom',model:'legacy',baseUrl:'https://unused.example/v1'}}}};
      el['api-provider'].value='';renderApiProvider();await renderAgentApiConfigs();
      check(el['api-test-button'].disabled&&el['api-save-test-button'].disabled,'旧中转配置仍可测试或保存');
      check(document.querySelector('.agent-api-config[data-scenario="analysis"] [data-action="test"]').disabled,'旧子 Agent 中转配置仍可测试');
      await window.petAPI.saveAgentApi('analysis',{enabled:false});settings=savedSettings;el['api-provider'].value=settings.api.provider;renderApiProvider();await renderAgentApiConfigs();
      switchView('workbench');
      const attachment = { id: 'native-preview', name: '原版式文档.docx' };
      await openUploadedAttachment(attachment);
      check(el['empirical-preview-content'].querySelector('img') && !el['empirical-preview-content'].querySelector('pre'), 'Word 被转为纯文本显示');
      check(el['empirical-preview-content'].querySelectorAll('.pdf-preview-page').length===5, '没有创建全文连续页面');
      check(!el['empirical-preview-content'].querySelector('[aria-label="页码"]')&&!!document.querySelector('.preview-toolbar [aria-label="文档缩放"]'),'PDF仍有正文翻页控件或缺少顶部缩放');
      const page=el['empirical-preview-content'].querySelector('.pdf-preview-page[data-page="5"]');page.scrollIntoView();
      for(let i=0;i<100&&!page.querySelector('img');i++)await new Promise(r=>setTimeout(r,20));
      check(!!page.querySelector('img'),'无法连续滚动到末页');
      check(el['preview-open-menu'].hidden && !el['empirical-preview-content'].querySelector('textarea,[contenteditable="true"],.plan-edit-panel'), '原文件出现修改入口');
    }).toString() + ')()');
    console.log('Relay entry removed, continuous PDF pages, toolbar zoom and read-only boundary passed');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error.stack); win?.destroy(); app.exit(1); }
});
