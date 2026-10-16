import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createModels, fauxProvider, fauxAssistantMessage as response, fauxToolCall as call } from '@earendil-works/pi-ai';
import { buildRegistry } from './registry.mjs';
import { planTasks } from './planner.mjs';
import { runPlan } from './run-engine.mjs';
import policy from '../agent/pipeline-policy.js';
import empirical from '../empirical-workflow.js';
const faux = fauxProvider({ tokensPerSecond: 100000 });
const models = createModels(); models.setProvider(faux.provider);
const layer = { models, getModel: () => faux.getModel() }, registry = buildRegistry();
const task = (role, id = role) => ({ id, role, task: '当前需要完成的工作', skills: [], dependsOn: [], output: '真实产物', acceptance: '有依据的结果' });
for (const [role, contract] of [['chat', { goal: '解释一个概念' }], ['writer', { goal: '润色一段', needsWriting: true }]]) {
  // Invalid expansion is retried, not silently executed or turned into a paper workflow.
  faux.setResponses([response(JSON.stringify({ version: 2, tasks: [task('analyst')] })), response(JSON.stringify({ version: 2, tasks: [task(role)] }))]);
  const plan = await planTasks({ layer, registry, userPrompt: contract.goal, intent: { taskContract: contract } });
  assert.equal(plan.tasks.length, 1); assert.equal(plan.tasks[0].role, role);
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-adaptive-'));
faux.setResponses([response(JSON.stringify({ version: 2, tasks: [{ ...task('chat'), branch: 'inspection' }] }))]);
const inspection = await planTasks({ layer, registry, userPrompt: '只检查字段', intent: { branch: 'mixed', taskContract: { goal: '只读检查数据' } } });
let inspections = 0;
faux.setResponses([response([call('inspect_data_file', { dataFile: 'f' })], { stopReason: 'toolUse' }), response('数据包含x字段。')]);
const inspected = await runPlan({ layer, registry, plan: { ...inspection, intent: { branch: 'mixed' } }, context: { planningTools: { inspectData: async () => { inspections++; return { rows: 2, columns: [{ name: 'x' }] }; } } } });
assert.equal(inspections, 1); assert(inspected.finalText.includes('x'));
try {
  const file = path.join(root, 'source.csv'); fs.writeFileSync(file, 'x\n1\n2\n');
  const fingerprint = empirical.fingerprint(file);
  const result = { planId: 'p1', revision: 2, projectId: 'p', conversationId: 'c', dataFingerprint: fingerprint, stepId: 'a1', methodId: 'descriptive', status: 'completed', sampleSize: 2, summary: '已完成的统计', tables: [{ title: '样本', columns: ['n'], rows: [[2]] }], diagnostics: [] };
  const approved = { id: 'p1', revision: 2, projectId: 'p', conversationId: 'c', dataFingerprint: fingerprint, status: 'results-review', approvedAt: '2026-10-14T00:00:00Z', attachment: { id: 'f', name: 'source.csv' }, results: [result], steps: [{ id: 'a1', methodId: 'descriptive', required: true }, { id: 'a2', methodId: 'correlation', required: true }] };
  const scope = { projectId: 'p', conversationId: 'c', resolveAttachment: () => file };
  const progress = policy.reusableState(approved, scope);
  assert(progress.reusableAnalysis); assert.equal(progress.completedResults.length, 1); assert.equal(progress.results.length, 0, '不完整结果不能直接写完整报告');
  assert.equal(policy.reusableState(approved, { ...scope, conversationId: 'other' }).reusableAnalysis, null);
  faux.setResponses([response(JSON.stringify({ version: 2, tasks: [task('analyst')] }))]);
  const plan = await planTasks({ layer, registry, userPrompt: '继续执行未完成步骤', intent: { taskContract: { goal: '继续未完成分析', needsAnalysis: true, analysisAction: 'continue' } }, existingProgress: progress });
  assert(plan.reusableAnalysis); assert.deepEqual(plan.tasks.map(t => t.role), ['analyst']);
  let calls = 0, ensureCalls = 0;
  faux.setResponses([response([call('run_data_analysis', { request: '继续相关分析', dataFile: 'source.csv' })], { stopReason: 'toolUse' }), response('未完成步骤已执行。')]);
  const output = await runPlan({ layer, registry, plan, context: { analysisPlan: { ...approved, status: 'approved' }, enforceEmpiricalApproval: true, attachments: [approved.attachment], reusableAnalysisResults: progress.completedResults,
    ensureAnalysisApproval: async () => { ensureCalls++; },
    runDataAnalysis: async args => { calls++; assert.equal(args.stepId, 'a2', '已完成的a1不能重跑'); return { structured: { ...result, stepId: 'a2', methodId: 'correlation' }, files: [] }; },
  } });
  assert.equal(calls, 1); assert.equal(ensureCalls, 1); assert.equal(output.outputs.analyst.analysisResults.length, 2);
  const retryContext = { analysisPlan: { ...approved, status: 'approved' }, enforceEmpiricalApproval: true, attachments: [approved.attachment], reusableAnalysisResults: progress.completedResults, ensureAnalysisApproval: async () => {},
    runDataAnalysis: async () => ({ error: '合成失败', files: [] }) };
  faux.setResponses([response([call('run_data_analysis', { request: '剩余步骤', dataFile: 'source.csv' })], { stopReason: 'toolUse' }), response('该步骤失败，未完成。')]);
  const failed = await runPlan({ layer, registry, plan, context: retryContext });
  assert.equal(failed.blocked, true); assert(!failed.completedIds.includes('analyst'), '失败步骤不得写入完成列表');
  let retries = 0;
  retryContext.runDataAnalysis = async args => { retries++; assert.equal(args.stepId, 'a2'); return { structured: { ...result, stepId: 'a2', methodId: 'correlation' }, files: [] }; };
  faux.setResponses([response([call('run_data_analysis', { request: '重试剩余步骤', dataFile: 'source.csv' })], { stopReason: 'toolUse' }), response('重试成功。')]);
  const retried = await runPlan({ layer, registry, plan, context: retryContext, resumeOutputs: failed.outputs });
  assert.equal(retries, 1); assert.equal(retried.blocked, false); assert.equal(retried.outputs.analyst.analysisResults.length, 2);
  fs.writeFileSync(file, 'x\n99\n');
  assert.equal(policy.reusableState(approved, scope).reusableAnalysis, null, '数据变化必须使旧确认失效');
  assert.equal(policy.reusableState(approved, scope).completedResults.length, 0);
  faux.setResponses([response(JSON.stringify({ version: 2, reusableAnalysis: progress.reusableAnalysis, tasks: [task('analyst')] })), response(JSON.stringify({ version: 2, reusableAnalysis: progress.reusableAnalysis, tasks: [task('analyst')] }))]);
  await assert.rejects(planTasks({ layer, registry, userPrompt: '分析', intent: { taskContract: { goal: '分析', needsAnalysis: true, analysisAction: 'continue' } } }), /未通过/);
  console.log('Adaptive plans: question/edit only; invalid expansion retried; approved partial progress reused; only unfinished step runs; changed source/cross-chat/model-forged approval rejected');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
