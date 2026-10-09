const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
app.setPath('userData', path.resolve(__dirname, '../.ui-smoke'));
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    const consoleErrors = [];
    win.webContents.on('console-message', event => { if (event.level === 'error') { consoleErrors.push(event.message); console.error(event.message); } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      for (let i = 0; i < 50 && !document.querySelector('.message-actions button'); i++) await new Promise(r => setTimeout(r, 100));
      if (!document.querySelector('.message-actions button')) throw new Error('工作台未初始化：' + document.getElementById('toast').textContent);
      if (document.getElementById('api-model-writing') || document.querySelector('.api-scenario-grid')) throw new Error('重复模型区域未删除');
      if (!document.querySelector('#api-provider option[value="anthropic"]') || !document.querySelector('#api-provider option[value="hunyuan"]')) throw new Error('共用配置未提供 Claude / HY');
      if (document.getElementById('data-runtime-mode').value !== 'bundled' || !document.getElementById('data-python-path-label').hidden || !document.getElementById('data-environment-command').hidden) throw new Error('默认环境仍要求用户安装或填写 Python 路径');
      for (const id of ['anthropic', 'deepseek']) {
        el['api-provider'].value = id; el['api-provider'].dispatchEvent(new Event('change'));
        if (el['api-base-url'].value !== AGENT_API_URLS[id] || el['api-model'].value !== PROVIDERS[id].model) throw new Error('切换服务商未更新接口和模型');
        el['api-key'].value = 'synthetic-common-ui-key';
        await saveAndTestApi();
        if (document.querySelector('.agent-api-config[data-scenario="planning"] [data-field="provider"]').value !== id) throw new Error('共用配置保存后 Agent 继承显示未刷新');
      }
      if (document.querySelectorAll('.agent-api-config').length !== 4) throw new Error('四个 Agent 配置输入区未创建');
      const agentCard = document.querySelector('.agent-api-config[data-scenario="chat"]');
      const enabled = agentCard.querySelector('[data-field="enabled"]');
      enabled.checked = true; enabled.dispatchEvent(new Event('change'));
      const provider = agentCard.querySelector('[data-field="provider"]');
      provider.value = 'openai'; provider.dispatchEvent(new Event('change'));
      const secret = agentCard.querySelector('[data-field="key"]');
      if (secret.type !== 'password' || secret.disabled) throw new Error('Agent 密钥输入未启用或未遮蔽');
      secret.value = 'ui-synthetic-key';
      agentCard.querySelector('[data-action="save"]').click();
      for (let i = 0; i < 30 && document.querySelector('.agent-api-config[data-scenario="chat"]') === agentCard; i++) await new Promise(resolve => setTimeout(resolve, 20));
      const newAgentCard = document.querySelector('.agent-api-config[data-scenario="chat"]');
      if (newAgentCard === agentCard || newAgentCard.querySelector('[data-field="key"]').value || !newAgentCard.textContent.includes('独立密钥已加密保存') || settings.api.provider !== 'deepseek') throw new Error('独立配置未保存、泄漏密钥或修改了共用配置');
      await loadSettingsForm();
      if (!document.querySelector('.agent-api-config[data-scenario="chat"] [data-field="enabled"]').checked || document.querySelector('.agent-api-config[data-scenario="chat"] [data-field="key"]').value) throw new Error('重载后配置或密钥输入状态错误');
      const reply = document.querySelector('.assistant-reply').textContent;
      if (!reply.includes('1474') || !reply.includes('篇幅未达标') || reply.includes('✅ 已完成')) throw new Error('未达标正文的交付提示不正确');
      const chatCard = [...document.querySelectorAll('.chat-exchange')].at(-1);
      if (!chatCard.textContent.includes('分析尚未执行') || chatCard.querySelector('[data-action="word"]') || chatCard.querySelector('script')) throw new Error('聊天历史被当成论文或HTML渲染');
      const savedProgress = TaskProgress.update(TaskProgress.update(null, { stage: 'plan-ready', tasks: [{ id: 'history', role: 'chat', label: '回顾已完成工作' }] }), { stage: 'task-done', taskId: 'history' });
      renderProgressCard(savedProgress);
      if (!el['task-progress-card'].hidden || document.querySelector('.assistant-message .task-plan')) throw new Error('简单任务不应显示卡片或对话内进度');
      document.querySelector('.message-actions button').click();
      const dialog = document.getElementById('draft-editor-dialog');
      if (!dialog?.open) throw new Error('正文窗口未打开');
      if (!dialog.textContent.includes('篇幅未达标')) throw new Error('正文编辑窗口未显示篇幅提示');
      dialog.querySelector('sup[data-footnote]').click();
      if (!dialog.querySelector('.draft-evidence-list details[open]')) throw new Error('引用无法跳转证据片段');
      const p = dialog.querySelector('.assistant-prose p');
      const range = document.createRange(); range.selectNodeContents(p);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      handleTextSelection();
      if (!dialog.querySelector('.skill-menu.is-open')) throw new Error('选区菜单不可见');
      await applyLocalSkill('polish');
      if (!p.closest('.assistant-prose')?.textContent.includes('应以清晰')) {
        if (!dialog.textContent.includes('应以清晰')) throw new Error('改写未应用');
      }
      const saved = await window.petAPI.loadWorkspace();
      if (!saved.projects[0].drafts[0].content.includes('应以清晰')) throw new Error('改写未保存');
      if (!saved.projects[0].drafts[0].content.includes('E1')) throw new Error('引用丢失');
      dialog.close();
      const chatStreamView = appendStreamingExchange('工作回顾', []);
      streamingDraft = { requestId: 'chat-stream-test', content: '', ...chatStreamView };
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'planning' });
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'plan-ready', tasks: [{ id: 'plan1', role: 'chat', label: '工作回顾' }] });
      if (chatStreamView.assistantMessage.textContent.includes('待执行')) throw new Error('对话中不应显示任务步骤');
      if (!el['task-progress-card'].hidden) throw new Error('一步任务出现进度卡片');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'audit-start' });
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'saving' });
      if (!el['task-progress-card'].hidden) throw new Error('内部核验与保存阶段不应凑数');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'plan-ready', tasks: [
        { id: 'plan1', role: 'chat', label: '工作回顾' },
        { id: 'p2', role: 'analyst', label: '分析数据' },
        { id: 'p3', role: 'writer', label: '撰写章节' }
      ] });
      if (!el['task-progress-card'].hidden) throw new Error('三步任务出现卡片');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'plan-ready', tasks: [
        { id: 'plan1', role: 'chat', label: '工作回顾' },
        { id: 'p2', role: 'analyst', label: '分析数据' },
        { id: 'p3', role: 'writer', label: '撰写章节' },
        { id: 'p4', role: 'chat', label: '汇报结果' }
      ] });
      if (el['task-progress-card'].hidden || !el['task-progress-card'].closest('.composer-dock') || document.querySelector('.assistant-message .task-plan')) throw new Error('四步卡片位置错误');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'task-start', taskId: 'plan1', role: 'chat', label: '工作回顾', index: 1, total: 1 });
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'task-suspended', taskId: 'plan1' });
      if (!el['task-progress-card'].textContent.includes('已挂起')) throw new Error('挂起进度未显示');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'task-done', taskId: 'plan1' });
      if (!el['task-progress-card'].textContent.includes('已完成')) throw new Error('完成进度未显示');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'audit-start' });
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'task-failed', taskId: 'plan1', label: '<script>核验失败</script>' });
      if (!el['task-progress-card'].querySelector('[data-task-id="$audit"].is-failed') || chatStreamView.assistantMessage.querySelector('script')) throw new Error('失败步骤或安全渲染错误');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'saving' });
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'run-done', needsRevision: true });
      if (!el['task-progress-card'].textContent.includes('需调整')) throw new Error('篇幅未达标未保留需调整状态');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'chat-reset', text: '' });
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'chat-delta', delta: '已生成绪论' });
      await new Promise(resolve => setTimeout(resolve, 50));
      if (chatStreamView.reply.textContent !== '已生成绪论') throw new Error('聊天增量没有及时展示');
      handleTaskStatus({ requestId: 'chat-stream-test', stage: 'chat-delta', delta: '，分析尚未执行。' });
      await new Promise(resolve => setTimeout(resolve, 50));
      if (chatStreamView.reply.textContent !== '已生成绪论，分析尚未执行。') throw new Error('聊天增量拼接失败');
      workspace.projects[0].messages.at(-1).progress = streamingDraft.progress;
      streamingDraft = null;
      renderAll();
      if (el['task-progress-card'].hidden || document.querySelector('.assistant-message .task-plan')) throw new Error('历史进度应恢复在输入框上方');
      delete workspace.projects[0].messages.at(-1).progress;
      renderAll();
      if (!el['task-progress-card'].hidden) throw new Error('切换到无进度记录时未隐藏卡片');
      el['task-input'].value = '测试中断';
      const running = runGeneration();
      await new Promise(resolve => setTimeout(resolve, 30));
      await stopCurrentGeneration();
      await running;
      if (streamingDraft) throw new Error('中断后仍卡在运行态');
      await new Promise(resolve => setTimeout(resolve, 30));
      if (document.querySelectorAll('.suspended-banner').length !== 1) throw new Error('恢复入口缺失或重复');
      await startResume('r', 'c', '测试中断');
      if (streamingDraft) throw new Error('再次挂起后状态未释放');
      const plan = { id: 'analysis-plan', revision: 1, status: 'pending-confirmation', researchQuestion: '合成数据影响因素研究', attachment: { name: 'data.csv' }, steps: [{ id: 'a1', label: '主回归', specification: 'y ~ x，HC3', purpose: '估计关联', outputs: '系数表' }] };
      workspace.projects[0].empiricalPlans = { c: plan };
      renderAll();
      if (el['empirical-plan-card'].hidden || !el['empirical-plan-card'].textContent.includes('确认方案并分析')) throw new Error('分析确认卡片缺失');
      if (document.querySelector('.assistant-message .empirical-plan-card')) throw new Error('方案卡片被嵌入对话');
      const originalRun = runGeneration;
      let approval;
      runGeneration = async options => { approval = options.empiricalApproval; };
      el['empirical-plan-card'].querySelector('button').click();
      runGeneration = originalRun;
      if (approval?.kind !== 'analysis' || approval.revision !== 1) throw new Error('分析确认未发送精确版本');
      plan.status = 'results-review'; plan.results = [{ status: 'completed' }]; renderAll();
      await openEmpiricalPreview();
      if (el['empirical-preview'].hidden || !el['empirical-preview-content'].querySelector('table') || el['empirical-preview-content'].querySelector('img')) throw new Error('右侧应只呈现选中的单个文件');
      if (el['empirical-preview'].querySelector('textarea') || el['empirical-preview-content'].textContent.includes('a1 · ols')) throw new Error('报告或反馈错误地放在右侧');
      if (el['empirical-preview-content'].querySelector('script') || !el['empirical-preview-content'].textContent.includes('<script>sentinel</script>')) throw new Error('分析输出未安全渲染为文本');
      el['preview-file-list'].querySelectorAll('button')[1].click();
      const chart = el['empirical-preview-content'].querySelector('img');
      if (!chart.complete) await new Promise((resolve, reject) => { chart.onload = resolve; chart.onerror = reject; });
      if (!chart.naturalWidth) throw new Error('图表被CSP阻止或无法解码');
      if (el['empirical-preview-title'].textContent !== 'synthetic.png' || el['empirical-preview-tabs'].querySelectorAll('[role="tab"]').length !== 2) throw new Error('文件标签未按点击打开');
      el['preview-expand'].click(); if (!el['empirical-preview'].classList.contains('is-expanded')) throw new Error('展开失败'); el['preview-expand'].click();
      el['preview-file-list'].querySelectorAll('button')[2].click();
      if (!el['empirical-preview-content'].textContent.includes('print("synthetic")') || !el['empirical-preview-content'].querySelector('.code-line')) throw new Error('代码文件未预览');
      el['preview-save'].click(); await new Promise(resolve => setTimeout(resolve, 10));
      el['empirical-plan-card'].querySelectorAll('button')[1].click();
      if (!el['task-input'].value.includes('请先确认修改方案') || !el['task-input'].value.includes('analysis_script.py')) throw new Error('反馈未回到中间对话输入框');
      el['empirical-preview-tabs'].querySelectorAll('.preview-tab-close')[2].click();
      if (el['empirical-preview-tabs'].querySelectorAll('[role="tab"]').length !== 2 || !el['empirical-preview-content'].querySelector('img')) throw new Error('关闭当前文件标签未恢复前一个文件');
      const fileHost = document.createElement('div');
      appendArtifactLinks(fileHost, [{ kind: 'image', index: 0, revision: 1, planId: 'analysis-plan', stepId: 'a1', name: 'synthetic.png' }], activeProject());
      fileHost.querySelector('button').click(); await new Promise(resolve => setTimeout(resolve, 20));
      if (!el['empirical-preview-content'].querySelector('img')) throw new Error('对话中的文件入口未打开指定图表');
      document.querySelector('.assistant-content .generated-file').click();
      if (!el['empirical-preview-content'].querySelector('.assistant-prose') || !el['empirical-preview-title'].textContent.endsWith('.docx')) throw new Error('正文文件未在右侧预览');
      closeEmpiricalPreview();
      plan.status = 'writing-confirmation'; plan.writingProposal = { revision: 2, title: '实证章节', sections: ['模型设定', '估计结果'], lengthRequirement: '1100字', task: '如实解释结果' }; renderAll();
      runGeneration = async options => { approval = options.empiricalApproval; };
      el['empirical-plan-card'].querySelector('button').click();
      runGeneration = originalRun;
      if (approval.kind !== 'writing' || approval.writingRevision !== 2) throw new Error('写作范围确认版本丢失');
      delete workspace.projects[0].empiricalPlans; renderAll(); closeEmpiricalPreview();
      if (!el['empirical-plan-card'].hidden) throw new Error('普通对话显示了实证方案卡片');
      return { editor: true, selectionMenu: true, editSaved: true, citationPreserved: true, evidenceJump: true, suspendResume: true, chatHistory: true, chatStreaming: true, taskProgress: true, agentApiSettings: true, empiricalSchemeConfirmation: true, rightPreview: true, feedbackClarification: true, writingScopeConfirmation: true };
    })()`);
    await win.webContents.executeJavaScript(`switchView('settings'); switchSettingsPanel('api');`);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.resolve(__dirname, '../.ui-smoke/ai-settings.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`document.querySelector('.data-environment-card').scrollIntoView();`);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.resolve(__dirname, '../.ui-smoke/python-settings.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`switchView('workbench');`);
    await win.webContents.executeJavaScript(`(() => {
      el.conversation.replaceChildren();
      el['chat-scroll'].style.scrollBehavior = 'auto';
      const view = appendStreamingExchange('分析项目数据，再撰写实证结果', []);
      streamingDraft = { requestId: 'progress-preview', content: '', ...view };
      handleTaskStatus({ requestId: 'progress-preview', stage: 'planning' });
      handleTaskStatus({ requestId: 'progress-preview', stage: 'plan-ready', tasks: [
        { id: 'analysis', role: 'analyst', label: '分析项目数据并整理统计结果' },
        { id: 'writing', role: 'writer', label: '依据分析结果撰写实证章节', dependsOn: ['analysis'] },
        { id: 'discussion', role: 'writer', label: '撰写讨论部分', dependsOn: ['writing'] },
        { id: 'report', role: 'chat', label: '汇报成果与待核验事项', dependsOn: ['discussion'] }
      ] });
      handleTaskStatus({ requestId: 'progress-preview', stage: 'task-start', taskId: 'analysis', role: 'analyst', label: '分析项目数据并整理统计结果' });
      if (!el['task-progress-card'].textContent.includes('等待：分析项目数据')) throw new Error('前序依赖未显示');
      const panel = el['task-progress-card'].querySelector('details');
      panel.open = false;
      handleTaskStatus({ requestId: 'progress-preview', stage: 'task-done', taskId: 'analysis' });
      if (el['task-progress-card'].querySelector('details').open) throw new Error('进度更新重置了用户折叠状态');
      el['task-progress-card'].querySelector('details').open = true;
      handleTaskStatus({ requestId: 'progress-preview', stage: 'task-start', taskId: 'writing', role: 'writer', label: '依据分析结果撰写实证章节' });
      view.reply.textContent = '数据分析已完成，正在依据结果撰写实证章节。';
      scrollConversation();
    })()`);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.resolve(__dirname, '../ui-smoke.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async () => {
      streamingDraft = null;
      workspace.projects[0].empiricalPlans = { c: { id: 'analysis-plan', revision: 1, status: 'results-review', researchQuestion: '合成数据影响因素研究', attachment: { name: 'data.csv' }, steps: [{ id: 'a1', label: 'OLS主回归', specification: 'y ~ x，HC3标准误', purpose: '估计关联', outputs: '系数表与图表' }], results: [{ status: 'completed' }] } };
      workspace.projects[0].messages.push({ id: 'preview-example', channel: 'chat', conversationId: 'c', task: '查看分析结果', text: '分析已完成。本轮生成了结果表、图表和分析代码。请点击文件预览；需要调整时，直接在这里说明修改要求。', analysisArtifacts: [{ kind: 'table', index: 0, revision: 1, planId: 'analysis-plan', stepId: 'a1', name: '回归表' }, { kind: 'image', index: 0, revision: 1, planId: 'analysis-plan', stepId: 'a1', name: 'synthetic.png' }, { kind: 'code', index: 0, revision: 1, planId: 'analysis-plan', stepId: 'a1', name: '分析代码.py' }], createdAt: new Date(Date.now() + 2000).toISOString() });
      el['task-input'].value = ''; renderAll(); closeEmpiricalPreview();
      if (!el['empirical-preview'].hidden) throw new Error('没有点击文件就自动打开了预览');
      el.conversation.querySelector('.generated-files button').click(); await new Promise(resolve => setTimeout(resolve, 50));
      const previewRect = el['empirical-preview'].getBoundingClientRect();
      if (previewRect.top < document.querySelector('.content-header').getBoundingClientRect().bottom - 1) throw new Error('右侧预览遮挡了页面导航');
      const dockRect = document.querySelector('.composer-dock').getBoundingClientRect();
      if (dockRect.right > previewRect.left + 1) throw new Error('结果预览遮挡了输入框');
    })()`);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.resolve(__dirname, '../.ui-smoke/empirical-preview.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`el['preview-file-list'].querySelectorAll('button')[2].click();`);
    await win.webContents.executeJavaScript('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.resolve(__dirname, '../.ui-smoke/code-preview.png'), (await win.webContents.capturePage()).toPNG());
    await win.webContents.executeJavaScript(`(async () => {
      if (!el['attach-folder-button']) throw new Error('缺少文件夹上传按钮');
      await chooseConversationFiles(true);
      if (!el['conversation-file-list'].textContent.includes('nested/data.csv')) throw new Error('文件夹导入后未显示附件');
      renderLibrary();
      if (!el['library-list'].textContent.includes('后续对话可用')) throw new Error('数据文件没有保存在项目列表');
      conversationAttachments = [];
      workspace = await window.petAPI.loadWorkspace();
      if (workspace.projects[0].projectFiles[0].name !== 'nested/data.csv') throw new Error('清空本轮附件后项目文件丢失');
    })()`);
    result.folderUpload = true;
    if (consoleErrors.length) throw new Error('浏览器控制台错误：' + consoleErrors.join('; '));
    console.log(JSON.stringify(result));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error.message); win?.destroy(); app.exit(1); }
});
