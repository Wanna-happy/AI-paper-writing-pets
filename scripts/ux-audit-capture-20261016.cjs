// Read-only product audit: synthetic workspace, no model or real user data.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'ux-audit-20261016');
app.setPath('userData', path.join(root, '.ui-smoke', 'ux-audit-20261016'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1500, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), sandbox: true, contextIsolation: true, webSecurity: true, backgroundThrottling: false } });
  require('../electron/app-security').secureWindow(win, root);
  fs.mkdirSync(out, { recursive: true });
  const run = code => win.webContents.executeJavaScript(code);
  const capture = async name => { await win.webContents.capturePage(); await new Promise(r => setTimeout(r, 200)); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  try {
    await win.loadFile(path.join(root, 'src/feed.html'));
    await run(`(async()=>{for(let i=0;i<50&&!document.querySelector('.message-actions button');i++)await new Promise(r=>setTimeout(r,100));})()`);
    await run(`{const p=activeProject();p.messages[0].text='已生成研究背景，分析尚未执行。';delete p.drafts[0].lengthReview;delete p.drafts[0].deliveryStatus;renderAll();}`);
    await capture('01-chat');
    await run('openProjectDialog()'); await capture('02-project');
    await run(`el['project-dialog'].close(); switchView('library')`);
    await run(`el['rag-status-title'].textContent='0 篇文献 · 0 个知识块'`); await capture('03-library');
    await run(`switchView('workbench'); openDraftEditor(activeProject().drafts[0])`); await capture('04-editor');
    await run(`(async()=>{const p=document.querySelector('#draft-editor-dialog .assistant-prose p');const r=document.createRange();r.selectNodeContents(p);const s=window.getSelection();s.removeAllRanges();s.addRange(r);handleTextSelection();await applyLocalSkill('polish');})()`); await capture('05-rewrite');
    await run(`document.querySelector('#draft-editor-dialog').close(); switchView('settings'); switchSettingsPanel('api')`); await capture('06-settings');
    await run(`switchView('workbench'); workspace.projects[0].empiricalPlans={c:{id:'audit-plan',revision:1,status:'pending-confirmation',researchQuestion:'合成示例：研究变量之间的关联',attachment:{name:'示例数据.csv'},steps:[{id:'a1',label:'描述性统计',purpose:'了解样本',specification:'报告样本量、均值、标准差及缺失率',outputs:'描述统计表'}]}};renderAll();openPlanPreview(activeProject().empiricalPlans.c)`); await capture('07-plan');
    console.log(JSON.stringify({ captured: fs.readdirSync(out).filter(n=>n.endsWith('.png')), fixture: 'synthetic', liveModel: false }));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
