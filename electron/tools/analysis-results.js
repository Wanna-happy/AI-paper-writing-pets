function aggregateAnalysisResults(records = []) {
  const results = records.map(record => record.result).filter(Boolean);
  const successful = results.filter(result => !result.error);
  if (!results.length) return null;
  if (!successful.length) return { ...results[0], kind: 'data_analysis', files: [], tables: [], analyses: [], errors: results.map(result => result.error).filter(Boolean) };
  const tables = successful.flatMap(result => result.tables || (result.table ? [result.table] : []));
  return {
    ...successful[0],
    kind: 'data_analysis',
    summary: successful.map((result, index) => `分析 ${index + 1}：\n${result.summary || ''}`).join('\n\n'),
    files: [...new Set(successful.flatMap(result => result.files || []))],
    table: tables[0] || null,
    tables,
    analyses: successful,
    errors: results.filter(result => result.error).map(result => result.error),
  };
}
module.exports = { aggregateAnalysisResults };
