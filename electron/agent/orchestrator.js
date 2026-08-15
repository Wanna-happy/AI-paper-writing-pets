const { createAgentRoutingPrompt, createPaperWritingAgentPrompt } = require('../paper-writing-agent');
const { auditChineseAcademicStyle, auditDraft, buildResearchWorkflow } = require('../research-workflow');
const { buildLengthGuidance, buildProjectMemory, getWritingLevel } = require('../writing-session');
const {
  auditParagraphLogic,
  auditViewpointAlignment,
  buildAssemblyContext,
  buildThesisContext,
  createThesisUnit,
  isLongThesis,
  updateThesisProgress,
} = require('../thesis-controller');
const { evaluateRun } = require('../quality/evaluator');
const { parseAgentPlan } = require('./plan-schema');
const { AgentRunState } = require('./run-state');

function domains(project) {
  const values = Array.isArray(project?.domains) ? project.domains : [project?.domain].filter(Boolean);
  return values.length ? values.join('、') : '未分类';
}

function detectUnsupportedEmpiricalClaims(content, { hasEvidence = false, hasToolResult = false, hasAttachments = false } = {}) {
  if (hasEvidence || hasToolResult || hasAttachments) return [];
  const text = String(content || '').replace(/<[^>]+>/g, ' ');
  const patterns = [
    /(?:基于|采用|使用)\s*20\d{2}\s*年[^。]{0,80}(?:调查|数据库|数据)/,
    /(?:样本(?:量)?(?:为|共|达到)?|纳入|选取)\s*[0-9,，]+\s*(?:名|人|份|个|条|例|家)/,
    /(?:Logit|Probit|OLS|回归|DID|PSM|工具变量|中介|调节)[^。]{0,100}(?:显著|系数|稳健|正向|负向)/i,
    /研究(?:结果|发现)表明[^。]{0,120}(?:显著|促进|抑制|影响|效应|机制)/,
    /(?:p\s*[<=>]|置信区间|标准误|系数为|显著性水平)/i,
  ];
  return patterns.filter((pattern) => pattern.test(text)).map((pattern) => pattern.source);
}

class AgentOrchestrator {
  constructor({ workspaceStore, ragStore, providerRegistry, toolRegistry, skillRuntime, loadSettings, buildConversationFileContext, postProcessContent, emitStream, react, playCompletion }) {
    Object.assign(this, { workspaceStore, ragStore, providerRegistry, toolRegistry, skillRuntime, loadSettings, buildConversationFileContext, postProcessContent, emitStream, react, playCompletion });
  }

