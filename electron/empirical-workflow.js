const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const CATALOG_PATH = path.join(__dirname, '../assets/skills/empirical-analysis-plan/methods.json');
function methodCatalog() { return JSON.parse(fs.readFileSync(CATALOG_PATH, 'utf8')).methods; }
function short(value, max = 2000) { return String(value || '').trim().slice(0, max); }
function fingerprint(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function currentPlan(project, conversationId) { return project?.empiricalPlans?.[conversationId] || null; }

function normalizeProposal(input, { projectId, conversationId, attachments, resolveAttachment, previous }) {
  if (!conversationId) throw new Error('实证方案必须属于一个明确的项目对话。');
  const methods = new Map(methodCatalog().map(method => [method.id, method]));
  const selected = attachments.filter(file => file.name === input.dataFile && ['.csv', '.xlsx'].includes(String(file.extension).toLowerCase()));
  if (selected.length !== 1) throw new Error('请先选择唯一的 CSV/XLSX 数据文件；多个文件须先说明合并规则。');
  const source = resolveAttachment(selected[0]);
  if (!source || !fs.existsSync(source)) throw new Error('方案中的数据文件已不可用，请重新上传。');
  if (!Array.isArray(input.steps) || !input.steps.length || input.steps.length > 18) throw new Error('分析方案需要 1—18 个具体步骤。');
  if (!short(input.researchQuestion) || !short(input.dataDescription)) throw new Error('请先明确研究问题和数据单位、变量含义。');
  const ids = new Set();
  const steps = input.steps.map((raw, index) => {
    const id = `a${index + 1}`;
    const method = methods.get(raw.methodId);
    if (!method || method.status !== 'available') throw new Error(`方法 ${raw.methodId} 尚无已接入的执行路径，请说明限制并调整方案，不能暗中换方法。`);
    if (!short(raw.purpose) || !short(raw.specification)) throw new Error('每个步骤都需要目的和具体变量/模型/检验设定。');
    ids.add(id);
    return { id, methodId: method.id, skillId: method.skillId, label: short(raw.label, 120) || method.name,
      purpose: short(raw.purpose), specification: short(raw.specification, 4000),
      outputs: short(raw.outputs), required: raw.required !== false, status: 'pending' };
  });
  return { version: 1, id: previous?.id || randomUUID(), revision: (previous?.revision || 0) + 1,
    projectId, conversationId, status: 'pending-confirmation', createdAt: new Date().toISOString(),
    researchQuestion: short(input.researchQuestion), dataDescription: short(input.dataDescription),
    paperType: short(input.paperType, 150), lengthRequirement: short(input.lengthRequirement, 200),
    objective: ['association', 'causal', 'prediction', 'measurement'].includes(input.objective) ? input.objective : 'association',
    writingTask: short(input.writingTask, 2000), originalTask: short(input.originalTask, 4000),
    missingDataPolicy: short(input.missingDataPolicy), interpretationLimits: short(input.interpretationLimits),
    attachment: { id: selected[0].id, name: selected[0].name, extension: selected[0].extension, size: selected[0].size },
    dataFingerprint: fingerprint(source), steps,
    history: previous ? [...(previous.history || []), { revision: previous.revision, status: previous.status, steps: previous.steps, results: previous.results || [], writingProposal: previous.writingProposal || null }].slice(-10) : [] };
}

function savePlan(store, projectId, conversationId, plan) {
  const project = store.loadWorkspace().projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  if (plan.projectId !== projectId || plan.conversationId !== conversationId) throw new Error('不能跨项目或对话保存实证方案');
  store.updateProject(projectId, { empiricalPlans: { ...(project.empiricalPlans || {}), [conversationId]: plan } });
  return plan;
}

function approvePlan(plan, approval, { projectId, conversationId, resolveAttachment }) {
  if (!plan || plan.projectId !== projectId || plan.conversationId !== conversationId) throw new Error('没有当前对话的实证方案');
  if (plan.id !== approval?.id || plan.revision !== approval?.revision || plan.status !== 'pending-confirmation') throw new Error('方案已更新或已执行，请确认当前版本。');
  const source = resolveAttachment(plan.attachment);
  if (!source || fingerprint(source) !== plan.dataFingerprint) throw new Error('数据已变化，请重新制定并确认分析方案。');
  return { ...plan, status: 'approved', approvedAt: new Date().toISOString(), steps: plan.steps.map(step => ({ ...step, status: 'pending' })) };
}

function executionPlan(plan) {
  if (!plan || !['approved', 'writing-approved'].includes(plan.status)) throw new Error('只有用户确认的方案才能执行');
  if (plan.status === 'writing-approved') return { tasks: [{ id: 'empirical-write', role: 'writer', task: `${plan.writingProposal.title}\n${plan.writingProposal.task}\n章节：${plan.writingProposal.sections.join('；')}\n篇幅：${plan.writingProposal.lengthRequirement}`,
    skills: ['academic-writing-core', 'empirical-writing', 'empirical-result-handoff'], dependsOn: [] }], empiricalPlanId: plan.id, empiricalRevision: plan.revision };
  const tasks = plan.steps.map((step, index) => ({ id: step.id, role: 'analyst', task: `${step.label}：${step.specification}`,
    skills: [step.skillId, 'empirical-result-handoff'], empiricalStepId: step.id, dependsOn: index ? [plan.steps[index - 1].id] : [] }));
  return { tasks, empiricalPlanId: plan.id, empiricalRevision: plan.revision };
}

function proposeWriting(plan, proposal) {
  if (!plan || !['results-review', 'writing-confirmation', 'completed'].includes(plan.status) || !(plan.results || []).some(result => result.status === 'completed')) throw new Error('请先完成分析并审阅结果，再确认写作方案。');
  if (!short(proposal.title) || !short(proposal.task) || !Array.isArray(proposal.sections) || !proposal.sections.length || proposal.sections.length > 12 || !short(proposal.lengthRequirement)) throw new Error('写作方案需明确标题、章节范围、篇幅与具体写作要求。');
  if (plan.steps.some(step => step.required && !(plan.results || []).some(result => result.stepId === step.id && result.status === 'completed'))) throw new Error('必要分析步骤尚未完成，请先调整并确认分析方案，不能将缺失结果交给写作 Agent。');
  if (proposal.sections.some(value => !short(value))) throw new Error('写作章节标题不能为空');
  const available = new Set(plan.results.filter(result => result.status === 'completed').map(result => result.stepId));
  const resultStepIds = [...new Set(proposal.resultStepIds || [...available])];
  if (!resultStepIds.length || resultStepIds.some(id => !available.has(id))) throw new Error('写作范围必须选择实际完成的分析步骤');
  return { ...plan, status: 'writing-confirmation', writingProposal: { revision: (plan.writingProposal?.revision || 0) + 1,
    title: short(proposal.title, 250), task: short(proposal.task, 4000), sections: proposal.sections.map(value => short(value, 250)), lengthRequirement: short(proposal.lengthRequirement, 200), resultStepIds } };
}

function approveWriting(plan, approval, scope) {
  if (!plan || plan.projectId !== scope.projectId || plan.conversationId !== scope.conversationId || plan.id !== approval?.id || plan.revision !== approval?.revision || plan.status !== 'writing-confirmation' || plan.writingProposal?.revision !== approval?.writingRevision) throw new Error('写作方案版本已更新，请确认当前标题与范围。');
  const source = scope.resolveAttachment(plan.attachment);
  if (!source || fingerprint(source) !== plan.dataFingerprint) throw new Error('数据已变化，不能按旧分析结果写作。');
  return { ...plan, status: 'writing-approved', writingApprovedAt: new Date().toISOString() };
}

function planningContext(plan) {
  const catalog = methodCatalog().map(method => `${method.id}：${method.name}；${method.status}；Skill=${method.skillId}`).join('\n');
  const context = plan && { ...plan, history: (plan.history || []).map(item => ({ revision: item.revision, status: item.status })),
    results: (plan.results || []).map(result => ({ stepId: result.stepId, methodId: result.methodId, status: result.status, sampleSize: result.sampleSize, summary: result.summary, tableTitles: (result.tables || []).map(table => table.title), chartNames: (result.files || []).map(file => path.basename(file)), limitations: result.limitations, reason: result.reason })) };
  return `# 实证方法索引（available 表示有执行指导与依赖，不表示任意数据均适用）\n${catalog}\n\n# 当前对话的实证方案\n${context ? JSON.stringify(context) : '尚未制定。任何实际分析须先由对话 Agent 提交具体方案，再由用户点击确认。'}`;
}

function validateStep(plan, stepId, dataFile, resolveAttachment) {
  if (!plan || plan.status !== 'approved') throw new Error('实证分析方案尚未确认，不能执行计量分析。');
  const step = plan.steps.find(item => item.id === stepId);
  if (!step || (dataFile && dataFile !== plan.attachment.name)) throw new Error('分析步骤或数据文件超出已确认方案');
  const source = resolveAttachment(plan.attachment);
  if (!source || fingerprint(source) !== plan.dataFingerprint) throw new Error('已确认的数据发生变化，需要重新确认方案。');
  return step;
}

function parseResult(stdout, { plan, step, sourceFingerprint }) {
  const line = String(stdout).split(/\r?\n/).filter(value => value.startsWith('PAPER_PET_RESULT=')).at(-1);
  if (!line) throw new Error('分析缺少结构化结果，不能作为完成的实证结果交给写作 Agent。');
  if (line.length > 2000000) throw new Error('分析结果过大，请汇总为论文所需的统计表');
  const result = JSON.parse(line.slice('PAPER_PET_RESULT='.length));
  if (result.schemaVersion !== 1 || result.stepId !== step.id || result.methodId !== step.methodId) throw new Error('分析结果的步骤或方法与已确认方案不一致');
  if (!['completed', 'not-applicable'].includes(result.status) || !short(result.summary)) throw new Error('分析结果状态无效');
  if (!Number.isInteger(result.sampleSize) || result.sampleSize < 0) throw new Error('分析缺少真实样本量');
  if (!Array.isArray(result.tables) || result.tables.length > 20 || !Array.isArray(result.diagnostics)) throw new Error('结果必须包含表格列表及诊断列表');
  for (const table of result.tables) {
    if (!short(table.title) || !Array.isArray(table.columns) || !table.columns.length || table.columns.length > 80 || !Array.isArray(table.rows) || table.rows.length > 1000) throw new Error('结果表格结构无效或过大');
    if (table.columns.some(column => typeof column !== 'string' || !column.trim() || column.length > 250)) throw new Error('结果表格列标题无效');
    for (const row of table.rows) if (!Array.isArray(row) || row.length !== table.columns.length || row.some(cell => cell !== null && (!['string', 'number', 'boolean'].includes(typeof cell) || (typeof cell === 'number' && !Number.isFinite(cell))))) throw new Error('结果表格的行列不一致或数值无效');
  }
  if (result.status === 'completed' && !result.tables.length) throw new Error('已完成的分析必须提供可追溯结果表，不能只给结论');
  if (result.status === 'not-applicable' && !short(result.reason)) throw new Error('不适用结果必须说明原因');
  return { schemaVersion: 1, planId: plan.id, revision: plan.revision, projectId: plan.projectId, conversationId: plan.conversationId,
    stepId: step.id, methodId: step.methodId, status: result.status, summary: short(result.summary, 10000),
    sampleSize: result.sampleSize, tables: result.tables, diagnostics: result.diagnostics.slice(0, 80),
    limitations: Array.isArray(result.limitations) ? result.limitations.map(value => short(value)).slice(0, 30) : [],
    reason: short(result.reason), dataFingerprint: sourceFingerprint, createdAt: new Date().toISOString() };
}

module.exports = { methodCatalog, currentPlan, normalizeProposal, savePlan, approvePlan, executionPlan, planningContext, validateStep, parseResult, fingerprint, proposeWriting, approveWriting };
