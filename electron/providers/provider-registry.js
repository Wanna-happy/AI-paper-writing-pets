const { createOpenAIStreamParser } = require('../stream-parser');

const ENDING_PATH = '/chat/completions';

/** 把用户填写的 base_url 规范化成完整请求地址；空值回退到服务商官方地址。 */
function resolveEndpoint(baseUrl, fallbackEndpoint) {
  const ending = fallbackEndpoint?.endsWith('/messages') ? '/messages' : ENDING_PATH;
  const raw = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!raw) return fallbackEndpoint;
  if (!/^https?:\/\//i.test(raw)) return fallbackEndpoint;
  if (ending === '/messages') return raw.endsWith('/messages') ? raw : `${raw.replace(/\/v1$/, '')}/v1/messages`;
  return raw.endsWith(ENDING_PATH) ? raw : `${raw}${ENDING_PATH}`;
}

const DEFAULT_PROVIDERS = {
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', protocol: 'openai-compatible' },
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini', protocol: 'openai-compatible' },
  qwen: { label: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', protocol: 'openai-compatible' },
  zhipu: { label: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', protocol: 'openai-compatible' },
  moonshot: { label: 'Moonshot / Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', protocol: 'openai-compatible' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4.1-mini', protocol: 'openai-compatible' },
  anthropic: { label: 'Claude / Anthropic', endpoint: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-6', protocol: 'anthropic-messages' },
  hunyuan: { label: '腾讯混元 / HY', endpoint: 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions', model: 'hunyuan-turbos-latest', protocol: 'openai-compatible' },
  custom: { label: '自定义 OpenAI 兼容接口', endpoint: 'http://127.0.0.1:8000/v1/chat/completions', model: 'custom-model', protocol: 'openai-compatible' },
};

class AnthropicAdapter {
  constructor(definition) { this.definition = definition; }
  async createResponse(apiKey, messages, options = {}) {
    const endpoint = options.endpoint || this.definition.endpoint;
    require('../agent-api-config').validateApiUrl(endpoint);
    const response = await fetch(endpoint, { method: 'POST', redirect: 'error', signal: options.signal,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: options.model || this.definition.model, max_tokens: options.maxTokens || 8192,
        system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n'),
        messages: messages.filter(m => ['user', 'assistant'].includes(m.role)).map(m => ({ role: m.role, content: m.content })), temperature: options.temperature ?? 0.35 }) });
    if (!response.ok) throw new Error(`Claude API ${response.status}: ${(await response.text()).split(apiKey).join('[REDACTED]').slice(0, 1500)}`);
    const payload = await response.json();
    const content = (payload.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
    if (!content.trim()) throw new Error('Claude 没有返回可用内容。');
    return { content, finishReason: payload.stop_reason, usage: payload.usage };
  }
  async createStream(apiKey, messages, onDelta, options = {}) {
    // Agent execution uses the native pi Anthropic streaming adapter.
    const { createModelLayer, requestModel } = await import('../pi/model-layer.mjs');
    const layer = createModelLayer({ api: { provider: 'anthropic', baseUrl: (options.endpoint || this.definition.endpoint).replace(/\/v1\/messages$/, ''), model: options.model || this.definition.model } });
    return requestModel(layer, { messages, apiKey, onDelta, signal: options.signal, options });
  }
}

class OpenAiCompatibleAdapter {
  constructor(definition) {
    this.definition = definition;
  }

  async createResponse(apiKey, messages, options = {}) {
    const response = await this.fetch(apiKey, messages, options, false);
    const payload = await response.json();
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error(`${this.definition.label} 没有返回可用内容。`);
    return { content, finishReason: payload.choices?.[0]?.finish_reason || null, usage: payload.usage || null };
  }

  async createStream(apiKey, messages, onDelta, options = {}) {
    const response = await this.fetch(apiKey, messages, options, true);
    const contentType = response.headers.get('content-type') || '';
    if (!response.body) throw new Error(`${this.definition.label} 没有返回可读取的数据流。`);
    if (contentType.includes('application/json')) {
      const payload = await response.json();
      const content = payload.choices?.[0]?.message?.content || '';
      if (!content) throw new Error(`${this.definition.label} 没有返回可用内容。`);
      for (const delta of content.match(/[\s\S]{1,20}/g) || [content]) {
        if (options.signal?.aborted) throw new DOMException('Generation canceled', 'AbortError');
        onDelta(delta);
      }
      return { content: content.trim(), finishReason: payload.choices?.[0]?.finish_reason || null, usage: payload.usage || null };
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = createOpenAIStreamParser(onDelta);
    while (true) {
      if (options.signal?.aborted) {
        await reader.cancel();
        throw new DOMException('Generation canceled', 'AbortError');
      }
      const { done, value } = await reader.read();
      parser.push(decoder.decode(value || new Uint8Array(), { stream: !done }));
      if (done) break;
    }
    const content = parser.finish();
    if (!content.trim()) throw new Error(`${this.definition.label} 没有返回可用内容。`);
    return { content: content.trim(), finishReason: parser.getFinishReason(), usage: null };
  }

  async fetch(apiKey, messages, options, stream) {
    const endpoint = options.endpoint || this.definition.endpoint;
    // Lazy import avoids a module cycle with Agent configuration.
    require('../agent-api-config').validateApiUrl(endpoint);
    const model = options.model || this.definition.model;
    let response;
    try {
      response = await fetch(endpoint, {
        redirect: 'error',
        method: 'POST',
        headers: { Authorization: `Bearer ${String(apiKey || '').trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.35,
          max_tokens: options.maxTokens,
          ...(stream ? { stream: true } : {}),
        }),
        signal: options.signal,
      });
    } catch (error) {
      if (error.name === 'AbortError') throw error;
      throw new Error(`无法连接 ${this.definition.label}，请检查网络连接：${error.message}`);
    }
    if (!response.ok) {
      const detail = (await response.text()).split(String(apiKey)).join('[REDACTED]').slice(0, 1500);
      throw new Error(`${this.definition.label} API ${response.status} ${response.statusText}: ${detail}`);
    }
    return response;
  }
}

class ProviderRegistry {
  constructor(definitions = DEFAULT_PROVIDERS) {
    this.definitions = definitions;
    this.adapters = new Map(Object.entries(definitions).map(([id, definition]) => [id, definition.protocol === 'anthropic-messages' ? new AnthropicAdapter(definition) : new OpenAiCompatibleAdapter(definition)]));
  }

  has(id) { return this.adapters.has(id); }
  getDefinition(id) { return this.definitions[id] || this.definitions.deepseek; }
  getAdapter(id) { return this.adapters.get(id) || this.adapters.get('deepseek'); }
  async complete(id, apiKey, messages, options) { return this.getAdapter(id).createResponse(apiKey, messages, options); }
  async stream(id, apiKey, messages, onDelta, options) { return this.getAdapter(id).createStream(apiKey, messages, onDelta, options); }
}

module.exports = { DEFAULT_PROVIDERS, OpenAiCompatibleAdapter, ProviderRegistry, resolveEndpoint };
