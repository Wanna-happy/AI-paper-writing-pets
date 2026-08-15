function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildFootnotes(evidence = []) {
  const sources = [];
  const indexByEvidence = new Map();
  for (const item of evidence) {
    const source = `${item.documentName}${item.page ? `，第 ${item.page} 页` : ''}`;
    if (!indexByEvidence.has(item.index)) {
      indexByEvidence.set(item.index, sources.length + 1);
      sources.push(source);
    }
  }
  return { sources, indexByEvidence };
}

function normalizeCitationMarkers(content, evidence = []) {
  const { sources, indexByEvidence } = buildFootnotes(evidence);
  const used = new Set();
  const body = String(content || '').replace(/\[E(\d+)\]/g, (_match, value) => {
    const number = indexByEvidence.get(Number(value));
    if (!number) return '〔待核验〕';
    used.add(number);
    return `<sup data-footnote="${number}">${number}</sup>`;
  });
  const notes = [...used].map((number) => `<p data-footnote="${number}"><sup>${number}</sup> ${escapeHtml(sources[number - 1])}</p>`).join('');
  return notes ? `${body.trim()}<section class="footnotes">${notes}</section>` : body;
}

function buildAcademicTable(table) {
  if (!table?.columns?.length || !table?.rows?.length) return '';
  const cells = (tag, values) => values.map((value) => `<${tag}>${escapeHtml(value)}</${tag}>`).join('');
  const rows = table.rows.map((row) => `<tr>${cells('td', table.columns.map((column) => row[column]))}</tr>`).join('');
  return `<p class="table-title">表 1 ${escapeHtml(table.title || '统计结果')}</p><table class="three-line"><thead><tr>${cells('th', table.columns)}</tr></thead><tbody>${rows}</tbody></table><p class="table-note">注：由本轮上传数据经工具计算得到。</p>`;
}

module.exports = { buildAcademicTable, normalizeCitationMarkers };
