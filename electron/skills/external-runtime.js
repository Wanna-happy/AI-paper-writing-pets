const fs = require('node:fs');
const path = require('node:path');
const { CORE_SKILL_ID, PLANNING_SKILL_ID, ANALYSIS_SKILL_ID, LEGACY_IDS, PRODUCT_CONTRACT } = require('./research-adapter');
const SKILL_RUNTIME_VERSION = 3;
function skillBody(s) { return String(s || '').replace(/^---[\s\S]*?---\s*/, '').trim(); }
function extractMarkdownSection(source, heading) {
  if (!heading) return String(source || '').trim();
  const lines = source.split(/\r?\n/), start = lines.findIndex(line => line.trim() === heading.trim());
  if (start < 0) return '';
  const level = heading.match(/^#+/)?.[0].length || 6;
  let end = start + 1;
  while (end < lines.length && !(lines[end].match(/^(#+)\s/)?.[1].length <= level)) end++;
  return lines.slice(start, end).join('\n').trim();
}
function frontmatterValue(source, key) {
  const lines = (source.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] || '').split(/\r?\n/);
  const start = lines.findIndex(line => line.startsWith(`${key}:`));
  if (start < 0) return '';
  const value = lines[start].slice(key.length + 1).trim();
  if (/^[>|][-+]?\d*$/.test(value)) {
    const body = [];
    for (let i = start + 1; i < lines.length && (!lines[i].trim() || /^\s/.test(lines[i])); i++) body.push(lines[i].trim());
    return body.join(value.startsWith('>') ? ' ' : '\n').trim();
  }
  return value.replace(/^['"]|['"]$/g, '');
}
function readRuntimeConfig(folder) {
  try { return JSON.parse(fs.readFileSync(path.join(folder, 'runtime.json'), 'utf8')); }
  catch { return { references: [] }; }
}
function readSkill(folder) {
  const filePath = path.join(folder, 'SKILL.md');
  if (!fs.existsSync(filePath)) return null;
  const source = fs.readFileSync(filePath, 'utf8');
  return { id: path.basename(folder), name: frontmatterValue(source, 'name') || path.basename(folder),
    description: frontmatterValue(source, 'description'), source, filePath, ...readRuntimeConfig(folder) };
}
function terms(value) {
  const lower = String(value || '').toLowerCase(), result = lower.match(/[a-z][a-z0-9-]{2,}/g) || [];
  for (const chunk of lower.match(/[\u3400-\u9fff]+/g) || []) for (let i = 0; i < chunk.length - 1; i++) result.push(chunk.slice(i, i + 2));
  return [...new Set(result)];
}
const DOMAIN_HINTS = {
  '经济学': 'economics econometrics causal-inference', '管理学': 'management organization case-study',
  '教育学': 'education teaching pedagogy survey measurement qualitative', '社会学': 'sociology social qualitative survey',
  '心理学': 'psychology measurement experiment thematic', '政治学': 'political policy causal survey',
  '文学': 'literature humanities text interpretation', '历史学': 'history humanities archival',
  '哲学': 'philosophy humanities argument', '法学': 'law legal policy',
  '传播学': 'communication media text survey', '新闻学': 'communication journalism media',
  '理学': 'science mathematics physics chemistry biology', '工学': 'engineering computer materials technology',
  '农学': 'agriculture plant ecology environment', '医学': 'medicine clinical biomedical health systematic-review',
  '艺术学': 'arts humanities design aesthetics',
};
const ROUTES = [
  [/系统综述|PRISMA/i, '52-keemanxp-slr-prisma::slr-prisma'],
  [/访谈|主题分析|定性编码/i, '53-keemanxp-thematic-analysis-skill::thematic-analysis'],
  [/文献综述|研究现状|研究缺口/i, LEGACY_IDS['literature-review']],
  [/引言|绪论/i, LEGACY_IDS['introduction-writing']],
  [/理论基础|理论框架|假设推导/i, LEGACY_IDS['theoretical-foundation']],
  [/选题|开题|摘要|关键词/i, LEGACY_IDS['thesis-planning']],
  [/稳健性|敏感性|异质性/i, LEGACY_IDS['empirical-inference']],
  [/工具变量|2SLS/i, '67-econfin-workflow-toolkit::iv-estimation'],
  [/DID|双重差分/i, '67-econfin-workflow-toolkit::did-analysis'],
  [/面板|固定效应/i, '67-econfin-workflow-toolkit::panel-data'],
  [/断点|RDD/i, '67-econfin-workflow-toolkit::rdd-analysis'],
  [/合成控制/i, '67-econfin-workflow-toolkit::synthetic-control'],
  [/描述统计|相关分析/i, LEGACY_IDS['data-analysis']],
  [/数据分析|回归|DTW|聚类|问卷|预测/i, LEGACY_IDS['empirical-linear-models']],
  [/可视化|图表|绘图|热力图/i, LEGACY_IDS['data-visualization']],
  [/润色|修订|改写|降重/i, LEGACY_IDS.revision],
  [/引用核验|参考文献核验/i, '67-econfin-workflow-toolkit::reference-verify'],
  [/投稿|审稿|回复信/i, LEGACY_IDS['journal-submission']],
  [/研究设计|研究方法/i, LEGACY_IDS['research-design']],
  [/结果解释|实证正文|回归解释/i, LEGACY_IDS['empirical-writing']],
];
class SkillRuntime {
  constructor(rootPath = path.join(__dirname, '../../assets/research-skills')) {
    this.rootPath = rootPath;
    if (!fs.existsSync(rootPath) && path.basename(rootPath) === 'skills') this.rootPath = path.join(path.dirname(rootPath), 'research-skills');
    this.skills = new Map(); this.reload();
  }
  safePath(relative, base = this.rootPath) {
    const root = fs.realpathSync(this.rootPath), file = path.resolve(base, relative);
    if (!file.startsWith(`${root}${path.sep}`)) return null;
    if (!fs.existsSync(file)) return file;
    const real = fs.realpathSync(file);
    return real.startsWith(`${root}${path.sep}`) ? real : null;
  }
  reload() {
    this.skills.clear();
    this.blockedDirectories = [];
    const file = path.join(this.rootPath, 'catalog/skills-enriched.json'); this.external = fs.existsSync(file);
    if (!fs.existsSync(this.rootPath)) return;
    if (!this.external) {
      for (const entry of fs.readdirSync(this.rootPath, { withFileTypes: true })) if (entry.isDirectory()) {
        const skill = readSkill(path.join(this.rootPath, entry.name)); if (skill) this.skills.set(skill.id, skill);
      }
      return;
    }
    const enriched = new Map(JSON.parse(fs.readFileSync(file, 'utf8')).skills.map(entry => [entry.path, entry]));
    const canonical = JSON.parse(fs.readFileSync(path.join(this.rootPath, 'catalog/skills.json'), 'utf8'));
    for (const original of canonical.skills) {
      const entry = { ...original, ...enriched.get(original.path) };
      entry.description = entry.description_effective || original.description;
      const filePath = this.safePath(entry.path);
      const disabledReason = entry.name === 'Significance-Search' ? '不能按显著性选择控制变量'
        : entry.commercial_use === 'restricted' ? '非商业许可来源，暂不自动调用' : '';
      if (!filePath || (!disabledReason && !fs.existsSync(filePath))) throw new Error(`导入技能缺失：${entry.path}`);
      if (disabledReason) this.blockedDirectories.push(entry.commercial_use === 'restricted'
        ? path.resolve(this.rootPath, 'skills', entry.collection) : path.dirname(filePath));
      const id = entry.qualified_name;
      if (this.skills.has(id)) throw new Error(`重复技能标识：${id}`);
      this.skills.set(id, { ...entry, id, filePath, references: [], disabledReason });
    }
  }
  resolveId(id) { return this.skills.has(id) ? id : LEGACY_IDS[id] || id; }
  isBlockedFile(file) {
    const value = file.toLowerCase();
    return this.blockedDirectories.some(dir => value === dir.toLowerCase() || value.startsWith((dir + path.sep).toLowerCase()));
  }
  getCatalog(options) {
    let skills = [...this.skills.values()].filter(s => !s.disabledReason);
    if (options) {
      const { project = {}, task = '', limit = 24 } = options, query = terms(task);
      const domains = Array.isArray(project.domains) ? project.domains : [project.domain || ''];
      const context = terms([...domains, ...domains.map(domain => DOMAIN_HINTS[domain] || ''), project.title, project.goal].join(' '));
      const preferred = new Set([...this.fallbackSkillIds(task, project), PLANNING_SKILL_ID, ANALYSIS_SKILL_ID]);
      skills = skills.map(skill => {
        const text = `${skill.name} ${skill.description} ${JSON.stringify(skill.tags || {})}`.toLowerCase();
        return { skill, score: (preferred.has(skill.id) ? 40 : 0) + query.reduce((n, t) => n + (text.includes(t) ? 3 : 0), 0)
          + context.reduce((n, t) => n + (text.includes(t) ? .25 : 0), 0) + (skill.tier === 'core' ? 1 : 0) };
      }).sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id)).slice(0, limit).map(x => x.skill);
      const planning = this.skills.get(PLANNING_SKILL_ID);
      if (planning && !skills.some(skill => skill.id === planning.id) && limit > 0) skills.splice(Math.max(0, skills.length - 1), 1, planning);
    }
    return skills.map(({ id, name, description, tags, license, commercial_use }) => ({ id, name,
      description: options ? description.slice(0, 1000) : description, tags, license, commercial_use }));
  }
  fallbackSkillIds(task, project = {}, role = '') {
    if (!this.external) return [...this.skills.keys()].slice(0, 4);
    const defaults = role === 'coordinator' ? [PLANNING_SKILL_ID] : ['analyst', 'preparer'].includes(role) ? [ANALYSIS_SKILL_ID] : role === 'collector' ? [] : [CORE_SKILL_ID];
    return [...new Set([...defaults, ...ROUTES.filter(([rx]) => rx.test(String(task))).map(([, id]) => id)])]
      .filter(id => this.skills.has(id) && !this.skills.get(id).disabledReason).slice(0, 4);
  }
  readDocument(id, relative = '', offset = 0, limit = 12000) {
    const skill = this.skills.get(this.resolveId(id));
    if (!skill || skill.disabledReason) throw new Error('技能不存在或未启用');
    const file = relative ? this.safePath(relative, path.dirname(skill.filePath)) : skill.filePath;
    if (!file || this.isBlockedFile(file) || !fs.existsSync(file) || !fs.statSync(file).isFile() || !/\.(md|txt|json|py|sh|r|do|tex|yaml|yml|toml)$/i.test(file)) throw new Error('只能读取技能库内已启用的文本文件');
    const source = fs.readFileSync(file, 'utf8'), start = Math.max(0, Math.floor(Number(offset) || 0));
    const size = Math.min(20000, Math.max(1, Math.floor(Number(limit) || 12000)));
    return { id: skill.id, path: path.relative(this.rootPath, file), totalCharacters: source.length,
      offset: start, nextOffset: start + size < source.length ? start + size : null, text: source.slice(start, start + size) };
  }
  readReference(skill, definition) {
    const def = typeof definition === 'string' ? { path: definition } : definition;
    if (!def?.path) return null;
    const file = this.safePath(def.path, path.dirname(skill.filePath));
    if (!file || this.isBlockedFile(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
    const source = extractMarkdownSection(fs.readFileSync(file, 'utf8'), def.section);
    return source ? { key: `${file}#${def.section || ''}`, label: def.label || path.basename(file), source: source.slice(0, def.maxCharacters || 12000) } : null;
  }
  composePrompt(project, task, skillIds = this.fallbackSkillIds(task, project), maxCharacters = 28000) {
    const selected = [...new Set(skillIds.map(id => this.resolveId(id)))].map(id => this.skills.get(id)).filter(s => s && !s.disabledReason).slice(0, 4);
    const budget = Math.max(0, maxCharacters - (this.external ? PRODUCT_CONTRACT.length * 2 + 1000 : 0));
    const sections = selected.map(skill => {
      const source = skill.source || fs.readFileSync(skill.filePath, 'utf8'), body = skillBody(source);
      const size = Math.floor(budget / (selected.length || 1));
      let section = `## Skill：${skill.name}\nID：${skill.id}\n${body.slice(0, size)}`;
      if (body.length > size) section += '\n[已按预算节选；请用read_research_skill分页读取后续内容及引用。]';
      if (!this.external) for (const def of skill.references || []) { const read = this.readReference(skill, def); if (read) section += '\n' + read.source; }
      return section;
    });
    const body = sections.join('\n\n');
    return { skill: { ids: selected.map(s => s.id), names: selected.map(s => s.name), version: SKILL_RUNTIME_VERSION },
      prompt: this.external ? `\n\n${PRODUCT_CONTRACT}\n\n# 本轮外部研究技能\n${body}\n\n${PRODUCT_CONTRACT}`
        : body ? `\n\n# 本轮专用 Skill\n${body.slice(0, maxCharacters)}` : '' };
  }
}
module.exports = { CORE_SKILL_ID, SKILL_RUNTIME_VERSION, SkillRuntime, extractMarkdownSection, readSkill, readRuntimeConfig, frontmatterValue };
