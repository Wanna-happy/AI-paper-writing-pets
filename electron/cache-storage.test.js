const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { LruCache } = require('./lru-cache');
const {
  readDocumentCache,
  removeDocumentCache,
  writeDocumentCache,
} = require('./document-cache');
const { SCHEMA_VERSION, SqliteWorkspaceRepository } = require('./sqlite-workspace');

function testLru() {
  const cache = new LruCache({ max: 2 });
  cache.set('a', 1);
  cache.set('b', 2);
  assert.strictEqual(cache.get('a'), 1);
  cache.set('c', 3);
  assert.strictEqual(cache.get('b'), undefined);
  assert.strictEqual(cache.get('a'), 1);
  assert.strictEqual(cache.get('c'), 3);

  const expiring = new LruCache({ max: 2, ttl: 1 });
  expiring.set('soon', true);
  const originalNow = Date.now;
  Date.now = () => originalNow() + 10;
  try {
    assert.strictEqual(expiring.get('soon'), undefined);
  } finally {
    Date.now = originalNow;
  }
}

function testDocumentCache(folder) {
  const document = { fingerprint: 'abc123', parserVersion: 1, text: '可复用的解析正文' };
  assert.strictEqual(writeDocumentCache(folder, 'project-1', document), true);
  assert.strictEqual(readDocumentCache(folder, 'project-1', document), document.text);
  const cachePath = path.join(folder, 'project-1', '.cache', 'abc123-p1.json');
  fs.writeFileSync(cachePath, '{broken', 'utf8');
  assert.strictEqual(writeDocumentCache(folder, 'project-1', document), true);
  assert.strictEqual(readDocumentCache(folder, 'project-1', document), document.text);
  assert.strictEqual(readDocumentCache(folder, 'project-1', { ...document, parserVersion: 2 }), null);
  removeDocumentCache(folder, 'project-1', document);
  assert.strictEqual(readDocumentCache(folder, 'project-1', document), null);
}

function testSqlite(folder) {
  const repository = new SqliteWorkspaceRepository(path.join(folder, 'workspace.sqlite'));
  const state = {
    activeProjectId: 'project-1',
    projects: [{
      id: 'project-1',
      title: '缓存架构测试',
      domains: ['管理学'],
      documents: [{ id: 'document-1', name: '资料.txt', text: '正文只应进入文件缓存', fingerprint: 'abc123' }],
      drafts: [{ id: 'draft-1', title: '第一稿', content: '<p>测试</p>' }],
    }],
  };
  repository.saveWorkspace(state);
  const loaded = repository.loadWorkspace();
  assert.strictEqual(loaded.activeProjectId, 'project-1');
  assert.strictEqual(loaded.projects[0].documents[0].name, '资料.txt');
  assert.strictEqual(loaded.projects[0].documents[0].text, undefined);
  assert.strictEqual(loaded.projects[0].drafts[0].content, '<p>测试</p>');
  assert.strictEqual(Number(repository.getMetadata('schema_version')), SCHEMA_VERSION);

  repository.saveAgentRun({
    id: 'run-1', projectId: 'project-1', status: 'RUNNING', startedAt: '2026-07-30T00:00:00.000Z',
  });
  repository.saveAgentRun({
    id: 'run-1', projectId: 'project-1', status: 'COMPLETED', startedAt: '2026-07-30T00:00:00.000Z', completedAt: '2026-07-30T00:00:01.000Z', quality: { outputCharacters: 42 },
  });
  const runs = repository.listAgentRuns('project-1');
  assert.strictEqual(runs.length, 1);
  assert.strictEqual(runs[0].status, 'COMPLETED');
  assert.strictEqual(runs[0].quality.outputCharacters, 42);

  repository.saveToolRun({
    id: 'tool-run-1', agentRunId: 'run-1', cacheKey: 'cache-1', toolName: 'mechanism_diagram', status: 'completed', createdAt: '2026-07-30T00:00:00.500Z', result: { kind: 'diagram' },
  });
  const toolRun = repository.database.prepare('SELECT data FROM tool_runs WHERE id = ?').get('tool-run-1');
  assert.strictEqual(JSON.parse(toolRun.data).result.kind, 'diagram');

  repository.saveWorkspace({ activeProjectId: null, projects: [] });
  assert.deepStrictEqual(repository.loadWorkspace(), { activeProjectId: null, projects: [], revision: state.revision + 1 });
  repository.close();
}

function run() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-cache-'));
  try {
    testLru();
    testDocumentCache(folder);
    testSqlite(folder);
    console.log('cache and sqlite storage test passed');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

run();
