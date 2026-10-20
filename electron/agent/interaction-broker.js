// Keeps an interactive confirmation inside the original run. Responses are
// bound to the originating window, project, conversation and exact revision.
class InteractionBroker {
  constructor() { this.pending = new Map(); }
  wait({ runId, projectId, conversationId, owner, kind, reference, signal, onReady }) {
    signal?.throwIfAborted();
    if (this.pending.has(runId)) throw new Error('当前任务已有待回答的问题');
    return new Promise((resolve, reject) => {
      const finish = (error, value) => {
        this.pending.delete(runId);
        signal?.removeEventListener('abort', abort);
        error ? reject(error) : resolve(value);
      };
      const abort = () => finish(new DOMException('任务已暂停', 'AbortError'));
      this.pending.set(runId, { projectId, conversationId, owner, kind, reference, finish });
      signal?.addEventListener('abort', abort, { once: true });
      try { onReady?.(); } catch (error) { finish(error); }
    });
  }
  respond(payload, owner) {
    if (payload?.action && !['approve', 'revise','deny'].includes(payload.action)) throw new Error('交互动作无效');
    if (payload?.action === 'revise' && !String(payload.feedback || '').trim()) throw new Error('请填写修改要求');
    const pending = this.pending.get(payload?.runId);
    if (!pending || pending.owner !== owner || pending.projectId !== payload.projectId || pending.conversationId !== payload.conversationId
      || pending.kind !== payload.kind || JSON.stringify(pending.reference) !== JSON.stringify(payload.reference)) throw new Error('任务或确认版本已更新，请使用当前确认卡');
    if(payload.action==='deny'&&pending.kind!=='permission')throw new Error('交互动作无效');
    pending.finish(null, payload);
    return { accepted: true };
  }
}
module.exports = { InteractionBroker };
