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

// 「数据分析环境」设置卡片：feed.html 中缺失这块 DOM（历史回退遗留）。
// 缺失会让 bindEvents 绑定检测按钮时抛错并中断整个启动链——工作区不加载，
// 表现为"重启后历史对话消失、提示 Cannot read properties of null"。
// 这里照 createThesisProfileFields 的模式动态注入，保证元素存在、设置页可用。
function createDataEnvironmentCard() {
  if (document.getElementById('data-environment-test-button')) return;
  const anchor = document.getElementById('agent-api-configs');
  if (!anchor) return;
  const card = anchor.closest('.settings-card');
  if (!card) return;
  const wrap = document.createElement('div');
  wrap.className = 'settings-card form-card data-environment-card';
  wrap.innerHTML = `
    <div class="setting-row"><span><strong>数据分析环境</strong><small id="data-environment-detail">检测内置 Python 3.14 与离线分析依赖。</small></span><span class="status-pill" id="data-environment-badge">检测中</span></div>
    <label>运行环境<select id="data-runtime-mode"><option value="bundled">内置 Python 3.14（推荐）</option><option value="external">自定义 Python（高级）</option></select></label>
    <label id="data-python-path-label" hidden>自定义 Python 路径<input id="data-python-path" type="text" placeholder="填写 Python 的完整路径，留空探测系统环境" /></label>
    <div class="setting-row"><span><small>内置统计和绘图依赖，安装后即可离线分析，无需额外安装 Python 或 Node.js。</small></span><button id="data-environment-test-button" type="button">检测环境</button></div>
    <code id="data-environment-command" hidden></code>`;
  const ocrStatus = document.createElement('p');
  ocrStatus.id = 'ocr-status-detail';
  ocrStatus.className = 'setting-status';
  wrap.append(ocrStatus);
  card.insertAdjacentElement('afterend', wrap);
}

createThesisProfileFields();
createDataEnvironmentCard();

document.getElementById('empirical-preview-button').addEventListener('click', () => void openEmpiricalPreview());
document.getElementById('empirical-preview-close').addEventListener('click', closeEmpiricalPreview);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeEmpiricalPreview(); });

const ids = [
  'pet-mode-button', 'close-button', 'project-switcher', 'project-menu', 'project-list', 'sidebar-project-list',
  'sidebar-project', 'titlebar-project', 'chat-project-title', 'sidebar-count', 'pet-stage-label', 'sidebar-conversation-list', 'sidebar-new-chat-button', 'sidebar-workbench-button',
  'pet-name-label', 'pet-mini-avatar', 'account-name-label', 'account-card-name', 'account-menu-button', 'account-menu',
  'new-chat-button', 'assemble-thesis-button', 'open-library-button', 'project-edit-button', 'welcome-title', 'chat-empty', 'chat-scroll',
  'task-progress-card', 'empirical-plan-card', 'empirical-preview', 'empirical-preview-title', 'empirical-preview-tabs', 'empirical-preview-content', 'empirical-preview-button', 'empirical-preview-close', 'preview-project', 'preview-expand', 'preview-copy', 'preview-save', 'preview-reveal', 'preview-file-list', 'preview-open-menu', 'conversation', 'task-input', 'send-button', 'attach-button', 'attach-folder-button', 'conversation-file-list', 'library-add-button', 'library-filter',
  'library-summary', 'library-list', 'drop-zone', 'feedback', 'recent-file-list', 'settings-back-button',
  'rag-status-title', 'rag-status-detail', 'rag-rebuild-button',
  'settings-search', 'settings-form', 'settings-save-status', 'pet-manage-button', 'pet-page-back-button',
  'pet-form', 'pet-page-name', 'pet-page-stage', 'pet-page-heading', 'pet-large-preview', 'pet-preview-glyph', 'pet-choice-grid', 'pet-visible-enabled', 'pet-sound-enabled', 'pet-voice-enabled', 'pet-dnd-enabled', 'pet-save-status',
  'account-display-name', 'theme-select', 'accent-select', 'density-select', 'api-provider', 'api-key', 'api-base-url',
  'api-key-toggle', 'api-status', 'api-test-button', 'api-save-test-button', 'api-connection-badge',
  'api-provider-logo', 'api-provider-name', 'api-provider-description', 'api-key-label',
  'api-model', 'data-runtime-mode', 'data-python-path-label',
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
let empiricalPreviewScope = '';
let previewArtifactName = '';

const PROVIDERS = {
  deepseek: { label: 'DeepSeek', logo: 'D', model: 'deepseek-chat' },
  openai: { label: 'OpenAI / GPT', logo: 'O', model: 'gpt-4.1-mini' },
  anthropic: { label: 'Claude / Anthropic', logo: 'C', model: 'claude-sonnet-4-6' },
  hunyuan: { label: '腾讯混元 / HY', logo: 'H', model: 'hunyuan-turbos-latest' },
  custom: { label: '自定义 OpenAI 兼容接口', logo: 'A', model: 'custom-model' },
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
  // 压掉标签之间的换行空白：模型输出的 HTML 段落间常带 \n\n，而正文容器是 pre-wrap，
  // 不清理会把它们渲染成大片空白（真实事故：段落间隔巨大）。
  template.innerHTML = String(value || '').replace(/>\s*\n\s*</g, '><');
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
  const editorStatus = document.querySelector('#draft-editor-dialog .editor-status');
  if (editorStatus) { editorStatus.textContent = message; editorStatus.classList.toggle('is-error', isError); }
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
  if (!el['data-environment-badge']) return; // 元素缺失时跳过，不中断启动/保存链路
  const status = await window.petAPI.getDataEnvironmentStatus();
  const packages = Object.entries(status.packages || {}).map(([name, available]) => `${name} ${available ? '✓' : '×'}`).join(' · ');
  el['data-environment-badge'].textContent = status.ready ? '数据绘图可用' : '环境未就绪';
  el['data-environment-badge'].classList.toggle('is-connected', Boolean(status.ready));
  el['data-environment-detail'].textContent = status.error || (status.ready
    ? `${status.source === 'bundled' ? '内置' : '自定义'} Python ${status.version}；${packages}；系统沙箱可用`
    : `Python ${status.version || '未知'}：${status.python || '未找到'}；${packages || '未检测到依赖'}`);
  el['data-environment-command'].textContent = status.installCommand || '';
  el['data-environment-command'].hidden = !status.installCommand || status.source === 'bundled';
}

function hideApiKey() {
  document.querySelectorAll('.agent-api-config [data-field="key"]').forEach(input => { input.value = ''; });
  if (!el['api-key']) return;
  el['api-key'].type = 'password';
  el['api-key'].value = '';
  el['api-key-toggle']?.classList.remove('is-visible');
  el['api-key-toggle']?.setAttribute('aria-label', '显示 API 密钥');
}

let showArchivedProjects = false;

function renderProjectLists() {
  el['project-list'].replaceChildren();
  el['sidebar-project-list'].replaceChildren();
  const visible = workspace.projects.filter((project) => showArchivedProjects || !project.archived);
  const archivedCount = workspace.projects.filter((project) => project.archived).length;

  // 归档切换（有已归档项目时才显示）
  if (archivedCount > 0) {
    const toggle = node('button', 'archive-toggle');
    toggle.type = 'button';
    toggle.textContent = showArchivedProjects ? '隐藏已归档项目' : `显示已归档项目（${archivedCount}）`;
    toggle.addEventListener('click', () => { showArchivedProjects = !showArchivedProjects; renderProjectLists(); });
    el['sidebar-project-list'].append(toggle);
  }

  for (const project of visible) {
    const menuButton = node('button', project.id === workspace.activeProjectId ? 'is-active' : '');
    menuButton.type = 'button';
    menuButton.innerHTML = `<span>${escapeHtml(project.title)}${project.archived ? '（已归档）' : ''}</span><small>${project.documents.length} 份资料</small>`;
    menuButton.addEventListener('click', () => selectProject(project.id));
    el['project-list'].append(menuButton);

    const row = node('div', 'sidebar-project-row');
    const projectButton = node('button', `sidebar-project-item${project.id === workspace.activeProjectId ? ' is-active' : ''}`);
    projectButton.type = 'button';
    projectButton.innerHTML = `<span>▱</span><strong>${escapeHtml(project.title)}</strong><small>${project.drafts.length}</small>`;
    projectButton.addEventListener('click', () => selectProject(project.id));
    const archiveButton = node('button', 'row-inline-delete');
    archiveButton.type = 'button';
    archiveButton.textContent = project.archived ? '↺' : '▤';
    archiveButton.title = project.archived ? '取消归档' : '归档项目';
    archiveButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      const archiving = !project.archived;
      if (archiving && !await confirmAction('归档项目', `归档「${project.title}」后它将从默认列表隐藏，可随时在"已归档"里找回。`)) return;
      workspace = await window.petAPI.updateProject(project.id, { archived: archiving });
      if (!archiving && workspace.activeProjectId === project.id) { /* 取消归档保持选中 */ }
      renderAll();
      showToast(archiving ? '项目已归档' : '项目已取消归档');
    });
    row.append(projectButton, archiveButton);
    el['sidebar-project-list'].append(row);
  }
  if (!visible.length) el['sidebar-project-list'].innerHTML = '<p class="sidebar-empty">创建第一个论文项目</p>';
}

