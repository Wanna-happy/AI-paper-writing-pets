function createOpenAIStreamParser(onDelta) {
  let buffer = '';
  let content = '';
  let finishReason = null;

  function consumePayload(data) {
    if (!data || data === '[DONE]') return;
    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    finishReason = payload.choices?.[0]?.finish_reason || finishReason;
    const delta = payload.choices?.[0]?.delta?.content
      ?? payload.choices?.[0]?.text
      ?? payload.output?.[0]?.content?.[0]?.text
      ?? payload.delta?.text;
    if (typeof delta !== 'string' || !delta) return;
    content += delta;
    onDelta(delta);
  }

  function consumeLine(line) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    consumePayload(trimmed.slice(5).trim());
  }

  return {
    push(chunk) {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      for (const line of lines) consumeLine(line);
    },
    finish() {
      if (buffer.trim()) consumeLine(buffer);
      buffer = '';
      return content;
    },
    getFinishReason() {
      return finishReason;
    },
  };
}

module.exports = { createOpenAIStreamParser };
