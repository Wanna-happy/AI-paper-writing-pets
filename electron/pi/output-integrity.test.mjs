import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createModels, fauxProvider, fauxAssistantMessage as response, fauxToolCall as call, fauxText as text } from '@earendil-works/pi-ai';
import { runPlan } from './run-engine.mjs';
import { buildRegistry } from './registry.mjs';
import { requestModel } from './model-layer.mjs';
const require = createRequire(import.meta.url);
const { AgentOrchestrator } = require('../agent/orchestrator');
const { postProcessAgentContent } = require('../paper-output');
const { buildAcademicDocx } = require('../word-export');
const { aggregateAnalysisResults } = require('../tools/analysis-results');
const JSZip = require('jszip');
const writer = { id: 'w', role: 'writer', task: '写作', skills: [], dependsOn: [] };

function fixture({ tasks = [writer], analysis = async () => ({}), hits = [] } = {}) {
  const faux = fauxProvider({ tokensPerSecond: 100000 });
  const models = createModels(); models.setProvider(faux.provider);
  const layer = { models, getModel: () => faux.getModel() };
  const runs = new Map(), drafts = [], snapshots = [];
  const project = { id: 'p', title: '合成项目', type: '课程论文', documents: [], drafts: [] };
  const engine = new AgentOrchestrator({
    workspaceStore: {
      loadWorkspace: () => ({ projects: [project] }), getApiKey: () => 'synthetic-key',
      saveAgentRun: run => { const saved = structuredClone(run); runs.set(run.id, saved); snapshots.push(saved); },
      listAgentRuns: () => [...runs.values()].map(run => structuredClone(run)),
      saveDraft: (_, draft) => { drafts.push(draft); return { id: 'd', ...draft }; },
    },
    loadSettings: () => ({ api: { provider: 'deepseek', model: 'test-model' } }),
    loadHarness: async () => ({
      registryMod: { buildRegistry }, modelLayer: { createModelLayer: () => layer, requestModel },
      planner: { planTasks: async () => ({ tasks }) },
      runEngine: { runPlan: args => runPlan({ ...args, context: { ...args.context, runDataAnalysis: analysis } }) },
    }),
    toolRegistry: {}, ragStore: { retrieve: async () => hits }, providerRegistry: {}, skillRuntime: { getCatalog: () => [] },
    buildConversationFileContext: () => '', postProcessContent: postProcessAgentContent,
    emitStream: () => {}, react: () => {}, playCompletion: () => {},
  });
  const run = (attachments = [], task = '合成任务') => engine.run({ projectId: 'p', request: { requestId: randomUUID(), task, attachments } });
  return { engine, faux, runs, drafts, snapshots, run, layer };
}

// Use the real pi model bridge for length repair, even when Planner omits the budget.
{
  const f = fixture({ hits: [{ id: 'e', documentName: '合成资料', text: '理论证据' }] });
  f.faux.setResponses([
    response([call('retrieve_context', { query: '理论' })], { stopReason: 'toolUse' }),
    response(`<p>${'论'.repeat(30)}[E1]</p>`),
    response(`<h2>标题不计</h2><p>${'论'.repeat(10)}[E1]</p>`),
  ]);
  const draft = await f.run([], '请写9—12个汉字');
  assert(draft.content.includes('data-footnote="1"'));
  const run = [...f.runs.values()][0];
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.lengthReview.attempts.at(-1).actual, 10);
}
{
  const f = fixture();
  f.faux.setResponses([response(`<p>${'文'.repeat(30)}</p>`), response(`<p>${'文'.repeat(25)}</p>`), response(`<p>${'文'.repeat(20)}</p>`)]);
  const draft = await f.run([], '写9—12汉字');
  assert.equal(f.drafts.length, 1);
  assert.equal(draft.content, `<p>${'文'.repeat(20)}</p>`);
  assert.equal(draft.deliveryStatus, 'needs-revision');
  assert(draft.checks.some(check => check.includes('篇幅未达标')));
  const zip = await JSZip.loadAsync(await buildAcademicDocx({ title: '合成项目', type: '课程论文' }, draft));
  assert((await zip.file('word/document.xml').async('string')).includes('文'.repeat(20)), '超长稿仍可导出 Word');
  const run = [...f.runs.values()][0];
  assert.equal(run.status, 'COMPLETED');
  assert.equal(run.lengthReview.passed, false);
  assert.equal(run.quality.lengthPassed, false);
}
{
  const f = fixture({ hits: [{ id: 'e', documentName: '合成资料', text: '理论证据' }] });
  f.faux.setResponses([
    response([call('retrieve_context', { query: '理论' })], { stopReason: 'toolUse' }),
    response(`<p>${'论'.repeat(30)}[E1]</p>`), response('论'.repeat(10)),
  ]);
  await assert.rejects(f.run([], '写9—12字'), /丢失引用/);
  assert.equal(f.drafts.length, 0);
}