function renderConversationList() {
  const project = activeProject();
  el['sidebar-conversation-list'].replaceChildren();
  if (!project) {
    el['sidebar-conversation-list'].innerHTML = '<p class="sidebar-conversation-empty">发送第一条指令后自动创建项目</p>';
    return;
  }
  for (const conversation of project.conversations || []) {
    const row = node('div', 'sidebar-conversation-row');
    const button = node('button', `sidebar-conversation-item${conversation.id === project.activeConversationId ? ' is-active' : ''}`);
    button.type = 'button';
    button.innerHTML = `<span>□</span><strong>${escapeHtml(conversation.title)}</strong>`;
    button.addEventListener('click', () => selectConversation(conversation.id));
    const deleteButton = node('button', 'row-inline-delete');
    deleteButton.type = 'button';
    deleteButton.textContent = '×';
    deleteButton.title = '删除对话';
    deleteButton.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (streamingDraft) return;
      if (!await confirmAction('删除对话', `将删除「${conversation.title}」及其全部草稿，不可恢复。`)) return;
      workspace = await window.petAPI.deleteConversation(project.id, conversation.id);
      renderAll();
      showToast('对话已删除');
    });
    row.append(button, deleteButton);
    el['sidebar-conversation-list'].append(row);
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

function draftLengthNotice(draft) {
  return draft?.lengthReview?.passed === false
    ? `⚠ 正文已保存：${draft.lengthReview.actual} 汉字，要求${draft.lengthReview.contract?.label || '指定篇幅'}，篇幅未达标。可以查看、编辑和导出正文。`
    : '';
}

function renderConversation() {
  const project = activeProject();
  el['assemble-thesis-button'].hidden = !(project?.type === '硕士学位论文' && Number(project?.thesisProfile?.targetWords || 0) >= 40000);
  const conversationId = project?.activeConversationId;
  renderEmpiricalPlan(project?.empiricalPlans?.[conversationId]);
  if (empiricalPreviewScope && empiricalPreviewScope !== `${project?.id}/${conversationId}`) closeEmpiricalPreview();
  const drafts = [...(project?.drafts || []), ...(project?.messages || [])].filter(item => item.conversationId === conversationId)
    .sort((left, right) => String(left.createdAt || left.updatedAt || '').localeCompare(String(right.createdAt || right.updatedAt || '')));
  renderProgressCard(streamingDraft && (!streamingDraft.projectId || (streamingDraft.projectId === project?.id && streamingDraft.conversationId === conversationId)) ? streamingDraft.progress : drafts.at(-1)?.progress);
  el.conversation.replaceChildren();
  el['chat-empty'].hidden = drafts.length > 0;
  if (!drafts.length) { void renderSuspendedBanner(); return; }

  for (const draft of drafts) {
    const exchange = node('article', 'chat-exchange');
    const userMessage = node('div', 'message user-message');
    const attachmentMarkup = (draft.attachments || []).length
      ? `<div class="message-attachments"><span>本轮工作文件：</span>${draft.attachments.map((file) => `${file.previewDataUrl ? `<img class="conversation-image-preview" src="${file.previewDataUrl}" alt="${escapeHtml(file.name)}" />` : ''}<b>${escapeHtml(file.name)}</b>`).join('')}</div>`
      : '';
    userMessage.innerHTML = `<div class="message-label">你</div><div class="message-bubble">${escapeHtml(draft.task || '继续论文写作')}</div>${attachmentMarkup}`;

    const assistantMessage = node('div', 'message assistant-message');
    if (draft.channel === 'chat') {
      assistantMessage.innerHTML = `<div class="assistant-avatar">柴</div><div class="assistant-body"><div class="assistant-meta"><strong>${escapeHtml(settings?.petName || '小柴')}</strong><span>对话回复 · ${new Date(draft.createdAt).toLocaleString('zh-CN')}</span></div><div class="assistant-content"><div class="assistant-reply"></div></div><div class="message-actions"><button type="button">复制</button></div></div>`;
      assistantMessage.querySelector('.assistant-reply').textContent = draft.text || '';
      assistantMessage.querySelector('button').addEventListener('click', async () => { await navigator.clipboard.writeText(draft.text || ''); showToast('回复已复制'); });
      appendArtifactLinks(assistantMessage.querySelector('.assistant-content'), draft.analysisArtifacts || [], project);
      exchange.append(userMessage, assistantMessage);
      el.conversation.append(exchange);
      continue;
    }
    const modeLabel = draft.mode === 'api' ? 'AI 生成' : '本地任务草稿';
    assistantMessage.innerHTML = `<div class="assistant-avatar">柴</div><div class="assistant-body"><div class="assistant-meta"><strong>${escapeHtml(settings?.petName || '小柴')}</strong><span>${modeLabel} · ${new Date(draft.updatedAt).toLocaleString('zh-CN')}</span></div><div class="assistant-content"></div><div class="message-actions"><button data-action="copy" type="button">复制</button><button data-action="word" type="button">导出 Word</button><button data-action="details" type="button">查看引用与核验</button></div><div class="evidence-drawer" hidden></div><p class="ai-warning">内容由AI生成，请仔细甄别。</p></div>`;
    const content = assistantMessage.querySelector('.assistant-content');
    // 对话框只承载对话文字：历史消息以对话式摘要呈现；论文正文存于草稿，经「导出 Word」交付。
    const reply = node('div', 'assistant-reply');
    const plainLength = String(draft.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '').length;
    reply.textContent = draft.chatReply || draftLengthNotice(draft) || (plainLength
      ? `✅ 已完成「${draft.title || (draft.task || '').slice(0, 24) || '本轮任务'}」，正文约 ${plainLength} 字，已存入论文草稿；点击「导出 Word」查看或交付全文。`
      : '任务已记录为草稿。');
    content.append(reply);
    const previewButton = node('button', 'title-action');
    previewButton.type = 'button';
    previewButton.textContent = '查看与修改正文';
    previewButton.addEventListener('click', () => openDraftEditor(draft));
    assistantMessage.querySelector('.message-actions').prepend(previewButton);
    const fileButton = node('button', 'generated-file');
    fileButton.type = 'button'; fileButton.textContent = `${draft.title || '论文草稿'}.docx`;
    fileButton.addEventListener('click', () => openPaperPreview(draft));
    content.append(fileButton);

    const drawer = assistantMessage.querySelector('.evidence-drawer');
    const workflowItems = draft.workflow ? [
      `章节路由：${draft.workflow.section}`,
      `写作模式：${draft.workflow.writingMode || draft.workflow.writingModeLabel || draft.workflow.paradigmLabel || draft.workflow.paradigm || '通用学位论文模式'}`,
      `论证结构：${draft.workflow.architecture}`,
      ...(draft.workflow.steps || []),
    ] : [];
    drawer.innerHTML = `<div><strong>科研工作流</strong>${listMarkup(workflowItems)}</div><div><strong>引用清单</strong>${listMarkup(draft.citations)}</div><div><strong>来源映射</strong>${listMarkup(draft.mappings)}</div><div><strong>待核验</strong>${listMarkup(draft.checks)}</div>`;
    drawer.append(createEvidenceList(draft));
    assistantMessage.querySelector('[data-action="copy"]').addEventListener('click', async () => { await navigator.clipboard.writeText(draft.content || ''); showToast('正文已复制'); });
    assistantMessage.querySelector('[data-action="word"]').addEventListener('click', () => exportDraft(project.id, draft, 'word'));
    assistantMessage.querySelector('[data-action="details"]').addEventListener('click', () => { drawer.hidden = !drawer.hidden; });

    exchange.append(userMessage, assistantMessage);
    el.conversation.append(exchange);
  }
  void renderSuspendedBanner();
}

