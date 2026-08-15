const STAGES = [0, 10000, 50000, 200000, 1000000];
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.pdf', '.txt', '.md', '.docx', '.csv', '.xlsx', '.png', '.jpg', '.jpeg', '.bib'];

function createThesisProfileFields() {
  const goal = document.getElementById('project-goal');
  if (!goal || document.getElementById('thesis-profile-fields')) return;
  const fields = document.createElement('fieldset');
  fields.id = 'thesis-profile-fields';
  fields.className = 'thesis-profile-fields';
  fields.innerHTML = `<legend>长论文档案（5 万字硕士论文必填）</legend>
    <label>目标总字数<input id="thesis-target-words" type="number" min="1000" step="1000" value="50000" /></label>
    <label>研究问题与对象边界<textarea id="thesis-question" placeholder="要解释什么问题；研究对象、时间/空间范围是什么"></textarea></label>
    <label>用户核心观点（每行一条）<textarea id="thesis-viewpoints" placeholder="例如：数字能力通过组织协同影响服务可及性"></textarea></label>
    <label>研究方法<textarea id="thesis-methodology" placeholder="例如：县域面板回归、深度访谈、比较案例研究、内容分析"></textarea></label>
    <label>数据/材料及可用范围<textarea id="thesis-materials" placeholder="数据文件、文献、访谈、案例或文本；说明年份、样本/个案、来源"></textarea></label>
    <label>希望检验或解释的效果<textarea id="thesis-analysis-goal" placeholder="例如：检验数字能力与服务可及性的关系及组织协同机制；不要预设显著性或结论"></textarea></label>
    <label>学校/学院模板、导师要求或目标期刊<textarea id="thesis-standard" placeholder="章节、格式、字数、引用或投稿要求"></textarea></label>`;
  goal.closest('label').insertAdjacentElement('afterend', fields);
}

createThesisProfileFields();

const ids = [
  'pet-mode-button', 'close-button', 'project-switcher', 'project-menu', 'project-list', 'sidebar-project-list',
  'sidebar-project', 'titlebar-project', 'chat-project-title', 'sidebar-count', 'pet-stage-label', 'sidebar-conversation-list', 'sidebar-new-chat-button', 'sidebar-workbench-button',
  'pet-name-label', 'pet-mini-avatar', 'account-name-label', 'account-card-name', 'account-menu-button', 'account-menu',
  'new-chat-button', 'assemble-thesis-button', 'open-library-button', 'project-edit-button', 'welcome-title', 'chat-empty', 'chat-scroll',
  'conversation', 'task-input', 'send-button', 'attach-button', 'conversation-file-list', 'library-add-button', 'library-filter',
  'library-summary', 'library-list', 'drop-zone', 'feedback', 'recent-file-list', 'settings-back-button',
  'rag-status-title', 'rag-status-detail', 'rag-rebuild-button',
  'settings-search', 'settings-form', 'settings-save-status', 'pet-manage-button', 'pet-page-back-button',
  'pet-form', 'pet-page-name', 'pet-page-stage', 'pet-page-heading', 'pet-large-preview', 'pet-preview-glyph', 'pet-choice-grid', 'pet-visible-enabled', 'pet-sound-enabled', 'pet-voice-enabled', 'pet-dnd-enabled', 'pet-save-status',
  'account-display-name', 'theme-select', 'accent-select', 'density-select', 'api-provider', 'api-key',
  'api-key-toggle', 'api-status', 'api-test-button', 'api-save-test-button', 'api-connection-badge',
  'api-provider-logo', 'api-provider-name', 'api-provider-description', 'api-key-label',
  'data-python-path', 'data-environment-badge', 'data-environment-detail', 'data-environment-command', 'data-environment-test-button',
  'default-language', 'default-citation', 'writing-style', 'pet-name-input', 'pet-select', 'growth-stage',
  'growth-percent', 'growth-bar', 'growth-next', 'project-dialog', 'project-form', 'project-dialog-title',
  'project-title', 'project-type', 'project-domains', 'project-language', 'project-citation', 'project-goal', 'project-delete-button',
  'thesis-profile-fields', 'thesis-target-words', 'thesis-question', 'thesis-viewpoints', 'thesis-methodology', 'thesis-materials', 'thesis-analysis-goal', 'thesis-standard',
  'reminder-dialog', 'confirm-dialog', 'confirm-title', 'confirm-message', 'toast',
];
const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));

let workspace = { activeProjectId: null, projects: [] };
let settings = null;
let apiStatus = null;
let ragStatus = null;
let editingProjectId = null;
let confirmResolver = null;
let streamingDraft = null;
let streamRenderFrame = null;
let conversationAttachments = [];

const PROVIDERS = {
  deepseek: { label: 'DeepSeek', logo: 'D', model: 'deepseek-chat' },
  openai: { label: 'OpenAI', logo: 'O', model: 'gpt-4.1-mini' },
  qwen: { label: '通义千问', logo: 'Q', model: 'qwen-plus' },
  zhipu: { label: '智谱 GLM', logo: 'G', model: 'glm-4-flash' },
  moonshot: { label: 'Moonshot / Kimi', logo: 'K', model: 'moonshot-v1-8k' },
  openrouter: { label: 'OpenRouter', logo: 'R', model: 'openai/gpt-4.1-mini' },
};

const PETS = {
  'ember-pup': { label: 'Ember Pup', defaultName: '小焰' },
  'shadow-kit': { label: 'Shadow Kit', defaultName: '小影' },
  nori: { label: 'Nori', defaultName: '糯梨' },
};

const activeProject = () => workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null;
const activeConversation = () => {
  const project = activeProject();
  return project?.conversations?.find((conversation) => conversation.id === project.activeConversationId) ?? null;
};

function node(tag, className) {
  const item = document.createElement(tag);
  item.className = className;
  return item;
}

function escapeHtml(value) {
  const item = document.createElement('span');
  item.textContent = String(value ?? '');
  return item.innerHTML;
}

