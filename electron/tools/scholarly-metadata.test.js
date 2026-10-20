const assert=require('node:assert/strict');
const {lookupScholarlyMetadata}=require('./scholarly-metadata');
const loadSettings=()=>({permissions:{webAccess:'search'}});
const item={DOI:'10.1234/example',title:['Example study'],author:[{given:'A',family:'Author'}],published:{'date-parts':[[2020]]}};
let calls=0;
const fetchResource=async url=>{calls++;assert.equal(new URL(url).hostname,'api.crossref.org');return {body:Buffer.from(JSON.stringify({status:'ok',message:url.includes('?')?{items:[item]}:item}))};};
(async()=>{
 await assert.rejects(()=>lookupScholarlyMetadata({doi:item.DOI,loadSettings:()=>({}),fetchResource}),/网页访问已关闭/);assert.equal(calls,0);
 await assert.rejects(()=>lookupScholarlyMetadata({doi:'https://localhost/private',loadSettings,fetchResource}),/有效DOI/);assert.equal(calls,0);
 const exact=await lookupScholarlyMetadata({doi:'https://doi.org/'+item.DOI,loadSettings,fetchResource});
 assert.equal(exact.records[0].matchStatus,'doi-exact');assert.equal(exact.records[0].fullTextVerified,false);
 assert.equal(exact.records[0].verificationScope,'metadata-only');
 const candidates=await lookupScholarlyMetadata({query:'Different title',loadSettings,fetchResource});assert.equal(candidates.records[0].matchStatus,'candidate');
 const title=await lookupScholarlyMetadata({query:'Example study',loadSettings,fetchResource});assert.equal(title.records[0].matchStatus,'title-exact');
 await assert.rejects(()=>lookupScholarlyMetadata({doi:'10.1234/other',loadSettings,fetchResource}),/DOI与请求不一致/);
 await assert.rejects(()=>lookupScholarlyMetadata({query:'test',loadSettings,fetchResource:async()=>({body:Buffer.from('{}')})}),/有效记录/);
 console.log('scholarly metadata: permission gate, fixed endpoint, DOI/title verification and no full-text claims passed (offline fixtures)');
})().catch(e=>{console.error(e);process.exitCode=1;});
