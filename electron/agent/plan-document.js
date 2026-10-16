const empirical = require('../empirical-workflow');
function updatePlanDocument({ store, projectId, conversationId, reference, patch, resolveAttachment }) {
  const project = store.loadWorkspace().projects.find(item => item.id === projectId);
  const current = empirical.currentPlan(project, conversationId);
  if (!project || !current || current.projectId !== projectId || current.conversationId !== conversationId || current.id !== reference?.id || current.revision !== reference.revision) throw new Error('方案版本已变化，请刷新后编辑');
  if (!['pending-confirmation', 'results-review', 'completed', 'writing-confirmation'].includes(current.status)) throw new Error('当前方案正在执行或已撤回，不能编辑');
  const file = resolveAttachment(current.attachment);
  if (!file || empirical.fingerprint(file) !== current.dataFingerprint) throw new Error('数据文件已变化，请先重新核验数据');
  if (!patch || JSON.stringify(patch).length > 100000) throw new Error('方案修改内容无效或过长');
  const writing = current.status === 'writing-confirmation';
  const changes = [];
  const text = (value, name, max = 4000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}不能为空或过长`); return value.trim(); };
  const compare = (name, before, after) => { if (JSON.stringify(before) !== JSON.stringify(after)) changes.push({ name, before, after }); };
  let updated;
  if (writing) {
    if (reference.writingRevision !== current.writingProposal.revision) throw new Error('写作方案版本已变化');
    const proposal = { ...current.writingProposal };
    for (const key of ['title', 'task', 'lengthRequirement']) if (patch[key] !== undefined) { const value = text(patch[key], key); compare(key, proposal[key], value); proposal[key] = value; }
    if (patch.sections !== undefined) { if (!Array.isArray(patch.sections)) throw new Error('章节结构无效'); proposal.sections = patch.sections.map(value => text(value, '章节')); compare('章节结构', current.writingProposal.sections, proposal.sections); }
    updated = changes.length ? empirical.proposeWriting(current, proposal) : current;
  } else {
    const input = { ...current, dataFile: current.attachment.id };
    const names = { researchQuestion: '研究问题', dataDescription: '数据说明', missingDataPolicy: '缺失处理', interpretationLimits: '解释边界' };
    for (const [key, name] of Object.entries(names)) if (patch[key] !== undefined) { input[key] = text(patch[key], name); compare(name, current[key], input[key]); }
    if (patch.steps !== undefined) {
      if (!Array.isArray(patch.steps) || patch.steps.length !== current.steps.length) throw new Error('增删步骤请通过对话修改方案');
      input.steps = current.steps.map((step, i) => { const next = { ...step }; for (const key of ['label', 'purpose', 'specification', 'outputs']) if (patch.steps[i]?.[key] !== undefined) { next[key] = text(patch.steps[i][key], `步骤${i + 1}`); compare(`第${i + 1}步·${({ label: '标题', purpose: '目的', specification: '设定', outputs: '产出' })[key]}`, step[key], next[key]); } return next; });
    }
    input.steps = input.steps.map(step => ({ ...step, methodId: step.requestedMethodId || step.methodId }));
    updated = changes.length ? empirical.normalizeProposal(input, { projectId, conversationId, attachments: [current.attachment], resolveAttachment, previous: current }) : current;
    if (changes.length) { updated.history = [...(current.history || []), { ...current, history: undefined }].slice(-10); if (current.dataProfile) updated.dataProfile = current.dataProfile; }
  }
  if (changes.length) { updated.documentChanges = changes; empirical.savePlan(store, projectId, conversationId, updated); }
  return { plan: updated, changes };
}
module.exports = { updatePlanDocument };