function renderPaperHtml(value) {
  const template = document.createElement('template');
  template.innerHTML = String(value || '');
  const allowed = new Set(['H1', 'H2', 'H3', 'P', 'STRONG', 'EM', 'SUP', 'SECTION', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FIGURE', 'IMG', 'FIGCAPTION', 'BR']);
  for (const element of [...template.content.querySelectorAll('*')]) {
    if (!allowed.has(element.tagName)) {
      element.replaceWith(document.createTextNode(element.textContent || ''));
      continue;
    }
    for (const attribute of [...element.attributes]) {
      const permitted = (element.tagName === 'IMG' && ['src', 'alt'].includes(attribute.name))
        || (['P', 'TABLE', 'SECTION', 'SUP'].includes(element.tagName) && ['class', 'data-footnote'].includes(attribute.name));
      if (!permitted) element.removeAttribute(attribute.name);
    }
    if (element.tagName === 'IMG' && !String(element.getAttribute('src') || '').startsWith('data:image/')) {
      element.replaceWith(document.createTextNode(''));
    }
  }
  return template.innerHTML;
}

function formatSize(bytes) {
  const mb = bytes / 1000000;
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1000))} KB`;
  if (mb < 1000) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1000).toFixed(2)} GB`;
}

function showToast(message, isError = false) {
  el.toast.textContent = message;
  el.toast.classList.toggle('is-error', isError);
  el.toast.classList.add('is-visible');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.toast.classList.remove('is-visible'), 2600);
}

function setFeedback(message, isError = false) {
  el.feedback.textContent = message;
  el.feedback.classList.toggle('is-error', isError);
}

function getGrowth() {
  const unique = new Map();
  for (const project of workspace.projects) {
    for (const document of project.documents) {
      if (document.status === 'parsed') unique.set(document.fingerprint, document);
    }
  }
  const totalMb = [...unique.values()].reduce((sum, document) => sum + document.size, 0) / 1000000;
  let stageIndex = STAGES.findLastIndex((threshold) => totalMb >= threshold);
  if (stageIndex < 0) stageIndex = 0;
  const current = STAGES[stageIndex];
  const next = STAGES[stageIndex + 1] ?? current;
  const percent = stageIndex === STAGES.length - 1 ? 100 : Math.min(100, ((totalMb - current) / (next - current)) * 100);
  return { totalMb, stage: stageIndex + 1, next, percent };
}

function switchView(viewName) {
  hideApiKey();
  document.querySelectorAll('[data-view-panel]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.viewPanel === viewName));
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === viewName));
  el['account-menu'].hidden = true;
  if (viewName === 'library') { renderLibrary(); renderRagStatus(); }
  if (viewName === 'workbench') requestAnimationFrame(scrollConversation);
}

function switchSettingsPanel(panelName) {
  if (panelName !== 'api') hideApiKey();
  document.querySelectorAll('[data-settings-panel]').forEach((button) => button.classList.toggle('is-active', button.dataset.settingsPanel === panelName));
  document.querySelectorAll('[data-settings-content]').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.settingsContent === panelName));
}

async function renderDataEnvironmentStatus() {
  const status = await window.petAPI.getDataEnvironmentStatus();
  const packages = Object.entries(status.packages || {}).map(([name, available]) => `${name} ${available ? '✓' : '×'}`).join(' · ');
  el['data-environment-badge'].textContent = status.ready ? '数据绘图可用' : '环境未就绪';
  el['data-environment-badge'].classList.toggle('is-connected', Boolean(status.ready));
  el['data-environment-detail'].textContent = status.error || (status.ready
    ? `Python ${status.version}：${status.python}；${packages}`
    : `Python ${status.version || '未知'}：${status.python || '未找到'}；${packages || '未检测到依赖'}`);
  el['data-environment-command'].textContent = status.installCommand || 'python -m pip install pandas openpyxl matplotlib';
}

function hideApiKey() {
  if (!el['api-key']) return;
  el['api-key'].type = 'password';
  el['api-key'].value = '';
  el['api-key-toggle']?.classList.remove('is-visible');
  el['api-key-toggle']?.setAttribute('aria-label', '显示 API 密钥');
}

function renderProjectLists() {
  el['project-list'].replaceChildren();
  el['sidebar-project-list'].replaceChildren();
  for (const project of workspace.projects) {
    const menuButton = node('button', project.id === workspace.activeProjectId ? 'is-active' : '');
    menuButton.type = 'button';
    menuButton.innerHTML = `<span>${escapeHtml(project.title)}</span><small>${project.documents.length} 份资料</small>`;
    menuButton.addEventListener('click', () => selectProject(project.id));
    el['project-list'].append(menuButton);

    const projectButton = node('button', `sidebar-project-item${project.id === workspace.activeProjectId ? ' is-active' : ''}`);
    projectButton.type = 'button';
    projectButton.innerHTML = `<span>▱</span><strong>${escapeHtml(project.title)}</strong><small>${project.drafts.length}</small>`;
    projectButton.addEventListener('click', () => selectProject(project.id));
    el['sidebar-project-list'].append(projectButton);
  }
  if (!workspace.projects.length) el['sidebar-project-list'].innerHTML = '<p class="sidebar-empty">创建第一个论文项目</p>';
}

function renderConversationList() {
  const project = activeProject();
  el['sidebar-conversation-list'].replaceChildren();
  if (!project) {
    el['sidebar-conversation-list'].innerHTML = '<p class="sidebar-conversation-empty">发送第一条指令后自动创建项目</p>';
    return;
  }
  for (const conversation of project.conversations || []) {
    const button = node('button', `sidebar-conversation-item${conversation.id === project.activeConversationId ? ' is-active' : ''}`);
    button.type = 'button';
    button.innerHTML = `<span>□</span><strong>${escapeHtml(conversation.title)}</strong>`;
    button.addEventListener('click', () => selectConversation(conversation.id));
    el['sidebar-conversation-list'].append(button);
  }
}

async function selectProject(projectId) {
  workspace = await window.petAPI.setActiveProject(projectId);
  ragStatus = null;
  el['project-menu'].hidden = true;
  renderAll();
  switchView('workbench');
}

async function selectConversation(conversationId) {
  const project = activeProject();
  if (!project || streamingDraft) return;
  workspace = await window.petAPI.setActiveConversation(project.id, conversationId);
  renderAll();
  switchView('workbench');
}

