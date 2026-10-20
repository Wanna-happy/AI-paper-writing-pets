const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { normalizeAgents } = require('./agent-api-config');
const { DEFAULT_PERMISSIONS, normalizePermissions } = require('./permission-policy');
const { DEFAULT_FORMATTING, normalizeFormatting } = require('./document-formatting');

const DEFAULT_SETTINGS = {
  pet: 'ember-pup',
  petName: '小焰',
  displayName: '本地用户',
  theme: 'dark',
  accent: 'orange',
  density: 'comfortable',
  defaultLanguage: '中文',
  outputLanguageMode: 'follow-request-chinese-default',
  defaultCitation: 'GB/T 7714',
  writingStyle: 'rigorous',
  permissions: { ...DEFAULT_PERMISSIONS },
  documentFormatting:{...DEFAULT_FORMATTING},
  alwaysOnTop: false,
  petPosition: null,
  soundEnabled: true,
  voiceEnabled: true,
  doNotDisturb: false,
  petVisible: true,
  api: {
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    keyMode: 'encrypted',
    scenarios: {
      writing: 'deepseek-chat',
      planning: 'deepseek-chat',
      analysis: 'deepseek-chat',
    },
  },
  dataEnvironment: {
    runtimeMode: 'bundled',
    pythonPath: '',
    networkEnabled: false,
  },
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function normalizeApiSettings(raw = {}) {
  return {
    provider: raw.provider || DEFAULT_SETTINGS.api.provider,
    baseUrl: raw.baseUrl || DEFAULT_SETTINGS.api.baseUrl,
    model: raw.model || DEFAULT_SETTINGS.api.model,
    keyMode: raw.keyMode === 'session' ? 'session' : 'encrypted',
    scenarios: Object.fromEntries(['writing', 'planning', 'analysis', 'chat'].map(name => [name,
      String(raw.scenarios?.[name] || DEFAULT_SETTINGS.api.scenarios[name] || raw.scenarios?.writing || DEFAULT_SETTINGS.api.model)])),
    agents: normalizeAgents(raw.agents),
  };
}

function loadSettings() {
  try {
    const raw = fs.readFileSync(getSettingsPath(), 'utf8');
    const stored = JSON.parse(raw);
    const permissions=normalizePermissions(stored.permissions,stored.dataEnvironment);
    const legacyPetMap = { shiba: 'ember-pup', cat: 'shadow-kit', panda: 'nori', bunny: 'nori', penguin: 'nori' };
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      pet: legacyPetMap[stored.pet] || stored.pet || DEFAULT_SETTINGS.pet,
      api: normalizeApiSettings(stored.api),
      permissions,
      documentFormatting:normalizeFormatting(stored.documentFormatting),
      dataEnvironment: { ...DEFAULT_SETTINGS.dataEnvironment, ...(stored.dataEnvironment ?? {}), networkEnabled: permissions.sandboxNetwork },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(partial) {
  const current = loadSettings();
  const next = { ...current, ...partial };
  next.api = normalizeApiSettings(next.api);
  next.dataEnvironment = { ...current.dataEnvironment, ...(partial.dataEnvironment || {}), networkEnabled: (partial.dataEnvironment?.networkEnabled ?? current.dataEnvironment.networkEnabled) === true };
  next.permissions=normalizePermissions({...current.permissions,...(partial.permissions||{}),...(partial.dataEnvironment?.networkEnabled!==undefined?{sandboxNetwork:partial.dataEnvironment.networkEnabled}: {})},next.dataEnvironment);
  next.dataEnvironment.networkEnabled=next.permissions.sandboxNetwork;
  next.documentFormatting=normalizeFormatting({...current.documentFormatting,...(partial.documentFormatting||{})});
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
};
