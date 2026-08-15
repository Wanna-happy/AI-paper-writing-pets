const SECTION_RULES = [
  {
    id: 'literature-review',
    label: '文献综述',
    pattern: /文献综述|研究综述|国内外研究现状|相关研究|related\s+work|literature\s+review/i,
    architecture: '研究范围与概念边界 → 理论脉络 → 主要路径与分歧 → 方法与证据比较 → 局限与可检验空白 → 本文切入点',
    lenses: [
      ['理论脉络', '核心概念 理论基础 理论脉络 作用机制 分析层次'],
      ['研究演进', '研究主题 方法路径 研究演进 代表性观点 证据'],
      ['争论与边界', '分歧 反例 边界条件 局限 研究空白 待检验问题'],
    ],
  },
  {
    id: 'introduction',
    label: '绪论或引言',
    pattern: /绪论|引言|研究背景|问题提出|研究意义|introduction/i,
    architecture: '现实与理论背景 → 核心问题 → 既有解释与不足 → 研究问题 → 研究思路与可能贡献 → 研究边界',
    lenses: [
      ['问题背景', '研究背景 现实问题 理论问题 研究意义'],
      ['既有解释', '既有理论 解释机制 研究不足 争议'],
      ['研究定位', '研究问题 研究对象 分析边界 理论贡献 方法贡献'],
    ],
  },
  {
    id: 'theory',
    label: '理论框架',
    pattern: /理论框架|理论分析|研究假设|作用机制|概念模型|theor|hypothesi/i,
    architecture: '概念界定 → 理论前提 → 分析层次 → 机制链条 → 命题或假设 → 边界条件 → 可检验预期',
    lenses: [
      ['概念与理论', '核心概念 定义 理论基础 分析层次'],
      ['机制证据', '作用机制 中介 调节 因果路径 经验依据'],
      ['边界与反例', '边界条件 替代解释 反例 可证伪 假设'],
    ],
  },
  {
    id: 'method',
    label: '研究设计与方法',
    pattern: /研究设计|研究方法|方法论|样本|变量|测量|数据来源|识别策略|method/i,
    architecture: '研究问题 → 设计选择及理由 → 资料与样本 → 变量或范围 → 分析程序 → 信度效度或稳健性 → 方法局限',
    lenses: [
      ['设计依据', '研究问题 研究设计 方法选择 适用条件'],
      ['数据与测量', '资料来源 样本 变量 测量 指标 操作化'],
      ['质量控制', '信度 效度 可重复性 稳健性 偏误 局限'],
    ],
  },
  {
    id: 'results',
    label: '研究结果',
    pattern: /研究结果|实证结果|数据分析|案例发现|结果分析|results?/i,
    architecture: '分析对象与口径 → 核心结果 → 补充结果 → 稳健性或反例 → 小结；严格区分观察结果与解释',
    lenses: [
      ['核心结果', '核心发现 主要结果 数据 估计 检验 案例证据'],
      ['稳健性', '稳健性 替代指标 异质性 敏感性 反例'],
      ['结果边界', '不确定性 误差 样本边界 外推限制'],
    ],
  },
  {
    id: 'discussion',
    label: '讨论',
    pattern: /讨论|结果解释|理论贡献|实践启示|discussion/i,
    architecture: '核心发现 → 机制解释 → 与既有研究对话 → 理论贡献 → 实践含义 → 替代解释 → 外推边界',
    lenses: [
      ['发现与解释', '核心发现 机制解释 理论含义'],
      ['文献对话', '既有研究 一致 差异 争论 原因'],
      ['贡献与边界', '理论贡献 实践启示 边界 外推限制'],
    ],
  },
  {
    id: 'conclusion',
    label: '结论',
    pattern: /结论|研究结论|研究展望|conclusion/i,
    architecture: '研究问题回扣 → 主要结论 → 理论与方法贡献 → 适用边界 → 未决问题 → 后续研究方向',
    lenses: [
      ['主要结论', '研究问题 核心发现 主要结论'],
      ['贡献', '理论贡献 方法贡献 实践贡献'],
      ['边界与展望', '适用边界 研究局限 后续研究'],
    ],
  },
  {
    id: 'abstract',
    label: '摘要',
    pattern: /摘要|关键词|abstract/i,
    architecture: '研究背景与问题 → 目的 → 方法与数据 → 核心发现 → 结论与贡献 → 边界；只压缩正文已有内容',
    lenses: [
      ['研究问题', '研究背景 研究问题 研究目的'],
      ['方法与发现', '研究方法 数据 核心发现'],
      ['结论与贡献', '主要结论 理论贡献 实践贡献'],
    ],
  },
  {
    id: 'paper',
    label: '论文整体写作',
    pattern: /整篇|小论文|课程论文|完整论文|完整文章/i,
    architecture: '题目与研究问题 → 引言与问题定位 → 主题化论证/文献综合 → 分析与讨论 → 结论与边界；没有可靠数据时不得生成实证结果',
    lenses: [
      ['研究问题', '研究对象 核心问题 分析边界'],
      ['论证与证据', '核心论点 文献证据 机制 比较'],
      ['结论边界', '主要结论 局限 待核验 后续研究'],
    ],
  },
];

