const crypto = require('node:crypto');
const { DEFAULT_PROVIDERS } = require('./providers/provider-registry');
const SCENARIOS = ['planning', 'chat', 'writing', 'analysis'];

function validateApiUrl(value) {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) {
    throw new Error('接口地址须使用 HTTPS；仅本机 localhost 可使用 HTTP，地址不能包含账号、密码或查询参数。');
  }
  return url.href.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
}
function normalizeAgent(raw) {
  if (!raw?.enabled) return { enabled: false };
  const provider = String(raw.provider || 'deepseek');
  if (!DEFAULT_PROVIDERS[provider]) throw new Error('未知的 AI 服务商');
  const baseUrl = validateApiUrl(raw.baseUrl || DEFAULT_PROVIDERS[provider].endpoint);
  const model = String(raw.model || DEFAULT_PROVIDERS[provider].model).trim();
  if (!model || model.length > 200 || /[\r\n]/.test(model)) throw new Error('模型名称无效');
  return { enabled: true, provider, baseUrl, model };
}
function normalizeAgents(raw = {}) {
  return Object.fromEntries(SCENARIOS.map(scenario => [scenario, normalizeAgent(raw[scenario])]));
}
function resolveAgentConfig(settings, scenario = 'writing') {
  if (!SCENARIOS.includes(scenario)) throw new Error('未知的 Agent 场景');
  const api = settings.api || {};
  const override = normalizeAgent(api.agents?.[scenario]);
  if (override.enabled) return override;
  const provider = api.provider || 'deepseek';
  if (!DEFAULT_PROVIDERS[provider]) throw new Error('未知的 AI 服务商');
  return { enabled: false, provider, baseUrl: validateApiUrl(api.baseUrl || DEFAULT_PROVIDERS[provider].endpoint),
    model: api.scenarios?.[scenario] || (scenario === 'chat' ? api.scenarios?.writing : null) || api.model || DEFAULT_PROVIDERS[provider].model };
}
function keySlot(config, scenario) {
  const digest = crypto.createHash('sha256').update(`${config.provider}\n${config.baseUrl}`).digest('hex').slice(0, 24);
  return `agent-${scenario}-${digest}`;
}
function resolveAgentKey(store, settings, scenario) {
  const config = resolveAgentConfig(settings, scenario);
  if (config.enabled) {
    const key = store.getApiKey('encrypted', keySlot(config, scenario));
    if (key) return key;
    const common = resolveAgentConfig({ api: { ...settings.api, agents: {} } }, scenario);
    // Never forward the shared credential to another provider or endpoint.
    if (common.provider !== config.provider || common.baseUrl !== config.baseUrl) return '';
  }
  return store.getApiKey(settings.api?.keyMode || 'encrypted', config.provider);
}
module.exports = { SCENARIOS, validateApiUrl, normalizeAgent, normalizeAgents, resolveAgentConfig, keySlot, resolveAgentKey };
