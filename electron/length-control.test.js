const assert = require('node:assert/strict');
const { countBodyHanzi, enforceLength } = require('./length-control');
(async () => {
  assert.equal(countBodyHanzi('<h2>标题</h2><p>正文[E1]<sup data-footnote="1">引注</sup>abc123&#x4e2d;</p><section class="footnotes"><p>来源信息</p></section>'), 3);
  assert.equal(countBodyHanzi('<p>正文</p><h2>参考文献</h2><p>作者与题名</p>'), 2);
  const contract = { minimum: 9, maximum: 12, label: '9—12汉字' };
  let calls = 0;
  const passed = await enforceLength({ text: '<p>文</p>', contract, revise: async () => { calls++; return '<p>文'.repeat(10) + '</p>'; } });
  assert.equal(calls, 1);
  assert.equal(passed.attempts.at(-1).actual, 10);
  calls = 0;
  const retained = await enforceLength({ text: '文'.repeat(30), contract, revise: async () => { calls++; return '文'.repeat(20); } });
  assert.equal(retained.text.length, 20);
  assert.equal(retained.attempts.length, 3);
  assert.equal(retained.passed, false);
  assert(retained.warning.includes('正文已保留'));
  assert.equal(calls, 2);
  console.log('length counting and bounded revision passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
