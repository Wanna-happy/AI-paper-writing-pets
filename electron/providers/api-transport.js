function networkMessage(error) {
  const code = String(error?.cause?.code || error?.code || error?.message || '');
  if (/CERT|SSL|certificate/i.test(code)) return '接口证书校验失败。请检查中转站证书链、系统时间或代理证书是否已被系统信任；不会跳过证书校验。';
  if (/ENOTFOUND|EAI_AGAIN|NAME_NOT_RESOLVED/i.test(code)) return '无法解析接口域名，请检查地址拼写、DNS 或网络配置。';
  if (/TIMEOUT|TIMED_OUT|Timeout/i.test(code) || error?.name === 'TimeoutError') return '接口连接超时，请检查中转站和代理是否可用。';
  if (/REFUSED/i.test(code)) return '接口拒绝连接，请检查服务地址与端口。';
  return '无法连接接口，请检查中转站、系统代理和证书配置。';
}
async function apiFetch(input, init = {}) {
  // Chromium uses the desktop proxy/certificate configuration, without disabling TLS.
  let electron;
  try { electron = require('electron'); } catch {}
  const request = electron?.app?.isReady() && electron.net?.fetch ? electron.net.fetch.bind(electron.net) : globalThis.fetch;
  try { return await request(input, { ...init, redirect: 'error' }); }
  catch (error) {
    if (error.name === 'AbortError') throw error;
    const wrapped = new Error(networkMessage(error)); wrapped.cause = error; throw wrapped;
  }
}
module.exports = { apiFetch, networkMessage };
