const fs = require('fs');
const path = require('path');

function resultVersion(project, conversationId, revision) {
  const plan = require('./empirical-workflow').currentPlan(project, conversationId);
  if (!plan || plan.projectId !== project.id || plan.conversationId !== conversationId) throw new Error('当前对话没有实证结果');
  if (revision == null || revision === plan.revision) return plan;
  const previous = plan.history?.find(item => item.revision === revision);
  if (!previous) throw new Error('该版本的结果已不可用，请查看当前分析结果');
  return { ...plan, ...previous };
}

function chartBytes(file, rootPath) {
  const real = fs.realpathSync(file), stat = fs.lstatSync(file);
  const root = fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : null;
  if (!root || !real.toLowerCase().startsWith((root + path.sep).toLowerCase()) || stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || path.extname(real).toLowerCase() !== '.png' || stat.size > 12 * 1024 * 1024) throw new Error('结果图表路径无效');
  const bytes = fs.readFileSync(real);
  if (!bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('结果图表不是 PNG 文件');
  return bytes;
}

function artifactList(plan) {
  return (plan.results || []).flatMap(result => {
    const label = plan.steps?.find(step => step.id === result.stepId)?.label || '分析';
    const base = { planId: plan.id, revision: plan.revision, stepId: result.stepId };
    return [
      ...(result.tables || []).map((table, index) => ({ ...base, kind: 'table', index, name: table.title || `${label}结果表` })),
      ...(result.files || []).map((file, index) => ({ ...base, kind: 'image', index, name: path.basename(file) })),
      ...(result.code ? [{ ...base, kind: 'code', index: 0, name: `${label} · analysis_script.py` }] : []),
      { ...base, kind: 'json', index: 0, name: `${label} · analysis-result.json` },
    ];
  });
}

function artifactFile(plan, selection, rootPath) {
  if (selection.planId !== plan.id || selection.revision !== plan.revision) throw new Error('文件版本不一致');
  const artifact = artifactList(plan).find(item => item.stepId === selection.stepId && item.kind === selection.kind && item.index === selection.index);
  if (!artifact) throw new Error('该结果文件不存在');
  const result = plan.results.find(item => item.stepId === artifact.stepId);
  let data, extension;
  if (artifact.kind === 'image') { data = chartBytes(result.files[artifact.index], rootPath); extension = 'png'; }
  else if (artifact.kind === 'table') {
    // Prevent spreadsheet formula execution when a table is opened in Excel.
    const cell = value => { let text = value == null ? '' : String(value); if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = "'" + text; return '"' + text.replace(/"/g, '""') + '"'; };
    const table = result.tables[artifact.index];
    data = Buffer.from('\uFEFF' + [table.columns, ...table.rows].map(row => row.map(cell).join(',')).join('\r\n'), 'utf8'); extension = 'csv';
  } else if (artifact.kind === 'code') { data = Buffer.from(result.code, 'utf8'); extension = 'py'; }
  else { const { code, files, charts, ...metadata } = result; data = Buffer.from(JSON.stringify(metadata, null, 2), 'utf8'); extension = 'json'; }
  const name = artifact.name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').replace(/\.+$/, '').slice(0, 140);
  return { data, extension, name: name.endsWith('.' + extension) ? name : `${name}.${extension}` };
}

module.exports = { resultVersion, chartBytes, artifactList, artifactFile };
