import assert from 'node:assert/strict';
import http from 'node:http';
import { createModelLayer, requestModel } from './model-layer.mjs';
import { createRoleAgent, runAgent } from './agent-factory.mjs';
import providers from '../providers/provider-registry.js';
const requests = [];
const server = http.createServer(async (req, res) => {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  const route = new URL(req.url, 'http://localhost').pathname;
  requests.push({ path: route, headers: req.headers, body });
  if (route.endsWith('/messages')) {
    const message = { id: 'msg_test', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
    if (!body.stream) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ...message, content: [{ type: 'text', text: 'Claude 本地验证' }], stop_reason: 'end_turn' }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (name, value) => res.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...value })}\n\n`);
      event('message_start', { message });
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'Claude 本地验证' } });
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } });
      event('message_stop', {});
      res.end();
    }
  } else {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: '混元本地验证' }, finish_reason: 'stop' }] }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
try {
  const layer = createModelLayer({ api: { provider: 'anthropic', baseUrl: origin + '/v1/messages', model: 'claude-test' } });
  layer.getApiKey = () => 'synthetic-claude-key';
  assert.equal(layer.getModel('chat').api, 'anthropic-messages');
  assert.equal((await requestModel(layer, { scenario: 'planning', messages: [{ role: 'system', content: '系统要求' }, { role: 'user', content: '规划' }] })).content, 'Claude 本地验证');
  let text = '';
  assert.equal((await runAgent(createRoleAgent({ layer, scenario: 'chat', role: 'chat', systemPrompt: '系统要求' }), '问题', { onDelta: delta => text += delta })).content, 'Claude 本地验证');
  assert.equal(text, 'Claude 本地验证');
  const registry = new providers.ProviderRegistry();
  await registry.complete('anthropic', 'synthetic-claude-key', [{ role: 'system', content: '系统要求' }, { role: 'user', content: '测试' }], { endpoint: origin + '/v1/messages' });
  await registry.stream('anthropic', 'synthetic-claude-key', [{ role: 'user', content: '测试流' }], () => {}, { endpoint: origin + '/v1/messages' });
  assert(requests.every(item => item.path === '/v1/messages' && item.headers['x-api-key'] === 'synthetic-claude-key' && item.headers['anthropic-version']));
  assert(requests.every(item => !item.headers.authorization));
  assert(requests[0].body.system);
  const hy = await registry.complete('hunyuan', 'synthetic-hy-key', [{ role: 'user', content: '测试' }], { endpoint: origin + '/v1/chat/completions' });
  assert.equal(hy.content, '混元本地验证');
  assert.equal(requests.at(-1).headers.authorization, 'Bearer synthetic-hy-key');
  assert.equal(providers.resolveEndpoint(origin, providers.DEFAULT_PROVIDERS.anthropic.endpoint), origin + '/v1/messages');
  console.log('Claude native authentication, planner/Agent streaming and HY compatible protocol passed');
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
