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
  const chunks = [];
  const result = await runAgent(createRoleAgent({ layer, scenario: 'chat', role: 'chat', systemPrompt: '回答问题', apiKey: 'synthetic-key' }), '问题', {
    onDelta: delta => { assert.equal(ended, false, '增量必须在响应结束之前交付'); chunks.push(delta); },
  });
  assert.equal(chunks.join(''), '第一段继续输出完成');
  assert.equal(chunks.length, 3);
  assert.equal(result.content, chunks.join(''));
  console.log('OpenAI-compatible SSE emits chat text before completion and excludes reasoning passed');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
