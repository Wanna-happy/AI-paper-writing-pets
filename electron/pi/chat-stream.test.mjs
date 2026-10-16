import assert from 'node:assert/strict';
import http from 'node:http';
import { createModelLayer } from './model-layer.mjs';
import { createRoleAgent, runAgent } from './agent-factory.mjs';
let ended = false;
const server = http.createServer(async (req, res) => {
  let raw = ''; for await (const part of req) raw += part;
  assert.equal(JSON.parse(raw).stream, true);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const send = delta => res.write(`data: ${JSON.stringify({ id: 'chat-test', object: 'chat.completion.chunk', model: 'deepseek-chat', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
  send({ role: 'assistant', reasoning_content: '内部思考不显示' });
  for (const content of ['第一段', '继续输出', '完成']) {
    send({ content });
    await new Promise(resolve => setTimeout(resolve, 80));
  }
  ended = true;
  res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
  res.end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const layer = createModelLayer({ api: { provider: 'deepseek', baseUrl: `http://127.0.0.1:${server.address().port}`, model: 'deepseek-chat' } });
  const chunks = [], activities = [];
  const result = await runAgent(createRoleAgent({ layer, scenario: 'chat', role: 'chat', systemPrompt: '回答问题', apiKey: 'synthetic-key' }), '问题', {
    onDelta: delta => { assert.equal(ended, false, '增量必须在响应结束之前交付'); chunks.push(delta); },
    onActivity: activity => activities.push(activity),
  });
  assert(activities.some(item => item.state === 'thinking'), '推理阶段必须有可见状态，但不能泄漏推理正文');
  assert.equal(chunks.join(''), '第一段继续输出完成');
  assert.equal(chunks.length, 3);
  assert.equal(result.content, chunks.join(''));
  const events = [], listeners = new Set();
  const fakeAgent = {
    state: { errorMessage: null },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    abort() {},
    async prompt() {
      const emit = event => { for (const fn of listeners) fn(event); };
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '我先查看文件。' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'toolcall_start' } });
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '我先查看文件。' }, { type: 'toolCall' }], stopReason: 'toolUse' } });
      emit({ type: 'tool_execution_start', toolName: 'inspect_data_file' });
      emit({ type: 'tool_execution_end', toolName: 'inspect_data_file' });
      emit({ type: 'message_start', message: { role: 'assistant' } });
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: '已核对实际字段。' } });
      emit({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: '已核对实际字段。' }], stopReason: 'stop' } });
    },
  };
  const toolAnswer = await runAgent(fakeAgent, '核对文件', {
    onDelta: text => events.push(['delta', text]),
    onCommentaryCommit: text => events.push(['commentary', text]),
    onActivity: activity => events.push(['activity', activity.state]),
    onTextReset: () => events.push(['reset']),
  });
  assert.equal(toolAnswer.content, '已核对实际字段。');
  assert.deepEqual(events.filter(event => event[0] === 'commentary'), [['commentary', '我先查看文件。']]);
  assert(events.findIndex(event => event[0] === 'commentary') < events.findIndex(event => event[0] === 'activity'), '工具前的说明须先于执行进度显示');
  console.log('OpenAI-compatible SSE emits chat text before completion and excludes reasoning passed');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
