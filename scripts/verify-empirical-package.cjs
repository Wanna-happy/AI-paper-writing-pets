const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const asar = require('@electron/asar');
const { isPublishableResearchFile } = require('../electron/skills/library-policy');
const root = path.resolve(__dirname, '..');
const skills = JSON.parse(fs.readFileSync(path.join(root, 'assets/research-skills/catalog/skills.json'), 'utf8')).skills;
const release = path.resolve(process.argv[2] || '');
assert(release.startsWith(root + path.sep), 'Only inspect a release within this workspace');
const resources = path.join(release, 'win-unpacked/resources');
const archive = path.join(resources, 'app.asar');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const paths = [
  'src/feed.html', 'src/feed.js', 'src/styles/feed.css',
  'electron/main.js', 'electron/preload.js', 'electron/empirical-workflow.js', 'electron/empirical-artifacts.js',
  'electron/agent/orchestrator.js', 'electron/tools/code-analysis.js', 'electron/sandbox/windows-sandbox.js',
  'electron/pi/planner.mjs', 'electron/pi/registry.mjs', 'electron/pi/agent-tools.mjs', 'electron/pi/run-engine.mjs',
  'node_modules/@vscode/codicons/dist/codicon.css', 'node_modules/@vscode/codicons/dist/codicon.ttf', 'node_modules/@vscode/codicons/LICENSE',
];
function files(folder) { return fs.readdirSync(folder, { withFileTypes: true }).flatMap(item => item.isDirectory() ? files(path.join(folder, item.name)) : [path.join(folder, item.name)]); }
for (const folder of ['assets/research-skills', 'assets/research-runtime', 'electron/skills']) paths.push(...files(path.join(root, folder)).map(file => path.relative(root, file).replaceAll('\\', '/')).filter(isPublishableResearchFile));
const checked = paths.map(file => {
  const local = hash(fs.readFileSync(path.join(root, file)));
  assert.equal(hash(asar.extractFile(archive, path.normalize(file))), local, 'Packaged source mismatch: ' + file);
  return { file, sha256: local };
});
const sourcePackage = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const packagedManifest = JSON.parse(asar.extractFile(archive, 'package.json').toString('utf8'));
for (const key of ['name', 'productName', 'version', 'main']) assert.equal(packagedManifest[key], sourcePackage[key], 'Application manifest mismatch: ' + key);
assert.deepEqual(packagedManifest.dependencies, sourcePackage.dependencies, 'Production dependencies mismatch');
for (const name of ['python.exe', 'python314.dll', 'runtime-manifest.json']) {
  assert.equal(hash(fs.readFileSync(path.join(resources, 'python', name))), hash(fs.readFileSync(path.join(root, 'assets/python/win32-x64', name))), 'Bundled Python mismatch: ' + name);
}
const helper = 'assets/sandbox/win32/paper-pet-sandbox.exe';
const helperHash = hash(fs.readFileSync(path.join(resources, 'app.asar.unpacked', helper)));
assert.equal(helperHash, hash(fs.readFileSync(path.join(root, helper))));
const result = { checkedAt: new Date().toISOString(), sourceMatching: true, skillCount: skills.length, sandboxHelperSha256: helperHash, pythonBinaryMatching: true, checked };
fs.writeFileSync(path.join(release, 'empirical-package-verification.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ sourceMatching: true, sourceFiles: checked.length, skills: skills.length, pythonBinaryMatching: true, sandboxHelperSha256: helperHash }));
