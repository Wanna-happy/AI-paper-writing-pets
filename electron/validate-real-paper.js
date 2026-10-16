// Opt-in end-to-end validation with existing literature and encrypted credentials.
// Source database/documents are read-only. All writes go to an ignored workspace
// folder; no credential bytes or raw provider errors are logged or copied there.
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const { DatabaseSync } = require('node:sqlite');
const JSZip = require('jszip');
const sourceRoot = path.join(app.getPath('appData'), 'AI论文宠物');
const workspace = path.resolve(__dirname, '..');
const verificationFolder = process.argv.find(value => value.startsWith('--verify-run='))?.slice('--verify-run='.length);
const validationRoot = path.join(workspace, '.real-paper-validation');
const output = verificationFolder ? path.resolve(verificationFolder) : path.join(validationRoot, `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`);
if (!output.startsWith(validationRoot + path.sep)) throw new Error('Validation output must remain inside the workspace validation folder.');
fs.mkdirSync(output, { recursive: true });
app.setName('AI论文宠物');
// Chromium's Windows safeStorage key is bound to the existing Local State.
// Bootstrap against that profile, then move all validation writes to scratch
// after decryption. Never copy Local State or the encrypted API key.
app.setPath('userData', sourceRoot);
const reportPath = path.join(output, 'report.json');
let stage = 'initializing';
let repository;
let productionStore;
// Windows GUI processes can outlive the shell's stdout pipe. Persist diagnostics
// directly rather than writing to a disconnected console (EPIPE opens a dialog).
function logResult(value) { fs.appendFileSync(path.join(output, 'validation.log'), JSON.stringify(value) + '\n'); }
function progress(next) { stage = next; logResult({ stage: next }); }

