const assert = require('assert');
const {
  auditParagraphLogic,
  auditViewpointAlignment,
  buildAssembledThesis,
  buildReadinessDraft,
  createThesisUnit,
  ensureThesisControl,
  missingRequirements,
  normalizeThesisProfile,
} = require('./thesis-controller');

const incomplete = { type: '硕士学位论文', thesisProfile: { targetWords: 50000 }, documents: [] };
assert(missingRequirements(incomplete).length >= 4);
assert(buildReadinessDraft(incomplete).content.includes('建议章节与字数预算'));

const profile = normalizeThesisProfile({
  targetWords: 50000,
  researchQuestion: '数字治理如何影响基层服务可及性？',
  viewpoints: '数字能力通过组织协同影响服务可及性\n不同地区存在边界条件',
  methodology: '面板回归',
  dataMaterials: '2015—2024 年县域面板数据',
  schoolOrJournal: '学院硕士论文模板',
});
assert.strictEqual(profile.viewpoints[0].id, 'V1');
const completeProject = { type: '硕士学位论文', thesisProfile: profile, documents: [{ status: 'parsed', text: '可引用的研究材料', extension: '.pdf' }, { status: 'saved', extension: '.csv' }] };
assert.strictEqual(missingRequirements(completeProject).length, 0);
assert.strictEqual(ensureThesisControl(completeProject).chapters.length, 7);
assert(missingRequirements({ ...completeProject, documents: [] }).some((item) => item.includes('已成功解析')));
assert(missingRequirements({ ...completeProject, documents: completeProject.documents.slice(0, 1) }).some((item) => item.includes('CSV/XLSX')));
assert.deepStrictEqual(auditViewpointAlignment('数字能力推动组织协同。', [profile.viewpoints[0]]), []);
assert(auditParagraphLogic('短段落。\n\n' + '这是一个较长但没有明确收束标记的段落。'.repeat(20)).length >= 1);

const workflow = { sectionId: 'literature-review', section: '文献综述' };
const unit = createThesisUnit(completeProject, workflow, '撰写文献综述的理论脉络');
assert.strictEqual(unit.chapterId, 'chapter-2');
assert.strictEqual(unit.sequence, 1);
const firstDraft = { id: 'old', mode: 'api', content: '# 文献综述\n\n旧版本正文。', citations: ['A'], updatedAt: '2026-01-01', thesisUnit: unit, workflow };
const revisedDraft = { id: 'new', mode: 'api', content: '# 文献综述\n\n新版本正文。', citations: ['B'], updatedAt: '2026-01-02', thesisUnit: unit, workflow };
const assembled = buildAssembledThesis({ ...completeProject, drafts: [firstDraft, revisedDraft] });
assert(assembled.content.includes('新版本正文'));
assert(!assembled.content.includes('旧版本正文'));
assert.deepStrictEqual(assembled.citations, ['B']);

console.log('thesis controller test passed');
