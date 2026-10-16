const crypto = require('node:crypto');

// History belongs to the stored draft, never to an untrusted renderer payload.
function versionDraft(previous, input, now = new Date().toISOString()) {
  const { expectedContent, history: _history, revision: _revision, ...draft } = input;
  if (previous && expectedContent !== undefined && expectedContent !== previous.content) {
    throw new Error('稿件已被其他操作修改，请重新打开当前稿后重试；你的修改尚未覆盖原稿。');
  }
  if (previous && draft.conversationId && draft.conversationId !== previous.conversationId) throw new Error('不能更改稿件所属对话');
  const history = [...(previous?.history || [])];
  const snapshot = value => {
    const { history: _ignored, expectedContent: _expected, ...data } = value;
    return JSON.parse(JSON.stringify({ ...data, revision: data.revision || crypto.randomUUID(), updatedAt: data.updatedAt || now }));
  };
  if (previous && !history.length) history.push(snapshot(previous));
  const changed = !previous || ['content', 'title', 'versionLabel'].some(key => draft[key] !== undefined && draft[key] !== previous[key]) || JSON.stringify(draft.reviewedEvidence||[])!==JSON.stringify(previous.reviewedEvidence||[]);
  const saved = { ...previous, ...draft, revision: changed ? crypto.randomUUID() : previous.revision, updatedAt: now };
  if (changed) history.push(snapshot(saved));
  return { ...saved, history };
}

module.exports = { versionDraft };
