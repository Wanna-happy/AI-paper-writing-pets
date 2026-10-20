const LONG_THESIS_WORDS = 40000;

const DEFAULT_CHAPTERS = [
  ['第一章 绪论', 6000, '界定问题、范围、研究问题、研究思路与贡献'],
  ['第二章 文献综述', 9000, '按主题、理论路径、分歧和缺口综合文献，导向本文切入点'],
  ['第三章 理论基础与分析框架', 6000, '界定概念，说明机制、命题或分析框架及边界'],
  ['第四章 研究设计', 6500, '说明资料、样本、变量或编码、方法、质量控制与伦理'],
  ['第五章 研究发现或实证结果', 13000, '呈现并解释核心证据、补充结果、稳健性或反例'],
  ['第六章 讨论', 5500, '回到理论与文献，解释机制、贡献、适用边界与含义'],
  ['第七章 结论与展望', 4000, '回答研究问题，归纳发现、贡献、局限与后续问题'],
];

const CHAPTER_SECTION_IDS = [
  ['introduction'],
  ['literature-review'],
  ['theory'],
  ['method'],
  ['results'],
  ['discussion'],
  ['conclusion'],
];

function text(value) {
  return String(value || '').trim();
}

function normalizeViewpoints(value) {
  const values = Array.isArray(value) ? value : text(value).split(/\r?\n|[；;](?=\s*(?:\d+[.、]|[-•]))/);
  return values.map((item) => text(typeof item === 'object' ? item.statement : item).replace(/^(?:[-•]|\d+[.、])\s*/, '')).filter(Boolean).map((statement, index) => ({
    id: `V${index + 1}`,
    statement,
  }));
}

function normalizeThesisProfile(value = {}) {
  const targetWords = Number(value.targetWords) || 50000;
  const outline=normalizeOutline(value.outline);
  if(value.outlineConfirmed===true&&!outline.length)throw new Error('请先添加章节，再确认论文目录');
  return {
    targetWords: Math.min(1000000,Math.max(1000, Number.isFinite(targetWords)?targetWords:50000)),
    researchQuestion: text(value.researchQuestion),
    viewpoints: normalizeViewpoints(value.viewpoints),
    methodology: text(value.methodology),
    researchType: require('./research-design').TYPES[value.researchType] ? value.researchType : '',
    outline,
    outlineConfirmed: value.outlineConfirmed === true,
    dataMaterials: text(value.dataMaterials),
    analysisGoal: text(value.analysisGoal),
    schoolOrJournal: text(value.schoolOrJournal),
  };
}

const SECTIONS = ['introduction','literature-review','theory','method','results','discussion','conclusion','abstract','references','general'];
function normalizeOutline(value) {
  if (!Array.isArray(value)) return [];
  if (value.length > 40) throw new Error('目录最多支持40章，请按章节组织小节');
  const seen = new Set();
  return value.map((chapter,index) => {
    const id = text(chapter.id) || `outline-${index+1}`;
    if (!/^[\w-]{1,80}$/.test(id) || seen.has(id)) throw new Error('章节标识无效或重复，请重新编辑目录');
    seen.add(id);
    const title=text(chapter.title).slice(0,120);
    if(!title) throw new Error('目录中的章节标题不能为空');
    return { id, title, targetWords: Math.min(1000000,Math.max(0,Number(chapter.targetWords)||0)), purpose:text(chapter.purpose).slice(0,1000),
      sectionIds:[...new Set((chapter.sectionIds||[]).filter(s=>SECTIONS.includes(s)))],
      status:'planned',generatedWords:0 };
  });
}

function supportsAssembly(project) { return !!project; }
function defaultTargetWords(type) { return ({'课程论文':6000,'开题报告':6000,'期刊论文':10000,'研究报告':12000,'博士学位论文':80000})[type]||50000; }
function plainWords(content) { return text(content).replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/g,' ').replace(/\s/g,'').length; }

function isLongThesis(project) {
  const profile = normalizeThesisProfile(project?.thesisProfile);
  return !!project?.type && profile.targetWords >= LONG_THESIS_WORDS;
}

