const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-collection-'));
const originalLoad = Module._load;
Module._load = function(id, ...args) { return id === 'electron' ? { app: { getPath: () => root } } : originalLoad.call(this, id, ...args); };
async function main() {
  const { collectData } = require('./tools/data-collection');
  const { findPythonExecutable } = require('./tools/tool-registry');
  const { resolveConversationAttachment } = require('./conversation-files');
  const project = { id: 'synthetic-collection', documents: [], projectFiles: [] };
  const store = { loadWorkspace: () => ({ projects: [project] }), updateProject: (_, patch) => Object.assign(project, patch) };
  let fetched = 0;
  const result = await collectData({ request: '提取year与x，保留来源', urls: ['https://example.com/research.csv'], projectId: project.id, userDataPath: root,
    loadSettings: () => ({ dataEnvironment: { networkEnabled: true } }), findPython: findPythonExecutable, store, ragStore: {},
    // Deterministic transport fixture. Parsing, sandbox execution and project import are real.
    fetchResource: async url => { fetched++; return { url, mime: 'text/csv', body: Buffer.from('year,x\n2020,7\n2021,9\n') }; },
    requestModel: async () => ({ content: '```python\nimport os,json,base64,io,pandas as pd\nsources=json.load(open(os.environ["DATA_FILE"]))\ndf=pd.read_csv(io.BytesIO(base64.b64decode(sources[0]["base64"])))\ndf["source_url"]=sources[0]["url"]\ndf.to_csv(os.path.join(os.environ["CHART_DIR"],"collected.csv"),index=False)\nprint(len(df))\n```' }),
  });
  assert.equal(fetched, 1); assert.equal(result.status, 'completed'); assert.equal(result.rows, 2);
  assert(result.columns.includes('source_url')); assert.equal(result.sources[0].sha256.length, 64);
  assert.equal(project.projectFiles.length, 1); assert.equal(project.documents.length, 1);
  const content = fs.readFileSync(resolveConversationAttachment(result.attachments[0]), 'utf8');
  assert(content.includes('2020,7,https://example.com/research.csv'));
  assert(result.code.includes('base64'));
  console.log('Collection fixture → real offline parser code → sandbox CSV → profile → project import/provenance passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => { Module._load = originalLoad; fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
