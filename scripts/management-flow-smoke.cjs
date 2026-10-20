const {app,BrowserWindow,ipcMain}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.ui-smoke','management-flow',String(Date.now()));fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
app.whenReady().then(async()=>{
 const store=require('../electron/workspace-store'),tc=require('../electron/thesis-controller'),workflow=require('../electron/research-workflow');
 const project=store.createProject({title:'管理学流程定向验收',type:'硕士学位论文',domains:['管理学'],thesisProfile:{targetWords:20000,researchType:'case',methodology:'比较案例研究',viewpoints:['已有观点保留']}});
 const id=project.id;
 store.saveDraft(id,{title:'案例发现',task:'撰写案例研究发现',mode:'api',conversationId:project.activeConversationId,content:'<h1>案例发现</h1><p>这是合成验收正文，不代表实际研究结论。</p>',workflow:workflow.buildResearchWorkflow(project,'撰写案例研究发现')});
 const current=()=>store.loadWorkspace().projects.find(p=>p.id===id);
 ipcMain.handle('research-test-workspace',()=>store.loadWorkspace());
 ipcMain.handle('research-test-blueprint',(_e,input)=>({chapters:tc.buildChapterPlan(input),preflight:require('../electron/research-design').methodPreflight(input)}));
 ipcMain.handle('research-test-update',(_e,p,patch)=>store.updateProject(p,patch));
 ipcMain.handle('research-test-assign',(_e,p,d,c)=>store.assignDraftChapter(p,d,c));
 ipcMain.handle('research-test-outline',()=>require('../electron/outline-import').extractOutline('第一章 研究背景\n第二章 案例研究发现\n参考文献',tc.ensureThesisControl(current()).chapters));
 ipcMain.handle('research-test-assemble',()=>tc.buildAssembledThesis(current()));
 let exports=0;
 ipcMain.handle('research-test-export',async()=>{const draft=tc.buildAssembledThesis(current());const bytes=await require('../electron/word-export').buildAcademicDocx(current(),draft,{});fs.writeFileSync(path.join(out,'管理学组装草稿.docx'),bytes);exports++;return {canceled:false,checks:draft.checks};});
 const win=new BrowserWindow({show:false,width:1380,height:1000,webPreferences:{preload:path.join(__dirname,'ui-smoke-preload.cjs'),sandbox:true,contextIsolation:true,backgroundThrottling:false,additionalArguments:['--management-flow-ipc']}});require('../electron/app-security').secureWindow(win,root);
 const run=code=>win.webContents.executeJavaScript(code),capture=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 try{
  await win.loadFile(path.join(root,'src/feed.html'));
  await run(`(async()=>{window.check=(v,m)=>{if(!v)throw new Error(m)};window.waitFor=async test=>{for(let i=0;i<150&&!test();i++)await new Promise(r=>setTimeout(r,30));check(test(),'等待超时')};await waitFor(()=>!!settings&&!!activeProject());openProjectDialog(activeProject());check(!document.getElementById('project-language')&&!document.getElementById('project-citation')&&!document.getElementById('thesis-viewpoints')&&!document.querySelector('#thesis-profile-fields legend')&&!document.querySelector('.project-optional'),'已删除字段仍然显示');check(!el['thesis-profile-fields'].hidden,'两万字项目未显示研究档案');const kind=document.getElementById('project-research-type');kind.value='survey';kind.dispatchEvent(new Event('change'));el['thesis-methodology'].value='问卷 SEM CFA';el['thesis-methodology'].dispatchEvent(new Event('input'));await waitFor(()=>document.getElementById('project-method-status').textContent.includes('尚未接入'));})()`);
  await run(`el['project-dialog'].scrollTop=0;true;`);await capture('00-project-form');
  await run(`document.getElementById('project-method-status').scrollIntoView({block:'center'});true;`);await capture('01-sem-preflight');
  await run(`(async()=>{check(!document.querySelector('.research-outline'),'项目表单不得包含论文目录');document.getElementById('project-research-type').value='case';el['thesis-methodology'].value='比较案例研究';await saveProject({preventDefault(){}});openProjectDialog(activeProject());check(!activeProject().thesisProfile.outlineConfirmed,'编辑项目不得自动确认目录');el['project-dialog'].close();switchView('outcomes');[...document.querySelectorAll('button')].find(b=>b.textContent==='讨论论文目录').click();check(el['task-input'].value.includes('逐步完善论文目录'),'讨论目录应进入对话');})()`);
  const chapters=tc.buildChapterPlan(current());[chapters[0],chapters[1]]=[chapters[1],chapters[0]];chapters[1].title='第一章 自定义研究背景';
  const proposal=await require('../electron/outline-conversation').discussOutline({input:{chapters},store,projectId:id,conversationId:project.activeConversationId,confirm:async input=>({status:'answered',answers:[{id:input.questions[0].id,answer:'确认采用此目录'}]})});assert.equal(proposal.status,'confirmed');
  await run(`(async()=>{workspace=await window.petAPI.loadWorkspace();openProjectDialog(activeProject());check(!document.querySelector('.research-outline'),'重开项目不应出现目录编辑器');})()`);await capture('02-project-without-outline');
  await run(`(async()=>{el['project-dialog'].close();switchView('outcomes');ProjectExperience.render();const select=document.querySelector('.outcome-row select[aria-label^="指定"]');check(select,'成果中无法指定章节');const target=select.options[1].value;select.value=target;select.dispatchEvent(new Event('change'));await waitFor(()=>activeProject().drafts[0].thesisUnit.chapterId===target);check(!el['assemble-thesis-button'].hidden,'短硕士论文组装入口被隐藏');window.pendingExport=exportAssembledThesis();await waitFor(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='保留提示并导出'));[...document.querySelectorAll('button')].find(b=>b.textContent==='保留提示并导出').click();await pendingExport;})()`);
  assert.deepEqual(current().thesisProfile.viewpoints.map(v=>typeof v==='string'?v:v.statement),['已有观点保留']);assert.equal(exports,1);assert(current().thesisProfile.outlineConfirmed);assert.equal(current().thesisProfile.outline[1].id,'chapter-1');
  const zip=await require('jszip').loadAsync(fs.readFileSync(path.join(out,'管理学组装草稿.docx')));assert((await zip.file('word/document.xml').async('string')).includes('合成验收正文'));
  const saved=current();await store.closeWorkspace();assert.equal(store.loadWorkspace().projects.find(p=>p.id===id).thesisProfile.outline[1].title,'第一章 自定义研究背景');assert(saved.drafts[0].thesisUnit);
  console.log(JSON.stringify({caseProject:true,semPreflight:true,conversationOutlineConfirmation:true,chapterAssignment:true,shortThesisExport:true,sqliteReopen:true,output:out}));win.destroy();await store.closeWorkspace();app.exit(0);
 }catch(error){console.error(error);await capture('failure');win.destroy();await store.closeWorkspace();app.exit(1);}
});
