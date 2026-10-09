// agent-tools.mjs — 把现有能力包成 pi AgentTool（依赖注入式，便于测试与解耦）
//
// analyst 工具：run_data_analysis —— 直接复用你已落地的 code-analysis.runDataAnalysis（模型真写代码 + 本地执行）。
// writer 工具：retrieve_context —— 复用 rag-store.retrieve（本地资料库 RAG 召回）。
// 两个工具都通过"注入依赖"拿到真实实现，harness 本身不 require 任何 CJS 文件，测试时换成 fake 即可。

import { wrapTool } from './agent-factory.mjs';
import { Type } from '@earendil-works/pi-ai';

// analyst 角色的工具集
export function makeAnalystTools({
  runDataAnalysis,
  requestModel,
  findPython,
  executeProcess,
  resolveAttachment,
  loadSettings,
  userDataPath,
  projectId,
  attachments = [],
  recordToolResult = null,
  analysisPlan = null, stepId = '', skillPrompt = '', priorResults = [],
}) {
  return [
    wrapTool({
      name: 'run_data_analysis',
      label: '数据分析与建模',
      description: '根据用户自然语言需求，编写并在本地执行 Python 代码完成数据分析、统计检验或计量建模，返回文字结论与图表文件路径。当用户需要对数据做"计算、检验、建模、可视化"时调用。参数 request 写清分析方法与目标；dataFile 写上传的数据文件名（可选）。',
      parameters: Type.Object({
        request: Type.String({ description: '要做的分析是什么，例如"对数据进行描述性统计并做相关分析"' }),
        dataFile: Type.Optional(Type.String({ description: '数据文件名（来自用户附带文件），不填则仅给出分析设计' })),
      }),
      execute: async (params, { signal } = {}) => {
        const result = await runDataAnalysis({
          plan: { request: params?.request || '', dataFile: params?.dataFile || '' },
          request: params?.request || '',
          attachments,
          requestModel,
          findPython,
          executeProcess,
          resolveAttachment,
          loadSettings,
          userDataPath,
          projectId,
          signal,
          analysisPlan, stepId, skillPrompt, priorResults,
        });
        if (recordToolResult) recordToolResult('analyst', 'run_data_analysis', result);
        if (result?.error) {
          return `分析未能完成：${result.error}\n（若模型生成了代码：\n${result.code || ''}）`;
        }
        const charts = (result.files || []).map((f) => `[图表文件] ${f}`).join('\n');
        if (result.structured) return `实际结构化分析结果：\n${JSON.stringify(result.structured)}\n请如实概括，不新增检验或数值。`;
        return `分析结论：\n${result.summary || '(无文字摘要)'}\n${charts ? `\n${charts}\n` : ''}（分析所用代码已生成为工具产物，可在结果中引用）`;
      },
    }),
  ];
}

export function makePlanningTools({ inspectData, submitAnalysisPlan, submitWritingPlan } = {}) {
  const tools = [];
  if (inspectData) tools.push(wrapTool({ name: 'inspect_data_file', label: '查看数据结构', description: '只检查当前项目工作文件的字段、类型、缺失和样本量，不执行计量分析。',
    parameters: Type.Object({ dataFile: Type.String() }), execute: async params => JSON.stringify(await inspectData(params.dataFile)) }));
  if (submitAnalysisPlan) tools.push(wrapTool({ name: 'submit_analysis_plan', label: '提交实证分析方案', description: '保存待用户确认的具体分析步骤；提交不会执行。明确变量/模型/标准误和表图，修改后重新确认。', parameters: Type.Object({
    researchQuestion: Type.String(), objective: Type.String(), dataFile: Type.String(), dataDescription: Type.String(),
    paperType: Type.Optional(Type.String()), lengthRequirement: Type.Optional(Type.String()), missingDataPolicy: Type.String(), interpretationLimits: Type.String(),
    steps: Type.Array(Type.Object({ methodId: Type.String(), label: Type.String(), purpose: Type.String(), specification: Type.String(), outputs: Type.String(), required: Type.Optional(Type.Boolean()) })),
  }), execute: async params => JSON.stringify(await submitAnalysisPlan(params)) }));
  if (submitWritingPlan) tools.push(wrapTool({ name: 'submit_empirical_writing_plan', label: '提交结果写作方案', description: '分析结果审阅后，提交标题、章节、篇幅与正文范围，用户确认后才写作。',
    parameters: Type.Object({ title: Type.String(), sections: Type.Array(Type.String()), lengthRequirement: Type.String(), task: Type.String(), resultStepIds: Type.Optional(Type.Array(Type.String(), { description: '要写入正文的实际分析步骤ID，须与用户确认范围对应；不选的表图不会自动附入正文' })) }), execute: async params => JSON.stringify(await submitWritingPlan(params)) }));
  return tools;
}

