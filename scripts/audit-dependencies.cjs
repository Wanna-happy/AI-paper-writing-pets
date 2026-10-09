const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const semver = require('semver');
const root = path.join(__dirname, '..');
async function auditDependencies(outputDirectory = path.join(root, '.release-checks')) {
  const lockBytes = fs.readFileSync(path.join(root, 'package-lock.json'));
  const lock = JSON.parse(lockBytes);
  const packages = {};
  const shipped = new Set();
  for (const [entry, item] of Object.entries(lock.packages || {})) {
    if (!entry || !item.version) continue;
    const name = entry.split('node_modules/').at(-1);
    (packages[name] ||= new Set()).add(item.version);
    if (!item.dev || name === 'electron') shipped.add(`${name}@${item.version}`);
  }
  const body = Object.fromEntries(Object.entries(packages).map(([name, versions]) => [name, [...versions]]));
  const response = await fetch('https://registry.npmjs.org/-/npm/v1/security/advisories/bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`依赖漏洞查询失败：HTTP ${response.status}`);
  const results = await response.json();
  const advisories = Object.entries(results).flatMap(([name, entries]) => entries.flatMap(entry => {
    const versions = [...(packages[name] || [])].filter(version => semver.satisfies(version, entry.vulnerable_versions, { includePrerelease: true }));
    return versions.length ? [{ package: name, versions, scope: versions.some(version => shipped.has(`${name}@${version}`)) ? 'runtime' : 'build-tool', severity: entry.severity, title: entry.title, url: entry.url, range: entry.vulnerable_versions }] : [];
  }));
  const report = { checkedAt: new Date().toISOString(), lockSha256: crypto.createHash('sha256').update(lockBytes).digest('hex'),
    packageCount: Object.keys(packages).length, advisories, blocking: advisories.filter(item => item.scope === 'runtime' && ['critical', 'high'].includes(item.severity)).length,
    buildToolWarnings: advisories.filter(item => item.scope === 'build-tool').length };
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'dependency-audit.json'), JSON.stringify(report, null, 2));
  return report;
}
module.exports = { auditDependencies };
if (require.main === module) auditDependencies().then(report => {
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.blocking ? 2 : 0;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
