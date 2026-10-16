const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const { SqliteWorkspaceRepository } = require('./sqlite-workspace');
const { SkillRuntime } = require('./skills/skill-runtime');
const { CORE_SKILL_ID } = require('./skills/research-adapter');
const { isPublishableResearchFile, EXCLUDED_PATHS } = require('./skills/library-policy');
const { findPackProblems } = require('../scripts/verify-pack.cjs');
const policy = require('./agent/flow-policy');
const contextPolicy = require('./agent/context-policy');
const { inspectLength, countBodyWords } = require('./length-control');
const { parseLengthRequirement, buildLengthGuidance } = require('./writing-session');
const { reviewDelivery } = require('./quality/delivery-review');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-fix14-'));
let store;
async function main() {
  const databasePath = path.join(root, 'workspace.sqlite');
  const initial = new SqliteWorkspaceRepository(databasePath);
  initial.saveWorkspace({ projects: [{ id: 'old', title: 'synthetic old', documents: [], drafts: [], conversations: [{ id: 'c' }], activeConversationId: 'c' }] }); initial.close();
  const load = Module._load;
  Module._load = function(name, parent, isMain) {
    if (name === 'electron') return { app: { getPath: () => root }, safeStorage: { isEncryptionAvailable: () => true } };
    return load.call(this, name, parent, isMain);
  };
  try { store = require('./workspace-store'); } finally { Module._load = load; }
  const read = SqliteWorkspaceRepository.prototype.loadWorkspace;
  SqliteWorkspaceRepository.prototype.loadWorkspace = function() { throw new Error('synthetic transient read failure'); };
  try { assert.throws(() => store.createProject({ title: 'must not save' }), /读取失败/); }
  finally { SqliteWorkspaceRepository.prototype.loadWorkspace = read; }
  const inspect = new SqliteWorkspaceRepository(databasePath);
  assert.equal(inspect.loadWorkspace().projects[0].id, 'old', 'read failure must not delete old data');
  const stale = inspect.loadWorkspace();
  const created = store.createProject({ title: 'synthetic new', type: '课程论文', domains: ['教育学'] });
  assert.throws(() => inspect.saveWorkspace(stale), /重新加载/, 'stale snapshots cannot overwrite another writer');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'workspace-recovery.json'))).projects.length, 2);
  const privateId = randomUUID(), sharedId = randomUUID();
  fs.mkdirSync(path.join(root, 'conversation-files'));
  fs.writeFileSync(path.join(root, 'conversation-files', privateId + '.txt'), 'synthetic private');
  fs.writeFileSync(path.join(root, 'conversation-files', sharedId + '.txt'), 'synthetic shared');
  const privateFile = { id: privateId, extension: '.txt' }, sharedFile = { id: sharedId, extension: '.txt' };
  store.updateProject(created.id, { projectFiles: [privateFile, sharedFile] }); store.updateProject('old', { projectFiles: [sharedFile] });
  for (const parent of ['library', 'analysis-runs', 'analysis-dependencies']) { fs.mkdirSync(path.join(root, parent, created.id), { recursive: true }); fs.writeFileSync(path.join(root, parent, created.id, 'synthetic.txt'), 'synthetic'); }
  fs.writeFileSync(path.join(root, 'outside-owned-folders.txt'), 'keep');
  store.saveAgentRun({ id: 'r', projectId: created.id, conversationId: 'c', status: 'COMPLETED', startedAt: new Date().toISOString(), checkpoint: { attachments: [privateFile] } });
  store.saveToolRun({ id: 't', agentRunId: 'r', toolName: 'test', status: 'completed', createdAt: new Date().toISOString() });
  fs.writeFileSync(path.join(root, 'workspace.json'), JSON.stringify(store.loadWorkspace()));
  store.deleteProject(created.id);
  assert.equal(inspect.listAgentRuns(created.id).length, 0);
  assert.equal(inspect.database.prepare('SELECT COUNT(*) AS n FROM tool_runs WHERE id=?').get('t').n, 0);
  assert(!fs.existsSync(path.join(root, 'conversation-files', privateId + '.txt')));
  assert(fs.existsSync(path.join(root, 'conversation-files', sharedId + '.txt')));
  for (const parent of ['library', 'analysis-runs', 'analysis-dependencies']) assert(!fs.existsSync(path.join(root, parent, created.id)));
  assert(fs.existsSync(path.join(root, 'outside-owned-folders.txt')));
  for (const name of ['workspace.json', 'workspace-recovery.json']) assert(!fs.readFileSync(path.join(root, name), 'utf8').includes(created.id));
  inspect.close();
  const runtime = new SkillRuntime();
  for (const blocked of [...runtime.skills.values()].filter(s => s.disabledReason)) {
    const relative = path.relative(path.dirname(runtime.skills.get(CORE_SKILL_ID).filePath), blocked.filePath);
    assert.throws(() => runtime.readDocument(CORE_SKILL_ID, relative), /已启用/);
    assert.equal(runtime.readReference(runtime.skills.get(CORE_SKILL_ID), { path: relative }), null);
  }
  for (const prefix of EXCLUDED_PATHS) {
    assert(!isPublishableResearchFile(prefix + 'SKILL.md'));
    assert(findPackProblems([prefix + 'SKILL.md'], () => Buffer.from('synthetic')).some(p => p.includes('Excluded research')));
    assert(require('../package.json').build.files.includes('!' + prefix + '**/*'));
  }
  // A packaged library may omit disabled sources without breaking runtime startup.
  const library = path.join(root, 'packaged-library'); fs.mkdirSync(path.join(library, 'catalog'), { recursive: true });
  const originals = require('../assets/research-skills/catalog/skills.json').skills;
  const entries = originals.filter(s => s.qualified_name === CORE_SKILL_ID || s.qualified_name === '49-voidborne-d-humanize-chinese::humanize-chinese');
  const enriched = require('../assets/research-skills/catalog/skills-enriched.json').skills.filter(s => entries.some(e => e.path === s.path));
  fs.writeFileSync(path.join(library, 'catalog/skills.json'), JSON.stringify({ skills: entries })); fs.writeFileSync(path.join(library, 'catalog/skills-enriched.json'), JSON.stringify({ skills: enriched }));
  const core = entries.find(s => s.qualified_name === CORE_SKILL_ID); fs.mkdirSync(path.dirname(path.join(library, core.path)), { recursive: true }); fs.copyFileSync(runtime.skills.get(CORE_SKILL_ID).filePath, path.join(library, core.path));
  assert.equal(new SkillRuntime(library).getCatalog().length, 1);
  const csv = path.join(root, 'synthetic.csv'); fs.writeFileSync(csv, 'x,y\n1,2\n');
  const flow = require('./empirical-workflow'), file = { id: 'f', name: 'synthetic.csv', extension: '.csv' }, scope = { projectId: 'p', conversationId: 'c', resolveAttachment: () => csv };
  const proposal = flow.normalizeProposal({ researchQuestion: 'synthetic', dataDescription: 'synthetic', dataFile: 'f', steps: Array.from({ length: 18 }, () => ({ methodId: 'ols', purpose: 'synthetic', specification: 'y ~ x' })) }, { ...scope, attachments: [file] });
  policy.validatePlan(flow.executionPlan(flow.approvePlan(proposal, { id: proposal.id, revision: 1 }, scope)), (await import('./pi/registry.mjs')).ROLE_DEFINITIONS);
  const xls = path.join(root, 'synthetic.xls'); fs.writeFileSync(xls, 'synthetic');
  const imported = require('./project-files').expandPaths([xls]); assert.equal(imported.files.length, 0); assert.match(imported.rejected[0].reason, /XLSX/);
  await assert.rejects(require('./conversation-files').prepareConversationFiles([xls]), /XLSX/);
  assert.throws(() => require('./tools/data-profile').selectDataAttachment([{ id: 'x', name: 'synthetic.xls', extension: '.xls' }]), /XLSX/);
  assert.throws(() => require('./tools/data-profile').selectDataAttachment([{ id: 'x', name: 'synthetic.xls', extension: '.xls' }, file], 'synthetic.xls'), /XLSX/, 'explicit XLS requests must not silently select another CSV');
  const words = parseLengthRequirement('900–1100 words'); assert.equal(words.metric, 'words');
  assert.equal(parseLengthRequirement('1000字', '英文').metric, 'words'); assert.equal(parseLengthRequirement('1000汉字', '英文').metric, 'hanzi');
  assert.equal(parseLengthRequirement('用中文写1000字', '英文').metric, 'hanzi');
  assert.equal(parseLengthRequirement('用英文写1000字', '中文').metric, 'words');
  assert.equal(countBodyWords('<h1>Title</h1><p>Evidence-based research isn’t easy.[E1]</p><section class="footnotes">Source</section>'), 4);
  assert(inspectLength('<p>' + 'word '.repeat(1000) + '</p>', words).passed);
  assert(buildLengthGuidance({ language: '英文' }, '1000 words').includes('英文词'));
  assert.equal(reviewDelivery(['正文未检测到脚注引文，请人工核对。']).status, 'needs-review'); assert.equal(reviewDelivery(['正文引用了不存在的脚注编号。']).status, 'blocked');
  const files = [{ id: 'fresh', name: 'fresh.txt', excerpt: 'new '.repeat(10000) }, { id: 'old', name: 'private.txt', excerpt: 'must not send' }];
  assert.equal(contextPolicy.selectContextFiles(files, { branch: 'conversation', explicitIds: ['fresh'] }).length, 0);
  const selected = contextPolicy.selectContextFiles(files, { branch: 'writing', explicitIds: ['fresh'] }); assert.equal(selected.length, 1); assert(selected[0].excerpt.length <= 3000);
  assert(require('./conversation-files').buildConversationFileContext(selected).length <= 8000);
  assert.throws(() => contextPolicy.boundTranscript({ systemPrompt: '文'.repeat(100000), messages: [] }, { contextWindow: 8192 }), /预算/);
  console.log('fix14 storage, stale-write protection, deletion, license packaging, skill gates, step limits, XLS, English length, delivery review and context boundaries passed');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(async () => { await store?.closeWorkspace(); fs.rmSync(root, { recursive: true, force: true }); });
