const assert = require('assert');
const {
  auditChineseAcademicStyle,
  auditDraft,
  buildResearchWorkflow,
  detectSection,
  detectWritingMode,
  sectionFromSkillIds,
} = require('./research-workflow');

assert.strictEqual(detectSection('撰写国内外文献综述').id, 'literature-review');
assert.strictEqual(detectSection('分析研究设计和样本选择').id, 'method');
assert.strictEqual(detectSection('写一段其他正文').id, 'general');

assert.strictEqual(detectWritingMode({ title: '平台劳动治理研究' }, '使用深度访谈').id, 'social-science');
assert.strictEqual(detectWritingMode({ title: '催化材料性能研究' }, '撰写实验结果').id, 'technical');
assert.strictEqual(detectWritingMode({ title: '某医院护理干预研究' }, '撰写方法').id, 'medicine');
assert.strictEqual(detectWritingMode({ domain: '经济学' }, '使用面板数据和固定效应模型').id, 'economics-quant');
assert.strictEqual(sectionFromSkillIds(['academic-writing-core', 'literature-review']).id, 'literature-review');
assert.strictEqual(sectionFromSkillIds(['academic-writing-core', 'data-analysis', 'data-visualization']).id, 'results');
assert.strictEqual(sectionFromSkillIds(['academic-writing-core']).id, 'general');
assert.strictEqual(sectionFromSkillIds(['academic-writing-core', 'thesis-planning'], { type: 'abstract' }).id, 'abstract');
assert.strictEqual(sectionFromSkillIds(['academic-writing-core', 'thesis-planning'], { type: 'paper' }).id, 'paper');
assert.strictEqual(sectionFromSkillIds(['academic-writing-core', 'thesis-planning'], { type: 'outline' }).id, 'general');

const workflow = buildResearchWorkflow(
  { title: '数字化转型机制研究', goal: '识别组织能力的中介作用', domains: ['管理学'] },
  '这部分继续处理一下',
  ['academic-writing-core', 'literature-review'],
);
assert.strictEqual(workflow.sectionId, 'literature-review');
assert.strictEqual(workflow.writingModeId, 'management-general');
assert(workflow.queries.length >= 3);
const external = require('./skills/research-adapter');
assert.strictEqual(sectionFromSkillIds([external.CORE_SKILL_ID, external.LEGACY_IDS['literature-review']]).id, 'literature-review');
assert.strictEqual(sectionFromSkillIds([external.CORE_SKILL_ID, external.WRITING_SKILL_ID]).id, 'results');
assert.strictEqual(buildResearchWorkflow({}, '撰写结论', [external.CORE_SKILL_ID]).sectionId, 'conclusion');

assert.deepStrictEqual(auditDraft('一个有证据的判断。<sup data-footnote="1">1</sup>', 2), []);
assert(auditDraft('首次完全证明。<sup data-footnote="3">3</sup>', 2).some((item) => item.includes('不存在')));
assert(auditDraft('首次完全证明。<sup data-footnote="3">3</sup>', 2).some((item) => item.includes('强断言')));
assert(auditDraft('北欧国家表现更高。<sup data-footnote="1">1</sup>', 2).some((item) => item.includes('分组叙述')));
assert(auditDraft('最优区间为 26—30 周。超过 40 周才出现负效应。', 2).some((item) => item.includes('最优区间')));
assert(auditDraft('Myrskylä等（2009）提出了相关解释。', 2).some((item) => item.includes('作者—年份')));
assert(auditChineseAcademicStyle('该文认为这一结论。——\n\n' + '很长'.repeat(320), workflow).length >= 2);
assert.deepStrictEqual(auditChineseAcademicStyle('规范正文。[E1]', { academicStyle: false }), []);

console.log('research workflow test passed');
