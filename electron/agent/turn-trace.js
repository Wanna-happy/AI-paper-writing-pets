const { userError } = require('../../src/task-progress');

function readTurnTrace(store, projectId, conversationId, runId) {
  const project = store.loadWorkspace().projects.find(item => item.id === projectId);
  if (!project?.conversations?.some(item => item.id === conversationId)) throw new Error('对话不属于当前项目');
  const run = (store.listAgentRuns(projectId, 200) || []).find(item => item.id === runId);
  if (!run) return null;
  if ((run.conversationId || run.checkpoint?.conversationId) !== conversationId) throw new Error('运行记录不属于当前对话');
  const timeline = (run.interactionTimeline || []).map(item => {
    if (['commentary', 'activity'].includes(item.type)) return { type: item.type, text: String(item.text || '').slice(0, 12000) };
    if (item.type === 'task-output') return { type: item.type, taskId: item.taskId, role: item.role, status: item.status, label: item.label, text: String(item.text || '').slice(0, 20000), summary: item.summary };
    if (item.type === 'tool') return { type: item.type, toolName: item.toolName, taskId: item.taskId, toolCallId: item.toolCallId, state: item.state, detail: {
      ...(item.detail?.code ? { code: String(item.detail.code).slice(0, 16000) } : {}),
      ...(item.state === 'failed' ? { output: userError(item.detail?.output) } : {}),
    } };
    return null;
  }).filter(Boolean);
  const attachments = (run.checkpoint?.attachments || []).map(file => ({ id: file.id, name: file.name, previewDataUrl: file.previewDataUrl }));
  return { timeline, progress: run.progress, durationMs: run.durationMs, attachments };
}

module.exports = { readTurnTrace };