async function createNewConversation() {
  const project = activeProject();
  if (streamingDraft) return;
  if (project) workspace = await window.petAPI.createConversation(project.id, { title: '新对话' });
  el['task-input'].value = '';
  conversationAttachments = [];
  renderConversationAttachments();
  renderAll();
  el['task-input'].focus();
}

function renderConversation() {
  const project = activeProject();
  el['assemble-thesis-button'].hidden = !(project?.type === '硕士学位论文' && Number(project?.thesisProfile?.targetWords || 0) >= 40000);
  const conversationId = project?.activeConversationId;
  const drafts = project?.drafts.filter((draft) => draft.conversationId === conversationId).slice().reverse() ?? [];
  el.conversation.replaceChildren();
  el['chat-empty'].hidden = drafts.length > 0;
  if (!drafts.length) return;

  for (const draft of drafts) {
    const exchange = node('article', 'chat-exchange');
    const userMessage = node('div', 'message user-message');
    const attachmentMarkup = (draft.attachments || []).length
      ? `<div class="message-attachments"><span>本轮工作文件：</span>${draft.attachments.map((file) => `${file.previewDataUrl ? `<img class="conversation-image-preview" src="${file.previewDataUrl}" alt="${escapeHtml(file.name)}" />` : ''}<b>${escapeHtml(file.name)}</b>`).join('')}</div>`
      : '';
    userMessage.innerHTML = `<div class="message-label">你</div><div class="message-bubble">${escapeHtml(draft.task || '继续论文写作')}</div>${attachmentMarkup}`;

    const assistantMessage = node('div', 'message assistant-message');
    const modeLabel = draft.mode === 'api' ? 'AI 生成' : '本地任务草稿';
    assistantMessage.innerHTML = `<div class="assistant-avatar">柴</div><div class="assistant-body"><div class="assistant-meta"><strong>${escapeHtml(settings?.petName || '小柴')}</strong><span>${modeLabel} · ${new Date(draft.updatedAt).toLocaleString('zh-CN')}</span></div><div class="assistant-content"></div><div class="message-actions"><button data-action="copy" type="button">复制</button><button data-action="word" type="button">导出 Word</button><button data-action="details" type="button">查看引用与核验</button></div><div class="evidence-drawer" hidden></div><p class="ai-warning">内容由AI生成，请仔细甄别。</p></div>`;
    const content = assistantMessage.querySelector('.assistant-content');
    const prose = node('div', 'assistant-prose');
    prose.setAttribute('aria-label', '论文草稿内容');
    prose.innerHTML = renderPaperHtml(draft.content || '');
    content.append(prose);

    const drawer = assistantMessage.querySelector('.evidence-drawer');
    const workflowItems = draft.workflow ? [
      `章节路由：${draft.workflow.section}`,
      `写作模式：${draft.workflow.writingMode || draft.workflow.writingModeLabel || draft.workflow.paradigmLabel || draft.workflow.paradigm || '通用学位论文模式'}`,
      `论证结构：${draft.workflow.architecture}`,
      ...(draft.workflow.steps || []),
    ] : [];
    drawer.innerHTML = `<div><strong>科研工作流</strong>${listMarkup(workflowItems)}</div><div><strong>引用清单</strong>${listMarkup(draft.citations)}</div><div><strong>来源映射</strong>${listMarkup(draft.mappings)}</div><div><strong>待核验</strong>${listMarkup(draft.checks)}</div>`;
    assistantMessage.querySelector('[data-action="copy"]').addEventListener('click', async () => { await navigator.clipboard.writeText(draft.content || ''); showToast('正文已复制'); });
    assistantMessage.querySelector('[data-action="word"]').addEventListener('click', () => exportDraft(project.id, draft, 'word'));
    assistantMessage.querySelector('[data-action="details"]').addEventListener('click', () => { drawer.hidden = !drawer.hidden; });

    exchange.append(userMessage, assistantMessage);
    el.conversation.append(exchange);
  }
}

function appendStreamingExchange(task, attachments = []) {
  el['chat-empty'].hidden = true;
  const exchange = node('article', 'chat-exchange');
  const userMessage = node('div', 'message user-message');
  const attachmentMarkup = attachments.length ? `<div class="message-attachments"><span>本轮工作文件：</span>${attachments.map((file) => `${file.previewDataUrl ? `<img class="conversation-image-preview" src="${file.previewDataUrl}" alt="${escapeHtml(file.name)}" />` : ''}<b>${escapeHtml(file.name)}</b>`).join('')}</div>` : '';
  userMessage.innerHTML = `<div class="message-label">你</div><div class="message-bubble">${escapeHtml(task)}</div>${attachmentMarkup}`;
  const assistantMessage = node('div', 'message assistant-message is-streaming');
  assistantMessage.innerHTML = `<div class="assistant-avatar">柴</div><div class="assistant-body"><div class="assistant-meta"><strong>${escapeHtml(settings?.petName || '小柴')}</strong><span>AI 正在生成</span></div><div class="assistant-content"><div class="assistant-prose is-streaming" aria-label="正在生成论文内容"></div></div><div class="message-actions"></div><p class="ai-warning">内容由AI生成，请仔细甄别。</p></div>`;
  exchange.append(userMessage, assistantMessage);
  el.conversation.append(exchange);
  scrollConversation();
  return { exchange, assistantMessage, prose: assistantMessage.querySelector('.assistant-prose'), meta: assistantMessage.querySelector('.assistant-meta span') };
}

function handleDraftStream(payload) {
  if (!streamingDraft || payload?.requestId !== streamingDraft.requestId || typeof payload.delta !== 'string') return;
  const shouldFollow = el['chat-scroll'].scrollHeight - el['chat-scroll'].scrollTop - el['chat-scroll'].clientHeight < 120;
  streamingDraft.content += payload.delta;
  if (!streamRenderFrame) {
    streamRenderFrame = requestAnimationFrame(() => {
      streamRenderFrame = null;
      if (!streamingDraft) return;
      streamingDraft.prose.innerHTML = renderPaperHtml(streamingDraft.content);
      if (shouldFollow) scrollConversation();
    });
  }
}

