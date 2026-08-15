const assert = require('assert');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { buildAcademicDocx } = require('./word-export');

(async () => {
  const inlineImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLdeAAAAABJRU5ErkJggg==';
  const content = '<h1>3.1 数据来源与样本筛选</h1><p>本研究使用 2000—2021 年面板数据，围绕样本构成、变量口径和筛选规则组织研究设计。<sup data-footnote="1">1</sup></p><p class="table-title">表 1 描述统计</p><table class="three-line"><thead><tr><th>变量</th><th>均值</th></tr></thead><tbody><tr><td>TFR</td><td>1.63</td></tr></tbody></table><p class="table-note">注：本轮数据。</p><figure><img src="' + inlineImage + '" alt="测试图"><figcaption>图 1 测试图</figcaption></figure><section class="footnotes"><p data-footnote="1"><sup>1</sup> 示例资料，第 3 页</p></section><h2>3.1.1 数据来源</h2><p>正式正文只导出本次任务要求的内容，不附加封面、摘要、目录或其他占位页面。</p>';
  const output = await buildAcademicDocx(
    { title: '生育政策阈值研究', type: '硕士学位论文' },
    { title: '数据来源与样本筛选', content },
  );
  assert(output.length > 3000);
  const zip = await JSZip.loadAsync(output);
  const documentXml = await zip.file('word/document.xml').async('string');
  const stylesXml = await zip.file('word/styles.xml').async('string');
  assert(documentXml.includes('正式正文只导出本次任务要求的内容'));
  assert(documentXml.includes('TFR'));
  assert(documentXml.includes('<w:insideH w:val="none"'));
  assert(documentXml.includes('<w:insideV w:val="none"'));
  assert(documentXml.includes('图 1 测试图'));
  assert(Object.keys(zip.files).some((name) => name.startsWith('word/media/')));
  assert(documentXml.includes('w:footnoteReference'));
  assert(!documentXml.includes('博士学位论文'));
  assert(!documentXml.includes('DOCTORAL DISSERTATION'));
  assert(!documentXml.includes('目　录'));
  assert(documentXml.includes('w:top="1559"'));
  assert(documentXml.includes('w:left="1757"'));
  assert(stylesXml.includes('w:val="36"'));
  assert(stylesXml.includes('w:val="28"'));
  const target = path.join(__dirname, '../论文内容排版测试.docx');
  fs.writeFileSync(target, output);
  console.log(`word export test passed: ${target}`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