// Real pi loop: failures/truncation with nonempty output must not save a draft
// or mark the task completed. Also cover the direct model bridge.
for (const stopReason of ['error', 'length']) {
  const f = fixture();
  f.faux.setResponses([response('<p>未完成的正文', { stopReason, errorMessage: 'synthetic failure' })]);
  await assert.rejects(f.run(), /未正常完成|长度上限/);
  assert.equal(f.drafts.length, 0);
  const run = [...f.runs.values()][0];
  assert.equal(run.status, 'FAILED');
  assert.deepEqual(run.checkpoint.completedIds, []);
  for (const stream of [false, true]) {
    f.faux.setResponses([response('partial', { stopReason, errorMessage: 'synthetic failure' })]);
    await assert.rejects(requestModel(f.layer, { messages: [{ role: 'user', content: 'test' }], ...(stream ? { onDelta: () => {} } : {}) }), /未正常完成|长度上限/);
  }
}
{
  const f = fixture({ hits: [{ id: 'e', documentName: '合成资料', text: '理论证据' }] });
  f.faux.setResponses([
    response([text('我先检索资料。'), call('retrieve_context', { query: '理论' })], { stopReason: 'toolUse' }),
    response('<p>正式论述。[E1]</p>'),
  ]);
  const draft = await f.run();
  assert(draft.content.includes('正式论述'));
  assert(!draft.content.includes('我先检索'));
  const checkpoint = [...f.runs.values()][0].checkpoint;
  assert.equal(checkpoint.outputs.w.text, '<p>正式论述。[E1]</p>');
  assert(f.snapshots.some(run => run.checkpoint?.partialTaskId === 'w' && run.checkpoint.partialText === ''), '工具轮次需要清除暂存过程文字');
}
{
  const f = fixture();
  f.faux.setResponses([response('<p>样本为2846名，OLS回归结果显著。</p>')]);
  await assert.rejects(f.run([{ id: 'irrelevant', name: '说明.txt', excerpt: '无关工作说明' }]), /未能对应/);
  assert.equal(f.drafts.length, 0);
}
{
  const f = fixture({ hits: [{ id: 'e', documentName: '合成研究', text: '样本为24名，OLS回归结果显著，系数为0.25。' }] });
  f.faux.setResponses([
    response([call('retrieve_context', { query: '样本' })], { stopReason: 'toolUse' }),
    response('<p>样本为24名，OLS回归结果显著，系数为0.25。[E1]</p>'),
  ]);
  assert((await f.run()).content.includes('data-footnote="1"'));
}