function listMarkup(values = []) {
  return values.length ? `<ul>${values.map((value) => `<li>${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value))}</li>`).join('')}</ul>` : '<p>本次没有相关条目</p>';
}

function scrollConversation() {
  el['chat-scroll'].scrollTop = el['chat-scroll'].scrollHeight;
}

function updateComposerAction() {
  const hasTask = Boolean(el['task-input'].value.trim());
  if (streamingDraft) {
    el['send-button'].disabled = false;
    el['send-button'].textContent = hasTask ? '↑' : '■';
    el['send-button'].setAttribute('aria-label', hasTask ? '停止当前回复并发送新引导' : '停止生成');
    return;
  }
  el['send-button'].disabled = !hasTask;
  el['send-button'].textContent = '↑';
  el['send-button'].setAttribute('aria-label', '发送任务');
}

async function exportDraft(projectId, draft) {
  const result = await window.petAPI.exportWord(projectId, draft);
  if (!result.canceled) showToast('Word 文档已导出');
}

async function exportAssembledThesis() {
  const project = activeProject();
  if (!project) return;
  const result = await window.petAPI.exportAssembledThesis(project.id);
  if (!result.canceled) showToast(result.checks?.length ? '组装稿已导出，请查看待核验项' : '组装全文已导出');
}

function createLibraryRow(document) {
  const row = node('div', 'library-item');
  const type = document.extension.replace('.', '').toUpperCase() || 'FILE';
  const chunkCount = ragStatus?.documents?.[document.id]?.chunks;
  const statusLabels = {
    parsed: chunkCount == null ? '正文已解析 · 正在同步索引' : `已进入知识库 · ${chunkCount} 个知识块`,
    'ocr-needed': '尚未进入知识库 · 需要 OCR',
    'parse-failed': '尚未进入知识库 · 解析失败',
    saved: '尚未进入知识库 · 待解析',
  };
  const detail = document.parseError && document.status !== 'parsed'
    ? `<em title="${escapeHtml(document.parseError)}">${escapeHtml(document.parseError)}</em>`
    : '';
  row.dataset.status = document.status;
  row.innerHTML = `<span class="file-type">${escapeHtml(type.slice(0, 4))}</span><div><strong>${escapeHtml(document.name)}</strong><small>${formatSize(document.size)} · ${statusLabels[document.status] ?? statusLabels.saved}</small>${detail}</div><button type="button" aria-label="删除资料">×</button>`;
  row.querySelector('button').addEventListener('click', async () => {
    if (!await confirmAction('删除资料', `删除“${document.name}”后，它将不能作为引用来源。`)) return;
    workspace = await window.petAPI.removeDocument(activeProject().id, document.id);
    renderAll();
    showToast('资料已删除');
  });
  return row;
}

function renderLibrary() {
  const query = el['library-filter'].value.trim().toLowerCase();
  const documents = (activeProject()?.documents ?? []).filter((document) => `${document.name} ${document.note || ''}`.toLowerCase().includes(query));
  el['library-summary'].textContent = `${documents.length} 份资料`;
  el['library-list'].replaceChildren();
  if (!documents.length) {
    el['library-list'].innerHTML = '<div class="empty-page"><strong>还没有项目资料</strong><p>拖入文件或点击“添加资料”开始投喂。</p></div>';
    return;
  }
  for (const document of documents) el['library-list'].append(createLibraryRow(document));
}

async function renderRagStatus() {
  const project = activeProject();
  if (!project) {
    ragStatus = null;
    el['rag-status-title'].textContent = '请先创建论文项目';
    el['rag-status-detail'].textContent = '每个论文项目拥有独立的本地 RAG 知识库。';
    el['rag-rebuild-button'].disabled = true;
    return;
  }
  el['rag-rebuild-button'].disabled = false;
  try {
    const status = await window.petAPI.getRagStatus(project.id);
    ragStatus = status;
    const modeLabels = {
      'local-hybrid': '本地神经向量 + 关键词混合检索',
      'local-hybrid-hash': '本地哈希向量 + 关键词混合检索',
      'keyword-fallback': '本地关键词降级检索',
    };
    const mode = modeLabels[status.mode] || '本地混合检索';
    el['rag-status-title'].textContent = `${status.documentCount} 篇文献 · ${status.chunkCount} 个知识块`;
    el['rag-status-detail'].textContent = `${mode}${status.updatedAt ? ` · 更新于 ${new Date(status.updatedAt).toLocaleString('zh-CN')}` : ''}${status.error ? ` · ${status.error}` : ''}`;
    renderLibrary();
  } catch (error) {
    ragStatus = null;
    el['rag-status-title'].textContent = '知识库状态读取失败';
    el['rag-status-detail'].textContent = error.message;
  }
}

function renderAll() {
  const project = activeProject();
  const growth = getGrowth();
  const name = project?.title ?? '尚未创建项目';
  el['sidebar-project'].textContent = name;
  el['titlebar-project'].textContent = name;
  el['chat-project-title'].textContent = name;
  el['welcome-title'].textContent = project ? `继续推进“${project.title}”` : '和小柴一起开始论文写作';
  el['sidebar-count'].textContent = project?.documents.length ?? 0;
  el['pet-stage-label'].textContent = `阶段 ${growth.stage} · ${growth.totalMb.toFixed(1)} MB`;
  const petName = settings?.petName || '小柴';
  const petInfo = PETS[settings?.pet] ?? PETS['ember-pup'];
  el['pet-name-label'].textContent = petName;
  el['pet-page-name'].textContent = petName;
  el['pet-page-heading'].textContent = `陪${petName}一起成长`;
  el['pet-mini-avatar'].textContent = petInfo.label.slice(0, 1);
  el['pet-mini-avatar'].dataset.petPreview = settings?.pet || 'ember-pup';
  renderPetPreview(settings?.pet || 'ember-pup');
  el['pet-page-stage'].textContent = `成长阶段 ${growth.stage} · ${growth.totalMb.toFixed(1)} MB`;
  el['account-name-label'].textContent = settings?.displayName || '本地用户';
  el['account-card-name'].textContent = settings?.displayName || '本地用户';
  el['growth-stage'].textContent = `成长阶段 ${growth.stage}`;
  el['growth-percent'].textContent = `${Math.round(growth.percent)}%`;
  el['growth-bar'].style.width = `${Math.max(1, growth.percent)}%`;
  el['growth-next'].textContent = growth.stage === STAGES.length ? '已经达到最高成长阶段' : `再投喂 ${Math.max(0, growth.next - growth.totalMb).toFixed(1)} MB 进入下一阶段`;
  document.querySelectorAll('.stage-track span').forEach((stage, index) => stage.classList.toggle('is-active', index + 1 <= growth.stage));
  updateComposerAction();
  renderProjectLists();
  renderConversationList();
  renderConversation();
  renderLibrary();
  requestAnimationFrame(scrollConversation);
}

