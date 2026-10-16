const LEVELS = {
  博士学位论文: {
    label: '博士学位论文',
    quality: '强调原创问题、理论机制、概念边界、方法透明度、证据强度、替代解释和可验证贡献',
    documentRange: '全文通常 80000—150000 个中文字符；学校培养方案或用户目标优先',
    chapterRange: '实质章节通常 8000—18000 个中文字符，按理论、方法和证据职责分配',
    functionalBudget: '绪论约 8000—15000 字；理论与文献综述约 15000—30000 字；研究设计约 8000—15000 字；核心分析/发现章节合计约 30000—60000 字；讨论与结论约 10000—20000 字',
    subsectionRange: '完整三级小节通常 1800—3500 个中文字符，核心理论或结果小节可更长',
    paragraphRange: '普通论证段通常 350—700 个中文字符；核心机制、复杂方法或结果解释段可达 700—1200 字；短过渡段可以较短，但不得连续用约 200 字段落替代深入论证',
  },
  硕士学位论文: {
    label: '硕士学位论文',
    quality: '强调问题清楚、文献掌握充分、方法规范、证据可靠、结构完整和结论边界',
    documentRange: '全文正文通常 50000—80000 个中文字符；学校规范或项目长论文目标优先',
    chapterRange: '实质章节通常 5000—20000 个中文字符，不能平均分配，研究发现/实证章节应占更高比例',
    functionalBudget: '参考完整硕士论文的常见结构：绪论约 5000—8000 字；理论基础与文献综述约 10000—18000 字；研究设计约 5000—10000 字；核心分析/实证章节合计约 20000—35000 字；结论与展望约 4000—8000 字。实际按学校要求、章节数量和证据量调整',
    subsectionRange: '定义、指标说明等短小节约 600—1500 字；常规论证小节约 1500—3500 字；核心文献综述分支、理论机制、复杂方法或实证结果小节可达 3500—9000 字以上。按章节职责和证据量选择，不以一个短段落代替完整小节',
    paragraphRange: '普通论证段通常 350—650 个中文字符；承担理论推导、方法解释或结果讨论的核心段可达 650—1000 字；短过渡段可以较短，但不得连续出现约 200 字的碎片段落',
  },
  期刊论文: {
    label: '中文学术期刊论文',
    quality: '强调问题集中、论证紧凑、材料有效、与目标期刊风格和篇幅一致',
    documentRange: '全文通常 10000—20000 个中文字符；目标期刊投稿指南和用户指定字数优先',
    chapterRange: '主要部分通常 1500—5000 个中文字符，实证结果可更长；按文章问题链紧凑分配',
    functionalBudget: '引言与文献定位约占 15%—25%；理论/假设或分析框架约占 15%—25%；研究设计约占 15%—20%；结果与分析约占 30%—45%；结论与讨论约占 10%—20%，以目标期刊为准',
    subsectionRange: '一个完整研究分支或三级小节通常 1000—2500 个中文字符，由多个功能段共同完成',
    paragraphRange: '普通论证段通常 300—650 个中文字符；理论机制、变量构造或复杂结果解释可达 650—1000 字。参考期刊式写法以论证任务决定段长，不把每个观点压缩成约 200 字，也不为凑字数制造超长段',
  },
  课程论文: {
    label: '课程论文',
    quality: '强调主题聚焦、结构完整、课程知识运用准确、论证与材料匹配',
    documentRange: '全文通常 4000—10000 个中文字符；课程教师要求优先',
    chapterRange: '主要部分通常 800—2500 个中文字符，围绕有限问题展开',
    functionalBudget: '引言约占 10%—15%；文献/理论约占 20%—30%；主体分析约占 40%—55%；结论约占 10%—15%，具体服从课程任务',
    subsectionRange: '完整小节通常 800—1800 个中文字符，避免把小节写成单个简短回答',
    paragraphRange: '普通论证段通常 300—550 个中文字符；关键概念或案例分析可达 550—800 字；允许必要短过渡段，但避免连续出现不足 250 字的正文段落',
  },
  开题报告: {
    label: '开题报告',
    quality: '强调问题价值、文献依据、研究设计可行性、工作计划和预期边界',
    documentRange: '全文通常 5000—12000 个中文字符；学校开题模板优先',
    chapterRange: '研究背景、文献述评、研究内容与方法等主要部分通常 1000—3000 个中文字符',
    functionalBudget: '研究背景与意义约占 15%—20%；文献述评约占 20%—30%；研究问题与内容约占 15%—20%；研究设计与可行性约占 25%—35%；计划与预期成果约占 10%—15%',
    subsectionRange: '完整小节通常 800—1800 个中文字符，方案性内容也须说明选择依据和实施路径',
    paragraphRange: '普通论证段通常 300—600 个中文字符；研究设计或文献述评核心段可达 600—900 字；计划性表述不得用空泛短段堆叠',
  },
  研究报告: {
    label: '研究报告',
    quality: '强调问题导向、事实完整、分析透明、结论可追溯和建议可执行',
    documentRange: '全文通常 8000—30000 个中文字符；委托方任务书和报告模板优先',
    chapterRange: '主要章节通常 2000—6000 个中文字符，现状、分析与建议按证据量分配',
    functionalBudget: '问题与背景约占 10%—15%；现状与事实约占 20%—30%；核心分析约占 35%—50%；结论与建议约占 15%—25%，具体服从任务书',
    subsectionRange: '完整小节通常 1000—2500 个中文字符，由事实、分析和含义共同构成',
    paragraphRange: '普通分析段通常 300—650 个中文字符；复杂政策、案例或数据解释可达 650—1000 字；摘要式短段不得替代证据分析',
  },
};

