const interactionBroker = new (require('./agent/interaction-broker').InteractionBroker)();
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
  clipboard,
  ClipboardItem,
} = require('electron');
const fs = require('fs');
const path = require('path');
const { loadSettings, saveSettings } = require('./settings');
const workspaceStore = require('./workspace-store');
const ragStore = require('./rag-store');
const { buildAcademicDocx } = require('./word-export');
const {
  buildConversationFileContext,
  prepareConversationFiles,
  resolveConversationAttachment,
} = require('./conversation-files');
const { postProcessAgentContent } = require('./paper-output');
const { AgentOrchestrator } = require('./agent/orchestrator');
const { ProviderRegistry, DEFAULT_PROVIDERS, resolveEndpoint } = require('./providers/provider-registry');
const { ToolRegistry, findPythonExecutable, runProcess } = require('./tools/tool-registry');
const { SkillRuntime } = require('./skills/skill-runtime');
const { applyLocalEdit } = require('./agent/local-edit');
const { createProjectBootstrapPrompt } = require('./paper-writing-agent');
const { summarizeRuns } = require('./quality/evaluator');
const { resolveAgentConfig, resolveAgentKey, normalizeAgents, validateApiUrl } = require('./agent-api-config');
const { createAgentApiService } = require('./agent-api-service');
const { assertTrustedSender, secureWindow } = require('./app-security');
const { getSandboxStatus } = require('./sandbox/windows-sandbox');
const {
  buildAssembledThesis,
  buildChapterPlan,
} = require('./thesis-controller');

function formatProjectDomains(project) {
  const domains = Array.isArray(project.domains) ? project.domains : [project.domain].filter(Boolean);
  return domains.length ? domains.join('、') : '未分类';
}

const APP_ICON = path.join(__dirname, '../assets/icons/app-icon.ico');
const TRAY_ICON = path.join(__dirname, '../assets/icons/tray-icon.png');

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

function handleApp(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedSender(event, [mainWindow, workspaceWindow], path.join(__dirname, '..'));
    return handler(event, ...args);
  });
}
function onApp(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    try { assertTrustedSender(event, [mainWindow, workspaceWindow], path.join(__dirname, '..')); }
    catch { return; }
    handler(event, ...args);
  });
}

const AI_PROVIDERS = DEFAULT_PROVIDERS;
const providerRegistry = new ProviderRegistry(AI_PROVIDERS);

function getProvider(providerId) {
  return AI_PROVIDERS[providerId] ?? AI_PROVIDERS.deepseek;
}

/** 共用配置的默认模型；各 Agent 可通过独立配置覆盖。 */
const API_SCENARIOS = ['writing', 'planning', 'analysis'];

function normalizeScenarios(raw) {
  const scenarios = { ...(AI_PROVIDERS.deepseek.scenarios || {}) };
  for (const key of API_SCENARIOS) {
    const value = String(raw?.[key] || '').trim();
    if (value) scenarios[key] = value;
  }
  return scenarios;
}

function normalizeBaseUrl(raw) {
  const value = String(raw || '').trim().replace(/\/+$/, '');
  if (value) return validateApiUrl(value);
  return AI_PROVIDERS.deepseek.endpoint.replace(/\/chat\/completions$/, '');
}

/** 按场景解析出一次模型请求需要的完整配置（endpoint + model）。 */
function resolveApiRequestConfig(settings, scenario) {
  const config = resolveAgentConfig(settings, scenario);
  return { providerId: config.provider, endpoint: resolveEndpoint(config.baseUrl, getProvider(config.provider).endpoint), model: config.model };
}