function renderPetPreview(petId) {
  const selected = PETS[petId] ? petId : 'ember-pup';
  el['pet-large-preview'].dataset.petPreview = selected;
  el['pet-preview-glyph'].dataset.petPreview = selected;
  document.querySelectorAll('[data-pet-choice]').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.petChoice === selected);
  });
}

function openProjectDialog(project = null) {
  editingProjectId = project?.id ?? null;
  el['project-dialog-title'].textContent = project ? '编辑项目' : '新建项目';
  el['project-title'].value = project?.title ?? '';
  el['project-type'].value = project?.type ?? '硕士学位论文';
  const domains = Array.isArray(project?.domains)
    ? project.domains
    : (project?.domain && project.domain !== '未分类' ? project.domain.split(/[、,，]/).map((item) => item.trim()) : []);
  el['project-domains'].querySelectorAll('input[name="project-domain"]').forEach((input) => { input.checked = domains.includes(input.value); });
  el['project-language'].value = project?.language ?? settings?.defaultLanguage ?? '中文';
  el['project-citation'].value = project?.citationStyle ?? settings?.defaultCitation ?? 'GB/T 7714';
  el['project-goal'].value = project?.goal ?? '';
  const profile = project?.thesisProfile ?? {};
  el['thesis-target-words'].value = profile.targetWords ?? 50000;
  el['thesis-question'].value = profile.researchQuestion ?? '';
  el['thesis-viewpoints'].value = (profile.viewpoints ?? []).map((item) => typeof item === 'string' ? item : item.statement).join('\n');
  el['thesis-methodology'].value = profile.methodology ?? '';
  el['thesis-materials'].value = profile.dataMaterials ?? '';
  el['thesis-analysis-goal'].value = profile.analysisGoal ?? '';
  el['thesis-standard'].value = profile.schoolOrJournal ?? '';
  el['thesis-profile-fields'].hidden = el['project-type'].value !== '硕士学位论文';
  el['project-delete-button'].hidden = !project;
  el['project-dialog'].showModal();
}

async function saveProject(event) {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  const domains = [...el['project-domains'].querySelectorAll('input[name="project-domain"]:checked')].map((input) => input.value);
  const input = {
    title: el['project-title'].value.trim(), type: el['project-type'].value, domains, language: el['project-language'].value, citationStyle: el['project-citation'].value, goal: el['project-goal'].value.trim(),
    thesisProfile: {
      targetWords: Number(el['thesis-target-words'].value) || 50000,
      researchQuestion: el['thesis-question'].value.trim(),
      viewpoints: el['thesis-viewpoints'].value.trim(),
      methodology: el['thesis-methodology'].value.trim(),
      dataMaterials: el['thesis-materials'].value.trim(),
      analysisGoal: el['thesis-analysis-goal'].value.trim(),
      schoolOrJournal: el['thesis-standard'].value.trim(),
    },
  };
  if (!input.title || !input.domains.length) {
    showToast('请至少选择一个学科领域', true);
    return;
  }
  if (editingProjectId) await window.petAPI.updateProject(editingProjectId, input);
  else await window.petAPI.createProject(input);
  workspace = await window.petAPI.loadWorkspace();
  el['project-dialog'].close();
  renderAll();
  showToast(editingProjectId ? '项目已更新' : '项目已创建');
}

async function importPaths(paths) {
  if (!activeProject()) {
    openProjectDialog();
    return setFeedback('请先创建论文项目。', true);
  }
  if (!paths.length) return;
  setFeedback('正在安全保存并解析资料…');
  window.petAPI.setPetReaction({ state: 'review', message: '我在阅读并建立资料索引…' });
  try {
    const result = await window.petAPI.importDocuments(activeProject().id, paths);
    workspace = result.state;
    renderAll();
    await renderRagStatus();
    const parsedCount = result.imported.filter((document) => document.status === 'parsed').length;
    const pendingCount = result.imported.length - parsedCount;
    const summary = [`${parsedCount} 份已进入知识库`];
    if (pendingCount) summary.push(`${pendingCount} 份需要处理`);
    if (result.rejected.length) summary.push(`${result.rejected.length} 份未加入`);
    setFeedback(summary.join('，') + '。', parsedCount === 0 && result.imported.length > 0);
    window.petAPI.setPetReaction({ state: parsedCount ? 'jumping' : 'failed', message: parsedCount ? `成功消化 ${parsedCount} 份资料！` : '资料已保存，但还不能用于写作。', growthStage: getGrowth().stage });
  } catch (error) {
    window.petAPI.setPetReaction({ state: 'failed', message: `资料处理失败：${error.message}` });
    throw error;
  }
}

async function chooseConversationFiles() {
  try {
    const attachments = await window.petAPI.chooseConversationFiles();
    if (!attachments?.length) return;
    conversationAttachments = [...conversationAttachments, ...attachments];
    renderConversationAttachments();
    showToast('已添加本轮工作文件；它们不会进入项目资料库或参考文献');
  } catch (error) {
    showToast(error.message, true);
  }
}

async function chooseLibraryDocuments() {
  try {
    const filePaths = await window.petAPI.chooseDocumentFiles();
    if (!filePaths?.length) return;
    await importPaths(filePaths);
  } catch (error) {
    showToast(error.message, true);
  }
}

