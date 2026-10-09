const assert = require('assert');
const { AgentOrchestrator, detectUnsupportedEmpiricalClaims } = require('./agent/orchestrator');
async function test() {
  assert(detectUnsupportedEmpiricalClaims('<p>样本为2846名，Logit回归结果显著。</p>').length);
  const project = { id: 'p', title: '测试', type: '课程论文', documents: [], drafts: [], domains: ['管理学'] };
  const runs = new Map();
  const drafts = [];
  const controller = new AbortController();
  let shouldAbort = true;
  let capturedContext;
  const plan = { tasks: [{ id: 't1', role: 'writer', task: '写背景', skills: ['academic-writing-core'], dependsOn: [] }] };
  const engine = new AgentOrchestrator({
    workspaceStore: {
      loadWorkspace: () => ({ projects: [project] }), getApiKey: () => 'test-key',
      saveAgentRun: (run) => runs.set(run.id, structuredClone(run)), listAgentRuns: () => [...runs.values()],
      saveDraft: (_, draft) => { drafts.push(draft); return { id: 'd', ...draft }; },
    },
    loadSettings: () => ({ api: { provider: 'deepseek', model: 'test-model' } }),
    loadHarness: async () => ({
      registryMod: { buildRegistry: () => ({}) },
      modelLayer: { createModelLayer: () => ({}), requestModel: () => ({ content: '' }) },
      planner: { planTasks: async (args) => { assert.equal(args.apiKey, 'test-key'); assert.equal(args.signal, controller.signal); return plan; } },
      runEngine: { runPlan: async (args) => {
        capturedContext = args.context;
        args.onTaskStart(plan.tasks[0], { id: 'writer', name: '写作' }, 1, 1);
        args.onDelta('<p>部分正文</p>');
        if (shouldAbort) { controller.abort(); return { aborted: true }; }
        assert.equal(args.resumePartial.text, '<p>部分正文</p>');
        return { finalText: '<p>生成正文</p>', outputs: {}, aborted: false };
      } },
    }),
    toolRegistry: {}, ragStore: {}, providerRegistry: {}, skillRuntime: { getCatalog: () => [] },
    buildConversationFileContext: (attachments) => attachments.map(a => a.name).join(','),
    postProcessContent: s => s, emitStream: () => {}, react: () => {}, playCompletion: () => {},
  });
  const paused = await engine.run({ projectId: 'p', request: { requestId: 'r1', task: '写背景', attachments: [{ name: 'old.txt' }] }, signal: controller.signal });
  assert.equal(paused.suspended, true);
  assert.equal(drafts.length, 0, '中断内容不能作为完成稿保存');
  assert.equal(runs.get('r1').status, 'SUSPENDED');
  assert.equal(runs.get('r1').progress.steps.find(step => step.id === 't1').status, 'suspended');
  assert.equal(runs.get('r1').checkpoint.partialTaskId, 't1');
  shouldAbort = false;
  const resumed = await engine.resume({ projectId: 'p', runId: 'r1', request: { requestId: 'r2', note: '补充边界条件', attachments: [{ name: 'new.txt' }] }, signal: new AbortController().signal });
  assert.equal(resumed.content, '<p>生成正文</p>');
  assert.equal(capturedContext.resumeNote, '补充边界条件');
  assert.equal(capturedContext.attachments.length, 2);
  assert(capturedContext.writingContext.includes('new.txt'));
  assert.equal(runs.get('r2').status, 'COMPLETED');
  assert.equal(resumed.progress.status, 'done');
  await assert.rejects(engine.resume({ projectId: 'p', runId: 'r1', request: { requestId: 'r3' } }), /未找到/);
  console.log('orchestrator suspend/resume/context regression passed');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
