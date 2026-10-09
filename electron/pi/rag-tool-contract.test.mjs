import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import Module from 'node:module';
import { makeWriterTools } from './agent-tools.mjs';
const require = createRequire(import.meta.url);
const root = path.resolve('.ui-smoke', `rag-contract-${randomUUID()}`);
assert(root.startsWith(path.resolve('.ui-smoke') + path.sep));
fs.mkdirSync(root, { recursive: true });
const originalLoad = Module._load;
Module._load = function(name, ...args) {
  return name === 'electron' ? { app: { getPath: () => root } } : originalLoad.call(this, name, ...args);
};
let ragStore;
try { ragStore = require('../rag-store'); } finally { Module._load = originalLoad; }
try {
  const project = { id: 'contract', documents: [{ id: 'doc', name: '真实接口合成资料', status: 'parsed', text: '生育支持政策通过托育服务与成本分担影响家庭生育决策。'.repeat(12), fingerprint: 'fingerprint', parserVersion: 2 }] };
  const retrieval = await ragStore.retrieve(project, '生育支持政策');
  assert(Array.isArray(retrieval.hits) && retrieval.hits.length > 0);
  let recorded;
  const [tool] = makeWriterTools({ ragStore, project, recordToolResult: (_, __, result) => { recorded = result; } });
  const result = await tool.execute('lookup', { query: '生育支持政策' });
  assert(result.content[0].text.includes('[E1] 《真实接口合成资料》'));
  assert.equal(recorded.hits[0].evidenceId, 'E1');
  assert.equal(recorded.mode, retrieval.mode);
  let safeRecord;
  const [contaminatedTool] = makeWriterTools({ project, ragStore: { retrieve: async () => ({ projectId: project.id, hits: [
    { projectId: 'other', documentId: 'doc', text: '其他项目秘密', id: 'foreign' },
    { projectId: project.id, documentId: 'deleted', text: '已删除资料秘密', id: 'deleted' },
    { projectId: project.id, documentId: 'doc', text: '当前项目证据', id: 'local' },
  ] }) }, recordToolResult: (_, __, value) => { safeRecord = value; } });
  const clean = await contaminatedTool.execute('contaminated', { query: '秘密' });
  assert(!clean.content[0].text.includes('秘密'));
  assert.equal(safeRecord.hits.length, 1);
  console.log('Production RAG result object -> pi writer evidence contract passed');
} finally { fs.rmSync(root, { recursive: true, force: true }); }
