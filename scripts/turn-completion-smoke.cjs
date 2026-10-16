const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(__dirname, '../.ui-smoke/turn-completion');
app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({ show: false, width: 1540, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    await win.webContents.executeJavaScript('(' + (async () => {
      for (let i = 0; i < 100 && !document.querySelector('.assistant-reply'); i++) await new Promise(r => setTimeout(r, 20));
      switchView('workbench');
      const check = (value, message) => { if (!value) throw new Error(message); };
      await window.petAPI.setResumeError('402: {"message":"Insufficient Balance"}');
      const pending = startResume('r', 'c', '旧研究问题');
      const stream = streamingDraft;
      const send = event => handleTaskStatus({ requestId: stream.requestId, ...event });
      send({ stage: 'plan-ready', tasks: ['聚类分析','模型预测','贡献分析','稳健性检验'].map((label, index) => ({ id: 'a' + index, label })) });
      check(!el['task-progress-card'].hidden, '运行中任务卡缺失');
      send({ stage: 'chat-note', text: '先完成轨迹聚类。' });
      send({ stage: 'task-start', taskId: 'a0', label: '聚类分析' });
      const output = { type: 'task-output', stage: 'task-output', taskId: 'a0', role: 'analyst', status: 'completed', label: '聚类分析', summary: '合成验收数据划分为两组。', text: '完整诊断记录，保留在详情中。' };
      send(output);
      send({ stage: 'task-done', taskId: 'a0' });
      send({ stage: 'chat-note', text: '聚类已完成，现在继续模型预测。' });
      const flow = stream.assistantMessage.querySelector('.assistant-flow');
      check(flow.children[0].classList.contains('assistant-commentary') && flow.children[1].classList.contains('task-milestone') && flow.children[2].classList.contains('assistant-commentary'), '进展与结果没有按时间顺序展示');
      const file = { planId: 'analysis-plan', revision: 1, stepId: 'a1', kind: 'table', index: 0, name: '聚类结果表' };
      send({ stage: 'turn-files', artifacts: [file] });
      send({ stage: 'task-start', taskId: 'a1', label: '模型预测' });
      send({ stage: 'task-failed', taskId: 'a1', label: 'Insufficient Balance' });
      check(el['task-progress-card'].hidden, '失败事件后仍显示任务卡');
      await pending;
      check(!streamingDraft && el['task-progress-card'].hidden, '恢复失败后任务卡未清理');
      const message = stream.assistantMessage;
      check(message.querySelector('.turn-process') && !message.querySelector('.turn-process').open, '结束后过程未折叠');
      check(message.querySelector('.turn-completion-summary').textContent.includes('已完成 1 项：聚类分析') && message.querySelector('.turn-completion-summary').textContent.includes('尚未完成：模型预测'), '结束总结混淆完成与失败');
      check(message.querySelector('.turn-artifacts').open && message.querySelector('.generated-file').textContent.includes('聚类结果表'), '重要文件没有直接展示');
      check(message.querySelector('.assistant-reply').textContent.includes('余额不足'), '失败原因未显示');
      check(!document.querySelector('.suspended-banner'), '独立挂起横条仍存在');
      // Reload the same failed turn; summary, files and duration must survive.
      activeProject().messages.push({ id: 'status:r', runId: 'r', channel: 'chat', status: 'failed', conversationId: 'c', userAction: 'resume', text: '模型服务余额不足。', progress: stream.progress, interactionTimeline: [output], analysisArtifacts: [file], durationMs: 338000, createdAt: '2030-01-01' });
      renderConversation(); await renderSuspendedBanner();
      const history = [...el.conversation.querySelectorAll('.chat-exchange')].at(-1);
      check(history.querySelector('.turn-duration').textContent === '用时 5m 38s', '耗时格式或位置错误');
      check(!history.querySelector('.turn-process').open && history.querySelector('.turn-completion-summary') && history.querySelector('.turn-artifacts').open, '刷新后未保留收尾状态');
      check(history.querySelector('[data-resume-run="r"]') && !document.querySelector('.suspended-banner'), '恢复操作未移至对应回复');
      for (const status of ['done', 'suspended']) {
        renderProgressCard({ ...stream.progress, status });
        check(el['task-progress-card'].hidden, status + '状态仍显示任务卡');
      }
      activeProject().empiricalPlans = { c: { id: 'analysis-plan', revision: 1, status: 'results-review' } };
      history.querySelector('.generated-file').click();
      for (let i = 0; i < 100 && !el['empirical-preview-content'].querySelector('table'); i++) await new Promise(resolve => setTimeout(resolve, 20));
      check(!el['empirical-preview'].hidden && el['empirical-preview-content'].querySelector('table'), '重要文件无法在右侧正确预览');
      closeEmpiricalPreview();
      el['chat-scroll'].style.scrollBehavior = 'auto';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      scrollConversation();
    }).toString() + ')()');
    await new Promise(resolve => setTimeout(resolve, 250));
    fs.writeFileSync(path.join(root, '01-completed-turn.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Chronological live progress, h/m/s duration, hidden terminal task card, collapsed process, verified completion summary, visible clickable files and inline resume/history passed');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error.stack); win?.destroy(); app.exit(1); }
});
