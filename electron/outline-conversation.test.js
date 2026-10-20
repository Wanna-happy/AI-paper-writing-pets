const assert=require('node:assert/strict');
const {discussOutline}=require('./outline-conversation');
async function main(){
 let project={id:'p',thesisProfile:{targetWords:20000,viewpoints:['保留已有观点']}};
 const store={loadWorkspace:()=>({projects:[structuredClone(project)]}),updateProject:(_id,patch)=>Object.assign(project,patch)};
 const chapters=[{id:'intro',title:'第一章 绪论',sectionIds:['introduction'],targetWords:2000},{id:'method',title:'第二章 研究设计',sectionIds:['method']}];
 const run=confirm=>discussOutline({input:{chapters},store,projectId:'p',conversationId:'c',confirm});
 assert.equal((await run(async()=>({status:'pending'}))).status,'pending');assert(!project.thesisProfile.outlineConfirmed);
 assert.equal((await run(async input=>({status:'answered',answers:[{id:input.questions[0].id,answer:'第二章需要先讨论'}]}))).status,'needs-discussion');assert(!project.thesisProfile.outline);
 const answer=async input=>({status:'answered',answers:[{id:input.questions[0].id,answer:'确认采用此目录'}]});
 assert.equal((await run(answer)).status,'confirmed');assert(project.thesisProfile.outlineConfirmed);assert.equal(project.thesisProfile.outline[0].id,'intro');assert.deepEqual(project.thesisProfile.viewpoints,['保留已有观点']);
 await assert.rejects(run(async input=>{project.thesisProfile.outline=[chapters[1]];return answer(input);}),/其他对话已更新/);
 const {makePlanningTools}=await import('./pi/agent-tools.mjs');const tool=makePlanningTools({submitThesisOutline:async()=>({status:'pending'})}).find(t=>t.name==='submit_thesis_outline');assert(tool);
 const policy=require('./agent/flow-policy');assert(policy.restrictTools([tool],'conversation').length);assert(!policy.restrictTools([tool],'writing').length);
 console.log('Conversation outline: suggestions and feedback do not save, explicit confirmation saves, concurrent changes protected, chat tool registered');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
