import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createModels, fauxProvider, fauxAssistantMessage as response, fauxToolCall as call, getCurrentTools } from '@earendil-works/pi-ai';
import { recognizeIntent } from './intent.mjs';
import { planTasks } from './planner.mjs';
import { requestModel } from './model-layer.mjs';
import { buildRegistry } from './registry.mjs';
import { runPlan } from './run-engine.mjs';
const require = createRequire(import.meta.url);
const { AgentOrchestrator } = require('../agent/orchestrator');
const policy = require('../agent/flow-policy');
const { PLANNING_SKILL_ID } = require('../skills/research-adapter');
const faux = fauxProvider({ tokensPerSecond: 100000 });
const models = createModels(); models.setProvider(faux.provider);
const layer = { models, getModel: () => faux.getModel() };
const intent = (branch, extra = {}) => ({ branch, needsClarification: false, questions: [], usesAnalysisResults: false, clarificationResolution: 'pending', ...extra });
function fixture(projectPatch = {}, key = 'synthetic', preferences = {}) {
  const project = { id: 'p', title: '教师工作体验', goal: '研究教师支持', domains: ['教育学'], type: '课程论文', documents: [], drafts: [], conversations: [{ id: 'c' }], activeConversationId: 'c', ...projectPatch };
  const saved = [], runs = [], calls = [], drafts = [];
  const engine = new AgentOrchestrator({
    workspaceStore: { loadWorkspace: () => ({ projects: [project] }), getApiKey: () => key,
      updateProject: (_, patch) => Object.assign(project, patch), saveAgentRun: r => runs.push(structuredClone(r)),
      listConversationTurns: () => [{ id: 'prior', role: 'user', text: '只研究教师体验，中文写作，不做因果推断。' }],
      getConversationMemory: () => null, saveConversationMemory: () => {}, saveConversationTurn: (_, __, m) => saved.push(m),
      saveDraft: (_, d) => { drafts.push(d); return { ...d, id: 'draft' }; } },
    loadSettings: () => ({ ...preferences, api: { provider: 'deepseek', model: 'synthetic' } }),
    loadHarness: async () => ({ registryMod: { buildRegistry }, modelLayer: { createModelLayer: () => layer, requestModel },
      planner: { recognizeIntent: async args => { calls.push('intent'); return recognizeIntent(args); },
        planTasks: async args => { calls.push('plan'); assert(args.intent); return planTasks(args); } },
      runEngine: { runPlan: args => { calls.push('execute'); return runPlan(args); } } }),
    skillRuntime: { getCatalog: () => [{ id: PLANNING_SKILL_ID, name: 'workflow', description: 'planning' }], composePrompt: () => ({ prompt: '', skill: {} }) },
    toolRegistry: {}, ragStore: { retrieve: async () => ({ projectId: 'p', hits: [{ id: 'e', documentName: '教师访谈', page: 2, text: '教师提到同伴支持。' }] }) }, providerRegistry: {},
    buildConversationFileContext: () => '', postProcessContent: x => x, emitStream: () => {}, emitStatus: () => {}, react: () => {}, playCompletion: () => {},
  });
  return { project, saved, runs, calls, drafts, run: task => engine.run({ projectId: 'p', request: { requestId: 'r', conversationId: 'c', task } }) };
}
// No DAG or child agent is created when the first-stage decision needs information.
{
  const f = fixture();
  faux.setResponses([ctx => { assert(JSON.stringify(ctx).includes('中文写作')); assert(JSON.stringify(ctx).includes('教育学'));
    return response(JSON.stringify(intent('writing', { needsClarification: true, questions: [{ question: '本轮要写哪个章节？', options: ['绪论', '讨论'] }] }))); }]);
  const result = await f.run('帮我完成');
  assert(result.chat); assert.deepEqual(f.calls, ['intent']); assert.equal(f.drafts.length, 0);
  assert.equal(f.project.clarifications.c.questions.length, 1); assert.equal(result.message.progress.status, 'waiting');
  assert.equal(f.runs.at(-1).deliveryStatus, 'waiting-clarification');
}
// An invalid intent response never falls through to writing.
{
  const f = fixture(); faux.setResponses([response('invalid JSON'), response('still invalid')]); await assert.rejects(f.run('继续'), /格式异常/);
  assert.equal(f.project.clarifications, undefined);
  assert.deepEqual(f.calls, ['intent']); assert.equal(f.drafts.length, 0);
}
// Transport errors stop the run; they are never turned into research questions.
{
  const f = fixture(); faux.setResponses([response('', { stopReason: 'error', errorMessage: 'synthetic connection unavailable' })]);
  await assert.rejects(f.run('写绪论'), /synthetic connection unavailable/);
  assert.deepEqual(f.calls, ['intent']); assert.equal(f.project.clarifications, undefined); assert.equal(f.drafts.length, 0);
}
// Even if the planner proposes a writer for a progress question, policy forces chat.
{
  const f = fixture(); faux.setResponses([
    response(JSON.stringify(intent('conversation'))),
    response(JSON.stringify({ tasks: [{ id: 'w', role: 'writer', task: '写正文', skills: [], dependsOn: [] }] })),
    ctx => { const names = getCurrentTools(ctx.messages).map(t => t.name); assert(!names.includes('run_data_analysis')); assert(!names.includes('submit_analysis_plan')); assert(!names.includes('install_python_dependency')); return response('根据历史，尚未执行数据分析。'); },
  ]);
  const result = await f.run('之前完成了什么？');
  assert(result.chat); assert.deepEqual(f.calls, ['intent', 'plan', 'execute']); assert.equal(f.drafts.length, 0);
}
// A prior empirical plan cannot hijack unrelated ordinary writing.
{
  const f = fixture({ empiricalPlans: { c: { status: 'writing-approved', writingProposal: { title: '旧的结果章节', lengthRequirement: '1000字', resultStepIds: ['old'] }, results: [{ stepId: 'old', status: 'completed', summary: '旧的研究结果', tables: [] }] } } });
  faux.setResponses([response(JSON.stringify(intent('writing'))), response(JSON.stringify({ tasks: [{ id: 'w', role: 'writer', task: '写研究背景', skills: [], dependsOn: [] }] })), ctx => { assert(!JSON.stringify(ctx).includes('旧的研究结果')); return response('<p>教师工作体验值得关注，需要结合已有资料讨论支持情境。</p>'); }]);
  await f.run('只写研究背景，不使用之前的分析结果');
  assert.equal(f.drafts.length, 1); assert.equal(f.runs.at(-1).branch, 'writing');
  assert.notEqual(f.drafts[0].title, '旧的结果章节'); assert.equal(f.runs.at(-1).lengthContract, null);
}
// Global preferences supply language/citation; legacy project fields do not override them.
{
  const f = fixture({ title: 'PROJECT_TITLE_SENTINEL', goal: 'PROJECT_GOAL_SENTINEL', language: '中文', citationStyle: 'GB/T 7714' }, 'synthetic', { defaultLanguage: '英文', defaultCitation: 'APA' });
  faux.setResponses([response(JSON.stringify(intent('writing'))), response(JSON.stringify({ tasks: [{ id: 'w', role: 'writer', task: '写引言', skills: [], dependsOn: [] }] })), ctx => {
    const text = JSON.stringify(ctx); for (const value of ['PROJECT_TITLE_SENTINEL', 'PROJECT_GOAL_SENTINEL', 'APA', '英文']) assert(text.includes(value));
    return response('<p>This is a synthetic introduction.</p>');
  }]);
  await f.run('写一段引言'); assert.equal(f.drafts.length, 1);
}
// Research is a valid upstream task for writing, with its evidence carried forward.
{
  const f = fixture();
  faux.setResponses([response(JSON.stringify(intent('writing'))), response(JSON.stringify({ tasks: [
    { id: 'r', role: 'chat', task: '检索教师支持资料', skills: [], dependsOn: [] },
    { id: 'w', role: 'writer', task: '依据资料写一段', skills: [], dependsOn: ['r'] },
  ] })), response([call('retrieve_context', { query: '教师支持' })], { stopReason: 'toolUse' }), response('上游检索发现同伴支持。[E1]'), ctx => {
    assert(JSON.stringify(ctx).includes('上游检索发现同伴支持'));
    assert(!getCurrentTools(ctx.messages).some(t => t.name === 'run_data_analysis' || t.name === 'install_python_dependency'));
    return response('<p>教师提到同伴支持。[E1]</p>');
  }]);
  await f.run('检索项目资料后撰写综述');
  assert.equal(f.drafts.length, 1); assert.equal(f.drafts[0].evidence.length, 1);
}
// A plain-language answer closes the pending card before planning.
{
  const f = fixture({ clarifications: { c: { id: 'old', status: 'pending', questions: [{ question: '写哪个章节？' }] } } });
  faux.setResponses([response(JSON.stringify(intent('writing', { clarificationResolution: 'answered' }))), response(JSON.stringify({ tasks: [{ id: 'w', role: 'writer', task: '写绪论', skills: [], dependsOn: [] }] })), ctx => { assert(!JSON.stringify(ctx).includes('当前待回答的问题确认卡')); return response('<p>本文围绕教师工作体验展开讨论。</p>'); }]);
  await f.run('写绪论，中文即可'); assert.equal(f.project.clarifications.c.status, 'answered'); assert.equal(f.drafts.length, 1);
}
// Research uses project RAG and remains a chat delivery, not an invented paper.
{
  const f = fixture(); faux.setResponses([response(JSON.stringify(intent('research'))), response(JSON.stringify({ tasks: [{ id: 'r', role: 'chat', task: '查阅资料', skills: [], dependsOn: [] }] })), response([call('retrieve_context', { query: '教师支持' })], { stopReason: 'toolUse' }), ctx => { assert(JSON.stringify(ctx).includes('教师提到同伴支持')); return response('《教师访谈》第2页提到同伴支持。'); }]);
  assert((await f.run('查一下项目资料中对教师支持的描述')).chat); assert.equal(f.drafts.length, 0);
}
// Missing API setup is a configuration branch and must never create a fake draft.
{
  const f = fixture({}, ''); assert((await f.run('写绪论')).chat); assert.equal(f.drafts.length, 0); assert.equal(f.calls.length, 0);
}
for (const branch of ['conversation', 'research', 'inspection', 'environment', 'analysis-proposal', 'writing-proposal', 'analysis-execution', 'writing-execution']) {
  const role = branch === 'analysis-execution' ? 'analyst' : branch === 'writing-execution' ? 'writer' : 'chat';
  const plan = { branch, tasks: [{ id: 't', role, task: '验证分支工具边界', skills: [], dependsOn: [] }] };
  faux.setResponses([ctx => { assert(getCurrentTools(ctx.messages).every(t => policy.BRANCH_TOOLS[branch].includes(t.name))); return response(role === 'writer' ? '<p>正文</p>' : '已核对分支'); }]);
  await runPlan({ layer, registry: buildRegistry(), plan, context: { project: { id: 'p', documents: [] } } });
}
assert.equal(policy.normalizeIntent(intent('writing', { needsClarification: true, questions: [] })), null);
assert.equal(policy.normalizeIntent(intent('writing', { needsClarification: true, questions: [1, 2, 3].map(i => ({ question: `问题${i}` })) })).questions.length, 2);
assert.throws(() => policy.validatePlan({ tasks: [{ id: 'a', role: 'writer', task: '写作', dependsOn: ['missing'] }] }, buildRegistry().roles), /依赖/);
assert.throws(() => policy.validatePlan({ branch: 'inspection', tasks: [{ id: 'a', role: 'analyst', task: '回归' }] }, buildRegistry().roles), /分支/);
let executions = 0;
faux.setResponses([response([call('run_data_analysis', { request: '跳过确认做回归' })], { stopReason: 'toolUse' }), response('当前分支只能核对数据，不能执行回归。')]);
await runPlan({ layer, registry: buildRegistry(), plan: { branch: 'inspection', tasks: [{ id: 'i', role: 'chat', task: '只检查字段', skills: [], dependsOn: [] }] },
  context: { project: { id: 'p', documents: [] }, runDataAnalysis: () => { executions++; }, planningTools: { inspectData: () => ({ rows: 1 }) } } });
