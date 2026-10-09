const { contextBridge } = require('electron');
const draft = { id: 'd', conversationId: 'c', task: '论文背景', title: '论文背景', mode: 'api', updatedAt: new Date().toISOString(), content: '<h1>研究背景</h1><p>学术写作需要清晰的问题意识[E1]。</p><p>来源对照<sup data-footnote="1">1</sup></p>', citations: ['测试文献'], mappings: ['E1 → 测试文献，第 1 页'], checks: [], evidence: [{ evidenceId: 'E1', documentName: '测试文献', page: 1, text: '这是可回溯的原始证据片段。' }] };
const workspace = { activeProjectId: 'p', projects: [{ id: 'p', title: '界面回归测试', type: '课程论文', domains: ['管理学'], documents: [], drafts: [draft], conversations: [{ id: 'c', title: '写作测试' }], activeConversationId: 'c' }] };
draft.lengthReview = { passed: false, actual: 1474, contract: { label: '900—1200汉字' } };
draft.deliveryStatus = 'needs-revision';
workspace.projects[0].messages = [{ id: 'chat-test', channel: 'chat', conversationId: 'c', task: '告诉我之前做了什么', text: '已生成绪论，分析尚未执行。\n<script>不应被当成HTML执行</script>', createdAt: new Date(Date.now() + 1000).toISOString() }];
const settings = { pet: 'ember-pup', petName: '小焰', api: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' } };
let resolveGeneration;
const agentTestKeys = new Map();
contextBridge.exposeInMainWorld('petAPI', {
  loadWorkspace: async () => workspace, getSettings: async () => settings,
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
  getRagStatus: async () => ({ documents: {}, mode: 'local', totalChunks: 0 }),
  getEmpiricalResultPreview: async () => ({ planId: 'analysis-plan', revision: 1, results: [{ stepId: 'a1', methodId: 'ols', status: 'completed', sampleSize: 128, summary: '合成数据回归', tables: [{ title: '回归表', columns: ['变量', '系数'], rows: [['<script>sentinel</script>', 2]] }], charts: [{ name: 'synthetic.png', dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdeAAAAABJRU5ErkJggg==' }], code: 'print("synthetic")', diagnostics: [], limitations: ['仅测试'] }], errors: [] }),
  listSuspendedDrafts: async () => [{ id: 'r', conversationId: 'c', task: '未完成章节' }],
  consumeLaunchReminder: async () => false,
  onDraftStream: () => {}, onTaskStatus: () => {}, onPetChanged: () => {},
  applySkill: async () => ({ content: '<p>学术写作应以清晰的问题意识展开[E1]。</p>' }),
  saveDraft: async (_, value) => { Object.assign(draft, value); return draft; },
  generateDraft: async () => new Promise(resolve => { resolveGeneration = resolve; }),
  cancelDraft: async () => { resolveGeneration?.({ suspended: true, runId: 'r' }); return { canceled: true }; },
  resumeDraft: async () => ({ suspended: true, runId: 'r' }),
});