/** 统一模型请求入口：按场景解析 endpoint/model 并注入系统安全存储中的 API Key。供工具与编排器复用。 */
async function requestModel({ scenario, messages, options = {} }) {
  const settings = loadSettings();
  const cfg = resolveApiRequestConfig(settings, scenario);
  const apiKey = resolveAgentKey(workspaceStore, settings, scenario || 'writing');
  if (!apiKey) throw new Error('未配置 API Key，请先在“设置 → AI 配置”填写后重试。');
  return providerRegistry.complete(cfg.providerId, apiKey, messages, { ...options, endpoint: cfg.endpoint, model: cfg.model });
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
    const requestConfig = resolveApiRequestConfig(settings, 'planning');
    try {
      const response = await providerRegistry.complete(requestConfig.providerId, apiKey, [
        { role: 'system', content: createProjectBootstrapPrompt() },
        { role: 'user', content: String(task || '').trim() },
      ], { temperature: 0, maxTokens: 220, endpoint: requestConfig.endpoint, model: requestConfig.model });
      bootstrap = extractJsonObject(response.content);
    } catch {
      bootstrap = null;
    }
  }
  const project = workspaceStore.createProject(normalizeProjectBootstrap(bootstrap, task));
  return { project, workspace: workspaceStore.loadWorkspace() };
}

