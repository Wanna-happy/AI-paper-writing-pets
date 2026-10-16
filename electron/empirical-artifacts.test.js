const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const JSZip = require('jszip');
const { resultVersion, artifactList, artifactFile, artifactWordTable } = require('./empirical-artifacts');
async function main() {
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-test-'));
try {
  const result = { stepId: 'a1', tables: [{ title: '主回归结果', columns: ['变量', '系数'], rows: [['=HYPERLINK("url")', 2], ['x', -1], ['<script>alert(1)</script>', 3]] }], code: 'print("真实代码")', files: [] };
  const plan = { id: 'plan', projectId: 'p', conversationId: 'c', revision: 2, steps: [{ id: 'a1', label: '主回归' }], results: [result], history: [{ revision: 1, steps: [], results: [{ ...result, code: 'print("旧版")' }] }] };
  const project = { id: 'p', empiricalPlans: { c: plan } };
  assert.equal(resultVersion(project, 'c', 1).results[0].code, 'print("旧版")');
  assert.throws(() => resultVersion(project, 'other', 1));
  assert.throws(() => resultVersion(project, 'c', 9));
  const entries = artifactList(plan);
  assert.equal(entries.length, 3); assert.equal(entries[0].name, '主回归结果');
  const csv = artifactFile(plan, entries[0], root);
  assert.equal(csv.extension, 'csv'); assert.ok(csv.data.toString().includes("'=HYPERLINK")); assert.ok(csv.data.toString().includes('"-1"'));
  const word = await artifactWordTable(project, result.tables[0], csv.name);
  assert.equal(word.extension, 'docx');
  const xml = await (await JSZip.loadAsync(word.data)).file('word/document.xml').async('string');
  assert.match(xml, /<w:insideH w:val="none"/);
  assert.match(xml, /<w:insideV w:val="none"/);
  assert.match(xml, /HYPERLINK/);
  assert.ok(xml.includes('&lt;script&gt;') && !xml.includes('<script>'));
  assert.equal(artifactFile(plan, entries[1], root).data.toString(), result.code);
  assert.throws(() => artifactFile(plan, { ...entries[0], revision: 1 }, root));
  assert.throws(() => artifactFile(plan, { ...entries[0], index: 99 }, root));
  const foreign = path.join(os.tmpdir(), 'not-in-result-root.png');
  result.files = [foreign]; assert.throws(() => artifactFile(plan, artifactList(plan)[1], root));
  const fakePng = path.join(root, 'fake.png'); fs.writeFileSync(fakePng, 'not PNG');
  result.files = [fakePng]; assert.throws(() => artifactFile(plan, artifactList(plan)[1], root), /PNG/);
  console.log('实证文件版本、项目隔离、导出来源与 CSV 公式防护通过');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
