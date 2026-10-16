const assert = require('node:assert/strict');
const { networkMessage } = require('./api-transport');
const {ProviderRegistry}=require('./provider-registry');
(async () => {
  assert(networkMessage({ cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }).includes('证书'));
  assert(networkMessage({ cause: { code: 'ENOTFOUND' } }).includes('域名'));
  assert(networkMessage({ name: 'TimeoutError' }).includes('超时'));
  const registry=new ProviderRegistry();assert.equal(registry.has('custom'),false);assert.throws(()=>registry.getAdapter('custom'),/已停用/);assert(registry.has('deepseek'));
  console.log('TLS/DNS/timeout diagnosis passed; relay model-list endpoint removed');
})().catch(error => { console.error(error); process.exitCode = 1; });
