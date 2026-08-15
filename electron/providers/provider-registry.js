const { createOpenAIStreamParser } = require('../stream-parser');

const DEFAULT_PROVIDERS = {
  deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', protocol: 'openai-compatible' },
  openai: { label: 'OpenAI', endpoint: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4.1-mini', protocol: 'openai-compatible' },
  qwen: { label: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus', protocol: 'openai-compatible' },
  zhipu: { label: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash', protocol: 'openai-compatible' },
  moonshot: { label: 'Moonshot / Kimi', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k', protocol: 'openai-compatible' },
  openrouter: { label: 'OpenRouter', endpoint: 'https://openrouter.ai/api/v1/chat/completions', model: 'openai/gpt-4.1-mini', protocol: 'openai-compatible' },
};

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
    let response;
    try {
      response = await fetch(this.definition.endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${String(apiKey || '').trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.definition.model,
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
      const detail = await response.text();
      throw new Error(`${this.definition.label} API ${response.status} ${response.statusText}: ${detail}`);
    }
    return response;
  }
}

class ProviderRegistry {
  constructor(definitions = DEFAULT_PROVIDERS) {
    this.definitions = definitions;
    this.adapters = new Map(Object.entries(definitions).map(([id, definition]) => [id, new OpenAiCompatibleAdapter(definition)]));
  }

  has(id) { return this.adapters.has(id); }
  getDefinition(id) { return this.definitions[id] || this.definitions.deepseek; }
  getAdapter(id) { return this.adapters.get(id) || this.adapters.get('deepseek'); }
  async complete(id, apiKey, messages, options) { return this.getAdapter(id).createResponse(apiKey, messages, options); }
  async stream(id, apiKey, messages, onDelta, options) { return this.getAdapter(id).createStream(apiKey, messages, onDelta, options); }
}

module.exports = { DEFAULT_PROVIDERS, OpenAiCompatibleAdapter, ProviderRegistry };