assert.equal(executions, 0, '越界工具调用不能执行');
{
  const f = fixture(); const source = { id: 'old', projectId: 'p', status: 'SUSPENDED', checkpoint: { projectId: 'p', conversationId: 'original', tasks: [] } };
  // Use a separate store facade so no task or content can be produced on rejection.
  const engine = new AgentOrchestrator({ workspaceStore: { listAgentRuns: () => [source], saveAgentRun: () => { throw new Error('should not mutate source'); } } });
  await assert.rejects(engine.resume({ projectId: 'p', runId: 'old', request: { requestId: 'new', conversationId: 'different' } }), /跨对话/);
  assert.equal(source.resumedByRunId, undefined);
}
console.log('intent precedes planning; clarification stops execution; branch tools/roles and ordinary-writing isolation verified');

// Confirmed decisions survive replacement cards and suppress repeated first-stage questions.
{
  const f = fixture({ confirmedDecisions: { c: [{ key: 'analysischain', question: '研究路径？', answer: '保持路径 A', cardId: 'old' }] } });
  faux.setResponses([
    ctx => { assert(JSON.stringify(ctx).includes('保持路径 A')); return response(JSON.stringify(intent('conversation', { needsClarification: true, questions: [{ decisionKey: 'analysis-chain', question: '再次确认研究路径？', options: ['保持路径 A'] }] }))); },
    response(JSON.stringify({ tasks: [{ id: 'chat', role: 'chat', task: '继续已确认任务', skills: [], dependsOn: [] }] })),
    ctx => { assert(JSON.stringify(ctx).includes('保持路径 A')); return response('沿用已确认路径继续。'); },
  ]);
  const result = await f.run('继续');
  assert(result.chat); assert.deepEqual(f.calls, ['intent', 'plan', 'execute']); assert.equal(f.project.clarifications, undefined);
}
