const assert = require('assert');
const { applyLocalEdit } = require('./agent/local-edit');
async function test() {
  const base = { skillRuntime: { composePrompt: () => ({ prompt: '' }) }, project: {}, selectedText: '原文[E1]与[E2]', operation: 'polish' };
  await assert.rejects(applyLocalEdit({ ...base, requestModel: async () => ({ content: '<p>丢失[E1]</p>' }) }), /引用标记/);
  await assert.rejects(applyLocalEdit({ ...base, requestModel: async () => ({ content: '<p>新增[E1][E2][E3]</p>' }) }), /引用标记/);
  const result = await applyLocalEdit({ ...base, requestModel: async () => ({ content: '<p>改写[E1]与[E2]</p>' }) });
  assert(result.content.includes('改写'));
  const footnoteBase = { ...base, selectedText: '原文1', selectedHtml: '原文<sup data-footnote="1">1</sup>' };
  await assert.rejects(applyLocalEdit({ ...footnoteBase, requestModel: async () => ({ content: '<p>改写1</p>' }) }), /脚注/);
  const footnoteResult = await applyLocalEdit({ ...footnoteBase, requestModel: async () => ({ content: '<p>改写<sup data-footnote="1">1</sup></p>' }) });
  assert(footnoteResult.content.includes('data-footnote'));
  const statistics = { ...base, selectedText: '系数0.12，结果不显著。[E1]', selectedHtml: '<p>系数0.12，结果不显著。[E1]</p>' };
  await assert.rejects(applyLocalEdit({ ...statistics, requestModel: async () => ({ content: '<p>系数9.99，结果显著。[E1]</p>' }) }), /数字|显著性/);
  await assert.rejects(applyLocalEdit({ ...statistics, requestModel: async () => ({ content: '<p>系数0.12，结果显著。[E1]</p>' }) }), /显著性/);
  const unchanged = await applyLocalEdit({ ...statistics, requestModel: async () => ({ content: '<p>结果不显著，系数0.12。[E1]</p>' }) });
  assert(unchanged.comparison.before.includes('0.12'));
  const { SkillRuntime } = require('./skills/skill-runtime');
  const runtime = new SkillRuntime();
  for (const operation of ['compress', 'restructure', 'translate']) {
    let prompt;
    const updated = await applyLocalEdit({ ...statistics, skillRuntime: runtime, operation,
      requestModel: async input => { prompt = input.messages[0].content; return { content: operation === 'translate' ? '<p>The coefficient is 0.12 and is not statistically significant.[E1]</p>' : '<p>系数0.12，不显著。[E1]</p>' }; } });
    assert.equal(updated.operation, operation);
    assert(updated.comparison.before.includes('0.12'));
    assert(prompt.includes(operation === 'translate' ? '本次明确翻译为学术英文' : '保留原文语言'));
    await assert.rejects(applyLocalEdit({ ...statistics, skillRuntime: runtime, operation,
      requestModel: async () => ({ content: '<p>结果显著，系数0.99。[E1]</p>' }) }), /数字|显著性/);
  }
  console.log('local edit citation preservation passed');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
