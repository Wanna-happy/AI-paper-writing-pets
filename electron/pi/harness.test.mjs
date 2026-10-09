import assert from 'node:assert/strict';
import { createModels, fauxProvider, fauxAssistantMessage } from '@earendil-works/pi-ai';
import { runPlan } from './run-engine.mjs';
import { buildRegistry } from './registry.mjs';
import { planTasks } from './planner.mjs';
import { makeWriterTools } from './agent-tools.mjs';
const faux = fauxProvider({ tokensPerSecond: 1000 });
const models = createModels();
models.setProvider(faux.provider);
const layer = { models, getModel: () => faux.getModel() };
const registry = buildRegistry();
faux.setResponses([fauxAssistantMessage(JSON.stringify({ tasks: [{ id: 't1', role: 'writer', task: '写一段', skills: [], dependsOn: [] }] }))]);
const plan = await planTasks({ layer, registry, userPrompt: '写一段' });
assert.equal(plan.fallback, false);
for (const tasks of [
  [{ id: 'x', role: 'writer', task: 'a' }, { id: 'x', role: 'writer', task: 'b' }],
  [{ id: 'x', role: 'writer', task: 'a', dependsOn: ['y'] }, { id: 'y', role: 'writer', task: 'b', dependsOn: ['x'] }],
]) {
  faux.setResponses([fauxAssistantMessage(JSON.stringify({ tasks }))]);
  assert.equal((await planTasks({ layer, registry, userPrompt: '写背景' })).fallback, true);
}
let retrieved = [];
const [retrieve] = makeWriterTools({ project: {}, ragStore: { retrieve: async (_, query) => query === 'first' ? [{ id: 'a', documentName: 'A', text: '证据A' }] : [{ id: 'b', documentName: 'B', text: '证据B' }, { id: 'a', documentName: 'A', text: '证据A' }] }, recordToolResult: (_, __, result) => { retrieved.push(result); } });
assert((await retrieve.execute('call1', { query: 'first' })).content[0].text.includes('[E1]'));
const second = (await retrieve.execute('call2', { query: 'second' })).content[0].text;
assert(second.includes('[E2] 《B》') && second.includes('[E1] 《A》'));
const controller = new AbortController();
faux.setResponses([fauxAssistantMessage('<p>这是一段还没有完成的较长正文，稍后还将继续。</p>')]);
let partial = '';
await assert.rejects(runPlan({ layer, registry, plan, signal: controller.signal,
  onDelta: delta => { partial += delta; controller.abort(); },
}), error => error.name === 'AbortError');
assert(partial.length > 0);
let seen = '';
faux.setResponses([context => { seen = JSON.stringify(context); return fauxAssistantMessage('<p>接续正文</p>'); }]);
const outputs = { a: { role: 'analyst', text: '真实分析结果' } };
const resumed = await runPlan({ layer, registry,
  plan: { tasks: [{ id: 'a', role: 'analyst', task: '不应重跑', dependsOn: [] }, { id: 'w', role: 'writer', task: '写章', dependsOn: ['a'] }] },
  resumeOutputs: outputs, resumePartial: { taskId: 'w', text: '已有开头' },
  context: { resumeNote: '新增说明', writingContext: '新上传文件内容' },
});
assert.equal(resumed.finalText, '已有开头\n\n<p>接续正文</p>');
for (const text of ['真实分析结果', '已有开头', '新增说明', '新上传文件内容']) assert(seen.includes(text));
assert.equal(resumed.outputs.a.text, outputs.a.text);
console.log('real pi planner/abort/resume regression passed');
