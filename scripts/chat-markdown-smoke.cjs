const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

// Use only synthetic preload data and an isolated temporary profile.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-markdown-'));
app.setPath('userData', profile);
app.whenReady().then(async () => {
  let win;
  try {
    win = new BrowserWindow({ show: false, width: 1280, height: 900,
      webPreferences: { preload: path.join(__dirname, 'ui-smoke-preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.resolve(__dirname, '../src/feed.html'));
    const result = await win.webContents.executeJavaScript(`(async () => {
      const check = (condition, message) => { if (!condition) throw new Error(message); };
      for (let i = 0; i < 50 && !document.querySelector('.assistant-reply'); i++) await new Promise(r => setTimeout(r, 50));
      const source = [
        '**三、两项待定项，请你定**', '',
        '1. **年份截点**：2000—2022，字段为 \`country_id\`。',
        '2. **现金支持**：需核对类型。',
        '   - 嵌套列表', '',
        '## 数据核验', '', '> 请核验原始资料。', '',
        '| 字段 | 样本 |', '| --- | --- |', '| year | 736 |', '',
        '\`\`\`python', 'print("<script> **code**")', '\`\`\`', '',
        '[危险链接](javascript:alert%281%29)',
        '[正常来源](https://example.com)',
        '<script>window.markdownExecuted = true</script>',
        '<img src=x onerror="window.markdownExecuted=true">',
        '![远程图](https://example.com/tracker.png)',
      ].join('\\n');
      workspace.projects[0].messages[0].text = source;
      renderConversation();
      const reply = document.querySelectorAll('.assistant-reply')[1];
      check(reply.querySelector('strong')?.textContent === '三、两项待定项，请你定', '截图中的加粗未渲染');
      check(reply.querySelector('ol > li strong')?.textContent === '年份截点', '编号列表或行内加粗失败');
      check(reply.querySelector('ol ul li')?.textContent === '嵌套列表', '嵌套列表失败');
      check(reply.querySelector('code')?.textContent === 'country_id', '字段行内代码失败');
      check(reply.querySelector('h2') && reply.querySelector('blockquote') && reply.querySelectorAll('tbody td').length === 2, '标题、引用或表格失败');
      check(reply.querySelector('pre code')?.textContent.includes('<script> **code**'), '代码块被当作 HTML 或 Markdown');
      check(!reply.querySelector('script,img,[onerror],[onclick]') && !window.markdownExecuted, '不安全 HTML 进入消息');
      check(!reply.querySelector('a[href^="javascript:"]') && reply.querySelector('a[href="https://example.com"]'), '链接过滤失败');
      check(workspace.projects[0].messages[0].text === source, '历史消息原文被修改');
      check(getComputedStyle(reply).whiteSpace === 'normal', 'Markdown 仍继承 pre-wrap');
      const streamView = appendStreamingExchange('测试流式 Markdown');
      const stream = streamingDraft = { requestId: 'markdown-test', content: '', ...streamView };
      handleDraftStream({ requestId: 'markdown-test', delta: '**三、两项' });
      handleDraftStream({ requestId: 'markdown-test', delta: '待定项，请你定**\\n\\n1. 字段 \`year\`' });
      await chatTextRenderer(stream).finish(stream.content);
      check(stream.reply.querySelector('strong')?.textContent === '三、两项待定项，请你定', '跨分片加粗失败');
      check(stream.reply.querySelector('ol code')?.textContent === 'year', '流式列表或代码失败');
      handleTaskStatus({ requestId: 'markdown-test', stage: 'chat-reset', text: '**重新核验**' });
      check(stream.reply.querySelector('strong')?.textContent === '重新核验', '重置回复丢失 Markdown');
      stream.textRenderer.cancel(); streamingDraft = null;
      renderConversation();
      check(document.querySelectorAll('.assistant-reply')[1].querySelector('strong'), '重载历史丢失格式');
      const repair = document.createElement('div');
      ChatMarkdown.render(repair, '**核验结论（当前范围） ** 已确认。 **二、样本口径 ** 682 行。');
      check(repair.querySelectorAll('strong').length === 2 && repair.querySelectorAll('h3').length === 1 && repair.querySelectorAll('p').length === 2, '不规则加粗或压缩章节未修复');
      const longText = '核验过程很长。'.repeat(250);
      ChatMarkdown.render(repair, longText);
      check(!repair.querySelector('details.chat-reply-overflow'), '长回复和预览不应自动折叠');
      check(repair.textContent.includes(longText), '完整正文不能丢失');
      const fileReply = document.createElement('div'); fileReply.classList.add('is-streaming');
      ChatMarkdown.render(fileReply, '[清洗副本](artifact://preparation/test)');
      check(!fileReply.querySelector('a') && !fileReply.textContent.includes('清洗副本'), '流式过程中提前出现了产物链接');
      fileReply.classList.remove('is-streaming');
      ChatMarkdown.render(fileReply, '[清洗副本](artifact://preparation/test)');
      check(fileReply.querySelector('a')?.getAttribute('href') === 'artifact://preparation/test', '任务结束后产物链接未显示');
      return { history: true, streaming: true, reset: true, blocks: true, safeHtml: true, originalPreserved: true };
    })()`);
    assert.equal(result.streaming, true);
    await win.webContents.executeJavaScript(`document.querySelectorAll('.assistant-reply')[1].scrollIntoView({ block: 'start' });`);
    const screenshot = path.join(profile, 'chat-markdown.png');
    fs.writeFileSync(screenshot, (await win.webContents.capturePage()).toPNG());
    console.log(screenshot);
    console.log(JSON.stringify(result));
    win.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    win?.destroy();
    app.exit(1);
  }
});
