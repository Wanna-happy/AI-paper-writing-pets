import empiricalMethods from '../empirical-workflow.js';
const requireMethodIds = () => [...empiricalMethods.methodCatalog().filter(item => item.status === 'available').map(item => item.id), ...Object.keys(empiricalMethods.METHOD_ALIASES)];
// agent-tools.mjs — 把现有能力包成 pi AgentTool（依赖注入式，便于测试与解耦）
//
// analyst 工具：run_data_analysis —— 直接复用你已落地的 code-analysis.runDataAnalysis（模型真写代码 + 本地执行）。
// writer 工具：retrieve_context —— 复用 rag-store.retrieve（本地资料库 RAG 召回）。
// 两个工具都通过"注入依赖"拿到真实实现，harness 本身不 require 任何 CJS 文件，测试时换成 fake 即可。

import { wrapTool } from './agent-factory.mjs';
import { Type } from '@earendil-works/pi-ai';
import dependencyInstaller from '../sandbox/dependency-installer.js';
import scholarlyMetadata from '../tools/scholarly-metadata.js';

export function makeResearchSkillTools(runtime, project = {}, role = '') {
  if (!runtime?.readDocument) return [];
  return [wrapTool({
    name: 'search_research_skills', label: '查找研究技能',
    description: '按当前任务与项目学科检索导入技能库，返回有限候选。只读，不执行技能内脚本。',
    parameters: Type.Object({ query: Type.String() }),
    execute: async params => JSON.stringify(runtime.getCatalog({ project, task: params.query, role, limit: 12 })),
  }), wrapTool({
    name: 'read_research_skill', label: '读取技能与引用',
    description: '读取技能正文或相对技能目录的引用文件。长文件用nextOffset分页，不能访问库外路径或执行脚本。',
    parameters: Type.Object({ id: Type.String(), path: Type.Optional(Type.String()), offset: Type.Optional(Type.Number()) }),
    execute: async params => {
      try { return JSON.stringify(runtime.readDocument(params.id, params.path || '', params.offset || 0)); }
      catch (error) { return JSON.stringify({ error: error.message }); }
    },
  }), wrapTool({name:'get_research_capabilities',label:'检查研究方法能力',
    description:'只读查询真实登记方法、执行入口状态、依赖待检查和方法验收项。connected不是统计正确性认证；未登记的方法不能承诺已接通。',
    parameters:Type.Object({methodId:Type.Optional(Type.String())}),execute:async params=>{
      const methods=empiricalMethods.methodCatalog();
      if(!params.methodId)return JSON.stringify({methods,unregisteredExamples:['meta-analysis'],materialWorkflows:{qualitative:'guided-with-source-review',questionnaireDesign:'guided-not-validated-scale',systematicReview:'guided-with-screening-log'},notice:'这是定量执行方法索引；材料研究可用适配卡与资料工具。依赖和数据适用性需实际执行检查；not-certified不表示方法错误。'});
      try {const {method,constraint}=empiricalMethods.resolveMethod(params.methodId);return JSON.stringify({...method,constraint});}
      catch(error){return JSON.stringify({methodId:params.methodId,executionStatus:error.code==='METHOD_NOT_CONNECTED'?'requires-extension':'unregistered',error:error.message});}
    }})];
}

export function makeScholarlyTools({loadSettings,recordToolResult}={}) {
  return [wrapTool({name:'lookup_scholarly_metadata',label:'核验学术文献元数据',
    description:'通过Crossref实际核验DOI或按题名查找候选，返回作者年份等；不核验全文论断。只传公开题名或DOI，不发送私有正文。遵守网页访问权限。',
    parameters:Type.Object({doi:Type.Optional(Type.String()),query:Type.Optional(Type.String())}),
    execute:async(params,{signal}={})=>{const result=await scholarlyMetadata.lookupScholarlyMetadata({...params,loadSettings,signal});recordToolResult?.('collector','lookup_scholarly_metadata',result);return JSON.stringify(result);}
  })];
}

