const TRANSITIONS = {
  RECEIVED: ['VALIDATING'],
  VALIDATING: ['CLARIFYING', 'PLANNING', 'FAILED', 'CANCELED'],
  CLARIFYING: ['SAVING', 'FAILED', 'CANCELED'],
  PLANNING: ['RETRIEVING', 'RUNNING_TOOL', 'GENERATING', 'FAILED', 'CANCELED', 'SUSPENDED'],
  RETRIEVING: ['RUNNING_TOOL', 'GENERATING', 'FAILED', 'CANCELED', 'SUSPENDED'],
  RUNNING_TOOL: ['GENERATING', 'FAILED', 'CANCELED', 'SUSPENDED'],
  GENERATING: ['AUDITING', 'FAILED', 'CANCELED', 'SUSPENDED'],
  AUDITING: ['SAVING', 'FAILED', 'CANCELED', 'SUSPENDED'],
  // SUSPENDED：UC-FLOW-01 挂起态。可恢复（回到 GENERATING 续跑 / 直接 SAVING），也可彻底取消。
  SUSPENDED: ['GENERATING', 'SAVING', 'FAILED', 'CANCELED'],
  SAVING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: [],
  CANCELED: [],
};

class AgentRunState {
  constructor(runId, onTransition = () => {}) {
    this.runId = runId;
    this.state = 'RECEIVED';
    this.transitions = [{ state: this.state, at: new Date().toISOString() }];
    this.onTransition = onTransition;
  }

  move(next, metadata = null) {
    if (!TRANSITIONS[this.state]?.includes(next)) throw new Error(`非法 Agent 状态转换：${this.state} → ${next}`);
    this.state = next;
    const transition = { state: next, at: new Date().toISOString(), ...(metadata ? { metadata } : {}) };
    this.transitions.push(transition);
    this.onTransition(transition, this);
    return transition;
  }

  fail(error) {
    if (['COMPLETED', 'FAILED', 'CANCELED'].includes(this.state)) return;
    this.move(error?.name === 'AbortError' ? 'CANCELED' : 'FAILED', { error: error?.message || String(error) });
  }
}

module.exports = { AgentRunState, TRANSITIONS };
