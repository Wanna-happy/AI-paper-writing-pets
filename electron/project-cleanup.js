const fs = require('node:fs');
const path = require('node:path');
function attachmentIds(project, runs = []) {
  const ids = new Set();
  const visit = value => {
    if (!value || typeof value !== 'object') return;
    if (/^[a-f0-9-]{36}$/i.test(value.id || '') && /^\.[a-z0-9]+$/i.test(value.extension || '')) ids.add(`${value.id}${value.extension}`);
    for (const child of Object.values(value)) if (child && typeof child === 'object') visit(child);
  };
  visit(project); visit(runs); return ids;
}
function cleanupProjectFiles(userData, deletedProject, deletedRuns, remainingProjects, remainingRuns) {
  if (!/^[a-z0-9_-]+$/i.test(deletedProject.id)) throw new Error('项目路径无效，未删除文件');
  const root = path.resolve(userData);
  // Only application-owned, exact project folders can be recursively removed.
  for (const parent of ['library', 'analysis-runs', 'analysis-dependencies']) {
    const target = path.resolve(root, parent, deletedProject.id);
    if (!target.startsWith(root + path.sep)) throw new Error('项目路径越界');
    if (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) throw new Error('项目目录为链接，未删除文件');
    if (fs.existsSync(target) && !fs.realpathSync(target).toLowerCase().startsWith((fs.realpathSync(root) + path.sep).toLowerCase())) throw new Error('项目真实路径越界，未删除文件');
    fs.rmSync(target, { recursive: true, force: true });
  }
  const retained = new Set();
  for (const project of remainingProjects) for (const name of attachmentIds(project)) retained.add(name);
  for (const name of attachmentIds(null, remainingRuns)) retained.add(name);
  for (const name of attachmentIds(deletedProject, deletedRuns)) {
    if (retained.has(name)) continue;
    const target = path.resolve(root, 'conversation-files', name);
    if (!target.startsWith(path.join(root, 'conversation-files') + path.sep)) throw new Error('附件路径越界');
    if (fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink() && !fs.realpathSync(target).toLowerCase().startsWith((fs.realpathSync(root) + path.sep).toLowerCase())) throw new Error('附件真实路径越界，未删除文件');
    fs.rmSync(target, { force: true });
  }
}
module.exports = { cleanupProjectFiles, attachmentIds };
