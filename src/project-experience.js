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
    actions.querySelector('button').hidden=!project.drafts.some(d=>d.mode==='api'&&d.thesisUnit?.id);
    if(!q&&['all','paper'].includes(category.value)&&project.thesisControl?.chapters?.length){
      const outline=node('details','chapter-overview'),title=node('summary');title.textContent='论文章节与组装进度';outline.append(title);
      for(const chapter of project.thesisControl.chapters){const drafts=project.drafts.filter(d=>d.thesisUnit?.chapterId===chapter.id),row=node('div','outcome-row'),name=node('strong');name.textContent=chapter.title;const meta=node('p');meta.textContent=`${drafts.length} 份正文稿 · 目标约 ${chapter.targetWords||'未设置'} 字`;row.append(name,meta);for(const draft of drafts)row.append(button(draft.title||'打开章节稿',async()=>{if(!WritingWorkbench.canLeave())return;if(draft.conversationId!==activeConversation()?.id)await selectConversation(draft.conversationId);openPaperPreview(draft);}));outline.append(row);}list.append(outline);
    }
    for(const draft of [...project.drafts].filter(d=>d.channel!=='chat'&&d.mode!=='chat').sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))){
      if(!['all','paper'].includes(category.value))continue;
      if(q&&!`${draft.title} ${plain(draft.content)}`.toLowerCase().includes(q))continue;
      const row=node('section','outcome-row'),title=node('h2');title.textContent=draft.title||draft.task||'论文草稿';
      const meta=node('p');meta.textContent=`${plain(draft.content).length} 字符 · ${draft.deliveryStatus==='ready'?'已保存，可核验交付':'已保存，待核验'}`;
      row.append(title,meta,button('打开当前稿',async()=>{if(!WritingWorkbench.canLeave())return;if(streamingDraft)throw new Error('请先等待当前任务结束');if(draft.conversationId!==activeConversation()?.id)await selectConversation(draft.conversationId);switchView('workbench');openPaperPreview(draft);}));list.append(row);
      if(draft.mode==='api'&&draft.thesisUnit?.id)row.append(button(project.assemblySelections?.[draft.thesisUnit.id]===draft.id?'已选为组装稿':'设为组装稿',async()=>{await window.petAPI.updateProject(project.id,{assemblySelections:{...project.assemblySelections,[draft.thesisUnit.id]:draft.id}});workspace=await window.petAPI.loadWorkspace();render();}));
    }
    for(const [conversationId,plan] of Object.entries(project.empiricalPlans||{})){
      const row=node('section','outcome-row'),title=node('h2');title.textContent=plan.researchQuestion||'实证分析';
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
          const file=node('section','outcome-row outcome-file'),name=node('h2'),detail=node('p');name.textContent=entry.name||label;detail.textContent=`${{table:'结果表',image:'图表',data:'数据副本',code:'分析代码'}[entry.kind]} · ${label}`;
          file.append(name,detail,button('查看文件',async()=>{if(await open())await openEmpiricalPreview({planId:plan.id,revision:plan.revision,stepId:result.stepId,kind:entry.kind,index:entry.index});}));list.append(file);
        }
      }
    }
    if(!list.childElementCount){const empty=node('p');empty.textContent=q?'没有匹配的成果。':'暂无已保存成果。在对话中提出写作或分析任务后，可在这里找回。';list.append(empty);}
  }
  function projectForm(){
    const form=el['project-form'],grid=form.querySelector('.form-grid'),type=el['project-type'].closest('label');
    const details=node('details','project-optional'),summary=node('summary');summary.textContent='项目细节（可稍后完善）';details.append(summary);grid.before(type,details);details.append(grid,el['project-goal'].closest('label'),el['thesis-profile-fields']);
    el['thesis-profile-fields'].querySelector('legend').textContent='长论文档案（按需完善）';
    form.querySelector('.project-field-help').textContent='名称为必填。可先开始当前任务，再补充学科、篇幅、引用和学校要求。';
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
  return {render,editMetadata,renderLibraryFilters,matchesLibrary,hasLibraryFilters};
})();
