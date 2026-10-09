const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const report = JSON.parse(fs.readFileSync(path.join(root, '.release-checks/dependency-audit.json')));
const names = [...new Set(report.advisories.filter(item => ['high', 'critical'].includes(item.severity)).map(item => item.package)), 'npm', '@huggingface/transformers', 'electron-builder'];
(async () => {
  const metadata = {};
  for (const name of names) {
    const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(name), { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Metadata unavailable: ${name}`);
    const data = await response.json();
    metadata[name] = { latest: data['dist-tags'].latest, versions: Object.keys(data.versions), dist: data.versions[data['dist-tags'].latest].dist };
    console.log(name + ': ' + metadata[name].latest);
  }
  fs.writeFileSync(path.join(root, '.release-checks/upgrade-metadata.json'), JSON.stringify(metadata));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
