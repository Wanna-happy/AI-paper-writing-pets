const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { verifyRealPaper } = require('./real-paper-report');
async function test() {
  const root = path.resolve('.ui-smoke', `report-${randomUUID()}`);
  assert(root.startsWith(path.resolve('.ui-smoke') + path.sep));
  fs.mkdirSync(root, { recursive: true });
  try {
    const evidence = [1, 2, 3].map(index => ({ documentName: `来源${index}`, text: '成本分担 影响家庭决策。' }));
    const documents = evidence.map(hit => ({ name: hit.documentName, text: '成本分担\n\n影响家庭决策。' }));
    const draft = { id: 'd', title: '合成小节', evidence, checks: [] };
    const project = { id: 'p', title: '合成验证', drafts: [draft] };
    const run = { id: 'r', status: 'COMPLETED', draftId: 'd', plan: { fallback: false, tasks: [{ role: 'writer' }] } };
    const repository = { database: { prepare: () => ({ get: () => ({ data: JSON.stringify(run) }) }) }, loadWorkspace: () => ({ projects: [project] }) };
    const content = length => `<p>${'论'.repeat(length)}${[1, 2, 3].map(n => `<sup data-footnote="${n}">${n}</sup>`).join('')}</p><section class="footnotes">${[1, 2, 3].map(n => `<p data-footnote="${n}"><sup>${n}</sup> 来源${n}</p>`).join('')}</section>`;
    draft.content = content(1000);
    const args = { repository, project, documents, output: root, requestId: 'r', sourceProjectId: 'source' };
    const valid = await verifyRealPaper(args);
    assert.equal(valid.ok, true);
    assert.equal(valid.evidenceSourceVerified, true, '正常空白合并不能误报证据变化');
    assert(fs.existsSync(path.join(root, 'paper.docx')));
    draft.content = content(3000);
    const long = await verifyRealPaper(args);
    assert.equal(long.pipelinePassed, true);
    assert.equal(long.ok, false, '链路通过不能掩盖篇幅不符合要求');
    evidence[0].text = '来源不存在的实证结论';
    await assert.rejects(verifyRealPaper(args), /evidence-source-mismatch/);
    console.log('Real-paper verification: source normalization, Word export and explicit length failure passed');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
