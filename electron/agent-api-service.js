const { SCENARIOS, normalizeAgent, keySlot, resolveAgentKey, resolveAgentConfig } = require('./agent-api-config');
const { DEFAULT_PROVIDERS, resolveEndpoint } = require('./providers/provider-registry');
function createAgentApiService({ store, loadSettings, saveSettings, providerRegistry }) {
  const validate = scenario => { if (!SCENARIOS.includes(scenario)) throw new Error('未知的 Agent'); };
  function status() {
    const settings = loadSettings();
    return Object.fromEntries(SCENARIOS.map(scenario => {
      const config = resolveAgentConfig(settings, scenario);
      return [scenario, { config, hasKey: Boolean(resolveAgentKey(store, settings, scenario)),
        hasOwnKey: Boolean(config.enabled && store.getApiKey('encrypted', keySlot(config, scenario))) }];
    }));
  }
  async function test(scenario, raw, inputKey = '') {
    validate(scenario);
    const config = normalizeAgent(raw);
    const settings = loadSettings();
    const proposed = { ...settings, api: { ...settings.api, agents: { ...settings.api.agents, [scenario]: config } } };
    const resolved = resolveAgentConfig(proposed, scenario);
    const key = String(inputKey || resolveAgentKey(store, proposed, scenario)).trim();
    if (!key) throw new Error('请填写此 Agent 的 API Key；不同服务商或接口地址不能继承共用密钥。');
    await providerRegistry.complete(resolved.provider, key, [{ role: 'user', content: '只回复：连接成功' }], {
      endpoint: resolveEndpoint(resolved.baseUrl, DEFAULT_PROVIDERS[resolved.provider].endpoint), model: resolved.model, temperature: 0, maxTokens: 8,
    });
    return { ok: true };
  }
  function save(scenario, raw, inputKey = '', clearKey = false) {
    validate(scenario);
    const config = normalizeAgent(raw);
    if (config.enabled) {
      const slot = keySlot(config, scenario);
      if (clearKey) store.setApiKey('', 'encrypted', slot);
      else if (String(inputKey).trim()) store.setApiKey(String(inputKey).trim(), 'encrypted', slot);
    }
    const settings = loadSettings();
    saveSettings({ api: { ...settings.api, agents: { ...settings.api.agents, [scenario]: config } } });
    return status();
  }
  return { status, test, save };
}
module.exports = { createAgentApiService };