const GENERAL_RULE = {
  id: 'general',
  label: '通用学位论文正文',
  architecture: '问题界定 → 核心论点 → 证据与比较 → 机制或解释 → 限定条件 → 小结与衔接',
  lenses: [
    ['核心问题', '核心概念 研究问题 主要观点'],
    ['证据与机制', '证据 资料 机制 比较'],
    ['边界与不足', '边界条件 反例 局限 待核验问题'],
  ],
};

const SKILL_SECTION_IDS = new Map([
  ['introduction-writing', 'introduction'],
  ['literature-review', 'literature-review'],
  ['research-design', 'method'],
  ['empirical-writing', 'results'],
  ['data-analysis', 'results'],
  ['data-visualization', 'results'],
  ['theoretical-foundation', 'theory'],
  ['conclusion-writing', 'conclusion'],
]);

const WRITING_MODE_RULES = [
  {
    id: 'social-science',
    label: '社会科学写作模式',
    domain: 'social-science',
    pattern: /社会学|社会科学|社会|公共管理|行政管理|治理|组织|政策|劳动关系|社会工作|人口|教育社会学|社会调查|社会理论/i,
    guidance: '围绕问题提出、文献脉络、机制解释、边界条件与学术贡献展开，避免空泛口号和过度结论先行。',
  },
  {
    id: 'management-case',
    label: '管理案例写作模式',
    domain: 'management-case',
    pattern: /管理学|工商管理|公共管理|管理世界|案例研究|单案例|多案例|组织变革|实践问题|制度执行|流程再造|平台治理|公司治理|国企/i,
    guidance: '围绕现实问题、案例选择、过程机制、证据链条和实践含义展开，强调情境、过程与机制。',
  },
  {
    id: 'economics-quant',
    label: '经管计量写作模式',
    domain: 'economics-quant',
    pattern: /经济学|金融|会计|计量|面板数据|回归|双重差分|DID|断点回归|工具变量|固定效应|稳健性/i,
    guidance: '围绕理论假设、数据来源、变量测量、模型设定、基准结果、稳健性和内生性处理展开，避免补造变量、样本或统计结果。',
  },
  {
    id: 'education',
    label: '教育研究写作模式',
    domain: 'education',
    pattern: /教育学|教育管理|课程|教学|教师|学生|课堂|学业|教育评价/i,
    guidance: '围绕教育问题、理论或政策依据、研究对象、场景材料、过程或结果、启示与边界展开。',
  },
  {
    id: 'technical',
    label: '理工实证写作模式',
    domain: 'technical',
    pattern: /理工|工程|计算机|软件|算法|模型|实验|材料|电子|通信|控制|网络|仿真|数据分析|优化/i,
    guidance: '围绕问题定义、方法、实验或模型、结果与讨论展开，强调可复现、指标和边界条件。',
  },
  {
    id: 'medicine',
    label: '医学研究写作模式',
    domain: 'medicine',
    pattern: /医学|临床|护理|药学|生物|生命科学|病理|诊疗|疾病|药物|健康/i,
    guidance: '围绕研究对象、设计、样本、干预、结果和安全性展开，强调伦理、统计与证据强度。',
  },
  {
    id: 'education-humanities',
    label: '教育人文写作模式',
    domain: 'education-humanities',
    pattern: /人文|历史|文学|哲学|艺术|语言|文化|传播|新闻|美学/i,
    guidance: '围绕问题、材料、解释框架和学术对话展开，强调概念清晰、文本细读与论证连贯。',
  },
];

