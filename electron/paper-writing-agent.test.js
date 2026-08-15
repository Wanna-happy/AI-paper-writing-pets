const assert = require('assert');
const { createAgentRoutingPrompt, createPaperWritingAgentPrompt } = require('./paper-writing-agent');

const prompt = createPaperWritingAgentPrompt({ type: 'paper', deliverable: '完整课程论文', language: 'zh-CN' });
assert(prompt.includes('本轮强制输出契约'));
assert(prompt.includes('不输出 Markdown'));
assert(prompt.includes('严禁编造调查年份、数据来源、样本量'));
assert(prompt.includes('系数、显著性、稳健性、研究发现'));
assert(prompt.includes('不得用摘要替代'));
assert(prompt.includes('完整课程论文'));
assert(prompt.includes('不是若干段待拼接的正文'));
assert(prompt.includes('禁止按 Skill 顺序分别生成内容后机械拼接'));
assert(prompt.includes('统一完成一次生成'));
assert(prompt.includes('毕业论文 HTML 输出契约'));
assert(prompt.includes('h1 只表示章级/一级标题'));
assert(prompt.includes('即使本轮只生成一个二级或三级小节'));
assert(prompt.includes('table-title'));
assert(prompt.includes('学校/项目提供的真实格式规范优先'));
assert(prompt.includes('Word 导出层处理'));
assert(prompt.length < 6000);

const routingPrompt = createAgentRoutingPrompt([
  { id: 'academic-writing-core', description: '通用规则' },
  { id: 'empirical-writing', description: '实证写作' },
  { id: 'data-analysis', description: '数据分析' },
]);
assert(routingPrompt.includes('skillIds'));
assert(routingPrompt.includes('empirical-writing'));
assert(routingPrompt.includes('data_analysis'));
assert(routingPrompt.includes('写一篇论文/小论文/课程论文'));
assert(routingPrompt.includes('"deliverable"'));
assert(routingPrompt.includes('现有研究脉络'));
assert(routingPrompt.includes('先从真实文献归纳研究问题/任务分支'));
assert(routingPrompt.includes('不预设“理论脉络”或通用目录'));

console.log('paper writing agent test passed');
