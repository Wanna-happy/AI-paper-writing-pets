import researchAdapter from '../skills/research-adapter.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { createModels, fauxProvider, fauxAssistantMessage as response, fauxToolCall as call } from '@earendil-works/pi-ai';
import { runPlan } from './run-engine.mjs';
import { buildRegistry } from './registry.mjs';
import { requestModel } from './model-layer.mjs';
const require = createRequire(import.meta.url);
const { AgentOrchestrator } = require('../agent/orchestrator');
const { SkillRuntime } = require('../skills/skill-runtime');
const { postProcessAgentContent } = require('../paper-output');
const { fingerprint, normalizeProposal } = require('../empirical-workflow');
const { findPythonExecutable } = require('../tools/tool-registry');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-flow-'));
try {
  const source = path.join(root, 'data.csv'); fs.writeFileSync(source, 'x,y\n1,2\n2,4\n');
  const attachment = { id: 'f', name: 'data.csv', extension: '.csv' };
  const project = { id: 'p', title: '合成项目', type: '课程论文', documents: [], drafts: [], conversations: [{ id: 'c' }], activeConversationId: 'c' };
  const runs = new Map(), turns = [], drafts = [], events = [];
  const faux = fauxProvider({ tokensPerSecond: 100000 });
  const models = createModels(); models.setProvider(faux.provider);
  const layer = { models, getModel: () => faux.getModel() };
  let route = 'analyst', actualCalls = 0;
  const engine = new AgentOrchestrator({
    workspaceStore: { loadWorkspace: () => ({ projects: [project] }), getApiKey: () => 'synthetic-key', updateProject: (_, patch) => Object.assign(project, patch),
      saveAgentRun: run => runs.set(run.id, structuredClone(run)), listAgentRuns: () => [...runs.values()],
      saveConversationTurn: (_, __, turn) => turns.push(turn), saveDraft: (_, draft) => { drafts.push(draft); return { ...draft, id: 'draft' }; } },
    loadSettings: () => ({ api: { provider: 'deepseek', model: 'test-model' } }),
    loadHarness: async () => ({ registryMod: { buildRegistry }, modelLayer: { createModelLayer: () => layer, requestModel },
      planner: { recognizeIntent: async () => ({ branch: route === 'writer' ? 'writing' : 'analysis', needsClarification: false, questions: [], usesAnalysisResults: route === 'writer', clarificationResolution: 'pending' }),
        planTasks: async () => ({ tasks: [{ id: 'routed', role: route, task: '测试', skills: route === 'chat' ? [researchAdapter.PLANNING_SKILL_ID] : [], dependsOn: [] }] }) },
      runEngine: { runPlan: args => runPlan({ ...args, context: { ...args.context, runDataAnalysis: async parameters => {
        actualCalls++; assert.equal(parameters.analysisPlan.status, 'approved'); assert(parameters.skillPrompt.includes('OLS'));
        const structured = { planId: parameters.analysisPlan.id, revision: parameters.analysisPlan.revision, stepId: parameters.stepId, methodId: 'ols', status: 'completed', sampleSize: 2, summary: 'OLS系数为2，样本量2', tables: [{ title: 'OLS回归', columns: ['变量', '系数'], rows: [['x', 2]] }], files: [], dataFingerprint: fingerprint(source) };
        return { summary: structured.summary, structured, tables: structured.tables, files: [], error: null };
      } } }) } }),
    toolRegistry: { resolveAttachment: () => source, userDataPath: root, findPython: findPythonExecutable }, ragStore: { retrieve: async () => ({ hits: [] }) }, providerRegistry: {},
    skillRuntime: new SkillRuntime(path.resolve('assets/research-skills')),
    buildConversationFileContext: () => '', postProcessContent: postProcessAgentContent, emitStatus: (_, event) => events.push(event),
    emitStream: () => {}, react: () => {}, playCompletion: () => {},
  });
  let number = 0;
  const run = (empiricalApproval, task = '测试实证流程') => engine.run({ projectId: 'p', request: { requestId: `f${++number}`, conversationId: 'c', task, attachments: [attachment], ...(empiricalApproval ? { empiricalApproval } : {}) } });
  const proposal = { researchQuestion: 'x与y关联', objective: 'association', dataFile: 'data.csv', dataDescription: '连续变量横截面，仅合成数据', missingDataPolicy: '完整案例', interpretationLimits: '不推断因果', steps: [{ methodId: 'ols', label: 'OLS主回归', purpose: '估计关联', specification: 'y ~ x，HC3', outputs: '回归表' }] };
  project.clarifications = { c: { id: 'old-card', status: 'pending', questions: [{ id: 'method', question: 'DTW 库不可用，聚类主口径选哪条？', options: ['改用欧氏 K-Means'] }] } };
  project.empiricalPlans = { c: normalizeProposal({ ...proposal, steps: [{ methodId: 'trajectory-clustering', label: '替代聚类', purpose: '聚类', specification: '用欧氏 K-Means 替代 DTW', outputs: '聚类表' }] }, { projectId: 'p', conversationId: 'c', attachments: [attachment], resolveAttachment: () => source }) };
  faux.setResponses([response('我按你最新要求核查 DTW 并重拟分析方案。')]);
  await run(null, '重新跑 DTW，因为 DTW 已经安装好了');
  assert.equal(project.clarifications.c.status, 'superseded', '与新指令冲突的旧问题卡必须撤回');
  assert.equal(project.empiricalPlans.c.status, 'superseded', '旧卡衍生的欧氏替代方案必须失效');
  assert(events.some(event => event.stage === 'clarification' && event.clarification.status === 'superseded'));
  delete project.empiricalPlans;
  faux.setResponses([response([call('submit_clarification', { title: '错误的聚类口径确认', questions: [
    { id: 'method', question: 'DTW 库确认不可用，聚类主口径选哪条？', options: ['改用欧氏 K-Means，DTW 仅作附表'] },
    { id: 'comparison', question: '是否保留聚类对照？' },
    { id: 'k', question: 'K 值范围？' },
    { id: 'missing', question: '缺失值处理？' },
  ] })], { stopReason: 'toolUse' }), response('请确认聚类方法。')]);
  await run();
  assert.equal(project.clarifications.c.status, 'superseded', '缺库不能成为要求用户放弃 DTW 的确认卡');
  faux.setResponses([response([call('submit_clarification', { title: '确认研究口径', questions: [
    { id: 'sample', question: '样本范围？', options: ['全部', '部分'] },
    { id: 'period', question: '时间范围？' },
    { id: 'model', question: '模型选择？', options: ['OLS', '固定效应'] },
    { id: 'output', question: '需要哪些图表？' },
  ] })], { stopReason: 'toolUse' }), response('请一次填写问题卡。')]);
  const questionTurn = await run();
  assert(questionTurn.chat); assert.equal(project.clarifications.c.questions.length, 4); assert.equal(project.clarifications.c.status, 'pending');
  project.clarifications.c.status = 'answered';
  faux.setResponses([response([call('submit_analysis_plan', proposal)], { stopReason: 'toolUse' }), response('方案已提交，等待确认。')]);
  const clarification = await run();
  assert(clarification.chat); assert.equal(actualCalls, 0); assert.equal(drafts.length, 0);
  assert(project.empiricalPlans?.c, `analysis plan was not saved: ${JSON.stringify({ clarification: project.clarifications?.c, reply: clarification.message?.text, events: events.filter(event => event.state === 'failed').slice(-2) })}`);
  const plan = () => project.empiricalPlans.c;
  assert.equal(plan().status, 'pending-confirmation');
  assert(events.some(event => event.stage === 'empirical-plan' && event.analysisPlan.id === plan().id));
  faux.setResponses([response([call('submit_analysis_plan', proposal)], { stopReason: 'toolUse' }), response('沿用当前待确认方案。')]);
  await run(); assert.equal(plan().revision, 1, '相同方案不应在每轮对话中升级版本');
  faux.setResponses([response([call('run_data_analysis', { request: '拟合OLS', dataFile: 'data.csv' })], { stopReason: 'toolUse' }), response('分析已完成。')]);
  const analyzed = await run({ id: plan().id, revision: 1, kind: 'analysis' });
  assert(analyzed.chat); assert.equal(actualCalls, 1); assert.equal(drafts.length, 0); assert.equal(plan().status, 'results-review');
  assert.equal(plan().results[0].sampleSize, 2);
  // User feedback is routed to chat even if the planner tries to execute analyst again.
  faux.setResponses([response([call('submit_analysis_plan', { ...proposal, steps: [{ ...proposal.steps[0], outputs: '回归表与系数森林图' }] })], { stopReason: 'toolUse' }), response('修改方案已提交。')]);
  await run(); assert.equal(actualCalls, 1); assert.equal(plan().revision, 2); assert.equal(plan().history[0].results.length, 1);
  await assert.rejects(run({ id: plan().id, revision: 1, kind: 'analysis' }), /版本/);
  faux.setResponses([response([call('run_data_analysis', { request: '重新分析作图', dataFile: 'data.csv' })], { stopReason: 'toolUse' }), response('修改分析完成。')]);
  await run({ id: plan().id, revision: 2, kind: 'analysis' }); assert.equal(actualCalls, 2);
  route = 'writer';
  faux.setResponses([response([call('submit_empirical_writing_plan', { title: '影响因素分析', sections: ['数据与方法', '实证结果'], lengthRequirement: '900—1200字', task: '只写这两节，并说明小样本限制' })], { stopReason: 'toolUse' }), response('请确认标题和范围。')]);
  await run(); assert.equal(drafts.length, 0); assert.equal(plan().status, 'writing-confirmation');
  faux.setResponses([response([call('submit_empirical_writing_plan', { title: '关联因素分析', sections: ['研究方法', '回归结果与限制'], lengthRequirement: '900—1200字', task: '使用修改后的标题结构，只报告关联' })], { stopReason: 'toolUse' }), response('已按意见修改写作方案。')]);
  await run(); assert.equal(plan().writingProposal.revision, 2);
  await assert.rejects(run({ id: plan().id, revision: 2, kind: 'writing', writingRevision: 1 }), /版本/);
  faux.setResponses([response(`<h1>关联因素分析</h1><p>${'论'.repeat(950)}</p>`)]);
  const written = await run({ id: plan().id, revision: 2, kind: 'writing', writingRevision: 2 });
  assert.equal(drafts.length, 1); assert(written.content.includes('OLS回归')); assert.equal(plan().status, 'completed');
  assert.equal(actualCalls, 2, '写作不得重新自动分析');
  assert(turns.some(turn => turn.analysisPlanId === plan().id));
  console.log('real pi routing → chat proposal → approval → results → feedback revision → writing scope revision → approval → real table handoff passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