function openDraftEditor(draft) {
  document.getElementById('draft-editor-dialog')?.remove();
  const dialog = node('dialog', 'draft-editor-dialog');
  dialog.id = 'draft-editor-dialog';
  const header = node('div', 'modal-heading');
  const title = node('h2');
  title.textContent = draft.title || '论文草稿';
  const close = node('button');
  close.type = 'button';
  close.textContent = '关闭';
  close.addEventListener('click', () => dialog.close());
  header.append(title, close);
  const hint = node('p');
  hint.textContent = [draftLengthNotice(draft), '选中正文后，可润色、扩写或调整为实证风格。修改完成后自动保存。'].filter(Boolean).join(' ');
  const prose = node('div', 'assistant-prose');
  prose.dataset.draftId = draft.id;
  prose.innerHTML = renderPaperHtml(draft.content || '');
  dialog.append(header, hint, prose);
  const evidenceList = createEvidenceList(draft);
  dialog.append(evidenceList);
  for (const mark of prose.querySelectorAll('sup[data-footnote]')) {
    mark.tabIndex = 0;
    mark.setAttribute('role', 'button');
    mark.title = '查看原始证据片段';
    const openEvidence = () => {
      const detail = [...evidenceList.querySelectorAll('details')].find(item => item.dataset.evidenceId === `E${mark.dataset.footnote}`);
      if (detail) { detail.open = true; detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    };
    mark.addEventListener('click', openEvidence);
    mark.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openEvidence(); } });
  }
  const status = node('p', 'editor-status');
  status.setAttribute('role', 'status');
  dialog.append(status);
  dialog.addEventListener('close', () => { hideSkillMenu(); dialog.remove(); });
  document.body.append(dialog);
  dialog.showModal();
}

function createEvidenceList(draft) {
  const list = node('section', 'draft-evidence-list');
  for (const [index, evidence] of (draft.evidence || []).entries()) {
    const detail = node('details');
    detail.dataset.evidenceId = evidence.evidenceId || `E${index + 1}`;
    const summary = node('summary');
    summary.textContent = `${detail.dataset.evidenceId} · ${evidence.documentName || '资料'} · ${evidence.page ? `第 ${evidence.page} 页` : `片段 ${evidence.position || index + 1}`}`;
    const excerpt = node('blockquote');
    excerpt.textContent = evidence.text || '未保存片段，请重新生成以获取证据。';
    detail.append(summary, excerpt);
    list.append(detail);
  }
  return list;
}

function appendStreamingExchange(task, attachments = []) {
  renderProgressCard(null);
  el['chat-empty'].hidden = true;
  const exchange = node('article', 'chat-exchange');
  const userMessage = node('div', 'message user-message');
  const attachmentMarkup = attachments.length ? `<div class="message-attachments"><span>本轮工作文件：</span>${attachments.map((file) => `${file.previewDataUrl ? `<img class="conversation-image-preview" src="${file.previewDataUrl}" alt="${escapeHtml(file.name)}" />` : ''}<b>${escapeHtml(file.name)}</b>`).join('')}</div>` : '';
  userMessage.innerHTML = `<div class="message-label">你</div><div class="message-bubble">${escapeHtml(task)}</div>${attachmentMarkup}`;
  const assistantMessage = node('div', 'message assistant-message is-streaming');
  // 对话框只承载 Agent 与用户的对话文字（过程步骤 / 结论报告 / 完成汇报）；
  // 论文正文后台生成、存草稿，仅通过「导出 Word」交付，不在对话框渲染。
  assistantMessage.innerHTML = `<div class="assistant-avatar">柴</div><div class="assistant-body"><div class="assistant-meta"><strong>${escapeHtml(settings?.petName || '小柴')}</strong><span>AI 正在处理</span></div><div class="task-outputs"></div><div class="assistant-reply"></div><div class="message-actions"></div><p class="ai-warning">内容由AI生成，请仔细甄别。</p></div>`;
  exchange.append(userMessage, assistantMessage);
  el.conversation.append(exchange);
  scrollConversation();
  return { exchange, assistantMessage, reply: assistantMessage.querySelector('.assistant-reply'), meta: assistantMessage.querySelector('.assistant-meta span') };
}