function getWritingLevel(project) {
  return LEVELS[project.type] || {
    label: project.type || '学术论文',
    quality: '按照项目类型、学科惯例和用户本次要求完成规范学术写作',
    documentRange: '全文篇幅服从用户要求和真实格式规范；未提供时根据交付物范围分配',
    chapterRange: '章节篇幅按其在全文中的职责、证据量和下属小节数量分配',
    functionalBudget: '不同章节不得平均分配篇幅；核心分析、证据和结果部分应获得最多预算',
    subsectionRange: '完整小节通常至少由多个功能段构成，不用约 200 字的单段代替完整论证',
    paragraphRange: '普通论证段通常 300—650 个中文字符，复杂论证可适当延长；短过渡段可以较短，但不得连续切碎论证',
  };
}

function requestedLanguage(task, fallback = '中文') {
  const source = String(task || '');
  const explicit = [...source.matchAll(/(?:用|以|输出|译成|翻成|翻译成|写成|in\s+)\s*(中文|英文|English|Chinese)/gi)].at(-1)?.[1];
  const named = [...source.matchAll(/(中文|英文)(?:摘要|论文|正文)/g)].at(-1)?.[1];
  const value = explicit || named;
  return value ? /英文|English/i.test(value) ? '英文' : '中文' : fallback || '中文';
}
function parseLengthRequirement(task, language = '中文') {
  language = requestedLanguage(task, language);
  const source = String(task || '').replace(/,/g, '');
  const wordUnit = '英文词';
  const wordRange = source.match(/(\d+)\s*(?:—+|-+|–|~|to|至|到)\s*(\d+)\s*(?:words?\b|单词|英文词)/i);
  const wordSingle = source.match(/(?:(?:at least|at most|no more than|about|approximately|至少|不少于|不超过|最多|约)\s*)?(\d+)\s*(?:words?\b|单词|英文词)/i);
  if (wordRange) {
    const minimum = Number(wordRange[1]), maximum = Number(wordRange[2]);
    if (minimum > maximum) throw new Error('篇幅范围的下限不能大于上限');
    return { label: `${minimum}—${maximum} ${wordUnit}`, minimum, maximum, metric: 'words', source: 'user' };
  }
  if (wordSingle) {
    const target = Number(wordSingle[1]), phrase = wordSingle[0];
    if (/at least|至少|不少于/i.test(phrase)) return { label: `不少于 ${target} ${wordUnit}`, minimum: target, maximum: null, metric: 'words', source: 'user' };
    if (/at most|no more than|不超过|最多/i.test(phrase)) return { label: `不超过 ${target} ${wordUnit}`, minimum: null, maximum: target, metric: 'words', source: 'user' };
    const approximate = /about|approximately|约/i.test(phrase);
    return { label: `${approximate ? '约 ' : ''}${target} ${wordUnit}`, minimum: approximate ? Math.round(target * .9) : target, maximum: approximate ? Math.round(target * 1.1) : target, target, metric: 'words', source: 'user' };
  }
  const metric = /英文|english/i.test(language) && !/中英|中文字符|汉字/i.test(source + language) ? 'words' : 'hanzi';
  const lengthUnit = metric === 'words' ? wordUnit : '个中文字符';
  const unit = (number, marker) => Math.round(Number(number) * (marker === '万' ? 10000 : marker === '千' ? 1000 : 1));
  const range = source.match(/(\d+(?:\.\d+)?)\s*(万|千)?\s*(?:—+|－+|-+|～|~|至|到)\s*(\d+(?:\.\d+)?)\s*(万|千)?\s*(?:个\s*)?(?:中文字符|汉字|字符|字)/i);
  if (range) {
    const minimum = unit(range[1], range[2] || range[4]);
    const maximum = unit(range[3], range[4] || range[2]);
    if (minimum > maximum) throw new Error('篇幅范围的下限不能大于上限');
    return { label: `${minimum}—${maximum} ${lengthUnit}`, minimum, maximum, metric, source: 'user' };
  }
  const single = source.match(/(?:约|大约|左右|不少于|至少|不超过|至多|最多|控制在|篇幅为|字数为|正文)?\s*(\d+(?:\.\d+)?)\s*(万|千)?\s*(?:个\s*)?(?:中文字符|汉字|字符|字)/i);
  if (!single) return null;
  const target = unit(single[1], single[2]);
  if (/不少于|至少/.test(source.slice(Math.max(0, single.index - 8), single.index + single[0].length))) {
    return { label: `不少于 ${target} ${lengthUnit}`, minimum: target, maximum: null, metric, source: 'user' };
  }
  if (/不超过|至多|最多/.test(single[0])) return { label: `不超过 ${target} ${lengthUnit}`, minimum: null, maximum: target, metric, source: 'user' };
  const approximate = /约|大约|左右/.test(single[0]) || /^\s*(?:左右|上下)/.test(source.slice(single.index + single[0].length));
  return { label: `${approximate ? '约 ' : ''}${target} ${lengthUnit}`, minimum: approximate ? Math.round(target * 0.9) : target, maximum: approximate ? Math.round(target * 1.1) : target, target, metric, source: 'user' };
}