function missingRequirements(project) {
  const profile = normalizeThesisProfile(project?.thesisProfile);
  const missing = [];
  if (!profile.researchQuestion) missing.push('研究问题与研究对象边界');
  if (!profile.viewpoints.length) missing.push('用户希望论文坚持或检验的核心观点');
  if (!profile.methodology) missing.push('研究方法及选择理由');
  if (!profile.dataMaterials) missing.push('可使用的数据、文献、访谈、案例或文本材料');
  if (!profile.schoolOrJournal) missing.push('学校/学院模板、导师要求或目标期刊规范');
  const documents = project?.documents || [];
  if (!documents.some((document) => document.status === 'parsed' && text(document.text))) missing.push('至少一份已成功解析、可供引用的核心文献或研究材料');
  if (['survey','quantitative','mixed'].includes(require('./research-design').researchDesign(project).id)
    && !documents.some((document) => ['.csv', '.xlsx'].includes(document.extension))) {
    missing.push('实际数据文件（CSV/XLSX）及对应数据字典');
  }
  missing.push(...require('./research-design').methodPreflight(project).blockers);
  return missing;
}

function buildChapterPlan(project) {
  const profile = normalizeThesisProfile(project?.thesisProfile);
  if (profile.outlineConfirmed && profile.outline.length) return profile.outline;
  const ratio = profile.targetWords / 50000;
  const design=require('./research-design').researchDesign(project);
  const plan=DEFAULT_CHAPTERS.map(([title, baselineWords, purpose], index) => ({
    id: `chapter-${index + 1}`,
    title,
    targetWords: Math.round((baselineWords * ratio) / 100) * 100,
    purpose,
    status: 'planned',
    generatedWords: 0,
    sectionIds: CHAPTER_SECTION_IDS[index],
    evidenceNeeds: index === 1
      ? '已解析的核心文献及其主题、观点、方法与分歧'
      : index === 3
        ? '真实数据/材料、样本或个案口径、方法步骤与质量控制信息'
        : index === 4
          ? '真实分析结果、图表、访谈/案例证据或待验证结果'
          : '与本章主张直接相关的文献或用户提供材料',
  }));
  if(design.id==='case'){plan[3].title='第四章 研究设计与案例背景';plan[4].title='第五章 案例分析与研究发现';}
  if(design.id==='survey'){plan[3].title='第四章 问卷设计与数据来源';plan[4].title='第五章 统计分析与研究结果';}
  if(project?.type==='开题报告')return plan.slice(0,4).concat({id:'chapter-plan',title:'研究计划与进度安排',targetWords:1000,purpose:'计划而非已完成结果',sectionIds:['general'],status:'planned',generatedWords:0});
  return plan;
}

function resolveThesisChapter(project, draftOrWorkflow = {}, { task='', conversationId=project?.activeConversationId } = {}) {
  const control = ensureThesisControl(project);
  const workflow = draftOrWorkflow.workflow || draftOrWorkflow;
  const sectionId = text(workflow.sectionId);
  const section = text(workflow.section);
  const explicitId=draftOrWorkflow.thesisUnit?.chapterId || workflow.chapterId;
  if(explicitId)return control.chapters.find(c=>c.id===explicitId)||null;
  const chapterNumber=value=>{const raw=String(value).match(/第([一二三四五六七八九十百\d]+)章/)?.[1];if(!raw)return null;if(/^\d+$/.test(raw))return Number(raw);const digits='零一二三四五六七八九';if(raw.includes('十')){const [a,b]=raw.split('十');return (a?digits.indexOf(a):1)*10+(b?digits.indexOf(b):0);}return digits.indexOf(raw);};
  const requestedNumber=chapterNumber(task);
  const named=control.chapters.filter(c=>task.includes(c.title)||section&&c.title===section||requestedNumber!==null&&chapterNumber(c.title)===requestedNumber);
  if(named.length===1)return named[0];
  if(sectionId&&sectionId!=='general') {
    const matches=control.chapters.filter(c=>c.sectionIds?.includes(sectionId));
    if(matches.length===1)return matches[0];
  }
  if(/继续|这一节|这节|本节|上一节|该节|修改|润色|重写/.test(task)) {
    const active=control.activeUnits?.[conversationId];
    const recent=(project.drafts||[]).find(d=>d.mode==='api'&&(!conversationId||d.conversationId===conversationId)&&d.thesisUnit?.chapterId);
    const id=active?.chapterId||recent?.thesisUnit?.chapterId;
    return control.chapters.find(c=>c.id===id)||null;
  }
  return null;
}