// 论文正文已不在对话框流式渲染（后台生成、Word 交付），流式通道保留供未来对话回复流式使用。
function handleDraftStream(payload) {
  if (!streamingDraft || payload?.requestId !== streamingDraft.requestId || typeof payload.delta !== 'string') return;
  const shouldFollow = el['chat-scroll'].scrollHeight - el['chat-scroll'].scrollTop - el['chat-scroll'].clientHeight < 120;
  streamingDraft.content += payload.delta;
  if (!streamingDraft.reply.textContent) {
    streamingDraft.reply.classList.add('is-streaming');
    streamingDraft.reply.textContent = streamingDraft.content;
    if (shouldFollow) scrollConversation();
  }
  // 用 setTimeout 而非 requestAnimationFrame：窗口失焦时 rAF 会暂停，导致"回来后一次性全量出现"的假象。
  if (!streamRenderFrame) {
    streamRenderFrame = setTimeout(() => {
      streamRenderFrame = null;
      if (!streamingDraft) return;
      const replyEl = streamingDraft.reply;
      if (replyEl) {
        replyEl.classList.add('is-streaming');
        replyEl.textContent = streamingDraft.content;
      }
      if (shouldFollow) scrollConversation();
    }, 33);
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
    data: '项目分析文件 · 后续对话可用 · 不进入文献检索',
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

let importingConversationFiles = false;
async function chooseConversationFiles(folder = false, paths = null) {
  if (importingConversationFiles) return;
  importingConversationFiles = true;
  try {
    if (!activeProject()) {
      await window.petAPI.createProject({ title: '新论文项目' });
      workspace = await window.petAPI.loadWorkspace();
      renderAll();
    }
    const projectId = activeProject().id;
    const result = paths ? await window.petAPI.importConversationFiles(projectId, paths) : await window.petAPI.chooseConversationFiles(projectId, folder);
    const attachments = Array.isArray(result) ? result : result.attachments;
    if (!attachments?.length) { if (result.rejected?.length) showToast(`没有导入文件：${result.rejected[0].reason}`, true); return; }
    workspace = await window.petAPI.loadWorkspace();
    if (activeProject()?.id === projectId) conversationAttachments = [...new Map([...conversationAttachments, ...attachments].map(item => [item.id, item])).values()];
    renderAll();
    renderConversationAttachments();
    showToast(`已保存 ${attachments.length} 个项目文件：文献进入知识库，数据保留供后续分析${result.rejected?.length ? `；${result.rejected.length} 个文件未导入` : ''}`);
  } catch (error) {
    showToast(error.message, true);
  } finally { importingConversationFiles = false; updateComposerAction(); }
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

async function runGeneration(options = {}) {
  if (importingConversationFiles) return showToast('文件正在保存，请完成后再发送');
  const task = options.task || el['task-input'].value.trim();
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
  const currentStream = { requestId, projectId: project.id, conversationId: conversation.id, content: '', ...streamView };
  currentStream.settled = new Promise(resolve => { currentStream.resolveSettled = resolve; });
  streamingDraft = currentStream;
  el['task-input'].value = '';
  resizeComposer();
  updateComposerAction();
  try {
    renderEmpiricalPlan(project.empiricalPlans?.[conversation.id]);
    const result = await window.petAPI.generateDraft(project.id, { task, requestId, conversationId: conversation.id, attachments: conversationAttachments, ...(options.empiricalApproval ? { empiricalApproval: options.empiricalApproval } : {}) });
    if (streamingDraft !== currentStream) return;
    workspace = await window.petAPI.loadWorkspace();
    currentStream.reply?.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.remove('is-streaming');
    // UC-FLOW-01：任务被挂起——进度已存档，显示「已挂起」徽标与「恢复续写」按钮。
    if (result?.suspended) {
      currentStream.reply.textContent = '⏸ 已按你的要求暂停，当前进度已存档。';
      currentStream.meta.textContent = '已挂起，进度已存档';
      currentStream.assistantMessage.classList.add('is-interrupted');
      attachResumeAction(currentStream.assistantMessage, result.runId, conversation.id, task);
      streamingDraft = null;
      renderAll();
      showToast('已挂起并存档进度，可点「恢复续写」继续');
      return;
    }
    // 对话框只给对话式汇报；论文正文在草稿里，通过「导出 Word」查看/交付。
    if (result?.chat) {
      currentStream.reply.textContent = result.message.text;
    } else if (result?.draft) {
      const plain = String(result.draft.content || '').replace(/<[^>]+>/g, '').replace(/\s+/g, '');
      const count = plain.length;
      currentStream.reply.textContent = draftLengthNotice(result.draft) || `✅ 本轮已完成「${result.draft.title || task.slice(0, 24)}」，正文约 ${count} 字，已存入论文草稿。点击下方「导出 Word」即可查看或交付全文。`;
    } else {
      currentStream.reply.textContent = '✅ 本轮任务已完成，结果已保存为草稿。';
    }
    currentStream.meta.textContent = 'AI 生成完成';
    streamingDraft = null;
    conversationAttachments = [];
    renderConversationAttachments();
    renderAll();
    showToast(result?.chat ? '回复已保存到当前对话' : draftLengthNotice(result?.draft) || (apiStatus?.hasKey ? '生成完成，正文已存草稿，可导出 Word' : '任务草稿已保存；配置 API 后可生成正文'));
  } catch (error) {
    if (streamingDraft !== currentStream) return;
    currentStream.reply?.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.add('is-error');
    currentStream.reply.textContent = `生成失败：${error.message}`;
    currentStream.meta.textContent = '生成失败';
    streamingDraft = null;
    showToast(error.message, true);
  } finally {
    currentStream.resolveSettled?.();
    updateComposerAction();
    renderEmpiricalPlan(activeProject()?.empiricalPlans?.[activeConversation()?.id]);
  }
}

async function stopCurrentGeneration() {
  const currentStream = streamingDraft;
  if (!currentStream) return;
  currentStream.reply?.classList.remove('is-streaming');
  currentStream.assistantMessage.classList.remove('is-streaming');
  currentStream.assistantMessage.classList.add('is-interrupted');
  currentStream.reply.textContent = '⏸ 正在停止并保存进度…';
  currentStream.meta.textContent = '正在挂起';
  await window.petAPI.cancelDraft(currentStream.requestId);
  await currentStream.settled;
  updateComposerAction();
}

// —— UC-FLOW-01 会话中断挂起与恢复 ——
// 在被挂起的助手消息上附加「已挂起」徽标与「恢复续写」按钮。
function attachResumeAction(assistantMessage, runId, conversationId, taskText) {
  if (!assistantMessage) return;
  const host = assistantMessage.querySelector('.message-actions') || assistantMessage;
  if (!host || host.querySelector(`[data-resume-run="${runId}"]`)) return;
  const wrap = node('div', 'suspend-actions');
  const badge = node('span', 'status-pill');
  badge.textContent = '已挂起';
  const button = node('button', 'title-action');
  button.type = 'button';
  button.dataset.resumeRun = runId;
  button.textContent = '恢复续写';
  button.addEventListener('click', () => startResume(runId, conversationId, taskText));
  wrap.append(badge, button);
  host.append(wrap);
}

// 从存档点恢复续写：新建流式消息接收续写内容；挂起期间上传的新资料随 attachments 一起进入召回范围。
async function startResume(runId, conversationId, taskText) {
  const project = activeProject();
  if (streamingDraft) return;
  if (!project) { showToast('请先选择论文项目', true); return; }
  const requestId = crypto.randomUUID();
  const streamView = appendStreamingExchange(`恢复续写：${taskText || '（断点续写）'}`, conversationAttachments);
  const currentStream = { requestId, projectId: project.id, conversationId, content: '', ...streamView };
  currentStream.settled = new Promise(resolve => { currentStream.resolveSettled = resolve; });
  streamingDraft = currentStream;
  updateComposerAction();
  try {
    // 恢复前若输入框里写了补充说明（"打断 → 补充 → 继续"），一并带给续写任务。
    const resumeNote = el['task-input'].value.trim();
    if (resumeNote) el['task-input'].value = '';
    const result = await window.petAPI.resumeDraft(project.id, runId, { task: taskText || '', requestId, conversationId, attachments: conversationAttachments, note: resumeNote });
    if (streamingDraft !== currentStream) return;
    workspace = await window.petAPI.loadWorkspace();
    currentStream.reply?.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.remove('is-streaming');
    if (result?.suspended) { streamingDraft = null; renderAll(); showToast('已再次挂起并保存进度'); return; }
    currentStream.reply.textContent = result?.chat ? result.message.text : draftLengthNotice(result?.draft) || '✅ 已从断点续写完成，正文已并入论文草稿，可通过「导出 Word」查看或交付全文。';
    currentStream.meta.textContent = '已从断点续写完成';
    streamingDraft = null;
    conversationAttachments = [];
    renderConversationAttachments();
    renderAll();
    showToast(result?.chat ? '回复已保存到当前对话' : draftLengthNotice(result?.draft) || '已从断点续写完成，正文已存草稿');
  } catch (error) {
    if (streamingDraft !== currentStream) return;
    currentStream.reply?.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.remove('is-streaming');
    currentStream.assistantMessage.classList.add('is-error');
    currentStream.reply.textContent = `恢复失败：${error.message}`;
    currentStream.meta.textContent = '恢复失败';
    streamingDraft = null;
    showToast(error.message, true);
  } finally {
    currentStream.resolveSettled?.();
    updateComposerAction();
  }
}

// 应用重新打开后，列出仍可恢复的挂起会话（PRD：「挂起期间关闭应用 → 下次打开可从存档恢复」）。
async function renderSuspendedBanner() {
  const project = activeProject();
  const host = el.conversation;
  if (!host || !project) return;
  host.querySelectorAll('.suspended-banner').forEach((item) => item.remove());
  let suspended = [];
  try {
    suspended = await window.petAPI.listSuspendedDrafts(project.id) || [];
  } catch {
    return;
  }
  if (activeProject()?.id !== project.id) return;
  host.querySelectorAll('.suspended-banner').forEach(item => item.remove());
  for (const item of suspended) {
    const banner = node('div', 'suspended-banner');
    const badge = node('span', 'status-pill');
    badge.textContent = '已挂起';
    const label = node('span', 'suspended-banner__label');
    label.textContent = `「${item.task || '未命名任务'}」进度已存档`;
    const button = node('button', 'title-action');
    button.type = 'button';
    button.textContent = '恢复续写';
    button.addEventListener('click', () => startResume(item.id, item.conversationId, item.task));
    banner.append(badge, label, button);
    host.append(banner);
  }
}

// —— UC-SKILL-02 段落级应用 Skill ——
// 浮动「应用 Skill」菜单（惰性单例，挂在 body 上，定位到选区上方）
let skillMenu = null;
function ensureSkillMenu() {
  if (skillMenu && skillMenu.isConnected) return skillMenu;
  skillMenu = null;
  skillMenu = node('div', 'skill-menu');
  const actions = [
    { op: 'polish', label: '润色这段' },
    { op: 'expand', label: '扩写这段' },
    { op: 'empirical', label: '改实证风格' },
  ];
  for (const action of actions) {
    const button = node('button', 'skill-menu__item');
    button.type = 'button';
    button.textContent = action.label;
    button.addEventListener('mousedown', (event) => event.preventDefault()); // 防止抢焦点导致选区丢失
    button.addEventListener('click', () => applyLocalSkill(action.op));
    skillMenu.append(button);
  }
  (document.getElementById('draft-editor-dialog') || document.body).append(skillMenu);
  return skillMenu;
}

function hideSkillMenu() {
  if (skillMenu) skillMenu.classList.remove('is-open');
}

function renderTaskProgress(host, progress, live = false) {
  if (!progress?.steps?.length) return;
  const wasOpen = host.querySelector('details')?.open;
  const details = node('details', 'task-plan');
  details.open = wasOpen ?? live;
  const summary = node('summary', 'task-plan__summary');
  const info = TaskProgress.summary(progress);
  const title = node('span');
  title.textContent = info.text;
  summary.append(title);
  summary.setAttribute('aria-label', info.text + '，展开或收起执行过程');
  details.append(summary);
  const list = node('ol', 'task-plan__list');
  for (const step of progress.steps) {
    const item = node('li', 'task-step is-' + step.status);
    item.dataset.taskId = step.id;
    const icon = node('span', 'task-step__icon');
    icon.textContent = { done: '✓', running: '◎', failed: '×', suspended: '⏸', waiting: '?', review: '!' }[step.status] || '○';
    icon.setAttribute('aria-hidden', 'true');
    const description = node('div', 'task-step__description');
    const label = node('span', 'task-step__label');
    label.textContent = step.label || '处理任务';
    description.append(label);
    const dependency = step.status === 'pending' && step.dependsOn?.length ? '等待：' + step.dependsOn.map(id => progress.steps.find(other => other.id === id)?.label || id).join('、') : '';
    if (step.note || dependency) {
      const note = node('small', 'task-step__note');
      note.textContent = step.note || dependency;
      description.append(note);
    }
    const status = node('span', 'task-step__progress');
    status.textContent = TaskProgress.labels[step.status] || '待执行';
    item.append(icon, description, status);
    list.append(item);
  }
  details.append(list);
  host.replaceChildren(details);
}

function syncProgressCardSpace() {
  const height = ['task-progress-card', 'empirical-plan-card'].reduce((sum, id) => sum + (el[id].hidden ? 0 : el[id].offsetHeight + 12), 0);
  el.conversation.style.setProperty('--progress-card-height', `${height}px`);
}

function empiricalFeedback(text) {
  if (streamingDraft) { showToast('请等当前任务完成后提交修改'); return; }
  el['task-input'].value = text;
  resizeComposer(); updateComposerAction(); el['task-input'].focus();
}

function renderEmpiricalPlan(plan) {
  const host = el['empirical-plan-card'];
  host.replaceChildren();
  el['empirical-preview-button'].hidden = !(plan?.results?.length || plan?.analysisErrors?.length);
  host.hidden = !plan || plan.status === 'completed';
  if (host.hidden) { syncProgressCardSpace(); return; }
  const detail = node('details');
  const summary = node('summary');
  const names = { 'pending-confirmation': '分析方案 · 待确认', approved: '分析方案 · 已确认', 'results-review': '分析结果 · 待审阅', 'writing-confirmation': '写作方案 · 待确认', 'writing-approved': '写作方案 · 已确认' };
  summary.textContent = `${names[plan.status] || '实证方案'} · 第 ${plan.revision} 版`;
  detail.append(summary);
  const body = node('div', 'empirical-plan-body');
  const writing = ['writing-confirmation', 'writing-approved'].includes(plan.status);
  const heading = node('p'); heading.textContent = writing ? `标题：${plan.writingProposal.title}` : `${plan.researchQuestion} · 数据：${plan.attachment.name}`;
  body.append(heading);
  const list = node('ol');
  for (const item of writing ? plan.writingProposal.sections : plan.steps) {
    const entry = node('li'); entry.textContent = writing ? item : `${item.label}：${item.specification}（目的：${item.purpose}；产出：${item.outputs || '结果表'}）`;
    list.append(entry);
  }
  body.append(list);
  const limit = node('p');
  limit.textContent = writing ? `篇幅：${plan.writingProposal.lengthRequirement}。采用结果：${(plan.writingProposal.resultStepIds || []).map(id => plan.steps.find(step => step.id === id)?.label || id).join('、') || '已完成结果'}。${plan.writingProposal.task}` : `缺失值：${plan.missingDataPolicy || '须按步骤设定处理'}。解释边界：${plan.interpretationLimits || '按研究设计说明限制'}。`;
  body.append(limit); detail.append(body); host.append(detail);
  const actions = node('div', 'empirical-plan-actions');
  const button = (label, action) => { const btn = node('button'); btn.type = 'button'; btn.textContent = label; btn.disabled = !!streamingDraft; btn.addEventListener('click', action); actions.append(btn); };
  if (['pending-confirmation', 'writing-confirmation'].includes(plan.status)) {
    button(writing ? '确认方案并写作' : '确认方案并分析', () => {
      const current = activeProject()?.empiricalPlans?.[activeConversation()?.id];
      if (!current || current.id !== plan.id || current.revision !== plan.revision || current.status !== plan.status || current.writingProposal?.revision !== plan.writingProposal?.revision) { showToast('方案已更新，请确认当前版本', true); return; }
      void runGeneration({ task: writing ? `确认写作方案：${plan.writingProposal.title}` : `确认分析方案：${plan.researchQuestion}`, empiricalApproval: { id: plan.id, revision: plan.revision, kind: writing ? 'writing' : 'analysis', ...(writing ? { writingRevision: plan.writingProposal.revision } : {}) } });
    });
    button('提出修改', () => empiricalFeedback(writing ? '修改写作方案：' : '修改分析方案：'));
  } else if (plan.status === 'results-review') {
    button('查看表格与图表', () => void openEmpiricalPreview());
    button('反馈分析修改', () => empiricalFeedback(`请先确认修改方案${previewArtifactName ? `（针对「${previewArtifactName}」）` : ''}：`));
    button('拟定写作方案', () => void runGeneration({ task: '分析结果已审阅。请先与我确认要写的内容、标题、章节结构和篇幅，提交写作方案，暂不生成正文。' }));
  }
  host.append(actions);
  detail.addEventListener('toggle', syncProgressCardSpace);
  syncProgressCardSpace();
}

function closeEmpiricalPreview() {
  empiricalPreviewScope = '';
  previewArtifactName = '';
  previewSelectedArtifact = null;
  previewReadSequence++;
  el['empirical-preview'].hidden = true;
  document.querySelector('.chat-view').classList.remove('has-empirical-preview');
  el['empirical-preview'].classList.remove('is-expanded');
  el['preview-expand'].setAttribute('aria-pressed', 'false');
  previewOpenKeys = [];
  syncProgressCardSpace();
}

async function openEmpiricalPreview(selection = null) {
  const project = activeProject(), conversation = activeConversation();
  if (!project || !conversation) return;
  const scope = `${project.id}/${conversation.id}`;
  const readSequence = ++previewReadSequence;
  if (empiricalPreviewScope !== scope) previewOpenKeys = [];
  empiricalPreviewScope = scope;
  previewSelectedArtifact = null;
  el['empirical-preview'].hidden = false;
  document.querySelector('.chat-view').classList.add('has-empirical-preview');
  const content = el['empirical-preview-content']; content.replaceChildren();
  el['empirical-preview-tabs'].replaceChildren(); el['empirical-preview-title'].textContent = '文件预览';
  const waiting = node('p'); waiting.textContent = '正在读取当前对话的实证结果…'; content.append(waiting);
  try {
    const preview = await window.petAPI.getEmpiricalResultPreview(project.id, conversation.id, selection?.revision);
    if (readSequence !== previewReadSequence || empiricalPreviewScope !== scope || `${activeProject()?.id}/${activeConversation()?.id}` !== scope) return;
    const artifacts = [];
    for (const result of preview.results) {
      const base = { planId: preview.planId, revision: preview.revision, stepId: result.stepId };
      const source = (kind, index = 0) => ({ ...base, kind, index });
      for (const [index, table] of (result.tables || []).entries()) artifacts.push({ type: 'table', name: table.title, table, source: source('table', index) });
      for (const [index, chart] of (result.charts || []).entries()) artifacts.push({ type: 'image', name: chart.name, dataUrl: chart.dataUrl, source: source('image', index) });
      const stepLabel = preview.steps?.find(step => step.id === result.stepId)?.label || project.empiricalPlans?.[conversation.id]?.steps.find(step => step.id === result.stepId)?.label || '分析';
      if (result.code) artifacts.push({ type: 'text', name: `${stepLabel} · analysis_script.py`, text: result.code, source: source('code') });
      const { code, charts, files, ...data } = result;
      artifacts.push({ type: 'text', name: `${stepLabel} · analysis-result.json`, text: JSON.stringify(data, null, 2), source: source('json') });
    }
    if (selection && !artifacts.some(artifact => artifactKey(artifact.source) === artifactKey(selection))) throw new Error('该结果文件已不可用');
    renderArtifactPreview(artifacts, selection && artifactKey(selection));
  } catch (error) { if (readSequence === previewReadSequence && empiricalPreviewScope === scope) waiting.textContent = `预览失败：${error.message}`; }
  syncProgressCardSpace();
}

let previewOpenKeys = [], previewSelectedArtifact = null, previewReadSequence = 0;
function artifactKey(source) { return JSON.stringify([source?.planId, source?.revision, source?.stepId, source?.kind, source?.index, source?.draftId]); }

function appendArtifactLinks(host, artifacts, project) {
  if (!artifacts.length) return;
  const files = node('div', 'generated-files');
  for (const artifact of artifacts) {
    const button = node('button', 'generated-file'); button.type = 'button';
    const icon = node('span', `codicon codicon-${artifact.kind === 'image' ? 'file-media' : artifact.kind === 'table' ? 'table' : 'file'}`); icon.setAttribute('aria-hidden', 'true');
    const label = node('span'); label.textContent = artifact.name; button.append(icon, label);
    button.addEventListener('click', () => { if (activeProject()?.id === project.id) void openEmpiricalPreview(artifact); });
    files.append(button);
  }
  host.append(files);
}

function openPaperPreview(draft) {
  previewReadSequence++;
  empiricalPreviewScope = `${activeProject()?.id}/${activeConversation()?.id}`;
  previewOpenKeys = [];
  el['empirical-preview'].hidden = false; document.querySelector('.chat-view').classList.add('has-empirical-preview');
  renderArtifactPreview([{ type: 'paper', name: `${draft.title || '论文草稿'}.docx`, html: draft.content, draft, source: { draftId: draft.id } }]);
  syncProgressCardSpace();
}

function renderArtifactPreview(artifacts, selectedKey = null) {
  const tabs = el['empirical-preview-tabs'], content = el['empirical-preview-content'];
  tabs.replaceChildren(); content.replaceChildren();
  el['preview-project'].textContent = activeProject()?.title || '当前项目';
  const picker = el['preview-file-list']; picker.replaceChildren();
  let selected = artifacts.find(artifact => artifactKey(artifact.source) === selectedKey) || artifacts[0];
  if (selected && !previewOpenKeys.includes(artifactKey(selected.source))) previewOpenKeys.push(artifactKey(selected.source));
  const open = artifacts.filter(artifact => previewOpenKeys.includes(artifactKey(artifact.source)));
  const show = (artifact, index) => {
    previewSelectedArtifact = artifact;
    previewArtifactName = artifact.name;
    el['empirical-preview-title'].textContent = artifact.name;
    for (const [i, button] of [...tabs.querySelectorAll('[role="tab"]')].entries()) { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; }
    content.replaceChildren();
    const viewer = node('div', `artifact-viewer artifact-${artifact.type}`);
    if (artifact.type === 'image') {
      const img = node('img'); img.src = artifact.dataUrl; img.alt = artifact.name; viewer.append(img);
    } else if (artifact.type === 'table') {
      const table = node('table'), head = node('thead'), row = node('tr');
      table.setAttribute('aria-label', artifact.name);
      for (const column of artifact.table.columns) { const cell = node('th'); cell.scope = 'col'; cell.textContent = column; row.append(cell); }
      head.append(row); table.append(head);
      const body = node('tbody');
      for (const values of artifact.table.rows) { const tr = node('tr'); for (const value of values) { const td = node('td'); td.textContent = value === null ? '—' : String(value); tr.append(td); } body.append(tr); }
      table.append(body); viewer.append(table);
    } else if (artifact.type === 'paper') {
      const prose = node('div', 'assistant-prose'); prose.innerHTML = renderPaperHtml(artifact.html); viewer.append(prose);
    } else {
      const pre = node('pre', 'code-preview');
      for (const line of String(artifact.text || '').split('\n')) { const row = node('span', 'code-line'); appendCodeLine(row, line, artifact.source?.kind === 'code'); pre.append(row); }
      viewer.append(pre);
    }
    content.append(viewer);
  };
  for (const artifact of artifacts) {
    const item = node('button'); item.type = 'button'; item.textContent = artifact.name;
    item.addEventListener('click', () => { picker.closest('details').open = false; renderArtifactPreview(artifacts, artifactKey(artifact.source)); });
    picker.append(item);
  }
  for (const [index, artifact] of open.entries()) {
    const wrap = node('div', 'preview-tab');
    const tab = node('button'); tab.type = 'button'; tab.setAttribute('role', 'tab');
    const icon = node('span', 'codicon codicon-file'); icon.setAttribute('aria-hidden', 'true');
    const label = node('span'); label.textContent = artifact.name; tab.append(icon, label); tab.title = artifact.name;
    tab.addEventListener('click', () => show(artifact, index));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + open.length) % open.length;
      show(open[next], next); tabs.querySelectorAll('[role="tab"]')[next].focus();
    });
    const close = node('button', 'preview-tab-close'); close.type = 'button'; close.setAttribute('aria-label', `关闭 ${artifact.name}`);
    const closeIcon = node('span', 'codicon codicon-close'); closeIcon.setAttribute('aria-hidden', 'true'); close.append(closeIcon);
    close.addEventListener('click', () => { previewOpenKeys = previewOpenKeys.filter(key => key !== artifactKey(artifact.source)); if (!previewOpenKeys.length) closeEmpiricalPreview(); else renderArtifactPreview(artifacts, previewOpenKeys.at(-1)); });
    wrap.append(tab, close); tabs.append(wrap);
  }
  if (selected) show(selected, open.indexOf(selected));
  else { const empty = node('p'); empty.textContent = '暂无可预览文件。请在对话中查看分析说明。'; content.append(empty); }
}

