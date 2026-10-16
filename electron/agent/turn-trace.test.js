const assert = require('node:assert/strict');
const { readTurnTrace } = require('./turn-trace');
const run = { id: 'r', conversationId: 'c', durationMs: 338000, checkpoint: { attachments: [{ id: 'f', name: '数据.csv', path: 'private-path' }] }, interactionTimeline: [
  { type: 'tool', toolName: 'run_data_analysis', state: 'completed', detail: { code: 'print(1)', input: { secret: 'never-show' }, output: 'raw-result' } },
  { type: 'tool', toolName: 'read_research_skill', state: 'completed', detail: { output: 'EXAMPLE_NOT_EXECUTED' } },
] };
const store = { loadWorkspace: () => ({ projects: [{ id: 'p', conversations: [{ id: 'c' }, { id: 'other' }] }] }), listAgentRuns: () => [run] };
const result = readTurnTrace(store, 'p', 'c', 'r');
assert.equal(result.timeline[0].detail.code, 'print(1)');
assert(!JSON.stringify(result).includes('never-show'));
assert(!JSON.stringify(result).includes('EXAMPLE_NOT_EXECUTED'));
assert(!JSON.stringify(result.attachments).includes('private-path'));
assert.equal(result.durationMs, 338000);
assert.equal(readTurnTrace(store, 'p', 'c', 'missing'), null);
assert.throws(() => readTurnTrace(store, 'p', 'other', 'r'), /不属于当前对话/);
assert.throws(() => readTurnTrace(store, 'other-project', 'c', 'r'), /不属于当前项目/);
console.log('Scoped read-only trace recovery, actual code only, attachment metadata and diagnostic filtering passed');
