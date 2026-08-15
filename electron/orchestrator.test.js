const assert = require('assert');
const { AgentOrchestrator, detectUnsupportedEmpiricalClaims } = require('./agent/orchestrator');

assert(detectUnsupportedEmpiricalClaims('<p>本文基于2023年调查数据，纳入2,846名样本，Logit回归结果显著。</p>').length >= 2);
assert.deepStrictEqual(detectUnsupportedEmpiricalClaims('<p>本文拟分析生育支持政策及其影响机制。</p>'), []);
assert.deepStrictEqual(detectUnsupportedEmpiricalClaims('<p>样本为2,846名，回归结果显著。</p>', { hasToolResult: true }), []);

async function run() {
  const drafts = [];
  const runs = [];
  const project = {
    id: 'project-1', title: '数字治理研究', type: '硕士学位论文', domains: ['管理学'],
    citationStyle: 'GB/T 7714', goal: '解释组织协同机制', documents: [], drafts: [],
  };
  const workspaceStore = {
    loadWorkspace: () => ({ activeProjectId: project.id, projects: [project] }),
    getApiKey: () => 'test-key',
    saveDraft: (_projectId, draft) => { const saved = { id: `draft-${drafts.length + 1}`, ...draft }; drafts.push(saved); return saved; },
    updateProject: () => project,
    saveAgentRun: (run) => { const index = runs.findIndex((item) => item.id === run.id); const copy = JSON.parse(JSON.stringify(run)); if (index >= 0) runs[index] = copy; else runs.push(copy); },
  };
  const providerRegistry = {
    complete: async () => ({ content: JSON.stringify({ intent: 'write', skillIds: ['academic-writing-core'], needsProjectSources: false, queries: [], tool: null, outputContract: { type: 'section', deliverable: '研究背景正文', scope: 'subsection', lengthBasis: '按硕士论文完整小节自动分配', language: 'zh-CN' } }) }),
    stream: async (_id, _key, _messages, onDelta) => { onDelta('<p>'); onDelta('生成正文'); onDelta('</p>'); return { content: '<p>生成正文</p>', finishReason: 'stop' }; },
    getDefinition: () => ({ model: 'test-model' }),
  };
  const orchestrator = new AgentOrchestrator({
    workspaceStore,
    ragStore: { retrieveMulti: async () => ({ hits: [] }) },
    providerRegistry,
    toolRegistry: { execute: async () => null },
    skillRuntime: { getCatalog: () => [{ id: 'academic-writing-core', description: 'test' }], fallbackSkillIds: () => ['academic-writing-core'], composePrompt: () => ({ skill: { ids: ['test-skill'] }, prompt: '测试规则' }) },
    loadSettings: () => ({ api: { keyMode: 'encrypted', provider: 'test' } }),
    buildConversationFileContext: () => '',
    postProcessContent: (content) => content,
    emitStream: () => {},
    react: () => {},
    playCompletion: () => {},
  });
  const saved = await orchestrator.run({ projectId: project.id, request: { requestId: 'run-1', task: '请写研究背景', attachments: [] }, signal: new AbortController().signal });
  assert.strictEqual(saved.content, '<p>生成正文</p>');
  assert.strictEqual(runs[0].status, 'COMPLETED');
  assert.deepStrictEqual(runs[0].transitions.map((item) => item.state), ['RECEIVED', 'VALIDATING', 'PLANNING', 'GENERATING', 'AUDITING', 'SAVING', 'COMPLETED']);
  assert.strictEqual(runs[0].model, 'test-model');
  assert.deepStrictEqual(runs[0].skill.ids, ['test-skill']);
  assert.strictEqual(runs[0].quality.outputCharacters, 4);

  const routedByLlm = await orchestrator.run({ projectId: project.id, request: { requestId: 'run-2', task: '我有面板数据', attachments: [] }, signal: new AbortController().signal });
  assert.strictEqual(routedByLlm.mode, 'api');
  assert.strictEqual(runs.find((run) => run.id === 'run-2').status, 'COMPLETED');
  console.log('agent orchestrator test passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
