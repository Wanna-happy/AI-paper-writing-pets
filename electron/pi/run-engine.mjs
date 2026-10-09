// run-engine.mjs — 按 DAG 顺序编排多 Agent（harness 的 [L2] 执行器）
//
// 接收 Planner 产出的任务 DAG，做三件事：
//  1. 拓扑排序，保证依赖任务先跑；
//  2. 为每个任务实例化对应角色的 pi Agent（analyst / writer），按 skill 拼好系统提示词、挂好工具；
//  3. 把上游任务的产出结构化地喂给下游任务（这正是"先分析、后写作"能打通的关键）。
//
// 这层替换了原 orchestrator.js 单条线性流水线，是用户最关心的"多 Agent 协作 + 按 skill 执行"的落地。

import { createRoleAgent, runAgent } from './agent-factory.mjs';
import { makeAnalystTools, makeWriterTools, makeMemoryTools, makePlanningTools } from './agent-tools.mjs';

// 拓扑排序：返回的任务顺序保证 dependsOn 一定排在前面；检测到环则抛错。
function topoSort(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const visited = new Set();
  const visiting = new Set();
  const order = [];
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`任务依赖存在环：${id}`);
    visiting.add(id);
    const t = byId.get(id);
    if (t) for (const dep of t.dependsOn || []) if (byId.has(dep)) visit(dep);
    visiting.delete(id);
    visited.add(id);
    if (t) order.push(t);
  }
  for (const t of tasks) visit(t.id);
  return order;
}

// 为单个任务拼出给 Agent 的用户消息：任务本身 + 数据文件提示（analyst）+ 上游产出（依赖任务）
// + 恢复续写时的"中断前已生成部分"（UC-FLOW-01）。
function buildUserMessage(task, taskOutputs, context, resumePartial = null) {
  const parts = [`任务：${task.task}`];
  if (context.originalTask) parts.push(`用户原始要求（规划子任务不得改写其中的硬约束）：${context.originalTask}`);
  if (context.lengthContract) parts.push(`本轮合并交付物的总篇幅约束：${JSON.stringify(context.lengthContract)}。多个写作任务共享该总预算，按各自职责分配，不得每个任务各写一份完整预算。`);
  if (context.writingContext) parts.push(context.writingContext);
  if (task.role === 'writer' && context.writerContext) parts.push(context.writerContext);
  if (context.empiricalContext) parts.push(context.empiricalContext);
  if (task.role === 'writer' && context.empiricalResults?.length) parts.push(`已经用户审阅的结构化实证结果（数字与表图须逐项对应）：${JSON.stringify(context.empiricalResults)}`);
  if (task.role === 'analyst' && context.attachments?.length) {
    parts.push(`可用数据文件：${context.attachments.map((a) => a.name || a.fileName).join('、')}（如适用，请在调用工具时填写 dataFile）`);
  }
  const deps = (task.dependsOn || []).filter((d) => taskOutputs[d]);
  if (deps.length) {
    parts.push('\n## 上游任务已完成，以下是其产出（请作为本任务输入）：');
    for (const d of deps) {
      const out = taskOutputs[d];
      parts.push(`### 上游任务 ${d}（${out.role}）产出：\n${out.text}`);
      if (out.analysisResults?.length) parts.push(`真实工具结果：${JSON.stringify(out.analysisResults)}`);
    }
  }
  // 断点续写：把中断前已流出的部分内容回喂，避免从开头重写。
  if (resumePartial && resumePartial.taskId === task.id && resumePartial.text) {
    parts.push(`\n## 中断前已生成的部分内容（请在其基础上续写，不要从开头重复）\n${resumePartial.text}`);
  }
  // 用户在挂起期间补充的说明（打断 → 补充 → 继续）：优先级高于原任务描述。
  if (context.resumeNote) {
    parts.push(`\n## 用户补充说明（挂起期间用户新增的要求，请一并落实）\n${context.resumeNote}`);
  }
  return parts.join('\n');
}

