import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createModels, fauxProvider, fauxAssistantMessage, fauxToolCall } from '@earendil-works/pi-ai';
import { runPlan } from './run-engine.mjs';
import { buildRegistry } from './registry.mjs';
import { makeResearchSkillTools } from './agent-tools.mjs';
import { planTasks } from './planner.mjs';
const require = createRequire(import.meta.url);
const { SkillRuntime } = require('../skills/skill-runtime');
const { PLANNING_SKILL_ID } = require('../skills/research-adapter');
const runtime = new SkillRuntime();
const project = { id: 'education', domains: ['教育学'], documents: [] };
const id = '53-keemanxp-thematic-analysis-skill::thematic-analysis';
const tools = makeResearchSkillTools(runtime, project);
const read = tools.find(t => t.name === 'read_research_skill');
const searched = await tools[0].execute('s', { query: '教师访谈主题分析' });
assert(JSON.parse(searched.content[0].text).some(s => s.id === id));
assert(JSON.parse((await read.execute('r', { id, path: '../../../../package.json' })).content[0].text).error);
assert(JSON.parse((await read.execute('r', { id: '67-econfin-workflow-toolkit::Significance-Search' })).content[0].text).error);
const faux = fauxProvider({ tokensPerSecond: 100000 });
const models = createModels(); models.setProvider(faux.provider);
const layer = { models, getModel: () => faux.getModel() };
const registry = buildRegistry({ skillCatalog: runtime.getCatalog({ project, task: '教师访谈主题分析' }) });
faux.setResponses([fauxAssistantMessage(JSON.stringify({ tasks: [{ id: 'p', role: 'chat', task: '确认研究方案', skills: ['empirical-analysis-plan'], dependsOn: [] }] }))]);
const plan = await planTasks({ layer, registry, userPrompt: '确认方案' });
assert.deepEqual(plan.tasks[0].skills, [PLANNING_SKILL_ID]);
let sawReference = false;
faux.setResponses([
  fauxAssistantMessage([fauxToolCall('search_research_skills', { query: '教师访谈主题分析' })], { stopReason: 'toolUse' }),
  fauxAssistantMessage([fauxToolCall('read_research_skill', { id, path: 'references/coding-guide.md' })], { stopReason: 'toolUse' }),
  context => { sawReference = JSON.stringify(context).includes('coding-guide.md'); return fauxAssistantMessage('已读取主题分析编码指南。'); },
]);
const output = await runPlan({ layer, registry, skillRuntime: runtime, plan: { tasks: [{ id: 'c', role: 'chat', task: '解释主题分析编码', skills: [], dependsOn: [] }] }, context: { project } });
assert(sawReference); assert(output.finalText.includes('编码指南'));
console.log('imported skills searched/read through real pi tool loop; legacy plan IDs normalized; blocked reads rejected');
