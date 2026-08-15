const assert = require('assert');
const { createOpenAIStreamParser } = require('./stream-parser');

const deltas = [];
const parser = createOpenAIStreamParser((delta) => deltas.push(delta));
parser.push('data: {"choices":[{"delta":{"content":"中文"}}]}\n\nda');
parser.push('ta: {"choices":[{"delta":{"content":"流式"}}]}\r\n\r\n');
parser.push('data: {"choices":[{"delta":{"content":"输出"}}]}\n\ndata: [DONE]\n\n');

assert.deepStrictEqual(deltas, ['中文', '流式', '输出']);
assert.strictEqual(parser.finish(), '中文流式输出');
assert.strictEqual(parser.getFinishReason(), null);

const limited = createOpenAIStreamParser(() => {});
limited.push('data: {"choices":[{"delta":{"content":"未完成"},"finish_reason":"length"}]}\n\n');
assert.strictEqual(limited.finish(), '未完成');
assert.strictEqual(limited.getFinishReason(), 'length');
console.log('stream parser test passed');
