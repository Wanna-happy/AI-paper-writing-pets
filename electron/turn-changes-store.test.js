const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'turn-changes-store-')),original=Module._load;
Module._load=function(id,...args){return id==='electron'?{app:{getPath:()=>root},safeStorage:{isEncryptionAvailable:()=>false}}:original.call(this,id,...args);};
try{
 const store=require('./workspace-store'),changes=require('./turn-changes');
 store.createProject({title:'本轮撤销定向持久化'});let project=store.loadWorkspace().projects[0];const cid=project.activeConversationId;
 const before=store.saveDraft(project.id,{conversationId:cid,title:'原稿',content:'<p>原文</p>',mode:'local-draft'});
 const after=store.saveDraft(project.id,{...before,content:'<p>本轮修改</p>',runId:'persisted-turn',changeOrigin:'agent'});
 assert.equal(changes.review(store,project.id,cid,'persisted-turn').entries[0].before.content,'<p>原文</p>');
 changes.undo(store,project.id,cid,'persisted-turn');project=store.loadWorkspace().projects.find(p=>p.id===project.id);assert.equal(project.drafts.find(d=>d.id===after.id).content,'<p>原文</p>');assert(project.turnChanges['persisted-turn'].undoneAt);
 console.log('Targeted real workspace persistence: save captures trusted original and one atomic undo restores the draft with the ledger persisted');
}finally{Module._load=original;/* Keep the isolated SQLite profile until process exit releases its handles. */}