export function makeAnalysisResultTools(results = []) {
  if (!results.length) return [];
  return [wrapTool({ name: 'read_analysis_result', label: '读取已确认分析结果',
    description: '按步骤ID分页读取本轮已获准采用的真实结果JSON；offset为字符位置。不能读取未选择的步骤或其他项目结果。',
    parameters: Type.Object({ stepId: Type.String(), offset: Type.Optional(Type.Number()) }),
    execute: async params => {
      const result = results.find(item => item.stepId === params.stepId);
      if (!result) throw new Error('该结果不在本轮已确认的写作范围内');
      const source = JSON.stringify(result), offset = Math.max(0, Math.floor(Number(params.offset) || 0));
      return JSON.stringify({ stepId: result.stepId, offset, totalCharacters: source.length, text: source.slice(offset, offset + 6000), nextOffset: offset + 6000 < source.length ? offset + 6000 : null });
    } })];
}

export function makeDependencyTool({ installDependency = dependencyInstaller.installAnalysisDependency, findPython, loadSettings, userDataPath, projectId, recordToolResult = null }) {
  return wrapTool({
    name: 'install_python_dependency',
    label: '安装当前项目的 Python 依赖',
    description: '用户要求安装 Python 分析库，或已确认的方法需要缺失依赖时调用。只传 PyPI 包名和可选精确版本；产品内置 pip 下载并校验二进制 wheel，写入当前项目专属目录。不能传 Git、URL 或 pip 命令参数。',
    parameters: Type.Object({
      name: Type.String({ description: 'PyPI 包名，例如 dtaidistance' }),
      version: Type.Optional(Type.String({ description: '可选的精确版本，例如 2.5.1' })),
    }),
    execute: async (params, { signal } = {}) => {
      try {
        const result = await installDependency({ name: params?.name, version: params?.version, userDataPath, projectId, python: await findPython(loadSettings()), signal });
        if (recordToolResult) recordToolResult('dependency', 'install_python_dependency', result);
        return `项目依赖已下载并校验：${result.name}==${result.version}；状态：${result.status}。${result.dependencies?.length ? `本次安装：${result.dependencies.join('、')}。` : ''}来源是产品分析运行时，而非项目目录下的虚拟环境。若要确认分析能否完成，需在系统沙箱中执行实际分析；不得仅凭安装结果宣称任务完成。`;
      } catch (error) {
        return `依赖安装失败：${error.message}。不要猜测项目虚拟环境或声称系统无法联网；按真实工具错误说明。`;
      }
    },
  });
}

// analyst 角色的工具集
export function makeAnalystTools({
  runDataAnalysis,
  installDependency = dependencyInstaller.installAnalysisDependency,
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
    makeDependencyTool({ installDependency, findPython, loadSettings, userDataPath, projectId, recordToolResult }),
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
        if (result.structured) {
          const actual = result.structured;
          return `当前步骤已完成：${actual.stepId}（${actual.methodId}），样本量 ${actual.sampleSize}。\n${actual.summary}\n结果文件：${(actual.tables || []).map(table => `${table.title}（${table.rows.length} 行）`).join('、') || '无'}；图表 ${(actual.files || []).length} 个。\n诊断：${JSON.stringify((actual.diagnostics || []).slice(0, 12))}\n限制：${JSON.stringify(actual.limitations || [])}\n请只简要说明完成状态与主要发现，不要复述整张表。完整结果已经单独保存并会交给写作 Agent。`;
        }
        return `分析结论：\n${result.summary || '(无文字摘要)'}\n${charts ? `\n${charts}\n` : ''}（分析所用代码已生成为工具产物，可在结果中引用）`;
      },
    }),
  ];
}