function normalizeUnitKey(value) {
  return text(value)
    .toLowerCase()
    .replace(/[\s，。、“”‘’"'：:（）()【】\[\]#]/g, '')
    .replace(/^(请|帮我|继续|续写|撰写|写作|生成|完成|修改|润色|完善)+/, '')
    .slice(0, 100);
}

function createThesisUnit(project, workflow, task, { conversationId=project?.activeConversationId } = {}) {
  const chapter = resolveThesisChapter(project, workflow, { task, conversationId });
  if(workflow.sectionId==='paper'&&!chapter)return {id:`whole-${conversationId||'project'}`,chapterId:'whole-document',chapterTitle:'全文',title:text(task).slice(0,80),sequence:1};
  if (!chapter) return null;
  const recentUnit = (project?.drafts || []).find((draft) => draft.mode === 'api' && (!conversationId||draft.conversationId===conversationId) && draft.thesisUnit?.chapterId === chapter.id && /修改|润色|完善|改写|重写|上一版/.test(text(task)));
  if (recentUnit?.thesisUnit) return { ...recentUnit.thesisUnit, revisedFrom: recentUnit.id };
  const sequence = Math.max(0, ...(project?.drafts || [])
    .filter((draft) => draft.thesisUnit?.chapterId === chapter.id)
    .map((draft) => Number(draft.thesisUnit.sequence) || 0)) + 1;
  return {
    id: `${chapter.id}:${sequence}:${normalizeUnitKey(task) || 'unit'}`,
    chapterId: chapter.id,
    chapterTitle: chapter.title,
    title: text(task).slice(0, 80) || `第 ${sequence} 个写作单元`,
    sequence,
  };
}

function ensureThesisControl(project) {
  const profile = normalizeThesisProfile(project?.thesisProfile);
  const existing = project?.thesisControl || {};
  const proposed=buildChapterPlan({ ...project, thesisProfile: profile });
  const chapters = profile.outlineConfirmed && profile.outline.length
    ? proposed.map(c=>({...c,...Object.fromEntries(Object.entries(existing.chapters?.find(old=>old.id===c.id)||{}).filter(([key])=>['status','generatedWords'].includes(key)))}))
    : existing.chapters?.length ? existing.chapters.map((chapter,index)=>({...chapter,sectionIds:chapter.sectionIds||CHAPTER_SECTION_IDS[index]||[]})) : proposed;
  return {
    version: 2,
    status: existing.status || 'planning',
    profile,
    chapters,
    literatureMatrix: existing.literatureMatrix || [],
    outlineConfirmed: profile.outlineConfirmed,
    activeUnits: existing.activeUnits || {},
    updatedAt: existing.updatedAt || null,
  };
}

function buildReadinessDraft(project) {
  const profile = normalizeThesisProfile(project?.thesisProfile);
  const missing = missingRequirements(project);
  const plan = buildChapterPlan(project);
  const resourceHints = /定量|计量|回归|面板|问卷|实验/i.test(profile.methodology)
    ? ['原始或可导出的数据文件（CSV/XLSX）与数据字典', '因变量、核心自变量、控制变量及编码说明', '样本筛选、缺失值处理、拟用统计方法与希望检验的关系']
    : /访谈|田野|质性|案例|文本|内容分析/i.test(profile.methodology)
      ? ['访谈提纲/记录、观察记录、案例或文本材料', '对象/文本的纳入与排除范围、时间和地点边界', '编码或分析步骤、匿名与伦理处理说明']
      : ['可使用的核心文献与已有材料', '研究对象、范围、方法和材料来源', '学校模板、导师要求或目标期刊规范'];
  const rows = plan.map((chapter) => `| ${chapter.title} | 约 ${chapter.targetWords} 字 | ${chapter.purpose} | ${chapter.evidenceNeeds} |`).join('\n');
  const draft = {
    title: `${profile.targetWords} 字论文研究台账`,
    task: `建立${project.type||'论文'}研究台账`,
    mode: 'thesis-readiness',
    content: `# 5 万字论文总控台账\n\n系统将把论文拆成可组装的章节与小节，而不是一次生成全文。每一轮生成都会携带已确认的研究问题、用户观点、方法、材料口径与章节职责；缺失信息不会被模型补造。\n\n## 当前必须确认\n\n${missing.length ? missing.map((item, index) => `${index + 1}. ${item}`).join('\n') : '资料已达到启动论证蓝图的最低要求。'}\n\n请在“编辑项目”的**长论文档案**中补齐，或直接在对话中按以上顺序提供。\n\n## 请准备的资源\n\n${resourceHints.map((item) => `- ${item}`).join('\n')}\n\n注意：分析目标可以说明“希望检验什么关系或机制”，不能要求系统制造显著性、阈值、正向/负向结果。\n\n## 建议章节与字数预算\n\n| 章节 | 目标字数 | 本章职责 | 生成前需要的主要资源 |\n| --- | ---: | --- | --- |\n${rows}\n\n合计约 ${profile.targetWords} 字。资料补齐后，系统先生成可确认的章节论证图与文献综述矩阵，再逐小节生成、质检、回写进度，最后按章节顺序组装全文。`,
    citations: [],
    mappings: [],
    checks: missing.length ? ['长论文资源未齐，不生成正文。'] : ['可开始生成章节论证图。'],
    thesisControl: { ...ensureThesisControl(project), status: missing.length ? 'awaiting-resources' : 'ready-for-blueprint' },
  };
  return {...draft,content:draft.content.replace(/5 万字/g,`${profile.targetWords} 字`).replace(/长论文档案/g,'研究档案与论文目录')};
}

function extractKeywords(statement) {
  const source = text(statement);
  const chineseRuns = source.match(/[\u4e00-\u9fff]{2,}/g) || [];
  const chineseTerms = chineseRuns.flatMap((run) => {
    const terms = [];
    for (let size = Math.min(4, run.length); size >= 2; size -= 1) {
      for (let index = 0; index <= run.length - size; index += 1) terms.push(run.slice(index, index + size));
    }
    return terms;
  });
  const latinTerms = source.match(/[A-Za-z]{4,}/g) || [];
  return [...new Set([...chineseTerms, ...latinTerms].filter((item) => !/^(本文|研究|通过|对于|以及|可以|应当)$/.test(item)))].slice(0, 24);
}

function auditViewpointAlignment(content, viewpoints) {
  const body = text(content);
  if (!viewpoints?.length) return ['用户观点台账为空：本轮无法核验核心主张是否来自用户确认。'];
  const unmatched = viewpoints.filter((viewpoint) => !extractKeywords(viewpoint.statement).some((keyword) => body.includes(keyword)));
  return unmatched.length
    ? [`以下用户观点未在本轮正文中检测到关键词承接：${unmatched.map((item) => item.id).join('、')}。若它们属于本节，应补充；若不属于本节，应在章节台账中说明。`]
    : [];
}

function auditParagraphLogic(content) {
  const paragraphs = text(content).split(/\n{2,}/).map((item) => item.replace(/^#+\s+.*$/gm, '').trim()).filter((item) => item.length >= 120);
  const checks = [];
  const short = paragraphs.filter((item) => item.length < 250);
  if (short.length) checks.push(`检测到 ${short.length} 个正式段落少于 250 字，请核对是否为完整的“论点—依据—分析—论尾”单元。`);
  const endingPattern = /(?:因此|由此|这表明|这意味着|进而|同时|然而|综上|从而|可见)[^。！？]{0,60}[。！？]?$|(?:边界|局限|条件)[^。！？]{0,45}[。！？]?$/;
  const noEnding = paragraphs.filter((item) => !endingPattern.test(item.slice(-100)));
  if (noEnding.length) checks.push(`有 ${noEnding.length} 个正式段落未检测到分析收束或衔接标记，请人工检查论尾是否回扣本段论点或引向下一段。`);
  return checks;
}

function updateThesisProgress(project, draft) {
  const control = ensureThesisControl(project);
  const latestByUnit = new Map();
  for (const candidate of project?.drafts || []) {
    if (candidate.mode !== 'api' || !text(candidate.content)) continue;
    const unitId = candidate.thesisUnit?.id || candidate.id;
    const existing = latestByUnit.get(unitId);
    if (!existing || new Date(candidate.updatedAt || 0) > new Date(existing.updatedAt || 0)) latestByUnit.set(unitId, candidate);
  }
  const generatedWordsByChapter = new Map();
  for (const candidate of latestByUnit.values()) {
    const chapter = control.chapters.find((item) => item.id === candidate.thesisUnit?.chapterId)
      || resolveThesisChapter(project, candidate)
      || control.chapters.find((item) => candidate.workflow?.section && item.title.includes(candidate.workflow.section));
    if (!chapter) continue;
    generatedWordsByChapter.set(chapter.id, (generatedWordsByChapter.get(chapter.id) || 0) + plainWords(candidate.content));
  }
  for (const chapter of control.chapters) {
    chapter.generatedWords = generatedWordsByChapter.get(chapter.id) || 0;
    chapter.status = chapter.generatedWords > 0 && (!chapter.targetWords || chapter.generatedWords >= chapter.targetWords) ? 'drafted' : chapter.generatedWords ? 'in-progress' : 'planned';
  }
  control.status = control.chapters.every((item) => item.status === 'drafted') ? 'ready-for-integration' : 'writing';
  control.updatedAt = new Date().toISOString();
  if(draft?.thesisUnit&&draft.conversationId)control.activeUnits={...control.activeUnits,[draft.conversationId]:{chapterId:draft.thesisUnit.chapterId,unitId:draft.thesisUnit.id,draftId:draft.id}};
  return control;
}

function buildThesisContext(project) {
  const control = ensureThesisControl(project);
  const profile = control.profile;
  const viewpoints = profile.viewpoints.map((item) => `- ${item.id}：${item.statement}`).join('\n') || '（尚未确认，不能生成长论文正文）';
  const chapters = control.chapters.map((item) => `- ${item.title}：目标约 ${item.targetWords} 字，已生成 ${item.generatedWords} 字，状态 ${item.status}；职责：${item.purpose}`).join('\n');
  return `长论文总控台账：\n- 目标字数：${profile.targetWords}\n- 研究问题：${profile.researchQuestion || '未确认'}\n- 方法：${profile.methodology || '未确认'}\n- 数据/材料：${profile.dataMaterials || '未确认'}\n- 分析目标：${profile.analysisGoal || '未确认'}\n- 学校/期刊规范：${profile.schoolOrJournal || '未确认'}\n\n用户确认的核心观点（不可替换为模型临时观点）：\n${viewpoints}\n\n章节进度：\n${chapters}\n\n本轮仅完成所要求的一个可组装单元。正文的核心判断必须承接相关用户观点；若需要提出用户未确认的新判断，应明确写为待检验的分析可能性，不能写成既定结论。`;
}

function buildAssemblyContext(project, maxCharacters = 9000) {
  const latestByUnit = new Map();
  for (const draft of project?.drafts || []) {
    if (draft.mode !== 'api' || !text(draft.content)) continue;
    const unitId = draft.thesisUnit?.id || draft.id;
    const existing = latestByUnit.get(unitId);
    if (!existing || new Date(draft.updatedAt || 0) > new Date(existing.updatedAt || 0)) latestByUnit.set(unitId, draft);
  }
  const drafts = [...latestByUnit.values()];
  const units = [];
  let used = 0;
  for (const draft of drafts.slice(0, 18).reverse()) {
    const content = text(draft.content);
    const excerpt = content.length > 900 ? `${content.slice(0, 520)}\n…\n${content.slice(-320)}` : content;
    const unit = `【已完成单元：${text(draft.title) || text(draft.task)}】\n${excerpt}`;
    if (used + unit.length > maxCharacters) continue;
    units.push(unit);
    used += unit.length;
  }
  return units.length
    ? `已完成正文片段（用于保持术语、论证顺序和前后衔接；不可与本轮内容机械重复）：\n${units.join('\n\n')}`
    : '尚无已完成正文片段；本轮须按章节职责建立可供后续承接的术语与论点。';
}

function buildAssembledThesis(project) {
  return require('./thesis-assembly').assemble(project);
}

module.exports = {
  defaultTargetWords,
  normalizeOutline,
  supportsAssembly,
  buildChapterPlan,
  auditParagraphLogic,
  auditViewpointAlignment,
  buildAssembledThesis,
  buildAssemblyContext,
  buildReadinessDraft,
  buildThesisContext,
  createThesisUnit,
  ensureThesisControl,
  isLongThesis,
  missingRequirements,
  normalizeThesisProfile,
  resolveThesisChapter,
  updateThesisProgress,
};
