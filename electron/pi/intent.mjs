import pipelinePrompts from '../agent/pipeline-prompts.js';
import flowPolicy from '../agent/flow-policy.js';
import { requestModel } from './model-layer.mjs';
const { normalizeIntent } = flowPolicy;
export async function recognizeIntent({ layer, userPrompt, projectContext = '', apiKey = '', signal = null }) {
  const diagnostics = [];
  for (let attempt = 0; attempt < 2; attempt++) { try {
    const result = await requestModel(layer, { scenario: 'planning', apiKey, signal, options: { temperature: 0, maxTokens: 2600 }, messages: [
      { role: 'system', content: pipelinePrompts.UNDERSTANDING },
      { role: 'user', content: `项目设置与历史记忆：\n${projectContext}\n\n本轮用户输入：\n${userPrompt}${attempt ? '\n上次返回未通过JSON/字段校验。这是内部格式错误，不是用户需求缺失。请只输出合法JSON；branch须为conversation/research/inspection/environment/analysis/writing/mixed之一，needsClarification须为布尔值。继续类请求先承接历史，不泛问用户想做什么。' : ''}` },
    ] });
    const text = String(result.content || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const intent = normalizeIntent(JSON.parse(text));
    if (intent) return { ...intent, ...(diagnostics.length ? { diagnostics } : {}) };
    diagnostics.push({ stage: 'intent', attempt: attempt + 1, code: 'INTENT_SCHEMA_INVALID' });
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    // A transport/authentication failure is not a missing user requirement.
    if (!(error instanceof SyntaxError)) throw error;
    diagnostics.push({ stage: 'intent', attempt: attempt + 1, code: 'INTENT_JSON_INVALID' });
  } }
  const error = new Error('意图理解返回格式异常，自动重试后仍未恢复。已保留当前任务与历史，请检查运行记录；无需重新说明研究目标。');
  error.code = 'INTENT_FORMAT_INVALID'; error.diagnostics = diagnostics; throw error;
}