function appendCodeLine(row, line, python) {
  if (!python) { row.textContent = line || ' '; return; }
  const tokens = /#.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:import|from|as|if|else|elif|for|in|def|return|with|try|except|raise|True|False|None|and|or|not)\b|\b\d+(?:\.\d+)?\b/g;
  let offset = 0;
  for (const match of line.matchAll(tokens)) {
    row.append(document.createTextNode(line.slice(offset, match.index)));
    const value = match[0], span = node('span', value.startsWith('#') ? 'code-comment' : /^["']/.test(value) ? 'code-string' : /^\d/.test(value) ? 'code-number' : 'code-keyword');
    span.textContent = value; row.append(span); offset = match.index + value.length;
  }
  row.append(document.createTextNode(line.slice(offset) || (line ? '' : ' ')));
}

el['preview-expand'].addEventListener('click', () => {
  const expanded = el['empirical-preview'].classList.toggle('is-expanded');
  el['preview-expand'].setAttribute('aria-pressed', String(expanded));
  el['preview-expand'].setAttribute('aria-label', expanded ? '恢复分栏预览' : '展开预览');
});
el['preview-copy'].addEventListener('click', async () => {
  const artifact = previewSelectedArtifact; if (!artifact) return;
  try {
    if (artifact.type === 'image') {
      const bytes = Uint8Array.from(atob(artifact.dataUrl.split(',')[1]), char => char.charCodeAt(0));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
    } else {
      const text = artifact.type === 'table' ? [artifact.table.columns, ...artifact.table.rows].map(row => row.join('\t')).join('\n') : artifact.type === 'paper' ? el['empirical-preview-content'].textContent : artifact.text;
      await navigator.clipboard.writeText(text || '');
    }
    showToast('文件内容已复制');
  } catch (error) { showToast(`复制失败：${error.message}`, true); }
});
async function savePreviewArtifact(reveal) {
  const artifact = previewSelectedArtifact; if (!artifact) return;
  el['preview-open-menu'].open = false;
  try {
    if (artifact.type === 'paper') {
      const result = await window.petAPI.exportWord(activeProject().id, artifact.draft, reveal);
      if (!result.canceled) showToast('Word 文档已导出');
    }
    else {
      const result = await window.petAPI.exportEmpiricalArtifact(activeProject().id, activeConversation().id, artifact.source, reveal);
      if (!result.canceled) showToast('文件已保存');
    }
  } catch (error) { showToast(error.message, true); }
}
el['preview-save'].addEventListener('click', () => void savePreviewArtifact(false));
el['preview-reveal'].addEventListener('click', () => void savePreviewArtifact(true));

function renderProgressCard(progress) {
  const host = el['task-progress-card'];
  if (!TaskProgress.shouldShowCard(progress)) {
    host.hidden = true;
    host.replaceChildren();
    syncProgressCardSpace();
    return;
  }
  host.hidden = false;
  renderTaskProgress(host, progress, false);
  host.querySelector('details').addEventListener('toggle', syncProgressCardSpace);
  syncProgressCardSpace();
}

// —— codex 式执行过程流：实时显示"正在执行哪个任务"，完成的打勾 ——
function handleTaskStatus(payload) {
  if (!streamingDraft || payload?.requestId !== streamingDraft.requestId) return;
  if (payload.stage === 'chat-delta') { handleDraftStream(payload); return; }
  if (payload.stage === 'chat-reset') {
    streamingDraft.content = payload.text || '';
    streamingDraft.reply.textContent = streamingDraft.content;
    return;
  }
  if (streamingDraft.projectId && (streamingDraft.projectId !== activeProject()?.id || streamingDraft.conversationId !== activeConversation()?.id)) return;
  if (['empirical-plan', 'empirical-results'].includes(payload.stage)) { renderEmpiricalPlan(payload.analysisPlan); return; }
  const shouldFollow = el['chat-scroll'].scrollHeight - el['chat-scroll'].scrollTop - el['chat-scroll'].clientHeight < 120;
  if (payload.stage !== 'task-output') {
    streamingDraft.progress = TaskProgress.update(streamingDraft.progress, payload);
    renderProgressCard(streamingDraft.progress);
    streamingDraft.meta.textContent = 'AI 正在处理';
  } else {
    // 非论文正文的任务产出（分析结论/报告）：普通文字展示，独立于论文正文编辑器。
    const body = streamingDraft.assistantMessage.querySelector('.assistant-body');
    let outs = body.querySelector('.task-outputs');
    if (!outs) {
      outs = node('div', 'task-outputs');
      body.insertBefore(outs, body.querySelector('.assistant-reply') || body.querySelector('.assistant-content'));
    }
    const summaryText = payload.role === 'analyst' ? '分析结果报告' : '任务产出';
    const item = node('details', 'task-output');
    item.innerHTML = `<summary>📊 ${escapeHtml(summaryText)}</summary><pre>${escapeHtml(payload.text || '')}</pre>`;
    outs.append(item);
  }
  if (shouldFollow) scrollConversation();
}

// 取出当前落在草稿正文内的非空选区
function currentProseSelection() {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
  const range = selection.getRangeAt(0);
  const text = selection.toString().trim();
  if (!text) return null;
  let nodeEl = range.commonAncestorContainer;
  if (nodeEl.nodeType !== Node.ELEMENT_NODE) nodeEl = nodeEl.parentElement;
  const prose = nodeEl && nodeEl.closest ? nodeEl.closest('.assistant-prose') : null;
  if (!prose) return null;
  if (!prose.contains(range.startContainer) || !prose.contains(range.endContainer)) return null;
  return { prose, range, text, draftId: prose.dataset.draftId || null };
}

function handleTextSelection() {
  const sel = currentProseSelection();
  if (!sel) { hideSkillMenu(); return; }
  const rect = sel.range.getBoundingClientRect();
  if (!rect || (rect.width === 0 && rect.height === 0)) { hideSkillMenu(); return; }
  const menu = ensureSkillMenu();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(rect.left, window.innerWidth - menuRect.width - 12);
  const top = rect.top - menuRect.height - 8;
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
  menu.classList.add('is-open');
}

// 仅对选中段落应用 Skill，替换选区并落盘；失败则回滚原内容
async function applyLocalSkill(operation) {
  const project = activeProject();
  if (!project) return;
  const sel = currentProseSelection();
  if (!sel) { hideSkillMenu(); return; }
  hideSkillMenu();
  const selectedText = sel.text;
  const selectedFragment = document.createElement('div');
  selectedFragment.append(sel.range.cloneContents());
  const selectedHtml = selectedFragment.innerHTML;
  const citationMarks = (selectedText.match(/\[?E\d+\]?/g) || []);
  try {
    const result = await window.petAPI.applySkill(project.id, { draftId: sel.draftId, selectedText, selectedHtml, operation });
    const newHtml = String(result?.content || '').trim();
    if (!newHtml) { showToast('改写失败：未返回内容', true); return; }
    if (citationMarks.length) {
      const kept = citationMarks.filter((mark) => newHtml.includes(mark));
      if (kept.length < citationMarks.length) throw new Error('改写改变了引用标记，已保留原文。');
    }
    const originalHtml = sel.prose.innerHTML;
    const fragment = document.createRange().createContextualFragment(renderPaperHtml(newHtml));
    sel.range.deleteContents();
    sel.range.insertNode(fragment);
    sel.range.collapse(false);
    window.getSelection().removeAllRanges();
    try { await persistLocalEdit(sel); } catch (error) { sel.prose.innerHTML = originalHtml; throw error; }
    showToast('已应用，仅改写选中段落');
  } catch (error) {
    showToast(`改写失败：${error.message}`, true);
  }
}

async function persistLocalEdit(sel) {
  if (!sel.draftId) return;
  const current = activeProject();
  const draft = current?.drafts?.find((item) => item.id === sel.draftId);
  if (!draft) return;
  draft.content = sel.prose.innerHTML;
  await window.petAPI.saveDraft(current.id, draft);
  workspace = await window.petAPI.loadWorkspace();
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

const AGENT_API_LABELS = { planning: '规划 Agent', chat: '对话 Agent', writing: '写作 Agent', analysis: '分析 Agent' };
const AGENT_API_URLS = {
  anthropic: 'https://api.anthropic.com', hunyuan: 'https://api.hunyuan.cloud.tencent.com/v1', custom: 'http://127.0.0.1:8000/v1',
  deepseek: 'https://api.deepseek.com', openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1', zhipu: 'https://open.bigmodel.cn/api/paas/v4',
  moonshot: 'https://api.moonshot.cn/v1', openrouter: 'https://openrouter.ai/api/v1'
};
async function renderAgentApiConfigs() {
  const host = document.getElementById('agent-api-configs');
  if (!host) return;
  const statuses = window.petAPI.getAgentApiStatus ? await window.petAPI.getAgentApiStatus() : {};
  host.replaceChildren();
  for (const [scenario, title] of Object.entries(AGENT_API_LABELS)) {
    const status = statuses[scenario] || {};
    const config = status.config || settings.api.agents?.[scenario] || {};
    const card = node('section', 'agent-api-config');
    card.dataset.scenario = scenario;
    card.innerHTML = '<header><strong>' + title + '</strong><label><input type="checkbox" data-field="enabled" />独立配置</label></header>' +
      '<div class="agent-api-fields"><label>服务商<select data-field="provider">' + Object.entries(PROVIDERS).map(([id, item]) => '<option value="' + id + '">' + item.label + '</option>').join('') + '</select></label>' +
      '<label>模型<input data-field="model" autocomplete="off" /></label><label>接口地址<input data-field="baseUrl" type="url" autocomplete="off" /></label>' +
      '<label>API Key<input data-field="key" type="password" autocomplete="off" spellcheck="false" placeholder="输入新密钥，或留空保留" /></label></div>' +
      '<p class="setting-status" role="status"></p><div class="api-actions"><button type="button" class="secondary-button" data-action="test">测试连接</button><button type="button" class="primary-button" data-action="save">保存配置</button><button type="button" class="secondary-button" data-action="clear">删除独立密钥</button></div>';
    const field = name => card.querySelector('[data-field="' + name + '"]');
    field('enabled').checked = Boolean(config.enabled);
    field('provider').value = config.provider || settings.api.provider || 'deepseek';
    field('baseUrl').value = config.baseUrl || AGENT_API_URLS[field('provider').value];
    field('model').value = config.model || settings.api.scenarios?.[scenario] || settings.api.model || PROVIDERS[field('provider').value].model;
    const updateEnabled = () => { for (const name of ['provider', 'baseUrl', 'model', 'key']) field(name).disabled = !field('enabled').checked; };
    updateEnabled();
    field('enabled').addEventListener('change', updateEnabled);
    field('provider').addEventListener('change', () => {
      field('baseUrl').value = AGENT_API_URLS[field('provider').value];
      field('model').value = PROVIDERS[field('provider').value].model;
      field('key').value = '';
    });
    const message = card.querySelector('.setting-status');
    message.textContent = config.enabled ? status.hasOwnKey ? '独立密钥已加密保存；输入框不会回填密钥。' : status.hasKey ? '使用同一接口的共用密钥。' : '尚未配置此 Agent 的密钥。' : '当前使用共用配置。';
    card.addEventListener('click', async event => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const proposed = { enabled: field('enabled').checked, provider: field('provider').value, baseUrl: field('baseUrl').value.trim(), model: field('model').value.trim() };
      const key = field('key').value.trim();
      const action = button.dataset.action;
      if (action === 'clear' && !proposed.enabled) { message.textContent = '请先启用独立配置，再删除该接口的独立密钥。'; return; }
      const buttons = [...card.querySelectorAll('button')];
      buttons.forEach(item => item.disabled = true);
      try {
        if (action === 'test') {
          message.textContent = '正在测试连接…';
          await window.petAPI.testAgentApi(scenario, proposed, key);
          message.textContent = '连接成功。测试未修改已保存配置。';
        } else {
          await window.petAPI.saveAgentApi(scenario, proposed, action === 'clear' ? '' : key, action === 'clear');
          field('key').value = '';
          settings = await window.petAPI.getSettings();
          await renderAgentApiConfigs();
          showToast(action === 'clear' ? '独立密钥已删除' : title + ' 配置已保存');
        }
      } catch (error) { message.textContent = error.message; }
      finally { buttons.forEach(item => item.disabled = false); }
    });
    host.append(card);
  }
}

async function loadSettingsForm() {
  settings = await window.petAPI.getSettings();
  apiStatus = await window.petAPI.getApiStatus(settings.api.provider);
  el['account-display-name'].value = settings.displayName || '本地用户';
  el['theme-select'].value = settings.theme || 'dark';
  el['accent-select'].value = settings.accent || 'orange';
  el['density-select'].value = settings.density || 'comfortable';
  el['api-provider'].value = settings.api.provider;
  el['api-base-url'].value = settings.api.baseUrl || 'https://api.deepseek.com';
  el['api-model'].value = settings.api.model || PROVIDERS[settings.api.provider]?.model || 'deepseek-chat';
  el['data-runtime-mode'].value = settings.dataEnvironment?.runtimeMode === 'external' ? 'external' : 'bundled';
  el['data-python-path-label'].hidden = el['data-runtime-mode'].value !== 'external';
  if (el['data-python-path']) el['data-python-path'].value = settings.dataEnvironment?.pythonPath || '';
  renderApiProvider();
  await renderAgentApiConfigs();
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
  try {
    const ocr = await window.petAPI.getOcrStatus();
    document.getElementById('ocr-status-detail').textContent = ocr.available ? '中英文 OCR 已就绪 · 本地离线识别' : `OCR 不可用：${ocr.error || (ocr.missing || []).join('、')}`;
  } catch { document.getElementById('ocr-status-detail').textContent = 'OCR 状态检测失败，请重新打开设置。'; }
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
    ...(el['data-python-path'] ? { dataEnvironment: { runtimeMode: el['data-runtime-mode'].value, pythonPath: el['data-python-path'].value.trim() } } : {}),
  };
  await window.petAPI.saveSettings(partial);
  await loadSettingsForm();
  renderAll();
  el['settings-save-status'].textContent = '已保存';
  showToast('设置已保存');
}

function collectApiConfig() {
  return {
    provider: el['api-provider'].value,
    baseUrl: el['api-base-url'].value.trim() || AGENT_API_URLS[el['api-provider'].value],
    model: el['api-model'].value.trim() || PROVIDERS[el['api-provider'].value].model,
  };
}

function renderApiProvider() {
  const providerId = el['api-provider'].value;
  const provider = PROVIDERS[providerId] ?? PROVIDERS.deepseek;
  const baseUrl = el['api-base-url'].value.trim() || 'https://api.deepseek.com';
  el['api-provider-logo'].textContent = provider.logo;
  el['api-provider-name'].textContent = provider.label;
  el['api-provider-description'].textContent = `自配置服务商 · ${baseUrl}`;
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
  const config = collectApiConfig();
  const key = el['api-key'].value.trim();
  el['api-test-button'].disabled = true;
  el['api-status'].textContent = '正在测试连接…';
  try {
    await window.petAPI.testApi(config, key);
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
  const config = collectApiConfig();
  const key = el['api-key'].value.trim();
  if (!key) {
    el['api-status'].textContent = '请填写 API Key 后再保存。';
    return;
  }
  el['api-save-test-button'].disabled = true;
  el['api-status'].textContent = '正在测试密钥…';
  try {
    await window.petAPI.testApi(config, key);
    el['api-status'].textContent = '连接成功，正在安全保存…';
    await window.petAPI.saveApi(config, key);
    settings = await window.petAPI.getSettings();
    apiStatus = await window.petAPI.getApiStatus(config.provider);
    hideApiKey();
    renderApiProvider();
    await renderAgentApiConfigs();
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
  window.petAPI.onTaskStatus?.(handleTaskStatus); // 用可选调用，避免 preload 缺方法时把整个 bindEvents 炸断
  document.addEventListener('mouseup', handleTextSelection);
  document.addEventListener('mousedown', (event) => { if (skillMenu && !skillMenu.contains(event.target)) hideSkillMenu(); });
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
  el['attach-button'].addEventListener('click', () => chooseConversationFiles(false));
  el['attach-folder-button'].addEventListener('click', () => chooseConversationFiles(true));
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
  el['api-provider'].addEventListener('change', () => {
    el['api-base-url'].value = AGENT_API_URLS[el['api-provider'].value];
    el['api-model'].value = PROVIDERS[el['api-provider'].value].model;
    refreshProviderStatus();
  });
  el['data-runtime-mode'].addEventListener('change', () => { el['data-python-path-label'].hidden = el['data-runtime-mode'].value !== 'external'; });
  el['api-base-url'].addEventListener('change', renderApiProvider);
  el['api-test-button'].addEventListener('click', testCurrentApi);
  el['api-save-test-button'].addEventListener('click', saveAndTestApi);
  el['data-environment-test-button']?.addEventListener('click', async () => {
    el['data-environment-test-button'].disabled = true;
    try {
      await window.petAPI.saveSettings({ dataEnvironment: { runtimeMode: el['data-runtime-mode'].value, pythonPath: el['data-python-path'].value.trim() } });
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
  const composer = el['task-input'].closest('.composer');
  composer.addEventListener('dragover', event => { event.preventDefault(); composer.classList.add('is-dragging'); });
  composer.addEventListener('dragleave', () => composer.classList.remove('is-dragging'));
  composer.addEventListener('drop', event => {
    event.preventDefault(); composer.classList.remove('is-dragging');
    const paths = [...event.dataTransfer.files].map(file => window.petAPI.getPathForFile(file)).filter(Boolean);
    if (paths.length) void chooseConversationFiles(false, paths);
  });
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
  renderSuspendedBanner();
  resizeComposer();
  const shouldShowReminder = await window.petAPI.consumeLaunchReminder();
  if (shouldShowReminder) setTimeout(() => el['reminder-dialog'].showModal(), 350);
}

initialize().catch((error) => showToast(error.message, true));
