const { app } = require('electron');
const path = require('node:path');
app.setPath('userData', path.resolve(__dirname, '../.ui-smoke/api-network-check'));
app.whenReady().then(async () => {
  try {
    const { apiFetch } = require('../electron/providers/api-transport');
    const response = await apiFetch('https://api.kmsoft.top/v1/models', { method: 'GET', signal: AbortSignal.timeout(15000) });
    console.log(JSON.stringify({ anonymousCheck: true, httpStatus: response.status, note: 'No credentials sent' }));
  } catch (error) { console.log(JSON.stringify({ anonymousCheck: true, error: error.message })); }
  app.exit(0);
});
