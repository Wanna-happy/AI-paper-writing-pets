const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { continuationContext } = require('./continuation-context');
const { updatePlanDocument } = require('./plan-document');
const empirical = require('../empirical-workflow');
const context = continuationContext({ task: '好进行下一步', projectId: 'p', conversationId: 'c', runs: [
  { id: 'other', projectId: 'p', conversationId: 'other', task: '不能泄漏的其他对话' },
  { id: 'a', projectId: 'p', conversationId: 'c', task: '清洗数据再分析，最后写报告', startedAt: '2026-10-14', error: '参数校验失败' },
] });
assert(context.includes('清洗数据再分析')); assert(!context.includes('不能泄漏')); assert(context.includes('参数校验失败'));
assert.equal(continuationContext({ task: '换个问题' }), '');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-plan-edit-'));
try {
  const file = path.join(root, 'data.csv'); fs.writeFileSync(file, 'x,y\n1,2\n');
  const attachment = { id: 'f', name: 'data.csv', extension: '.csv' };
  const project = { id: 'p', empiricalPlans: {} };
  const scope = { projectId: 'p', conversationId: 'c', attachments: [attachment], resolveAttachment: () => file };
  const plan = empirical.normalizeProposal({ researchQuestion: '变量关联', dataDescription: '合成数据', dataFile: 'f', missingDataPolicy: '不删除', interpretationLimits: '不作因果推断', steps: [{ methodId: 'ols', purpose: '估计关联', specification: 'y ~ x' }] }, scope);
  assert.equal(plan.steps[0].outputs, '结果表与诊断');
  project.empiricalPlans.c = plan;
  const store = { loadWorkspace: () => ({ projects: [project] }), updateProject: (_, patch) => Object.assign(project, patch) };
  const args = { store, projectId: 'p', conversationId: 'c', reference: { id: plan.id, revision: 1 }, resolveAttachment: () => file };
  const updated = updatePlanDocument({ ...args, patch: { researchQuestion: '修改后的研究问题', steps: [{ specification: 'y ~ x，HC3' }] } });
  assert.equal(updated.plan.revision, 2); assert.equal(updated.plan.status, 'pending-confirmation'); assert.equal(updated.changes.length, 2);
  assert.equal(updated.plan.history[0].researchQuestion, plan.researchQuestion);
  assert.throws(() => updatePlanDocument({ ...args, patch: { researchQuestion: '旧版本编辑' } }), /版本/);
  const latest = { ...args, reference: { id: plan.id, revision: 2 } };
  assert.throws(() => updatePlanDocument({ ...latest, conversationId: 'other', patch: {} }), /版本/);
  assert.throws(() => updatePlanDocument({ ...latest, patch: { steps: [] } }), /增删步骤/);
  assert.throws(() => updatePlanDocument({ ...latest, patch: { researchQuestion: '' } }), /不能为空/);
  assert.equal(project.empiricalPlans.c.revision, 2, '失败编辑不能改变现有方案');
  const noChange = updatePlanDocument({ ...latest, patch: { researchQuestion: '修改后的研究问题' } });
  assert.equal(noChange.plan.revision, 2);
  fs.writeFileSync(file, 'x,y\n9,10\n');
  assert.throws(() => updatePlanDocument({ ...latest, patch: { researchQuestion: '修改' } }), /数据文件已变化/);
  console.log('Continuation scope, optional outputs, real plan edit/new revision/history, stale/cross-chat/changed-source rejection passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
