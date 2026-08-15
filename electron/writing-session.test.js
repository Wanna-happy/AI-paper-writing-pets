const assert = require('assert');
const {
  buildLengthGuidance,
  buildProjectMemory,
  getWritingLevel,
  parseLengthRequirement,
} = require('./writing-session');

const project = { title: '女性就业研究', type: '硕士学位论文', domain: '经济学', drafts: [] };
assert.strictEqual(getWritingLevel(project).label, '硕士学位论文');
assert(getWritingLevel(project).documentRange.includes('50000—80000'));
assert(getWritingLevel({ type: '期刊论文' }).documentRange.includes('10000—20000'));
assert(getWritingLevel({ type: '课程论文' }).documentRange.includes('4000—10000'));
assert.strictEqual(parseLengthRequirement('正式正文约2000字').target, 2000);
assert.strictEqual(parseLengthRequirement('写5000—8000字').minimum, 5000);
assert.strictEqual(parseLengthRequirement('不少于1万字').minimum, 10000);
assert(buildLengthGuidance(project, '请写第三章研究方法，约2000字', { type: 'section', scope: 'chapter', lengthBasis: '用户要求约2000字' }).includes('用户明确篇幅：约 2000 个中文字符'));
assert(buildLengthGuidance(project, '请写3.1.1研究背景', { type: 'section', scope: 'subsection', lengthBasis: '按硕士论文完整小节自动分配' }).includes('3500—9000'));
assert(buildLengthGuidance({ type: '期刊论文' }, '请写理论机制分析', { type: 'section', scope: 'subsection', lengthBasis: '按期刊小节自动分配' }).includes('1000—2500'));
assert(buildLengthGuidance({ type: '课程论文' }, '请写一篇课程论文', { type: 'paper', scope: 'paper', lengthBasis: '按课程论文整篇自动分配' }).includes('4000—10000'));
assert(buildProjectMemory({ drafts: [] }).includes('暂无已完成正文'));
assert(buildProjectMemory({ drafts: [{ id: 'd1', mode: 'api', title: '第一节', content: '已完成的论证内容。' }] }).includes('第一节'));
assert(!buildProjectMemory({ drafts: [{ id: 'd1', mode: 'local-draft', title: '本地草稿', content: '不应进入记忆。' }] }).includes('不应进入记忆'));
assert(buildProjectMemory({ activeConversationId: 'c1', drafts: [
  { id: 'd1', conversationId: 'c1', mode: 'api', title: '当前对话', content: '应进入记忆。' },
  { id: 'd2', conversationId: 'c2', mode: 'api', title: '其他对话', content: '不应串入。' },
] }).includes('应进入记忆'));
assert(!buildProjectMemory({ activeConversationId: 'c1', drafts: [
  { id: 'd1', conversationId: 'c1', mode: 'api', title: '当前对话', content: '应进入记忆。' },
  { id: 'd2', conversationId: 'c2', mode: 'api', title: '其他对话', content: '不应串入。' },
] }).includes('不应串入'));

console.log('writing session test passed');
