// local-edit.js — UC-SKILL-02 段落级应用 Skill
//
// 用户成稿后只想改一段：在草稿编辑器选中段落，选择「润色 / 扩写 / 改实证风格」，
// 系统仅对选中文字重新生成，选区外内容与引用映射保持不变。
//
// 本模块只负责「给定一段文字 + 操作类型 → 返回改写后的 HTML 片段」，
// 不做选区定位与落盘（那些由前端 DOM 操作 + saveDraft 完成）。

const OPERATION_SKILLS = {
  polish: ['revision', 'academic-writing-core'],       // 润色：语言/规范打磨
  expand: ['academic-writing-core'],                   // 扩写：补论证
  empirical: ['empirical-writing', 'academic-writing-core'], // 改实证风格
};

const OPERATION_LABEL = { polish: '润色', expand: '扩写', empirical: '改为实证风格' };

const OPERATION_INSTRUCTION = {
  polish: '润色这段文字：在保持原意、论点、结构与引用标记不变的前提下，提升表达的专业性、流畅度与学术规范。',
  expand: '扩写这段文字：围绕原论点补充论证、解释或例证，使内容更充实；保持原意与引用标记不变。',
  empirical: '将这段文字改写为实证研究风格：强化对数据、变量、显著性、效应量等实证表述；保持原论点与引用标记不变。',
};

function buildSystemPrompt(operation, skillPrompt) {
  const instruction = OPERATION_INSTRUCTION[operation] || OPERATION_INSTRUCTION.polish;
  return `你是严谨的中文学术写作助手。用户会给你一段论文草稿中的文字，要求你只对这一段做局部修改。

操作要求：
${instruction}

硬性约束：
1. 只输出修改后的这段文字，用 HTML 片段呈现（段落用 <p> 包裹，可含 <strong>/<em>/<sup>），不要输出任何解释，不要用 markdown 代码块包裹。
2. 严格保留原文中的引用标记（形如 [E1]、[证据 E2] 等）与脚注标记，不要增删或改写它们。
3. 只改动这一段文字本身，不要补章节标题、不要接续新内容。${skillPrompt || ''}`;
}

async function applyLocalEdit({ skillRuntime, requestModel, project, selectedText, selectedHtml, operation }) {
  const skillIds = OPERATION_SKILLS[operation] || OPERATION_SKILLS.polish;
  const { prompt } = skillRuntime.composePrompt(project, selectedText, skillIds);
  const messages = [
    { role: 'system', content: buildSystemPrompt(operation, prompt) },
    { role: 'user', content: `请${OPERATION_LABEL[operation] || '润色'}下面这段文字（保留 HTML 脚注属性）：\n\n${selectedHtml || selectedText}` },
  ];
  const res = await requestModel({ scenario: 'writing', messages, options: { temperature: 0.25, maxTokens: 2400 } });
  const content = String(res?.content || '').trim();
  if (!content) throw new Error('模型未返回改写内容，已保留原文。');
  const marks = (value) => (String(value).match(/\bE\d+\b/g) || []).sort();
  if (JSON.stringify(marks(selectedText)) !== JSON.stringify(marks(content))) {
    throw new Error('改写改变了引用标记，已保留原文。');
  }
  const footnotes = value => [...String(value).matchAll(/data-footnote=["'](\d+)["']/g)].map(match => match[1]).sort();
  if (JSON.stringify(footnotes(selectedHtml || '')) !== JSON.stringify(footnotes(content))) throw new Error('改写改变了脚注，已保留原文。');
  return { content, operation, skillIds };
}

module.exports = { applyLocalEdit, OPERATION_SKILLS, OPERATION_LABEL };
