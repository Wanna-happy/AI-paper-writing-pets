// Only explicit user answers enter this ledger; generated suggestions never do.
const key = value => String(value || '').normalize('NFKC').replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
function rememberAnswers(project, cards) {
  const ledger = { ...(project.confirmedDecisions || {}) };
  for (const [conversationId, card] of Object.entries(cards || {})) {
    if (card?.status !== 'answered') continue;
    const entries = [...(ledger[conversationId] || [])];
    if (card.userResponse && !card.answers?.length) {
      const responseKey = 'response:' + card.id;
      if (!entries.some(item => item.key === responseKey)) entries.push({ key: responseKey, question: (card.questions || []).map(item => item.question).join('；'), answer: card.userResponse, cardId: card.id, confirmedAt: card.resolvedAt });
    }
    for (const answer of card.answers || []) {
      const question = card.questions?.find(item => item.id === answer.id);
      if (!question || !String(answer.answer || '').trim()) continue;
      const entry = { key: key(question.decisionKey || question.question), question: question.question,
        answer: String(answer.answer).trim(), cardId: card.id, confirmedAt: card.answeredAt || new Date().toISOString() };
      const index = entries.findIndex(item => item.key === entry.key);
      if (index >= 0) entries[index] = entry; else entries.push(entry);
    }
    ledger[conversationId] = entries.slice(-120);
  }
  return ledger;
}
function decisionsFor(project, conversationId) {
  return rememberAnswers(project, project.clarifications)[conversationId] || [];
}
function unansweredQuestions(questions, project, conversationId) {
  const decisions = new Map(decisionsFor(project, conversationId).map(item => [item.key, item]));
  return questions.filter(question => {
    const prior = decisions.get(key(question.decisionKey || question.question));
    // A newly offered answer domain may represent a real change, so keep that question.
    return !prior || (question.options?.length && !question.options.some(option => key(option) === key(prior.answer)));
  });
}
function decisionContext(project, conversationId) {
  const entries = decisionsFor(project, conversationId).slice(-60).map(item => ({ ...item, question: String(item.question).slice(0, 220), answer: String(item.answer).slice(0, 700) }));
  const plan = project.empiricalPlans?.[conversationId];
  const confirmed = plan?.approvedAt ? { dataFile: plan.attachment, dataSelection: plan.dataSelection,
    steps: plan.steps.map(step => ({ methodId: step.methodId, specification: step.specification })), revision: plan.revision } : project.confirmedAnalysisChoices?.[conversationId] || null;
  return `# 用户已确认的决策（独立保存，不依赖历史摘要）\n${JSON.stringify(entries)}\n已批准的方案：${JSON.stringify(confirmed)}\n沿用这些回答。不得仅因重试、换轮或重新核验而再次确认。用户明确修改时才更新；原表统计与筛选后统计是不同范围，不能用原表数字推翻已确认筛选口径。需确认新问题时可复用已有 decisionKey，已确认项由程序去重。`;
}
module.exports = { rememberAnswers, decisionsFor, unansweredQuestions, decisionContext };
