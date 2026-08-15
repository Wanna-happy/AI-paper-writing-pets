const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
  },
  dataEnvironment: {
    pythonPath: '',
  },
};

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
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
      api: { ...DEFAULT_SETTINGS.api, ...(stored.api ?? {}) },
      dataEnvironment: { ...DEFAULT_SETTINGS.dataEnvironment, ...(stored.dataEnvironment ?? {}) },
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(partial) {
  const next = { ...loadSettings(), ...partial };
  fs.mkdirSync(path.dirname(getSettingsPath()), { recursive: true });
  fs.writeFileSync(getSettingsPath(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
};
