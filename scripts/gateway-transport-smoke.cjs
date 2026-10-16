const { app } = require('electron');
const path = require('node:path'), { pathToFileURL } = require('node:url');
app.setPath('userData', path.resolve(__dirname, '../.ui-smoke/gateway-transport'));
app.whenReady().then(async () => {
  try {
    await import(pathToFileURL(path.resolve(__dirname, '../electron/pi/provider-protocol.test.mjs')).href);
    console.log('Electron desktop transport: actual planner/Agent streams and provider tests passed against localhost');
    app.exit(0);
  } catch (error) { console.error(error.message); app.exit(1); }
});
