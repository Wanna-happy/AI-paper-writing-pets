const PLAN_INTENTS = new Set(['write', 'revise', 'analyze', 'clarify', 'outline', 'diagnose']);
const TOOL_NAMES = new Set(['data_analysis', 'mechanism_diagram']);
const CHART_TYPES = new Set(['auto', 'histogram', 'scatter', 'bar', 'correlation']);
const OUTPUT_TYPES = new Set(['paper', 'section', 'abstract', 'outline', 'analysis', 'revision', 'question']);
const OUTPUT_SCOPES = new Set(['paper', 'chapter', 'subsection', 'paragraph', 'abstract', 'other']);

function text(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function extractJson(value) {
  const source = String(value || '').trim();
  if (source.startsWith('{') && source.endsWith('}')) return source;
  const match = source.match(/\{[\s\S]*\}/);
  return match?.[0] || '';
}

function validateTool(value, attachments = []) {
  if (value == null) return null;
  if (!value || typeof value !== 'object' || !TOOL_NAMES.has(value.name)) throw new Error('计划包含未授权工具');
  if (value.name === 'data_analysis') {
    const dataFile = text(value.dataFile, 260);
    const available = attachments.some((attachment) => attachment.name === dataFile && ['.csv', '.xlsx'].includes(String(attachment.extension || '').toLowerCase()));
    if (!available) throw new Error('计划指定的数据文件不存在或格式不受支持');
    return {
      name: 'data_analysis',
      dataFile,
      chartType: CHART_TYPES.has(value.chartType) ? value.chartType : 'auto',
      x: text(value.x, 120),
      y: text(value.y, 120),
      title: text(value.title, 100),
    };
  }
  const nodes = Array.isArray(value.nodes) ? value.nodes.map((item) => text(item, 40)).filter(Boolean).slice(0, 8) : [];
  const edges = Array.isArray(value.edges) ? value.edges.filter((edge) => Array.isArray(edge) && edge.length >= 2 && edge.every(Number.isInteger)).slice(0, 12) : [];
  if (nodes.length < 2) throw new Error('机制图计划至少需要两个节点');
  return { name: 'mechanism_diagram', title: text(value.title, 100) || '研究机制图', nodes, edges };
}

function fallbackPlan(fallbackQuery, fallbackSkillIds = ['academic-writing-core']) {
  return {
    intent: 'write',
    skillIds: fallbackSkillIds,
    needsProjectSources: true,
    queries: [{ label: '任务原意', text: text(fallbackQuery, 500) }].filter((query) => query.text),
    tool: null,
    outputContract: { type: 'section', deliverable: text(fallbackQuery, 200) || '完成用户本轮要求', scope: 'other', lengthBasis: '按项目类型与任务范围自动分配', language: 'zh-CN' },
    fallback: true,
  };
}

function parseAgentPlan(content, { fallbackQuery = '', attachments = [], allowedSkillIds = [], fallbackSkillIds = ['academic-writing-core'] } = {}) {
  try {
    const raw = JSON.parse(extractJson(content));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('计划必须是对象');
    if (!PLAN_INTENTS.has(raw.intent)) throw new Error('计划 intent 无效');
    if (!Array.isArray(raw.skillIds) || !raw.skillIds.length) throw new Error('计划 skillIds 必须是非空数组');
    const skillIds = [...new Set(raw.skillIds.map((skillId) => text(skillId, 80)).filter(Boolean))];
    if (!skillIds.includes('academic-writing-core')) throw new Error('计划必须包含 academic-writing-core');
    if (skillIds.length > 4) throw new Error('计划 Skill 数量不能超过四个');
    if (allowedSkillIds.length && skillIds.some((skillId) => !allowedSkillIds.includes(skillId))) throw new Error('计划包含未注册 Skill');
    if (typeof raw.needsProjectSources !== 'boolean') throw new Error('计划 needsProjectSources 必须是布尔值');
    if (!Array.isArray(raw.queries)) throw new Error('计划 queries 必须是数组');
    if (raw.tool !== null && (typeof raw.tool !== 'object' || Array.isArray(raw.tool))) throw new Error('计划 tool 必须是对象或 null');
    if (!raw.outputContract || typeof raw.outputContract !== 'object' || Array.isArray(raw.outputContract)) throw new Error('计划 outputContract 必须是对象');
    if (!OUTPUT_TYPES.has(text(raw.outputContract.type, 40))) throw new Error('计划 outputContract.type 无效');
    if (!text(raw.outputContract.deliverable, 200)) throw new Error('计划 outputContract.deliverable 不能为空');
    if (!OUTPUT_SCOPES.has(text(raw.outputContract.scope, 40))) throw new Error('计划 outputContract.scope 无效');
    if (!text(raw.outputContract.lengthBasis, 200)) throw new Error('计划 outputContract.lengthBasis 不能为空');
    if (!text(raw.outputContract.language, 20)) throw new Error('计划 outputContract.language 不能为空');
    const queries = (Array.isArray(raw.queries) ? raw.queries : [])
      .map((query, index) => text(typeof query === 'string' ? query : query?.text, 500))
      .filter(Boolean)
      .slice(0, 4)
      .map((query, index) => ({ label: `Agent 检索 ${index + 1}`, text: query }));
    const requestedPaper = !/(?:摘要|abstract)/i.test(fallbackQuery)
      && /(?:写|撰写|完成|生成|创作)[^。！？]{0,80}(?:小论文|课程论文|完整论文|整篇论文|一篇论文|一篇文章)/i.test(fallbackQuery);
    const outputType = requestedPaper ? 'paper' : text(raw.outputContract.type, 40);
    const deliverable = requestedPaper && text(raw.outputContract.type, 40) === 'abstract'
      ? '按用户要求完成整篇论文；资料不足时交付完整论文蓝图与可安全撰写的概念性正文，不得用摘要替代'
      : text(raw.outputContract.deliverable, 200);
    return {
      intent: raw.intent,
      skillIds,
      needsProjectSources: raw.needsProjectSources,
      queries: queries.length ? queries : fallbackPlan(fallbackQuery, fallbackSkillIds).queries,
      tool: validateTool(raw.tool, attachments),
      outputContract: {
        type: outputType,
        deliverable,
        scope: outputType === 'paper' ? 'paper' : outputType === 'abstract' ? 'abstract' : text(raw.outputContract.scope, 40),
        lengthBasis: text(raw.outputContract.lengthBasis, 200),
        language: text(raw.outputContract.language, 20),
      },
      fallback: false,
    };
  } catch (error) {
    return { ...fallbackPlan(fallbackQuery, fallbackSkillIds), validationError: error.message };
  }
}

module.exports = { OUTPUT_SCOPES, PLAN_INTENTS, parseAgentPlan, validateTool };
