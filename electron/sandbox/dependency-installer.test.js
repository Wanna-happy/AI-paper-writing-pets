const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { validateRequirement, projectDependencyRoot, currentDependencyDir, installAnalysisDependency } = require('./dependency-installer');
const { runSandbox } = require('./windows-sandbox');

assert.deepEqual(validateRequirement('Pingouin', '0.5.5'), { name: 'pingouin', version: '0.5.5' });
for (const name of ['-r', 'https://pypi.org/a', '../escape', 'x;echo']) assert.throws(() => validateRequirement(name));
for (const version of ['>=1', '1 --extra-index-url', 'https://evil.test']) assert.throws(() => validateRequirement('humanize', version));
async function main() {
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-dependency-test-'));
try {
  assert.notEqual(projectDependencyRoot(root, 'paper-A'), projectDependencyRoot(root, 'paper-B'));
  assert.equal(currentDependencyDir(root, 'paper-A'), null);
  if (process.argv.includes('--online')) {
    const python = { executable: path.resolve(__dirname, '../../assets/python/win32-x64/python.exe') };
    const result = await installAnalysisDependency({ name: 'humanize', version: '4.13.0', userDataPath: root, projectId: 'paper-A', python });
    assert.equal(result.status, 'installed');
    assert.ok(fs.existsSync(path.join(currentDependencyDir(root, 'paper-A'), 'site-packages', 'humanize', '__init__.py')));
    assert.equal(currentDependencyDir(root, 'paper-B'), null);
    const again = await installAnalysisDependency({ name: 'humanize', userDataPath: root, projectId: 'paper-A', python });
    assert.equal(again.status, 'already-installed');
    const second = await installAnalysisDependency({ name: 'boltons', version: '24.0.0', userDataPath: root, projectId: 'paper-A', python });
    assert.equal(second.status, 'installed');
    const projectSite = path.join(currentDependencyDir(root, 'paper-A'), 'site-packages');
    assert.ok(fs.existsSync(path.join(projectSite, 'humanize', '__init__.py')));
    assert.ok(fs.existsSync(path.join(projectSite, 'boltons', '__init__.py')));
    const transitive = await installAnalysisDependency({ name: 'inflect', version: '7.5.0', userDataPath: root, projectId: 'paper-A', python });
    assert.equal(transitive.status, 'installed');
    assert.ok(transitive.dependencies.some(item => item.startsWith('more_itertools==') || item.startsWith('more-itertools==')));
    const finalSite = path.join(currentDependencyDir(root, 'paper-A'), 'site-packages');
    const probe = execFileSync(python.executable, ['-I', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(finalSite)}); import humanize, boltons, inflect; print(humanize.intcomma(12345))`], { encoding: 'utf8' });
    assert.equal(probe.trim(), '12,345');
    if (process.argv.includes('--sandbox')) {
      const scriptPath = path.join(root, 'probe.py');
      fs.writeFileSync(scriptPath, 'import humanize, boltons\nprint(humanize.intcomma(12345))\nprint(boltons.__name__)\n');
      const outputDir = path.join(root, 'analysis-runs', 'paper-A', 'probe');
      const sandboxResult = await runSandbox({ python, scriptPath, outputDir, dependencyDir: currentDependencyDir(root, 'paper-A'), timeoutMs: 60000 });
      assert.match(sandboxResult.stdout, /12,345/);
      assert.match(sandboxResult.stdout, /boltons/);
    }
  }
  process.stdout.write('dependency installer checks passed\n');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
}
main().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
