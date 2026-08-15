const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-rag-'));
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') return { app: { getPath: () => userData } };
  return originalLoad.call(this, request, parent, isMain);
};

async function run() {
  try {
    const ragStore = require('./rag-store');
    const project = {
      id: 'project-1',
      documents: [{
        id: 'document-1',
        name: '研究资料.txt',
        fingerprint: 'fingerprint-1',
        parserVersion: 1,
        status: 'parsed',
        text: '数字治理能力通过组织协同机制改善公共服务可及性。组织协同包括信息共享、流程衔接和跨部门合作。',
      }],
    };
    const firstIndex = await ragStore.indexProject(project);
    assert.strictEqual(firstIndex.version, 2);
    assert.strictEqual(firstIndex.chunkVersion, 1);
    assert.strictEqual(firstIndex.embeddingVersion, 1);
    assert.strictEqual(firstIndex.documents['document-1'].parserVersion, 1);
    const indexPath = path.join(userData, 'library', 'project-1', 'rag-index.json');
    assert.ok(fs.existsSync(indexPath));
    const firstChunkIds = firstIndex.chunks.map((chunk) => chunk.id);

    project.documents.push({
      id: 'document-2',
      name: '补充资料.txt',
      fingerprint: 'fingerprint-2',
      parserVersion: 1,
      status: 'parsed',
      text: '跨部门合作需要统一信息标准，并通过流程再造降低组织协调成本。',
    });
    const incremental = await ragStore.indexProject(project);
    assert.deepStrictEqual(incremental.chunks.filter((chunk) => chunk.documentId === 'document-1').map((chunk) => chunk.id), firstChunkIds);
    assert.ok(incremental.chunks.some((chunk) => chunk.documentId === 'document-2'));

    const first = await ragStore.retrieve(project, '组织协同如何改善公共服务？', 3);
    const repeated = await ragStore.retrieve(project, '组织协同如何改善公共服务？', 3);
    assert.deepStrictEqual(repeated, first);
    assert.ok(first.hits.length >= 1);

    project.documents[0].parserVersion = 2;
    await ragStore.retrieve(project, '组织协同如何改善公共服务？', 3);
    const rebuilt = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    assert.strictEqual(rebuilt.documents['document-1'].parserVersion, 2);
    console.log('rag persistence and cache test passed');
  } finally {
    Module._load = originalLoad;
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
