import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { createModels, fauxProvider, fauxAssistantMessage as response, fauxToolCall as call, fauxText as text } from '@earendil-works/pi-ai';
import { planTasks } from './planner.mjs';
import { runPlan } from './run-engine.mjs';
import { buildRegistry } from './registry.mjs';
import { requestModel } from './model-layer.mjs';
const require = createRequire(import.meta.url);
const { AgentOrchestrator } = require('../agent/orchestrator');
const { SqliteWorkspaceRepository } = require('../sqlite-workspace');
const root = path.resolve('.ui-smoke', `chat-${randomUUID()}`);
fs.mkdirSync(root, { recursive: true });
let repository = new SqliteWorkspaceRepository(path.join(root, 'workspace.sqlite'));
const faux = fauxProvider({ tokensPerSecond: 10000 });
const models = createModels(); models.setProvider(faux.provider);
const layer = { models, getModel: () => faux.getModel() };
const registry = buildRegistry();
const task = '告诉我你之前干了什么';
try {
  const chatPlan = { tasks: [{ id: 'c', role: 'chat', task, skills: ['academic-writing-core'], dependsOn: [] }] };
  faux.setResponses([context => {
    assert(context.systemPrompt.includes('只有明确请求论文正文/正式文档时才使用writer'));
    return response(JSON.stringify(chatPlan));
  }]);
  const planned = await planTasks({ layer, registry, userPrompt: task });
  assert.equal(planned.tasks[0].role, 'chat');
  assert.deepEqual(planned.tasks[0].skills, []);
  faux.setResponses([response('invalid json')]);
  const fallback = await planTasks({ layer, registry, userPrompt: task });
  assert.equal(fallback.tasks[0].role, 'chat', '规划失败不能默认写论文');
  repository.saveWorkspace({ activeProjectId: 'p', projects: [{ id: 'p', title: '合成项目', type: '课程论文', documents: [], drafts: [], conversations: [{ id: 'c' }], activeConversationId: 'c' }] });
  repository.saveConversationTurn('p', 'c', { id: 'prior', role: 'assistant', text: '已经交付绪论，数据分析尚未执行。', createdAt: '2026-01-01T00:00:00Z' });
  const events = [];
  let draftWrites = 0;
  const engine = new AgentOrchestrator({
    workspaceStore: { loadWorkspace: () => repository.loadWorkspace(), getApiKey: () => 'synthetic', saveAgentRun: run => repository.saveAgentRun(run),
      saveDraft: () => { draftWrites++; throw new Error('聊天不得写入论文草稿'); },
      listConversationTurns: (p, c) => repository.listConversationTurns(p, c), saveConversationTurn: (p, c, t) => repository.saveConversationTurn(p, c, t),
      getConversationMemory: (p, c) => repository.getConversationMemory(p, c), saveConversationMemory: (p, c, m) => repository.saveConversationMemory(p, c, m) },
    loadSettings: () => ({ api: { provider: 'deepseek', model: 'synthetic' } }),
    loadHarness: async () => ({ registryMod: { buildRegistry }, modelLayer: { createModelLayer: () => layer, requestModel }, planner: { planTasks: async () => planned }, runEngine: { runPlan } }),
    skillRuntime: { getCatalog: () => [], composePrompt: () => { throw new Error('聊天不加载论文扩写Skill'); } },
    toolRegistry: {}, providerRegistry: {}, ragStore: { retrieve: () => { throw new Error('工作回顾无需查文献'); } },
    buildConversationFileContext: () => '', postProcessContent: () => { throw new Error('聊天不走论文格式化'); }, emitStream: () => {},
    emitStatus: (_, value) => events.push(value), react: () => {}, playCompletion: () => {},
  });
  const answer = '根据当前对话记录，我已经交付绪论；数据分析尚未执行。\n下一步可以先检查绪论，再明确数据分析要求。';
  faux.setResponses([
    response([text('先读取历史。'), call('read_conversation_history', { query: '绪论' })], { stopReason: 'toolUse' }),
    context => { assert(JSON.stringify(context).includes('已经交付绪论')); assert(!JSON.stringify(context).includes('毕业论文 HTML 输出契约')); return response(answer); },
  ]);
  const result = await engine.run({ projectId: 'p', request: { requestId: 'r', conversationId: 'c', task } });
  assert.equal(result.chat, true);
  assert.equal(result.message.text, answer);
  assert.equal(draftWrites, 0);
  const lastReset = events.findLastIndex(event => event.stage === 'chat-reset');
  const deltas = events.slice(lastReset).filter(event => event.stage === 'chat-delta');
  assert(deltas.length > 1, '对话必须有增量输出');
  assert.equal(deltas.map(event => event.delta).join(''), answer);
  assert.equal(repository.loadWorkspace().projects[0].drafts.length, 0);
  repository.close(); repository = new SqliteWorkspaceRepository(path.join(root, 'workspace.sqlite'));
  assert.equal(repository.loadWorkspace().projects[0].messages[0].text, answer, '重启后恢复聊天回复');
  const savedProgress = repository.loadWorkspace().projects[0].messages[0].progress;
  assert.equal(savedProgress.status, 'done', '重启后恢复任务完成状态');
  assert(savedProgress.steps.some(step => step.id === '$save' && step.status === 'done'));
  assert.equal(repository.listAgentRuns('p')[0].deliveryStatus, 'chat');
  console.log('Chat routing/fallback, history tools, genuine stream deltas, no paper artifacts and restart persistence passed');
} finally { repository.close(); fs.rmSync(root, { recursive: true, force: true }); }
