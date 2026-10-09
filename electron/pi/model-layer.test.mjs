// model-layer.test.mjs — 模型层真实行为回归测试（拦住 baseUrl 未挂载 / Key 未注入这类重犯）
//
// 背景：pi 构造请求用的是 model.baseUrl（createClient: baseURL: model.baseUrl），
// baseUrl 必须挂在每个 model 上，否则 pi 静默不发请求、返回空内容——真实调用全挂却不出错。
// faux 测试测不出这一点，所以这里用本地 echo server 抓真实请求验证。
//
// 运行：node electron/pi/model-layer.test.mjs
import http from 'node:http';
import { createModelLayer } from './model-layer.mjs';
import { requestModel } from './model-layer.mjs';
import { createRoleAgent, runAgent } from './agent-factory.mjs';

let captured = [];
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    captured.push({ path: req.url, auth: req.headers.authorization || '(无)', model: JSON.parse(body).model });
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"deepseek-chat","choices":[{"index":0,"delta":{"role":"assistant","content":"你好"},"finish_reason":null}]}\n\n');
    res.write('data: {"id":"1","object":"chat.completion.chunk","created":1,"model":"deepseek-chat","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

let fail = 0;
const check = (cond, msg) => { console.log(cond ? '  PASS' : '  FAIL', msg); if (!cond) fail = 1; };

console.log('模型层真实行为回归');

// 1) baseUrl 必须正确挂到 model 上（含"完整端点/裸域名"两种填法的规范化）
const layerFull = createModelLayer({ api: { baseUrl: `http://127.0.0.1:${port}/chat/completions`, model: 'deepseek-chat', scenarios: { writing: 'deepseek-chat', planning: 'deepseek-chat', analysis: 'deepseek-chat' } } });
check(layerFull.getModel('writing').baseUrl === `http://127.0.0.1:${port}/v1`, '完整端点写法 → 剥尾补 /v1 且挂到 model 上');

const layerBare = createModelLayer({ api: { baseUrl: `http://127.0.0.1:${port}`, model: 'deepseek-chat', scenarios: { writing: 'deepseek-chat', planning: 'deepseek-chat', analysis: 'deepseek-chat' } } });
check(layerBare.getModel('writing').baseUrl === `http://127.0.0.1:${port}/v1`, '裸域名写法 → 补 /v1 且挂到 model 上');

// 2) complete（Planner 路径）与 streamSimple（writer Agent 路径）都真正发出请求并带 Key
const layer = layerBare;
const model = layer.getModel('writing');
const ctx = { systemPrompt: 'x', messages: [{ role: 'user', content: '你好', timestamp: Date.now() }], tools: [] };

const completeRes = await layer.models.complete(model, ctx, { apiKey: 'sk-test-123' });
let streamed = '';
for await (const ev of layer.models.streamSimple(model, ctx, { apiKey: 'sk-test-123' })) {
  const d = ev?.assistantMessageEvent?.delta || ev?.delta;
  if (typeof d === 'string') streamed += d;
}

check(captured.length === 2, `两条路径各发出 1 个请求（捕获 ${captured.length}）`);
check(captured.every((c) => c.path.endsWith('/chat/completions')), `请求路径正确：${captured.map((c) => c.path).join(' , ')}`);
check(captured.every((c) => c.auth === 'Bearer sk-test-123'), `Authorization 正确带 Key：${captured[0]?.auth}`);
const completeText = Array.isArray(completeRes.content) ? completeRes.content.map((b) => b?.text || '').join('') : String(completeRes.content || '');
check(completeText.includes('你好'), 'complete 拿到内容');
check(streamed.includes('你好'), 'streamSimple 流式拿到内容');

const splitLayer = createModelLayer({ api: { provider: 'deepseek', baseUrl: `http://127.0.0.1:${port}`, model: 'deepseek-chat', agents: {
  planning: { enabled: true, provider: 'deepseek', baseUrl: `http://127.0.0.1:${port}/planner/v1`, model: 'planner-model' },
  chat: { enabled: true, provider: 'openai', baseUrl: `http://127.0.0.1:${port}/chat/v1`, model: 'chat-model' },
  writing: { enabled: true, provider: 'qwen', baseUrl: `http://127.0.0.1:${port}/writer/v1`, model: 'writer-model' },
  analysis: { enabled: true, provider: 'zhipu', baseUrl: `http://127.0.0.1:${port}/analysis/v1`, model: 'analysis-model' },
} } });
splitLayer.getApiKey = scenario => `${scenario}-test-key`;
await requestModel(splitLayer, { scenario: 'planning', messages: [{ role: 'user', content: '规划' }] });
for (const scenario of ['chat', 'writing', 'analysis']) {
  await runAgent(createRoleAgent({ layer: splitLayer, role: scenario, scenario, systemPrompt: '回答' }), '你好');
}
check(captured.slice(2).every((item, index) => item.auth === `Bearer ${['planning', 'chat', 'writing', 'analysis'][index]}-test-key`), '各 Agent 使用自己的 API Key');
check(captured.slice(2).map(item => item.path).join(',') === '/planner/v1/chat/completions,/chat/v1/chat/completions,/writer/v1/chat/completions,/analysis/v1/chat/completions', '各 Agent 使用自己的接口地址');
check(captured.slice(2).map(item => item.model).join(',') === 'planner-model,chat-model,writer-model,analysis-model', '各 Agent 使用自己的模型');

server.closeAllConnections();
await new Promise((resolve) => server.close(resolve));
console.log(fail === 0 ? '全部通过' : '存在失败项');
process.exitCode = fail;