  async run({ projectId, request, signal }) {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    const run = {
      id: request.requestId,
      projectId,
      conversationId: request.conversationId || null,
      task: request.task,
      status: 'RECEIVED',
      startedAt,
      transitions: [],
    };
    const stateMachine = new AgentRunState(run.id, (transition, machine) => {
      run.status = machine.state;
      run.transitions = machine.transitions;
      this.workspaceStore.saveAgentRun(run);
    });
    run.transitions = stateMachine.transitions;
    this.workspaceStore.saveAgentRun(run);
    let plan = null;
    let retrieval = { hits: [], mode: '未调用', model: null, totalChunks: 0, queries: [] };
    let toolResult = null;
    const timings = {};
    try {
      stateMachine.move('VALIDATING');
      const workspace = this.workspaceStore.loadWorkspace();
      const project = workspace.projects.find((item) => item.id === projectId);
      if (!project) throw new Error('请先创建论文项目');
      const settings = this.loadSettings();
      const apiKey = this.workspaceStore.getApiKey(settings.api.keyMode, settings.api.provider);
      const task = String(request.task || '').trim();
      if (!apiKey) {
        stateMachine.move('CLARIFYING');
        const content = `<h1>写作任务草稿</h1><p>你希望完成：${task}</p><p>由于尚未配置 AI API，系统没有生成论文正文，也没有编造文献观点。请在设置中配置 API 后重试。</p>`;
        this.emitStream(request.requestId, content);
        stateMachine.move('SAVING');
        const draft = this.workspaceStore.saveDraft(projectId, { title: task.slice(0, 28) || '论文写作草稿', task, content, conversationId: request.conversationId, citations: [], mappings: [], checks: ['尚未配置 AI API，本次仅保存任务草稿。'], mode: 'local-draft' });
        stateMachine.move('COMPLETED');
        run.completedAt = new Date().toISOString();
        run.durationMs = Date.now() - startedMs;
        run.draftId = draft.id;
        this.workspaceStore.saveAgentRun(run);
        return draft;
      }

      const parsedDocuments = project.documents.filter((document) => document.status === 'parsed' && document.text);
      const conversationContext = this.buildConversationFileContext(request.attachments);
      const level = getWritingLevel(project);
      stateMachine.move('PLANNING');
      const planningStarted = Date.now();
      const planning = await this.providerRegistry.complete(settings.api.provider, apiKey, [
        { role: 'system', content: createAgentRoutingPrompt(this.skillRuntime.getCatalog()) },
        { role: 'user', content: `执行阶段：任务规划\n\n项目题目：${project.title || '未填写'}\n项目类型：${project.type || '未填写'}\n学科领域：${domains(project)}\n项目资料数量：${parsedDocuments.length}\n项目全文默认篇幅：${level.documentRange}\n项目章节默认篇幅：${level.chapterRange}\n项目小节默认篇幅：${level.subsectionRange}\n项目段落展开尺度：${level.paragraphRange}\n本轮工作文件：${conversationContext || '无'}\n用户本轮任务：${task}\n\n先明确本轮 scope 和 lengthBasis，再选择 Skill；只输出规定 JSON。` },
      ], { temperature: 0, maxTokens: 500, signal });
      timings.planningMs = Date.now() - planningStarted;
      plan = parseAgentPlan(planning.content, {
        fallbackQuery: task || project.title,
        attachments: request.attachments,
        allowedSkillIds: this.skillRuntime.getCatalog().map((skill) => skill.id),
        fallbackSkillIds: this.skillRuntime.fallbackSkillIds(task),
      });
      const skill = this.skillRuntime.composePrompt(project, task, plan.skillIds);
      const lengthGuidance = buildLengthGuidance(project, task, plan.outputContract);
      const dataAttachment = (request.attachments || []).find((attachment) => ['.csv', '.xlsx'].includes(String(attachment.extension || '').toLowerCase()));
      if (!plan.tool && dataAttachment && /(?:数据分析|实证|描述统计|相关|回归|图表|可视化|绘图|PDP|SHAP|阈值)/i.test(task)) {
        plan.tool = { name: 'data_analysis', dataFile: dataAttachment.name, chartType: 'auto', x: '', y: '', title: '' };
      }

      const researchWorkflow = buildResearchWorkflow(project, task, plan.skillIds, plan.outputContract);
      if (plan.needsProjectSources && parsedDocuments.length) {
        stateMachine.move('RETRIEVING');
        const retrievalStarted = Date.now();
        retrieval = await this.ragStore.retrieveMulti(project, plan.queries, 14);
        timings.retrievalMs = Date.now() - retrievalStarted;
      }
      if (plan.tool) {
        stateMachine.move('RUNNING_TOOL');
        const toolStarted = Date.now();
        toolResult = await this.toolRegistry.execute({ agentRunId: run.id, projectId, plan: plan.tool, attachments: request.attachments });
        timings.toolMs = Date.now() - toolStarted;
      }
      stateMachine.move('GENERATING');
      const evidenceContext = retrieval.hits.map((hit, index) => {
        const locator = hit.page ? `第 ${hit.page} 页` : `片段 ${hit.position}`;
        return `[证据 E${index + 1}] 文献：${hit.documentName}；位置：${locator}；知识块：${hit.id}\n${hit.text}`;
      }).join('\n\n');
      const thesisContext = isLongThesis(project) ? `${buildThesisContext(project)}\n\n${buildAssemblyContext(project)}` : '';
      const generationStarted = Date.now();
      const guardedGeneration = !retrieval.hits.length
        && !toolResult
        && !(request.attachments || []).length;
      const generated = await this.providerRegistry.stream(settings.api.provider, apiKey, [
        { role: 'system', content: createPaperWritingAgentPrompt(plan.outputContract) + skill.prompt },
        { role: 'user', content: `# 当前任务上下文\n\n## 项目长期记忆\n- 题目：${project.title}\n- 论文类型：${project.type}\n- 学科领域：${domains(project)}\n- 引用格式：${project.citationStyle}\n- 研究目标：${project.goal || '未填写'}\n- 全文默认篇幅：${level.documentRange}\n- 章节默认篇幅：${level.chapterRange}\n- 小节默认篇幅：${level.subsectionRange}\n- 段落展开尺度：${level.paragraphRange}\n\n${thesisContext}\n\n## 项目短期记忆\n${buildProjectMemory(project)}\n\n## 本轮任务\n${task}\n\n## 当前任务识别\n- 章节：${researchWorkflow.sectionLabel}\n- 写作模式：${researchWorkflow.writingModeLabel}\n- 推荐结构：${researchWorkflow.architecture}\n- 当前章节路径与全文编号：优先从用户本轮任务、长论文上下文和项目短期记忆中提取；无法确定时不臆造编号，并保持与已有标题层级兼容。\n\n## 本轮篇幅契约\n${lengthGuidance}\n\n## 格式依据\n按以下优先级统一格式化：用户本轮明确要求 > 项目资料中真实的学校/院系格式规范 > 通用毕业论文 HTML 契约。没有可核验的学校规范时使用通用契约，不猜测院校格式。\n\n## 本轮工作文件\n${conversationContext || '无'}\n\n## 可引用的项目资料（RAG）\n${evidenceContext || '本轮未检索到可引用资料，不得虚构引用。'}\n\n## 工具观察结果\n${toolResult ? (toolResult.error ? `工具未完成：${toolResult.error}` : `${toolResult.summary}\n字段：${(toolResult.columns || []).join('、')}\n生成文件：${(toolResult.files || []).join('、')}`) : '未调用工具'}\n\n把所有已加载 Skill 作为同一次写作的规则，完整实现本轮篇幅契约后，再统一审校和格式化，只输出最终 HTML 交付物。` },
      ], (delta) => { if (!guardedGeneration) this.emitStream(request.requestId, delta); }, { temperature: 0.25, maxTokens: 6500, signal });
      timings.generationMs = Date.now() - generationStarted;

      stateMachine.move('AUDITING');
      const processed = this.postProcessContent(generated.content, request.attachments, toolResult, retrieval.hits);
      const unsupportedEmpiricalClaims = detectUnsupportedEmpiricalClaims(processed, {
        hasEvidence: retrieval.hits.length > 0,
        hasToolResult: Boolean(toolResult && !toolResult.error),
        hasAttachments: Boolean((request.attachments || []).length),
      });
      if (unsupportedEmpiricalClaims.length) {
        throw new Error('模型在没有资料或工具结果的情况下生成了实证事实，系统已拒绝保存。请上传数据/文献，或要求生成不包含虚构结果的概念性论文。');
      }
      if (guardedGeneration) this.emitStream(request.requestId, processed);
      const checks = [
        ...(parsedDocuments.length === project.documents.length ? [] : ['部分资料尚未解析正文，未进入知识库。']),
        ...(retrieval.error ? [retrieval.error] : []),
        ...auditDraft(processed, retrieval.hits.length),
        ...auditChineseAcademicStyle(processed, researchWorkflow),
        ...(isLongThesis(project) ? auditViewpointAlignment(processed, project.thesisProfile?.viewpoints) : []),
        ...(isLongThesis(project) ? auditParagraphLogic(processed) : []),
      ];
      stateMachine.move('SAVING');
      const draft = this.workspaceStore.saveDraft(projectId, {
        title: task.slice(0, 28) || '论文写作结果', task, content: processed, conversationId: request.conversationId,
        attachments: (request.attachments || []).map(({ id, name, extension, size, previewDataUrl, scope }) => ({ id, name, extension, size, previewDataUrl, scope })),
        toolResult, citations: [...new Set(retrieval.hits.map((hit) => hit.documentName))],
        mappings: retrieval.hits.map((hit, index) => `E${index + 1} → ${hit.documentName}${hit.page ? `，第 ${hit.page} 页` : `，片段 ${hit.position}`}，知识块 ${hit.id}`),
        checks, mode: 'api', skill: skill.skill,
        workflow: { id: researchWorkflow.id, sectionId: researchWorkflow.sectionId, section: researchWorkflow.sectionLabel, writingMode: researchWorkflow.writingModeLabel, architecture: researchWorkflow.architecture, steps: researchWorkflow.steps, retrievalLenses: plan.queries.map((query) => query.label) },
        thesisUnit: isLongThesis(project) ? createThesisUnit(project, researchWorkflow, task) : null,
        retrieval: { mode: retrieval.mode, model: retrieval.model, totalChunks: retrieval.totalChunks, hitCount: retrieval.hits.length, queryCount: plan.queries.length },
      });
      if (isLongThesis(project)) this.workspaceStore.updateProject(projectId, { thesisControl: updateThesisProgress({ ...project, drafts: [...(project.drafts || []), draft] }, draft) });
      stateMachine.move('COMPLETED');
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - startedMs;
      run.draftId = draft.id;
      run.provider = settings.api.provider;
      run.model = this.providerRegistry.getDefinition(settings.api.provider).model;
      run.plan = plan;
      run.skill = skill.skill;
      run.quality = evaluateRun({ plan, retrieval, toolResult, draft, timings });
      this.workspaceStore.saveAgentRun(run);
      this.react('jumping', '主人，我写完啦！快看看，也夸夸我吧！', { celebrate: true, messageDuration: 6000 });
      this.playCompletion();
      return draft;
    } catch (error) {
      stateMachine.fail(error);
      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - startedMs;
      run.error = error.message;
      run.plan = plan;
      this.workspaceStore.saveAgentRun(run);
      throw error;
    }
  }
}

module.exports = { AgentOrchestrator, detectUnsupportedEmpiricalClaims };
