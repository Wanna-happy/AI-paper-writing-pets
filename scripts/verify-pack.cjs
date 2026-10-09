const fs = require('node:fs');
const path = require('node:path');
const asar = require('@electron/asar');
function findPackProblems(entries, read) {
  const problems = [];
  for (const entry of entries) {
    const name = entry.replace(/\\/g, '/').replace(/^\//, '');
    if (/(^|\/)(?:\.env(?:\..*)?|api-key[^/]*|workspace\.sqlite[^/]*|validation\.log)$|\.(?:pfx|p12|key)$/i.test(name)) problems.push('Sensitive file: ' + name);
    if (/^electron\//.test(name) && /\.test\.|(?:diagnose-api|validate-real-paper|faux-provider)\./.test(name)) problems.push('Development file: ' + name);
    if (!/^(?:electron|src|assets)\//.test(name) || !/\.(?:js|mjs|cjs|json|html|md|txt)$/i.test(name)) continue;
    const text = read(name).toString('utf8');
    if (/\bsk-[A-Za-z0-9_-]{24,}\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problems.push('Potential embedded secret: ' + name);
  }
  return problems;
}
async function verifyPack(context) {
  const archive = path.join(context.appOutDir, 'resources', 'app.asar');
  if (!fs.existsSync(archive)) throw new Error('Packaged app.asar is missing');
  const entries = asar.listPackage(archive).map(name => name.replace(/^[/\\]+/, '')).filter(name => !asar.statFile(archive, name).files);
  const problems = findPackProblems(entries, name => asar.extractFile(archive, path.normalize(name)));
  if (problems.length) throw new Error('Release content check rejected:\n' + problems.join('\n'));
  const pythonDir = path.join(context.appOutDir, 'resources', 'python');
  const runtimeManifest = path.join(pythonDir, 'runtime-manifest.json');
  if (!fs.existsSync(path.join(pythonDir, 'python.exe')) || !fs.existsSync(runtimeManifest)) throw new Error('Bundled Python runtime missing');
  const python = JSON.parse(fs.readFileSync(runtimeManifest, 'utf8'));
  if (!python.python.startsWith('3.14.') || !['numpy', 'pandas', 'scipy', 'matplotlib', 'openpyxl', 'statsmodels', 'scikit-learn', 'linearmodels', 'lifelines'].every(name => python.packages.some(item => item.name.replaceAll('_', '-') === name))) throw new Error('Bundled analysis environment incomplete');
  fs.writeFileSync(path.join(context.appOutDir, 'resources', 'package-content-report.json'), JSON.stringify({ checkedAt: new Date().toISOString(), checkedFiles: entries.length, python: python.python, pythonPackages: python.packages.length, passed: true }, null, 2));
}
module.exports = verifyPack;
module.exports.findPackProblems = findPackProblems;
