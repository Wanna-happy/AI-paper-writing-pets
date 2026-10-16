/* Generated manuscripts share one editor. Uploaded originals stay read-only. */
window.WritingWorkbench = (() => {
  const undo = new Map();
  const positions=new Map();
  const inspectors=new Map();
  function dismissInspectors(){for(const close of [...inspectors.values()].reverse())close();}
  function canLeave(){if(document.querySelector('[data-editing-dirty="true"]')){showToast('正文有未保存的修改，请先保存或取消编辑。',true);return false;}return true;}
  const plain = html => { const box = node('div'); box.innerHTML = renderPaperHtml(html || '');for(const br of box.querySelectorAll('br'))br.replaceWith(document.createTextNode('\n'));for(const block of box.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,tr,blockquote'))block.append(document.createTextNode('\n'));return box.textContent.trimEnd(); };
  const button = (label, action) => { const b=node('button'); b.type='button'; b.textContent=label;if(/^(接受修改|保存修改|恢复为新版本|导出当前稿|保留提示并导出)$/.test(label))b.className='primary-button'; b.addEventListener('click',()=>{try{b.actionPromise=Promise.resolve(action());b.actionPromise.catch(e=>showToast(e.message,true));}catch(e){showToast(e.message,true);}}); return b; };
  const key = (projectId, draftId) => `${projectId}/${draftId}`;
  function inspector(className,title){
    const host=el['empirical-preview-content'],panel=node('section',`workbench-inspector ${className}`),header=node('header'),heading=node('h2');heading.textContent=title;panel.setAttribute('role','region');panel.setAttribute('aria-label',title);
    const previousView=document.querySelector('.view.is-active')?.dataset.viewPanel||'workbench',previousHidden=el['empirical-preview'].hidden;
    const previous=[...host.children].map(element=>({element,hidden:element.hidden}));
    const back=button('返回',()=>close());back.className='inspector-back';header.append(back,heading);panel.append(header);
    let opened=false;
    function open(){if(opened)return;opened=true;inspectors.set(panel,close);switchView('workbench');for(const entry of previous)entry.element.hidden=true;host.append(panel);el['empirical-preview'].hidden=false;document.querySelector('.chat-view').classList.add('has-empirical-preview');syncProgressCardSpace();host.scrollTop=0;back.focus();}
    function close(){if(!opened)return;opened=false;inspectors.delete(panel);panel.remove();for(const entry of previous)if(entry.element.isConnected)entry.element.hidden=entry.hidden;if(previousHidden&&!host.querySelector('.workbench-inspector'))closeEmpiricalPreview();if(previousView!=='workbench')switchView(previousView);panel.dispatchEvent(new Event('close'));}
    return {panel,open,close};
  }
  function selectionDocument(selection,html){
    const clone=selection.prose.cloneNode(true);
    function corresponding(source){const path=[];for(let current=source;current!==selection.prose;current=current.parentNode)path.unshift([...current.parentNode.childNodes].indexOf(current));return path.reduce((parent,index)=>parent.childNodes[index],clone);}
    const range=document.createRange();range.setStart(corresponding(selection.range.startContainer),selection.range.startOffset);range.setEnd(corresponding(selection.range.endContainer),selection.range.endOffset);
    const startElement=range.startContainer.nodeType===Node.TEXT_NODE?range.startContainer.parentElement:range.startContainer;
    const endElement=range.endContainer.nodeType===Node.TEXT_NODE?range.endContainer.parentElement:range.endContainer;
    const paragraph=startElement.closest('p'),sameParagraph=paragraph&&paragraph===endElement.closest('p');
    const template=node('div');template.innerHTML=renderPaperHtml(html);
    if(sameParagraph&&range.toString()===paragraph.textContent)range.selectNode(paragraph);
    else if(sameParagraph&&template.childNodes.length===1&&template.firstChild.nodeName==='P')template.replaceChildren(...template.firstChild.childNodes);
    const fragment=document.createDocumentFragment();fragment.append(...template.childNodes);range.deleteContents();range.insertNode(fragment);
    return renderPaperHtml(clone.innerHTML);
  }
  function trackedDocument(before,after){
    const old=node('div'),article=node('article','assistant-prose manuscript-tracked');old.innerHTML=renderPaperHtml(before);article.innerHTML=renderPaperHtml(after);
    const difference=ManuscriptDiff.diff(old.textContent,article.textContent),changes=[];let offset=0;
    for(const part of difference.parts){if(part.type==='delete')changes.push({type:'delete',start:offset,text:part.text});else{if(part.type==='insert')changes.push({type:'insert',start:offset,end:offset+part.text.length});offset+=part.text.length;}}
    function nodes(){const result=[],walker=document.createTreeWalker(article,NodeFilter.SHOW_TEXT);let current,position=0;while(current=walker.nextNode()){result.push({current,start:position,end:position+current.length});position+=current.length;}return result;}
    for(const change of changes.reverse()){
      const texts=nodes();
      if(change.type==='insert'){
        for(const entry of texts.filter(t=>t.end>change.start&&t.start<change.end).reverse()){
          const start=Math.max(0,change.start-entry.start),end=Math.min(entry.current.length,change.end-entry.start);let piece=entry.current;
          if(end<piece.length)piece.splitText(end);if(start)piece=piece.splitText(start);
          const mark=node('ins');mark.setAttribute('aria-label','新增内容');piece.replaceWith(mark);mark.append(piece);
        }
      }else{
        const mark=node('del');mark.setAttribute('aria-label','删除的原文');mark.textContent=change.text;
        const point=texts.find(t=>t.end>change.start)||texts.at(-1);if(point){const range=document.createRange();range.setStart(point.current,Math.max(0,change.start-point.start));range.collapse(true);const added=point.current.parentElement.closest('ins');if(added)added.before(mark);else range.insertNode(mark);}else article.append(mark);
      }
    }
    return {article,difference};
  }
  function reviewReplacement(before, after, mode='edit') {
    if (document.getElementById('rewrite-review')) return Promise.resolve(false);
    return new Promise(resolve => {
      const pane=inspector('rewrite-review','全文修订'),dialog=pane.panel; dialog.id='rewrite-review';dialog.querySelector('header').remove();
      const columns=node('div','manuscript-diff');columns.setAttribute('aria-label','完整文章及修订标记');
      const {article,difference}=trackedDocument(before,after);
      const stats=node('p','diff-stats');const inserted=difference.parts.filter(p=>p.type==='insert').reduce((n,p)=>n+Array.from(p.text).length,0),deleted=difference.parts.filter(p=>p.type==='delete').reduce((n,p)=>n+Array.from(p.text).length,0);stats.textContent=inserted||deleted?`+ 新增 ${inserted} 字符　− 删除 ${deleted} 字符`:'正文文字没有变化（格式或元数据变化不在此对比中）';
      stats.textContent+=' · 红删 / 绿增';
      columns.append(stats,article);
      if(difference.simplified){const note=node('p','diff-detail-note');note.textContent='较长的变化按区间标示，未省略原文或新稿。';columns.append(note);}
      let accepted=false;
      const actions=node('div','workbench-actions');
      actions.append(button(mode==='compare'?'关闭比较':'取消',()=>pane.close()));
      if(mode!=='compare')actions.append(button('接受修改',()=>{accepted=true;pane.close();}));
      dialog.append(columns,actions);
      const zoomHost=document.getElementById('preview-document-controls'),originalControls=[...zoomHost.childNodes];
      const initialZoom=zoomHost.querySelector('select')?.value||'fit';
      const applyZoom=value=>{article.style.zoom=value==='fit'?'1':String(Number(value)/100);};
      zoomHost.replaceChildren(documentZoomControl(applyZoom,initialZoom));applyZoom(initialZoom);
      const previousFocus=document.activeElement;
      dialog.addEventListener('close',()=>{dialog.remove();if(zoomHost.isConnected)zoomHost.replaceChildren(...originalControls);previousFocus?.focus();resolve(accepted);},{once:true});
      pane.open();actions.querySelector('button').focus();
    });
  }
  function setUndo(projectId,draftId,before,after) { undo.set(key(projectId,draftId),{before,after}); }
  async function save(projectId,draft,content,versionLabel,expectedContent=draft.content) {
    const saved=await window.petAPI.saveDraft(projectId,{...draft,content,versionLabel,expectedContent});
    workspace=await window.petAPI.loadWorkspace();
    return saved;
  }
  function issueRecords(draft) {
    const records=(draft.checks||[]).map(message=>({message:String(message),type:'交付检查'}));
    if(draft.lengthReview?.warning)records.push({message:draft.lengthReview.warning,type:'篇幅'});
    const content=node('div');content.innerHTML=renderPaperHtml(draft.content||'');
    const marks=[...plain(draft.content).matchAll(/\bE\d+\b/g)].map(m=>m[0]);
    for(const mark of content.querySelectorAll('sup[data-footnote]'))marks.push(`E${mark.dataset.footnote}`);
    for(const id of new Set(marks))if(!(draft.evidence||[]).some(e=>e.evidenceId===id))records.push({id,type:'缺少出处',message:`${id} 缺少保存的原文证据，请核对来源。`});
    for(const evidence of draft.evidence||[]){
      const id=evidence.evidenceId;
      if(!evidence.documentName||!evidence.text)records.push({id,type:'来源不全',message:`${id||'引用'} 的来源名称或证据片段不全。`});
      else if(!(draft.reviewedEvidence||[]).some(e=>e.id===id&&e.text===evidence.text))records.push({id,type:'待人工核对',message:`${id} 原文片段尚未核对，请确认是否支持正文论断。`});
    }
    return records.filter((entry,index)=>records.findIndex(other=>other.message===entry.message)===index);
  }
  function checks(draft) {return issueRecords(draft).map(entry=>entry.message);}
  function mountEditor(viewer,prose,draft) {
    const projectId=activeProject().id, original=draft.content;
    const actions=node('div','workbench-actions'), status=node('p','editor-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const toolbar=node('div','manuscript-tools'); toolbar.append(actions,status); viewer.prepend(toolbar);
    let editing=false;
    const edit=button('编辑正文',()=>{editing=true;prose.contentEditable='true';status.textContent='编辑中 · 尚未保存';prose.focus();paint();});
    const saveButton=button('保存修改',async()=>{
      saveButton.disabled=true;
      try {
      const html=renderPaperHtml(prose.innerHTML);
      const saved=await save(projectId,draft,html,'手动编辑',original);
      delete prose.dataset.editingDirty;setUndo(projectId,draft.id,original,saved.content);openPaperPreview(saved);showToast('已保存修改');
      } finally { saveButton.disabled=false; }
    });
    const cancel=button('取消编辑',()=>{editing=false;delete prose.dataset.editingDirty;prose.innerHTML=renderPaperHtml(original);prose.contentEditable='false';status.textContent='已取消，原文保留';paint();});
    const undoButton=button('撤销上次修改',async()=>{
      const record=undo.get(key(projectId,draft.id)); if(!record) return;
      const current=activeProject()?.drafts.find(d=>d.id===draft.id);if(!current)throw new Error('稿件不存在');
      const saved=await save(projectId,current,record.before,'撤销修改',record.after);undo.delete(key(projectId,draft.id));openPaperPreview(saved);
    });
    actions.append(edit,saveButton,cancel,undoButton,button('导出 Word',()=>exportDraft(projectId,draft)));
    function paint(){edit.hidden=editing;saveButton.hidden=!editing;cancel.hidden=!editing;undoButton.disabled=!undo.has(key(projectId,draft.id));}
    paint();
    prose.addEventListener('input',()=>{prose.dataset.editingDirty='true';status.textContent='编辑中 · 尚未保存';});
    prose.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='Enter'&&editing){e.preventDefault();saveButton.click();}else if(e.altKey&&e.key==='Enter'){e.preventDefault();handleTextSelection();ensureSkillMenu().querySelector('button')?.focus();}});
    prose.addEventListener('paste',e=>{if(!editing)return;e.preventDefault();document.execCommand('insertText',false,e.clipboardData.getData('text/plain'));});
    const outline=node('details','manuscript-outline'), summary=node('summary');summary.textContent='文稿目录';outline.append(summary);
    for(const heading of prose.querySelectorAll('h1,h2,h3,h4')) outline.append(button(heading.textContent,()=>heading.scrollIntoView({block:'start',behavior:'smooth'})));
    if(outline.children.length>1) toolbar.append(outline);
    const issues=node('details','manuscript-checks'), issueTitle=node('summary'); const list=issueRecords(draft);issueTitle.textContent=`引用与交付检查 · ${list.length} 项待核验`;issues.append(issueTitle);
    for(const issue of list){const row=node('div','citation-issue'),text=node('p');text.textContent=`${issue.type} · ${issue.message}`;row.append(text);if(issue.id)row.append(button('定位引用',()=>{
      const evidence=issues.querySelector(`[data-evidence-id="${CSS.escape(issue.id)}"]`);
      if(evidence){evidence.open=true;evidence.scrollIntoView({block:'center'});return;}
      const mark=prose.querySelector(`sup[data-footnote="${CSS.escape(issue.id.replace(/^E/,''))}"]`);
      const block=mark||[...prose.querySelectorAll('p,li,td,h1,h2,h3,h4')].find(p=>p.textContent.includes(issue.id));
      if(block){block.scrollIntoView({block:'center'});block.classList.add('citation-located');setTimeout(()=>block.classList.remove('citation-located'),2500);}else showToast('当前正文未找到此引用标记，请核对来源列表。',true);
    }));issues.append(row);}
    const note=node('p');note.textContent='检查仅提示已记录的问题，不代表所有事实和引文已自动核验。';
    const evidenceList=createEvidenceList(draft);
    for(const detail of evidenceList.querySelectorAll('details')){
      const evidence=(draft.evidence||[]).find(e=>e.evidenceId===detail.dataset.evidenceId);if(!evidence)continue;
      const source=activeProject().documents.find(d=>d.id===evidence.documentId||d.name===evidence.documentName);
      if(source)detail.append(button('打开原资料',()=>{if(!canLeave())return;return openUploadedAttachment({...source,scope:'project',projectId});}));
      const reviewed=(draft.reviewedEvidence||[]).some(e=>e.id===evidence.evidenceId&&e.text===evidence.text);
      detail.append(button(reviewed?'来源片段已核对':'标记来源片段已核对',async()=>{
        if(!canLeave())return;
        const records=(draft.reviewedEvidence||[]).filter(e=>e.id!==evidence.evidenceId);if(!reviewed)records.push({id:evidence.evidenceId,text:evidence.text,reviewedAt:new Date().toISOString()});
        const saved=await save(projectId,{...draft,reviewedEvidence:records},draft.content,'更新来源核验记录',original);openPaperPreview(saved);
      }));
    }
    issues.append(note,evidenceList); viewer.append(issues);
    for(const mark of prose.querySelectorAll('sup[data-footnote]')) {
      mark.tabIndex=0;mark.setAttribute('role','button');mark.title='查看引用原文';
      const go=()=>{issues.open=true;const evidence=issues.querySelector(`[data-evidence-id="E${CSS.escape(mark.dataset.footnote)}"]`);if(evidence){evidence.open=true;evidence.scrollIntoView({block:'nearest'});}};
      mark.addEventListener('click',go);mark.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});
    }
    // Keyboard users can select text with Shift + arrows, then open the same menu.
    prose.addEventListener('keyup',handleTextSelection);
    status.textContent=`已保存 · ${new Date(draft.updatedAt||Date.now()).toLocaleString('zh-CN')}`;
    const scroller=el['empirical-preview-content'];scroller.dataset.manuscriptKey=key(projectId,draft.id);requestAnimationFrame(()=>{if(prose.isConnected)scroller.scrollTop=positions.get(key(projectId,draft.id))||0;});
  }
  async function exportReview(draft) {
    if(!canLeave())return false;
    const problems=checks(draft);
    return new Promise(resolve=>{
      const pane=inspector('export-review','确认导出稿件'),dialog=pane.panel;const info=node('p');info.textContent=`${draft.title||'论文草稿'} · 正文约 ${plain(draft.content).length} 字符`;
      dialog.append(info);for(const issue of problems){const p=node('p');p.textContent=issue;dialog.append(p);}
      const note=node('p');note.textContent='导出当前已保存稿件。未保存的编辑不会包含在文件中，请核对引用和排版。';dialog.append(note);
      let proceed=false;const controls=node('div','workbench-actions');controls.append(button('返回检查',()=>pane.close()),button(problems.length?'保留提示并导出':'导出当前稿',()=>{proceed=true;pane.close();}));dialog.append(controls);dialog.addEventListener('close',()=>resolve(proceed),{once:true});pane.open();
    });
  }
  el['empirical-preview-content'].addEventListener('scroll',()=>{const scroller=el['empirical-preview-content'];if(scroller.querySelector('.artifact-paper')&&scroller.dataset.manuscriptKey)positions.set(scroller.dataset.manuscriptKey,scroller.scrollTop);});
  window.addEventListener('beforeunload',event=>{if(!canLeave()){event.preventDefault();event.returnValue='';}});
  return {reviewReplacement,setUndo,mountEditor,exportReview,checks,issueRecords,plain,button,canLeave,inspector,dismissInspectors,selectionDocument,trackedDocument};
})();