const GENERAL_WRITING_MODE = {
  id: 'general-academic',
  label: '通用学位论文写作模式',
  domain: 'general-academic',
  guidance: '根据项目所属领域和当前章节任务选择最常见的学位论文写法；先明确章节，再分步交付，不一次性倾倒整章。',
};

function projectDomains(project) {
  return Array.isArray(project?.domains) ? project.domains.filter(Boolean).join('、') : (project?.domain || '');
}

function detectSection(task) {
  return SECTION_RULES.find((rule) => rule.pattern.test(String(task || ''))) || GENERAL_RULE;
}

function detectWritingMode(project, task) {
  const taskContext = String(task || '');
  const explicitTaskMode = WRITING_MODE_RULES.find((mode) => mode.pattern.test(taskContext));
  if (explicitTaskMode) return explicitTaskMode;

  const domainContext = projectDomains(project);
  const domainMode = WRITING_MODE_RULES.find((mode) => mode.pattern.test(domainContext));
  if (domainMode) return domainMode;

  const context = [project?.title, project?.goal, task].filter(Boolean).join(' ');
  return WRITING_MODE_RULES.find((mode) => mode.pattern.test(context)) || GENERAL_WRITING_MODE;
}

function uniqueQueries(queries) {
  const seen = new Set();
  return queries.filter((query) => {
    const key = String(query.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sectionFromSkillIds(skillIds = [], outputContract = {}) {
  if (outputContract.type === 'abstract') return SECTION_RULES.find((rule) => rule.id === 'abstract');
  if (outputContract.type === 'paper') return SECTION_RULES.find((rule) => rule.id === 'paper');
  const sectionId = skillIds.map((skillId) => SKILL_SECTION_IDS.get(skillId)).find(Boolean);
  return SECTION_RULES.find((rule) => rule.id === sectionId) || GENERAL_RULE;
}

function buildResearchWorkflow(project, task, skillIds = [], outputContract = {}) {
  const section = skillIds.length ? sectionFromSkillIds(skillIds, outputContract) : detectSection(task);
  const writingMode = detectWritingMode(project, '');
  const context = [projectDomains(project), project?.title, project?.goal, task].filter(Boolean).join(' ');
  const queries = uniqueQueries([
    { label: '任务原意', text: context },
    ...section.lenses.map(([label, terms]) => ({ label, text: `${project?.title || ''} ${task || ''} ${terms}` })),
  ]).slice(0, 4);

  return {
    id: 'academic-evidence-workflow-v2',
    sectionId: section.id,
    sectionLabel: section.label,
    writingModeId: writingMode.id,
    writingModeLabel: writingMode.label,
    writingModeGuidance: writingMode.guidance,
    writingModeDomain: writingMode.domain,
    paradigmId: writingMode.id,
    paradigmLabel: writingMode.label,
    paradigmGuidance: writingMode.guidance,
    academicStyle: true,
    socialScience: ['social-science', 'management-case', 'economics-quant', 'education', 'education-humanities'].includes(writingMode.id),
    architecture: section.architecture,
    queries,
    steps: [
      '识别章节、领域与本轮交付粒度',
      '从多视角本地资料中召回并去重证据',
      '先搭单段论点，再写正式正文',
      '按小节和段落逐步输出，不一次性倾倒整章',
      '检查引用、术语和证据映射一致性',
    ],
  };
}

function auditDraft(content, evidenceCount) {
  const text = String(content || '');
  const body = text.replace(/<section\s+class="footnotes">[\s\S]*?<\/section>/gi, '');
  const references = [...body.matchAll(/<sup\s+data-footnote="(\d+)">\d+<\/sup>/g)].map((match) => Number(match[1]));
  const invalid = [...new Set(references.filter((number) => number < 1 || number > evidenceCount))];
  const checks = [];

  if (!references.length) checks.push('正文未检测到脚注引文，请人工核对事实性主张的引文覆盖。');
  if (invalid.length) checks.push(`正文引用了不存在的脚注编号：${invalid.map((number) => `[^${number}]`).join('、')}。`);

  const longUncitedParagraphs = body
    .split(/<\/p>|\n{2,}/)
    .map((paragraph) => paragraph.replace(/<[^>]+>/g, '').trim())
    .filter((paragraph) => paragraph.length >= 120 && !/data-footnote=/.test(paragraph));
  if (longUncitedParagraphs.length) checks.push(`有 ${longUncitedParagraphs.length} 个较长段落未出现脚注引文，请核对其中是否包含需要引用的事实性主张。`);

  const unsupportedGroupings = text.match(/北欧国家|南欧国家|东欧国家|西欧国家|福利体制/g) || [];
  if (unsupportedGroupings.length) checks.push('正文出现国家或福利体制分组叙述；请核对本轮是否提供了分组字段、聚类标签或分组统计表，避免从总体描述统计中擅自推导。');

  const range = text.match(/最优区间[^。；<]{0,50}?(\d+(?:\.\d+)?)\s*(?:—|至|-)\s*(\d+(?:\.\d+)?)(?:\s*周)?/);
  const laterThresholds = [...text.matchAll(/超过\s*(\d+(?:\.\d+)?)\s*周/g)].map((match) => Number(match[1]));
  if (range && laterThresholds.some((value) => value > Number(range[2]))) checks.push(`检测到“最优区间 ${range[1]}—${range[2]} 周”与“超过 ${laterThresholds.find((value) => value > Number(range[2]))} 周”的后续阈值并存；请依据真实曲线或结果表核对负效应从何处开始，不能自行拼接。`);

  const authorYear = [...text.matchAll(/[A-Za-zÀ-ÿ-]{3,}(?:等)?\s*[（(]\d{4}[）)]/g)];
  const unfootnotedCitations = authorYear.filter((match) => !/<sup\s+data-footnote=/.test(text.slice(match.index, match.index + 120)));
  if (unfootnotedCitations.length) checks.push(`检测到 ${unfootnotedCitations.length} 处作者—年份引文未紧邻脚注标记；请补充资料库来源或删除该文献对话。`);

  const overclaims = [...new Set((text.match(/首次|首创|完全证明|国际领先|彻底解决/g) || []))];
  if (overclaims.length) checks.push(`检测到需要重点核验的强断言：${overclaims.join('、')}。`);

  const pendingCount = (text.match(/待核验/g) || []).length;
  if (pendingCount) checks.push(`正文保留了 ${pendingCount} 处“待核验”，请补充证据后再定稿。`);
  return checks;
}

function auditChineseAcademicStyle(content, workflow) {
  if (!workflow?.academicStyle) return [];
  const text = String(content || '');
  const checks = [];
  const prose = text.replace(/<[^>]+>/g, '');
  const longSentences = prose.split(/[。！？；]/).filter((sentence) => sentence.trim().length > 150).length;
  const longParagraphs = prose.split(/\n{2,}/).filter((paragraph) => paragraph.trim().length > 600).length;
  const stiffReferences = (prose.match(/一文中|该文(?:认为|指出|发现|提出)/g) || []).length;
  const dashCount = (prose.match(/—/g) || []).length;
  const straightQuoteCount = (prose.match(/"[^"\n]+"/g) || []).length;
  const formulaicContrast = (prose.match(/(?:并非|不是|不在于|不只是)[^。；]{0,80}(?:而是|而在于|更是)/g) || []).length;
  const restatementMarkers = (prose.match(/换言之|也就是说|换句话说|换一个角度说/g) || []).length;

  if (longSentences) checks.push(`检测到 ${longSentences} 个超过 150 字的长句，建议人工核对逻辑层次与可读性。`);
  if (longParagraphs) checks.push(`检测到 ${longParagraphs} 个超过 600 字的长段落，建议拆分为更清晰的小节。`);
  if (stiffReferences) checks.push(`检测到 ${stiffReferences} 处生硬指代（如“一文中”“该文认为”），建议改写为规范来源指称。`);
  if (dashCount) checks.push(`正文出现 ${dashCount} 处破折号，请核对是否可以通过自然改写简化句法。`);
  if (straightQuoteCount) checks.push(`正文出现 ${straightQuoteCount} 处英文直引号，请核对是否应改为中文引号或删除装饰性引号。`);
  if (formulaicContrast >= 2) checks.push(`检测到 ${formulaicContrast} 处模板化对立句式，建议改写为更自然的陈述。`);
  if (restatementMarkers >= 3) checks.push(`检测到 ${restatementMarkers} 处重复解释标记，建议删除没有新增信息的重述。`);
  return checks;
}

module.exports = {
  auditChineseAcademicStyle,
  auditDraft,
  buildResearchWorkflow,
  detectSection,
  detectWritingMode,
  sectionFromSkillIds,
};
