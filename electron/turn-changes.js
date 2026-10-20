const crypto=require('node:crypto');
const snapshot=draft=>{if(!draft)return null;const {history,...data}=draft;return JSON.parse(JSON.stringify(data));};
const fingerprint=draft=>crypto.createHash('sha256').update(JSON.stringify(snapshot(draft))).digest('hex');
function record(project,before,after){
 if(after.changeOrigin!=='agent'||!after.runId)return;
 project.turnChanges||={};const turn=project.turnChanges[after.runId]||{runId:after.runId,conversationId:after.conversationId,entries:[]};
 const existing=turn.entries.find(entry=>entry.draftId===after.id),entry={draftId:after.id,name:`${after.title||'文稿'}.docx`,kind:existing?existing.kind:before?'modified':'added',before:existing?existing.before:snapshot(before),after:snapshot(after),fingerprint:fingerprint(after)};
 if(existing)turn.entries[turn.entries.indexOf(existing)]=entry;else turn.entries.push(entry);project.turnChanges[after.runId]=turn;
}
function review(store,projectId,conversationId,runId){const project=store.loadWorkspace().projects.find(item=>item.id===projectId),turn=project?.turnChanges?.[runId];if(!project||!project.conversations?.some(item=>item.id===conversationId))throw new Error('对话不属于当前项目');if(!turn)return {runId,entries:[]};if(turn.conversationId!==conversationId)throw new Error('变更不属于当前对话');return JSON.parse(JSON.stringify(turn));}
function undo(store,projectId,conversationId,runId){
 const turn=review(store,projectId,conversationId,runId);if(turn.undoneAt)throw new Error('本轮修改已撤销');const entries=turn.entries.filter(entry=>entry.kind==='modified'&&entry.before);if(!entries.length)throw new Error('本轮没有可撤销的已有稿件修改，新文件会保留');
 const project=store.loadWorkspace().projects.find(item=>item.id===projectId);
 for(const entry of entries){const current=project.drafts.find(item=>item.id===entry.draftId);if(!current||fingerprint(current)!==entry.fingerprint)throw new Error('文件已被后续操作修改，未执行任何撤销，请先核对当前稿');}
 const now=new Date().toISOString(),drafts=project.drafts.map(current=>{const entry=entries.find(item=>item.draftId===current.id);return entry?require('./draft-history').versionDraft(current,{...entry.before,changeOrigin:'user',expectedContent:current.content,versionLabel:'撤销本轮修改'},now):current;});
 store.updateProject(projectId,{drafts,turnChanges:{...project.turnChanges,[runId]:{...turn,undoneAt:now}}});return {undone:entries.length};
}
module.exports={record,review,undo,fingerprint};
