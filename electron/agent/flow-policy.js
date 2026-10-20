const pipelinePolicy = require('./pipeline-policy');
// Branches are selected before task planning; role prompts cannot expand these capabilities.
const BRANCHES = ['conversation', 'research', 'inspection', 'environment', 'analysis', 'writing', 'mixed'];
const MAX_TASKS = 18;
function normalizeIntent(raw) {
  if (!raw || !BRANCHES.includes(raw.branch) || typeof raw.needsClarification !== 'boolean') return null;
  const questions = (Array.isArray(raw.questions) ? raw.questions : []).filter(q => q && typeof q.question === 'string' && q.question.trim()).slice(0, 2)
    .map((q, i) => ({ id: `intent-q${i + 1}`, decisionKey: String(q.decisionKey || '').slice(0, 120), question: q.question.trim().slice(0, 500),
      options: [...new Set((Array.isArray(q.options) ? q.options : []).filter(x => typeof x === 'string').map(x => x.trim().slice(0, 180)).filter(Boolean))].slice(0, 6), required: true }));
  if (raw.needsClarification && !questions.length) return null;
  const taskContract = raw.taskContract ? pipelinePolicy.contract(raw.taskContract, raw.goal) : null;
  return { branch: raw.branch, needsClarification: raw.needsClarification, questions: raw.needsClarification ? questions : [],
    goal: String(raw.goal || '').slice(0, 1500), needsDataPreparation: taskContract ? taskContract.needsPreparation : raw.needsDataPreparation === true, usesAnalysisResults: raw.usesAnalysisResults === true || taskContract?.usesExistingResults === true,
    ...(taskContract ? { taskContract } : {}),
    clarificationResolution: ['answered', 'superseded', 'pending'].includes(raw.clarificationResolution) ? raw.clarificationResolution : 'pending' };
}
function clarificationIntent() {
  return { branch: 'conversation', needsClarification: true, questions: [{ id: 'intent-q1', question: '请说明本轮希望交付什么：回答问题、检查数据、执行分析，还是撰写或修改正文？', options: [], required: true }],
    goal: '', usesAnalysisResults: false, clarificationResolution: 'pending', fallback: true };
}
function routePlan({ intent, plan, task, empiricalPlan, planningSkill }) {
  if (plan?.version === 2) {
    if (intent?.needsClarification) throw new Error('必要目标信息尚未明确');
    return { ...plan, branch: 'pipeline', contract: intent?.taskContract || plan.contract || pipelinePolicy.contract({ goal: task }), intent };
  }
  if (!intent) return plan; // Injected older harnesses remain supported; production always supplies intent.
  const chat = (branch, skills = [], description = task) => ({ ...plan, branch, intent,
    tasks: [{ id: `flow-${branch}`, role: 'chat', task: description, skills, dependsOn: [] }] });
  if (intent.needsClarification) return chat('clarification', [], `仅请用户回答本轮必要问题，等待答案，不规划或执行后续工作。原要求：${task}`);
  if (['conversation', 'research', 'inspection', 'environment'].includes(intent.branch)) return chat(intent.branch);
  if (intent.branch === 'analysis' || intent.branch === 'mixed') return chat('analysis-proposal', [planningSkill],
    `本轮目标：${task}。读取已确认要求；用户要求清洗后分析时先调用 prepare_data_file 实际生成清洗副本，再用真实数据制定方案并调用 submit_analysis_plan。必要问题用卡片直接交互。本轮内等待用户确认后由编排器执行分析，不以“下一步再提交”结束，也不写正文。`);
  if (intent.branch === 'writing' && intent.usesAnalysisResults && empiricalPlan) return chat('writing-proposal', [planningSkill],
    `本轮目标：${task}。依据已完成结果提交写作标题、章节、篇幅与采用的结果范围；等待用户确认，不执行分析或输出正文。结果尚未完成时说明状态。`);
  if (intent.branch === 'writing' && intent.usesAnalysisResults) return chat('conversation', [],
    `本轮目标：${task}。当前没有可用的已确认分析方案或结果，请解释缺口，不生成实证正文或自行运行分析。`);
  // An LLM planner cannot add a calculation or turn a writing request into a tool-only role.
  if (!plan?.tasks?.some(t => t.role === 'writer') || plan.tasks.some(t => !['chat', 'writer'].includes(t.role))) return chat('conversation', [],
    `任务规划未得到有效的写作任务，请说明尚缺信息并承接原要求：${task}。不要自行执行分析。`);
  return { ...plan, branch: 'writing', intent, tasks: plan.tasks.map(t => ({ ...t, branch: t.role === 'chat' ? 'research' : 'writing' })) };
}
const COMMON_TOOLS = ['read_conversation_history', 'read_analysis_result', 'search_research_skills', 'read_research_skill', 'get_research_capabilities'];
const BRANCH_TOOLS = {
  collection: [...COMMON_TOOLS, 'search_web', 'lookup_scholarly_metadata', 'collect_data', 'retrieve_context', 'submit_clarification'],
  preparation: [...COMMON_TOOLS, 'inspect_data_file', 'prepare_data_file', 'submit_clarification'],
  conversation: [...COMMON_TOOLS, 'submit_thesis_outline'],
  research: [...COMMON_TOOLS, 'submit_thesis_outline', 'lookup_scholarly_metadata', 'retrieve_context', 'submit_clarification'],
  clarification: [...COMMON_TOOLS, 'submit_thesis_outline', 'submit_clarification'],
  inspection: [...COMMON_TOOLS, 'inspect_data_file', 'submit_clarification'],
  environment: [...COMMON_TOOLS, 'install_python_dependency'],
  'analysis-proposal': [...COMMON_TOOLS, 'inspect_data_file', 'prepare_data_file', 'install_python_dependency', 'submit_clarification', 'submit_analysis_plan'],
  'writing-proposal': [...COMMON_TOOLS, 'submit_clarification', 'submit_empirical_writing_plan'],
  'analysis-execution': [...COMMON_TOOLS, 'install_python_dependency', 'run_data_analysis'],
  writing: [...COMMON_TOOLS, 'retrieve_context', 'read_analysis_result'],
  'writing-execution': [...COMMON_TOOLS, 'retrieve_context', 'read_analysis_result'],
};
function restrictTools(tools, branch) {
  if (!branch) return tools; // Legacy checkpoints are validated by the existing approval gates.
  const allowed = new Set(BRANCH_TOOLS[branch] || COMMON_TOOLS);
  return tools.filter(tool => allowed.has(tool.name));
}
function validatePlan(plan, roles) {
  if (!Array.isArray(plan?.tasks) || !plan.tasks.length || plan.tasks.length > MAX_TASKS) throw new Error('任务计划为空或过大');
  const ids = new Set(plan.tasks.map(t => t.id));
  if (ids.size !== plan.tasks.length || plan.tasks.some(t => typeof t.id !== 'string' || !t.id.trim())) throw new Error('任务标识缺失或重复');
  if (plan.branch === 'pipeline') pipelinePolicy.validatePipeline(plan, roles);
  const branchRole = plan.branch === 'pipeline' ? null : plan.branch === 'analysis-execution' ? 'analyst'
    : ['writing', 'writing-execution'].includes(plan.branch) ? 'writer' : plan.branch ? 'chat' : null;
  for (const task of plan.tasks) {
    const researchChild = plan.branch === 'writing' && task.role === 'chat' && (!task.branch || task.branch === 'research');
    if (!roles[task.role] || (branchRole && task.role !== branchRole && !researchChild)) throw new Error('任务角色超出当前分支');
    if (typeof task.task !== 'string' || !task.task.trim()) throw new Error('任务目标为空');
    if (task.dependsOn != null && !Array.isArray(task.dependsOn)) throw new Error('任务依赖格式无效');
    if ((task.dependsOn || []).some(id => !ids.has(id) || id === task.id)) throw new Error('任务依赖不存在或依赖自身');
  }
}
function taskBranch(plan, task) { if (plan.branch === 'pipeline') { if (task.role === 'chat') { if (['conversation', 'inspection', 'environment', 'research'].includes(task.branch)) return task.branch; if (['inspection', 'environment', 'research'].includes(plan.intent?.branch)) return plan.intent.branch; } return pipelinePolicy.ROLES[task.role]; } return plan.branch === 'writing' && task.role === 'chat' ? 'research' : plan.branch; }
module.exports = { MAX_TASKS, BRANCHES, BRANCH_TOOLS, normalizeIntent, clarificationIntent, routePlan, restrictTools, validatePlan, taskBranch };
