const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, safeStorage } = require('electron');
const { ensureThesisControl, normalizeThesisProfile } = require('./thesis-controller');
const { PARSER_VERSION, parseDocument } = require('./document-parser');
const { LruCache } = require('./lru-cache');
const {
  readDocumentCache,
  removeDocumentCache,
  writeDocumentCache,
} = require('./document-cache');
const { SqliteWorkspaceRepository } = require('./sqlite-workspace');
const { OcrRuntime } = require('./ocr-runtime');

const EMPTY_STATE = {
  activeProjectId: null,
  projects: [],
};

const sessionApiKeys = new Map();
let repository = null;
let ocrRuntime = null;
const workspaceCache = new LruCache({ max: 1, ttl: 5000 });

function getStatePath() {
  return path.join(app.getPath('userData'), 'workspace.json');
}

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'workspace.sqlite');
}

function getLibraryPath() {
  return path.join(app.getPath('userData'), 'library');
}

function getKeyPath(provider = 'deepseek') {
  const safeProvider = String(provider).replace(/[^a-z0-9_-]/gi, '') || 'deepseek';
  return path.join(app.getPath('userData'), `api-key-${safeProvider}.bin`);
}

function getLegacyKeyPath() {
  return path.join(app.getPath('userData'), 'api-key.bin');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getRepository() {
  if (!repository) {
    const opened = new SqliteWorkspaceRepository(getDatabasePath());
    try { migrateLegacyWorkspace(opened); repository = opened; }
    catch (error) { opened.close(); throw error; }
  }
  return repository;
}

function getOcrRuntime() {
  if (!ocrRuntime) {
    ocrRuntime = new OcrRuntime({
      assetsPath: path.join(__dirname, '../assets/ocr'),
      cachePath: path.join(app.getPath('userData'), 'ocr-cache'),
    });
  }
  return ocrRuntime;
}

function migrateLegacyWorkspace(targetRepository) {
  if (targetRepository.getMetadata('legacy_workspace_imported_at') || !targetRepository.isEmpty() || !fs.existsSync(getStatePath())) return;
  try {
    const legacy = JSON.parse(fs.readFileSync(getStatePath(), 'utf8'));
    for (const project of legacy.projects || []) {
      for (const document of project.documents || []) {
        document.parserVersion = Number(document.parserVersion) || PARSER_VERSION;
        if (document.text) writeDocumentCache(getLibraryPath(), project.id, document);
      }
    }
    targetRepository.saveWorkspace(legacy);
    targetRepository.setMetadata('legacy_workspace_imported_at', new Date().toISOString());
  } catch (error) {
    targetRepository.setMetadata('legacy_workspace_import_error', error.message);
    throw new Error('旧工作区迁移失败，已保留原文件并停止写入。', { cause: error });
  }
}

function hydrateDocumentText(project) {
  project.documents = (project.documents || []).map((document) => {
    const cachedText = readDocumentCache(getLibraryPath(), project.id, document);
    return cachedText == null ? document : { ...document, text: cachedText };
  });
  return project;
}

function normalizeDomains(input) {
  const values = Array.isArray(input.domains) ? input.domains : [input.domain];
  return [...new Set(values.map((value) => String(value || '').trim()).filter((value) => value && value !== '未分类' && value !== '交叉学科'))];
}

function conversationTitle(value, fallback = '新对话') {
  const title = String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/^(请|帮我|麻烦|我想|需要|希望|给我)+/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return title.slice(0, 32) || fallback;
}

function normalizeConversations(project) {
  const drafts = Array.isArray(project.drafts) ? project.drafts : [];
  const conversations = Array.isArray(project.conversations)
    ? project.conversations.filter((item) => item?.id).map((item) => ({
      id: item.id,
      title: conversationTitle(item.title),
      createdAt: item.createdAt || project.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || item.createdAt || project.updatedAt || new Date().toISOString(),
    }))
    : [];
  const known = new Set(conversations.map((item) => item.id));
  const unassigned = drafts.filter((draft) => !draft.conversationId || !known.has(draft.conversationId));
  if (unassigned.length) {
    let legacy = conversations.find((item) => item.id === `legacy-${project.id}`);
    if (!legacy) {
      const oldest = unassigned[unassigned.length - 1];
      const newest = unassigned[0];
      legacy = {
        id: `legacy-${project.id}`,
        title: conversationTitle(oldest?.task || oldest?.title, '历史对话'),
        createdAt: oldest?.createdAt || project.createdAt || new Date().toISOString(),
        updatedAt: newest?.updatedAt || project.updatedAt || new Date().toISOString(),
      };
      conversations.unshift(legacy);
    }
    unassigned.forEach((draft) => { draft.conversationId = legacy.id; });
  }
  if (!conversations.length) {
    const now = project.createdAt || new Date().toISOString();
    conversations.push({ id: crypto.randomUUID(), title: '新对话', createdAt: now, updatedAt: now });
  }
  project.conversations = conversations;
  if (!conversations.some((item) => item.id === project.activeConversationId)) {
    project.activeConversationId = conversations[0].id;
  }
  return project;
}

function loadWorkspace() {
  const cached = workspaceCache.get('workspace');
  if (cached) return clone(cached);
  try {
    const stored = getRepository().loadWorkspace();
    const state = { ...clone(EMPTY_STATE), ...stored };
    let migratedConversations = false;
    state.projects = (state.projects || []).map((project) => {
      const neededMigration = !Array.isArray(project.conversations)
        || (project.drafts || []).some((draft) => !draft.conversationId);
      const normalizedProject = normalizeConversations(hydrateDocumentText({
      ...project,
      domains: normalizeDomains(project),
      thesisProfile: normalizeThesisProfile(project.thesisProfile),
      thesisControl: project.thesisControl || null,
      }));
      migratedConversations ||= neededMigration;
      return normalizedProject;
    });
    if (migratedConversations) getRepository().saveWorkspace(state);
    workspaceCache.set('workspace', state);
    return clone(state);
  } catch (cause) {
    workspaceCache.clear();
    throw new Error('工作区读取失败，已停止本次操作以保护原有项目。请重试或检查本地数据文件。', { cause });
  }
}

function saveWorkspace(state) {
  for (const project of state.projects || []) {
    for (const document of project.documents || []) {
      if (document.text) writeDocumentCache(getLibraryPath(), project.id, document);
    }
  }
  try { getRepository().saveWorkspace(state); }
  catch (error) { workspaceCache.clear(); throw error; }
  // A single latest recovery snapshot contains only the current workspace;
  // deleted projects are not retained in a rotating history of backups.
  const recovery = path.join(app.getPath('userData'), 'workspace-recovery.json');
  try {
    const temporary = `${recovery}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(state), 'utf8');
    fs.renameSync(temporary, recovery);
    if (fs.existsSync(getStatePath())) {
      const legacyTemporary = `${getStatePath()}.${process.pid}.tmp`;
      fs.writeFileSync(legacyTemporary, JSON.stringify(state), 'utf8');
      fs.renameSync(legacyTemporary, getStatePath());
    }
  } catch (error) { state.recoveryWarning = `本地恢复快照未更新：${error.message}`; }
  workspaceCache.set('workspace', clone(state));
  return state;
}

function createProject(input = {}) {
  const state = loadWorkspace();
  const now = new Date().toISOString();
  const project = {
    id: crypto.randomUUID(),
    title: String(input.title || '未命名论文').trim() || '未命名论文',
    type: input.type || '硕士学位论文',
    domains: normalizeDomains(input),
    language: input.language || '中文',
    citationStyle: input.citationStyle || 'GB/T 7714',
    goal: input.goal || '',
    thesisProfile: normalizeThesisProfile({...input.thesisProfile,targetWords:input.thesisProfile?.targetWords||require('./thesis-controller').defaultTargetWords(input.type)}),
    archived: false,
    createdAt: now,
    updatedAt: now,
    documents: [],
    drafts: [],
    conversations: [],
  };
  normalizeConversations(project);
  state.projects.unshift(project);
  state.activeProjectId = project.id;
  saveWorkspace(state);
  return project;
}

function updateProject(projectId, partial) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const normalized = { ...partial };
  if ('domains' in normalized || 'domain' in normalized) normalized.domains = normalizeDomains(normalized);
  if ('thesisProfile' in normalized) normalized.thesisProfile = normalizeThesisProfile(normalized.thesisProfile);
  delete normalized.domain;
  if (normalized.clarifications) normalized.confirmedDecisions = require('./agent/decision-memory').rememberAnswers(project, normalized.clarifications);
  if (normalized.empiricalPlans) {
    normalized.confirmedAnalysisChoices = { ...(project.confirmedAnalysisChoices || {}) };
    for (const [conversationId, plan] of Object.entries(normalized.empiricalPlans)) {
      if (plan?.approvedAt) normalized.confirmedAnalysisChoices[conversationId] = { dataFile: plan.attachment,
        dataSelection: plan.dataSelection, steps: plan.steps.map(step => ({ methodId: step.methodId, specification: step.specification })), revision: plan.revision, approvedAt: plan.approvedAt };
    }
  }
  Object.assign(project, normalized, { updatedAt: new Date().toISOString() });
  if ('thesisProfile' in normalized) project.thesisControl = ensureThesisControl(project);
  saveWorkspace(state);
  return project;
}

function updateDocumentMetadata(projectId, documentId, partial) {
  const state=loadWorkspace(), project=state.projects.find(item=>item.id===projectId);
  const document=project?.documents.find(item=>item.id===documentId);
  if(!document) throw new Error('资料不属于当前项目');
  for(const key of ['author','year','note']) if(typeof partial[key]==='string') document[key]=partial[key].trim().slice(0,key==='note'?4000:200);
  if(Array.isArray(partial.tags)) document.tags=[...new Set(partial.tags.filter(t=>typeof t==='string').map(t=>t.trim().slice(0,60)).filter(Boolean))].slice(0,30);
  saveWorkspace(state);return document;
}

function addRestoredProject(project) {
  const state=loadWorkspace();
  if(state.projects.some(item=>item.id===project.id))throw new Error('恢复项目标识冲突');
  state.projects.push(project);state.activeProjectId=project.id;saveWorkspace(state);return project;
}

function setActiveProject(projectId) {
  const state = loadWorkspace();
  if (!state.projects.some((project) => project.id === projectId)) throw new Error('项目不存在');
  state.activeProjectId = projectId;
  saveWorkspace(state);
  return state;
}

function createConversation(projectId, input = {}) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const now = new Date().toISOString();
  const conversation = {
    id: crypto.randomUUID(),
    title: conversationTitle(input.title || input.task),
    createdAt: now,
    updatedAt: now,
  };
  project.conversations.unshift(conversation);
  project.activeConversationId = conversation.id;
  project.updatedAt = now;
  saveWorkspace(state);
  return state;
}

// 删除对话：连同该对话的全部草稿一起移除；至少保留一个对话；必要时修正 activeConversationId。
function deleteConversation(projectId, conversationId) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const remaining = (project.conversations || []).filter((item) => item.id !== conversationId);
  if (!remaining.length) throw new Error('每个项目至少保留一个对话，不能删除最后一个。');
  project.conversations = remaining;
  for (const field of ['clarifications', 'confirmedDecisions', 'confirmedAnalysisChoices', 'empiricalPlans', 'dataPreparations']) {
    if (project[field]) delete project[field][conversationId];
  }
  project.drafts = (project.drafts || []).filter((draft) => draft.conversationId !== conversationId);
  if (project.activeConversationId === conversationId || !remaining.some((item) => item.id === project.activeConversationId)) {
    project.activeConversationId = remaining[0].id;
  }
  project.updatedAt = new Date().toISOString();
  saveWorkspace(state);
  getRepository().deleteConversationMemory(projectId, conversationId);
  return state;
}

function setActiveConversation(projectId, conversationId) {
  const state = loadWorkspace();  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  if (!project.conversations.some((item) => item.id === conversationId)) throw new Error('对话不存在');
  project.activeConversationId = conversationId;
  project.updatedAt = new Date().toISOString();
  saveWorkspace(state);
  return state;
}

function deleteProject(projectId) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const deletedRuns = getRepository().listAgentRuns(projectId, 1000000);
  state.projects = state.projects.filter((item) => item.id !== projectId);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[0]?.id ?? null;
  }
  saveWorkspace(state);

  require('./project-cleanup').cleanupProjectFiles(app.getPath('userData'), project, deletedRuns, state.projects, getRepository().listAgentRuns(null, 1000000));
  return state;
}

function fileFingerprint(filePath) {
  const hash = crypto.createHash('sha256');
  const descriptor = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(64 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest('hex');
}

async function importDocuments(projectId, filePaths) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('请先创建论文项目');

  const allFingerprints = new Set(
    project.documents.map((document) => document.fingerprint),
  );
  const imported = [];
  const rejected = [];
  const projectFolder = path.join(getLibraryPath(), projectId);
  fs.mkdirSync(projectFolder, { recursive: true });

  for (const filePath of filePaths) {
    try {
      const stats = fs.statSync(filePath);
      if (stats.size > 100 * 1024 * 1024) {
        rejected.push({ path: filePath, reason: '单个文件超过 100 MB' });
        continue;
      }
      const fingerprint = fileFingerprint(filePath);
      if (allFingerprints.has(fingerprint)) {
        rejected.push({ path: filePath, reason: '重复资料' });
        continue;
      }

      const id = crypto.randomUUID();
      const extension = path.extname(filePath).toLowerCase();
      if (extension === '.xls') throw new Error('旧版 XLS 暂不支持，请另存为 XLSX 或 CSV 后导入。');
      const storedName = `${id}${extension}`;
      const storedPath = path.join(projectFolder, storedName);
      fs.copyFileSync(filePath, storedPath);
      const document = {
        id,
        name: path.basename(filePath),
        extension,
        size: stats.size,
        fingerprint,
        storedPath,
        importedAt: new Date().toISOString(),
        parserVersion: PARSER_VERSION,
        status: 'saved',
        source: '用户投喂',
        tags: [],
        note: '',
      };

      const parsed = ['.csv', '.xlsx', '.xls'].includes(extension) ? { status: 'data', text: '' } : await parseDocument(storedPath, { ocr: getOcrRuntime() });
      document.status = parsed.status;
      document.text = parsed.text;
      if (parsed.ocr) document.ocr = parsed.ocr;
      if (parsed.error) document.parseError = parsed.error;

      project.documents.push(document);
      allFingerprints.add(fingerprint);
      imported.push(document);
    } catch (error) {
      rejected.push({ path: filePath, reason: error.message });
    }
  }

  project.updatedAt = new Date().toISOString();
  saveWorkspace(state);
  return { imported, rejected, state };
}

function removeDocument(projectId, documentId) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const document = project.documents.find((item) => item.id === documentId);
  project.documents = project.documents.filter((item) => item.id !== documentId);
  project.removedAttachmentIds = [...new Set([...(project.removedAttachmentIds || []), documentId, ...(project.projectFiles || []).filter(item => item.documentId === documentId).map(item => item.id)])];
  project.projectFiles = (project.projectFiles || []).filter(item => item.documentId !== documentId);
  project.updatedAt = new Date().toISOString();
  saveWorkspace(state);
  if (document) removeDocumentCache(getLibraryPath(), projectId, document);
  if (document?.storedPath) fs.rmSync(document.storedPath, { force: true });
  return state;
}

function saveDraft(projectId, draft) {
  if (draft.lengthReview?.contract) {
    const check = require('./length-control').inspectLength(draft.content, draft.lengthReview.contract);
    const warning = check.passed ? null : `篇幅未达标：正文 ${check.actual} ${check.contract.metric === 'words' ? '英文词' : '汉字'}，要求${check.contract.label}。正文已保存，可查看、编辑和导出。`;
    draft = { ...draft, lengthReview: { ...draft.lengthReview, ...check, warning },
      deliveryStatus: check.passed ? 'ready' : 'needs-revision',
      checks: [...(draft.checks || []).filter(item => !item.startsWith('篇幅未达标：')), ...(warning ? [warning] : [])] };
  }
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const now = new Date().toISOString();
  if (draft.mode === 'api') {
    const audit = require('./research-workflow').auditDraft(draft.content, (draft.evidence || []).length);
    const retained = (draft.checks || []).filter(message => !/未检测到脚注|不存在的脚注|事实性主张|篇幅未达标/.test(message));
    const checks = [...new Set([...retained, ...audit, ...(draft.lengthReview?.warning ? [draft.lengthReview.warning] : [])])];
    const review = require('./quality/delivery-review').reviewDelivery(checks, draft.lengthReview);
    draft = { ...draft, checks, deliveryReview: review, deliveryStatus: review.status === 'blocked' ? 'needs-review' : review.status };
  }
  normalizeConversations(project);
  const conversationId = draft.conversationId || project.activeConversationId;
  if (!project.conversations.some(item => item.id === conversationId)) throw new Error('对话不属于当前项目');
  const previous = project.drafts.find(item => item.id === draft.id);
  if(draft.mode==='api'&&!draft.thesisUnit)draft={...draft,thesisUnit:require('./thesis-controller').createThesisUnit(project,draft.workflow||{},draft.task||draft.title||'',{conversationId})};
  const saved = require('./draft-history').versionDraft(previous, { id: draft.id || crypto.randomUUID(), createdAt: draft.createdAt || now, ...draft, conversationId }, now);
  const existingIndex = project.drafts.findIndex((item) => item.id === saved.id);
  if (existingIndex >= 0) project.drafts[existingIndex] = saved;
  else project.drafts.unshift(saved);
  require('./turn-changes').record(project, previous, saved);
  const conversation = project.conversations.find((item) => item.id === conversationId);
  if (conversation) {
    conversation.updatedAt = now;
    if (conversation.title === '新对话') conversation.title = conversationTitle(draft.task || draft.title);
  }
  project.updatedAt = now;
  if(saved.thesisUnit)project.thesisControl=require('./thesis-controller').updateThesisProgress(project,saved);
  saveWorkspace(state);
  if (['api', 'local-draft'].includes(saved.mode)) saveConversationTurn(projectId, conversationId, { id: `draft:${saved.id}`, role: 'assistant', text: saved.content, notes: saved.checks || [], status: saved.mode === 'local-draft' ? 'local-draft' : saved.deliveryStatus || 'ready', createdAt: saved.createdAt });
  return saved;
}

function assertConversation(projectId, conversationId) {
  const project = loadWorkspace().projects.find(item => item.id === projectId);
  if (!project?.conversations.some(item => item.id === conversationId)) throw new Error('对话不属于当前项目');
  return project;
}

function assignDraftChapter(projectId,draftId,chapterId) {
  const project=loadWorkspace().projects.find(p=>p.id===projectId),draft=project?.drafts.find(d=>d.id===draftId);
  if(!draft||draft.mode!=='api')throw new Error('稿件不属于当前项目或不是正式正文');
  const chapters=ensureThesisControl(project).chapters,chapter=chapters.find(c=>c.id===chapterId);
  if(!chapter)throw new Error('请选择当前项目目录中的章节');
  const sequence=draft.thesisUnit?.chapterId===chapterId?draft.thesisUnit.sequence:Math.max(0,...project.drafts.filter(d=>d.thesisUnit?.chapterId===chapterId).map(d=>d.thesisUnit.sequence||0))+1;
  return saveDraft(projectId,{...draft,changeOrigin:'manual',workflow:{...draft.workflow,chapterId},thesisUnit:{...draft.thesisUnit,id:draft.thesisUnit?.id||`unit-${draft.id}`,chapterId,chapterTitle:chapter.title,sequence}});
}

function saveConversationTurn(projectId, conversationId, turn) {
  assertConversation(projectId, conversationId);
  const result = getRepository().saveConversationTurn(projectId, conversationId, turn);
  workspaceCache.clear();
  return result;
}

function listConversationTurns(projectId, conversationId) {
  const project = assertConversation(projectId, conversationId);
  const repository = getRepository();
  if (!repository.listConversationTurns(projectId, conversationId).length) {
    // Lazy migration: retain original requests as well as past delivered bodies.
    for (const draft of project.drafts.filter(item => item.conversationId === conversationId && item.mode === 'api').slice().reverse()) {
      const createdAt = draft.createdAt || draft.updatedAt || new Date().toISOString();
      repository.saveConversationTurn(projectId, conversationId, { id: `legacy-user:${draft.id}`, role: 'user', text: draft.task || draft.title || '', createdAt });
      repository.saveConversationTurn(projectId, conversationId, { id: `draft:${draft.id}`, role: 'assistant', text: draft.content, notes: draft.checks || [], status: draft.deliveryStatus || 'ready', createdAt });
    }
  }
  return repository.listConversationTurns(projectId, conversationId);
}

function getConversationMemory(projectId, conversationId) {
  assertConversation(projectId, conversationId);
  return getRepository().getConversationMemory(projectId, conversationId);
}

function saveConversationMemory(projectId, conversationId, packet) {
  assertConversation(projectId, conversationId);
  if (packet.projectId !== projectId || packet.conversationId !== conversationId) throw new Error('记忆归属不匹配');
  return getRepository().saveConversationMemory(projectId, conversationId, packet);
}

function resolveDraft(projectId, draftId) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const draft = project.drafts.find((item) => item.id === draftId);
  if (draft && !draft.resolvedAt) draft.resolvedAt = new Date().toISOString();
  saveWorkspace(state);
  return draft;
}

function setApiKey(key, mode, provider = 'deepseek') {
  if (key) sessionApiKeys.set(provider, key); else sessionApiKeys.delete(provider);
  if (mode === 'encrypted' && key) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法使用安全存储');
    fs.mkdirSync(path.dirname(getKeyPath(provider)), { recursive: true });
    fs.writeFileSync(getKeyPath(provider), safeStorage.encryptString(key));
  } else {
    fs.rmSync(getKeyPath(provider), { force: true });
  }
  // An explicitly replaced/deleted key must not fall back to the legacy copy.
  if (provider === 'deepseek') fs.rmSync(getLegacyKeyPath(), { force: true });
}

function getApiKey(mode, provider = 'deepseek') {
  if (mode === 'session') return sessionApiKeys.get(provider) || '';
  try {
    return safeStorage.decryptString(fs.readFileSync(getKeyPath(provider)));
  } catch {
    if (provider !== 'deepseek') return '';
    try {
      return safeStorage.decryptString(fs.readFileSync(getLegacyKeyPath()));
    } catch {
      return '';
    }
  }
}

function hasApiKey(mode, provider = 'deepseek') {
  return Boolean(getApiKey(mode, provider));
}

async function closeWorkspace() {
  workspaceCache.clear();
  if (repository) {
    repository.close();
    repository = null;
  }
  if (ocrRuntime) await ocrRuntime.close();
  ocrRuntime = null;
}

function getOcrStatus() {
  return getOcrRuntime().getStatus();
}

function saveAgentRun(run) {
  return getRepository().saveAgentRun(run);
}

function listAgentRuns(projectId, limit) {
  return getRepository().listAgentRuns(projectId, limit);
}

function saveToolRun(run) {
  return getRepository().saveToolRun(run);
}

module.exports = {
  assignDraftChapter,
  closeWorkspace,
  createConversation,
  createProject,
  deleteConversation,
  deleteProject,
  getApiKey,
  getOcrStatus,
  hasApiKey,
  importDocuments,
  loadWorkspace,
  listAgentRuns,
  listConversationTurns,
  getConversationMemory,
  saveConversationMemory,
  saveConversationTurn,
  removeDocument,
  resolveDraft,
  saveDraft,
  saveAgentRun,
  saveToolRun,
  setActiveProject,
  setActiveConversation,
  setApiKey,
  updateProject,
  updateDocumentMetadata,
  addRestoredProject,
};
