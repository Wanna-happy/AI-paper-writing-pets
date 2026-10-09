(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaskProgress = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const labels = { pending: '待执行', running: '执行中', done: '已完成', failed: '失败', suspended: '已挂起', waiting: '待补充', review: '需调整' };
  function update(previous, event) {
    const state = { steps: [], ...previous, steps: (previous?.steps || []).map(step => ({ ...step })) };
    const put = (id, patch) => {
      let step = state.steps.find(item => item.id === id);
      if (!step) { step = { id, status: 'pending' }; state.steps.push(step); }
      Object.assign(step, patch);
    };
    if (event.stage === 'planning') put('$plan', { label: '理解需求并制定计划', status: 'running' });
    if (event.stage === 'memory-compaction') put('$memory', { label: '整理历史对话', status: 'running' });
    if (event.stage === 'plan-ready') {
      for (const step of state.steps) if (step.id === '$plan' || step.id === '$memory') step.status = 'done';
      for (const task of event.tasks || []) put(task.id, { label: task.label, role: task.role, dependsOn: task.dependsOn || [], status: task.done ? 'done' : 'pending' });
    }
    if (event.stage === 'task-start') put(event.taskId, { label: event.label, role: event.role, status: 'running', note: '' });
    if (event.stage === 'task-done') put(event.taskId, { status: 'done', note: '' });
    if (event.stage === 'audit-start') put('$audit', { label: '核验正文、引用与篇幅', status: 'running' });
    if (event.stage === 'length-revision') put('$audit', { label: '核验正文、引用与篇幅', status: 'running', note: event.label });
    if (event.stage === 'saving') {
      for (const step of state.steps) if (step.status === 'running') step.status = 'done';
      put('$save', { label: '保存本轮结果', status: 'running' });
    }
    if (event.stage === 'run-done') {
      for (const step of state.steps) if (step.status === 'running') step.status = 'done';
      if (event.needsRevision) put('$audit', { status: 'review', note: event.label || '正文已保存，篇幅仍需调整' });
      state.status = event.needsRevision ? 'review' : 'done';
    }
    if (['task-failed', 'task-suspended', 'task-waiting'].includes(event.stage)) {
      const status = { 'task-failed': 'failed', 'task-suspended': 'suspended', 'task-waiting': 'waiting' }[event.stage];
      const running = state.steps.filter(step => step.status === 'running');
      if (running.length) for (const step of running) Object.assign(step, { status, note: event.label });
      else put(event.taskId || '$plan', { label: '处理本轮任务', status, note: event.label });
      state.status = status;
    }
    state.updatedAt = event.at || new Date().toISOString();
    return state;
  }
  function summary(state) {
    const steps = state?.steps || [];
    const completed = steps.filter(step => step.status === 'done').length;
    const current = steps.find(step => ['running', 'failed', 'suspended', 'waiting', 'review'].includes(step.status));
    const text = current ? current.status === 'running' ? `正在${current.label}` : `${labels[current.status]} · ${current.label}`
      : state?.status === 'done' ? '已完成 · 查看执行过程'
      : steps.length && completed === steps.length ? '已完成当前计划' : '等待执行';
    return { completed, total: steps.length, text };
  }
  // Only actual planned tasks count toward visibility; bookkeeping phases do not.
  function shouldShowCard(state) {
    return (state?.steps || []).filter(step => !step.id.startsWith('$')).length >= 4;
  }
  return { update, summary, labels, shouldShowCard };
});
