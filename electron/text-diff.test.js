const assert=require('node:assert/strict');const {diff}=require('../src/text-diff');
for(const [a,b] of [['研究具有价值，样本为31国。','研究具有理论价值，样本为32国。'],['','新增'],['删除',''],['保持不变','保持不变'],['🙂原文\n保留\n删除段','🙂新稿\n保留\n新增段'],['a'.repeat(3000),'b'.repeat(3000)]]){
 const {parts}=diff(a,b);assert.equal(parts.filter(p=>p.type!=='insert').map(p=>p.text).join(''),a);assert.equal(parts.filter(p=>p.type!=='delete').map(p=>p.text).join(''),b);
}
const separated=diff('甲段旧句。中间保留内容。末尾旧句。','甲段新句。中间保留内容。末尾新句。');assert(separated.parts.some(p=>p.type==='equal'&&p.text.includes('中间保留内容')));
assert(diff('a'.repeat(3000),'b'.repeat(3000)).simplified);console.log('Manuscript diff reconstruction, separate edits, Unicode and bounded long-text fallback passed');
