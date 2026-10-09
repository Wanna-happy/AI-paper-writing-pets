const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const profile = path.resolve(__dirname, '../.main-smoke');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.on('browser-window-created', (_, window) => window.on('show', () => window.hide()));
process.argv.push('--workspace');
const archiveArg = process.argv.find(arg => arg.startsWith('--archive='));
const archive = archiveArg && path.resolve(archiveArg.slice('--archive='.length));
if (archive) app.setAppPath(archive);
require(archive ? path.join(archive, 'electron/main.js') : '../electron/main.js');
const timeout = setTimeout(() => { console.error('Main process smoke timed out'); app.exit(1); }, 240000);
app.whenReady().then(async () => {
  try {
    let win;
    for (let i = 0; i < 100; i++) {
      win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/feed.html'));
      if (win && !win.webContents.isLoading()) break;
      await new Promise(r => setTimeout(r, 100));
    }
    assert(win, 'Real workspace did not open');
    win.webContents.setBackgroundThrottling(false);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const before = await petAPI.getSettings();
      const environment = await petAPI.getDataEnvironmentStatus();
      if (!environment.ready || environment.source !== 'bundled' || !environment.version.startsWith('3.14.')) throw new Error('内置 Python 未就绪：' + (environment.error || environment.version));
      const config = { enabled: true, provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' };
      await petAPI.saveAgentApi('chat', config, 'synthetic-main-smoke-key');
      const status = await petAPI.getAgentApiStatus();
      const settings = await petAPI.getSettings();
      if (!status.chat.hasOwnKey || JSON.stringify(settings).includes('synthetic-main-smoke-key')) throw new Error('Credential persistence failed');
      await petAPI.saveAgentApi('chat', config, '', true);
      await petAPI.saveAgentApi('chat', { enabled: false }, '');
      let rejected = false;
      try { await petAPI.saveAgentApi('chat', { ...config, baseUrl: 'http://example.com/v1' }, ''); } catch { rejected = true; }
      if (!rejected) throw new Error('Unsafe endpoint accepted');
      return { bundledPython: environment.version, trustedIPC: true, credentialIsolation: true, unsafeEndpointRejected: true, commonUnchanged: settings.api.provider === before.api.provider };
    })()`);
    assert(result.commonUnchanged);
    console.log('PASS packaged environment, credentials and endpoint checks');
    const url = win.webContents.getURL();
    await win.webContents.executeJavaScript("location.href = 'https://example.com';");
    await new Promise(r => setTimeout(r, 300));
    assert.equal(win.webContents.getURL(), url, 'External navigation escaped');
    if (archive) {
      const root = archive;
      const store = require(path.join(root, 'electron/workspace-store.js'));
      const empiricalProject = store.createProject({ title: '打包实证预览验证（合成）', domains: ['管理学'] });
      const { ToolRegistry } = require(path.join(root, 'electron/tools/tool-registry.js'));
      const registry = new ToolRegistry({ userDataPath: profile, scriptPath: path.join(root, 'scripts/data_analysis.py').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'), loadSettings: () => ({}) });
      const diagram = await registry.execute({ projectId: 'synthetic-smoke-' + Date.now(), plan: { name: 'mechanism_diagram', nodes: ['A', 'B'], edges: [[0, 1]] } });
      assert(!diagram.error, diagram.error);
      assert(diagram.files?.every(file => fs.existsSync(file)), 'Packaged diagram output missing');
      assert(require(path.join(root, 'electron/sandbox/windows-sandbox.js')).getSandboxStatus().available, 'Packaged system sandbox missing');
      result.packagedDiagram = true;
      console.log('PASS packaged diagram');
      result.packagedSandbox = true;
      const python = await require(path.join(root, 'electron/tools/tool-registry.js')).findPythonExecutable({});
      assert(python.executable.startsWith(path.dirname(root)), 'Packaged test accidentally used an external Python');
      const outputDir = path.join(profile, 'analysis-runs', empiricalProject.id, String(Date.now()));
      fs.mkdirSync(outputDir, { recursive: true });
      const scriptPath = path.join(outputDir, 'synthetic.py');
      fs.writeFileSync(scriptPath, "import sys,os,json,numpy,pandas,scipy,openpyxl,matplotlib,statsmodels.api as sm,sklearn,linearmodels,lifelines\nassert os.environ.get('JOBLIB_MULTIPROCESSING') == '0'\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\na=numpy.array([1,2,3]);fit=sm.OLS(a*2,sm.add_constant(a)).fit();assert abs(fit.params[1]-2)<0.000001;plt.plot(a);plt.savefig(os.path.join(os.environ['CHART_DIR'],'plot.png'));print(json.dumps({'version':sys.version.split()[0],'mean':float(a.mean()),'coefficient':float(fit.params[1])}))\n");
      const analysis = await require(path.join(root, 'electron/sandbox/windows-sandbox.js')).runSandbox({ python, scriptPath, outputDir, timeoutMs: 120000 });
      const data = JSON.parse(analysis.stdout.trim().split('\n').pop());
      assert(data.version.startsWith('3.14.'));
      assert.equal(data.mean, 2);
      assert.equal(analysis.charts.length, 1);
      result.packagedPythonAnalysis = true;
      console.log('PASS packaged LPAC Python analysis and PNG');
      store.updateProject(empiricalProject.id, { empiricalPlans: { [empiricalProject.activeConversationId]: {
        id: 'packaged-preview', revision: 1, projectId: empiricalProject.id, conversationId: empiricalProject.activeConversationId,
        researchQuestion: '合成数据 y=2x 的关系验证', attachment: { name: 'synthetic.csv' },
        steps: [{ id: 'a1', label: '主回归', specification: '合成数据 y=2x', purpose: '打包验证' }],
        status: 'results-review', results: [{ stepId: 'a1', methodId: 'ols', status: 'completed', sampleSize: 3,
          summary: '合成OLS系数2', tables: [{ title: 'OLS结果', columns: ['变量', '系数'], rows: [['x', data.coefficient]] }], files: analysis.charts, code: fs.readFileSync(scriptPath, 'utf8') }],
      } } });
      const savedPlan = store.loadWorkspace().projects.find(item => item.id === empiricalProject.id).empiricalPlans[empiricalProject.activeConversationId];
      store.saveConversationTurn(empiricalProject.id, empiricalProject.activeConversationId, {
        id: 'packaged-result', role: 'assistant', channel: 'chat', conversationId: empiricalProject.activeConversationId,
        task: '验证内置 Python 生成回归表与图表', text: '内置 Python 的沙箱分析已完成。合成数据实际样本量 3，OLS 斜率为 2。点击下方文件可预览结果表、图表或分析代码。',
        analysisArtifacts: require(path.join(root, 'electron/empirical-artifacts.js')).artifactList(savedPlan), createdAt: new Date().toISOString(),
      });
      const preview = await win.webContents.executeJavaScript(`petAPI.getEmpiricalResultPreview(${JSON.stringify(empiricalProject.id)}, ${JSON.stringify(empiricalProject.activeConversationId)})`);
      assert.equal(preview.results[0].sampleSize, 3);
      assert(preview.results[0].charts[0].dataUrl.startsWith('data:image/png;base64,'));
      result.packagedEmpiricalPreviewIPC = true;
      console.log('PASS packaged empirical preview IPC');
      const panel = await win.webContents.executeJavaScript(`(async () => {
        await petAPI.setActiveProject(${JSON.stringify(empiricalProject.id)});
        workspace = await petAPI.loadWorkspace(); renderAll(); await openEmpiricalPreview();
        if (!el['empirical-preview-content'].querySelector('table') || el['empirical-preview-content'].querySelector('textarea')) throw new Error('打包的单文件预览无效');
        el['preview-file-list'].querySelectorAll('button')[1].click();
        const image = el['empirical-preview-content'].querySelector('img');
        await image.decode();
        if (!image.naturalWidth) throw new Error('打包图表预览无法解码');
        await document.fonts.load('16px codicon');
        if (![...document.fonts].some(font => font.family.replace(/['"]/g, '') === 'codicon' && font.status === 'loaded')) throw new Error('打包图标字体缺失');
        return true;
      })()`);
      assert(panel); result.packagedFilePreviewUI = true;
      await win.webContents.executeJavaScript(`document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close('cancel')); new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));`);
      fs.writeFileSync(path.join(profile, 'packaged-preview.png'), (await win.webContents.capturePage()).toPNG());
      await win.webContents.executeJavaScript('closeEmpiricalPreview();');
      store.deleteProject(empiricalProject.id);
    }
    console.log(JSON.stringify({ ...result, navigationBlocked: true }));
    fs.writeFileSync(path.join(profile, 'packaged-main-verification.json'), JSON.stringify({ checkedAt: new Date().toISOString(), ...result, navigationBlocked: true }, null, 2));
    clearTimeout(timeout);
    app.quit();
  } catch (error) { console.error(error.message); clearTimeout(timeout); app.exit(1); }
});
