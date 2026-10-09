const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const { randomUUID } = require('node:crypto');
const root = path.resolve('.ui-smoke', `rag-isolation-${randomUUID()}`);
let profile = root;
const originalLoad = Module._load;
Module._load = function(name, ...args) { return name === 'electron' ? { app: { getPath: () => profile } } : originalLoad.call(this, name, ...args); };
function freshStore() { delete require.cache[require.resolve('./rag-store')]; return require('./rag-store'); }
(async () => {
  try {
    let store = freshStore();
    const make = (id, text) => ({ id, documents: [{ id: 'shared-id', name: '同名文档.txt', fingerprint: 'same', parserVersion: 1, status: 'parsed', text }] });
    const a = make('a', '项目甲专属证据：农村女性生育支持政策。');
    const b = make('b', '项目乙专属证据：城市养老服务政策。');
    await Promise.all([store.indexProject(a), store.indexProject(b)]);
    const results = await Promise.all([store.retrieve(a, '政策'), store.retrieve(b, '政策'), store.retrieveMulti(b, ['政策', '服务'])]);
    assert(results[0].hits.every(hit => hit.projectId === 'a' && hit.text.includes('项目甲')));
    assert(results[1].hits.every(hit => hit.projectId === 'b' && hit.text.includes('项目乙')));
    assert(results[2].hits.every(hit => hit.projectId === 'b'));
    fs.copyFileSync(path.join(root, 'library/a/rag-index.json'), path.join(root, 'library/b/rag-index.json'));
    store = freshStore();
    assert((await store.retrieve(b, '政策')).hits.every(hit => hit.projectId === 'b' && !hit.text.includes('项目甲')), '错放的其他项目索引必须拒绝并重建');
    b.documents[0].text = '项目乙更正版政策证据。';
    assert((await store.retrieve(b, '政策')).hits.every(hit => hit.text.includes('更正版')), '相同指纹也不能复用旧正文');
    b.documents = [];
    assert.equal((await store.retrieve(b, '政策')).hits.length, 0, '删除资料后缓存不得召回旧内容');
    await assert.rejects(store.retrieve({ id: '../a', documents: [] }, '政策'), /项目ID/);
    profile = path.join(root, 'other-profile');
    const other = make('a', '另一工作区的独立内容。');
    assert((await store.retrieve(other, '内容')).hits.every(hit => !hit.text.includes('项目甲')), '缓存还须隔离工作区根目录');
    console.log('RAG project/namespace/profile isolation, concurrent queries, corrupt index rebuild and removal invalidation passed');
  } finally { Module._load = originalLoad; fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });
