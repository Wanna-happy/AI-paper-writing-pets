const assert = require('node:assert/strict');
const progress = require('../src/task-progress');
let state = progress.update(null, { stage: 'planning' });
state = progress.update(state, { stage: 'plan-ready', tasks: [
  { id: 'a', role: 'analyst', label: '分析数据' },
  { id: 'w', role: 'writer', label: '撰写结果', dependsOn: ['a'] },
] });
assert.equal(state.steps[0].status, 'done');
assert.deepEqual(state.steps[2].dependsOn, ['a']);
state = progress.update(state, { stage: 'task-start', taskId: 'a', role: 'analyst', label: '分析数据' });
const original = structuredClone(state);
state = progress.update(state, { stage: 'task-suspended', taskId: 'a', label: '已保存断点' });
assert.deepEqual(original.steps[1].status, 'running', '更新不能修改此前保存的记录');
assert.equal(state.steps[2].status, 'pending', '挂起不应把下游任务标为完成');
state = progress.update(state, { stage: 'task-start', taskId: 'a', label: '分析数据' });
state = progress.update(state, { stage: 'task-done', taskId: 'a' });
state = progress.update(state, { stage: 'task-start', taskId: 'w', label: '撰写结果' });
state = progress.update(state, { stage: 'task-done', taskId: 'w' });
state = progress.update(state, { stage: 'audit-start' });
state = progress.update(state, { stage: 'length-revision', label: '第二次篇幅返修' });
state = progress.update(state, { stage: 'task-failed', taskId: 'w', label: '核验失败' });
assert.equal(state.steps.find(step => step.id === 'w').status, 'done');
assert.equal(state.steps.find(step => step.id === '$audit').status, 'failed', '核验失败应标在核验步骤而非已完成的写作步骤');
state = progress.update(state, { stage: 'audit-start' });
state = progress.update(state, { stage: 'saving' });
state = progress.update(state, { stage: 'run-done', needsRevision: true });
assert.equal(state.steps.find(step => step.id === '$save').status, 'done');
assert.equal(state.steps.find(step => step.id === '$audit').status, 'review');
assert(progress.summary(JSON.parse(JSON.stringify(state))).text.includes('需调整'));
const planningFailure = progress.update(null, { stage: 'task-failed', label: '规划失败' });
assert.equal(planningFailure.steps[0].status, 'failed');
const threeTasks = progress.update(null, { stage: 'plan-ready', tasks: ['a', 'b', 'c'].map(id => ({ id, label: id })) });
assert.equal(progress.shouldShowCard(progress.update(progress.update(threeTasks, { stage: 'audit-start' }), { stage: 'saving' })), false, '内部操作不能让三步任务显示卡片');
const fourTasks = progress.update(null, { stage: 'plan-ready', tasks: ['a', 'b', 'c', 'd'].map(id => ({ id, label: id })) });
assert.equal(progress.shouldShowCard(fourTasks), true, '四个实际任务开始显示卡片');
console.log('Task progress dependencies, suspend/resume, audit failure and saved revision state passed');
