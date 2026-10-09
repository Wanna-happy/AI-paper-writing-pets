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
const { fingerprint } = require('../empirical-workflow');
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
      planner: { planTasks: async () => ({ tasks: [{ id: 'routed', role: route, task: '测试', skills: route === 'chat' ? ['empirical-analysis-plan'] : [], dependsOn: [] }] }) },
      runEngine: { runPlan: args => runPlan({ ...args, context: { ...args.context, runDataAnalysis: async parameters => {
        actualCalls++; assert.equal(parameters.analysisPlan.status, 'approved'); assert(parameters.skillPrompt.includes('OLS'));
        const structured = { planId: parameters.analysisPlan.id, revision: parameters.analysisPlan.revision, stepId: parameters.stepId, methodId: 'ols', status: 'completed', sampleSize: 2, summary: 'OLS系数为2，样本量2', tables: [{ title: 'OLS回归', columns: ['变量', '系数'], rows: [['x', 2]] }], files: [], dataFingerprint: fingerprint(source) };
        return { summary: structured.summary, structured, tables: structured.tables, files: [], error: null };
      } } }) } }),
    toolRegistry: { resolveAttachment: () => source }, ragStore: { retrieve: async () => ({ hits: [] }) }, providerRegistry: {},
    skillRuntime: new SkillRuntime(path.resolve('assets/skills')),
    buildConversationFileContext: () => '', postProcessContent: postProcessAgentContent, emitStatus: (_, event) => events.push(event),
    emitStream: () => {}, react: () => {}, playCompletion: () => {},
  });
  let number = 0;
  const run = empiricalApproval => engine.run({ projectId: 'p', request: { requestId: `f${++number}`, conversationId: 'c', task: '测试实证流程', attachments: [attachment], ...(empiricalApproval ? { empiricalApproval } : {}) } });
  const proposal = { researchQuestion: 'x与y关联', objective: 'association', dataFile: 'data.csv', dataDescription: '连续变量横截面，仅合成数据', missingDataPolicy: '完整案例', interpretationLimits: '不推断因果', steps: [{ methodId: 'ols', label: 'OLS主回归', purpose: '估计关联', specification: 'y ~ x，HC3', outputs: '回归表' }] };
  faux.setResponses([response([call('submit_analysis_plan', proposal)], { stopReason: 'toolUse' }), response('方案已提交，等待确认。')]);
  const clarification = await run();
  assert(clarification.chat); assert.equal(actualCalls, 0); assert.equal(drafts.length, 0);
  const plan = () => project.empiricalPlans.c;
  assert.equal(plan().status, 'pending-confirmation');
  assert(events.some(event => event.stage === 'empirical-plan' && event.analysisPlan.id === plan().id));
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