// writer 角色的工具集
export function makeWriterTools({ ragStore, project, recordToolResult = null, evidenceMap = new Map() }) {
  return [
    wrapTool({
      name: 'retrieve_context',
      label: '检索本地资料库',
      description: '从本地资料库（RAG）检索与查询相关的资料片段，返回带出处（文档名、页码）的命中结果。写作用户前需要引用资料时调用。',
      parameters: Type.Object({
        query: Type.String({ description: '检索词或问题' }),
        limit: Type.Optional(Type.Number({ description: '返回条数，默认 8' })),
      }),
      execute: async (params) => {
        if (!ragStore?.retrieve) return '（未配置资料库，无法检索）';
        try {
          const retrieval = await ragStore.retrieve(project, params?.query || '', Math.max(1, Math.min(20, Number(params?.limit) || 8)));
          // The production store returns { hits, mode, ... }; array responses
          // remain supported for injected stores and older integrations.
          const rawHits = Array.isArray(retrieval) ? retrieval : retrieval?.hits;
          if (!Array.isArray(rawHits)) throw new Error('资料库返回了无效的检索结果');
          if (retrieval.projectId && retrieval.projectId !== project.id) throw new Error('检索结果不属于当前项目');
          const allowedIds = new Set((project.documents || []).map(document => document.id));
          const scopedHits = rawHits.filter(hit => (!hit.projectId || hit.projectId === project.id) && (!hit.documentId || allowedIds.has(hit.documentId)));
          const hits = scopedHits.map(hit => {
            const key = hit.id || `${hit.documentName}:${hit.page}:${hit.position}:${hit.text}`;
            if (!evidenceMap.has(key)) evidenceMap.set(key, { ...hit, evidenceId: `E${evidenceMap.size + 1}` });
            return evidenceMap.get(key);
          });
          if (recordToolResult) recordToolResult('writer', 'retrieve_context', {
            hits, query: params?.query || '', mode: retrieval.mode || null,
            model: retrieval.model || null, totalChunks: retrieval.totalChunks || hits.length, error: retrieval.error || null,
          });
          if (!hits || hits.length === 0) return '资料库中没有相关检索结果。';
          return hits
            .map((h) => `[${h.evidenceId}] 《${h.documentName || '未知文档'}》${h.page != null ? ` p.${h.page}` : ''}\n${h.text || ''}`)
            .join('\n\n');
        } catch (error) {
          return `检索出错：${error.message}`;
        }
      },
    }),
  ];
}

export function makeMemoryTools(readHistory) {
  if (!readHistory) return [];
  return [wrapTool({
    name: 'read_conversation_history', label: '读取本对话原始历史',
    description: '按记忆中的轮次ID或关键词读取当前项目当前对话的原始要求与交付。用于恢复摘要省略的细节；返回内容不是文献证据，不得作为[E编号]引用。',
    parameters: Type.Object({ turnIds: Type.Optional(Type.Array(Type.String())), query: Type.Optional(Type.String()) }),
    execute: async params => {
      const ids = (params?.turnIds || []).slice(0, 10);
      const query = String(params?.query || '').trim();
      const turns = readHistory().filter(turn => ids.length ? ids.includes(turn.id) : query ? turn.text.includes(query) : true).slice(-6);
      return JSON.stringify(turns.map(turn => ({ ...turn, text: String(turn.text || '').slice(0, 18000) })));
    },
  })];
}
