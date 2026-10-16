const assert = require('node:assert/strict');
const { assertResearchClarificationQuestions, shouldSupersedeClarification } = require('./clarification-policy');

const screenshotQuestions = [
  { question: 'DTW 库确认不可用，第3步聚类主口径选哪一条？', options: ['改主口径——聚类主结果用纯欧氏 K-Means，DTW 近似结果仅作附表对照'] },
  { question: 'DTW 口径是否仍要在第3步单独出一栏对照？', options: ['保留一栏'] },
  { question: 'K 值诊断曲线覆盖范围与最终取值？', options: ['K=2—6'] },
  { question: 'Time_support=12 复核结果以哪个为准？', options: ['以 682 条内 2 次为准'] },
];
assert.throws(() => assertResearchClarificationQuestions(screenshotQuestions), /不能把分析依赖缺失/);
assert.doesNotThrow(() => assertResearchClarificationQuestions(screenshotQuestions.slice(2)));
assert.equal(shouldSupersedeClarification({ status: 'pending', questions: screenshotQuestions }, '重新跑 DTW，因为 DTW 已经安装好了'), true);
assert.equal(shouldSupersedeClarification({ status: 'pending', questions: screenshotQuestions.slice(2) }, '重新跑 DTW'), false);
assert.equal(shouldSupersedeClarification({ status: 'answered', questions: screenshotQuestions }, '重新跑 DTW'), false);
console.log('clarification card cannot turn missing DTW dependency into a method change');