export function makeCollectionTools({ searchWeb, collectData, recordToolResult }) {
  const tools = [];
  if (searchWeb) tools.push(wrapTool({ name: 'search_web', label: '搜索公开来源', description: '实际搜索公开网页与数据来源，返回来源链接；不代表已下载数据。', parameters: Type.Object({ query: Type.String() }), execute: async input => { const result = await searchWeb(input); recordToolResult?.('collector', 'search_web', result); return JSON.stringify(result); } }));
  if (collectData) tools.push(wrapTool({ name: 'collect_data', label: '采集并解析真实数据', description: '实际下载公开来源、生成解析代码并在离线沙箱解析，返回导入项目的 CSV、来源哈希与真实行数。只支持公开来源，不能绕过登录或访问内网。', parameters: Type.Object({ request: Type.String(), urls: Type.Array(Type.String(), { minItems: 1, maxItems: 3 }) }), execute: async input => { const result = await collectData(input); recordToolResult?.('collector', 'collect_data', result); return JSON.stringify(result); } }));
  return tools;
}

export function makePlanningTools({ inspectData, prepareData, submitAnalysisPlan, submitWritingPlan, submitClarification, submitThesisOutline } = {}) {
  const tools = [];
  if(submitThesisOutline)tools.push(wrapTool({name:'submit_thesis_outline',label:'讨论并确认论文目录',description:'根据用户在当前对话中逐步明确的研究问题和方法提出目录，展示确认卡。仅用户确认后保存；修改反馈须继续讨论。新建项目不要求目录，不能把建议当已确认。',parameters:Type.Object({chapters:Type.Array(Type.Object({id:Type.Optional(Type.String()),title:Type.String(),sectionIds:Type.Array(Type.String()),targetWords:Type.Optional(Type.Number())}),{minItems:1,maxItems:12})}),execute:async input=>JSON.stringify(await submitThesisOutline(input))}));
  if (submitClarification) tools.push(wrapTool({ name: 'submit_clarification', label: '集中澄清需求', description: '需要确认会改变方案的必要问题时调用。提交尚未回答的问题，界面逐题展示直接点选的选项；不要重复已确认事项。调用后只简短说明请填写卡片，不在正文重抄问题。',
    parameters: Type.Object({ title: Type.String(), questions: Type.Array(Type.Object({ id: Type.String(), decisionKey: Type.Optional(Type.String()), question: Type.String(), options: Type.Optional(Type.Array(Type.String())), suggestedAnswer: Type.Optional(Type.String()), required: Type.Optional(Type.Boolean()) })) }),
    execute: async params => JSON.stringify(await submitClarification(params)) }));
  if (inspectData) tools.push(wrapTool({ name: 'inspect_data_file', label: '读取数据与描述统计', description: '在本机沙箱读取当前项目 CSV/XLSX，返回真实样本量、字段、缺失、去重计数和数值变量的均值、标准差、四分位数及范围；不运行回归等计量模型。用户只要描述性统计时直接调用。',
    parameters: Type.Object({
      dataFile: Type.Optional(Type.String({ description: '文件名或文件 ID；当前项目只有一份有效数据时可省略' })),
      scope: Type.Optional(Type.Union([Type.Literal('current'), Type.Literal('raw')], { description: '默认 current 沿用现有方案筛选范围；明确检查原始全表才选 raw' })),
      selection: Type.Optional(Type.Object({
        sheetName: Type.Optional(Type.String()), cellRange: Type.Optional(Type.String({ description: '例如 A1:K738，首行为标题' })),
        headerRow: Type.Optional(Type.Number()),
        yearRange: Type.Optional(Type.Object({ min: Type.Number(), max: Type.Number(), column: Type.Optional(Type.String()) })),
        columns: Type.Optional(Type.Array(Type.String())), numericColumns: Type.Optional(Type.Array(Type.String(), { description: '明确指定转为数值的字段；只处理数字/空白/规范千分位，不擅自转换百分比或非法字符' })),
        probeValues: Type.Optional(Type.Array(Type.String(), { description: '仅统计指定取值在各列出现次数，例如 ["12"]；不自动当作缺失值' })),
        missingValues: Type.Optional(Type.Array(Type.Object({ column: Type.String(), values: Type.Array(Type.String()) }), { description: '经用户确认才把指定列里的取值转为缺失；不能把其他列中的同一取值也转掉' })),
        filters: Type.Optional(Type.Array(Type.Object({ column: Type.String(), op: Type.String(), values: Type.Array(Type.String()) }))),
      })),
    }), execute: async params => JSON.stringify(await inspectData(params)) }));
  if (prepareData) tools.push(wrapTool({ name: 'prepare_data_file', label: '清洗数据副本', description: '用户要求清洗后分析时，在拟分析方案前实际执行已明确的筛选、数值转换和缺失标记规则，生成独立 CSV 副本，原文件不变。不进行模型计算，不猜测未知编码或缺失规则；不明之处先提必要问题。后续分析自动复用此副本。',
    parameters: Type.Object({ dataFile: Type.Optional(Type.String()), selection: Type.Optional(Type.Object({ sheetName: Type.Optional(Type.String()), cellRange: Type.Optional(Type.String()), headerRow: Type.Optional(Type.Number()), yearRange: Type.Optional(Type.Object({ min: Type.Number(), max: Type.Number(), column: Type.Optional(Type.String()) })), numericColumns: Type.Optional(Type.Array(Type.String())), missingValues: Type.Optional(Type.Array(Type.Object({ column: Type.String(), values: Type.Array(Type.String()) }))), filters: Type.Optional(Type.Array(Type.Object({ column: Type.String(), op: Type.String(), values: Type.Array(Type.String()) }))) })) }),
    execute: async params => JSON.stringify(await prepareData(params)) }));
  if (submitAnalysisPlan) tools.push(wrapTool({ name: 'submit_analysis_plan', label: '提交实证分析方案', description: '保存待用户确认的具体分析步骤；提交不会执行。明确变量/模型/标准误和表图，修改后重新确认。', parameters: Type.Object({
    researchQuestion: Type.String(), objective: Type.String(), dataFile: Type.String(), dataDescription: Type.String(),
    dataSelection: Type.Optional(Type.Object({ sheetName: Type.Optional(Type.String()), cellRange: Type.Optional(Type.String()), headerRow: Type.Optional(Type.Number()), yearRange: Type.Optional(Type.Object({ min: Type.Number(), max: Type.Number(), column: Type.Optional(Type.String()) })), columns: Type.Optional(Type.Array(Type.String())), numericColumns: Type.Optional(Type.Array(Type.String(), { description: '明确指定转为数值的字段；只处理数字/空白/规范千分位，不擅自转换百分比或非法字符' })), missingValues: Type.Optional(Type.Array(Type.Object({ column: Type.String(), values: Type.Array(Type.String()) }))), filters: Type.Optional(Type.Array(Type.Object({ column: Type.String(), op: Type.String(), values: Type.Array(Type.String()) }))) })),
    paperType: Type.Optional(Type.String()), lengthRequirement: Type.Optional(Type.String()), missingDataPolicy: Type.String(), interpretationLimits: Type.String(),
    steps: Type.Array(Type.Object({ methodId: Type.Union(requireMethodIds().map(value => Type.Literal(value)), { description: '必须使用产品方法索引标识；名称未匹配不代表没有执行能力，不删改用户指定方法' }), label: Type.String(), purpose: Type.String(), specification: Type.String(), outputs: Type.Optional(Type.String()), required: Type.Optional(Type.Boolean()) })),
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
    parameters: Type.Object({ turnIds: Type.Optional(Type.Array(Type.String())), query: Type.Optional(Type.String()), offset: Type.Optional(Type.Number({ description: '长轮次的字符起点，按nextOffset分页读取' })) }),
    execute: async params => {
      const ids = (params?.turnIds || []).slice(0, 10);
      const query = String(params?.query || '').trim();
      const turns = readHistory().filter(turn => ids.length ? ids.includes(turn.id) : query ? turn.text.includes(query) : true).slice(-6);
      const offset = Math.max(0, Math.floor(Number(params.offset) || 0));
      const size = Math.min(4000, Math.floor(10000 / Math.max(1, turns.length)));
      return JSON.stringify(turns.map(turn => ({ id: turn.id, role: turn.role, status: turn.status, createdAt: turn.createdAt,
        text: String(turn.text || '').slice(offset, offset + size), offset, nextOffset: offset + size < String(turn.text || '').length ? offset + size : null })));
    },
  })];
}
