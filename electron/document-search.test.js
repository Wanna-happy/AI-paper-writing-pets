const assert=require('node:assert/strict');
const {searchEncodedDocument}=require('./upload-preview');
(async()=>{
 const dataBase64=require('../scripts/pdf-preview-fixture.cjs')(16).toString('base64');
 const found=await searchEncodedDocument({dataBase64,query:'PDF PAGE 16'});assert.equal(found.totalPages,16);assert.deepEqual(found.matches.map(m=>m.page),[16]);
 assert.equal((await searchEncodedDocument({dataBase64,query:'no such content'})).matches.length,0);
 await assert.rejects(()=>searchEncodedDocument({dataBase64,query:''}),/无效/);
 console.log('PDF full-document search, last-page match, no matches and invalid input passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
