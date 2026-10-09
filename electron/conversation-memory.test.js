const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { SqliteWorkspaceRepository } = require('./sqlite-workspace');
const { prepareConversationMemory } = require('./conversation-memory');
const { AgentOrchestrator } = require('./agent/orchestrator');
(async () => {
  const root = path.resolve('.ui-smoke', `memory-${randomUUID()}`);
  fs.mkdirSync(root, { recursive: true });
  let repository = new SqliteWorkspaceRepository(path.join(root, 'workspace.sqlite'));
  try {
    const projects = ['a', 'b'].map(id => ({ id, title: id, type: '课程论文', documents: [], drafts: [], conversations: [{ id: 'chat' }], activeConversationId: 'chat' }));
    repository.saveWorkspace({ activeProjectId: 'a', projects });
    for (let index = 0; index < 18; index++) repository.saveConversationTurn('a', 'chat', { id: `turn-${index}`, role: index % 2 ? 'assistant' : 'user', text: index === 0 ? '已确认研究对象为农村女性，禁止扩大到城市。' : `第${index}轮已完成或待办。`, createdAt: new Date(1700000000000 + index).toISOString() });
    repository.saveConversationTurn('b', 'chat', { id: 'private', role: 'user', text: '项目B私有秘密', createdAt: new Date().toISOString() });
    let calls = 0;
    const prepare = async (projectId = 'a') => prepareConversationMemory({ projectId, conversationId: 'chat', turns: repository.listConversationTurns(projectId, 'chat'), packet: repository.getConversationMemory(projectId, 'chat'), save: packet => repository.saveConversationMemory(projectId, 'chat', packet), summarize: async ({ summary, batch }) => { calls++; return `${summary}\n${batch}`; } });
    const first = await prepare();
    assert(first.context.includes('禁止扩大到城市'));
    assert(first.context.includes('第17轮'));
    assert(!first.context.includes('私有秘密'));
    assert.equal(calls, 1);
    repository.close();
    repository = new SqliteWorkspaceRepository(path.join(root, 'workspace.sqlite'));
    const restarted = await prepare();
    assert.equal(calls, 1, '重启后复用持久摘要，不重复压缩');
    assert.equal(restarted.context, first.context);
    assert((await prepare('b')).context.includes('私有秘密'));
    const original = repository.listConversationTurns('a', 'chat')[0];
    repository.saveConversationTurn('a', 'chat', { ...original, text: '已改为研究城乡比较。' });
    const changed = await prepare();
    assert(changed.context.includes('城乡比较'));
    assert(!changed.context.includes('禁止扩大到城市'), '编辑原文后旧摘要必须失效');
    const failed = await prepareConversationMemory({ projectId: 'a', conversationId: 'chat', turns: repository.listConversationTurns('a', 'chat'), packet: null, save: () => {}, summarize: async () => { throw new Error('offline'); } });
    assert(failed.warning && failed.context.includes('第17轮'));
    const longTurns = repository.listConversationTurns('a', 'chat');
    longTurns[0] = { ...longTurns[0], text: '背景'.repeat(7000) + '必须保留的中间约束' + '补充'.repeat(7000) };
    const longMemory = await prepareConversationMemory({ projectId: 'a', conversationId: 'chat', turns: longTurns, packet: null, save: () => {}, summarize: async ({ summary, batch }) => {
      assert(batch.length <= 12000);
      return summary + (batch.includes('必须保留的中间约束') ? '必须保留的中间约束' : '已归档。');
    } });
    assert(longMemory.context.includes('必须保留的中间约束'), '压缩必须覆盖长原文中部，不能只截头尾');

    let plannerContext, writerContext;
    const engine = new AgentOrchestrator({
      workspaceStore: {
        loadWorkspace: () => repository.loadWorkspace(), getApiKey: () => 'synthetic',
        saveAgentRun: run => repository.saveAgentRun(run),
        listConversationTurns: (p, c) => repository.listConversationTurns(p, c),
        saveConversationTurn: (p, c, turn) => repository.saveConversationTurn(p, c, turn),
        getConversationMemory: (p, c) => repository.getConversationMemory(p, c),
        saveConversationMemory: (p, c, memory) => repository.saveConversationMemory(p, c, memory),
        saveDraft: (_, draft) => ({ id: 'synthetic-draft', ...draft }),
      },
      loadSettings: () => ({ api: { provider: 'deepseek', model: 'synthetic' } }),
      loadHarness: async () => ({ registryMod: { buildRegistry: () => ({}) }, modelLayer: { createModelLayer: () => ({}), requestModel: async () => ({ content: '用户确认研究城乡比较；已完成综述，下一步写机制。' }) },
        planner: { planTasks: async args => { plannerContext = args.projectContext; return { tasks: [{ id: 'w', role: 'writer', task: '继续写机制', skills: [] }] }; } },
        runEngine: { runPlan: async args => { writerContext = args.context.writingContext; assert(!args.context.readConversationHistory().some(turn => turn.text.includes('私有秘密'))); return { finalText: '<p>机制论证</p>' }; } } }),
      toolRegistry: {}, ragStore: {}, skillRuntime: { getCatalog: () => [] }, providerRegistry: {}, buildConversationFileContext: () => '', postProcessContent: value => value, emitStream: () => {}, react: () => {}, playCompletion: () => {},
    });
    await engine.run({ projectId: 'a', request: { requestId: 'continuation', conversationId: 'chat', task: '沿上次要求继续写机制' } });
    assert(plannerContext.includes('城乡比较') && writerContext.includes('城乡比较'));
    assert(!plannerContext.includes('私有秘密') && !writerContext.includes('私有秘密'));
    repository.deleteConversationMemory('a', 'chat');
    assert.equal(repository.listConversationTurns('a', 'chat').length, 0);
    assert.equal(repository.getConversationMemory('a', 'chat'), null);
    assert(repository.listConversationTurns('b', 'chat').length);
    console.log('Durable conversation compression, restart continuation, edit invalidation, planner/writer injection and isolation passed');
  } finally { repository.close(); fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
