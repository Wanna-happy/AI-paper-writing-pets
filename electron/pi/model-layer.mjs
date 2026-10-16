// model-layer.mjs — 基于 @earendil-works/pi-ai 的模型层桥接
//
// 职责：把现有 settings.api（单 base_url + 单 Key + 场景模型）映射成 pi-ai 的 Models 集合。
// 对外暴露与现有 requestModel({scenario, messages, options}) 兼容的接口（返回 {content}），
// 这样现有 code-analysis.js / planner 等调用方无需改动签名即可迁移到 pi。
//
// 注意：pi 是 ESM/TypeScript 包，本文件用 .mjs；调用方（现有 CJS 代码）通过
//   const ml = await import('../pi/model-layer.mjs');
// 动态引入即可，无需把整个 electron/ 改成 ESM。

import agentApiConfig from '../agent-api-config.js';
import contextPolicy from '../agent/context-policy.js';
import transport from '../providers/api-transport.js';
import { createModels, createProvider } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import { anthropicMessagesApi } from '@earendil-works/pi-ai/api/anthropic-messages.lazy';

const SCENARIO_DEFAULTS = {
  writing: 'deepseek-chat',
  planning: 'deepseek-chat',
  analysis: 'deepseek-chat',
};

function normalizeBaseUrl(baseUrl) {
  let raw = String(baseUrl || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  raw = agentApiConfig.validateApiUrl(raw);
  // 用户可能直接粘贴完整端点（如 https://api.deepseek.com/chat/completions）；
  // pi 的 openAICompletionsApi 会自己在 baseUrl 后拼 /chat/completions，这里必须剥掉这段尾巴，
  // 否则最终请求会变成 .../chat/completions/v1/chat/completions，模型调用必然失败。
  raw = raw.replace(/\/chat\/completions$/i, '');
  // pi 需要"到 /v1 为止"的 base；与旧 provider 层的填写习惯兼容。
  return new URL(raw).pathname === '/' ? `${raw}/v1` : raw;
}

// DeepSeek 是 OpenAI 兼容协议；用 pi 的自定义 provider 把 settings 里的 base_url 注册成一个 provider。
// 关键：pi 构造请求用的是 model.baseUrl（createClient: baseURL: model.baseUrl），
// 所以 baseUrl 必须挂在每个 model 上——只挂在 provider 上 pi 拿不到，会静默发不出请求返回空。
function makeModel(providerId, modelId, baseUrl, anthropic = false) {
  return {
    id: modelId,
    name: modelId,
    provider: providerId,
    api: anthropic ? 'anthropic-messages' : 'openai-completions',
    baseUrl,
    reasoning: false,
    input: ['text'],
    output: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
  };
}

export function createModelLayer(settings = {}) {
  const configs = Object.fromEntries(agentApiConfig.SCENARIOS.map(scenario => [scenario, agentApiConfig.resolveAgentConfig(settings, scenario)]));
  const models = createModels();
  const mappings = {};
  for (const [scenario, config] of Object.entries(configs)) {
    if (config.provider === 'custom') throw new Error('本期已停用自定义中转站接口，请在 AI 配置选择受支持的服务商。');
    const anthropic = config.provider === 'anthropic';
    const base = url => anthropic ? agentApiConfig.validateApiUrl(url).replace(/\/v1(?:\/messages)?$/, '') : normalizeBaseUrl(url);
    const providerId = config.enabled ? 'agent-' + scenario : config.provider;
    mappings[scenario] = { providerId, model: config.model };
    const existing = models.getModel(providerId, config.model);
    if (existing) continue;
    const providerModels = Object.entries(configs).filter(([name, item]) => (item.enabled ? 'agent-' + name : item.provider) === providerId)
      .map(([, item]) => makeModel(providerId, item.model, base(item.baseUrl), anthropic));
    models.setProvider(createProvider({ id: providerId, name: config.provider, baseUrl: base(config.baseUrl),
      auth: { apiKey: { name: config.provider, resolve: async () => ({ auth: {} }) } },
      models: [...new Map(providerModels.map(model => [model.id, model])).values()], api: anthropic ? anthropicMessagesApi() : openAICompletionsApi() }));
  }
  return {
    fetch: transport.apiFetch,
    models, scenarios: Object.fromEntries(Object.entries(configs).map(([scenario, config]) => [scenario, config.model])),
    defaultModel: configs.writing.model,
    scenarioModel(scenario) { return (mappings[scenario] || mappings.writing).model; },
    getModel(scenario) {
      const config = mappings[scenario] || mappings.writing;
      const model = models.getModel(config.providerId, config.model);
      if (!model) throw new Error('未找到 Agent 模型配置');
      return model;
    },
  };
}

// 把现有 {role, content} 消息映射成 pi 的 Context：system 合并进 systemPrompt，
// user/assistant 转成带 timestamp 的消息。pi 不接收 role:'system' 的消息。
function toPiMessages(messages = []) {
  let systemPrompt = '';
  const piMessages = [];
  for (const msg of messages) {
    const role = msg.role || 'user';
    const content = typeof msg.content === 'string' ? msg.content : (msg.content || '');
    if (role === 'system') {
      systemPrompt += (systemPrompt ? '\n\n' : '') + content;
    } else if (role === 'user' || role === 'assistant') {
      piMessages.push({ role, content, timestamp: Date.now() });
    }
  }
  return { systemPrompt, piMessages };
}

function extractDelta(event) {
  if (!event) return '';
  if (typeof event.delta === 'string') return event.delta;
  const inner = event.assistantMessageEvent;
  if (inner && typeof inner.delta === 'string') return inner.delta;
  return '';
}

// pi 的 AssistantMessage.content 是内容块数组（[{type:'text',text}]），
// 这里统一拍平为字符串，避免调用方拿到 [object Object]。
function contentToString(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((block) => (block && typeof block.text === 'string' ? block.text : '')).join('');
  return String(content);
}

function requireComplete(final, signal) {
  signal?.throwIfAborted();
  if (final?.stopReason === 'aborted') throw new DOMException('模型响应已中断。', 'AbortError');
  if (final?.stopReason === 'length') {
    const error = new Error('模型本次输出达到长度上限，尚未完成。');
    error.code = 'MODEL_OUTPUT_TRUNCATED';
    error.partialContent = contentToString(final?.content);
    throw error;
  }
  if (final?.stopReason !== 'stop') throw new Error(`模型响应未正常完成。${final?.errorMessage || ''}`);
}

// 与现有 requestModel 兼容：返回 {content}（字符串）。支持 onDelta 流式。
export async function requestModel(layer, { scenario = 'writing', messages = [], options = {}, onDelta = null, signal = null, apiKey = '' } = {}) {
  const model = layer.getModel(scenario);
  const { systemPrompt, piMessages } = toPiMessages(messages);
  const context = contextPolicy.boundTranscript({ systemPrompt, messages: piMessages, tools: [] }, model);
  apiKey = layer.getApiKey ? layer.getApiKey(scenario) : apiKey;
  if (layer.getApiKey && !apiKey) throw new Error(`请配置 ${scenario} Agent 的 API Key。`);
  const callOptions = { fetch: layer.fetch, ...options, apiKey, signal };

  if (onDelta) {
    const stream = layer.models.stream(model, context, callOptions);
    let content = '';
    for await (const event of stream) {
      const delta = extractDelta(event);
      if (delta) {
        content += delta;
        onDelta(delta);
      }
    }
    requireComplete(await stream.result(), signal);
    return { content };
  }
  const final = await layer.models.complete(model, context, callOptions);
  requireComplete(final, signal);
  return { content: contentToString(final?.content) };
}
