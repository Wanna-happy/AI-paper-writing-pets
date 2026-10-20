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
          if (/^(?:\.git|node_modules|\.?venv(?:[-_].*)?|__pycache__|site-packages)$/i.test(name)) continue;
          visit(path.join(target, name), root || target, depth + 1);
        }
        return;
      }
      if (path.extname(target).toLowerCase() === '.xls') throw new Error('旧版 XLS 暂不支持，请在 Excel 中另存为 XLSX 或 CSV 后导入。');
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

async function importProjectFiles({ store, ragStore, projectId, paths, conversationId }) {
  if (!store.loadWorkspace().projects.some(project => project.id === projectId)) throw new Error('请先创建论文项目');
  if(conversationId&&!store.loadWorkspace().projects.find(project=>project.id===projectId)?.conversations?.some(item=>item.id===conversationId))throw new Error('对话不属于当前项目');
  const { files, rejected } = expandPaths(paths);
  const added = [];
  for (const file of files) {
    try {
      const fingerprint = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');
      const project = store.loadWorkspace().projects.find(item => item.id === projectId);
      const existing = (project.projectFiles || []).find(item => item.fingerprint === fingerprint);
      if (existing && resolveConversationAttachment(existing)) {
        // Reusing an older identical upload makes it the current version again.
        const reused = { ...existing, importedAt: new Date().toISOString(), sourceConversationIds:[...new Set([...(existing.sourceConversationIds||[]),...(conversationId?[conversationId]:[])])] };
        store.updateProject(projectId, { projectFiles: [...(project.projectFiles || []).filter(item => item.id !== existing.id), reused] });
        added.push(reused);
        continue;
      }
      const [attachment] = await prepareConversationFiles([file.path]);
      Object.assign(attachment, { projectId, scope: 'project', fingerprint, sourceConversationIds:conversationId?[conversationId]:[], relativePath: file.relativePath,
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
  const byId = [...new Map(files.filter(file => !(project.removedAttachmentIds || []).includes(file.id) && resolveConversationAttachment(file)).reverse().map(file => [file.id, file])).values()].reverse();
  return selectCurrentDataFiles(byId);
}
function selectCurrentDataFiles(files) {
  const latest = new Map();
  for (const file of files) {
    if (!['.csv', '.xlsx'].includes(String(file.extension || '').toLowerCase())) continue;
    const name = String(file.name || '').toLowerCase();
    const old = latest.get(name);
    // Prefer the explicitly supplied or most recently imported version. The
    // file remains in the project library; only the default analysis input is selected.
    const time = Date.parse(file.importedAt || '') || 0;
    const oldTime = Date.parse(old?.importedAt || '') || 0;
    if (!old || time > oldTime || (time && time === oldTime)) latest.set(name, file);
  }
  return files.filter(file => !['.csv', '.xlsx'].includes(String(file.extension || '').toLowerCase()) || latest.get(String(file.name || '').toLowerCase()) === file);
}
module.exports = { expandPaths, importProjectFiles, availableProjectFiles, selectCurrentDataFiles };
