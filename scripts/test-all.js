const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const tests = ['electron', 'electron/agent', 'electron/pi', 'electron/sandbox'].flatMap(folder => fs.readdirSync(path.join(root, folder))
  .filter(name => /\.test\.(js|mjs)$/.test(name)).map(name => `${folder}/${name}`));
let failed = 0;
for (const file of tests) {
  // Real sandbox integration cases copy the bundled scientific runtime and
  // remove it afterwards; cold disks can exceed the unit-test timeout.
  const timeout = file.includes('integration') ? 360000 : 120000;
  const result = spawnSync(process.execPath, [file], { cwd: root, encoding: 'utf8', windowsHide: true, timeout });
  const ok = result.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${file}`);
  if (!ok) { failed++; console.error([result.error?.message, result.stderr, result.stdout].filter(Boolean).join('\n').slice(-4000)); }
}
const python = spawnSync('python', ['scripts/data_analysis.test.py'], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 120000 });
console.log(`${python.status === 0 ? 'PASS' : 'FAIL'} scripts/data_analysis.test.py`);
if (python.status !== 0) { failed++; console.error(python.stderr || python.error?.message); }
console.log(`${tests.length + 1} suites, ${failed} failures`);
process.exitCode = failed ? 1 : 0;
