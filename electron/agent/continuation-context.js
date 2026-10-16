const isContinuation = value => /^(?:好[的，, ]*)?(?:继续(?:执行|分析|推进)?|(?:进行|执行)?下一步|往下(?:做|分析)?)[呀吧啊。！!\s]*$/.test(String(value || '').trim());
function continuationContext({ task, runs = [], projectId, conversationId, currentRunId, empiricalPlan = null, preparation = null }) {
  if (!isContinuation(task)) return '';
  const previous = runs.filter(run => run.id !== currentRunId && run.projectId === projectId && run.conversationId === conversationId)
    .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')));
  const anchor = previous.find(run => run.task && !isContinuation(run.task));
  return '# 本轮承接说明\n用户说“继续/下一步”，请结合历史原始要求、当前方案及执行状态定位未完成工作；不能把这句话当成脱离上下文的新目标，也不能把它当成任意新方案的批准。\n'
    + (empiricalPlan?.projectId === projectId && empiricalPlan.conversationId === conversationId ? `当前已保存方案（是否可执行仍由宿主核验）：${JSON.stringify({ id: empiricalPlan.id, revision: empiricalPlan.revision, status: empiricalPlan.status, researchQuestion: empiricalPlan.researchQuestion, originalTask: empiricalPlan.originalTask, dataSelection: empiricalPlan.dataSelection, steps: empiricalPlan.steps?.map(step => ({ id: step.id, label: step.label, status: step.status, required: step.required })) })}\n` : '')
    + (preparation ? `已保存的数据准备记录：${JSON.stringify({ id: preparation.id, status: preparation.status, summary: preparation.summary, sampleSize: preparation.sampleSize })}\n` : '')
    + (anchor ? `最近明确的用户任务：${String(anchor.task).slice(0, 4000)}\n` : '优先查阅本对话历史与当前方案定位承接对象；仅在有多个无法区分的对象时定向询问。\n')
    + `最近任务状态：${JSON.stringify(previous.slice(0, 3).map(run => ({ id: run.id, task: String(run.task || '').slice(0, 500), status: run.status, error: String(run.error || '').slice(0, 600), branch: run.plan?.branch, remainingSteps: run.plan?.tasks?.filter(step => !run.checkpoint?.completedIds?.includes(step.id)).map(step => ({ id: step.id, task: step.task })).slice(0, 8) })))}`;
}
module.exports = { isContinuation, continuationContext };
