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
  chooseConversationFiles: () => ipcRenderer.invoke('choose-conversation-files'),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  consumeLaunchReminder: () => ipcRenderer.invoke('consume-launch-reminder'),
  saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial),
  getDataEnvironmentStatus: () => ipcRenderer.invoke('data-environment-status'),
  getOcrStatus: () => ipcRenderer.invoke('ocr-status'),
  getAgentQualitySummary: (projectId) => ipcRenderer.invoke('agent-quality-summary', projectId),
  loadWorkspace: () => ipcRenderer.invoke('workspace-load'),
  createProject: (input) => ipcRenderer.invoke('project-create', input),
  createProjectFromTask: (task) => ipcRenderer.invoke('project-create-from-task', task),
  createConversation: (projectId, input) => ipcRenderer.invoke('conversation-create', projectId, input),
  setActiveConversation: (projectId, conversationId) => ipcRenderer.invoke('conversation-set-active', projectId, conversationId),
  updateProject: (projectId, partial) => ipcRenderer.invoke('project-update', projectId, partial),
  setActiveProject: (projectId) => ipcRenderer.invoke('project-set-active', projectId),
  deleteProject: (projectId) => ipcRenderer.invoke('project-delete', projectId),
  importDocuments: (projectId, paths) => ipcRenderer.invoke('documents-import', projectId, paths),
  removeDocument: (projectId, documentId) => ipcRenderer.invoke('document-remove', projectId, documentId),
  getRagStatus: (projectId) => ipcRenderer.invoke('rag-status', projectId),
  rebuildRag: (projectId) => ipcRenderer.invoke('rag-rebuild', projectId),
  saveDraft: (projectId, draft) => ipcRenderer.invoke('draft-save', projectId, draft),
  generateDraft: (projectId, request) => ipcRenderer.invoke('draft-generate', projectId, request),
  cancelDraft: (requestId) => ipcRenderer.invoke('draft-cancel', requestId),
  onDraftStream: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('draft-stream-chunk', listener);
    return () => ipcRenderer.removeListener('draft-stream-chunk', listener);
  },
  exportWord: (projectId, draft) => ipcRenderer.invoke('draft-export-word', projectId, draft),
  exportAssembledThesis: (projectId) => ipcRenderer.invoke('thesis-export-assembled', projectId),
  getApiStatus: (providerId) => ipcRenderer.invoke('api-status', providerId),
  revealApiKey: (providerId) => ipcRenderer.invoke('api-reveal-key', providerId),
  testApi: (providerId, apiKey) => ipcRenderer.invoke('api-test', providerId, apiKey),
  saveApi: (config, apiKey) => ipcRenderer.invoke('api-save', config, apiKey),
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