function renderConversationAttachments() {
  const container = el['conversation-file-list'];
  container.hidden = !conversationAttachments.length;
  container.replaceChildren();
  for (const attachment of conversationAttachments) {
    const chip = node('span', 'conversation-file-chip');
    chip.append(document.createTextNode(attachment.name));
    const remove = node('button');
    remove.type = 'button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `移除 ${attachment.name}`);
    remove.addEventListener('click', () => {
      conversationAttachments = conversationAttachments.filter((item) => item.id !== attachment.id);
      renderConversationAttachments();
    });
    chip.append(remove);
    container.append(chip);
  }
}

function validateDroppedFiles(files) {
  return files.flatMap((file) => {
    const extension = file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '';
    if (!ALLOWED_EXTENSIONS.includes(extension) || file.size > MAX_FILE_SIZE) return [];
    const filePath = window.petAPI.getPathForFile(file);
    return filePath ? [filePath] : [];
  });
}

function confirmAction(title, message) {
  el['confirm-title'].textContent = title;
  el['confirm-message'].textContent = message;
  el['confirm-dialog'].showModal();
  return new Promise((resolve) => { confirmResolver = resolve; });
}

async function runGeneration() {
  const task = el['task-input'].value.trim();
  if (!task || streamingDraft) return;
  let project;
  let conversation;
  try {
    project = activeProject();
    if (!project) {
      setFeedback('正在根据首条指令创建论文项目…');
      const created = await window.petAPI.createProjectFromTask(task);
      workspace = created.workspace;
      project = activeProject();
      renderAll();
      showToast(`已自动创建项目：${project.title}`);
    }
    conversation = activeConversation();
    if (!conversation) throw new Error('当前项目没有可用对话');
  } catch (error) {
    el['task-input'].value = task;
    resizeComposer();
    updateComposerAction();
    setFeedback(`项目创建失败：${error.message}`, true);
    showToast(error.message, true);
    return;
  }
  const requestId = crypto.randomUUID();
  const streamView = appendStreamingExchange(task, conversationAttachments);
  const currentStream = { requestId, content: '', ...streamView };
  streamingDraft = currentStream;
  el['task-input'].value = '';
  resizeComposer();
  updateComposerAction();
  try {
    await window.petAPI.generateDraft(project.id, { task, requestId, conversationId: conversation.id, attachments: conversationAttachments });
    if (streamingDraft !== currentStream) return;
    workspace = await window.petAPI.loadWorkspace();
    currentStream.prose.classList.remove('is-streaming');
    currentStream.prose.innerHTML = renderPaperHtml(currentStream.content);
    currentStream.assistantMessage.classList.remove('is-streaming');
    currentStream.meta.textContent = 'AI 生成完成';
    streamingDraft = null;
    conversationAttachments = [];
    renderConversationAttachments();
    renderAll();
    showToast(apiStatus?.hasKey ? '生成完成，请核验内容' : '任务草稿已保存；配置 API 后可生成正文');
  } catch (error) {
    if (streamingDraft !== currentStream) return;
    currentStream.prose.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.add('is-error');
    currentStream.prose.textContent = currentStream.content ? `${currentStream.content}\n\n生成中断：${error.message}` : `生成失败：${error.message}`;
    currentStream.meta.textContent = '生成失败';
    streamingDraft = null;
    showToast(error.message, true);
  } finally {
    updateComposerAction();
  }
}

async function stopCurrentGeneration() {
  const currentStream = streamingDraft;
  if (!currentStream) return;
  streamingDraft = null;
  currentStream.prose.classList.remove('is-streaming');
  currentStream.assistantMessage.classList.remove('is-streaming');
  currentStream.assistantMessage.classList.add('is-interrupted');
  currentStream.prose.innerHTML = renderPaperHtml(currentStream.content || '<p>已停止当前回复。</p>');
  currentStream.meta.textContent = '已停止，等待新引导';
  await window.petAPI.cancelDraft(currentStream.requestId);
  updateComposerAction();
}

async function handleGenerationAction() {
  if (streamingDraft) {
    const hasNewGuide = Boolean(el['task-input'].value.trim());
    await stopCurrentGeneration();
    if (!hasNewGuide) return;
  }
  await runGeneration();
}

function applyTheme() {
  document.documentElement.dataset.theme = settings?.theme || 'dark';
  document.documentElement.dataset.accent = settings?.accent || 'orange';
  document.documentElement.dataset.density = settings?.density || 'comfortable';
}

async function loadSettingsForm() {
  settings = await window.petAPI.getSettings();
  apiStatus = await window.petAPI.getApiStatus(settings.api.provider);
  el['account-display-name'].value = settings.displayName || '本地用户';
  el['theme-select'].value = settings.theme || 'dark';
  el['accent-select'].value = settings.accent || 'orange';
  el['density-select'].value = settings.density || 'comfortable';
  el['api-provider'].value = settings.api.provider;
  el['data-python-path'].value = settings.dataEnvironment?.pythonPath || '';
  renderApiProvider();
  el['default-language'].value = settings.defaultLanguage || '中文';
  el['default-citation'].value = settings.defaultCitation || 'GB/T 7714';
  el['writing-style'].value = settings.writingStyle || 'rigorous';
  el['pet-name-input'].value = settings.petName || '小焰';
  el['pet-select'].value = settings.pet || 'ember-pup';
  renderPetPreview(settings.pet || 'ember-pup');
  el['pet-sound-enabled'].checked = settings.soundEnabled;
  el['pet-visible-enabled'].checked = settings.petVisible !== false;
  el['pet-voice-enabled'].checked = settings.voiceEnabled;
  el['pet-dnd-enabled'].checked = settings.doNotDisturb;
  await renderDataEnvironmentStatus();
  applyTheme();
}

async function saveSettings(event) {
  event.preventDefault();
  const partial = {
    displayName: el['account-display-name'].value.trim() || '本地用户',
    theme: el['theme-select'].value,
    accent: el['accent-select'].value,
    density: el['density-select'].value,
    defaultLanguage: el['default-language'].value,
    defaultCitation: el['default-citation'].value,
    writingStyle: el['writing-style'].value,
    dataEnvironment: { pythonPath: el['data-python-path'].value.trim() },
  };
  await window.petAPI.saveSettings(partial);
  await loadSettingsForm();
  renderAll();
  el['settings-save-status'].textContent = '已保存';
  showToast('设置已保存');
}

