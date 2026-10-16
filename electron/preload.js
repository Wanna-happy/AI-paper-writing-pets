const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  platform: process.platform,
  showContextMenu: () => ipcRenderer.invoke('show-context-menu'),
  getPetWindowPosition: () => ipcRenderer.invoke('get-pet-window-position'),
  movePetWindow: (position) => ipcRenderer.send('move-pet-window', position),
  endPetWindowDrag: () => ipcRenderer.send('end-pet-window-drag'),
  setPetReaction: (payload) => ipcRenderer.send('set-pet-reaction', payload),
  openWorkspace: () => ipcRenderer.invoke('open-workspace'),
  showPetMode: () => ipcRenderer.invoke('show-pet-mode'),
  hidePet: () => ipcRenderer.invoke('hide-pet'),
  chooseDocumentFiles: () => ipcRenderer.invoke('choose-document-files'),
  chooseConversationFiles: (projectId, folder = false) => ipcRenderer.invoke('choose-conversation-files', projectId, folder),
  importConversationFiles: (projectId, paths) => ipcRenderer.invoke('conversation-files-import', projectId, paths),
  getUploadedFilePreview: (projectId, conversationId, id, page = 1, sheet = 0) => ipcRenderer.invoke('uploaded-file-preview', projectId, conversationId, id, page, sheet),
  previewFileBytes: payload => ipcRenderer.invoke('file-bytes-preview',payload),
  searchFileBytes: payload => ipcRenderer.invoke('file-bytes-search',payload),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  getTurnTrace: (projectId, conversationId, runId) => ipcRenderer.invoke('agent-turn-trace', projectId, conversationId, runId),
  consumeLaunchReminder: () => ipcRenderer.invoke('consume-launch-reminder'),
  saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial),
  getDataEnvironmentStatus: () => ipcRenderer.invoke('data-environment-status'),
  getEmpiricalResultPreview: (projectId, conversationId, revision) => ipcRenderer.invoke('empirical-result-preview', projectId, conversationId, revision),
  updatePlanDocument: (projectId, conversationId, reference, patch) => ipcRenderer.invoke('empirical-plan-document-update', projectId, conversationId, reference, patch),
  writeClipboard: (payload) => ipcRenderer.invoke('clipboard-write', payload),
  exportEmpiricalArtifact: (projectId, conversationId, selection, reveal) => ipcRenderer.invoke('empirical-artifact-export', projectId, conversationId, selection, reveal),
  getOcrStatus: () => ipcRenderer.invoke('ocr-status'),
  getAgentQualitySummary: (projectId) => ipcRenderer.invoke('agent-quality-summary', projectId),
  loadWorkspace: () => ipcRenderer.invoke('workspace-load'),
  createProject: (input) => ipcRenderer.invoke('project-create', input),
  createProjectFromTask: (task) => ipcRenderer.invoke('project-create-from-task', task),
  createConversation: (projectId, input) => ipcRenderer.invoke('conversation-create', projectId, input),
  deleteConversation: (projectId, conversationId) => ipcRenderer.invoke('conversation-delete', projectId, conversationId),
  setActiveConversation: (projectId, conversationId) => ipcRenderer.invoke('conversation-set-active', projectId, conversationId),
  updateProject: (projectId, partial) => ipcRenderer.invoke('project-update', projectId, partial),
  setActiveProject: (projectId) => ipcRenderer.invoke('project-set-active', projectId),
  deleteProject: (projectId) => ipcRenderer.invoke('project-delete', projectId),
  importDocuments: (projectId, paths) => ipcRenderer.invoke('documents-import', projectId, paths),
  removeDocument: (projectId, documentId) => ipcRenderer.invoke('document-remove', projectId, documentId),
  getRagStatus: (projectId) => ipcRenderer.invoke('rag-status', projectId),
  rebuildRag: (projectId) => ipcRenderer.invoke('rag-rebuild', projectId),
  saveDraft: (projectId, draft) => ipcRenderer.invoke('draft-save', projectId, draft),
  getAssembledDraft: projectId=>ipcRenderer.invoke('thesis-preview-assembled',projectId),
  updateDocumentMetadata: (projectId, documentId, partial) => ipcRenderer.invoke('document-metadata-update', projectId, documentId, partial),
  backupProject: projectId => ipcRenderer.invoke('project-backup',projectId),
  restoreProjectBackup: () => ipcRenderer.invoke('project-restore-backup'),
  getPreparationPreview: (projectId, conversationId, id) => ipcRenderer.invoke('preparation-preview', projectId, conversationId, id),
  exportPreparation: (projectId, conversationId, id, reveal) => ipcRenderer.invoke('preparation-export', projectId, conversationId, id, reveal),
  respondAgentInteraction: payload => ipcRenderer.invoke('agent-interaction-respond', payload),
  generateDraft: (projectId, request) => ipcRenderer.invoke('draft-generate', projectId, request),
  cancelDraft: (requestId) => ipcRenderer.invoke('draft-cancel', requestId),
  resumeDraft: (projectId, runId, request) => ipcRenderer.invoke('draft-resume', projectId, runId, request),
  listSuspendedDrafts: (projectId) => ipcRenderer.invoke('agent-suspended-list', projectId),
  applySkill: (projectId, payload) => ipcRenderer.invoke('draft-apply-skill', projectId, payload),
  onDraftStream: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('draft-stream-chunk', listener);
    return () => ipcRenderer.removeListener('draft-stream-chunk', listener);
  },
  onTaskStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('agent-task-status', listener);
    return () => ipcRenderer.removeListener('agent-task-status', listener);
  },
  exportWord: (projectId, draft, reveal) => ipcRenderer.invoke('draft-export-word', projectId, draft, reveal),
  exportAssembledThesis: (projectId) => ipcRenderer.invoke('thesis-export-assembled', projectId),
  getApiStatus: (providerId) => ipcRenderer.invoke('api-status', providerId),
  revealApiKey: (providerId) => ipcRenderer.invoke('api-reveal-key', providerId),
  testApi: (config, apiKey) => ipcRenderer.invoke('api-test', config, apiKey), // config: { provider, baseUrl, model } 或 providerId 字符串
  saveApi: (config, apiKey) => ipcRenderer.invoke('api-save', config, apiKey),
  getAgentApiStatus: () => ipcRenderer.invoke('agent-api-status'),
  saveAgentApi: (scenario, config, key, clearKey = false) => ipcRenderer.invoke('agent-api-save', scenario, config, key, clearKey),
  testAgentApi: (scenario, config, key) => ipcRenderer.invoke('agent-api-test', scenario, config, key),
  onPetChanged: (callback) => {
    const listener = (_event, petId) => callback(petId);
    ipcRenderer.on('pet-changed', listener);
    return () => ipcRenderer.removeListener('pet-changed', listener);
  },
  onPetReaction: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('pet-reaction', listener);
    return () => ipcRenderer.removeListener('pet-reaction', listener);
  },
});
