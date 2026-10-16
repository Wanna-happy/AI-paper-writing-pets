const ROLES = { chat: 'conversation', collector: 'collection', preparer: 'preparation', coordinator: 'analysis-proposal', analyst: 'analysis-execution', writer: 'writing' };
function contract(raw = {}, goal = '') {
  const list = (value, max = 16) => (Array.isArray(value) ? value : []).map(item => String(item).trim().slice(0, 1200)).filter(Boolean).slice(0, max);
  return { version: 2, goal: String(raw.goal || goal).slice(0, 2000), deliverables: list(raw.deliverables), constraints: list(raw.constraints),
    confirmed: list(raw.confirmed), missing: list(raw.missing), completionCriteria: list(raw.completionCriteria),
    needsCollection: raw.needsCollection === true, needsPreparation: raw.needsPreparation === true, needsAnalysis: raw.needsAnalysis === true,
    requestsReport: raw.requestsReport === true, needsWriting: raw.needsWriting === true || raw.requestsReport === true,
    usesExistingResults: raw.usesExistingResults === true,
    analysisAction: ['continue', 'revise', 'new'].includes(raw.analysisAction) ? raw.analysisAction : 'new',
    collectionKind: raw.collectionKind === 'sources' ? 'sources' : 'data', reportScope: String(raw.reportScope || '').slice(0, 1500) };
}
function validatePipeline(plan, roles) {
  if (!plan.contract?.goal) throw new Error('任务契约缺少目标');
  for (const task of plan.tasks) {
    if (!ROLES[task.role] || !roles[task.role]) throw new Error('子 Agent 角色未接入');
    if (!task.output || !task.acceptance) throw new Error('每个步骤须定义产物及完成条件');
    if (task.role === 'writer' && plan.tasks.some(item => item.role === 'analyst') && !plan.contract.requestsReport && !plan.contract.needsWriting) throw new Error('本轮未授权分析报告，不能自动增加写作');
    const upstream = new Set();
    const visit = id => { if (upstream.has(id)) return; upstream.add(id); for (const dep of plan.tasks.find(item => item.id === id)?.dependsOn || []) visit(dep); };
    for (const dep of task.dependsOn || []) visit(dep);
    const has = role => [...upstream].some(id => plan.tasks.find(item => item.id === id)?.role === role);
    if (task.role === 'preparer' && plan.contract.needsCollection && plan.contract.collectionKind !== 'sources' && !has('collector')) throw new Error('清洗须依赖采集产物');
    if (task.role === 'coordinator' && plan.contract.needsPreparation && !has('preparer')) throw new Error('方案须依据清洗产物');
    if (task.role === 'analyst' && !has('coordinator') && !plan.reusableAnalysis) throw new Error('分析任务须依赖具体方案确认步骤或有效的已确认方案');
    if (task.role === 'analyst' && !plan.contract.needsAnalysis) throw new Error('本轮不需要重新分析，不能增加分析步骤');
    if (task.role === 'preparer' && !plan.contract.needsPreparation) throw new Error('本轮不需要重新清洗，不能增加清洗步骤');
    if (task.role === 'collector' && !plan.contract.needsCollection) throw new Error('本轮不需要采集，不能增加采集步骤');
    if (task.role === 'writer' && plan.contract.needsAnalysis && plan.contract.requestsReport && !has('analyst')) throw new Error('分析报告须依赖真实分析产物');
  }
  if (plan.contract.needsCollection && !plan.tasks.some(item => item.role === 'collector')) throw new Error('计划漏掉数据采集');
  if (plan.contract.needsPreparation && !plan.tasks.some(item => item.role === 'preparer')) throw new Error('计划漏掉实际数据处理');
  if (plan.contract.needsAnalysis && !plan.tasks.some(item => item.role === 'analyst')) throw new Error('计划漏掉实际分析');
  if (plan.contract.requestsReport && !plan.tasks.some(item => item.role === 'writer')) throw new Error('计划漏掉已请求的报告');
  if (plan.contract.needsWriting && !plan.tasks.some(item => item.role === 'writer')) throw new Error('计划漏掉本轮写作或修改任务');
  for (const role of ['coordinator', 'analyst']) if (plan.tasks.filter(item => item.role === role).length > 1) throw new Error('同一方案须合并为一个分析入口，具体方法由方案步骤展开');
}
// Reuse is granted by the host, never by a model-supplied approval flag.
function reusableState(plan, { projectId, conversationId, resolveAttachment, attachments = [] }) {
  const empty = { reusableAnalysis: null, results: [], completedResults: [] };
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length || plan.projectId !== projectId || plan.conversationId !== conversationId) return empty;
  if (attachments.some(file => file.id !== plan.attachment?.id && String(file.name).toLowerCase() === String(plan.attachment?.name).toLowerCase())) return empty;
  const empirical = require('../empirical-workflow');
  try { const file = resolveAttachment(plan.attachment); if (!file || empirical.fingerprint(file) !== plan.dataFingerprint) return empty; } catch { return empty; }
  const results = (Array.isArray(plan.results) ? plan.results : []).filter(result => result && result.status === 'completed' && result.planId === plan.id && result.revision === plan.revision && result.projectId === projectId && result.conversationId === conversationId && result.dataFingerprint === plan.dataFingerprint && plan.steps.some(step => step.id === result.stepId && step.methodId === result.methodId));
  const complete = plan.steps.every(step => !step.required || results.some(result => result.stepId === step.id));
  return { reusableAnalysis: plan.status === 'approved' || (plan.status === 'results-review' && plan.approvedAt && !complete) ? { id: plan.id, revision: plan.revision, dataFingerprint: plan.dataFingerprint } : null, completedResults: results,
    results: complete && ['results-review', 'writing-confirmation', 'writing-approved', 'completed'].includes(plan.status) ? results : [] };
}
module.exports = { ROLES, contract, validatePipeline, reusableState };
