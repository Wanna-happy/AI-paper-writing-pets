const fs = require('node:fs');
const path = require('node:path');
function bundledPythonPath() {
  const candidates = [process.resourcesPath && path.join(process.resourcesPath, 'python'),
    path.resolve(__dirname, '../../python'), path.resolve(__dirname, '../assets/python/win32-x64')].filter(Boolean);
  const root = candidates.find(dir => fs.existsSync(path.join(dir, 'python.exe')) && fs.existsSync(path.join(dir, 'runtime-manifest.json')));
  return root ? path.join(root, 'python.exe') : '';
}
module.exports = { bundledPythonPath };