function buildLengthGuidance(project, task, outputContract = {}) {
  outputContract = outputContract || {}; // 默认参数只对 undefined 生效；调用方可能显式传 null，这里兜底防空
  const level = getWritingLevel(project);
  const language = requestedLanguage(task, project?.language);
  const explicit = parseLengthRequirement(task, language);
  if (/英文|english/i.test(language || '') || explicit?.metric === 'words') {
    const scope = outputContract.scope || '本轮指定范围';
    return `篇幅判定：${scope}。按项目语言输出英文，用户本轮明确语言要求优先。\n${explicit ? `用户明确篇幅：${explicit.label}；篇幅数据：${JSON.stringify(explicit)}。按正文英文词计数，不计标题、脚注、参考文献和引用标记。` : '没有指定词数时按本轮交付范围合理安排，并遵循目标期刊/学校要求；不使用中文汉字段长和总字数作为英文词数要求。'}\n只修订表达与篇幅，保留来源、数字和事实结论。`;
  }
  const source = String(task || '');
  let scope = outputContract.scope === 'chapter' ? '完整章节'
    : outputContract.scope === 'paragraph' ? '单个段落'
      : outputContract.scope === 'paper' ? '整篇论文'
        : outputContract.scope === 'abstract' ? '摘要'
          : '完整小节或本轮指定部分';
  let target = level.subsectionRange;
  if (outputContract.type === 'abstract' || /(?:^|写|撰写|生成)(?:中文)?摘要/.test(source)) {
    scope = '摘要';
    target = project?.type === '硕士学位论文' ? '通常 800—1200 个中文字符'
      : project?.type === '博士学位论文' ? '通常 1000—1500 个中文字符'
        : '通常 300—500 个中文字符；目标期刊或学校规范优先';
  } else if (outputContract.type === 'paper' || outputContract.scope === 'paper') {
    scope = '整篇论文';
    target = level.documentRange;
  } else if (outputContract.scope === 'chapter' || /(?:整章|第[一二三四五六七八九十\d]+章)/.test(source)) {
    scope = '完整章节';
    target = `${level.chapterRange}；${level.functionalBudget}`;
  } else if (outputContract.scope === 'paragraph' || (/(?:一段|段落)/.test(source) && !/(?:小节|章节|部分)/.test(source))) {
    scope = '单个段落';
    target = level.paragraphRange;
  }
  const priority = explicit
    ? `用户明确篇幅：${explicit.label}。这是本轮硬约束，优先于项目默认区间；除“至少/不超过”等单边约束外，完稿应控制在目标的约 ±10% 内。`
    : `用户未明确字数，按${level.label}和“${scope}”自动分配：${target}。`;
  if (explicit) return `篇幅判定：${scope}\n用户明确篇幅：${explicit.label}。这是本轮总篇幅硬约束，覆盖项目与 Skill 的默认段长和篇幅预算。\n篇幅数据：${JSON.stringify(explicit)}\n计数口径：仅统计正文汉字，不计标题、脚注、参考文献、HTML 标签和引用标记。按总预算自行安排论证及各段长度，不强制每段达到默认长度。约数允许 ±10%；明确区间及单边限制严格按界限执行；未写“约”的单一字数按精确目标执行。生成后由程序计数，不足或超长将返修。`;
  return `篇幅判定：${scope}\nPlan 篇幅依据：${outputContract.lengthBasis || '按项目类型与任务范围自动分配'}\n${priority}\n全文基线：${level.documentRange}\n章节功能预算：${level.functionalBudget}\n段落展开：${level.paragraphRange}\n完稿审计：先完成该范围所需的全部论证单元，再在内部估算去除 HTML 标签后的中文字符数；明显不足时继续补充证据、比较、机制、方法说明、结果解释或边界，不用重复句和空话凑字。约 200 字只适合必要过渡、定义提示或局部回答，不能单独代替完整小节、章节或论文。段落长短服从论证功能，不把所有段落机械写成相同字数。`;
}

