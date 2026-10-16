const { app, BrowserWindow } = require('electron');
const path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '../.ui-smoke/trace-attachments');
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
      const image = { id: 'img', name: '截图.png', previewDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdeAAAAABJRU5ErkJggg==' };
      const files = [image, { id: 'pdf', name: '论文.pdf' }, { id: 'doc', name: '方案.docx' }, { id: 'xls', name: '数据.xlsx' }];
      conversationAttachments = files; renderConversationAttachments();
      check(el['conversation-file-list'].closest('.composer') && el['conversation-file-list'].compareDocumentPosition(el['task-input']) & Node.DOCUMENT_POSITION_FOLLOWING, '附件不在输入框上方');
      check(el['conversation-file-list'].querySelector('img') && el['conversation-file-list'].querySelector('[data-file-type="PDF"]') && el['conversation-file-list'].querySelector('[data-file-type="DOC"]') && el['conversation-file-list'].querySelector('[data-file-type="XLS"]'), '缩略图或文件类型图标缺失');
      el['conversation-file-list'].querySelector('[aria-label="移除 方案.docx"]').click();
      check(conversationAttachments.length === 3 && !conversationAttachments.some(file => file.id === 'doc'), '移除附件失败');
      const progress = { status: 'failed', steps: [{ id: 'a1', label: '轨迹聚类', status: 'done' }, { id: 'a2', label: '模型预测', status: 'failed' }] };
      activeProject().messages.push({ id: 'status:restore-old', runId: 'restore-old', channel: 'chat', conversationId: 'c', task: '按照既定步骤继续分析', status: 'failed', text: '模型服务余额不足。', progress, attachments: files, createdAt: '2030-01-01' });
      renderConversation();
      const latest = [...el.conversation.querySelectorAll('.chat-exchange')].at(-1);
      check(latest.querySelector('.saved-task-state')?.textContent.includes('轨迹聚类'), '旧消息的已保存步骤未恢复');
      for (let i = 0; i < 100 && !latest.textContent.includes('RECORDED_ACTUAL_CODE'); i++) await new Promise(r => setTimeout(r, 20));
      const process = latest.querySelector('.turn-process');
      check(process && !process.open && process.querySelector('summary .turn-duration')?.textContent === '用时 5m 38s', '用时不是可展开过程的入口');
      process.querySelector('summary').click();
      check(process.open && process.textContent.includes('已从原运行记录恢复的过程'), '用时入口无法展开完整记录');
      check(process.textContent.includes('轨迹聚类') && process.textContent.includes('模型预测'), '恢复原始记录后丢失了本轮任务步骤');
      const tool = process.querySelector('.agent-tool-detail');
      tool.querySelector('summary').click();
      check(tool.open && tool.querySelector('pre').textContent.includes('RECORDED_ACTUAL_CODE'), '运行操作不能点击查看真实代码');
      check(!process.querySelector('.agent-activity-log'), '工具操作仍套在重复折叠层里');
      check(latest.querySelector('.message-attachments').compareDocumentPosition(latest.querySelector('.message-bubble')) & Node.DOCUMENT_POSITION_FOLLOWING, '已发送附件应在气泡上方');
      check(latest.querySelector('.message-attachments img') && latest.querySelector('.message-bubble').textContent === '按照既定步骤继续分析', '历史气泡或附件丢失');
      process.open = false;
      // If no original trace exists, still preserve the recorded steps honestly.
      const view = appendStreamingExchange('没有保存详细时间线的历史任务');
      finishTurn(view.assistantMessage, { progress });
      check(view.assistantMessage.querySelector('.turn-process')?.textContent.includes('模型预测') && view.assistantMessage.textContent.includes('未记录耗时'), '缺少原始过程时丢弃了任务状态或编造了耗时');
      view.exchange.remove();
      el['chat-scroll'].style.scrollBehavior = 'auto';
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      scrollConversation();
    }).toString() + ')()');
    await new Promise(resolve => setTimeout(resolve, 250));
    fs.writeFileSync(path.join(root, '01-trace-attachments.png'), (await win.webContents.capturePage()).toPNG());
    console.log('Clickable duration trace, legacy saved-state recovery, scoped actual tool/code details, bubble/attachment history, typed input attachments and removal passed');
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error.stack); win?.destroy(); app.exit(1); }
});