const analysisTask = { id: 'a', role: 'analyst', task: '分析数据', skills: [], dependsOn: [] };
{
  const f = fixture({ tasks: [analysisTask] });
  f.faux.setResponses([
    response([call('run_data_analysis', { request: '计算描述统计' })], { stopReason: 'toolUse' }),
    response('重复输出整张表'.repeat(100), { stopReason: 'length' }),
  ]);
  const result = await runPlan({ layer: f.layer, registry: buildRegistry(), plan: { tasks: [analysisTask] }, context: {
    runDataAnalysis: async () => ({ error: null, structured: { stepId: 'a1', methodId: 'descriptive', status: 'completed', sampleSize: 3,
      summary: '均值为2', tables: [{ title: '描述统计', columns: ['变量', '均值'], rows: [['x', 2]] }], diagnostics: [], limitations: [] } }),
  } });
  assert.equal(result.outputs.a.text, 'a1：均值为2');
  assert.equal(result.blocked, false, '模型的冗长尾述不应丢弃已完成的本地分析');
}
const dependentWriter = { ...writer, dependsOn: ['a'] };
{
  let usedAttachments;
  const f = fixture({ tasks: [analysisTask, dependentWriter], analysis: async args => {
    usedAttachments = args.attachments;
    return { summary: '新版数据的分析结果', files: [], error: null };
  } });
  const oldCheckpoint = {
    task: '分析后写作', plan: { tasks: [analysisTask, dependentWriter] }, attachments: [{ id: 'old', name: 'data.csv' }],
    outputs: { a: { role: 'analyst', text: '旧数据结论' } }, completedIds: ['a'],
    partialTaskId: 'w', partialText: '旧版半截正文', toolResults: [{ role: 'analyst', toolName: 'run_data_analysis', result: { summary: '旧数据结论', files: ['old.png'] } }],
  };
  f.runs.set('old-run', { id: 'old-run', status: 'SUSPENDED', checkpoint: structuredClone(oldCheckpoint) });
  f.faux.setResponses([
    response([call('run_data_analysis', { request: '计算', dataFile: 'data.csv' })], { stopReason: 'toolUse' }),
    response('新版分析已完成'), response('<p>新版正文。</p>'),
  ]);
  await assert.rejects(f.engine.resume({ projectId: 'p', runId: 'old-run', request: { requestId: 'new-run', attachments: [{ id: 'new', name: 'data.csv' }] } }), /未确认分析方案/);
  assert.equal(usedAttachments, undefined, '旧存档和替换文件不能绕过分析方案确认');
  assert.equal(f.drafts.length, 0);
  assert.deepEqual(f.runs.get('old-run').checkpoint, oldCheckpoint, '原存档应保持可追溯');
}

const root = path.resolve('.ui-smoke', `analysis-artifacts-${randomUUID()}`);
assert(root.startsWith(path.resolve('.ui-smoke') + path.sep));
fs.mkdirSync(root, { recursive: true });
try {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdeAAAAABJRU5ErkJggg==', 'base64');
  const files = ['chart-a.png', 'chart-b.png'].map(name => { const file = path.join(root, name); fs.writeFileSync(file, png); return file; });
  let index = 0;
  const f = fixture({ tasks: [analysisTask, dependentWriter], analysis: async () => {
    const n = index++;
    if (n === 2) return { error: '合成第三项分析失败', files: [] };
    return { summary: `计算结果${n + 1}`, files: [files[n]], code: `code-${n}`, error: null,
      table: { title: `结果${n + 1}`, columns: ['指标', '值'], rows: [{ 指标: `指标${n + 1}`, 值: n + 10 }] } };
  } });
  f.faux.setResponses([
    ...[1, 2, 3].map(n => response([call('run_data_analysis', { request: `计算${n}` })], { stopReason: 'toolUse' })),
    response('两项分析成功，一项失败。'), response('<p>分析结果如下。</p>'),
  ]);
  const records = [];
  const output = await runPlan({ layer: f.layer, registry: buildRegistry(), plan: { tasks: [analysisTask, dependentWriter] }, context: {
    runDataAnalysis: async () => {
      const n = index++;
      if (n === 2) return { error: '合成第三项分析失败', files: [] };
      return { summary: `计算结果${n + 1}`, files: [files[n]], code: `code-${n}`, error: null,
        table: { title: `结果${n + 1}`, columns: ['指标', '值'], rows: [{ 指标: `指标${n + 1}`, 值: n + 10 }] } };
    }, recordToolResult: (_, __, result) => records.push({ result }),
  } });
  const toolResult = aggregateAnalysisResults(records);
  const draft = { title: '合成导出', toolResult, content: postProcessAgentContent(output.finalText, [], toolResult, []), checks: toolResult.errors };
  assert.deepEqual(draft.toolResult.files, files);
  assert.equal(draft.toolResult.analyses.length, 2);
  assert.equal(draft.toolResult.tables.length, 2);
  assert(draft.checks.some(check => check.includes('第三项分析失败')));
  for (const label of ['chart-a', 'chart-b', '表 1 结果1', '表 2 结果2']) assert(draft.content.includes(label), label);
  assert.equal((draft.content.match(/data:image\/png/g) || []).length, 2);
  const zip = await JSZip.loadAsync(await buildAcademicDocx({ title: '合成导出' }, draft));
  const xml = await zip.file('word/document.xml').async('string');
  for (const label of ['chart-a', 'chart-b', '结果1', '结果2', '指标1', '指标2']) assert(xml.includes(label), label);
  assert.equal((xml.match(/<w:drawing>/g) || []).length, 2);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
console.log('Real pi + orchestrator: incomplete rejection, final-only text, provenance, replacement restart, all analysis artifacts and Word export passed');
