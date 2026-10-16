const { app, BrowserWindow } = require('electron');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '../.ui-smoke/confirmation-progress');
app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({ show: false, width: 1540, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    const evaluate = fn => win.webContents.executeJavaScript('(' + fn.toString() + ')()');
    const capture = async name => {
      await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
      await new Promise(resolve => setTimeout(resolve, 200));
      fs.writeFileSync(path.join(root, name), (await win.webContents.capturePage()).toPNG());
    };
    await evaluate(async () => {
      for (let i = 0; i < 100 && !document.querySelector('.assistant-reply'); i++) await new Promise(r => setTimeout(r, 20));
      switchView('workbench');
      const check = (value, message) => { if (!value) throw new Error(message); };
      const text = '## 样本和方法\n\n' + '完整方案文字，应在聊天和文档预览中连续阅读。'.repeat(70) + '\n\n## 最后的步骤\n\n结尾仍然完整显示。';
      const target = document.querySelector('.assistant-reply');
      ChatMarkdown.render(target, text);
      check(!target.querySelector('details') && target.textContent.includes('结尾仍然完整显示'), '长正文被折叠或截断');
      const plan = { id: 'ux-plan', revision: 5, status: 'pending-confirmation', researchQuestion: '政策支持与生育率的关联', attachment: { name: 'analysis.csv' }, steps: [
        { id: 'a3', label: '第3步（主）：DTW-K-Means 轨迹聚类', specification: text, outputs: '聚类结果' },
        { id: 'a4', label: '第4步：LightGBM 预测', specification: text, outputs: '预测结果' },
        { id: 'a5', label: '第5步：TreeSHAP 分析', specification: text, outputs: '贡献度' },
        { id: 'a6', label: '第6步：稳健性检验', specification: text, outputs: '诊断结果' }
      ] };
      activeProject().empiricalPlans = { c: plan };
      renderEmpiricalPlan(plan);
      el['empirical-plan-card'].querySelector('a').click();
      check(!el['empirical-preview-content'].querySelector('.chat-reply-overflow'), '文档预览仍被折叠');
      check(el['empirical-preview-content'].textContent.includes('结尾仍然完整显示'), '预览正文丢失');
      const run = runGeneration; let request;
      runGeneration = async options => { request = options; };
      el['empirical-plan-card'].querySelector('button').click();
      runGeneration = run;
      check(request.task === '确认方案并分析' && !request.task.includes(plan.researchQuestion), '确认回显了研究问题');
      check(request.empiricalApproval.id === plan.id && request.empiricalApproval.revision === 5, '确认版本校验丢失');
      const owner = el['empirical-plan-card'].parentElement;
      const view = appendStreamingExchange(request.task);
      streamingDraft = { requestId: 'ux', projectId: 'p', conversationId: 'c', content: '', empiricalApproval: request.empiricalApproval, ...view };
      renderEmpiricalPlan(plan);
      check(el['empirical-plan-card'].parentElement === owner && !view.assistantMessage.querySelector('#empirical-plan-card'), '入口被复制到执行回复');
      check(!el['empirical-plan-card'].querySelector('button'), '已确认仍展示确认按钮');
      plan.status = 'approved'; renderEmpiricalPlan(plan);
      check(!el['empirical-plan-card'].querySelector('button') && el['empirical-plan-card'].parentElement === owner, '批准后入口位置或操作错误');
      let progress = TaskProgress.update(null, { stage: 'plan-ready', tasks: plan.steps.map(step => ({ id: step.id, label: step.label + '：' + step.specification })) });
      progress = TaskProgress.update(progress, { stage: 'task-start', taskId: 'a3', label: plan.steps[0].label + '：' + text });
      renderProgressCard(progress);
      const card = el['task-progress-card'];
      check(card.querySelector('details').open && card.querySelectorAll('li').length === 4, '执行时没有默认显示全部任务');
      check(card.querySelector('summary').textContent === '执行任务 1/4 · DTW-K-Means 轨迹聚类', '混淆了方案步骤与本轮任务序号');
      check([...card.querySelectorAll('.task-step__label')].every(label => label.textContent.length < 35), '任务标签未精简');
      check(!card.textContent.includes('完整方案文字'), '卡片泄露整段任务说明');
      // Restore an original proposal after reload, followed by its execution reply.
      streamingDraft = null;
      const project = activeProject();
      project.messages.push({ id: 'proposal', channel: 'chat', conversationId: 'c', task: '制定方案', text: '方案已准备好。', createdAt: '2030-01-01T00:00:00Z', planDocumentRef: { id: plan.id, revision: 5 } });
      project.messages.push({ id: 'execute', channel: 'chat', conversationId: 'c', task: request.task, text: '已开始分析。', createdAt: '2030-01-02T00:00:00Z' });
      renderConversation();
      check(el['empirical-plan-card'].closest('.chat-exchange')?.textContent.includes('制定方案'), '重载后方案入口未留在原回复');
      check(![...el.conversation.querySelectorAll('.chat-exchange')].at(-1).querySelector('#empirical-plan-card'), '重载后执行回复重复方案入口');
      renderProgressCard(progress);
      openPlanPreview(plan);
      el['chat-scroll'].style.scrollBehavior = 'auto'; scrollConversation();
    });
    await capture('01-confirmation-progress.png');
    console.log('Full chat/preview, concise exact-version confirmation, original-turn document ownership/reload, expanded compact task list and execution numbering passed');
    win.destroy(); app.exit(0);
  } catch (error) {
    if (win) fs.writeFileSync(path.join(root, 'failure.png'), (await win.webContents.capturePage()).toPNG());
    console.error(error.stack); win?.destroy(); app.exit(1);
  }
});
