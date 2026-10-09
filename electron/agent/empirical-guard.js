// A conservative provenance check, not a semantic fact checker. Presence of a
// file/hit is never sufficient: each detected empirical claim needs supporting
// source text with matching quantities and statistical labels/polarity.
function plain(value) {
  return String(value || '')
    .replace(/<section\s+class="footnotes">[\s\S]*?<\/section>/gi, '')
    .replace(/<sup\b[^>]*data-footnote=["'](\d+)["'][^>]*>[\s\S]*?<\/sup>/gi, ' [E$1]')
    .replace(/<\/(?:p|h[1-3]|tr)>/gi, '\n').replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/≤|小于等于/g, '<=').replace(/≥|大于等于/g, '>=')
    .replace(/&lt;|小于/gi, '<').replace(/&gt;|大于/gi, '>')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}
const withoutCitations = value => value.replace(/\[(?:证据\s*)?E\d+\]/gi, '');
const compact = value => withoutCitations(plain(value)).toLowerCase().replace(/[\s，,。；;：:（）()]/g, '');
const quantities = value => (withoutCitations(plain(value)).match(/-?\d+(?:,\d{3})*(?:\.\d+)?%?/g) || [])
  .map(number => number.endsWith('%') ? `${Number(number.slice(0, -1).replace(/,/g, ''))}%` : String(Number(number.replace(/,/g, ''))));
const patterns = [
  /(?:基于|采用|使用)\s*20\d{2}\s*年[^。]{0,80}(?:调查|数据库|数据)/,
  /(?:样本(?:量)?(?:为|共|达到)?|纳入|选取)\s*[0-9,，]+\s*(?:名|人|份|个|条|例|家)/,
  /(?:Logit|Probit|OLS|回归|DID|PSM|工具变量|中介|调节)[^。]{0,100}(?:显著(?!性)|系数\s*(?:为|是|=|:|：)\s*-?\d|稳健(?!性)|正向|负向)/i,
  /研究(?:结果|发现)表明[^。]{0,120}(?:显著|促进|抑制|影响|效应|机制)/,
  /(?:p\s*(?:值)?\s*(?:[<=>]+|为|是|约为)\s*-?\d|(?:置信区间|标准误|系数|显著性水平)\s*(?:为|是|=|[:：])\s*[\[（(]?-?\d)/i,
  /(?:样本量|均值|平均值|中位数|标准差|相关系数|回归系数)\s*(?:为|是|=|：|:)?\s*-?\d/,
];
const labels = [/样本|纳入|选取/, /回归|logit|probit|ols|did|psm/i, /置信区间/, /标准误/, /系数/, /p\s*(?:值|[<=>])/i, /均值|平均值/, /中位数/, /标准差/];
function labeledFacts(value) {
  const matches = plain(value).matchAll(/(回归系数|相关系数|系数|平均值|均值|中位数|标准差|标准误|样本量|样本|纳入|选取|\bp(?:值)?)\s*(?:为|是|约为|等于|共|达到)?\s*(<=|>=|<|>|=|:|：)?\s*(-?\d+(?:,\d{3})*(?:\.\d+)?%?)/gi);
  return [...matches].map(match => ({
    label: match[1].toLowerCase().replace(/平均值/, '均值').replace(/样本量|纳入|选取/, '样本').replace(/p值/, 'p'),
    operator: ['<', '>', '<=', '>='].includes(match[2]) ? match[2] : '=',
    number: quantities(match[3])[0],
  }));
}
function polarity(value) {
  return {
    significance: /不显著|未(?:达|达到)显著|无显著/.test(value) ? 'negative' : /显著/.test(value) ? 'positive' : null,
    direction: /负向|负相关|负效应/.test(value) ? 'negative' : /正向|正相关|正效应/.test(value) ? 'positive' : null,
  };
}
function supports(claim, source) {
  const text = plain(source);
  const a = compact(claim), b = compact(text);
  if (a.length >= 6 && b.includes(a)) return true;
  const numbers = quantities(claim), sourceNumbers = new Set(quantities(text));
  if (!numbers.length || !numbers.every(number => sourceNumbers.has(number))) return false;
  const sourceFacts = labeledFacts(text);
  if (!labeledFacts(claim).every(fact => sourceFacts.some(sourceFact =>
    fact.label === sourceFact.label && fact.operator === sourceFact.operator && fact.number === sourceFact.number))) return false;
  if (!labels.every(label => !label.test(claim) || label.test(text))) return false;
  for (const model of claim.match(/\b(?:logit|probit|ols|did|psm)\b/gi) || []) {
    if (!new RegExp(`\\b${model}\\b`, 'i').test(text)) return false;
  }
  const expected = polarity(claim), actual = polarity(text);
  if (Object.keys(expected).some(key => expected[key] && expected[key] !== actual[key])) return false;
  // Require actual empirical source language, not coincidental numbers in CSV.
  return patterns.some(pattern => pattern.test(text));
}

function detectUnsupportedEmpiricalClaims(content, { evidence = [], toolResults = [], attachments = [] } = {}) {
  const empiricalSources = [
    ...toolResults.filter(result => result && !result.error).flatMap(result => [result.summary || '',
      ...(result.tables || (result.table ? [result.table] : [])).flatMap(table =>
        (table.rows || []).map(row => `${table.title || ''}，` + (Array.isArray(row) ? row.map((number, index) => [table.columns?.[index] || String(index), number]) : Object.entries(row)).map(([label, number]) => `${label}: ${number}`).join('，'))),
    ]),
    ...attachments.map(file => file.excerpt || ''),
  ].filter(Boolean);
  const unsupported = [];
  for (const paragraph of plain(content).split('\n').filter(Boolean)) {
    const citedIds = new Set([...paragraph.matchAll(/\[(?:证据\s*)?(E\d+)\]/gi)].map(match => match[1].toUpperCase()));
    const citedSources = evidence.filter((hit, index) => citedIds.has(hit.evidenceId || `E${index + 1}`)).map(hit => hit.text || '');
    for (const claim of paragraph.split(/[。！？；]/).map(value => value.trim()).filter(Boolean)) {
      // Explicit proposals/examples do not assert completed empirical results.
      if (/^(?:本研究)?(?:拟|计划|建议|假设|示例)/.test(withoutCitations(claim))) continue;
      if (!patterns.some(pattern => pattern.test(claim))) continue;
      if (![...empiricalSources, ...citedSources].some(source => supports(claim, source))) unsupported.push(claim);
    }
  }
  return unsupported;
}

module.exports = { detectUnsupportedEmpiricalClaims };
