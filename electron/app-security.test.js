const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { assertTrustedSender, secureWindow } = require('./app-security');
const root = path.join(__dirname, '..');
const url = pathToFileURL(path.join(root, 'src', 'feed.html')).href;
const frame = { url }, sender = { mainFrame: frame };
const win = { isDestroyed: () => false, webContents: sender };
assertTrustedSender({ sender, senderFrame: frame }, [win], root);
for (const event of [{ sender, senderFrame: { url } }, { sender: {}, senderFrame: frame }, { sender, senderFrame: Object.assign(frame, { url: 'https://evil.example' }) }]) {
  assert.throws(() => assertTrustedSender(event, [win], root));
}
frame.url = url + '?remote=true';
assert.throws(() => assertTrustedSender({ sender, senderFrame: frame }, [win], root));
const events = {}, session = {};
secureWindow({ webContents: { on: (name, fn) => { events[name] = fn; }, setWindowOpenHandler: fn => { events.popup = fn; }, session: {
  setPermissionRequestHandler: fn => { session.request = fn; }, setPermissionCheckHandler: fn => { session.check = fn; },
} } }, root);
assert.equal(events.popup().action, 'deny');
let blocked = false;
events['will-navigate']({ preventDefault: () => { blocked = true; } }, 'https://evil.example');
assert(blocked);
session.request(null, 'camera', allowed => assert.equal(allowed, false));
assert.equal(session.check(), false);
console.log('IPC sender/frame validation, navigation, popup and permission restrictions passed');
