const {
  app,
  BrowserWindow,
  screen,
  Tray,
  Menu,
  nativeImage,
  ipcMain,
  dialog,
  shell,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadSettings, saveSettings } = require('./settings');
const workspaceStore = require('./workspace-store');
const ragStore = require('./rag-store');
const { buildAcademicDocx } = require('./word-export');
const {
  buildConversationFileContext,
  prepareConversationFiles,
  resolveConversationAttachment,
  resolveConversationImage,
} = require('./conversation-files');
const { buildAcademicTable, normalizeCitationMarkers } = require('./citation-format');
const { AgentOrchestrator } = require('./agent/orchestrator');
const { ProviderRegistry, DEFAULT_PROVIDERS } = require('./providers/provider-registry');
const { ToolRegistry, findPythonExecutable, runProcess } = require('./tools/tool-registry');
const { SkillRuntime } = require('./skills/skill-runtime');
const { createProjectBootstrapPrompt } = require('./paper-writing-agent');
const { summarizeRuns } = require('./quality/evaluator');
const {
  buildAssembledThesis,
  isLongThesis,
} = require('./thesis-controller');

function formatProjectDomains(project) {
  const domains = Array.isArray(project.domains) ? project.domains : [project.domain].filter(Boolean);
  return domains.length ? domains.join('、') : '未分类';
}

const APP_ICON = path.join(__dirname, '../assets/icons/app-icon.ico');
const TRAY_ICON = path.join(__dirname, '../assets/icons/tray-icon.png');

function handleSquirrelEvent() {
  const event = process.argv[1];
  const supportedEvents = new Set([
    '--squirrel-install',
    '--squirrel-updated',
    '--squirrel-uninstall',
    '--squirrel-obsolete',
  ]);
  if (!supportedEvents.has(event)) return false;

  if (event !== '--squirrel-obsolete') {
    const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
    const shortcutAction = event === '--squirrel-uninstall' ? '--removeShortcut' : '--createShortcut';
    try {
      spawn(updateExe, [shortcutAction, path.basename(process.execPath)], {
        detached: true,
        stdio: 'ignore',
      }).unref();
    } catch {
      // Squirrel will still complete installation if shortcut creation is unavailable.
    }
  }

  setTimeout(() => app.quit(), 1000);
  return true;
}

const squirrelEventHandled = handleSquirrelEvent();

const PET_WINDOW = {
  width: 180,
  height: 170,
  margin: 24,
};

const WORKSPACE_WINDOW = {
  width: 1280,
  height: 820,
};

const PET_OPTIONS = [
  { id: 'ember-pup', label: 'Ember Pup · OpenPets 原创' },
  { id: 'shadow-kit', label: 'Shadow Kit · OpenPets 原创' },
  { id: 'nori', label: 'Nori · OpenPets 原创' },
];

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const MAX_EMBEDDED_IMAGE_SIZE = 12 * 1024 * 1024;

function asEmbeddedImage(filePath) {
  const extension = path.extname(filePath || '').toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[extension];
  if (!mimeType || !fs.existsSync(filePath)) return null;
  if (fs.statSync(filePath).size > MAX_EMBEDDED_IMAGE_SIZE) return null;
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function paperImageSources(attachments = [], toolResult = null) {
  const attachmentImages = new Map(attachments.map((attachment) => [attachment.id, attachment.previewDataUrl || resolveConversationImage(attachment)]));
  const generatedImages = new Set((toolResult?.files || [])
    .filter((filePath) => IMAGE_MIME_TYPES[path.extname(filePath || '').toLowerCase()])
    .map((filePath) => path.resolve(filePath).toLowerCase()));
  return { attachmentImages, generatedImages };
}

function materializePaperImages(content, attachments = [], toolResult = null) {
  const { attachmentImages, generatedImages } = paperImageSources(attachments, toolResult);
  return String(content || '').replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, source) => {
    let filePath = null;
    if (source.startsWith('attachment://')) filePath = attachmentImages.get(source.slice('attachment://'.length));
    else {
      try {
        const candidate = source.startsWith('file:') ? new URL(source).pathname : source;
        const resolved = path.resolve(decodeURIComponent(candidate));
        if (generatedImages.has(resolved.toLowerCase())) filePath = resolved;
      } catch {
        filePath = null;
      }
    }
    const embedded = typeof filePath === 'string' && filePath.startsWith('data:image/')
      ? filePath
      : filePath ? asEmbeddedImage(filePath) : null;
    return embedded ? `${prefix}${quote}${embedded}${quote}` : match;
  });
}

