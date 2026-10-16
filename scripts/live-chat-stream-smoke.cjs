const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const profile = path.resolve(__dirname, '../.live-chat-smoke');
fs.mkdirSync(profile, { recursive: true });
app.setPath('userData', profile);
app.on('browser-window-created', (_, window) => window.on('show', () => window.hide()));
process.argv.push('--workspace');
require('../electron/main.js');

const answer = '这是实际界面增量验收用的合成回复。'.repeat(18);
let firstDeltaAt = 0;
let responseEndAt = 0;
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const part of req) raw += part;
  const body = JSON.parse(raw);
  if (!body.stream) {
    const plan = JSON.stringify({ tasks: [{ id: 'chat', role: 'chat', task: '回答简短问题', skills: [], dependsOn: [] }] });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ id: 'synthetic-plan', object: 'chat.completion', model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: plan }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const send = (delta, reason = null) => res.write(`data: ${JSON.stringify({ id: 'synthetic-chat', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason: reason }] })}\n\n`);
  send({ role: 'assistant' });
  send({ reasoning_content: '合成的内部推理，不应显示在界面上' });
  await new Promise(resolve => setTimeout(resolve, 250));
  // The first chunk is intentionally large. The UI must not paint it in one frame.
  firstDeltaAt = Date.now();
  send({ content: answer.slice(0, 240) });
  await new Promise(resolve => setTimeout(resolve, 400));
  send({ content: answer.slice(240) });
  await new Promise(resolve => setTimeout(resolve, 400));
  send({}, 'stop');
  res.write('data: [DONE]\n\n');
  responseEndAt = Date.now();
  res.end();
});

const timeout = setTimeout(() => { console.error('Live stream smoke timed out'); app.exit(1); }, 45000);
app.whenReady().then(async () => {
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let win;
    for (let attempt = 0; attempt < 100; attempt++) {
      win = BrowserWindow.getAllWindows().find(item => item.webContents.getURL().endsWith('/feed.html'));
      if (win && !win.webContents.isLoading()) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert(win, '真实工作台未打开');
    win.webContents.setBackgroundThrottling(false);
    const origin = `http://127.0.0.1:${server.address().port}`;
    const result = await win.webContents.executeJavaScript(`(async () => {
      const config = { enabled: true, provider: 'openai', baseUrl: ${JSON.stringify(origin)}, model: 'synthetic-stream' };
      await petAPI.saveAgentApi('planning', config, 'synthetic-key');
      await petAPI.saveAgentApi('chat', config, 'synthetic-key');
      const project = await petAPI.createProject({ title: '流式验证（合成）', type: '课程论文' });
      workspace = await petAPI.loadWorkspace(); renderAll();
      el['task-input'].value = '请给我一句简短的问候';
      const samples = [];
      const events = [];
      petAPI.onTaskStatus(value => { if (value.stage === 'chat-delta' || value.stage === 'chat-reset') events.push({ at: Date.now(), stage: value.stage, length: value.delta?.length || 0 }); });
      const originalRender = ChatMarkdown.render;
      ChatMarkdown.render = (target, text) => { const value = originalRender(target, text); events.push({ at: Date.now(), stage: 'render', length: text.length, domLength: target.textContent.length, connected: target.isConnected }); return value; };
      const activities = new Set();
      const probe = setInterval(() => {
        const reply = [...document.querySelectorAll('.assistant-message .assistant-reply')].at(-1);
        if (reply) samples.push({ at: Date.now(), length: reply.textContent.length });
        for (const line of document.querySelectorAll('.assistant-message .agent-activity')) activities.add(line.textContent);
        for (const summary of document.querySelectorAll('.assistant-message .agent-activity-log summary')) activities.add(summary.textContent);
      }, 20);
      try { await runGeneration(); } finally { clearInterval(probe); }
      const reply = [...document.querySelectorAll('.assistant-message .assistant-reply')].at(-1);
      ChatMarkdown.render = originalRender;
      return { samples, events, final: reply?.textContent || '', activities: [...activities], projectId: project.id };
    })()`);
    assert.equal(result.final, answer);
    assert(result.activities.some(text => text.includes('正在理解')));
    assert(result.activities.some(text => text.includes('模型正在组织回复')));
    assert(!result.final.includes('内部推理'));
    const partial = result.samples.filter(item => item.length > 0 && item.length < answer.length);
    assert(partial.length >= 3, '没有观察到逐步增长的中间帧');
    assert(new Set(partial.map(item => item.length)).size >= 3, '回复仍然整段跳出');
    assert(partial[0].at < responseEndAt, '首段内容在接口结束后才显示');
    assert(result.events.some(event => event.stage === 'render' && event.length > 0 && event.connected), '增量写入了已脱离页面的节点');
    console.log(JSON.stringify({ passed: true, modelFirstDeltaAt: firstDeltaAt, responseEndAt, firstVisibleAt: partial[0].at, distinctPartialFrames: new Set(partial.map(item => item.length)).size, finalChars: answer.length, activities: result.activities.length }));
    clearTimeout(timeout);
    server.closeAllConnections(); server.close();
    app.quit();
  } catch (error) {
    console.error(error.stack || error.message);
    clearTimeout(timeout);
    server.closeAllConnections(); server.close();
    app.exit(1);
  }
});
