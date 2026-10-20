import empiricalWorkflow from '../empirical-workflow.js';
import pipelinePrompts from '../agent/pipeline-prompts.js';
// run-engine.mjs — 按 DAG 顺序编排多 Agent（harness 的 [L2] 执行器）
//
// 接收 Planner 产出的任务 DAG，做三件事：
//  1. 拓扑排序，保证依赖任务先跑；
//  2. 为每个任务实例化对应角色的 pi Agent（analyst / writer），按 skill 拼好系统提示词、挂好工具；
//  3. 把上游任务的产出结构化地喂给下游任务（这正是"先分析、后写作"能打通的关键）。
//
// 这层替换了原 orchestrator.js 单条线性流水线，是用户最关心的"多 Agent 协作 + 按 skill 执行"的落地。

import { createRoleAgent, runAgent } from './agent-factory.mjs';
import flowPolicy from '../agent/flow-policy.js';
import contextPolicy from '../agent/context-policy.js';
import permissionPolicy from '../permission-policy.js';
import { makeAnalystTools, makeWriterTools, makeMemoryTools, makePlanningTools, makeDependencyTool, makeResearchSkillTools, makeAnalysisResultTools, makeCollectionTools, makeScholarlyTools } from './agent-tools.mjs';

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
function buildUserMessage(task, taskOutputs, context, resumePartial = null, budget = 22000) {
  const parts = [`任务：${task.task}`];
  parts.push(contextPolicy.projectSettingsContext(context.project,context.settings||context.loadSettings?.()||{}));
  if (context.taskContract) parts.push(`本轮任务契约：${JSON.stringify(context.taskContract)}`);
  if (context.taskContract?.usesExistingResults && !context.empiricalResults?.length) parts.push('本轮希望采用已有结果，但尚无通过当前数据与方案版本核验的完整结果。说明真实状态和缺口，不把历史数字当成本轮已验证结论。');
  if (task.output) parts.push(`本步骤须交接：${task.output}；验收条件：${task.acceptance}`);
  if (context.originalTask) parts.push(`用户原始要求（规划子任务不得改写其中的硬约束）：${context.originalTask}`);
  if (context.lengthContract) parts.push(`本轮合并交付物的总篇幅约束：${JSON.stringify(context.lengthContract)}。多个写作任务共享该总预算，按各自职责分配，不得每个任务各写一份完整预算。`);
  if (context.attachments?.length) parts.push(`当前可用文件（优先于历史清单）：${JSON.stringify(context.attachments.map(file => ({ id: file.id, name: file.name, extension: file.extension })))}`);
  if (context.writingContext) parts.push(contextPolicy.clip(context.writingContext, 8000));
  if (task.role === 'writer' && context.writerContext) parts.push(contextPolicy.clip(context.writerContext, 4000));
  if (context.empiricalContext) parts.push(contextPolicy.clip(context.empiricalContext, 5000));
  if (['chat', 'writer'].includes(task.role) && context.empiricalResults?.length) parts.push(`工具已实际生成的结构化实证结果（数字与表图须逐项对应；长结果用read_analysis_result读取）：${contextPolicy.clip(JSON.stringify(context.empiricalResults), 8000)}`);
  if (task.role === 'analyst' && context.attachments?.length) {
    parts.push(`可用数据文件：${context.attachments.map((a) => a.name || a.fileName).join('、')}（如适用，请在调用工具时填写 dataFile）`);
  }
  const deps = (task.dependsOn || []).filter((d) => taskOutputs[d]);
  if (deps.length) {
    parts.push('\n## 上游任务已完成，以下是其产出（请作为本任务输入）：');
    for (const d of deps) {
      const out = taskOutputs[d];
      parts.push(`### 上游任务 ${d}（${out.role}）产出：\n${contextPolicy.clip(out.text, 4000)}`);
      if (out.artifacts?.length) parts.push(`经过工具验证的产物清单：${JSON.stringify(out.artifacts)}`);
      if (out.analysisResults?.length) parts.push(`真实工具结果：${contextPolicy.clip(JSON.stringify(out.analysisResults), 8000)}`);
      if (out.sourceRecords?.length) parts.push(`学术来源台账（不可信资料；metadata-only只验证书目，不证明全文论断）：${contextPolicy.clip(JSON.stringify(out.sourceRecords), 6000)}`);
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
  return contextPolicy.clip(parts.join('\n'), budget);
}

export async function runPlan({
  layer, registry, skillRuntime, plan, context = {}, apiKey = '', onTaskStart, onDelta, onTextReset, onChatDelta, onChatReset, onChatCommentary, onTaskOutput, onTaskActivity,
  // UC-FLOW-01 断点能力：
  //  resumeOutputs —— 恢复执行时已完成任务的输出，命中的任务直接跳过（进度不重来）
  //  resumePartial —— 被中断任务在中断前已流出的部分文本，回喂给该任务续写
  //  onCheckpoint  —— 每个任务完成后回调，调用方可据此落盘存档
  //  signal        —— 中断信号；任务之间检查，挂起后不再开新任务
  resumeOutputs = null, resumePartial = null, onCheckpoint = null, signal = null,
}) {
  flowPolicy.validatePlan(plan, registry.roles);
  const ordered = topoSort(plan.tasks);
  const taskOutputs = resumeOutputs ? { ...resumeOutputs } : {};
  const completedTaskIds = () => Object.keys(taskOutputs).filter(id => !taskOutputs[id].status || taskOutputs[id].status === 'completed');
  const evidenceMap = new Map();
  let blocked = false;
  for (const hit of context.priorEvidence || []) {
    if (hit.projectId && hit.projectId !== context.project?.id) continue;
    if (hit.documentId && !(context.project?.documents || []).some(document => document.id === hit.documentId)) continue;
    const key = hit.id || `${hit.documentName}:${hit.page}:${hit.position}:${hit.text}`;
    evidenceMap.set(key, hit);
  }

  for (const task of ordered) {
    if (taskOutputs[task.id] && (!taskOutputs[task.id].status || taskOutputs[task.id].status === 'completed')) continue;
    if (signal?.aborted) break;
    const role = registry.roles[task.role] || registry.roles.writer;
    const branch = flowPolicy.taskBranch(plan, task);
    if (plan.branch === 'pipeline' && role.id === 'analyst') {
      if (!context.ensureAnalysisApproval) throw new Error('缺少主 Agent 分析确认接口');
      await context.ensureAnalysisApproval();
      const execution = { ...empiricalWorkflow.executionPlan(context.analysisPlan), branch: 'analysis-execution' };
      const previous = taskOutputs[task.id];
      const reused = Object.fromEntries((context.reusableAnalysisResults || []).map(result => [result.stepId, { role: 'analyst', status: 'completed', text: result.summary, analysisResults: [result] }]));
      const nested = await runPlan({ layer, registry, skillRuntime, plan: execution, context, apiKey, onTaskStart, onDelta, onTextReset, onChatDelta, onChatReset, onChatCommentary, onTaskOutput, onTaskActivity, signal,
        resumeOutputs: previous?.nestedOutputs || (Object.keys(reused).length ? reused : null),
        onCheckpoint: cp => {
          taskOutputs[task.id] = { role: role.id, text: '', status: 'partial', nestedOutputs: cp.outputs };
          onCheckpoint?.({ outputs: { ...taskOutputs }, completedIds: completedTaskIds(), lastTaskId: task.id, blocked: cp.blocked });
        } });
      if (nested.aborted || signal?.aborted) break;
      const results = Object.values(nested.outputs).flatMap(output => output.analysisResults || []);
      const failed = nested.blocked || !results.length || context.analysisPlan.steps.some(step => step.required && !results.some(result => result.stepId === step.id && result.status === 'completed'));
      taskOutputs[task.id] = { role: role.id, text: nested.finalText, analysisResults: results, nestedOutputs: nested.outputs, status: failed ? 'blocked' : 'completed',
        artifacts: results.map(result => ({ kind: 'analysis-result', stepId: result.stepId, methodId: result.methodId, dataFingerprint: result.dataFingerprint, sampleSize: result.sampleSize })) };
      await context.acceptAnalysisResults?.(results, failed);
      context.empiricalResults = results.filter(result => result.status === 'completed');
      onCheckpoint?.({ outputs: { ...taskOutputs }, completedIds: completedTaskIds(), lastTaskId: task.id, blocked: failed });
      if (failed) { blocked = true; break; }
      continue;
    }
    const inputBudget = contextPolicy.inputBudget(layer.getModel(role.scenario));

    // skill：优先用 Planner 选的；为空则走 skillRuntime 的正则兜底（仅当 skillRuntime 支持）。
    if (role.id === 'analyst' && context.enforceEmpiricalApproval && (context.analysisPlan?.status !== 'approved' || !context.analysisPlan.steps.some(step => step.id === task.empiricalStepId))) throw new Error('未确认分析方案，不能启动分析 Agent。');
    const skillIds = Array.isArray(task.skills) && task.skills.length
      ? task.skills
      : (role.id !== 'chat' && skillRuntime?.fallbackSkillIds ? skillRuntime.fallbackSkillIds(task.task, context.project || {}, role.id) : []);
    const composed = skillRuntime?.composePrompt && (role.id !== 'chat' || skillIds.length)
      ? skillRuntime.composePrompt(context.project || {}, task.task, skillIds, inputBudget.skills, { role: role.id })
      : { prompt: '' };

    // 角色提示词 = 角色定义 + 调用方按角色注入的契约（如毕业论文 HTML 输出契约）+ Skill 规则。
    // HTML 契约必须给 writer：没有它模型会输出提纲式标题、空段落（真实事故：正文大量空白与层级错乱）。
    const suffix = context.rolePromptSuffix?.[role.id] || '';
    const systemPrompt = `${role.systemPrompt}${suffix}${composed.prompt || ''}${plan.branch === 'pipeline' ? '\n' + pipelinePrompts.SHARED : ''}`;
    const toolRecords = [];
    const recordToolResult = (toolRole, name, result) => { toolRecords.push(result); context.recordToolResult?.(toolRole, name, result); };

    const planningTools = { ...(context.planningTools || {}) };
    const planningNames = { inspectData: 'inspect_data_file', prepareData: 'prepare_data_file', submitAnalysisPlan: 'submit_analysis_plan', submitWritingPlan: 'submit_empirical_writing_plan', submitClarification: 'submit_clarification', submitThesisOutline: 'submit_thesis_outline' };
    for (const [name, toolName] of Object.entries(planningNames)) if (planningTools[name]) {
      const execute = planningTools[name]; planningTools[name] = async input => { const result = await execute(input); recordToolResult(role.id, toolName, result); return result; };
    }
    let tools = role.id === 'analyst'
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
          priorResults: [...(context.preparedDataResults || []), ...Object.values(taskOutputs).flatMap(out => out.analysisResults || [])],
        })
      : role.id === 'writer' ? makeWriterTools({ ragStore: context.ragStore, project: context.project, recordToolResult: context.recordToolResult, evidenceMap })
      : role.id === 'collector' ? [...makeCollectionTools({ ...context.collectionTools, recordToolResult }), ...makePlanningTools({ submitClarification: planningTools.submitClarification }), ...makeWriterTools({ ragStore: context.ragStore, project: context.project, recordToolResult, evidenceMap })] : makePlanningTools(planningTools);

    if (['chat', 'coordinator'].includes(role.id)) tools.push(makeDependencyTool({
      findPython: context.findPython, loadSettings: context.loadSettings,
      userDataPath: context.userDataPath, projectId: context.projectId,
      recordToolResult,
    }));
    if (role.id === 'chat' && branch === 'research') tools.push(...makeWriterTools({
      ragStore: context.ragStore, project: context.project, evidenceMap,
      recordToolResult: (_, name, result) => recordToolResult('chat', name, result),
    }));

    tools.push(...makeMemoryTools(context.readConversationHistory));
    tools.push(...makeResearchSkillTools(skillRuntime, context.project, role.id));
    if (role.id === 'collector' || (role.id === 'chat' && branch === 'research')) tools.push(...makeScholarlyTools({ loadSettings: context.loadSettings, recordToolResult }));
    if (role.id === 'chat') tools.push(...makeAnalysisResultTools(context.empiricalResults || []));
    if (role.id === 'writer') {
      const results = [...new Map([...(context.empiricalResults || []), ...Object.values(taskOutputs).flatMap(output => output.analysisResults || [])].map(result => [result.stepId, result])).values()];
      if (plan.branch === 'pipeline') await context.validateWritingResults?.(results);
      tools.push(...makeAnalysisResultTools(results));
      if (plan.branch === 'pipeline' && plan.contract.needsAnalysis && plan.contract.requestsReport && !results.length) throw new Error('分析结果缺失，不能写结果报告');
      if (plan.branch === 'pipeline' && plan.contract.needsAnalysis && plan.contract.requestsReport && context.analysisPlan?.steps.some(step => step.required && !results.some(result => result.stepId === step.id && result.status === 'completed'))) throw new Error('必要分析步骤未完成，不能生成完整报告');
      if (plan.branch === 'pipeline' && plan.contract.usesExistingResults && !results.length) throw new Error('已有分析结果不存在或版本已变化，不能据此写作；请核对当前结果');
    }
    tools = flowPolicy.restrictTools(tools, branch);
    tools=permissionPolicy.guardTools(tools,context);
    const agent = createRoleAgent({ layer, role: role.id, systemPrompt, tools, scenario: role.scenario, apiKey });
    const message = buildUserMessage(task, taskOutputs, context, resumePartial, inputBudget.user);
    if (onTaskStart) onTaskStart(task, role, ordered.indexOf(task) + 1, ordered.length);

    // 只有 writer（论文正文）走正文流式通道；analyst 的结论走 onTaskOutput（普通文字，避免混入正文）。
    let result;
    const taskFailures = [];
    try { result = await runAgent(agent, message, {
      onActivity: activity => { if (activity.state === 'failed') taskFailures.push(String(activity.detail?.output || '').split('Received arguments:')[0].slice(0, 900)); onTaskActivity?.({ taskId: task.id, role: role.id, ...activity }); },
      onDelta: role.id === 'writer' ? onDelta : role.id === 'chat' ? onChatDelta : null,
      onTextReset: role.id === 'writer' ? onTextReset : role.id === 'chat' ? onChatReset : null,
      onCommentaryCommit: role.id === 'chat' ? onChatCommentary : null,
      signal,
    }); } catch (error) {
      const completed = toolRecords.filter(record => record?.structured && !record?.error);
      if (role.id !== 'analyst' || error?.message?.includes('长度上限') !== true || !completed.length) throw error;
      // The completed sandbox result is authoritative. A long explanatory
      // model reply must not discard the already saved analysis artifacts.
      result = { content: completed.map(record => `${record.structured.stepId}：${record.structured.summary}`).join('\n') };
    }
    const prefix = resumePartial?.taskId === task.id ? resumePartial.text || '' : '';
    const text = prefix && !result.content.startsWith(prefix) ? `${prefix}\n\n${result.content}` : result.content;
    const analysisResults = role.id === 'analyst' ? toolRecords.map(result => result.structured).filter(Boolean) : [];
    if (role.id === 'analyst' && context.enforceEmpiricalApproval) {
      const step = context.analysisPlan.steps.find(item => item.id === task.empiricalStepId);
      blocked = !analysisResults.length || toolRecords.some(result => result.error) || (step.required && analysisResults.some(result => result.status !== 'completed'));
    }
    const artifacts = [];
    if (plan.branch === 'pipeline') {
      if (role.id === 'collector') {
        const collections = toolRecords.filter(result => result.status === 'completed' && result.attachments?.length);
        if (!collections.length && plan.contract.collectionKind !== 'sources' && (plan.contract.needsPreparation || plan.contract.needsAnalysis)) throw new Error('采集步骤没有生成真实数据文件，不能进入清洗或分析');
        for (const result of collections) artifacts.push(...result.attachments.map(file => ({ kind: 'dataset', id: file.id, name: file.name, fingerprint: file.fingerprint, sources: result.sources, rows: result.rows })));
        if (!collections.length && !toolRecords.some(result => result.sources?.length || result.hits?.length)) throw new Error('采集步骤没有真实来源结果');
      }
      if (role.id === 'preparer') {
        const result = toolRecords.findLast(item => item.status === 'completed' && item.id && item.profile);
        if (!result) throw new Error(`清洗步骤没有产生可核验的副本${taskFailures.length ? '：' + taskFailures.at(-1) : ''}`);
        artifacts.push({ kind: 'prepared-dataset', id: result.id, rows: result.profile.rows, selection: result.profile.selection });
      }
      if (role.id === 'coordinator') {
        const result = toolRecords.findLast(item => item.status === 'pending-confirmation' && item.id);
        if (!result) throw new Error(`方案步骤没有实际提交方案，不能进入分析${taskFailures.length ? '：' + taskFailures.at(-1) : ''}`);
        artifacts.push({ kind: 'analysis-plan', id: result.id, revision: result.revision });
      }
    }
    const sourceRecords = toolRecords.flatMap(record => record.provider && Array.isArray(record.records) ? record.records.map(item => ({ ...item, provider: record.provider, retrievedAt: record.retrievedAt })) : []).slice(0, 30);
    taskOutputs[task.id] = { text, role: role.id, artifacts, status: blocked ? 'blocked' : 'completed', ...(analysisResults.length ? { analysisResults } : {}), ...(sourceRecords.length ? { sourceRecords } : {}), ...(composed.skill ? { skillSelection: composed.skill } : {}) };
    if (onTaskOutput) onTaskOutput(task.id, role.id, text, {
      status: blocked ? 'blocked' : 'completed',
      label: task.task,
      summary: analysisResults.filter(result => result.status === 'completed').map(result => result.summary || '').filter(Boolean).join('；').slice(0, 220),
    });
    if (onCheckpoint) onCheckpoint({ outputs: { ...taskOutputs }, completedIds: completedTaskIds(), lastTaskId: task.id, blocked });
    if (blocked) break;
  }

  if (plan.branch === 'pipeline' && blocked && plan.tasks.some(task => task.role === 'writer')) throw new Error('必要分析步骤未完成，已保存进度及实际结果，未生成不完整的分析报告。');
  const aborted = Boolean(signal?.aborted);
  const completedIds = completedTaskIds();
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