function removeUnavailablePaperImages(content, attachments = [], toolResult = null) {
  const { attachmentImages, generatedImages } = paperImageSources(attachments, toolResult);
  return String(content || '').replace(/<figure\b[^>]*>[\s\S]*?<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/figure>/gi, (figure, _quote, source) => {
    const isAttachment = source.startsWith('attachment://') && attachmentImages.has(source.slice('attachment://'.length));
    let isGenerated = false;
    try { isGenerated = generatedImages.has(path.resolve(decodeURIComponent(source)).toLowerCase()); } catch { isGenerated = false; }
    return isAttachment || isGenerated || source.startsWith('data:image/') ? figure : '';
  });
}

function ensureToolImagesInPaper(content, toolResult = null) {
  const imageFiles = (toolResult?.files || []).filter((filePath) => IMAGE_MIME_TYPES[path.extname(filePath || '').toLowerCase()]);
  if (!imageFiles.length) return content;
  const used = new Set([...String(content || '').matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi)].map((match) => {
    try { return path.resolve(decodeURIComponent(match[1])).toLowerCase(); } catch { return ''; }
  }));
  const figures = imageFiles.filter((filePath) => !used.has(path.resolve(filePath).toLowerCase())).map((filePath, index) => {
    const name = path.basename(filePath, path.extname(filePath));
    return `<figure><img src="${filePath}" alt="${name}"><figcaption>图 ${index + 1} ${name}</figcaption></figure>`;
  }).join('\n');
  return figures ? `${content}\n${figures}` : content;
}