export async function runPlan({
  layer, registry, skillRuntime, plan, context = {}, apiKey = '', onTaskStart, onDelta, onTextReset, onChatDelta, onChatReset, onTaskOutput,
  // UC-FLOW-01 断点能力：
  //  resumeOutputs —— 恢复执行时已完成任务的输出，命中的任务直接跳过（进度不重来）
  //  resumePartial —— 被中断任务在中断前已流出的部分文本，回喂给该任务续写
  //  onCheckpoint  —— 每个任务完成后回调，调用方可据此落盘存档
  //  signal        —— 中断信号；任务之间检查，挂起后不再开新任务
  resumeOutputs = null, resumePartial = null, onCheckpoint = null, signal = null,
}) {
  const ordered = topoSort(plan.tasks);
  const taskOutputs = resumeOutputs ? { ...resumeOutputs } : {};
  const evidenceMap = new Map();
  let blocked = false;
  for (const hit of context.priorEvidence || []) {
    if (hit.projectId && hit.projectId !== context.project?.id) continue;
    if (hit.documentId && !(context.project?.documents || []).some(document => document.id === hit.documentId)) continue;
    const key = hit.id || `${hit.documentName}:${hit.page}:${hit.position}:${hit.text}`;
    evidenceMap.set(key, hit);
  }

  for (const task of ordered) {
    if (taskOutputs[task.id]) continue;
    if (signal?.aborted) break;
    const role = registry.roles[task.role] || registry.roles.writer;

    // skill：优先用 Planner 选的；为空则走 skillRuntime 的正则兜底（仅当 skillRuntime 支持）。
    if (role.id === 'analyst' && context.enforceEmpiricalApproval && (context.analysisPlan?.status !== 'approved' || !context.analysisPlan.steps.some(step => step.id === task.empiricalStepId))) throw new Error('未确认分析方案，不能启动分析 Agent。');
    const skillIds = Array.isArray(task.skills) && task.skills.length
      ? task.skills
      : (role.id !== 'chat' && skillRuntime?.fallbackSkillIds ? skillRuntime.fallbackSkillIds(task.task) : []);
    const composed = skillRuntime?.composePrompt && (role.id !== 'chat' || skillIds.length)
      ? skillRuntime.composePrompt(context.project || {}, task.task, skillIds)
      : { prompt: '' };

    // 角色提示词 = 角色定义 + 调用方按角色注入的契约（如毕业论文 HTML 输出契约）+ Skill 规则。
    // HTML 契约必须给 writer：没有它模型会输出提纲式标题、空段落（真实事故：正文大量空白与层级错乱）。
    const suffix = context.rolePromptSuffix?.[role.id] || '';
    const systemPrompt = `${role.systemPrompt}${suffix}${composed.prompt || ''}`;
    const toolRecords = [];
    const recordToolResult = (toolRole, name, result) => { toolRecords.push(result); context.recordToolResult?.(toolRole, name, result); };

    const tools = role.id === 'analyst'
      ? makeAnalystTools({
          runDataAnalysis: context.runDataAnalysis,
          requestModel: context.requestModel,
          findPython: context.findPython,
          executeProcess: context.executeProcess,
          resolveAttachment: context.resolveAttachment,
          loadSettings: context.loadSettings,
          userDataPath: context.userDataPath,
          projectId: context.projectId,
          attachments: context.attachments || [],
          recordToolResult,
          analysisPlan: context.analysisPlan, stepId: task.empiricalStepId,
          skillPrompt: composed.prompt || '',
          priorResults: Object.values(taskOutputs).flatMap(out => out.analysisResults || []),
        })
      : role.id === 'writer' ? makeWriterTools({ ragStore: context.ragStore, project: context.project, recordToolResult: context.recordToolResult, evidenceMap })
      : makePlanningTools(context.planningTools);

    tools.push(...makeMemoryTools(context.readConversationHistory));
    const agent = createRoleAgent({ layer, role: role.id, systemPrompt, tools, scenario: role.scenario, apiKey });
    const message = buildUserMessage(task, taskOutputs, context, resumePartial);
    if (onTaskStart) onTaskStart(task, role, ordered.indexOf(task) + 1, ordered.length);

    // 只有 writer（论文正文）走正文流式通道；analyst 的结论走 onTaskOutput（普通文字，避免混入正文）。
    const result = await runAgent(agent, message, {
      onDelta: role.id === 'writer' ? onDelta : role.id === 'chat' ? onChatDelta : null,
      onTextReset: role.id === 'writer' ? onTextReset : role.id === 'chat' ? onChatReset : null,
      signal,
    });
    const prefix = resumePartial?.taskId === task.id ? resumePartial.text || '' : '';
    const text = prefix && !result.content.startsWith(prefix) ? `${prefix}\n\n${result.content}` : result.content;
    const analysisResults = role.id === 'analyst' ? toolRecords.map(result => result.structured).filter(Boolean) : [];
    if (role.id === 'analyst' && context.enforceEmpiricalApproval) {
      const step = context.analysisPlan.steps.find(item => item.id === task.empiricalStepId);
      blocked = !analysisResults.length || toolRecords.some(result => result.error) || (step.required && analysisResults.some(result => result.status !== 'completed'));
    }
    taskOutputs[task.id] = { text, role: role.id, ...(analysisResults.length ? { analysisResults } : {}) };
    if (onTaskOutput) onTaskOutput(task.id, role.id, text);
    if (onCheckpoint) onCheckpoint({ outputs: { ...taskOutputs }, completedIds: Object.keys(taskOutputs), lastTaskId: task.id, blocked });
    if (blocked) break;
  }

  const aborted = Boolean(signal?.aborted);
  const completedIds = Object.keys(taskOutputs);
  // 聚合最终产出：只拼已完成的写作任务；被挂起时 finalText 是部分内容。
  // 直接拼接，不加 markdown 标题——正文会进 HTML 编辑器，"# 内容（任务 x）"这类标题会污染正文。
  const writers = ordered.filter((t) => t.role === 'writer' && taskOutputs[t.id]);
  const done = ordered.filter((t) => taskOutputs[t.id]);
  const finalText = writers.length
    ? writers.map((t) => taskOutputs[t.id].text).join('\n\n')
    : (done.length ? taskOutputs[done[done.length - 1].id].text : '');

  const chatText = ordered.filter(task => task.role === 'chat' && taskOutputs[task.id]).map(task => taskOutputs[task.id].text).join('\n\n');
  return { tasks: ordered, outputs: taskOutputs, finalText, chatText, aborted, completedIds, blocked };
}