function renderApiProvider() {
  const providerId = el['api-provider'].value;
  const provider = PROVIDERS[providerId] ?? PROVIDERS.deepseek;
  el['api-provider-logo'].textContent = provider.logo;
  el['api-provider-name'].textContent = provider.label;
  el['api-provider-description'].textContent = `官方接口 · 默认模型 ${provider.model}`;
  el['api-key-label'].textContent = `${provider.label} API Key`;
  el['api-connection-badge'].textContent = apiStatus?.hasKey ? '已保存' : '未连接';
  el['api-connection-badge'].classList.toggle('is-connected', Boolean(apiStatus?.hasKey));
  el['api-status'].textContent = apiStatus?.hasKey ? `${provider.label} 密钥已安全保存。` : `尚未保存 ${provider.label} 密钥。`;
}

async function refreshProviderStatus() {
  hideApiKey();
  apiStatus = await window.petAPI.getApiStatus(el['api-provider'].value);
  renderApiProvider();
}

async function testCurrentApi() {
  const providerId = el['api-provider'].value;
  const key = el['api-key'].value.trim();
  el['api-test-button'].disabled = true;
  el['api-status'].textContent = '正在测试连接…';
  try {
    await window.petAPI.testApi(providerId, key);
    el['api-status'].textContent = '连接成功。';
    el['api-connection-badge'].textContent = '连接成功';
    el['api-connection-badge'].classList.add('is-connected');
  } catch (error) {
    el['api-status'].textContent = error.message;
    el['api-connection-badge'].textContent = '连接失败';
    el['api-connection-badge'].classList.remove('is-connected');
  } finally {
    el['api-test-button'].disabled = false;
  }
}

async function saveAndTestApi() {
  const providerId = el['api-provider'].value;
  const key = el['api-key'].value.trim();
  if (!key) {
    el['api-status'].textContent = '请填写 API Key 后再保存。';
    return;
  }
  el['api-save-test-button'].disabled = true;
  el['api-status'].textContent = '正在测试密钥…';
  try {
    await window.petAPI.testApi(providerId, key);
    el['api-status'].textContent = '连接成功，正在安全保存…';
    await window.petAPI.saveApi({ provider: providerId }, key);
    settings = await window.petAPI.getSettings();
    apiStatus = await window.petAPI.getApiStatus(providerId);
    hideApiKey();
    renderApiProvider();
    el['api-status'].textContent = '密钥已保存，连接成功。';
    showToast('API 已保存并连接成功');
  } catch (error) {
    el['api-status'].textContent = error.message;
    el['api-connection-badge'].textContent = '连接失败';
    el['api-connection-badge'].classList.remove('is-connected');
  } finally {
    el['api-save-test-button'].disabled = false;
  }
}

function resizeComposer() {
  el['task-input'].style.height = 'auto';
  el['task-input'].style.height = `${Math.min(180, Math.max(28, el['task-input'].scrollHeight))}px`;
}

