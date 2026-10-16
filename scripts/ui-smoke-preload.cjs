const { contextBridge,ipcRenderer } = require('electron');
const nativeFixture = name => { const fs = require('node:fs'), path = require('node:path'); const latest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../.ui-smoke/native-office-latest.json'), 'utf8')); return fs.readFileSync(name === 'word' ? latest.word : name === 'excel' ? latest.excel : path.join(latest.root, name)); };
const nativeDocxFixture = () => ({ name: '完整格式.docx', type: 'docx', readOnly: true, dataBase64: nativeFixture('word').toString('base64') });
const nativeExcelFixture = (sheet,format='.xlsx') => ({name: '完整格式'+format,format,type: 'spreadsheet', readOnly: true, dataBase64: (format==='.csv'?Buffer.from('变量,百分比\n生育率,12.35%'):nativeFixture(format==='.xls'?'layout.xls':'excel')).toString('base64'),sheet});
const draft = { id: 'd', conversationId: 'c', task: '论文背景', title: '论文背景', mode: 'api', updatedAt: new Date().toISOString(), content: '<h1>研究背景</h1><p>学术写作需要清晰的问题意识[E1]。</p><p>来源对照<sup data-footnote="1">1</sup></p>', citations: ['测试文献'], mappings: ['E1 → 测试文献，第 1 页'], checks: [], evidence: [{ evidenceId: 'E1', documentName: '测试文献', page: 1, text: '这是可回溯的原始证据片段。' }] };
const workspace = { activeProjectId: 'p', projects: [{ id: 'p', title: '界面回归测试', type: '课程论文', domains: ['管理学'], documents: [], drafts: [draft], conversations: [{ id: 'c', title: '写作测试' }], activeConversationId: 'c' }] };
draft.lengthReview = { passed: false, actual: 1474, contract: { label: '900—1200汉字' } };
draft.deliveryStatus = 'needs-revision';
workspace.projects[0].messages = [{ id: 'chat-test', channel: 'chat', conversationId: 'c', task: '告诉我之前做了什么', text: '已生成绪论，分析尚未执行。\n<script>不应被当成HTML执行</script>', commentary: ['我先核对已有工作。'], activitySteps: ['已读取当前项目记录'], createdAt: new Date(Date.now() + 1000).toISOString() }];
const settings = { pet: 'ember-pup', petName: '小焰', api: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' } };
let resolveGeneration;
const agentTestKeys = new Map();
const interactionResponses = [];
const resumeRequests = [];
let resumeError = '';
contextBridge.exposeInMainWorld('petAPI', {
  previewFileBytes: payload=>ipcRenderer.invoke('file-bytes-preview',payload),
  searchFileBytes: payload=>ipcRenderer.invoke('file-bytes-search',payload),
  getResumeRequests: async () => resumeRequests,
  listApiModels: async () => ['gateway-model-a', 'gateway-model-b'],
  getUploadedFilePreview: async (_project, _conversation, id, page = 1, sheet = 0) => process.argv.includes('--real-upload-ipc') ? ipcRenderer.invoke('uploaded-file-preview',_project,_conversation,id,page,sheet) : id === 'real-docx' ? nativeDocxFixture() : ['real-excel','real-xls','real-csv'].includes(id) ? nativeExcelFixture(sheet,id==='real-xls'?'.xls':id==='real-csv'?'.csv':'.xlsx') : id === 'native-preview' ? ({ name: '原版式文档.docx', readOnly: true, type: 'document', page, totalPages: 5, sheet, sheets: ['SheetOne', 'SheetTwo'], dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdeAAAAABJRU5ErkJggg==', note: '原版式只读预览' }) : ({ name: id + '.docx', readOnly: true, type: 'text', text: '原始上传内容，仅供阅读。' }),
  getTurnTrace: async (_project, _conversation, runId) => runId === 'restore-old' ? { durationMs: 338000, timeline: [{ type: 'commentary', text: '已从原运行记录恢复的过程。' }, { type: 'tool', toolName: 'run_data_analysis', toolCallId: 'actual', state: 'completed', detail: { code: 'print("RECORDED_ACTUAL_CODE")' } }] } : null,
  setResumeError: async value => { resumeError = value; },
  respondAgentInteraction: async payload => { interactionResponses.push(payload); return { accepted: true }; },
  getInteractionResponses: async () => interactionResponses,
  getPreparationPreview: async () => ({ name: '清洗后的分析数据.csv', text: 'x,y\n1,2\n' }),
  exportPreparation: async () => ({ canceled: true }),
  loadWorkspace: async () => workspace, getSettings: async () => settings,
  addTestProject: async project=>{workspace.projects.push(project);return workspace;},
  setActiveProject: async id=>{if(!workspace.projects.some(p=>p.id===id))throw new Error('项目不存在');workspace.activeProjectId=id;return workspace;},
  setActiveConversation: async (projectId,id)=>{const project=workspace.projects.find(p=>p.id===projectId);if(!project?.conversations.some(c=>c.id===id))throw new Error('对话不存在');project.activeConversationId=id;return workspace;},
  updateProject: async (projectId, patch) => { const project = workspace.projects.find(item => item.id === projectId); if (!project) throw new Error('project not found'); Object.assign(project, patch); return project; },
  updatePlanDocument: async (projectId, conversationId, reference, patch) => {
    const plan = { id: reference.id, revision: reference.revision + 1, status: 'pending-confirmation', ...patch, attachment: { name: 'data.csv' }, documentChanges: [{ name: '研究问题', before: '原问题', after: patch.researchQuestion }] };
    workspace.projects[0].empiricalPlans = { [conversationId]: plan };
    return { plan, changes: plan.documentChanges };
  },
  chooseConversationFiles: async (projectId, folder) => {
    if (projectId !== 'p' || !folder) throw new Error('未传递项目或文件夹选择模式');
    const attachment = { id: 'folder-csv', name: 'nested/data.csv', projectId, extension: '.csv', size: 20, scope: 'project', kind: 'data' };
    workspace.projects[0].projectFiles = [attachment];
    workspace.projects[0].documents.push({ ...attachment, status: 'data' });
    return { attachments: [attachment], rejected: [], state: workspace };
  },
  getApiStatus: async () => ({ hasKey: true }),
  getAgentApiStatus: async () => Object.fromEntries(['planning', 'chat', 'writing', 'analysis'].map(scenario => [scenario, {
    config: settings.api.agents?.[scenario]?.enabled ? settings.api.agents[scenario] : { enabled: false, provider: settings.api.provider, baseUrl: settings.api.baseUrl, model: settings.api.model },
    hasKey: true, hasOwnKey: agentTestKeys.has(scenario),
  }])),
  saveAgentApi: async (scenario, config, key, clear) => {
    settings.api.agents ||= {};
    settings.api.agents[scenario] = config;
    if (clear) agentTestKeys.delete(scenario); else if (key) agentTestKeys.set(scenario, key);
    return { ok: true };
  },
  testAgentApi: async () => ({ ok: true }),
  testApi: async () => ({ ok: true }),
  saveApi: async config => { settings.api = { ...settings.api, ...config }; return { settings, hasKey: true }; },
  getDataEnvironmentStatus: async () => ({ ready: true, source: 'bundled', python: 'Python', version: '3.14.8', packages: {} }),
  getOcrStatus: async () => ({ available: true, languages: ['chi_sim', 'eng'], missing: [] }),
  exportEmpiricalArtifact: async () => ({ canceled: true }),
  writeClipboard: async payload => { if (!payload || (!payload.text && !payload.dataUrl)) throw new Error('empty clipboard'); return { ok: true }; },
  getRagStatus: async () => ({ documents: {}, mode: 'local', totalChunks: 0 }),
  getEmpiricalResultPreview: async () => ({ planId: 'analysis-plan', revision: 1, results: [{ stepId: 'a1', methodId: 'ols', status: 'completed', sampleSize: 128, summary: '合成数据回归', tables: [{ title: '回归表', columns: ['变量', '系数'], rows: [['<script>sentinel</script>', 2]] }], charts: [{ name: 'synthetic.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdeAAAAABJRU5ErkJggg==' }], code: 'print("synthetic")', diagnostics: [], limitations: ['仅测试'] }], errors: [] }),
  listSuspendedDrafts: async () => [{ id: 'r', conversationId: 'c', task: '未完成章节' }],
  consumeLaunchReminder: async () => false,
  onDraftStream: () => {}, onTaskStatus: () => {}, onPetChanged: () => {},
  applySkill: async (_, input) => ({ content: '<p>学术写作应以清晰的问题意识展开[E1]。</p>', comparison: { before: input.selectedHtml || input.selectedText, after: '<p>学术写作应以清晰的问题意识展开[E1]。</p>' } }),
  saveDraft: async (_, value) => { if(value.expectedContent!==undefined&&value.expectedContent!==draft.content)throw new Error('稿件已被其他操作修改');const {history:_history,expectedContent,...next}=value;const snapshot=({...draft});delete snapshot.history;const history=[...(draft.history||[snapshot])];Object.assign(draft,next);const current={...draft};delete current.history;history.push(current);draft.history=history;return draft; },
  updateDocumentMetadata: async (projectId,id,partial)=>{const document=workspace.projects.find(p=>p.id===projectId)?.documents.find(d=>d.id===id);if(!document)throw new Error('资料不存在');Object.assign(document,partial);return document;},
  generateDraft: async () => new Promise(resolve => { resolveGeneration = resolve; }),
  cancelDraft: async () => { resolveGeneration?.({ suspended: true, runId: 'r' }); return { canceled: true }; },
  resumeDraft: async (...args) => { resumeRequests.push(args); if (resumeError) throw new Error(resumeError); return { suspended: true, runId: 'r' }; },
});
