const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto'),JSZip=require('jszip');
const {createBackup,restoreBackup}=require('./project-backup');
(async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'paperpet-backup-'));
 try{
 const id=crypto.randomUUID(),docId=crypto.randomUUID(),conversationId=crypto.randomUUID(),draftId=crypto.randomUUID();
 const folder=path.join(root,'library',id);fs.mkdirSync(folder,{recursive:true});const file=path.join(folder,`${docId}.txt`);fs.writeFileSync(file,'原始文献');
 const attachmentId=crypto.randomUUID();fs.mkdirSync(path.join(root,'conversation-files'));fs.writeFileSync(path.join(root,'conversation-files',`${attachmentId}.csv`),'x,y\n1,2');
 const project={id,title:'测试',documents:[{id:docId,extension:'.txt',storedPath:file}],conversations:[{id:conversationId}],activeConversationId:conversationId,drafts:[{id:draftId,conversationId,content:'论文[E1]',attachments:[{id:attachmentId,extension:'.csv'}],history:[{revision:'v1',content:'旧稿'}]}],empiricalPlans:{[conversationId]:{id:crypto.randomUUID(),status:'approved',approvedAt:'yesterday',attachment:{id:docId}}}};
 const bytes=await createBackup(project,root),restored=await restoreBackup(bytes,root);
 assert.notEqual(restored.id,id);assert.notEqual(restored.drafts[0].id,draftId);assert.equal(restored.drafts[0].conversationId,restored.conversations[0].id);
 assert.equal(fs.readFileSync(restored.documents[0].storedPath,'utf8'),'原始文献');assert.equal(restored.drafts[0].history[0].content,'旧稿');
 assert.equal(restored.documents[0].storedPath,path.join(root,'library',restored.id,restored.documents[0].id+'.txt'));
 assert.equal(fs.readFileSync(path.join(root,'conversation-files',`${restored.drafts[0].attachments[0].id}.csv`),'utf8'),'x,y\n1,2');
 assert.equal(restored.empiricalPlans[restored.conversations[0].id].status,'pending-confirmation');
 const zip=await JSZip.loadAsync(bytes);const manifest=JSON.parse(await zip.file('manifest.json').async('string'));manifest.files[0].relative='../escape.txt';zip.file('manifest.json',JSON.stringify(manifest));
 const maliciousBytes=await zip.generateAsync({type:'nodebuffer'});await assert.rejects(()=>restoreBackup(maliciousBytes,root),/无效文件路径/);
 const tampered=await JSZip.loadAsync(bytes);tampered.file('files/0','伪造文献');const tamperedBytes=await tampered.generateAsync({type:'nodebuffer'});await assert.rejects(()=>restoreBackup(tamperedBytes,root),/校验失败|不一致/);
 console.log('project backup: restore content, history, identifiers, attachments and approval isolation passed');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