function bindEvents() {
  window.petAPI.onDraftStream(handleDraftStream);
  el['pet-mode-button'].addEventListener('click', () => window.petAPI.showPetMode());
  el['close-button'].addEventListener('click', () => window.petAPI.showPetMode());
  el['project-switcher'].addEventListener('click', () => { el['project-menu'].hidden = !el['project-menu'].hidden; });
  el['account-menu-button'].addEventListener('click', () => { el['account-menu'].hidden = !el['account-menu'].hidden; });
  document.querySelectorAll('[data-view]').forEach((button) => button.addEventListener('click', () => switchView(button.dataset.view)));
  document.querySelectorAll('[data-action="new-project"]').forEach((button) => button.addEventListener('click', () => openProjectDialog()));
  document.querySelectorAll('[data-settings-panel]').forEach((button) => button.addEventListener('click', () => switchSettingsPanel(button.dataset.settingsPanel)));
  document.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => { el['task-input'].value = button.dataset.prompt; resizeComposer(); updateComposerAction(); el['task-input'].focus(); }));
  el['settings-back-button'].addEventListener('click', () => switchView('workbench'));
  el['project-edit-button'].addEventListener('click', () => activeProject() && openProjectDialog(activeProject()));
  el['project-form'].addEventListener('submit', saveProject);
  el['project-type'].addEventListener('change', () => { el['thesis-profile-fields'].hidden = el['project-type'].value !== '硕士学位论文'; });
  el['project-delete-button'].addEventListener('click', async () => { const project = activeProject(); if (!project) return; el['project-dialog'].close(); if (!await confirmAction('删除整个项目', `将删除“${project.title}”及其本地资料与写作记录。`)) return; workspace = await window.petAPI.deleteProject(project.id); renderAll(); });
  el['new-chat-button'].addEventListener('click', createNewConversation);
  el['sidebar-new-chat-button'].addEventListener('click', createNewConversation);
  el['sidebar-workbench-button'].addEventListener('click', createNewConversation);
  el['assemble-thesis-button'].addEventListener('click', exportAssembledThesis);
  el['open-library-button'].addEventListener('click', () => switchView('library'));
  el['pet-manage-button'].addEventListener('click', () => switchView('pet'));
  el['pet-page-back-button'].addEventListener('click', () => switchView('workbench'));
  el['attach-button'].addEventListener('click', chooseConversationFiles);
  el['library-add-button'].addEventListener('click', chooseLibraryDocuments);
  el['rag-rebuild-button'].addEventListener('click', async () => {
    const project = activeProject();
    if (!project) return;
    el['rag-rebuild-button'].disabled = true;
    el['rag-status-title'].textContent = '正在建立本地知识索引…';
    el['rag-status-detail'].textContent = '正在使用本机可用模型；神经模型不可用时自动使用哈希向量，不会联网下载。';
    try {
      await window.petAPI.rebuildRag(project.id);
      await renderRagStatus();
      showToast('RAG 知识库已重建');
    } catch (error) {
      el['rag-status-title'].textContent = '索引建立失败';
      el['rag-status-detail'].textContent = error.message;
      showToast(error.message, true);
    } finally {
      el['rag-rebuild-button'].disabled = false;
    }
  });
  el['drop-zone'].addEventListener('click', chooseLibraryDocuments);
  el['library-filter'].addEventListener('input', renderLibrary);
  el['task-input'].addEventListener('input', () => { resizeComposer(); updateComposerAction(); });
  el['task-input'].addEventListener('keydown', (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); if (!el['send-button'].disabled) handleGenerationAction(); } });
  el['send-button'].addEventListener('click', handleGenerationAction);
  el['confirm-dialog'].addEventListener('close', () => { confirmResolver?.(el['confirm-dialog'].returnValue === 'confirm'); confirmResolver = null; });
  el['settings-form'].addEventListener('submit', saveSettings);
  ['theme-select', 'accent-select', 'density-select'].forEach((id) => el[id].addEventListener('change', () => { settings = { ...settings, theme: el['theme-select'].value, accent: el['accent-select'].value, density: el['density-select'].value }; applyTheme(); }));
  el['settings-search'].addEventListener('input', () => { const query = el['settings-search'].value.trim(); if (!query) return; const match = [...document.querySelectorAll('[data-settings-panel]')].find((button) => button.textContent.includes(query)); if (match) switchSettingsPanel(match.dataset.settingsPanel); });
  el['api-key-toggle'].addEventListener('click', async () => {
    const showing = el['api-key'].type === 'text';
    if (showing) {
      hideApiKey();
      return;
    }
    if (!el['api-key'].value && apiStatus?.hasKey) el['api-key'].value = await window.petAPI.revealApiKey(el['api-provider'].value);
    el['api-key'].type = 'text';
    el['api-key-toggle'].classList.add('is-visible');
    el['api-key-toggle'].setAttribute('aria-label', '隐藏 API 密钥');
  });
  el['api-provider'].addEventListener('change', refreshProviderStatus);
  el['api-test-button'].addEventListener('click', testCurrentApi);
  el['api-save-test-button'].addEventListener('click', saveAndTestApi);
  el['data-environment-test-button'].addEventListener('click', async () => {
    el['data-environment-test-button'].disabled = true;
    try {
      await window.petAPI.saveSettings({ dataEnvironment: { pythonPath: el['data-python-path'].value.trim() } });
      await renderDataEnvironmentStatus();
    } finally {
      el['data-environment-test-button'].disabled = false;
    }
  });
  el['pet-form'].addEventListener('submit', async (event) => {
    event.preventDefault();
    const selectedPet = PETS[el['pet-select'].value] || PETS['ember-pup'];
    await window.petAPI.saveSettings({ petName: el['pet-name-input'].value.trim() || selectedPet.defaultName, pet: el['pet-select'].value, petVisible: el['pet-visible-enabled'].checked, soundEnabled: el['pet-sound-enabled'].checked, voiceEnabled: el['pet-voice-enabled'].checked, doNotDisturb: el['pet-dnd-enabled'].checked });
    await loadSettingsForm();
    renderAll();
    el['pet-save-status'].textContent = '已保存';
    showToast('宠物设置已保存');
  });
  el['pet-select'].addEventListener('change', () => renderPetPreview(el['pet-select'].value));
  el['pet-choice-grid'].addEventListener('click', (event) => {
    const choice = event.target.closest('[data-pet-choice]');
    if (!choice) return;
    const petId = choice.dataset.petChoice;
    el['pet-select'].value = petId;
    renderPetPreview(petId);
    const selectedPet = PETS[petId] || PETS['ember-pup'];
    window.petAPI.saveSettings({ pet: petId, petName: el['pet-name-input'].value.trim() || selectedPet.defaultName })
      .then(async () => {
        await loadSettingsForm();
        renderAll();
        el['pet-save-status'].textContent = '已切换桌面宠物';
        showToast('已切换桌面宠物');
      })
      .catch(() => showToast('切换失败，请重试。', true));
  });
  for (const eventName of ['dragenter', 'dragover']) el['drop-zone'].addEventListener(eventName, (event) => { event.preventDefault(); el['drop-zone'].classList.add('is-dragging'); });
  for (const eventName of ['dragleave', 'drop']) el['drop-zone'].addEventListener(eventName, (event) => { event.preventDefault(); el['drop-zone'].classList.remove('is-dragging'); });
  el['drop-zone'].addEventListener('drop', (event) => importPaths(validateDroppedFiles([...event.dataTransfer.files])));
  document.addEventListener('dragover', (event) => event.preventDefault());
  document.addEventListener('drop', (event) => event.preventDefault());
  el.conversation.addEventListener('copy', (event) => {
    if (event.target.closest('.user-message')) event.preventDefault();
  });
  el.conversation.addEventListener('contextmenu', (event) => {
    if (event.target.closest('.user-message')) event.preventDefault();
  });
  el.conversation.addEventListener('dragstart', (event) => {
    if (event.target.closest('.user-message')) event.preventDefault();
  });
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key === ',') { event.preventDefault(); switchView('settings'); }
    if (event.ctrlKey && event.key.toLowerCase() === 'n') { event.preventDefault(); switchView('workbench'); createNewConversation(); }
    if (event.ctrlKey && event.key.toLowerCase() === 'o') { event.preventDefault(); chooseLibraryDocuments(); }
    if (event.key === 'Escape' && !document.querySelector('dialog[open]')) window.petAPI.showPetMode();
  });
}

async function initialize() {
  bindEvents();
  workspace = await window.petAPI.loadWorkspace();
  if (!workspace.activeProjectId && workspace.projects.length) workspace = await window.petAPI.setActiveProject(workspace.projects[0].id);
  await loadSettingsForm();
  renderAll();
  resizeComposer();
  const shouldShowReminder = await window.petAPI.consumeLaunchReminder();
  if (shouldShowReminder) setTimeout(() => el['reminder-dialog'].showModal(), 350);
}

initialize().catch((error) => showToast(error.message, true));
