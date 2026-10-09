const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const archive = path.resolve(process.argv[2]);
const profile = path.resolve(__dirname, '../.main-smoke');
app.setPath('userData', profile); app.setAppPath(archive); process.argv.push('--workspace');
app.on('browser-window-created', (_, window) => window.on('show', () => window.hide()));
require(path.join(archive, 'electron/main.js'));
const timeout = setTimeout(() => app.exit(1), 60000);
app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 100; i++) {
      win = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/feed.html'));
      if (win && !win.webContents.isLoading()) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    win.webContents.setBackgroundThrottling(false);
    await win.webContents.executeJavaScript(`(async () => {
      const state = await petAPI.loadWorkspace();
      const project = state.projects.find(item => item.title === '打包实证预览验证（合成）' && item.empiricalPlans?.[item.activeConversationId]?.results?.[0]?.files?.length);
      if (!project) throw new Error('未找到独立验收目录中的已生成文件');
      await petAPI.setActiveProject(project.id); workspace = await petAPI.loadWorkspace(); renderAll();
      await openEmpiricalPreview(); el['preview-file-list'].querySelectorAll('button')[1].click();
      await el['empirical-preview-content'].querySelector('img').decode();
      await document.fonts.load('16px codicon');
      document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close('cancel'));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    })()`);
    fs.writeFileSync(path.join(profile, 'packaged-preview.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Packaged file preview captured from isolated synthetic project'); clearTimeout(timeout); app.quit();
  } catch (error) { console.error(error.message); clearTimeout(timeout); app.exit(1); }
});
