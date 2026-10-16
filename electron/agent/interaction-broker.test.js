const assert = require('node:assert/strict');
const { InteractionBroker } = require('./interaction-broker');
const { AgentOrchestrator } = require('./orchestrator');

async function main() {
  const broker = new InteractionBroker(), controller = new AbortController();
  const args = { runId: 'r', projectId: 'p', conversationId: 'c', owner: 1, kind: 'analysis', reference: { id: 'plan', revision: 2 }, signal: controller.signal };
  const waiting = broker.wait(args);
  assert.throws(() => broker.respond({ ...args, reference: { id: 'plan', revision: 1 } }, 1), /版本/);
  assert.throws(() => broker.respond({ ...args, conversationId: 'different' }, 1), /版本/);
  assert.throws(() => broker.respond(args, 2), /版本/);
  assert.throws(() => broker.respond({ ...args, action: 'cancel' }, 1), /动作/);
  controller.abort();
  await assert.rejects(waiting, error => error.name === 'AbortError');
  assert.equal(broker.pending.size, 0);
  assert.throws(() => broker.respond(args, 1), /版本/);

  const project = { id: 'p', title: '合成项目', domains: ['教育学'], documents: [], drafts: [], conversations: [{ id: 'c' }], activeConversationId: 'c' };
  const turns = [], runs = [];
  let recognized = 0, planned = 0;
  const store = { loadWorkspace: () => ({ projects: [project] }), updateProject: (_, patch) => Object.assign(project, patch), getApiKey: () => 'synthetic',
    saveAgentRun: value => runs.push(structuredClone(value)), listConversationTurns: () => turns, getConversationMemory: () => null, saveConversationMemory: () => {}, saveConversationTurn: (_, __, value) => turns.push(value) };
  const engine = new AgentOrchestrator({ workspaceStore: store, toolRegistry: {}, ragStore: {}, providerRegistry: {}, skillRuntime: { getCatalog: () => [] },
    loadSettings: () => ({ api: { provider: 'deepseek', model: 'synthetic' } }), buildConversationFileContext: () => '', postProcessContent: text => text,
    emitStream: () => {}, react: () => {}, playCompletion: () => {},
    waitForInteraction: value => broker.wait({ ...value, owner: 1 }),
    emitStatus: (runId, event) => {
      if (event.stage !== 'interaction-wait') return;
      assert.equal(planned, 0, '必要问题回答之前不能开始规划');
      queueMicrotask(() => {
        const card = project.clarifications.c;
        store.updateProject('p', { clarifications: { c: { ...card, status: 'answered', answers: [{ id: 'q', answer: '只回答研究思路' }] } } });
        broker.respond({ runId, projectId: 'p', conversationId: 'c', ...event.interaction }, 1);
      });
    },
    loadHarness: async () => ({ registryMod: { buildRegistry: () => ({}) }, modelLayer: { createModelLayer: () => ({}), requestModel: () => ({ content: '' }) },
      planner: { recognizeIntent: async input => {
        recognized++;
        if (recognized === 1) return { branch: 'conversation', needsClarification: true, questions: [{ id: 'q', question: '本轮要什么交付？', options: ['只回答研究思路'] }], clarificationResolution: 'pending' };
        assert(input.projectContext.includes('只回答研究思路'));
        return { branch: 'conversation', needsClarification: false, questions: [] };
      }, planTasks: async () => { planned++; return { tasks: [{ id: 'chat', role: 'chat', task: '回答研究思路', skills: [], dependsOn: [] }] }; } },
      runEngine: { runPlan: async () => ({ finalText: '研究思路已整理。', chatText: '研究思路已整理。', outputs: {}, aborted: false }) } }),
  });
  const result = await engine.run({ projectId: 'p', request: { requestId: 'same-turn-early', conversationId: 'c', task: '帮我处理' }, signal: new AbortController().signal });
  assert(result.chat); assert.equal(recognized, 2); assert.equal(planned, 1);
  assert.equal(turns.filter(turn => turn.role === 'user').length, 1);
  assert.equal(turns.filter(turn => turn.role === 'assistant').length, 1);
  assert(runs.at(-1).transitions.filter(value => value.state === 'UNDERSTANDING').length === 2);
  assert.equal(broker.pending.size, 0);
  console.log('Bound revisions/window/project/conversation, cancellation cleanup, and same-run pre-planning questions passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
