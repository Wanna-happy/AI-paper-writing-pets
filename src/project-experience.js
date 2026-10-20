window.ProjectExperience = (() => {
  const {button,plain}=WritingWorkbench;
  const libraryFilters=node('details','library-filters'),libraryFilterTitle=node('summary');libraryFilterTitle.textContent='筛选资料';libraryFilters.append(libraryFilterTitle);
  const libraryFields={};const libraryFilterRow=node('div','resource-filters');libraryFilters.append(libraryFilterRow);
  for(const [key,label] of [['author','作者'],['year','年份'],['tag','标签'],['status','处理状态']]){const input=node('select');input.setAttribute('aria-label',`筛选${label}`);input.dataset.filter=key;libraryFields[key]=input;libraryFilterRow.append(input);input.addEventListener('change',renderLibrary);}
  libraryFilterRow.append(button('清除筛选',()=>{resetLibraryFilters();renderLibrary();}));el['library-filter'].closest('.toolbar').after(libraryFilters);
  function resetLibraryFilters(){el['library-filter'].value='';for(const input of Object.values(libraryFields))input.value='';}
  function renderLibraryFilters(documents){
    for(const [key,input] of Object.entries(libraryFields)){
      const selected=input.value,values=[...new Set(documents.flatMap(d=>key==='tag'?d.tags||[]:[d[key]]).filter(Boolean).map(String))].sort((a,b)=>b.localeCompare(a,'zh-CN'));
      input.replaceChildren();const option=node('option');option.value='';option.textContent=`全部${{author:'作者',year:'年份',tag:'标签',status:'状态'}[key]}`;input.append(option);
      for(const value of values){const option=node('option');option.value=value;option.textContent=key==='status'?({parsed:'可用于写作','ocr-needed':'需要文字识别','parse-failed':'需重新处理',saved:'待处理',data:'分析数据'}[value]||value):value;input.append(option);}
      input.value=values.includes(selected)?selected:'';
    }
    const count=Object.values(libraryFields).filter(input=>input.value).length;libraryFilterTitle.textContent=count?`筛选资料 · ${count} 项已启用`:'筛选资料';
  }
  function matchesLibrary(document){return Object.entries(libraryFields).every(([key,input])=>!input.value||(key==='tag'?(document.tags||[]).includes(input.value):String(document[key]||'')===input.value));}
  function hasLibraryFilters(){return Object.values(libraryFields).some(input=>input.value);}
  const scope=node('section','project-resource-nav'),scopeTitle=node('p');scopeTitle.textContent='当前项目';scope.append(scopeTitle);document.querySelector('.sidebar-top').append(scope);
  const libraryNav=document.querySelector('.primary-nav [data-view="library"]');scope.append(libraryNav);
  const nav=button('项目成果',()=>{render();switchView('outcomes');});nav.className='nav-item';nav.dataset.view='outcomes';const icon=node('span');icon.textContent='▱';nav.prepend(icon);scope.append(nav);
  const page=node('section','view page-view outcomes-view');page.dataset.viewPanel='outcomes';
  const heading=node('h1');heading.textContent='项目成果';
  const intro=node('p');intro.textContent='集中查看已保存的文稿、数据副本和分析结果。上传原件仍为只读。';
  const search=node('input');search.type='search';search.placeholder='搜索文稿标题、正文或结果';search.setAttribute('aria-label','搜索项目成果');
  const category=node('select');category.setAttribute('aria-label','成果类型');
  for(const [value,label] of [['all','全部成果'],['paper','文稿'],['plan','分析方案'],['table','结果表'],['image','图表'],['data','数据副本'],['code','分析代码']]){const option=node('option');option.value=value;option.textContent=label;category.append(option);}
  const filters=node('div','resource-filters');filters.append(search,category);category.addEventListener('change',render);
  const actions=node('div','workbench-actions');
  filters.append(button('讨论论文目录',()=>{switchView('chat');el['task-input'].value='请结合当前研究问题、方法和已有讨论，帮我逐步完善论文目录，先讨论建议，确认后再保存。';resizeComposer();updateComposerAction();el['task-input'].focus();}));
  actions.append(button('组装全文',()=>exportAssembledThesis()),button('备份项目',async()=>{if(!WritingWorkbench.canLeave())return;if(streamingDraft)throw new Error('请先等待当前任务结束再备份');const result=await window.petAPI.backupProject(activeProject()?.id);if(!result.canceled)showToast('项目备份已保存，不包含模型密钥');}),button('从备份恢复副本',async()=>{if(!WritingWorkbench.canLeave())return;if(streamingDraft)throw new Error('请先等待当前任务结束再恢复');const result=await window.petAPI.restoreProjectBackup();if(!result.canceled){closeEmpiricalPreview();workspace=await window.petAPI.loadWorkspace();renderAll();render();showToast('已恢复为独立项目副本');}}));
  const list=node('div','outcomes-list');page.append(heading,intro,filters,actions,list);document.querySelector('.content-area').append(page);search.addEventListener('input',render);
  let scopeId=null;
  function render(){
    const project=activeProject();list.replaceChildren();if(!project){scopeTitle.textContent='尚未选择项目';intro.textContent='请选择项目后查看成果';document.querySelector('[data-view-panel="library"] .eyebrow').textContent='文献与研究资料';const p=node('p');p.textContent='请先创建或选择项目。';list.append(p);return;}
    if(scopeId!==project.id){scopeId=project.id;search.value='';category.value='all';resetLibraryFilters();renderLibrary();}
    scopeTitle.textContent=`当前项目 · ${project.title}`;scopeTitle.title=project.title;
    intro.textContent=`${project.title} / 项目成果 · 仅展示此项目已保存的文稿、数据和分析结果。`;
    document.querySelector('[data-view-panel="library"] .eyebrow').textContent=`${project.title} / 文献与研究资料`;
    const q=search.value.trim().toLowerCase();
    actions.querySelector('button').hidden=!project.drafts.some(d=>d.mode==='api');
    if(!q&&['all','paper'].includes(category.value)&&project.thesisProfile?.outlineConfirmed&&project.thesisControl?.chapters?.length){
      const outline=node('details','chapter-overview'),title=node('summary');title.textContent='论文章节与组装进度';outline.append(title);
      for(const chapter of project.thesisControl.chapters){const drafts=project.drafts.filter(d=>d.thesisUnit?.chapterId===chapter.id),row=node('div','outcome-row'),name=node('strong');name.textContent=chapter.title;const meta=node('p');meta.textContent=`${drafts.length} 份正文稿 · 目标约 ${chapter.targetWords||'未设置'} 字`;row.append(name,meta);for(const draft of drafts)row.append(button(draft.title||'打开章节稿',async()=>{if(!WritingWorkbench.canLeave())return;if(draft.conversationId!==activeConversation()?.id)await selectConversation(draft.conversationId);openPaperPreview(draft);}));outline.append(row);}list.append(outline);
    }
    for(const draft of [...project.drafts].filter(d=>d.channel!=='chat'&&d.mode!=='chat').sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))){
      if(!['all','paper'].includes(category.value))continue;
      if(q&&!`${draft.title} ${plain(draft.content)}`.toLowerCase().includes(q))continue;
      const row=node('section','outcome-row'),title=node('h2');row.dataset.conversationId=draft.conversationId||'unknown';row.dataset.resourceType='文稿';row.dataset.updatedAt=draft.updatedAt||draft.createdAt||'';title.textContent=draft.title||draft.task||'论文草稿';
      const meta=node('p');meta.textContent=`${plain(draft.content).length} 字符 · ${draft.deliveryStatus==='ready'?'已保存，可核验交付':'已保存，待核验'}`;
      row.append(title,meta,button('打开当前稿',async()=>{if(!WritingWorkbench.canLeave())return;if(streamingDraft)throw new Error('请先等待当前任务结束');if(draft.conversationId!==activeConversation()?.id)await selectConversation(draft.conversationId);switchView('workbench');openPaperPreview(draft);}));list.append(row);
      if(draft.mode==='api'&&project.thesisControl?.chapters?.length){
        const label=node('label');label.textContent='所属章节 ';const select=node('select');select.setAttribute('aria-label',`指定「${draft.title||'文稿'}」所属章节`);const empty=node('option');empty.value='';empty.textContent='选择章节';select.append(empty);
        for(const chapter of project.thesisControl.chapters){const option=node('option');option.value=chapter.id;option.textContent=chapter.title;select.append(option);}select.value=draft.thesisUnit?.chapterId||'';label.append(select);row.append(label);
        select.addEventListener('change',async()=>{if(!select.value)return;select.disabled=true;try{if(streamingDraft)throw new Error('请等待当前任务结束后调整章节');await window.petAPI.assignDraftChapter(project.id,draft.id,select.value);workspace=await window.petAPI.loadWorkspace();if(activeProject()?.id===project.id)render();}catch(error){showToast(error.message,true);select.value=draft.thesisUnit?.chapterId||'';}finally{select.disabled=false;}});
      }
      if(draft.mode==='api'&&draft.thesisUnit?.id)row.append(button(project.assemblySelections?.[draft.thesisUnit.id]===draft.id?'已选为组装稿':'设为组装稿',async()=>{await window.petAPI.updateProject(project.id,{assemblySelections:{...project.assemblySelections,[draft.thesisUnit.id]:draft.id}});workspace=await window.petAPI.loadWorkspace();render();}));
    }
    for(const [conversationId,plan] of Object.entries(project.empiricalPlans||{})){
      const row=node('section','outcome-row'),title=node('h2');row.dataset.conversationId=conversationId;row.dataset.resourceType='分析方案';row.dataset.updatedAt=plan.updatedAt||plan.createdAt||'';title.textContent=plan.researchQuestion||'实证分析';
      const meta=node('p');meta.textContent=`方案第 ${plan.revision} 版 · ${(plan.results||[]).filter(r=>r.status==='completed').length} 项已有结果`;
      const open=async()=>{if(!WritingWorkbench.canLeave())return false;if(streamingDraft)throw new Error('请先等待当前任务结束');if(conversationId!==activeConversation()?.id)await selectConversation(conversationId);switchView('workbench');return true;};
      row.append(title,meta,button('查看方案',async()=>{if(await open())openPlanPreview(plan);}));
      if(plan.results?.length)row.append(button('查看表图、代码和数据',async()=>{if(await open())await openEmpiricalPreview();}));
      if(['all','plan'].includes(category.value)&&(!q||`${plan.researchQuestion} ${(plan.steps||[]).map(s=>s.label).join(' ')}`.toLowerCase().includes(q)))list.append(row);
      for(const result of plan.results||[]){
        const label=plan.steps?.find(step=>step.id===result.stepId)?.label||'分析';
        const entries=[...(result.tables||[]).map((table,index)=>({kind:'table',index,name:table.title||`${label}结果表`})),...(result.files||result.charts||[]).map((file,index)=>({kind:'image',index,name:typeof file==='string'?file.split(/[\\/]/).at(-1):file.name})),...(result.dataFiles||result.preparedFiles||[]).map((file,index)=>({kind:'data',index,name:typeof file==='string'?file.split(/[\\/]/).at(-1):file.name})),...(result.code?[{kind:'code',index:0,name:`${label} · analysis_script.py`}]:[])];
        for(const entry of entries){
          if(category.value!=='all'&&category.value!==entry.kind)continue;
          if(q&&!`${entry.name} ${label} ${result.summary||''}`.toLowerCase().includes(q))continue;
          const file=node('section','outcome-row outcome-file'),name=node('h2'),detail=node('p');file.dataset.conversationId=conversationId;file.dataset.resourceType={table:'结果表',image:'图表',data:'数据副本',code:'分析代码'}[entry.kind];file.dataset.updatedAt=result.updatedAt||result.createdAt||'';name.textContent=entry.name||label;detail.textContent=`${file.dataset.resourceType} · ${label}`;
          file.append(name,detail,button('查看文件',async()=>{if(await open())await openEmpiricalPreview({planId:plan.id,revision:plan.revision,stepId:result.stepId,kind:entry.kind,index:entry.index});}));list.append(file);
        }
      }
    }
    for(const [conversationId,preparation] of Object.entries(project.dataPreparations||{})){
      if(!['all','data'].includes(category.value)||q&&!'清洗后的分析数据.csv'.includes(q))continue;
      const row=node('section','outcome-row'),title=node('h2'),detail=node('p');row.dataset.conversationId=conversationId;row.dataset.resourceType='数据副本';title.textContent='清洗后的分析数据.csv';detail.textContent=preparation.summary||'已生成清洗副本';row.append(title,detail,button('查看文件',async()=>{if(!WritingWorkbench.canLeave())return;if(conversationId!==activeConversation()?.id)await selectConversation(conversationId);const data=await window.petAPI.getPreparationPreview(project.id,conversationId,preparation.id);switchView('workbench');empiricalPreviewScope=`${project.id}/${conversationId}`;el['empirical-preview'].hidden=false;document.querySelector('.chat-view').classList.add('has-empirical-preview');renderArtifactPreview([{type:'text',name:data.name,text:data.text,filePreview:data.preview||textFilePreview(data.name,data.text),source:{kind:'preparation',preparationId:preparation.id}}]);}));list.append(row);
    }
    groupRows(list,'outcomes');
    if(!list.childElementCount){const empty=node('p');empty.textContent=q?'没有匹配的成果。':'暂无已保存成果。在对话中提出写作或分析任务后，可在这里找回。';list.append(empty);}
  }
  const collapsedGroups=new Map();
  function groupRows(host,kind){
    const project=activeProject(),groups=new Map();if(!project)return;
    for(const row of [...host.children]){
      if(!row.dataset.conversationId)continue;
      const id=row.dataset.conversationId,conversation=project.conversations?.find(item=>item.id===id),groupId=conversation?id:id==='public'?'public':'unknown';
      if(!groups.has(groupId)){
        const section=node('details','resource-group'),summary=node('summary'),body=node('div','resource-group-content');
        const title=conversation?.title||(groupId==='public'?'项目公共资料':'来源待归类');summary.textContent=title;
        const key=`${project.id}/${kind}/${groupId}`;section.open=!collapsedGroups.get(key);section.addEventListener('toggle',()=>collapsedGroups.set(key,!section.open));section.append(summary);
        if(conversation){const jump=button('查看来源对话',()=>selectConversation(conversation.id));jump.className='resource-source';body.append(jump);}
        section.append(body);groups.set(groupId,{section,summary,body,title,count:0});host.append(section);
      }
      const group=groups.get(groupId);group.count++;group.summary.textContent=`${group.title} · ${group.count} 个文件`;
      if(row.dataset.updatedAt){const time=node('small','resource-source');time.textContent=new Date(row.dataset.updatedAt).toLocaleString('zh-CN');row.append(time);}
      if(row.dataset.resourceType){row.dataset.fileType=row.dataset.resourceType;row.title=`${row.dataset.resourceType} · ${group.title}`;const badge=node('span','resource-kind');badge.textContent=row.dataset.resourceType;row.prepend(badge);}
      group.body.append(row);
    }
  }
  function groupLibrary(documents){
    const project=activeProject(),host=el['library-list'];if(!project)return;
    const origins=new Map();
    const add=(id,cid)=>{if(id&&cid&&!origins.has(id))origins.set(id,cid);};
    for(const file of project.projectFiles||[])for(const cid of file.sourceConversationIds||[]){add(file.id,cid);add(file.documentId,cid);}
    for(const item of [...(project.drafts||[]),...(project.messages||[])])for(const file of item.attachments||[]){add(file.id,item.conversationId);add(file.documentId,item.conversationId);}
    for(const row of host.children){const document=documents.find(item=>item.id===row.dataset.documentId);if(document){const linked=(project.projectFiles||[]).find(file=>file.id===document.id||file.documentId===document.id);row.dataset.conversationId=document.sourceConversationIds?.[0]||origins.get(document.id)||(linked?'unknown':'public');row.dataset.updatedAt=document.importedAt||'';const others=(linked?.sourceConversationIds||[]).slice(1).map(id=>project.conversations?.find(item=>item.id===id)?.title).filter(Boolean);if(others.length){const note=node('small','resource-source');note.textContent=`也用于：${others.join('、')}`;row.querySelector('div')?.append(note);}}}
    const q=el['library-filter'].value.trim().toLowerCase();
    for(const file of project.projectFiles||[]){
      if(documents.some(document=>document.id===file.id||document.id===file.documentId)||(project.documents||[]).some(document=>document.id===file.id||document.id===file.documentId))continue;
      if(q&&!file.name.toLowerCase().includes(q)||hasLibraryFilters())continue;
      const row=node('div','library-item'),label=node('strong');label.textContent=file.name;row.dataset.conversationId=file.sourceConversationIds?.[0]||origins.get(file.id)||'unknown';row.dataset.updatedAt=file.importedAt||'';
      row.append(label,button('预览',()=>{switchView('workbench');return openUploadedAttachment(file);}));host.append(row);
    }
    groupRows(host,'library');if(host.querySelector('.resource-group'))host.querySelector('.empty-page')?.remove();
  }
  function projectForm(){
    const form=el['project-form'],grid=form.querySelector('.form-grid'),type=el['project-type'].closest('label');
    grid.before(type);
    grid.style.gridTemplateColumns='1fr';
    form.querySelector('.project-field-help').textContent='请选择学科领域。语言与引用格式统一在设置中调整。';
  }
  function simplifySettings(){
    el['api-model'].placeholder='填写服务商支持的模型名称';
    const address=el['api-base-url'].closest('label'),advanced=node('details','api-advanced'),summary=node('summary');summary.textContent='高级连接设置';address.before(advanced);advanced.append(summary,address);
    const cards=document.getElementById('agent-api-configs').closest('.settings-card'),roles=node('details','api-advanced'),rolesTitle=node('summary');rolesTitle.textContent='为不同 Agent 单独配置（可选）';cards.before(roles);roles.append(rolesTitle,cards);
    const shortcuts=document.querySelector('.shortcut-list');if(shortcuts){const p=node('p');p.textContent='编辑正文：Ctrl+Enter 保存。选中正文后可用键盘选择润色操作。';shortcuts.append(p);}
  }
  function editMetadata(document){
    if(!WritingWorkbench.canLeave())return;
    const projectId=activeProject().id,pane=WritingWorkbench.inspector('metadata-editor','编辑文献信息'),dialog=pane.panel,form=node('form');
    const inputs={};for(const [key,label] of [['author','作者'],['year','发表年份'],['tags','标签（用逗号分隔）'],['note','文献笔记']]){const wrap=node('label'),input=node(key==='note'?'textarea':'input');wrap.textContent=label;input.value=key==='tags'?(document.tags||[]).join(', '):document[key]||'';input.maxLength=key==='note'?4000:200;inputs[key]=input;wrap.append(input);form.append(wrap);}
    form.append(button('取消',()=>pane.close()));const submit=node('button','primary-button');submit.type='submit';submit.textContent='保存信息';form.append(submit);
    form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{await window.petAPI.updateDocumentMetadata(projectId,document.id,{author:inputs.author.value,year:inputs.year.value,note:inputs.note.value,tags:inputs.tags.value.split(/[,，、]/)});workspace=await window.petAPI.loadWorkspace();renderLibrary();pane.close();}catch(error){submit.disabled=false;showToast(error.message,true);}});
    dialog.append(form);pane.open();inputs.author.focus();
  }
  projectForm();simplifySettings();
  document.querySelector('[data-view-panel="library"] .eyebrow').textContent='文献与研究资料';
  document.querySelector('[data-view-panel="library"] .page-header p:last-child').textContent='导入资料后可搜索正文、整理文献信息，并在写作时追溯原文。';
  return {render,editMetadata,renderLibraryFilters,matchesLibrary,hasLibraryFilters,groupLibrary};
})();
