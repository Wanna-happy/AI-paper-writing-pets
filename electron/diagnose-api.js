// 使用应用现有安全存储执行合成任务，不输出密钥、不读取或发送用户论文。
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
function report(value) {
  const result = JSON.stringify(value, null, 2);
  fs.writeFileSync(path.join(__dirname, '../api-diagnostic.json'), result);
  console.log(result);
}
app.setName('AI论文宠物');
app.setPath('userData', path.join(app.getPath('appData'), 'AI论文宠物'));
app.whenReady().then(async () => {
  try {
    const { loadSettings } = require('./settings');
    const store = require('./workspace-store');
    const { createModelLayer } = await import('./pi/model-layer.mjs');
    const { planTasks } = await import('./pi/planner.mjs');
    const { runPlan } = await import('./pi/run-engine.mjs');
    const { buildRegistry } = await import('./pi/registry.mjs');
    const settings = loadSettings();
    const apiKey = store.getApiKey(settings.api.keyMode, settings.api.provider);
    if (!apiKey) throw new Error('未找到可用的已保存密钥；请在应用设置中保存。');
    const layer = createModelLayer(settings);
    const registry = buildRegistry();
    const signal = AbortSignal.timeout(90000);
    const plan = await planTasks({ layer, registry, apiKey, signal,
      userPrompt: '连通性诊断：请用 HTML 的一个 p 标签写一句“学术写作需要清晰的问题意识”。不检索、不调用工具，不扩写。',
    });
    if (plan.fallback) throw new Error('任务规划未成功返回有效计划。');
    const result = await runPlan({ layer, registry, apiKey, signal, plan });
    if (!result.finalText.trim()) throw new Error('写作 Agent 返回空内容。');
    report({ ok: true, savedKeyAvailable: true, plannerFallback: plan.fallback, roles: plan.tasks.map(t => t.role), outputCharacters: result.finalText.length, model: layer.getModel('writing').id });
    app.exit(0);
  } catch (error) {
    // 只报告分类，第三方错误可能包含请求细节，避免直接输出。
    report({ ok: false, reason: error.name === 'TimeoutError' ? 'timeout' : 'api-or-config-failure' });
    app.exit(1);
  }
});
