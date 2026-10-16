const assert = require('node:assert/strict');
const { contract, validatePipeline, ROLES } = require('./pipeline-policy');
const { taskBranch, routePlan } = require('./flow-policy');
const { publicAddress, publicUrl, searchWeb, collectData } = require('../tools/data-collection');
async function main() {
  const tasks = ['collector', 'preparer', 'coordinator', 'analyst', 'writer'].map((role, i, roles) => ({ id: role, role, dependsOn: i ? [roles[i - 1]] : [], output: '真实产物', acceptance: '工具结果可核验' }));
  const plan = { version: 2, branch: 'pipeline', tasks, contract: contract({ goal: '采集清洗分析并报告', needsCollection: true, needsPreparation: true, needsAnalysis: true, requestsReport: true }) };
  validatePipeline(plan, ROLES);
  for (const role of ['collector', 'preparer', 'coordinator', 'analyst', 'writer']) assert.throws(() => validatePipeline({ ...plan, tasks: tasks.filter(t => t.role !== role) }, ROLES));
  assert.throws(() => validatePipeline({ ...plan, contract: { ...plan.contract, requestsReport: false, needsWriting: false } }, ROLES), /未授权/);
  assert.throws(() => validatePipeline({ ...plan, tasks: tasks.map(t => t.role === 'coordinator' ? { ...t, dependsOn: [] } : t) }, ROLES), /清洗产物/);
  const routed = routePlan({ plan, intent: { branch: 'analysis', taskContract: plan.contract }, task: '研究' });
  assert.equal(routed.tasks.length, 5);
  assert.equal(taskBranch({ branch: 'pipeline', intent: { branch: 'inspection' } }, { role: 'chat' }), 'inspection');
  assert.equal(taskBranch({ branch: 'pipeline', intent: { branch: 'analysis' } }, { role: 'chat' }), 'conversation');
  for (const address of ['127.0.0.1', '10.0.0.1', '192.168.1.1', '169.254.169.254', '::1', '::ffff:127.0.0.1', '2002:7f00:1::', '2001:db8::1', '100.64.0.1']) assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  await assert.rejects(publicUrl('http://127.0.0.1/'), /内网/);
  await assert.rejects(publicUrl('file:///C:/secret'), /HTTP/);
  await assert.rejects(searchWeb({ query: 'test', loadSettings: () => ({}) }), /未开启联网/);
  await assert.rejects(collectData({ urls: ['https://example.com'], loadSettings: () => ({}) }), /未开启联网/);
  console.log('Pipeline dependency/coverage/authorization, role permissions, public-source limits passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
