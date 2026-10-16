const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { SkillRuntime, extractMarkdownSection, frontmatterValue } = require('./skills/skill-runtime');
const { CORE_SKILL_ID, PLANNING_SKILL_ID, LEGACY_IDS } = require('./skills/research-adapter');
const root = path.resolve(__dirname, '../assets/research-skills');
const runtime = new SkillRuntime(root);
assert.equal(runtime.skills.size, 1107);
assert(!fs.existsSync(path.resolve(__dirname, '../assets/skills')), 'Removed skills must stay outside the product');
assert(runtime.getCatalog().every(s => s.id.includes('::') && s.description));
assert.equal(new Set(runtime.getCatalog().map(s => s.id)).size, runtime.getCatalog().length);
assert(!runtime.getCatalog().some(s => s.name === 'Significance-Search' || s.commercial_use === 'restricted'));
assert.throws(() => runtime.readDocument('67-econfin-workflow-toolkit::Significance-Search'), /未启用/);
assert.equal(frontmatterValue('---\nname: x\ndescription: >\n  first line\n  second line\n---\nbody', 'description'), 'first line second line');
assert.equal(frontmatterValue('---\nname: x\ndescription: |\n  first\n  second\n---', 'description'), 'first\nsecond');
assert.equal(extractMarkdownSection('# A\nalpha\n## B\nbeta\n### C\ngamma\n## D\ndelta', '## B'), '## B\nbeta\n### C\ngamma');
const requests = [
  ['教育学', '分析教师访谈并开展主题分析', '53-keemanxp-thematic-analysis-skill::thematic-analysis'],
  ['教育学', '写系统综述 PRISMA', '52-keemanxp-slr-prisma::slr-prisma'],
  ['经济学', '撰写文献综述', LEGACY_IDS['literature-review']],
  ['社会学', '执行面板固定效应', '67-econfin-workflow-toolkit::panel-data'],
];
for (const [domain, task, expected] of requests) {
  const selected = runtime.getCatalog({ project: { domains: [domain] }, task, limit: 24 });
  assert(selected.length <= 24);
  assert(selected.some(skill => skill.id === expected), `${task}: missing ${expected}`);
  assert(selected.some(skill => skill.id === PLANNING_SKILL_ID));
}
const prompt = runtime.composePrompt({ domains: ['教育学'] }, '写作', [CORE_SKILL_ID]);
assert(prompt.prompt.includes('本轮外部研究技能'));
assert(prompt.prompt.includes('PAPER_PET_RESULT'));
assert(prompt.prompt.length <= 28000);
assert(!prompt.skill.ids.includes('academic-writing-core'));
assert(runtime.composePrompt({}, '修改', ['revision']).skill.ids.includes(LEGACY_IDS.revision));
const id = '53-keemanxp-thematic-analysis-skill::thematic-analysis';
assert(runtime.readDocument(id).text.includes('Six-Phase'));
assert(runtime.readDocument(id, 'references/coding-guide.md').text.length > 100);
assert.throws(() => runtime.readDocument(id, '../../../../package.json'), /库内/);
assert.throws(() => runtime.readDocument(id, path.resolve(__dirname, '../package.json')), /库内/);
const page = runtime.readDocument(CORE_SKILL_ID, '', 0, 100);
assert.equal(page.text.length, 100); assert.equal(page.nextOffset, 100);
assert.equal(runtime.readDocument(CORE_SKILL_ID, '', 100, 100).offset, 100);
const methods = require('./empirical-workflow').methodCatalog();
for (const method of methods) assert(runtime.skills.has(method.skillId), `Unknown method skill: ${method.id}`);
assert.equal(methods.filter(m => m.status === 'requires-extension').length, 7);
// Backup integrity and full removal are part of the migration contract.
const imported = JSON.parse(fs.readFileSync(path.join(root, 'IMPORT.json'), 'utf8'));
const backup = path.resolve(__dirname, '..', imported.backup);
// Backups deliberately remain local and are not distributed with the source or app.
if (fs.existsSync(backup)) {
const manifest = JSON.parse(fs.readFileSync(path.join(backup, 'manifest.json'), 'utf8'));
assert.equal(manifest.skill_count, 21);
for (const [relative, expected] of Object.entries(manifest.files)) {
  const source = fs.readFileSync(path.join(backup, 'original-skills', relative));
  assert.equal(crypto.createHash('sha256').update(source).digest('hex'), expected, `Backup mismatch: ${relative}`);
}
}
console.log('external skill import, unique IDs, discipline/task routing, references, boundaries and gates verified; local backup checked when present');
