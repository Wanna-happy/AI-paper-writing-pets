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
  console.log('local edit citation preservation passed');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
