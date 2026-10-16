const { app, BrowserWindow } = require('electron');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '../.ui-smoke/screenshot-fixes');
app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({ show: false, width: 1540, height: 1000, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    const evaluate = fn => win.webContents.executeJavaScript('(' + fn.toString() + ')()');
    const capture = async name => { await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))'); await new Promise(resolve => setTimeout(resolve, 250)); fs.writeFileSync(path.join(root, name), (await win.webContents.capturePage()).toPNG()); };
    await evaluate(async () => {
      for (let i = 0; i < 100 && !document.querySelector('.assistant-reply'); i++) await new Promise(r => setTimeout(r, 20));
      switchView('workbench');
      const q = { id: 'single', status: 'pending', questions: [{ id: 'one', question: '本轮使用哪个年份范围？', options: ['沿用已确认范围', '另行指定'] }] };
      await window.petAPI.updateProject('p', { clarifications: { c: q } });
      renderClarificationCard(q);
      if (!el['clarification-card'].classList.contains('is-single') || el['clarification-card'].querySelector('.clarification-header')) throw new Error('单题应紧凑展示');
      if (el['clarification-card'].querySelector('button[type="submit"]').textContent !== '提交回答') throw new Error('末题按钮语义错误');
    });
    await capture('01-single-question.png');
    await evaluate(async () => {
      const original = runGeneration; let requests = 0, failOnce = true;
      runGeneration = async () => { requests++; if (failOnce) throw new Error('synthetic submit failure'); };
      el['clarification-card'].querySelector('.clarification-option').click();
      for (let i = 0; i < 100 && (requests !== 1 || el['clarification-card'].querySelector('textarea')?.value !== '沿用已确认范围'); i++) await new Promise(r => setTimeout(r, 10));
      if (el['clarification-card'].hidden || el['clarification-card'].querySelector('textarea')?.value !== '沿用已确认范围') throw new Error('提交失败必须保留回答并允许重试');
      failOnce = false; el['clarification-card'].querySelector('form').requestSubmit();
      for (let i = 0; i < 100 && requests !== 2; i++) await new Promise(r => setTimeout(r, 10));
      runGeneration = original;
      if (requests !== 2 || !el['clarification-card'].hidden) throw new Error('重试应直接提交，不增加确认页');
      const plan = { id: 'editable', revision: 1, status: 'pending-confirmation', researchQuestion: '政策支持与生育率的关联', dataDescription: '国家年度面板，使用已确认样本范围', missingDataPolicy: '沿用已确认缺失处理', interpretationLimits: '仅解释预测和关联', attachment: { name: 'analysis.csv' }, steps: [{ id: 'a1', label: '描述统计', purpose: '说明分布', specification: '报告均值和离散程度', outputs: '描述统计表' }] };
      activeProject().empiricalPlans = { c: plan };
      renderEmpiricalPlan(plan); el['chat-scroll'].style.scrollBehavior = 'auto'; scrollConversation();
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const link = el['empirical-plan-card'].querySelector('a');
      if (link.closest('.composer-dock') || document.querySelector('.generated-document')) throw new Error('不应有输入区方案大卡');
      const rect = link.getBoundingClientRect(), hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      if (!hit || !link.contains(hit)) throw new Error('方案入口被其他区域遮挡：' + JSON.stringify({ top: rect.top, left: rect.left, hit: hit?.className }));
      link.click();
      const edit = el['empirical-preview-content'].querySelector('.plan-edit-panel'); edit.open = true;
      if (!edit.querySelector('[data-plan-field="researchQuestion"]')) throw new Error('右侧方案不可编辑');
      edit.querySelector('[data-plan-field="researchQuestion"]').value = '修改后的研究问题';
      edit.querySelector('form').requestSubmit();
      for (let i = 0; i < 100 && activeProject().empiricalPlans.c.revision === 1; i++) await new Promise(r => setTimeout(r, 10));
      if (activeProject().empiricalPlans.c.revision !== 2 || !el['empirical-preview-content'].textContent.includes('修改后的研究问题')) throw new Error('新版未保存或预览未刷新');
      // Actual code only; a skill's example text must never appear as executed code.
      const flow = document.querySelector('.assistant-flow');
      appendToolActivity(flow, { toolName: 'read_research_skill', toolCallId: 'skill', state: 'completed', detail: { input: { id: 'secret-internal-id', offset: 43400 }, output: JSON.stringify({ text: 'EXAMPLE_CODE_NOT_EXECUTED', nextOffset: 55400 }) } });
      if (flow.textContent.includes('secret-internal-id') || flow.textContent.includes('EXAMPLE_CODE_NOT_EXECUTED') || flow.textContent.includes('本次调用参数')) throw new Error('读取技能暴露原始参数或示例代码');
      appendToolActivity(flow, { toolName: 'run_data_analysis', toolCallId: 'code', state: 'completed', detail: { code: 'print("ACTUAL_GENERATED_CODE")' } });
      const code = flow.querySelector('.agent-tool-detail.has-detail');
      if (!code?.textContent.includes('ACTUAL_GENERATED_CODE')) throw new Error('实际生成代码缺失');
      scrollConversation();
    });
    await capture('02-plan-link-preview.png');
    await evaluate(() => { el['empirical-preview-content'].querySelector('.plan-edit-panel').open = true; });
    await new Promise(r => setTimeout(r, 50));
    await capture('03-plan-editor.png');
    console.log('Single question direct submit, unobstructed inline plan link, right document edit/new revision, skill/log isolation and actual code details passed');
    win.destroy(); app.exit(0);
  } catch (error) { if (win) fs.writeFileSync(path.join(root, 'failure.png'), (await win.webContents.capturePage()).toPNG()); console.error(error.stack); win?.destroy(); app.exit(1); }
});
