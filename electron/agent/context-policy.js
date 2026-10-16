function clip(value, limit) {
  const text = String(value || '');
  if (text.length <= limit) return text;
  const notice = '\n[上下文已按预算节选；需要完整来源、历史或分析结果时请调用对应读取工具，不补造省略内容。]\n';
  const room = Math.max(0, limit - notice.length), head = Math.floor(room * .7);
  return text.slice(0, head) + notice + text.slice(-Math.max(0, room - head));
}
function projectSettingsContext(project = {}) {
  return '# 当前项目设置（默认约束；用户本轮明确要求优先）\n' + JSON.stringify({
    title: clip(project.title, 200), type: clip(project.type, 100),
    domains: (project.domains || [project.domain]).filter(Boolean).slice(0, 20),
    language: project.language || '中文', citationStyle: project.citationStyle || 'GB/T 7714', goal: clip(project.goal, 2000),
  });
}
function selectContextFiles(files, { branch = '', task = '', explicitIds = [] } = {}) {
  if (['conversation', 'environment', 'clarification'].includes(branch)) return [];
  const explicit = new Set(explicitIds), query = String(task).toLowerCase();
  const chosen = files.filter(file => explicit.has(file.id) || (file.name && query.includes(file.name.toLowerCase())));
  return chosen.slice(0, 8).map(file => ({ ...file,
    // Data is inspected by the sandbox. Indexed literature is read through RAG.
    excerpt: ['.csv', '.xlsx', '.xls'].includes(file.extension) || file.documentId ? '' : clip(file.excerpt, 3000),
  }));
}
function inputBudget(model = {}) {
  const window = Number(model.contextWindow) || 65536;
  // Conservative character budget, leaving room for output and tool declarations.
  const total = Math.min(48000, Math.max(5000, Math.floor(window * .65)));
  return { total, skills: Math.floor(total * .4), user: Math.floor(total * .45) };
}
function boundTranscript(context, model = {}) {
  const window = Number(model.contextWindow) || 65536;
  const messages = (context.messages || []).map((message, index, all) => {
    if (message.role === 'system') return message; // Preserve tool declarations and permissions.
    const limit = index >= all.length - 2 ? Math.min(64000, Math.max(3000, Math.floor(window * .45))) : 3000;
    if (typeof message.content === 'string') return { ...message, content: clip(message.content, limit) };
    if (!Array.isArray(message.content)) return message;
    return { ...message, content: message.content.map(block => block.type === 'text' ? { ...block, text: clip(block.text, limit) } : block) };
  });
  const bounded = { ...context, messages }, serialized = JSON.stringify(bounded);
  const hanzi = (serialized.match(/[\u3400-\u9fff]/g) || []).length;
  const estimate = hanzi + Math.ceil((serialized.length - hanzi) / 3);
  if (estimate > window - Math.min(4096, Math.floor(window / 4))) throw new Error('本轮上下文超过模型安全预算，已停止发送。请缩小任务范围或选择更大上下文的模型。');
  return bounded;
}
module.exports = { clip, projectSettingsContext, selectContextFiles, inputBudget, boundTranscript };
