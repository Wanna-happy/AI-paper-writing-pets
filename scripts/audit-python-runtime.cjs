const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
async function audit() {
  const manifest = JSON.parse(fs.readFileSync('assets/python/win32-x64/runtime-manifest.json', 'utf8'));
  const queries = manifest.packages.map(item => ({ package: { name: item.name.replace(/_/g, '-'), ecosystem: 'PyPI' }, version: item.version }));
  const response = await fetch('https://api.osv.dev/v1/querybatch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ queries }), signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error('Python dependency audit unavailable');
  const result = await response.json();
  const findings = result.results.flatMap((item, index) => (item.vulns || []).map(vuln => ({ package: queries[index].package.name, version: queries[index].version, id: vuln.id })));
  fs.mkdirSync('.release-checks', { recursive: true });
  fs.writeFileSync('.release-checks/python-dependency-audit.json', JSON.stringify({ checkedAt: new Date().toISOString(), python: manifest.python, packageCount: queries.length, findings, blocking: findings.length }, null, 2));
  console.log(JSON.stringify({ python: manifest.python, packages: queries.length, knownVulnerabilities: findings.length }));
  if (findings.length) throw new Error('Known vulnerable Python dependencies block release; see audit report');
  for (const item of manifest.packages) {
    const filename = path.join('.runtime-downloads/wheels-314', item.wheel);
    if (fs.existsSync(filename) && crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex') !== item.sha256) throw new Error('Python wheel checksum mismatch');
  }
}
audit().catch(error => { console.error(error.message); process.exitCode = 1; });
