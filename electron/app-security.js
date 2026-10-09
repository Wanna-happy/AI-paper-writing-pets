const path = require('node:path');
const { fileURLToPath } = require('node:url');
function isAppPage(url, root) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && !parsed.search && !parsed.hash && ['feed.html', 'index.html'].some(name =>
      path.resolve(fileURLToPath(parsed)).toLowerCase() === path.resolve(root, 'src', name).toLowerCase());
  } catch { return false; }
}
function assertTrustedSender(event, windows, root) {
  const trusted = windows.some(win => win && !win.isDestroyed() && win.webContents === event.sender);
  if (!trusted || !event.senderFrame || event.senderFrame !== event.sender.mainFrame || !isAppPage(event.senderFrame.url, root)) {
    throw new Error('已拒绝不可信页面的本机操作请求');
  }
}
function secureWindow(win, root) {
  const contents = win.webContents;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  for (const name of ['will-navigate', 'will-frame-navigate', 'will-redirect']) contents.on(name, (event, url) => {
    if (!isAppPage(typeof url === 'string' ? url : event.url, root)) event.preventDefault();
  });
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
}
module.exports = { isAppPage, assertTrustedSender, secureWindow };
