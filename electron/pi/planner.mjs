import pipelinePrompts from '../agent/pipeline-prompts.js';
import empiricalMethods from '../empirical-workflow.js';
import pipelinePolicy from '../agent/pipeline-policy.js';
import researchAdapter from '../skills/research-adapter.js';
const { PLANNING_SKILL_ID, CORE_SKILL_ID, LEGACY_IDS } = researchAdapter;
// planner.mjs — 意图识别 + 任务 DAG 生成（harness 的 [L2] 第一环）
//
// 核心：纯 LLM 驱动，零关键词正则。模型依据"角色目录 + 技能目录"自行判断：
//   - 用户到底要"分析"还是"写作"，或两者都要（多意图）；
//   - 谁先谁后（依赖关系），例如先分析出结论、再据此写章节；
//   - 写作任务该配哪些 skill。
// 下方的 few-shot 只是引导形态，不是触发条件——模型应基于语义灵活判断，不被例子关键词束缚。
//
// 这层替换了原 orchestrator.js 里那段正则硬触发（/(?:数据分析|回归|相关|...)/），
// 也是你最初质疑"为什么识别不出双意图"的根本解法。

import { requestModel } from './model-layer.mjs';
export { recognizeIntent } from './intent.mjs';

// 构造编排器系统提示词：把可选角色与技能摊开给模型看。
function buildSystemPrompt(registry) {
  const rolesText = registry.roleList
    .map((r) => `- ${r.id}（${r.name}）：${r.description}\n  可用工具：${r.tools.join('、') || '无'}`)
    .join('\n');
  const skillsText = registry.skills.length
    ? registry.skills.map((s) => `- ${s.id}：${s.name} — ${s.description}`).join('\n')
    : '（暂无额外技能，可写空数组 []）';

  return `${pipelinePrompts.PLANNING}

实际角色目录：
${rolesText}

当前候选技能（可搜索完整库，不一次加载）：
${skillsText}

实际方法索引：
${empiricalMethods.methodCatalog().map(item => `${item.id}：${item.name}；${item.status}；skill=${item.skillId}`).join('\n')}`;
}

// 从模型输出里抠出 JSON（容忍 ```json 包裹或前后有文字）。
function parsePlan(text) {
  if (!text) return null;
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text);
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 清洗 / 校验模型产出的 DAG：去无效项、未知角色降级为 writer、过滤悬空依赖。
function normalizePlan(parsed, registry) {
  if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0 || parsed.tasks.length > 18) return null;
  const validIds = new Set();
  const tasks = [];
  for (const raw of parsed.tasks) {
    if (!raw || typeof raw.task !== 'string' || !raw.task.trim()) continue;
    let role = String(raw.role || '').trim();
    if (!registry.roles[role]) { if (parsed.version === 2) return null; role = registry.roles.chat ? 'chat' : 'writer'; }
    const id = String(raw.id || `t${tasks.length + 1}`).trim() || `t${tasks.length + 1}`;
    if (validIds.has(id)) return null;
    const dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [];
    const knownSkills = new Set(registry.skills.map(skill => skill.id));
    const skills = Array.isArray(raw.skills) ? [...new Set(raw.skills.map(String).map(id => LEGACY_IDS[id] || id))].filter(id => knownSkills.has(id) && (parsed.version === 2 || role !== 'chat' || id === PLANNING_SKILL_ID)).slice(0, 4) : [];
    tasks.push({ id, role, task: raw.task.trim(), skills, dependsOn, ...(parsed.version === 2 ? { output: String(raw.output || '').slice(0, 1000), acceptance: String(raw.acceptance || '').slice(0, 1000), ...(role === 'chat' && ['conversation', 'research', 'inspection', 'environment'].includes(raw.branch) ? { branch: raw.branch } : {}) } : {}) });
    validIds.add(id);
  }
  if (tasks.length === 0) return null;
  for (const t of tasks) {
    if (t.dependsOn.some(d => !validIds.has(d) || d === t.id)) return null;
  }
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    if (!byId.get(id).dependsOn.every(visit)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  if (!tasks.every(task => visit(task.id))) return null;
  if (parsed.version === 2) {
    const result = { version: 2, branch: 'pipeline', tasks, contract: pipelinePolicy.contract(parsed.contract || { goal: tasks.map(item => item.task).join('；') }), reusableAnalysis: parsed.reusableAnalysis || null };
    try { pipelinePolicy.validatePipeline(result, registry.roles); } catch { return null; }
    return result;
  }
  return { tasks };
}

export async function planTasks({ layer, registry, userPrompt, attachments = [], projectContext = '', intent = null, existingProgress = null, apiKey = '', signal = null }) {
  const attachmentInfo = attachments.length
    ? `\n用户本次附带的文件：${attachments.map((a) => a.name || a.fileName || '未命名文件').join('、')}`
    : '\n用户本次没有附带文件。';
  const ctx = projectContext ? `\n论文项目背景：${projectContext}` : '';
  const userMessage = `用户请求：\n${userPrompt}\n${attachmentInfo}${ctx}\n${intent ? `本轮意图已识别且必要信息已齐备：${JSON.stringify(intent)}。按此目标规划任务，不重新扩大目标或重复澄清。` : ''}\n请输出任务 DAG 的 JSON。`;

  let parsed = null;
  let raw = '';
  for (let attempt = 0; attempt < (intent?.taskContract ? 2 : 1); attempt++) {
    const res = await requestModel(layer, {
      scenario: 'planning',
      messages: [
        { role: 'system', content: buildSystemPrompt(registry) },
        { role: 'user', content: userMessage + `\n宿主核验的可复用进度：${JSON.stringify(existingProgress || {})}` + (attempt ? '\n上一份计划未通过校验。请按本轮契约重新输出version:2：角色有效、产物和验收条件完整、依赖无环。只安排仍需执行的步骤，保留可复用进度；问答允许只有chat，文字修改允许只有writer，不强制增加采集、清洗或分析。上一份输出：' + raw.slice(0, 5000) : '') },
      ],
      options: { temperature: 0.2, maxTokens: 4200 },
      apiKey,
      signal,
    });
    raw = res?.content || '';
    const output = parsePlan(raw);
    if (output?.version === 2) output.contract = intent?.taskContract || { goal: intent?.goal || userPrompt };
    if (output) output.reusableAnalysis = intent?.taskContract?.analysisAction === 'continue' ? existingProgress?.reusableAnalysis || null : null;
    parsed = intent?.taskContract && output?.version !== 2 ? null : normalizePlan(output, registry);
    if (parsed) break;
  }

  if (!parsed) {
    if (intent?.taskContract) throw new Error('任务计划未通过依赖和产物校验，未启动执行。已保留原始目标，请重新生成计划。');
    // 兜底：把整个请求当成一次写作任务，保证用户意图不丢。
    return { tasks: [{ id: 't1', role: registry.roles.chat ? 'chat' : 'writer', task: userPrompt, skills: [], dependsOn: [] }], raw, fallback: true };
  }
  return { ...parsed, raw, fallback: false };
}
