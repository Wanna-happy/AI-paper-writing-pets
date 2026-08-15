const fs = require('fs');
const path = require('path');

const SKILL_RUNTIME_VERSION = 2;
const CORE_SKILL_ID = 'academic-writing-core';

function skillBody(source) {
  return String(source || '').replace(/^---[\s\S]*?---\s*/, '').trim();
}

function readRuntimeConfig(skillPath) {
  const configPath = path.join(skillPath, 'runtime.json');
  if (!fs.existsSync(configPath)) return { references: [] };
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return { references: Array.isArray(config.references) ? config.references : [] };
  } catch {
    return { references: [] };
  }
}

function extractMarkdownSection(source, heading) {
  if (!heading) return String(source || '').trim();
  const lines = String(source || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === heading.trim());
  if (start < 0) return '';
  const level = heading.match(/^#+/)?.[0].length || 6;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const nextLevel = lines[index].match(/^(#+)\s/)?.[1].length;
    if (nextLevel && nextLevel <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n').trim();
}

function readSkill(skillPath) {
  const filePath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(filePath)) return null;
  const source = fs.readFileSync(filePath, 'utf8');
  const name = source.match(/^name:\s*(.+)$/m)?.[1]?.trim() || path.basename(skillPath);
  const description = source.match(/^description:\s*(.+)$/m)?.[1]?.trim() || '';
  return { id: path.basename(skillPath), name, description, filePath, source, ...readRuntimeConfig(skillPath) };
}

class SkillRuntime {
  constructor(rootPath) {
    this.rootPath = rootPath;
    this.skills = new Map();
    this.reload();
  }

  reload() {
    this.skills.clear();
    if (!fs.existsSync(this.rootPath)) return;
    for (const entry of fs.readdirSync(this.rootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skill = readSkill(path.join(this.rootPath, entry.name));
      if (skill) this.skills.set(skill.id, skill);
    }
  }

  getCatalog() {
    return [...this.skills.values()].map(({ id, name, description }) => ({ id, name, description }));
  }

  readReference(skill, definition) {
    const normalized = typeof definition === 'string' ? { path: definition } : definition;
    if (!normalized?.path) return null;
    const root = path.resolve(this.rootPath);
    const filePath = path.resolve(path.dirname(skill.filePath), normalized.path);
    if (!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
    const source = extractMarkdownSection(fs.readFileSync(filePath, 'utf8'), normalized.section);
    if (!source) return null;
    return {
      key: `${filePath}#${normalized.section || ''}`,
      label: normalized.label || normalized.section || path.basename(filePath, path.extname(filePath)),
      source: source.slice(0, Number(normalized.maxCharacters) || 12000),
    };
  }

  fallbackSkillIds(task) {
    const value = String(task || '');
    const skills = [CORE_SKILL_ID];
    if (/(?:实证|回归|假设检验|稳健性|变量|模型|中介|调节|因果|面板)/i.test(value)) skills.push('empirical-writing');
    if (/(?:数据分析|描述统计|相关|csv|xlsx)/i.test(value)) skills.push('data-analysis');
    if (/(?:可视化|图表|绘图|柱状图|散点图|热力图)/i.test(value)) skills.push('data-visualization');
    if (/(?:文献综述|研究现状|理论脉络|研究缺口)/i.test(value)) skills.push('literature-review');
    if (/(?:润色|改写|降重|修改|审校)/i.test(value)) skills.push('revision');
    if (/(?:研究设计|研究方法|问卷|访谈|案例研究|抽样|变量操作化|编码)/i.test(value)) skills.push('research-design');
    if (/(?:选题|开题|题目|标题|摘要|关键词)/i.test(value)) skills.push('thesis-planning');
    if (/(?:引言|绪论|研究缘起|问题提出|开头)/i.test(value)) skills.push('introduction-writing');
    if (/(?:理论基础|理论依据|核心概念|理论框架|分析框架|概念模型|机制模型|假设推导)/i.test(value)) skills.push('theoretical-foundation');
    if (/(?:结论|讨论|理论对话|理论贡献|理论意义|研究局限|局限|展望)/i.test(value)) skills.push('conclusion-writing');
    if (/(?:投稿|返修|审稿|评审意见|回复信|期刊格式|引用伦理)/i.test(value)) skills.push('journal-submission');
    return skills.filter((id) => this.skills.has(id)).slice(0, 4);
  }

  composePrompt(project, task, skillIds = this.fallbackSkillIds(task), maxCharacters = 28000) {
    const selected = [...new Set(skillIds)].map((id) => this.skills.get(id)).filter(Boolean);
    const loadedReferences = new Set();
    const sections = selected.map((skill) => `## Skill：${skill.name}\n${skillBody(skill.source)}`);
    for (const skill of selected) {
      for (const definition of skill.references) {
        const reference = this.readReference(skill, definition);
        if (!reference || loadedReferences.has(reference.key)) continue;
        loadedReferences.add(reference.key);
        sections.push(`## Skill 深度规则：${reference.label}\n${reference.source}`);
      }
    }
    const body = sections.join('\n\n').slice(0, maxCharacters);
    return {
      skill: { ids: selected.map((skill) => skill.id), names: selected.map((skill) => skill.name), version: SKILL_RUNTIME_VERSION },
      prompt: body ? `\n\n# 本轮专用 Skill\n${body}` : '',
    };
  }
}

module.exports = { CORE_SKILL_ID, SKILL_RUNTIME_VERSION, SkillRuntime, extractMarkdownSection, readSkill, readRuntimeConfig };