function ensureAttachmentImagesInPaper(content, attachments = []) {
  const imageAttachments = attachments.filter((attachment) => attachment.previewDataUrl || resolveConversationImage(attachment));
  if (!imageAttachments.length) return content;
  const used = new Set([...String(content || '').matchAll(/attachment:\/\/([^"'\s>]+)/gi)].map((match) => match[1]));
  const figures = imageAttachments
    .filter((attachment) => !used.has(attachment.id))
    .map((attachment, index) => `<figure><img src="${attachment.previewDataUrl || `attachment://${attachment.id}`}" alt="${attachment.name}"><figcaption>图 ${index + 1} ${attachment.name}</figcaption></figure>`)
    .join('\n');
  if (!figures) return content;
  const firstFigureReference = /(<p\b[^>]*>[^<]*图\s*\d+[\s\S]*?<\/p>)/i;
  return firstFigureReference.test(content)
    ? content.replace(firstFigureReference, `$1\n${figures}`)
    : `${content}\n${figures}`;
}

function hasRealPaperImage(attachments = [], toolResult = null) {
  return attachments.some((attachment) => resolveConversationImage(attachment))
    || (toolResult?.files || []).some((filePath) => IMAGE_MIME_TYPES[path.extname(filePath || '').toLowerCase()]);
}

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let workspaceWindow = null;
/** @type {Tray | null} */
let tray = null;
let isQuitting = false;
const activeGenerationControllers = new Map();
let reminderShownThisLaunch = false;
let pendingPetReaction = null;

const AI_PROVIDERS = DEFAULT_PROVIDERS;
const providerRegistry = new ProviderRegistry(AI_PROVIDERS);

function getProvider(providerId) {
  return AI_PROVIDERS[providerId] ?? AI_PROVIDERS.deepseek;
}

const PROJECT_TYPES = new Set(['课程论文', '开题报告', '硕士学位论文', '博士学位论文', '期刊论文', '研究报告']);
const PROJECT_DOMAINS = new Set(['哲学', '经济学', '法学', '教育学', '文学', '历史学', '理学', '工学', '农学', '医学', '管理学', '艺术学', '其他']);

function extractJsonObject(value) {
  const source = String(value || '').trim();
  const match = source.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function fallbackProjectBootstrap(task) {
  const source = String(task || '').trim();
  const topic = source
    .replace(/^(请|帮我|麻烦|我想|需要|希望|给我)+/g, '')
    .replace(/^(写|撰写|完成|生成|做)(一篇|一个|一下)?/g, '')
    .replace(/^(关于|有关)/g, '')
    .replace(/(的)?(小论文|课程论文|学位论文|期刊论文|研究报告|论文)(正文)?$/g, '')
    .replace(/[。！？!?]/g, '')
    .trim();
  const title = `${topic.slice(0, 26) || '未命名主题'}研究`;
  const type = /博士/.test(source) ? '博士学位论文'
    : /硕士/.test(source) ? '硕士学位论文'
      : /开题/.test(source) ? '开题报告'
        : /期刊|投稿/.test(source) ? '期刊论文'
          : /报告/.test(source) ? '研究报告' : '课程论文';
  const domains = /政策|治理|管理|组织/.test(source) ? ['管理学']
    : /经济|就业|收入|金融/.test(source) ? ['经济学']
      : /教育|学校|教师|学生/.test(source) ? ['教育学']
        : /法律|法治|司法/.test(source) ? ['法学'] : ['其他'];
  return { title, type, domains, goal: source };
}

function normalizeProjectBootstrap(value, task) {
  const fallback = fallbackProjectBootstrap(task);
  const title = String(value?.title || '').replace(/[\r\n<>]/g, '').trim().slice(0, 80);
  const domains = Array.isArray(value?.domains) ? [...new Set(value.domains.filter((item) => PROJECT_DOMAINS.has(item)))].slice(0, 3) : [];
  return {
    title: title || fallback.title,
    type: PROJECT_TYPES.has(value?.type) ? value.type : fallback.type,
    domains: domains.length ? domains : fallback.domains,
    goal: String(value?.goal || task || '').trim().slice(0, 500),
  };
}

async function bootstrapProjectFromTask(task) {
  const settings = loadSettings();
  const apiKey = workspaceStore.getApiKey(settings.api.keyMode, settings.api.provider);
  let bootstrap = null;
  if (apiKey) {
    try {
      const response = await providerRegistry.complete(settings.api.provider, apiKey, [
        { role: 'system', content: createProjectBootstrapPrompt() },
        { role: 'user', content: String(task || '').trim() },
      ], { temperature: 0, maxTokens: 220 });
      bootstrap = extractJsonObject(response.content);
    } catch {
      bootstrap = null;
    }
  }
  const project = workspaceStore.createProject(normalizeProjectBootstrap(bootstrap, task));
  return { project, workspace: workspaceStore.loadWorkspace() };
}

function postProcessAgentContent(rawContent, attachments, toolResult, retrievalHits) {
  const citationEvidence = retrievalHits.map((hit, index) => ({ index: index + 1, documentName: hit.documentName, page: hit.page }));
  const generatedTable = buildAcademicTable(toolResult?.table);
  const contentWithoutPlaceholders = removeUnavailablePaperImages(rawContent, attachments, toolResult);
  const contentWithRequiredToolImages = ensureToolImagesInPaper(contentWithoutPlaceholders, toolResult);
  const contentWithRequiredImages = ensureAttachmentImagesInPaper(contentWithRequiredToolImages, attachments);
  const contentWithImages = materializePaperImages(contentWithRequiredImages, attachments, toolResult);
  const contentWithFootnotes = normalizeCitationMarkers(contentWithImages, citationEvidence);
  return generatedTable && !/<table\b/i.test(contentWithFootnotes) ? `${contentWithFootnotes}\n\n${generatedTable}` : contentWithFootnotes;
}

function getAgentOrchestrator(event) {
  const toolRegistry = new ToolRegistry({
    userDataPath: app.getPath('userData'),
    scriptPath: path.join(__dirname, '../scripts/data_analysis.py'),
    resolveAttachment: resolveConversationAttachment,
    loadSettings,
    saveToolRun: (run) => workspaceStore.saveToolRun(run),
  });
  return new AgentOrchestrator({
    workspaceStore,
    ragStore,
    providerRegistry,
    toolRegistry,
    skillRuntime: new SkillRuntime(path.join(__dirname, '../assets/skills')),
    loadSettings,
    buildConversationFileContext,
    postProcessContent: postProcessAgentContent,
    emitStream: (requestId, delta) => {
      if (!event.sender.isDestroyed()) event.sender.send('draft-stream-chunk', { requestId, delta });
    },
    react: sendPetReaction,
    playCompletion: playCompletionSound,
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
}

function getBottomRightBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + workArea.width - PET_WINDOW.width - PET_WINDOW.margin,
    y: workArea.y + workArea.height - PET_WINDOW.height - PET_WINDOW.margin,
    width: PET_WINDOW.width,
    height: PET_WINDOW.height,
  };
}

function getPetWindowBounds() {
  const fallback = getBottomRightBounds();
  const { petPosition } = loadSettings();
  if (!Number.isFinite(petPosition?.x) || !Number.isFinite(petPosition?.y)) return fallback;

  const display = screen.getDisplayNearestPoint({ x: petPosition.x, y: petPosition.y });
  const { workArea } = display;
  return {
    x: Math.max(workArea.x, Math.min(petPosition.x, workArea.x + workArea.width - PET_WINDOW.width)),
    y: Math.max(workArea.y, Math.min(petPosition.y, workArea.y + workArea.height - PET_WINDOW.height)),
    width: PET_WINDOW.width,
    height: PET_WINDOW.height,
  };
}

function getTrayIcon() {
  const image = nativeImage.createFromPath(TRAY_ICON);
  return image.isEmpty() ? nativeImage.createEmpty() : image;
}

function showPetWindow() {
  if (!mainWindow) {
    createMainWindow();
    return;
  }

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }

  mainWindow.focus();
}

function hidePetWindow() {
  mainWindow?.hide();
}

function toggleAlwaysOnTop() {
  const settings = loadSettings();
  const next = !settings.alwaysOnTop;
  saveSettings({ alwaysOnTop: next });
  mainWindow?.setAlwaysOnTop(next);
  updateTrayMenu();
  return next;
}

function setPet(petId) {
  if (!PET_OPTIONS.some((pet) => pet.id === petId)) return;
  saveSettings({ pet: petId });
  mainWindow?.webContents.send('pet-changed', petId);
  updateTrayMenu();
}

function sendPetReaction(state, message, options = {}) {
  pendingPetReaction = { ...options, state, message };
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('pet-reaction', pendingPetReaction);
  pendingPetReaction = null;
}

function playCompletionSound() {
  if (!loadSettings().soundEnabled) return;
  shell.beep();
  setTimeout(() => shell.beep(), 220);
}

function getGrowthStage() {
  const thresholds = [0, 10000, 50000, 200000, 1000000];
  const workspace = workspaceStore.loadWorkspace();
  const documents = new Map();
  for (const project of workspace.projects) {
    for (const document of project.documents || []) {
      if (document.status === 'parsed') documents.set(document.fingerprint, document);
    }
  }
  const totalMb = [...documents.values()].reduce((sum, document) => sum + Number(document.size || 0), 0) / 1000000;
  return Math.max(1, thresholds.findLastIndex((threshold) => totalMb >= threshold) + 1);
}

function openWorkspace() {
  if (workspaceWindow && !workspaceWindow.isDestroyed()) {
    if (workspaceWindow.isMinimized()) workspaceWindow.restore();
    workspaceWindow.show();
    workspaceWindow.focus();
    return;
  }

  const display = screen.getDisplayMatching(mainWindow?.getBounds() || getPetWindowBounds());
  const { workArea } = display;
  const width = Math.min(WORKSPACE_WINDOW.width, workArea.width);
  const height = Math.min(WORKSPACE_WINDOW.height, workArea.height);

  workspaceWindow = new BrowserWindow({
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
    minWidth: 820,
    minHeight: 600,
    frame: false,
    icon: APP_ICON,
    backgroundColor: '#151515',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  workspaceWindow.loadFile(path.join(__dirname, '../src/feed.html'));
  workspaceWindow.once('ready-to-show', () => workspaceWindow?.show());
  workspaceWindow.webContents.once('did-finish-load', () => workspaceWindow?.show());
  workspaceWindow.webContents.on('did-fail-load', (_event, _code, description, validatedUrl) => {
    console.error(`工作台页面加载失败：${description} (${validatedUrl})`);
  });
  workspaceWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      workspaceWindow?.hide();
    }
  });
  workspaceWindow.on('closed', () => { workspaceWindow = null; });
}

function showPetMode() {
  workspaceWindow?.hide();
  showPetWindow();
}

function quitApp() {
  isQuitting = true;
  app.quit();
}

function buildContextMenu() {
  const settings = loadSettings();
  const isVisible = mainWindow?.isVisible() ?? true;

  return Menu.buildFromTemplate([
    {
      label: isVisible ? '隐藏宠物' : '显示宠物',
      click: () => {
        if (isVisible) {
          hidePetWindow();
        } else {
          showPetWindow();
        }
      },
    },
    {
      label: '窗口置顶',
      type: 'checkbox',
      checked: settings.alwaysOnTop,
      click: () => toggleAlwaysOnTop(),
    },
    { type: 'separator' },
    {
      label: '切换宠物',
      submenu: PET_OPTIONS.map((pet) => ({
        label: pet.label,
        type: 'radio',
        checked: settings.pet === pet.id,
        click: () => setPet(pet.id),
      })),
    },
    { type: 'separator' },
    {
      label: '打开工作台',
      click: () => openWorkspace(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => quitApp(),
    },
  ]);
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(buildContextMenu());
}

function createTray() {
  tray = new Tray(getTrayIcon());
  tray.setToolTip('AI 论文宠物');

  tray.on('double-click', () => {
    showPetWindow();
  });

  updateTrayMenu();
}

function createMainWindow() {
  const bounds = getPetWindowBounds();
  const settings = loadSettings();

  mainWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    title: '',
    icon: APP_ICON,
    transparent: true,
    backgroundColor: '#00000000',
    roundedCorners: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setAlwaysOnTop(settings.alwaysOnTop);
  mainWindow.setBackgroundColor('#00000000');
  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    mainWindow?.webContents.send('pet-changed', settings.pet);
  });
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.show();
    mainWindow?.webContents.send('pet-changed', settings.pet);
  });
  mainWindow.webContents.on('did-fail-load', (_event, _code, description, validatedUrl) => {
    console.error(`宠物页面加载失败：${description} (${validatedUrl})`);
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      hidePetWindow();
    }
  });

  mainWindow.on('show', updateTrayMenu);
  mainWindow.on('hide', updateTrayMenu);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

ipcMain.handle('show-context-menu', () => {
  const menu = buildContextMenu();
  menu.popup({ window: mainWindow ?? undefined });
});

ipcMain.handle('get-settings', () => ({ ...loadSettings(), growthStage: getGrowthStage() }));
ipcMain.handle('consume-launch-reminder', () => {
  if (reminderShownThisLaunch) return false;
  reminderShownThisLaunch = true;
  return true;
});
ipcMain.handle('save-settings', (_event, partial) => {
  const settings = saveSettings(partial);
  if (partial && Object.prototype.hasOwnProperty.call(partial, 'pet')) {
    mainWindow?.webContents.send('pet-changed', settings.pet);
    updateTrayMenu();
  }
  if (partial && Object.prototype.hasOwnProperty.call(partial, 'petVisible')) {
    if (settings.petVisible) showPetWindow();
    else hidePetWindow();
  }
  return settings;
});
ipcMain.handle('get-pet-window-position', () => {
  const [x, y] = mainWindow?.getPosition() ?? [0, 0];
  return { x, y };
});
ipcMain.on('move-pet-window', (_event, target) => {
  if (!mainWindow) return;
  const x = Number(target?.x);
  const y = Number(target?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return;
  const display = screen.getDisplayNearestPoint({ x, y });
  const { workArea } = display;
  mainWindow.setPosition(
    Math.round(Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - PET_WINDOW.width))),
    Math.round(Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - PET_WINDOW.height))),
  );
});
ipcMain.on('end-pet-window-drag', () => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  saveSettings({ petPosition: { x, y } });
});
ipcMain.on('set-pet-reaction', (_event, payload) => {
  const allowed = new Set(['idle', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review']);
  const state = allowed.has(payload?.state) ? payload.state : 'idle';
  sendPetReaction(state, typeof payload?.message === 'string' ? payload.message.slice(0, 120) : '', payload || {});
});
ipcMain.handle('open-workspace', () => openWorkspace());
ipcMain.handle('show-pet-mode', () => showPetMode());
ipcMain.handle('hide-pet', () => hidePetWindow());
ipcMain.handle('choose-document-files', async () => {
  const result = await dialog.showOpenDialog(workspaceWindow || mainWindow, {
    title: '选择要投喂的论文资料',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '论文资料', extensions: ['pdf', 'txt', 'md', 'docx', 'csv', 'xlsx', 'png', 'jpg', 'jpeg', 'bib'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  });

  if (result.canceled) return [];

  return result.filePaths;
});

ipcMain.handle('choose-conversation-files', async () => {
  const result = await dialog.showOpenDialog(workspaceWindow || mainWindow, {
    title: '选择本轮工作文件（不会加入项目资料库或参考文献）',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '工作文件', extensions: ['pdf', 'txt', 'md', 'docx', 'csv', 'xlsx', 'zip', 'png', 'jpg', 'jpeg', 'json', 'py', 'r'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return prepareConversationFiles(result.filePaths);
});

ipcMain.handle('workspace-load', () => workspaceStore.loadWorkspace());
ipcMain.handle('project-create', (_event, input) => workspaceStore.createProject(input));
ipcMain.handle('project-create-from-task', (_event, task) => bootstrapProjectFromTask(task));
ipcMain.handle('conversation-create', (_event, projectId, input) => workspaceStore.createConversation(projectId, input));
ipcMain.handle('conversation-set-active', (_event, projectId, conversationId) => workspaceStore.setActiveConversation(projectId, conversationId));
ipcMain.handle('project-update', (_event, projectId, partial) => workspaceStore.updateProject(projectId, partial));
ipcMain.handle('project-set-active', (_event, projectId) => workspaceStore.setActiveProject(projectId));
ipcMain.handle('project-delete', (_event, projectId) => workspaceStore.deleteProject(projectId));
ipcMain.handle('documents-import', async (_event, projectId, filePaths) => {
  sendPetReaction('review', '我在整理新资料，请稍等一下～');
  const result = await workspaceStore.importDocuments(projectId, filePaths);
  const project = result.state.projects.find((item) => item.id === projectId);
  if (project && result.imported.some((document) => document.status === 'parsed')) {
    result.rag = await ragStore.indexProject(project);
  }
  sendPetReaction(result.rejected.length && !result.imported.length ? 'failed' : 'jumping', result.imported.length ? `成功投喂 ${result.imported.length} 份资料！` : '这次没有成功加入资料。');
  return result;
});
ipcMain.handle('document-remove', async (_event, projectId, documentId) => {
  const state = workspaceStore.removeDocument(projectId, documentId);
  const project = state.projects.find((item) => item.id === projectId);
  if (project) await ragStore.indexProject(project);
  return state;
});
ipcMain.handle('rag-status', (_event, projectId) => {
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  return ragStore.getStatus(project);
});
ipcMain.handle('rag-rebuild', async (_event, projectId) => {
  sendPetReaction('running', '正在重建论文知识库…');
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  await ragStore.indexProject(project);
  sendPetReaction('jumping', '知识库已经准备好啦！');
  return ragStore.getStatus(project);
});
ipcMain.handle('draft-save', (_event, projectId, draft) => workspaceStore.saveDraft(projectId, draft));

ipcMain.handle('api-save', (_event, config, apiKey) => {
  const providerId = AI_PROVIDERS[config?.provider] ? config.provider : 'deepseek';
  const provider = getProvider(providerId);
  const api = {
    provider: providerId,
    baseUrl: provider.endpoint,
    model: provider.model,
    keyMode: 'encrypted',
  };
  const settings = saveSettings({ api });
  workspaceStore.setApiKey(apiKey, 'encrypted', providerId);
  return { settings, hasKey: workspaceStore.hasApiKey('encrypted', providerId) };
});

ipcMain.handle('api-status', (_event, providerId) => {
  const settings = loadSettings();
  const selectedProvider = AI_PROVIDERS[providerId] ? providerId : settings.api.provider;
  const provider = getProvider(selectedProvider);
  return {
    config: { ...settings.api, provider: selectedProvider, providerLabel: provider.label, model: provider.model },
    hasKey: workspaceStore.hasApiKey('encrypted', selectedProvider),
  };
});

ipcMain.handle('api-reveal-key', (_event, providerId) => {
  const settings = loadSettings();
  const selectedProvider = AI_PROVIDERS[providerId] ? providerId : settings.api.provider;
  return workspaceStore.getApiKey('encrypted', selectedProvider);
});

async function getDataEnvironmentStatus() {
  try {
    const python = await findPythonExecutable(loadSettings());
    const code = "import sys, importlib.util, json; print(json.dumps({'python': sys.executable, 'version': sys.version.split()[0], 'packages': {name: bool(importlib.util.find_spec(name)) for name in ('pandas','openpyxl','matplotlib')}}))";
    const stdout = await runProcess(python.executable, [...python.prefix, '-c', code]);
    const status = JSON.parse(stdout.trim());
    status.ready = Object.values(status.packages).every(Boolean);
    status.installCommand = `\"${status.python}\" -m pip install pandas openpyxl matplotlib`;
    return status;
  } catch (error) {
    return { ready: false, error: error.message, packages: {}, installCommand: 'python -m pip install pandas openpyxl matplotlib' };
  }
}

ipcMain.handle('draft-cancel', (_event, requestId) => {
  const controller = activeGenerationControllers.get(requestId);
  if (!controller) return { canceled: false };
  controller.abort();
  return { canceled: true };
});

ipcMain.handle('api-test', async (_event, providerId, apiKey) => {
  const settings = loadSettings();
  const selectedProvider = AI_PROVIDERS[providerId] ? providerId : settings.api.provider;
  const key = String(apiKey || workspaceStore.getApiKey('encrypted', selectedProvider) || '').trim();
  if (!key) throw new Error(`请先填写 ${getProvider(selectedProvider).label} API Key。`);
  await providerRegistry.complete(selectedProvider, key, [{ role: 'user', content: '只回复：连接成功' }], { temperature: 0, maxTokens: 8 });
  return { ok: true };
});

ipcMain.handle('data-environment-status', () => getDataEnvironmentStatus());
ipcMain.handle('ocr-status', () => workspaceStore.getOcrStatus());
ipcMain.handle('agent-quality-summary', (_event, projectId) => summarizeRuns(workspaceStore.listAgentRuns(projectId, 200)));

ipcMain.handle('draft-generate', async (event, projectId, request) => {
  const controller = new AbortController();
  activeGenerationControllers.set(request.requestId, controller);
  sendPetReaction('review', '主人，我正在检索文献并认真思考…');
  try {
    return await getAgentOrchestrator(event).run({ projectId, request, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted || error.name === 'AbortError') {
      sendPetReaction('waving', '已停止当前回复，等你新的引导。');
      throw new Error('已停止当前回复');
    }
    sendPetReaction('failed', `主人，我遇到问题了：${error.message}`);
    throw error;
  } finally {
    activeGenerationControllers.delete(request.requestId);
  }
});

ipcMain.handle('thesis-export-assembled', async (_event, projectId) => {
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  if (!isLongThesis(project)) throw new Error('仅 4 万字及以上的硕士论文项目支持全文组装导出');
  const draft = buildAssembledThesis(project);
  const result = await dialog.showSaveDialog(workspaceWindow || mainWindow, {
    title: '导出组装论文 Word 文档',
    defaultPath: `${project.title.replace(/[\\/:*?"<>|]/g, '_')}-组装草稿.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, await buildAcademicDocx(project, draft));
  return { canceled: false, filePath: result.filePath, checks: draft.checks };
});

ipcMain.handle('draft-export-word', async (_event, projectId, draft) => {
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const result = await dialog.showSaveDialog(workspaceWindow || mainWindow, {
    title: '导出高校论文 Word 文档',
    defaultPath: `${project.title.replace(/[\\/:*?"<>|]/g, '_')}.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  const output = await buildAcademicDocx(project, draft);
  fs.writeFileSync(result.filePath, output);
  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(() => {
  if (squirrelEventHandled) return;
  app.setAppUserModelId('cn.openpaper.paperpet');
  createMainWindow();
  createTray();

  if (process.argv.includes('--workspace')) {
    setTimeout(openWorkspace, 600);
  }

  app.on('activate', () => {
    showPetWindow();
  });
});

app.on('second-instance', () => {
  openWorkspace();
  showPetWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' && isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  workspaceStore.closeWorkspace().catch(() => {});
});
