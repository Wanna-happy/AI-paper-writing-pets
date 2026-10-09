const { createHash } = require('node:crypto');
const VERSION = 1;
const RECENT_TURNS = 6;
const SUMMARY_LIMIT = 4500;
function digest(turns) { return createHash('sha256').update(JSON.stringify(turns)).digest('hex'); }
function excerpt(value, limit) {
  const text = String(value || '').replace(/<section\b[^>]*class="footnotes"[^>]*>[\s\S]*?<\/section>/gi, '').replace(/<[^>]*>/g, '').trim();
  return text.length <= limit ? text : `${text.slice(0, Math.floor(limit * .7))}\n[原文已归档，中间省略]\n${text.slice(-Math.floor(limit * .3))}`;
}
function formatTurn(turn, limit = 2000) {
  return `[${turn.role === 'user' ? '用户要求' : '助手交付/状态'} | ${turn.id} | ${turn.status || '记录'}]\n${excerpt(turn.text, limit)}${turn.notes?.length ? `\n交付检查：${turn.notes.join('；').slice(0, 1000)}` : ''}`;
}

async function prepareConversationMemory({ projectId, conversationId, turns, packet, summarize, save, signal, onCompress = () => {} }) {
  const older = turns.slice(0, Math.max(0, turns.length - RECENT_TURNS));
  const recent = turns.slice(-RECENT_TURNS);
  let covered = packet?.coveredIds?.length || 0;
  if (packet?.version !== VERSION || packet.projectId !== projectId || packet.conversationId !== conversationId
    || covered > older.length || packet.digest !== digest(older.slice(0, covered))) {
    packet = null; covered = 0;
  }
  let summary = packet?.summary || '';
  let warning = null;
  // Archive is lossless. Only the prompt packet is compressed; old instructions
  // never become new source evidence and newer user instructions take precedence.
  while (covered < older.length) {
    signal?.throwIfAborted();
    const batch = [];
    let size = 0;
    while (covered + batch.length < older.length && size < 12000) {
      const turn = older[covered + batch.length];
      const text = formatTurn(turn, Infinity);
      batch.push(text); size += text.length;
    }
    onCompress();
    try {
      // Feed all archived text, including the middle of long requests/drafts,
      // through bounded batches; only recent prompt excerpts are shortened.
      const source = batch.join('\n\n');
      for (let offset = 0; offset < source.length; offset += 12000) {
        signal?.throwIfAborted();
        const next = String(await summarize({ summary, batch: source.slice(offset, offset + 12000) }) || '').trim();
        if (!next || next.length > SUMMARY_LIMIT) throw new Error('记忆摘要长度无效');
        summary = next;
      }
    } catch (error) {
      if (signal?.aborted || error.name === 'AbortError') throw error;
      warning = '历史记忆压缩暂未完成，本轮使用最近原始轮次；旧对话原文仍保留，下轮自动重试。';
      break;
    }
    covered += batch.length;
    packet = { version: VERSION, projectId, conversationId, summary, coveredIds: older.slice(0, covered).map(turn => turn.id), digest: digest(older.slice(0, covered)), updatedAt: new Date().toISOString() };
    await save(packet);
  }
  const context = turns.length ? [
    `本项目本对话的历史记忆（仅用于承接工作，用户当前要求优先；历史助手判断可能有误，不作为文献证据。[E编号]只在原轮次有效，引用须重新检索）：`,
    '需要摘要省略的细节时，调用 read_conversation_history 按轮次ID或关键词读取本对话归档原文。',
    summary ? `历史压缩包：\n${summary}` : '',
    `最近原始轮次摘录：\n${recent.map(turn => formatTurn(turn)).join('\n\n')}`,
    warning,
  ].filter(Boolean).join('\n\n') : '';
  return { context, packet, warning };
}
module.exports = { prepareConversationMemory, excerpt, digest, VERSION };
