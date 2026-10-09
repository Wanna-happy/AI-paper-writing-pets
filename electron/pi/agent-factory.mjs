// agent-factory.mjs — 基于 @earendil-works/pi-agent-core 的角色 Agent 工厂
//
// 每个"角色"（analyst 分析 / writer 写作）都是一个 pi Agent 实例：
//   - 自带 systemPrompt（含 skill 拼装后的规则）
//   - 自带 tools（如 run_data_analysis、RAG 检索、读文件）
//   - 自带 scenario 模型（分析用 analysis、写作用 writing，天然支持不同角色不同模型）
// Agent 自己跑"调模型 → 解析工具调用 → 执行 → 回填 → 再调模型"的循环。
//
// 这层是 harness 的 [L1]。它不负责"先分析还是先写"的编排——那是 [L2] Planner / RunEngine 的事。

import { Agent } from '@earendil-works/pi-agent-core';
import { Type } from '@earendil-works/pi-ai';

// 把一个简单的 execute(params) -> string 适配成 pi 的 AgentTool。
// pi 工具要求 execute(toolCallId, params, signal, onUpdate) -> { content:[{type:'text',text}], details }，
// 且出错要 throw（pi 会作为 isError 工具错误回灌给模型）。这里统一封装。
export function wrapTool({ name, label, description, parameters, execute }) {
  return {
    name,
    label: label || name,
    description,
    parameters: parameters || Type.Object({}),
    executionMode: 'sequential',
    execute: async (toolCallId, params, signal, onUpdate) => {
      const text = await execute(params, { signal, onUpdate });
      return {
        content: [{ type: 'text', text: String(text) }],
        details: {},
      };
    },
  };
}

// 构造一个角色 Agent。
// apiKey：真实调用时透传（来自 safeStorage 解密），注入到每次请求的 options，
// 覆盖 provider 里占位用的空 auth，避免把密钥写死进 provider 定义。faux 测试可省略。
export function createRoleAgent({ layer, role, systemPrompt, tools = [], scenario = 'writing', apiKey = '' }) {
  apiKey = layer.getApiKey ? layer.getApiKey(scenario) : apiKey;
  if (layer.getApiKey && !apiKey) throw new Error(`请配置 ${scenario} Agent 的 API Key，或配置可继承的共用密钥。`);
  const streamFn = apiKey
    ? (model, context, options) => layer.models.streamSimple(model, context, { ...(options || {}), apiKey })
    : layer.models.streamSimple.bind(layer.models);
  const agent = new Agent({
    initialState: {
      systemPrompt,
      model: layer.getModel(scenario),
    },
    // streamSimple 是 pi 提供的简化流式入口，Agent 类用它驱动循环。
    streamFn,
  });
  agent.state.tools = tools;
  agent.role = role;
  return agent;
}

// 运行一个角色 Agent，返回它最终产出的文本。onDelta 可接流式增量。
// pi may finish its loop without throwing on a failed or truncated response.
// Validate the terminal message; even nonempty partial output is not success.
export async function runAgent(agent, message, { onDelta = null, onTextReset = null, signal = null } = {}) {
  let finalMessage = null;
  let hasToolCall = false;
  signal?.throwIfAborted();
  const abort = () => agent.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const unsubscribe = agent.subscribe((event) => {
    if (event?.type === 'message_start' && event.message?.role === 'assistant') {
      hasToolCall = false;
      onTextReset?.();
    }
    if (event?.type === 'message_update' && event.assistantMessageEvent?.type === 'toolcall_start') {
      hasToolCall = true;
      onTextReset?.();
    }
    if (event?.type === 'message_update' && event.assistantMessageEvent?.type === 'text_delta') {
      const delta = event.assistantMessageEvent.delta;
      if (delta && !hasToolCall) onDelta?.(delta);
    }
    if (event?.type === 'message_end' && event.message?.role === 'assistant') {
      finalMessage = event.message;
      if (finalMessage.content?.some(block => block.type === 'toolCall')) onTextReset?.();
    }
  });
  try {
    await agent.prompt(message);
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener('abort', abort);
    unsubscribe();
  }
  const reason = finalMessage?.stopReason;
  if (reason === 'aborted') throw new DOMException('模型响应已中断，未保存完成稿。', 'AbortError');
  if (reason === 'length') throw new Error('模型响应达到长度上限，正文尚未完成，未保存完成稿。请缩小本次写作范围后重试。');
  if (reason !== 'stop' || agent.state.errorMessage) {
    throw new Error(`模型响应未正常完成，未保存完成稿。${finalMessage?.errorMessage || agent.state.errorMessage || ''}`);
  }
  // Only the final successful assistant turn is a deliverable. Text preceding
  // tool calls is provisional progress and must never be merged into the paper.
  const content = (finalMessage.content || []).filter(block => block.type === 'text').map(block => block.text).join('');
  if (!content.trim()) {
    throw new Error('模型没有返回任何内容。常见原因：API Key 无效/欠费、接口地址(Base URL)填写不正确、网络无法访问模型服务。请到「设置 → AI 配置」检查后重试。');
  }
  return { content };
}

// 便捷构造：分析 Agent（analyst）。后续把现有 runDataAnalysis 包装成 run_data_analysis 工具挂上来。
export function createAnalystAgent(layer, { tools = [], systemPrompt = '你是严谨的定量研究助手。', apiKey = '' } = {}) {
  return createRoleAgent({ layer, role: 'analyst', systemPrompt, tools, scenario: 'analysis', apiKey });
}

// 便捷构造：写作 Agent（writer）。skillPrompt 由 Planner 选好 skill 后拼进来。
export function createWriterAgent(layer, { tools = [], systemPrompt = '你是严谨的中文学术写作助手。', skillPrompt = '', apiKey = '' } = {}) {
  const full = skillPrompt ? `${systemPrompt}\n\n${skillPrompt}` : systemPrompt;
  return createRoleAgent({ layer, role: 'writer', systemPrompt: full, tools, scenario: 'writing', apiKey });
}