app.whenReady().then(async () => {
  try {
    progress('loading-readonly-source');
    const { readDocumentCache, writeDocumentCache } = require('./document-cache');
    const source = new DatabaseSync(path.join(sourceRoot, 'workspace.sqlite'), { readOnly: true });
    let projects;
    try {
      projects = source.prepare('SELECT id,data FROM projects ORDER BY sort_order').all().map(row => {
        const project = { ...JSON.parse(row.data), id: row.id };
        const docs = source.prepare('SELECT id,data FROM documents WHERE project_id=? ORDER BY sort_order').all(row.id);
        project.documents = docs.map(doc => ({ ...JSON.parse(doc.data), id: doc.id })).map(doc => ({
          ...doc, text: doc.text || readDocumentCache(path.join(sourceRoot, 'library'), project.id, doc) || '',
        }));
        return project;
      });
    } finally { source.close(); }
    progress('selecting-approved-literature');
    const planPath = process.argv.find(value => value.startsWith('--plan='))?.slice('--plan='.length);
    const validationPlan = planPath ? JSON.parse(fs.readFileSync(planPath, 'utf8')) : null;
    const requestedId = validationPlan?.sourceProjectId || process.argv.find(value => value.startsWith('--project='))?.slice('--project='.length);
    const selected = requestedId ? projects.find(project => project.id === requestedId) : projects.sort((a, b) => b.documents.filter(doc => doc.text).length - a.documents.filter(doc => doc.text).length)[0];
    if (!selected) throw new Error('no-source-project');
    const readable = selected.documents.filter(doc => doc.status === 'parsed' && doc.text.length > 200);
    const relevant = readable.filter(doc => /生育支持|家庭政策|生育假期|生育政策|生育成本|育儿财政|促进生育/.test(doc.name));
    const documents = validationPlan ? validationPlan.documentIds.map(id => readable.find(doc => doc.id === id)).filter(Boolean) : (relevant.length >= 3 ? relevant : readable).slice(0, 8);
    if (validationPlan && (documents.length !== validationPlan.documentIds.length || documents.some((doc, index) => doc.name !== validationPlan.documentNames[index]))) throw new Error('source-plan-mismatch');
    if (documents.length < 3) throw new Error('insufficient-readable-literature');
    const project = { ...selected, title: '生育支持政策影响生育决策的机制与研究述评（验证副本）', type: '课程论文',
      documents, drafts: [], conversations: [{ id: 'validation', title: '真实论文验证' }], activeConversationId: 'validation' };
    if (verificationFolder) {
      progress('verifying-existing-run-without-model-call');
      const { SqliteWorkspaceRepository } = require('./sqlite-workspace');
      repository = new SqliteWorkspaceRepository(path.join(output, 'runtime/workspace.sqlite'));
      const row = repository.database.prepare("SELECT id FROM agent_runs WHERE status='COMPLETED' ORDER BY started_at DESC LIMIT 1").get();
      if (!row) throw new Error('no-completed-validation-run');
      const { verifyRealPaper } = require('./real-paper-report');
      const report = await verifyRealPaper({ repository, project, documents, sourceProjectId: selected.id, output, requestId: row.id });
      logResult({ ...report, reportPath });
      repository.database.close(); app.exit(0); return;
    }
    progress('loading-model-settings');
    const settings = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'settings.json'), 'utf8'));
    if (validationPlan && settings.api?.baseUrl !== validationPlan.destination) throw new Error('destination-plan-mismatch');
    progress('opening-saved-credential');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('secure-storage-unavailable');
    const provider = String(settings.api?.provider || 'deepseek').replace(/[^a-z0-9_-]/gi, '');
    const apiKey = safeStorage.decryptString(fs.readFileSync(path.join(sourceRoot, `api-key-${provider}.bin`)));
    if (!apiKey) throw new Error('missing-saved-key');
    app.setPath('userData', path.join(output, 'runtime'));
    progress('creating-validation-workspace');

    const { SqliteWorkspaceRepository } = require('./sqlite-workspace');
    const { AgentOrchestrator } = require('./agent/orchestrator');
    const { SkillRuntime } = require('./skills/skill-runtime');
    const { ProviderRegistry, DEFAULT_PROVIDERS } = require('./providers/provider-registry');
    const { postProcessAgentContent } = require('./paper-output');
    const { buildAcademicDocx } = require('./word-export');
    const ragStore = require('./rag-store');
    repository = new SqliteWorkspaceRepository(path.join(app.getPath('userData'), 'workspace.sqlite'));
    for (const document of documents) writeDocumentCache(path.join(app.getPath('userData'), 'library'), project.id, document);
    repository.saveWorkspace({ activeProjectId: project.id, projects: [project] });
    // Use the production hydration/persistence layer: document text lives in
    // versioned caches, not in SQLite's document metadata rows.
    productionStore = require('./workspace-store');
    const store = { ...productionStore, getApiKey: () => apiKey };
    assert.equal(store.loadWorkspace().projects[0].documents.filter(doc => doc.text).length, documents.length, 'validation-cache-hydration-failed');
    progress('indexing-real-literature');
    await ragStore.indexProject(project);
    const preflight = await ragStore.retrieve(project, '生育支持政策 托育服务 经济成本 女性就业 生育决策', 6);
    if (preflight.hits.length < 3) throw new Error('retrieval-preflight-failed');
    const engine = new AgentOrchestrator({
      workspaceStore: store, ragStore, providerRegistry: new ProviderRegistry(DEFAULT_PROVIDERS), toolRegistry: {},
      skillRuntime: new SkillRuntime(path.join(workspace, 'assets/research-skills')), loadSettings: () => settings,
      buildConversationFileContext: () => '', postProcessContent: postProcessAgentContent,
      emitStream: () => {}, emitStatus: (_, payload) => { if (payload.stage === 'task-start') progress(`agent-${payload.role}`); },
      react: () => {}, playCompletion: () => {},
    });
    const requestId = crypto.randomUUID();
    const task = '请基于本项目资料库，撰写“生育支持政策影响生育决策的作用机制与研究述评”这一论文小节，正文约900—1200个汉字。必须调用本地检索工具，并实质引用至少3份不同文献；以经济成本分担、照护时间与就业协调、政策组合及研究不足组织论证。明确区分来源观点与你的归纳。不自行开展新的数据分析，不编造样本量、回归系数、显著性或作者年份；来源不足处明确说明。使用HTML标题和段落，引用使用检索工具提供的[E编号]，只交付本小节。';
    progress('running-real-planner-and-writer');
    const draft = await engine.run({ projectId: project.id, request: { requestId, task, conversationId: 'validation', attachments: [] }, signal: AbortSignal.timeout(180000) });
    progress('verifying-persistence-citations-and-word');
    const { verifyRealPaper } = require('./real-paper-report');
    const report = await verifyRealPaper({ repository, project, documents, sourceProjectId: selected.id, output, requestId, draft });
    logResult({ ...report, reportPath });
    await productionStore.closeWorkspace(); repository.database.close(); app.exit(0);
  } catch (error) {
    const known = /^(no-source-project|source-plan-mismatch|destination-plan-mismatch|insufficient-readable-literature|secure-storage-unavailable|missing-saved-key|retrieval-preflight-failed|persistence-mismatch|planner-fallback|insufficient-citations|missing-evidence-snapshot|insufficient-distinct-sources|evidence-source-mismatch|unknown-evidence-markers|word-footnotes-missing|word-footnote-file-missing)$/;
    const reason = known.test(error.message) ? error.message : error.name === 'TimeoutError' || error.name === 'AbortError' ? 'timeout-or-abort' : /实证表述/.test(error.message) ? 'empirical-guard-rejected' : /篇幅未通过|篇幅返修/.test(error.message) ? 'length-validation-failed' : /长度上限/.test(error.message) ? 'output-truncated' : 'execution-or-api-failure';
    const sourceLine = error.stack?.match(/validate-real-paper\.js:(\d+):\d+/)?.[1] || null;
    fs.writeFileSync(reportPath, JSON.stringify({ ok: false, stage, reason, sourceLine, code: error.code || null }, null, 2));
    logResult({ ok: false, stage, reason, sourceLine, code: error.code || null, reportPath });
    try { await productionStore?.closeWorkspace(); } catch {}
    try { repository?.database.close(); } catch {}
    app.exit(1);
  }
});
