const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { normalizeAgents } = require('./agent-api-config');

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
    const legacyPetMap = { shiba: 'ember-pup', cat: 'shadow-kit', panda: 'nori', bunny: 'nori', penguin: 'nori' };
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      pet: legacyPetMap[stored.pet] || stored.pet || DEFAULT_SETTINGS.pet,
      api: normalizeApiSettings(stored.api),
      dataEnvironment: { ...DEFAULT_SETTINGS.dataEnvironment, ...(stored.dataEnvironment ?? {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  next.api = normalizeApiSettings(next.api);
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
};
