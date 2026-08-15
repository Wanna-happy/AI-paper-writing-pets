const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseAgentPlan } = require('./agent/plan-schema');
const { AgentRunState } = require('./agent/run-state');
const { ProviderRegistry } = require('./providers/provider-registry');
const { SkillRuntime } = require('./skills/skill-runtime');
const { evaluateRun, summarizeRuns } = require('./quality/evaluator');

async function run() {
  const attachment = { name: 'data.csv', extension: '.csv' };
  const valid = parseAgentPlan(JSON.stringify({
    intent: 'analyze',
    skillIds: ['academic-writing-core', 'data-analysis'],
    needsProjectSources: false,
    queries: ['描述统计'],
    tool: { name: 'data_analysis', dataFile: 'data.csv', chartType: 'bar' },
    outputContract: { type: 'analysis', deliverable: '分析上传数据', scope: 'other', lengthBasis: '按分析任务自动分配', language: 'zh-CN' },
  }), { fallbackQuery: '分析数据', attachments: [attachment] });
  assert.strictEqual(valid.fallback, false);
  assert.strictEqual(valid.intent, 'analyze');
  assert.deepStrictEqual(valid.skillIds, ['academic-writing-core', 'data-analysis']);
  assert.strictEqual(valid.tool.name, 'data_analysis');

  const invalid = parseAgentPlan('{"tool":{"name":"shell"}}', { fallbackQuery: '写正文' });
  assert.strictEqual(invalid.fallback, true);
  assert.match(invalid.validationError, /intent/);

  const unauthorized = parseAgentPlan(JSON.stringify({
    intent: 'analyze', skillIds: ['academic-writing-core'], needsProjectSources: false, queries: [], tool: { name: 'shell' }, outputContract: { type: 'analysis', deliverable: '分析数据', scope: 'other', lengthBasis: '按分析任务自动分配', language: 'zh-CN' },
  }), { fallbackQuery: '分析数据' });
  assert.strictEqual(unauthorized.fallback, true);
  assert.match(unauthorized.validationError, /未授权/);

  const unknownSkill = parseAgentPlan(JSON.stringify({
    intent: 'write', skillIds: ['academic-writing-core', 'unknown-skill'], needsProjectSources: false, queries: [], tool: null, outputContract: { type: 'section', deliverable: '写正文', scope: 'subsection', lengthBasis: '按项目类型自动分配', language: 'zh-CN' },
  }), { fallbackQuery: '写正文', allowedSkillIds: ['academic-writing-core'] });
  assert.strictEqual(unknownSkill.fallback, true);
  assert.match(unknownSkill.validationError, /未注册 Skill/);

  const correctedPaper = parseAgentPlan(JSON.stringify({
    intent: 'write', skillIds: ['academic-writing-core', 'thesis-planning'], needsProjectSources: false, queries: [], tool: null,
    outputContract: { type: 'abstract', deliverable: '生成摘要', scope: 'abstract', lengthBasis: '按摘要规范自动分配', language: 'zh-CN' },
  }), {
    fallbackQuery: '帮我写一篇关于生育支持政策的小论文',
    allowedSkillIds: ['academic-writing-core', 'thesis-planning'],
  });
  assert.strictEqual(correctedPaper.outputContract.type, 'paper');
  assert.match(correctedPaper.outputContract.deliverable, /整篇论文/);

  const machine = new AgentRunState('run-1');
  machine.move('VALIDATING');
  machine.move('PLANNING');
  machine.move('GENERATING');
  machine.move('AUDITING');
  machine.move('SAVING');
  machine.move('COMPLETED');
  assert.strictEqual(machine.state, 'COMPLETED');
  assert.throws(() => machine.move('FAILED'), /非法 Agent 状态转换/);

  const legalPaths = [
    ['VALIDATING', 'CLARIFYING', 'SAVING', 'COMPLETED'],
    ['VALIDATING', 'PLANNING', 'RETRIEVING', 'GENERATING', 'AUDITING', 'SAVING', 'COMPLETED'],
    ['VALIDATING', 'PLANNING', 'RUNNING_TOOL', 'GENERATING', 'AUDITING', 'SAVING', 'COMPLETED'],
    ['VALIDATING', 'PLANNING', 'RETRIEVING', 'RUNNING_TOOL', 'GENERATING', 'AUDITING', 'SAVING', 'COMPLETED'],
  ];
  for (const path of legalPaths) {
    const state = new AgentRunState(`path-${path.join('-')}`);
    path.forEach((next) => state.move(next));
    assert.strictEqual(state.state, 'COMPLETED');
  }
  for (const terminal of ['FAILED', 'CANCELED']) {
    const state = new AgentRunState(`terminal-${terminal}`);
    state.move('VALIDATING');
    if (terminal === 'FAILED') state.fail(new Error('test failure'));
    else state.fail(Object.assign(new Error('test cancel'), { name: 'AbortError' }));
    assert.strictEqual(state.state, terminal);
  }
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '连接成功' }, finish_reason: 'stop' }], usage: { total_tokens: 4 } }),
  });
  try {
    const providers = new ProviderRegistry({ test: { label: 'Test', endpoint: 'https://example.invalid', model: 'test-model', protocol: 'openai-compatible' } });
    const response = await providers.complete('test', 'key', [{ role: 'user', content: 'hi' }]);
    assert.strictEqual(response.content, '连接成功');
    assert.strictEqual(response.usage.total_tokens, 4);
  } finally {
    global.fetch = originalFetch;
  }

  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-skill-'));
  try {
    const skillFolder = path.join(folder, 'literature-review');
    fs.mkdirSync(skillFolder, { recursive: true });
    fs.writeFileSync(path.join(skillFolder, 'SKILL.md'), '---\nname: 社科论文\ndescription: test\n---\n# 写作规则\n证据优先。', 'utf8');
    const coreFolder = path.join(folder, 'academic-writing-core');
    fs.mkdirSync(coreFolder, { recursive: true });
    fs.writeFileSync(path.join(coreFolder, 'SKILL.md'), '---\nname: 通用写作\ndescription: core\n---\n# 通用规则\n不虚构。', 'utf8');
    const skills = new SkillRuntime(folder);
    const result = skills.composePrompt({ type: '硕士学位论文', domains: ['管理学'] }, '请写文献综述', ['academic-writing-core', 'literature-review']);
    assert.deepStrictEqual(result.skill.ids, ['academic-writing-core', 'literature-review']);
    assert.match(result.prompt, /证据优先/);

    const routed = new SkillRuntime(path.join(__dirname, '../assets/skills'));
    const empirical = routed.composePrompt({}, '请对 CSV 数据做实证分析并完成可视化', ['academic-writing-core', 'empirical-writing', 'data-analysis', 'data-visualization']);
    assert.match(empirical.prompt, /社科定量统计分析/);
    assert.match(empirical.prompt, /数据可视化与表图规范/);
    assert.match(empirical.prompt, /经验材料的组织/);
    assert.ok(routed.fallbackSkillIds('请写研究设计并做实证分析、数据分析和可视化').length <= 4);
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }

  const quality = evaluateRun({
    plan: valid,
    retrieval: { hits: [{ id: 'e1' }] },
    toolResult: { kind: 'data-analysis', cacheHit: true },
    draft: { content: '<p>正文<sup data-footnote="1">1</sup></p>', mappings: ['E1'], checks: ['核验'] },
  });
  const summary = summarizeRuns([{ status: 'COMPLETED', durationMs: 100, quality }]);
  assert.strictEqual(summary.completionRate, 1);
  assert.strictEqual(summary.toolCacheHitRate, 1);
  console.log('agent runtime test passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