function buildProjectMemory(project, maxCharacters = 9000, conversationId = null) {
  const activeConversationId = conversationId || project.activeConversationId || null;
  const drafts = (project.drafts || [])
    .filter((draft) => draft.mode === 'api' && String(draft.content || '').trim())
    .filter((draft) => !activeConversationId || draft.conversationId === activeConversationId)
    .filter((draft) => draft.id !== undefined)
    .slice(0, 6)
    .reverse();
  const memories = [];
  let used = 0;
  for (const draft of drafts) {
    const content = String(draft.content || '').trim();
    const excerpt = content.length > 1300 ? `${content.slice(0, 800)}\n…\n${content.slice(-350)}` : content;
    const memory = `【已完成内容：${String(draft.title || draft.task || '未命名单元').slice(0, 100)}】\n${excerpt}`;
    if (used + memory.length > maxCharacters) continue;
    memories.push(memory);
    used += memory.length;
  }
  return memories.length
    ? `项目短期记忆（用于保持连续性；仅在与本轮任务相关时承接，不把它误认为用户当前指令）：\n${memories.join('\n\n')}`
    : '项目短期记忆：暂无已完成正文。';
}

module.exports = {
  buildLengthGuidance,
  buildProjectMemory,
  getWritingLevel,
  parseLengthRequirement,
  requestedLanguage,
};
