const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { SkillRuntime, extractMarkdownSection } = require('./skills/skill-runtime');

const skillsRoot = path.join(__dirname, '../assets/skills');
const expectedSkillIds = [
  'academic-writing-core',
  'conclusion-writing',
  'data-analysis',
  'data-visualization',
  'empirical-writing',
  'introduction-writing',
  'journal-submission',
  'literature-review',
  'research-design',
  'revision',
  'theoretical-foundation',
  'thesis-planning',
];

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert(match, 'SKILL.md 必须以 YAML frontmatter 开头');
  const entries = match[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const separator = line.indexOf(':');
    assert(separator > 0, `无效 frontmatter 行：${line}`);
    return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')];
  });
  return Object.fromEntries(entries);
}

const runtime = new SkillRuntime(skillsRoot);
const catalog = runtime.getCatalog();
assert.deepStrictEqual(catalog.map((skill) => skill.id).sort(), expectedSkillIds);
assert(!fs.existsSync(path.join(skillsRoot, 'paper-write-4ss')));
assert(!fs.existsSync(path.join(skillsRoot, 'social-science-thesis-writing')));
assert(!fs.existsSync(path.join(skillsRoot, 'theory-dialogue')));

for (const skillId of expectedSkillIds) {
  const skillFolder = path.join(skillsRoot, skillId);
  const source = fs.readFileSync(path.join(skillFolder, 'SKILL.md'), 'utf8');
  const frontmatter = parseFrontmatter(source);
  assert.deepStrictEqual(Object.keys(frontmatter).sort(), ['description', 'name'], `${skillId} 只能包含 name 和 description`);
  assert.strictEqual(frontmatter.name, skillId, `${skillId} 的 name 必须与目录名一致`);
  assert(frontmatter.description, `${skillId} 的 description 不能为空`);
  const body = source.replace(/^---[\s\S]*?---\s*/, '');
  assert(body.length >= 1200, `${skillId} 的执行规程过短`);
  assert((body.match(/^## /gm) || []).length >= 5, `${skillId} 缺少完整的执行阶段与质量门槛`);

  const runtimePath = path.join(skillFolder, 'runtime.json');
  const config = JSON.parse(fs.readFileSync(runtimePath, 'utf8'));
  assert(Array.isArray(config.references), `${skillId} runtime.json 缺少 references`);
  for (const definition of config.references) {
    const reference = runtime.readReference(runtime.skills.get(skillId), definition);
    assert(reference, `${skillId} 的引用不存在或章节标题不匹配：${definition.path}${definition.section ? `#${definition.section}` : ''}`);
    assert(reference.source.length <= definition.maxCharacters, `${skillId} 引用超出字符预算`);
  }
}

const sample = '# A\nalpha\n## B\nbeta\n### C\ngamma\n## D\ndelta';
assert.strictEqual(extractMarkdownSection(sample, '## B'), '## B\nbeta\n### C\ngamma');
assert.strictEqual(extractMarkdownSection(sample, '## Missing'), '');

const routingCases = [
  ['请帮我选题并写摘要', 'thesis-planning'],
  ['撰写论文引言', 'introduction-writing'],
  ['完成文献综述和研究缺口', 'literature-review'],
  ['设计访谈与编码方案', 'research-design'],
  ['解释回归与稳健性结果', 'empirical-writing'],
  ['分析 CSV 描述统计', 'data-analysis'],
  ['生成相关热力图', 'data-visualization'],
  ['撰写理论基础与分析框架', 'theoretical-foundation'],
  ['提炼理论贡献', 'conclusion-writing'],
  ['撰写结论与局限', 'conclusion-writing'],
  ['回复审稿意见', 'journal-submission'],
  ['润色并降重这段正文', 'revision'],
];
for (const [task, expectedSkillId] of routingCases) {
  const selected = runtime.fallbackSkillIds(task);
  assert.strictEqual(selected[0], 'academic-writing-core');
  assert(selected.includes(expectedSkillId), `${task} 未路由到 ${expectedSkillId}`);
  assert(selected.length <= 4);
}

const literatureReviewSkill = runtime.composePrompt({}, '完成文献综述', ['academic-writing-core', 'literature-review']);
assert(literatureReviewSkill.prompt.includes('从文献归纳研究脉络'));
assert(literatureReviewSkill.prompt.includes('用研究分支生成标题'));
assert(literatureReviewSkill.prompt.includes('生育率的估计'));
assert(literatureReviewSkill.prompt.includes('不能自动等同于分节标题'));
assert(literatureReviewSkill.prompt.includes('不是固定模板'));

const corePrompt = runtime.composePrompt({}, '撰写毕业论文正文', ['academic-writing-core']);
assert(corePrompt.prompt.includes('多 Skill 统一生成协议'));
assert(corePrompt.prompt.includes('不是多个独立写作者'));
assert(corePrompt.prompt.includes('不保留 Skill 拼接边界'));
assert(corePrompt.prompt.includes('标题标签使用毕业论文全文的绝对层级'));
assert(corePrompt.prompt.includes('三线表语义'));
assert(corePrompt.prompt.includes('Word 导出层统一处理'));

console.log('skill runtime test passed');
