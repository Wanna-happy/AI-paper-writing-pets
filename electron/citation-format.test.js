const assert = require('assert');
const { buildAcademicTable, normalizeCitationMarkers } = require('./citation-format');

const content = normalizeCitationMarkers('该结论得到支持。[E1]', [{ index: 1, documentName: '示例文献.pdf', page: 5 }]);
assert(content.includes('data-footnote="1"'));
assert(content.includes('示例文献.pdf，第 5 页'));
assert(buildAcademicTable({ title: '描述统计', columns: ['变量', '均值'], rows: [{ 变量: 'TFR', 均值: '1.63' }] }).includes('<td>TFR</td><td>1.63</td>'));

console.log('citation format test passed');
