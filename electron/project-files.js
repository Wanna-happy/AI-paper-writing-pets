const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { prepareConversationFiles, resolveConversationAttachment } = require('./conversation-files');
const SUPPORTED = new Set(['.pdf', '.txt', '.md', '.docx', '.bib', '.csv', '.xlsx', '.xls', '.json', '.py', '.r', '.zip', '.png', '.jpg', '.jpeg']);
const LITERATURE = new Set(['.pdf', '.txt', '.md', '.docx', '.bib']);

function expandPaths(paths) {
  const files = [], rejected = [], seen = new Set();
  let bytes = 0;
  function visit(target, root, depth = 0) {
    if (depth > 30) { rejected.push({ name: path.basename(target), reason: '目录层级过深' }); return; }
    if (files.length >= 500) { rejected.push({ name: path.basename(target), reason: '每次最多添加 500 个文件' }); return; }
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw new Error('不导入符号链接或目录链接');
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(target).sort()) {
          if (['.git', 'node_modules', '.venv', '__pycache__'].includes(name)) continue;
          visit(path.join(target, name), root || target, depth + 1);
        }
        return;
      }
      if (!stat.isFile() || !SUPPORTED.has(path.extname(target).toLowerCase())) throw new Error('不支持此文件类型');
      if (stat.size > 100 * 1024 * 1024 || bytes + stat.size > 1024 * 1024 * 1024) throw new Error('超过单文件 100 MB 或单次 1 GB 限制');
      const real = fs.realpathSync(target);
      if (seen.has(real)) return;
      seen.add(real); bytes += stat.size;
      files.push({ path: real, relativePath: root ? path.relative(root, target) : path.basename(target) });
    } catch (error) { rejected.push({ name: path.basename(target), reason: error.message }); }
  }
  for (const target of paths || []) visit(target, null);
  return { files, rejected };
}

async function importProjectFiles({ store, ragStore, projectId, paths }) {
  if (!store.loadWorkspace().projects.some(project => project.id === projectId)) throw new Error('请先创建论文项目');
  const { files, rejected } = expandPaths(paths);
  const added = [];
  for (const file of files) {
    try {
      const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
      const project = store.loadWorkspace().projects.find(item => item.id === projectId);
      const existing = (project.projectFiles || []).find(item => item.fingerprint === fingerprint);
      if (existing && resolveConversationAttachment(existing)) { added.push(existing); continue; }
      const [attachment] = await prepareConversationFiles([file.path]);
      Object.assign(attachment, { projectId, scope: 'project', fingerprint, relativePath: file.relativePath,
        kind: LITERATURE.has(attachment.extension) ? 'literature' : 'data', importedAt: new Date().toISOString() });
      attachment.name = file.relativePath;
      if (['.csv', '.xlsx', '.xls'].includes(attachment.extension)) attachment.excerpt = '数据已保存在当前项目；请调用 inspect_data_file 核对字段、样本和数据口径。';
      if (attachment.kind === 'literature') {
        const imported = await store.importDocuments(projectId, [file.path]);
        const doc = imported.imported[0] || imported.state.projects.find(item => item.id === projectId).documents.find(item => item.fingerprint === fingerprint);
        if (doc) attachment.documentId = doc.id;
        rejected.push(...imported.rejected.filter(item => item.reason !== '重复资料').map(item => ({ name: attachment.name, reason: item.reason })));
      }
      const latest = store.loadWorkspace().projects.find(item => item.id === projectId);
      const documents = [...latest.documents];
      if (attachment.kind === 'data') {
        attachment.documentId = attachment.id;
        documents.push({ id: attachment.id, name: attachment.name, extension: attachment.extension, size: attachment.size,
          fingerprint, storedPath: resolveConversationAttachment(attachment), status: 'data', importedAt: attachment.importedAt, note: file.relativePath });
      }
      store.updateProject(projectId, { projectFiles: [...(latest.projectFiles || []), attachment], documents });
      added.push(attachment);
    } catch (error) { rejected.push({ name: path.basename(file.path), reason: error.message }); }
  }
  const project = store.loadWorkspace().projects.find(item => item.id === projectId);
  if (added.some(item => item.kind === 'literature')) await ragStore.indexProject(project);
  return { attachments: added, rejected, state: store.loadWorkspace() };
}
function availableProjectFiles(store, project) {
  const files = [...(project.projectFiles || [])];
  for (const document of project.documents || []) {
    if (['.csv', '.xlsx', '.xls'].includes(document.extension)) files.push({ id: document.id, name: document.name, extension: document.extension, size: document.size, projectId: project.id, scope: 'project', kind: 'data', documentId: document.id });
  }
  for (const run of store.listAgentRuns?.(project.id, 200) || []) {
    if (run.projectId !== project.id) continue;
    for (const file of run.checkpoint?.attachments || []) {
      if (!file.projectId || file.projectId === project.id) files.push({ ...file, projectId: project.id, scope: 'project' });
    }
  }
  return [...new Map(files.filter(file => !(project.removedAttachmentIds || []).includes(file.id) && resolveConversationAttachment(file)).map(file => [file.id, file])).values()];
}
module.exports = { expandPaths, importProjectFiles, availableProjectFiles };
