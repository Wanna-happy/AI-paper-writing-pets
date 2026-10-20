const assert=require('node:assert/strict'),JSZip=require('jszip');
const {parseFormattingRequirements,normalizeFormatting}=require('./document-formatting');
const {buildAcademicDocx}=require('./word-export');
async function main(){
  const parsed=parseFormattingRequirements('正文：楷体，小四号。英文：Arial。一级标题：黑体，小二。行距固定值28磅。首行缩进2字符。上边距2.5cm，下边距2cm，左边距3cm，右边距2cm。引用APA。');
  assert.equal(parsed.documentFormatting.bodyFont,'楷体');assert.equal(parsed.documentFormatting.bodySize,12);assert.equal(parsed.documentFormatting.heading1Size,18);assert.equal(parsed.documentFormatting.lineMode,'exact');assert.equal(parsed.documentFormatting.marginTop,2.5);assert.equal(parsed.defaultCitation,'APA');
  assert.deepEqual(parseFormattingRequirements('正文样式按学校通知执行。').recognizedFields,[]);
  const invalid=parseFormattingRequirements('正文：99pt。行距固定值100磅。');assert.deepEqual(invalid.documentFormatting,{});assert.deepEqual(invalid.recognizedFields,[]);assert(invalid.warnings.length>1);
  assert.equal(normalizeFormatting({bodySize:-2,marginLeft:999,lineValue:999}).bodySize,14);
  const format={...parsed.documentFormatting,heading1Size:20};
  const [first,second]=await Promise.all([buildAcademicDocx({title:'排版测试'},{content:'<h1>标题</h1><p>中文与Latin正文</p>'},format),buildAcademicDocx({title:'默认'},{content:'<p>默认正文</p>'},{})]);
  const xml=await(await JSZip.loadAsync(first)).file('word/document.xml').async('string');
  assert(xml.includes('w:eastAsia="楷体"'));assert(xml.includes('w:ascii="Arial"'));assert(xml.includes('w:sz w:val="24"'));assert(xml.includes('w:line="560"'));assert(xml.includes('w:lineRule="exact"'));assert(xml.includes(`w:top="${Math.round(2.5*1440/2.54)}"`));
  const other=await(await JSZip.loadAsync(second)).file('word/document.xml').async('string');assert(other.includes('w:eastAsia="宋体"'));assert(!other.includes('w:eastAsia="楷体"'));
  console.log('Formatting: requirement extraction, defaults, parallel Word exports, fonts, sizes, spacing and margins passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
