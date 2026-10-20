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
faux.setResponses([
  fauxAssistantMessage([fauxToolCall('get_research_capabilities', { methodId: 'sem-cfa' })], { stopReason: 'toolUse' }),
  context => { const text=JSON.stringify(context); assert(text.includes('requires-extension')); return fauxAssistantMessage('SEM/CFA尚未接通执行，不用EFA替换。'); },
]);
const capabilityOutput=await runPlan({layer,registry,skillRuntime:runtime,plan:{branch:'research',tasks:[{id:'capability',role:'chat',task:'查询SEM CFA能力',skills:[],dependsOn:[]}]},context:{project}});
assert(capabilityOutput.finalText.includes('不替换')||capabilityOutput.finalText.includes('不用EFA替换'));
const card=await read.execute('product-card',{id:'paper-pet::abstract'});
assert(JSON.parse(card.content[0].text).text.includes('不执行开题流程'));
faux.setResponses([context=>{
  assert(JSON.stringify(context).includes('metadata-only'));
  assert(JSON.stringify(context).includes('10.1234/example'));
  return fauxAssistantMessage('<p>书目信息已有记录，全文论断尚待核验。</p>');
}]);
const handed=await runPlan({layer,registry,skillRuntime:runtime,
  plan:{tasks:[{id:'source',role:'collector',task:'查文献',skills:[],dependsOn:[]},{id:'write',role:'writer',task:'撰写文献综述',skills:[],dependsOn:['source']}]},
  resumeOutputs:{source:{role:'collector',status:'completed',text:'书目记录已取得',sourceRecords:[{doi:'10.1234/example',verificationScope:'metadata-only',fullTextVerified:false}]}},context:{project}});
assert(handed.finalText.includes('尚待核验'));
console.log('imported skills searched/read through real pi tool loop; legacy plan IDs normalized; blocked reads rejected');
