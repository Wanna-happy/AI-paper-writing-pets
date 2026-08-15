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

let sessionApiKey = '';
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
    repository = new SqliteWorkspaceRepository(getDatabasePath());
    migrateLegacyWorkspace(repository);
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
  if (!targetRepository.isEmpty() || !fs.existsSync(getStatePath())) return;
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
  } catch {
    return clone(EMPTY_STATE);
  }
}

function saveWorkspace(state) {
  for (const project of state.projects || []) {
    for (const document of project.documents || []) {
      if (document.text) writeDocumentCache(getLibraryPath(), project.id, document);
    }
  }
  getRepository().saveWorkspace(state);
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
    thesisProfile: normalizeThesisProfile(input.thesisProfile),
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
  Object.assign(project, normalized, { updatedAt: new Date().toISOString() });
  if ('thesisProfile' in normalized && project.type === '硕士学位论文') project.thesisControl = ensureThesisControl(project);
  saveWorkspace(state);
  return project;
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

function setActiveConversation(projectId, conversationId) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
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
  state.projects = state.projects.filter((item) => item.id !== projectId);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[0]?.id ?? null;
  }
  saveWorkspace(state);

  if (project) {
    const projectFolder = path.join(getLibraryPath(), projectId);
    fs.rmSync(projectFolder, { recursive: true, force: true });
  }
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
    state.projects.flatMap((item) => item.documents.map((document) => document.fingerprint)),
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

      const parsed = await parseDocument(storedPath, { ocr: getOcrRuntime() });
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
  project.updatedAt = new Date().toISOString();
  saveWorkspace(state);
  if (document) removeDocumentCache(getLibraryPath(), projectId, document);
  if (document?.storedPath) fs.rmSync(document.storedPath, { force: true });
  return state;
}

function saveDraft(projectId, draft) {
  const state = loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const now = new Date().toISOString();
  normalizeConversations(project);
  const conversationId = draft.conversationId || project.activeConversationId;
  const saved = { id: draft.id || crypto.randomUUID(), createdAt: draft.createdAt || now, ...draft, conversationId, updatedAt: now };
  const existingIndex = project.drafts.findIndex((item) => item.id === saved.id);
  if (existingIndex >= 0) project.drafts[existingIndex] = saved;
  else project.drafts.unshift(saved);
  const conversation = project.conversations.find((item) => item.id === conversationId);
  if (conversation) {
    conversation.updatedAt = now;
    if (conversation.title === '新对话') conversation.title = conversationTitle(draft.task || draft.title);
  }
  project.updatedAt = now;
  saveWorkspace(state);
  return saved;
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
  sessionApiKey = key || '';
  if (mode === 'encrypted' && key) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法使用安全存储');
    fs.mkdirSync(path.dirname(getKeyPath(provider)), { recursive: true });
    fs.writeFileSync(getKeyPath(provider), safeStorage.encryptString(key));
  } else {
    fs.rmSync(getKeyPath(provider), { force: true });
  }
}

function getApiKey(mode, provider = 'deepseek') {
  if (mode === 'session') return sessionApiKey;
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
  closeWorkspace,
  createConversation,
  createProject,
  deleteProject,
  getApiKey,
  getOcrStatus,
  hasApiKey,
  importDocuments,
  loadWorkspace,
  listAgentRuns,
  removeDocument,
  resolveDraft,
  saveDraft,
  saveAgentRun,
  saveToolRun,
  setActiveProject,
  setActiveConversation,
  setApiKey,
  updateProject,
};
