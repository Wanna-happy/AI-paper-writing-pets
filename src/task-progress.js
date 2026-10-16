(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TaskProgress = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const labels = { pending: '待执行', running: '执行中', done: '已完成', failed: '失败', suspended: '已挂起', waiting: '待补充', review: '需调整' };
  function shortLabel(value) {
    const text = String(value || '处理任务').replace(/^第\s*[\d一二三四五六七八九十]+\s*步\s*[（(][^）)]*[）)]\s*[：:·.、-]?\s*|^第\s*[\d一二三四五六七八九十]+\s*步\s*[：:·.、-]?\s*/, '').replace(/\s+/g, ' ').split(/[：:\n]/)[0].trim() || '处理任务';
    return text.length > 28 ? text.slice(0, 27) + '…' : text;
  }
  function userError(value) {
    const text = String(value?.message || value || '').replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, '');
    if (/insufficient[ _-]*(balance|quota)|余额不足|credit balance/i.test(text)) return '模型服务余额不足，本轮暂时无法继续。请检查当前模型服务的余额或更换可用配置，再恢复任务。';
    if (/\b401\b|invalid[ _-]*api[ _-]*key|authentication/i.test(text)) return '模型服务认证失败，请检查当前 API 密钥配置后重试。';
    if (/\b429\b|rate[ _-]*limit/i.test(text)) return '模型服务请求过于频繁，请稍后重试。';
    return text.split(/\n|\{\s*"/)[0].slice(0, 240) || '当前步骤未完成，请查看执行记录后重试。';
  }
  function update(previous, event) {
    const state = { steps: [], ...previous, steps: (previous?.steps || []).map(step => ({ ...step })) };
    const put = (id, patch) => {
      let step = state.steps.find(item => item.id === id);
      if (!step) { step = { id, status: 'pending' }; state.steps.push(step); }
      Object.assign(step, patch);
    };
    if (event.stage === 'intent-start') put('$intent', { label: '识别目标与必要缺口', status: 'running' });
    if (event.stage === 'planning') {
      for (const step of state.steps) if (step.id === '$intent') step.status = 'done';
      put('$plan', { label: '制定任务计划', status: 'running' });
    }
    if (event.stage === 'memory-compaction') put('$memory', { label: '整理历史对话', status: 'running' });
    if (event.stage === 'plan-ready') {
      state.status = 'running';
      for (const step of state.steps) if (step.id === '$plan' || step.id === '$memory') step.status = 'done';
      for (const task of event.tasks || []) put(task.id, { label: task.label, role: task.role, dependsOn: task.dependsOn || [], status: task.done ? 'done' : 'pending' });
    }
    if (event.stage === 'task-start') { state.status = 'running'; put(event.taskId, { label: event.label, role: event.role, status: 'running', note: '' }); }
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
    const tasks = steps.filter(step => !step.id.startsWith('$'));
    const index = current ? tasks.findIndex(step => step.id === current.id) : -1;
    const text = current ? current.status === 'running' ? index >= 0 ? `执行任务 ${index + 1}/${tasks.length} · ${shortLabel(current.label)}` : `正在${shortLabel(current.label)}` : `${labels[current.status]} · ${shortLabel(current.label)}`
      : state?.status === 'done' ? '已完成 · 查看执行过程'
      : steps.length && completed === steps.length ? '已完成当前计划' : '等待执行';
    return { completed, total: steps.length, text };
  }
  // Only actual planned tasks count toward visibility; bookkeeping phases do not.
  function shouldShowCard(state) {
    return !['done', 'review', 'failed', 'suspended'].includes(state?.status) && (state?.steps || []).filter(step => !step.id.startsWith('$')).length >= 4;
  }
  function duration(milliseconds) {
    const seconds = Math.max(0, Math.floor(Number(milliseconds || 0) / 1000));
    return [seconds >= 3600 ? `${Math.floor(seconds / 3600)}h` : '', seconds >= 60 ? `${Math.floor(seconds % 3600 / 60)}m` : '', `${seconds % 60}s`].filter(Boolean).join(' ');
  }
  function completedSummary(progress, timeline = []) {
    const steps = (progress?.steps || []).filter(step => !step.id.startsWith('$') && step.status === 'done');
    const outputs = timeline.filter(item => item.type === 'task-output' && item.status === 'completed');
    const labels = [...new Set([...steps.map(step => shortLabel(step.label)), ...outputs.map(item => shortLabel(item.label))])];
    return labels.length ? `本轮已完成 ${labels.length} 项：${labels.slice(0, 5).join('、')}${labels.length > 5 ? '等' : ''}。` : '';
  }
  return { update, summary, labels, shouldShowCard, shortLabel, userError, duration, completedSummary };
});
