import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createModels, fauxProvider, fauxAssistantMessage as response, fauxToolCall as call, getCurrentTools } from '@earendil-works/pi-ai';
import { buildRegistry } from './registry.mjs';
import { recognizeIntent, planTasks } from './planner.mjs';
import { requestModel } from './model-layer.mjs';
import { runPlan } from './run-engine.mjs';
const require = createRequire(import.meta.url);
const { AgentOrchestrator } = require('../agent/orchestrator');
const { InteractionBroker } = require('../agent/interaction-broker');
const { rememberAnswers } = require('../agent/decision-memory');
const { findPythonExecutable } = require('../tools/tool-registry');
const { PLANNING_SKILL_ID } = require('../skills/research-adapter');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-same-turn-'));
const documentEditMode = process.env.PLAN_DOCUMENT_MODE === '1';
try {
  const file = path.join(root, 'dirty.csv'), original = 'country_id,year,x\n1,2020,"1,000"\n1,2021,"2 000"\n15,2020,"3,000"\n1,2022,"4,000"\n';
  fs.writeFileSync(file, original);
  const attachment = { id: 'f', name: 'dirty.csv', extension: '.csv', projectId: 'p' };
  const project = { id: 'p', title: '合成分析', domains: ['经济学'], documents: [], drafts: [], conversations: [{ id: 'c' }], activeConversationId: 'c' };
  const turns = [], events = [], runs = [];
  const store = { loadWorkspace: () => ({ projects: [project] }), getApiKey: () => 'synthetic', saveAgentRun: value => runs.push(structuredClone(value)),
    updateProject: (_, patch) => { if (patch.clarifications) patch.confirmedDecisions = rememberAnswers(project, patch.clarifications); Object.assign(project, patch); },
    saveDraft: (_, draft) => { const saved = { ...draft, id: 'pipeline-report' }; project.drafts.push(saved); return saved; }, listConversationTurns: () => turns, getConversationMemory: () => null, saveConversationMemory: () => {}, saveConversationTurn: (_, __, turn) => turns.push(turn) };
  const broker = new InteractionBroker();
  let confirmations = 0, error;
  const faux = fauxProvider({ tokensPerSecond: 100000 });
  const models = createModels(); models.setProvider(faux.provider);
  const layer = { models, getModel: () => faux.getModel() };
  const selection = { yearRange: { min: 2020, max: 2021 }, filters: [{ column: 'country_id', op: 'ne', values: ['15'] }], numericColumns: ['x'] };
  const proposal = { researchQuestion: '合成数据均值', objective: 'association', dataFile: 'f', dataDescription: '按明确年份与国家筛选', dataSelection: selection,
    missingDataPolicy: '不删除缺失', interpretationLimits: '仅合成测试', steps: [{ methodId: 'descriptive-statistics', label: '描述统计', purpose: '核对真实均值', specification: '计算 x 的均值', outputs: '均值表' }] };
  const updated = { ...proposal, steps: [{ ...proposal.steps[0], specification: '计算 x 的均值与样本数', outputs: '均值和样本量表' }] };
  const code = `import os,json,pandas as pd
+d=pd.read_csv(os.environ['DATA_FILE'])
+assert len(d)==2 and d['x'].mean()==1500 and 15 not in set(d['country_id'])
+print('PAPER_PET_RESULT='+json.dumps({'schemaVersion':1,'stepId':'a1','methodId':'descriptive','status':'completed','sampleSize':len(d),'summary':'真实均值1500','tables':[{'title':'合成均值','columns':['均值','样本量'],'rows':[[float(d.x.mean()),len(d)]]}],'diagnostics':[]}))`.replace(/^\+/gm, '');
  faux.setResponses([
    response(JSON.stringify({ branch: 'mixed', needsClarification: false, needsDataPreparation: true, questions: [], taskContract: { goal: '清洗后分析并交付报告', needsPreparation: true, needsAnalysis: true, requestsReport: true, deliverables: ['清洗副本','真实均值','分析报告'] } })),
    response(JSON.stringify({ version: 2, tasks: ['preparer','coordinator','analyst','writer'].map((role, index, roles) => ({ id: role, role, task: role === 'writer' ? '撰写合成数据分析报告' : role, skills: [], dependsOn: index ? [roles[index - 1]] : [], output: role + '真实产物', acceptance: '实际工具完成并保留来源' })) })),
    ctx => { assert(getCurrentTools(ctx.messages).some(tool => tool.name === 'prepare_data_file')); return response([call('prepare_data_file', { dataFile: 'f', selection })], { stopReason: 'toolUse' }); },
    response([call('submit_clarification', { title: '结果范围', questions: [{ id: 'range', question: '本轮只做描述统计吗？', options: ['只做描述统计'] }] })], { stopReason: 'toolUse' }),
    response('清洗副本与范围已核实。'),
    response([call('submit_analysis_plan', proposal)], { stopReason: 'toolUse' }), response('方案已提交，请直接确认。'),
    ...(documentEditMode ? [] : [response([call('submit_analysis_plan', updated)], { stopReason: 'toolUse' }), response('已按反馈更新方案。')]),
    response([call('run_data_analysis', { request: '计算均值与样本量', dataFile: 'dirty.csv' })], { stopReason: 'toolUse' }),
    response('```python\n' + code + '\n```'), response('分析已完成，均值为1500。'),
    ctx => { assert(JSON.stringify(ctx.messages).includes('1500')); assert(JSON.stringify(ctx.messages).includes('analysis-result')); return response('<h1>合成数据分析报告</h1><p>本次筛选保留两条记录，变量x的均值为1500。该结果只描述本次合成样本，不代表总体规律或因果关系。分析使用清洗副本，原始数据保留。</p>'); },
  ]);
  const engine = new AgentOrchestrator({ workspaceStore: store, toolRegistry: { resolveAttachment: () => file, findPython: findPythonExecutable, userDataPath: root, loadSettings: () => ({}) },
    ragStore: {}, providerRegistry: {}, skillRuntime: { getCatalog: () => [{ id: PLANNING_SKILL_ID, name: 'workflow', description: 'planning' }], composePrompt: () => ({ prompt: '' }) },
    loadSettings: () => ({ api: { provider: 'deepseek', model: 'synthetic' } }),
    loadHarness: async () => ({ registryMod: { buildRegistry }, modelLayer: { createModelLayer: () => layer, requestModel }, planner: { recognizeIntent, planTasks }, runEngine: { runPlan } }),
    buildConversationFileContext: () => '', postProcessContent: text => text, emitStream: () => {}, react: () => {}, playCompletion: () => {},
    waitForInteraction: args => broker.wait({ ...args, owner: 7 }), emitStatus: (runId, event) => {
      events.push(event);
      if (process.env.PIPELINE_TEST_DEBUG) console.log(event.stage, event.label || event.toolName || '', event.detail?.output || '');
      if (event.stage !== 'interaction-wait') return;
      queueMicrotask(() => { try {
        const { kind, reference } = event.interaction;
        const payload = { runId, projectId: 'p', conversationId: 'c', kind, reference };
        assert.throws(() => broker.respond({ ...payload, projectId: 'other' }, 7), /版本/);
        assert.throws(() => broker.respond(payload, 8), /版本/);
        if (kind === 'clarification') {
          const card = project.clarifications.c;
          store.updateProject('p', { clarifications: { c: { ...card, status: 'answered', answers: card.questions.map(question => ({ id: question.id, answer: '只做描述统计' })) } } });
        } else {
          assert.equal(project.empiricalPlans.c.status, 'pending-confirmation');
          assert(!turns.some(turn => turn.analysisArtifacts));
          confirmations++;
          if (confirmations === 1) Object.assign(payload, { action: 'revise', feedback: '结果表增加样本量', ...(documentEditMode ? { documentPatch: { steps: updated.steps } } : {}) });
        }
        broker.respond(payload, 7);
      } catch (caught) { error = caught; } });
    } });
  const result = await engine.run({ projectId: 'p', request: { requestId: 'one-original-run', conversationId: 'c', task: '你自己进行数据清洗然后进行分析，最后生成分析报告', attachments: [attachment] }, signal: new AbortController().signal });
  if (error) throw error;
  assert.equal(result.id, 'pipeline-report'); assert(result.content.includes('1500'));  assert.equal(confirmations, 2); assert.equal(broker.pending.size, 0);
  assert.equal(project.empiricalPlans.c.status, 'completed');
  assert.equal(project.empiricalPlans.c.steps[0].methodId, 'descriptive');
  assert.equal(project.empiricalPlans.c.steps[0].requestedMethodId, 'descriptive-statistics');
  assert(events.some(event => event.stage === 'activity' && event.detail?.code?.includes('read_csv')));
  assert(events.some(event => event.stage === 'activity' && event.detail?.input?.steps));
  assert.equal(project.empiricalPlans.c.results[0].tables[0].rows[0][0], 1500);
  assert.equal(turns.filter(turn => turn.role === 'user').length, 1, '点选确认不能创建另一条用户任务');
  assert.equal(project.drafts.length, 1, '分析后同轮写报告');
  assert(runs.at(-1).plan.contract.requestsReport); assert(runs.at(-1).plan.tasks.some(task => task.role === 'writer'));
  assert.equal(fs.readFileSync(file, 'utf8'), original);
  assert(events.some(event => event.stage === 'prepared-data'));
  assert(events.filter(event => event.stage === 'interaction-wait').length === 3);
  const savedPlan = JSON.stringify(project.empiricalPlans.c);
  const simplePlan = role => ({ version: 2, tasks: [{ id: 'only', role, task: '只处理本轮要求', skills: [], dependsOn: [], output: '本轮回答', acceptance: '不重复历史步骤' }] });
  const analysisCalls = () => events.filter(event => event.stage === 'activity' && event.toolName === 'run_data_analysis' && event.state === 'running').length;
  const previousCalls = analysisCalls();
  faux.setResponses([
    response(JSON.stringify({ branch: 'conversation', needsClarification: false, taskContract: { goal: '解释均值' } })),
    response(JSON.stringify(simplePlan('chat'))),
    response('均值是所有观测值之和除以观测数量。'),
  ]);
  const answer = await engine.run({ projectId: 'p', request: { requestId: 'ordinary-question', conversationId: 'c', task: '均值是什么意思？', attachments: [] }, signal: new AbortController().signal });
  assert(answer.chat); assert(answer.message.text.includes('均值是'));
  assert.equal(JSON.stringify(project.empiricalPlans.c), savedPlan, '普通问答不得重跑或清空已有结果');
  faux.setResponses([
    response(JSON.stringify({ branch: 'writing', needsClarification: false, usesAnalysisResults: true, taskContract: { goal: '用已有结果改写报告', needsWriting: true, usesExistingResults: true, requestsReport: true } })),
    response(JSON.stringify(simplePlan('writer'))),
    ctx => { assert(JSON.stringify(ctx.messages).includes('1500')); return response('<h1>已有结果解读</h1><p>变量x的样本均值为1500，仅适用于本次合成样本，不作因果推断。</p>'); },
  ]);
  const report = await engine.run({ projectId: 'p', request: { requestId: 'reuse-results', conversationId: 'c', task: '用刚才结果写一段简短报告，不要重新计算', attachments: [attachment] }, signal: new AbortController().signal });
  assert(report.content.includes('1500'));
  assert.equal(analysisCalls(), previousCalls, '已有结果写作不得新增计算');
  assert.equal(confirmations, 2, '普通问答和已有结果写作不得重复确认分析方案');
  faux.setResponses([
    response(JSON.stringify({ branch: 'writing', needsClarification: false, taskContract: { goal: '润色一句话', needsWriting: true } })),
    response(JSON.stringify(simplePlan('writer'))), response('<p>本研究关注家庭政策与生育意愿之间的联系。</p>'),
  ]);
  const edit = await engine.run({ projectId: 'p', request: { requestId: 'local-edit-only', conversationId: 'c', task: '只润色这句话：本文研究家庭政策与生育意愿的联系。', attachments: [] }, signal: new AbortController().signal });
  assert(edit.content.includes('家庭政策')); assert.equal(analysisCalls(), previousCalls);
  console.log('Pipeline: real preparation → direct clarification → revised approval → actual analysis → authorized report in one run; source unchanged');
} finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