function getAgentOrchestrator(event) {
  const toolRegistry = new ToolRegistry({
    userDataPath: app.getPath('userData'),
    scriptPath: path.join(__dirname, '../scripts/data_analysis.py').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1'),
    resolveAttachment: resolveConversationAttachment,
    loadSettings,
    saveToolRun: (run) => workspaceStore.saveToolRun(run),
    requestModel,
  });
  return new AgentOrchestrator({
    workspaceStore,
    waitForInteraction: args => interactionBroker.wait({ ...args, owner: event.sender.id }),
    ragStore,
    providerRegistry,
    toolRegistry,
    skillRuntime: new SkillRuntime(path.join(__dirname, '../assets/research-skills')),
    loadSettings,
    buildConversationFileContext,
    postProcessContent: postProcessAgentContent,
    emitStream: (requestId, delta) => {
      if (!event.sender.isDestroyed()) event.sender.send('draft-stream-chunk', { requestId, delta });
    },
    emitStatus: (requestId, payload) => {
      if (!event.sender.isDestroyed()) event.sender.send('agent-task-status', { requestId, ...payload });
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
  const savedWorkspaceBounds=loadSettings().workspaceBounds;
  const width = Math.min(Math.max(820,Number(savedWorkspaceBounds?.width)||WORKSPACE_WINDOW.width), workArea.width);
  const height = Math.min(Math.max(600,Number(savedWorkspaceBounds?.height)||WORKSPACE_WINDOW.height), workArea.height);

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
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  secureWindow(workspaceWindow, path.join(__dirname, '..'));
  const persistWorkspaceBounds=()=>{if(workspaceWindow&&!workspaceWindow.isDestroyed()&&!workspaceWindow.isMaximized()&&!workspaceWindow.isMinimized())saveSettings({workspaceBounds:workspaceWindow.getNormalBounds()});};
  workspaceWindow.on('resized',persistWorkspaceBounds);
  workspaceWindow.on('moved',persistWorkspaceBounds);
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
  secureWindow(mainWindow, path.join(__dirname, '..'));
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

handleApp('show-context-menu', () => {
  const menu = buildContextMenu();
  menu.popup({ window: mainWindow ?? undefined });
});

handleApp('get-settings', () => ({ ...loadSettings(), growthStage: getGrowthStage() }));
handleApp('consume-launch-reminder', () => {
  if (reminderShownThisLaunch) return false;
  reminderShownThisLaunch = true;
  return true;
});
handleApp('save-settings', (_event, partial) => {
  if (partial?.api) throw new Error('AI 配置请使用专门的安全保存入口。');
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
handleApp('get-pet-window-position', () => {
  const [x, y] = mainWindow?.getPosition() ?? [0, 0];
  return { x, y };
});
onApp('move-pet-window', (_event, target) => {
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
onApp('end-pet-window-drag', () => {
  if (!mainWindow) return;
  const [x, y] = mainWindow.getPosition();
  saveSettings({ petPosition: { x, y } });
});
onApp('set-pet-reaction', (_event, payload) => {
  const allowed = new Set(['idle', 'waving', 'jumping', 'failed', 'waiting', 'running', 'review']);
  const state = allowed.has(payload?.state) ? payload.state : 'idle';
  sendPetReaction(state, typeof payload?.message === 'string' ? payload.message.slice(0, 120) : '', payload || {});
});
handleApp('open-workspace', () => openWorkspace());
handleApp('show-pet-mode', () => showPetMode());
handleApp('workspace-window-control', (_event, action) => {
  if (!workspaceWindow || workspaceWindow.isDestroyed()) return { maximized: false };
  if (action === 'minimize') workspaceWindow.minimize();
  else if (action === 'toggle-maximize') { if (workspaceWindow.isMaximized()) workspaceWindow.unmaximize(); else workspaceWindow.maximize(); }
  else if (action !== 'state') throw new Error('不支持的窗口操作');
  return { maximized: workspaceWindow.isMaximized() };
});
handleApp('hide-pet', () => hidePetWindow());
handleApp('formatting-requirements-import',async()=>{
  const chosen=await dialog.showOpenDialog(workspaceWindow||mainWindow,{title:'选择论文格式要求',properties:['openFile'],filters:[{name:'格式要求文档',extensions:['docx','pdf','txt','md']}]});
  if(chosen.canceled||!chosen.filePaths[0])return {canceled:true};
  const file=chosen.filePaths[0];if(!['.docx','.pdf','.txt','.md'].includes(path.extname(file).toLowerCase())||fs.statSync(file).size>10*1024*1024)throw new Error('请选择 10 MB 以内的 DOCX、PDF、TXT 或 Markdown 格式要求。');
  const parsed=await require('./document-parser').parseDocument(file);
  if(parsed.status!=='parsed')throw new Error('无法提取格式要求文字。扫描 PDF 请先转为文字版，或直接填写排版参数。');
  return {canceled:false,name:path.basename(file),...require('./document-formatting').parseFormattingRequirements(parsed.text)};
});
handleApp('choose-document-files', async () => {
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

handleApp('choose-conversation-files', async (_event, projectId, folder = false, conversationId) => {
  const result = await dialog.showOpenDialog(workspaceWindow || mainWindow, {
    title: folder ? '添加文件夹到当前项目' : '添加文件到当前项目',
    properties: folder ? ['openDirectory', 'multiSelections'] : ['openFile', 'multiSelections'],
    filters: [
      { name: '工作文件', extensions: ['pdf', 'txt', 'md', 'docx', 'csv', 'xlsx', 'zip', 'png', 'jpg', 'jpeg', 'json', 'py', 'r'] },
      { name: '全部文件', extensions: ['*'] },
    ],
  });
  if (result.canceled) return [];
  return require('./project-files').importProjectFiles({ store: workspaceStore, ragStore, projectId, paths: result.filePaths, conversationId });
});
handleApp('conversation-files-import', (_event, projectId, paths, conversationId) => require('./project-files').importProjectFiles({ store: workspaceStore, ragStore, projectId, paths, conversationId }));
handleApp('uploaded-file-preview', (_event, projectId, conversationId, id, page = 1, sheet = 0) => require('./upload-preview').previewUpload({ store: workspaceStore, projectId, conversationId, id, page, sheet }));
handleApp('file-bytes-preview', (_event, payload) => require('./upload-preview').previewEncodedBytes(payload));
handleApp('file-bytes-search',(_event,payload)=>require('./upload-preview').searchEncodedDocument(payload));

handleApp('workspace-load', () => workspaceStore.loadWorkspace());
handleApp('project-create', (_event, input) => workspaceStore.createProject(input));
handleApp('project-create-from-task', (_event, task) => bootstrapProjectFromTask(task));
handleApp('conversation-create', (_event, projectId, input) => workspaceStore.createConversation(projectId, input));
handleApp('conversation-delete', (_event, projectId, conversationId) => workspaceStore.deleteConversation(projectId, conversationId));
handleApp('conversation-set-active', (_event, projectId, conversationId) => workspaceStore.setActiveConversation(projectId, conversationId));
handleApp('project-update', (_event, projectId, partial) => {
  if (['empiricalPlans', 'projectFiles', 'removedAttachmentIds', 'dataPreparations', 'confirmedAnalysisChoices', 'confirmedDecisions'].some(key => key in (partial || {}))) throw new Error('方案和项目文件只能由专门流程更新');
  return workspaceStore.updateProject(projectId, partial);
});
handleApp('project-set-active', (_event, projectId) => workspaceStore.setActiveProject(projectId));
handleApp('project-delete', async (_event, projectId) => {
  const running = [...activeGenerationControllers.values()].filter(controller => controller.projectId === projectId);
  for (const controller of running) controller.abort();
  await Promise.allSettled(running.map(controller => controller.completion));
  return workspaceStore.deleteProject(projectId);
});
handleApp('documents-import', async (_event, projectId, filePaths) => {
  sendPetReaction('review', '我在整理新资料，请稍等一下～');
  const result = await workspaceStore.importDocuments(projectId, filePaths);
  const project = result.state.projects.find((item) => item.id === projectId);
  if (project && result.imported.some((document) => document.status === 'parsed')) {
    result.rag = await ragStore.indexProject(project);
  }
  sendPetReaction(result.rejected.length && !result.imported.length ? 'failed' : 'jumping', result.imported.length ? `成功投喂 ${result.imported.length} 份资料！` : '这次没有成功加入资料。');
  return result;
});
handleApp('document-remove', async (_event, projectId, documentId) => {
  const state = workspaceStore.removeDocument(projectId, documentId);
  const project = state.projects.find((item) => item.id === projectId);
  if (project) await ragStore.indexProject(project);
  return state;
});
handleApp('rag-status', (_event, projectId) => {
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  return ragStore.getStatus(project);
});
handleApp('rag-rebuild', async (_event, projectId) => {
  sendPetReaction('running', '正在重建论文知识库…');
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  await ragStore.indexProject(project);
  sendPetReaction('jumping', '知识库已经准备好啦！');
  return ragStore.getStatus(project);
});
handleApp('draft-save', (_event, projectId, draft) => workspaceStore.saveDraft(projectId, {...draft,changeOrigin:'user'}));
handleApp('turn-changes-review',(_event,projectId,conversationId,runId)=>require('./turn-changes').review(workspaceStore,projectId,conversationId,runId));
handleApp('turn-changes-undo',(_event,projectId,conversationId,runId)=>require('./turn-changes').undo(workspaceStore,projectId,conversationId,runId));
handleApp('thesis-preview-assembled',(_event,projectId)=>{const project=workspaceStore.loadWorkspace().projects.find(p=>p.id===projectId);if(!project)throw new Error('项目不存在');return require('./thesis-controller').buildAssembledThesis(project);});
handleApp('project-research-blueprint',(_event,input)=>({chapters:buildChapterPlan(input||{}),preflight:require('./research-design').methodPreflight(input||{})}));
handleApp('draft-assign-chapter',(_event,projectId,draftId,chapterId)=>workspaceStore.assignDraftChapter(projectId,draftId,chapterId));
handleApp('project-outline-extract',(_event,projectId,documentId)=>{
  const project=workspaceStore.loadWorkspace().projects.find(p=>p.id===projectId),document=project?.documents.find(d=>d.id===documentId);
  if(!document||document.status!=='parsed')throw new Error('请先上传并解析当前项目的目录或模板文件');
  return require('./outline-import').extractOutline(document.text,require('./thesis-controller').ensureThesisControl(project).chapters);
});
handleApp('document-metadata-update',(_event,projectId,documentId,partial)=>workspaceStore.updateDocumentMetadata(projectId,documentId,partial));
handleApp('project-backup',async(_event,projectId)=>{
  const project=workspaceStore.loadWorkspace().projects.find(p=>p.id===projectId);if(!project)throw new Error('项目不存在');
  const result=await dialog.showSaveDialog(workspaceWindow||mainWindow,{title:'备份项目（不含模型密钥）',defaultPath:`${project.title.replace(/[\\/:*?"<>|]/g,'_')}.paperpet`,filters:[{name:'论文宠物项目备份',extensions:['paperpet']}]});if(result.canceled)return {canceled:true};
  const bytes=await require('./project-backup').createBackup(project,app.getPath('userData'));fs.writeFileSync(result.filePath,bytes);return {canceled:false};
});
handleApp('project-restore-backup',async()=>{
  const result=await dialog.showOpenDialog(workspaceWindow||mainWindow,{title:'恢复为独立项目副本',properties:['openFile'],filters:[{name:'论文宠物项目备份',extensions:['paperpet']}]});if(result.canceled)return {canceled:true};
  const project=await require('./project-backup').restoreBackup(fs.readFileSync(result.filePaths[0]),app.getPath('userData'));workspaceStore.addRestoredProject(project);return {canceled:false,projectId:project.id};
});

const agentApiService = createAgentApiService({ store: workspaceStore, loadSettings, saveSettings, providerRegistry });
handleApp('agent-api-status', () => agentApiService.status());
handleApp('agent-api-save', (_event, scenario, config, key, clear) => { if (config?.enabled && config.provider === 'custom') throw new Error('本期不提供自定义中转站接口。'); return agentApiService.save(scenario, config, key, clear); });
handleApp('agent-api-test', (_event, scenario, config, key) => { if (config?.enabled && config.provider === 'custom') throw new Error('本期不提供自定义中转站接口。'); return agentApiService.test(scenario, config, key); });

handleApp('api-save', (_event, config, apiKey) => {
  if (config?.provider === 'custom' || config === 'custom') throw new Error('本期不提供自定义中转站接口。');
  const providerId = AI_PROVIDERS[config?.provider] ? config.provider : 'deepseek';
  const baseUrl = validateApiUrl(config?.baseUrl || AI_PROVIDERS[providerId].endpoint);
  const model = String(config?.model || AI_PROVIDERS[providerId].model).trim();
  const scenarios = config?.model ? Object.fromEntries(['planning', 'writing', 'chat', 'analysis'].map(name => [name, model])) : normalizeScenarios(config?.scenarios);
  const api = {
    provider: providerId,
    baseUrl,
    model: scenarios.writing,
    scenarios,
    keyMode: 'encrypted',
  };
  api.agents = normalizeAgents(loadSettings().api.agents);
  const settings = saveSettings({ api });
  workspaceStore.setApiKey(apiKey, 'encrypted', providerId);
  return { settings, hasKey: workspaceStore.hasApiKey('encrypted', providerId) };
});

handleApp('api-status', (_event, providerId) => {
  const settings = loadSettings();
  const selectedProvider = AI_PROVIDERS[providerId] ? providerId : settings.api.provider;
  const provider = getProvider(selectedProvider);
  return {
    config: { ...settings.api, provider: selectedProvider, providerLabel: provider.label },
    hasKey: workspaceStore.hasApiKey('encrypted', selectedProvider),
  };
});

handleApp('api-reveal-key', (_event, providerId) => {
  const settings = loadSettings();
  const selectedProvider = AI_PROVIDERS[providerId] ? providerId : settings.api.provider;
  return workspaceStore.getApiKey('encrypted', selectedProvider);
});

async function getDataEnvironmentStatus() {
  try {
    const python = await findPythonExecutable(loadSettings());
    const code = "import sys, importlib.util, json; print(json.dumps({'python': sys.executable, 'version': sys.version.split()[0], 'packages': {name: bool(importlib.util.find_spec(name)) for name in ('pandas','numpy','scipy','openpyxl','matplotlib','dtaidistance')}}))";
    const stdout = await runProcess(python.executable, [...python.prefix, '-I', '-c', code]);
    const status = JSON.parse(stdout.trim());
    status.source = python.source;
    status.sandbox = getSandboxStatus(loadSettings().dataEnvironment?.networkEnabled === true);
    status.ready = ['pandas', 'numpy', 'scipy', 'openpyxl', 'matplotlib'].every(name => status.packages[name]) && status.sandbox.available;
    if (!status.sandbox.available) status.error = status.sandbox.error;
    status.installCommand = `\"${status.python}\" -m pip install pandas numpy scipy openpyxl matplotlib dtaidistance`;
    if (python.source === 'bundled') status.installCommand = '';
    return status;
  } catch (error) {
    const external = loadSettings().dataEnvironment?.runtimeMode === 'external';
    return { ready: false, source: external ? 'external' : 'bundled', error: error.message, sandbox: getSandboxStatus(loadSettings().dataEnvironment?.networkEnabled === true), packages: {}, installCommand: external ? 'python -m pip install pandas numpy scipy openpyxl matplotlib dtaidistance' : '' };
  }
}

handleApp('draft-cancel', (_event, requestId) => {
  const controller = activeGenerationControllers.get(requestId);
  if (!controller) return { canceled: false };
  controller.abort();
  return { canceled: true };
});

// UC-SKILL-02 段落级应用 Skill：选中段落 → 润色/扩写/改实证风格，仅对该段重写。
handleApp('draft-apply-skill', async (_event, projectId, { draftId, selectedText, selectedHtml, operation }) => {
  const workspace = workspaceStore.loadWorkspace();
  const project = workspace.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const draft = project.drafts.find(item => item.id === draftId);
  if (!draft) throw new Error('当前草稿不存在或不属于该项目');
  const text = String(selectedText || '').trim();
  if (!text) throw new Error('未选中内容，请先在草稿里选中一段文字。');
  if (text.length > 20000 || String(selectedHtml || '').length > 30000) throw new Error('选区过大，请分段改写。');
  if (!['polish', 'expand', 'empirical', 'compress', 'translate', 'restructure'].includes(operation)) throw new Error('未知的局部操作。');
  const skillRuntime = new SkillRuntime(path.join(__dirname, '../assets/research-skills'));
  const modelLayer = await import('./pi/model-layer.mjs');
  const settings = loadSettings(), layer = modelLayer.createModelLayer(settings);
  layer.getApiKey = scenario => resolveAgentKey(workspaceStore, settings, scenario);
  return applyLocalEdit({ skillRuntime, requestModel: args => modelLayer.requestModel(layer, args), project, draft, selectedText: text, selectedHtml, operation, settings });
});

handleApp('api-test', async (_event, config, apiKey) => {
  const settings = loadSettings();
  const providerId = typeof config === 'string'
    ? (AI_PROVIDERS[config] ? config : settings.api.provider)
    : (AI_PROVIDERS[config?.provider] ? config.provider : settings.api.provider);
  const baseUrl = typeof config === 'object' && config ? config.baseUrl : null;
  const model = typeof config === 'object' && config ? config.model : null;
  if (providerId === 'custom') throw new Error('本期不提供自定义中转站接口。');
  const candidateUrl = normalizeBaseUrl(baseUrl || settings.api.baseUrl);
  const allowStoredKey = providerId === settings.api.provider && candidateUrl === normalizeBaseUrl(settings.api.baseUrl);
  const key = String(apiKey || (allowStoredKey ? workspaceStore.getApiKey('encrypted', providerId) : '') || '').trim();
  if (!key) throw new Error(`请先填写 ${getProvider(providerId).label} API Key。`);
  await providerRegistry.complete(providerId, key, [{ role: 'user', content: '只回复：连接成功' }], {
    temperature: 0,
    maxTokens: 8,
    signal: AbortSignal.timeout(20000),
    endpoint: resolveEndpoint(baseUrl, getProvider(providerId).endpoint),
    ...(model ? { model } : {}),
  });
  return { ok: true };
});

handleApp('data-environment-status', () => getDataEnvironmentStatus());
handleApp('clipboard-write', async (_event, payload) => {
  if (payload?.kind === 'image') {
    const match = String(payload.dataUrl || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
    if (!match || match[1].length > 16 * 1024 * 1024) throw new Error('图片内容无效或过大');
    const bytes = Buffer.from(match[1], 'base64');
    if (!bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) throw new Error('仅支持复制 PNG 图片');
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw new Error('图片内容无法解码');
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) })]);
    if (!(await clipboard.has('image/png'))) throw new Error('系统剪贴板未接受图片，请稍后重试');
    return { ok: true, format: 'png' };
  } else {
    const value = String(payload?.text || '');
    if (value.length > 2_000_000) throw new Error('复制内容过大');
    const html = typeof payload?.html === 'string' && payload.html.length <= 4_000_000 ? payload.html : '';
    await clipboard.write([new ClipboardItem(html ? { 'text/plain': value, 'text/html': html } : { 'text/plain': value })]);
    if (await clipboard.readText() !== value) throw new Error('系统剪贴板未接受复制内容，请稍后重试');
    if (html && !(await clipboard.has('text/html'))) return { ok: true, format: 'text' };
    return { ok: true, format: html ? 'html+text' : 'text' };
  }
});
handleApp('empirical-plan-document-update', (_event, projectId, conversationId, reference, patch) => require('./agent/plan-document').updatePlanDocument({ store: workspaceStore, projectId, conversationId, reference, patch, resolveAttachment: resolveConversationAttachment }));
handleApp('empirical-result-preview', (_event, projectId, conversationId, revision) => {
  const project = workspaceStore.loadWorkspace().projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const { resultVersion, chartBytes, dataBytes } = require('./empirical-artifacts');
  const plan = resultVersion(project, conversationId, revision);
  const rootPath = path.join(app.getPath('userData'), 'analysis-runs', projectId);
  const results = (plan.results || []).map(result => ({ ...result, preparedFiles: (result.dataFiles || []).map(file => {const bytes=dataBytes(file,rootPath,result.preparedData?.sha256);return {name:path.basename(file),text:bytes.toString('utf8'),preview:{name:path.basename(file),type:'spreadsheet',format:'.csv',dataBase64:bytes.toString('base64')}};}), charts: (result.files || []).map(file => {
    return { name: path.basename(file), dataUrl: `data:image/png;base64,${chartBytes(file, rootPath).toString('base64')}` };
  }) }));
  return { planId: plan.id, revision: plan.revision, steps: plan.steps, results };
});
handleApp('empirical-artifact-export', async (_event, projectId, conversationId, selection, reveal = false) => {
  const project = workspaceStore.loadWorkspace().projects.find(item => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const { resultVersion, artifactFile, artifactWordTable } = require('./empirical-artifacts');
  const plan = resultVersion(project, conversationId, selection?.revision);
  let file;
  if (selection?.kind === 'plan') {
    if (selection.planId !== plan.id || selection.revision !== plan.revision || typeof selection.text !== 'string' || selection.text.length > 100_000) throw new Error('方案文件版本无效');
    file = { data: Buffer.from(selection.text, 'utf8'), extension: 'md', name: `实证方案-第${plan.revision}版.md` };
  } else file = artifactFile(plan, selection, path.join(app.getPath('userData'), 'analysis-runs', projectId));
  if (selection?.kind === 'table') {
    const table = plan.results.find(item => item.stepId === selection.stepId)?.tables?.[selection.index];
    if (!table) throw new Error('该表格已不可用');
    file = await artifactWordTable(project, table, file.name);
  }
  const picked = await dialog.showSaveDialog(workspaceWindow || mainWindow, { title: '另存结果文件', defaultPath: file.name, filters: [{ name: file.extension.toUpperCase() + ' 文件', extensions: [file.extension] }] });
  if (picked.canceled || !picked.filePath) return { canceled: true };
  if (path.extname(picked.filePath).toLowerCase() !== '.' + file.extension) throw new Error('请保留结果文件的原始扩展名');
  fs.writeFileSync(picked.filePath, file.data);
  if (reveal) shell.showItemInFolder(picked.filePath);
  return { canceled: false, filePath: picked.filePath };
});
handleApp('ocr-status', () => workspaceStore.getOcrStatus());
handleApp('agent-quality-summary', (_event, projectId) => summarizeRuns(workspaceStore.listAgentRuns(projectId, 200)));
handleApp('agent-turn-trace', (_event, projectId, conversationId, runId) => require('./agent/turn-trace').readTurnTrace(workspaceStore, projectId, conversationId, runId));

function preparationFile(projectId, conversationId, id) {
  const project = workspaceStore.loadWorkspace().projects.find(item => item.id === projectId);
  const preparation = project?.dataPreparations?.[conversationId];
  if (!preparation || preparation.id !== id) throw new Error('该清洗文件不属于当前对话或已更新');
  const data = require('./empirical-artifacts').dataBytes(preparation.preparedData.path, path.join(app.getPath('userData'), 'analysis-runs', projectId), preparation.preparedData.sha256);
  return { data, name: '清洗后的分析数据.csv' };
}
handleApp('preparation-preview', (_event, projectId, conversationId, id) => { const file = preparationFile(projectId, conversationId, id); return { name: file.name, text: file.data.toString('utf8'),preview:{name:file.name,type:'spreadsheet',format:'.csv',dataBase64:file.data.toString('base64')} }; });
handleApp('preparation-export', async (_event, projectId, conversationId, id, reveal = false) => {
  const file = preparationFile(projectId, conversationId, id);
  const picked = await dialog.showSaveDialog(workspaceWindow || mainWindow, { title: '另存清洗副本', defaultPath: file.name, filters: [{ name: 'CSV 文件', extensions: ['csv'] }] });
  if (picked.canceled || !picked.filePath) return { canceled: true };
  if (path.extname(picked.filePath).toLowerCase() !== '.csv') throw new Error('请保留 CSV 扩展名');
  fs.writeFileSync(picked.filePath, file.data);
  if (reveal) shell.showItemInFolder(picked.filePath);
  return { canceled: false, filePath: picked.filePath };
});
handleApp('agent-interaction-respond', (event, payload) => {
  if (payload?.documentPatch) {
    const project = workspaceStore.loadWorkspace().projects.find(item => item.id === payload.projectId);
    if (!project) throw new Error('项目不存在');
    const dryStore = { loadWorkspace: () => ({ projects: [project] }), updateProject: () => {} };
    require('./agent/plan-document').updatePlanDocument({ store: dryStore, projectId: payload.projectId, conversationId: payload.conversationId, reference: payload.reference, patch: payload.documentPatch, resolveAttachment: resolveConversationAttachment });
  }
  return interactionBroker.respond(payload, event.sender.id);
});
handleApp('draft-generate', async (event, projectId, request) => {
  const controller = new AbortController();
  controller.projectId = projectId;
  activeGenerationControllers.set(request.requestId, controller);
  sendPetReaction('review', '主人，我正在检索文献并认真思考…');
  try {
    controller.completion = getAgentOrchestrator(event).run({ projectId, request, signal: controller.signal });
    return await controller.completion;
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

// UC-FLOW-01：从存档点恢复续写（挂起期间上传的新资料由 request.attachments 带入，会进入召回范围）
handleApp('draft-resume', async (event, projectId, runId, request) => {
  if (activeGenerationControllers.has(runId)) throw new Error('任务仍在运行，请先停止再恢复。');
  const controller = new AbortController();
  controller.projectId = projectId;
  activeGenerationControllers.set(request.requestId, controller);
  sendPetReaction('review', '主人，我从上次断点的进度接着写啦…');
  try {
    controller.completion = getAgentOrchestrator(event).resume({ projectId, runId, request, signal: controller.signal });
    return await controller.completion;
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

// 列出仍可恢复的挂起会话（供界面显示「已挂起」徽标与「恢复续写」按钮）
handleApp('agent-suspended-list', (_event, projectId) => (workspaceStore.listAgentRuns(projectId, 200) || [])
  .filter((run) => ['SUSPENDED', 'GENERATING', 'PLANNING'].includes(run.status) && run.checkpoint && !run.resumedByRunId && !activeGenerationControllers.has(run.id))
  .map((run) => ({
    id: run.id,
    task: run.checkpoint.task,
    completedIds: run.checkpoint.completedIds || [],
    savedAt: run.checkpoint.savedAt || null,
    conversationId: run.checkpoint.conversationId || null,
  })));

handleApp('thesis-export-assembled', async (_event, projectId) => {
  const state = workspaceStore.loadWorkspace();
  const project = state.projects.find((item) => item.id === projectId);
  if (!project) throw new Error('项目不存在');
  const draft = buildAssembledThesis(project);
  if(!draft.content.trim())throw new Error('尚无可组装的正文；请先完成正文并指定章节归属');
  const result = await dialog.showSaveDialog(workspaceWindow || mainWindow, {
    title: '导出组装论文 Word 文档',
    defaultPath: `${project.title.replace(/[\\/:*?"<>|]/g, '_')}-组装草稿.docx`,
    filters: [{ name: 'Word 文档', extensions: ['docx'] }],
  });
  if (result.canceled || !result.filePath) return { canceled: true };
  fs.writeFileSync(result.filePath, await buildAcademicDocx(project, draft));
  return { canceled: false, filePath: result.filePath, checks: draft.checks };
});

handleApp('draft-export-word', async (_event, projectId, draft, reveal = false) => {
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
  if (reveal === true) shell.showItemInFolder(result.filePath);
  return { canceled: false, filePath: result.filePath };
});

app.whenReady().then(() => {
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
