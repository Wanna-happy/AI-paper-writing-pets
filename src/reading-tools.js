window.ReadingTools={mount(viewer,artifact){
  const data=artifact.upload||artifact.filePreview;
  if(!data||!['docx','spreadsheet','document'].includes(data.type))return;
  const details=node('details','reading-tools'),summary=node('summary');summary.textContent='查找与定位';
  const form=node('form'),query=node('input'),location=node('input'),status=node('output'),results=node('div','reading-results');
  query.type='search';query.placeholder='查找文档内容';query.setAttribute('aria-label','查找文档内容');query.maxLength=200;status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  location.placeholder=data.type==='spreadsheet'?'单元格，例如 C120':'页码';location.setAttribute('aria-label',location.placeholder);
  let index=0,lastQuery='',pdfMatches=null;const find=node('button');find.type='submit';find.textContent=data.type==='document'?'查找全文':'查找下一处';
  const locate=WritingWorkbench.button('定位',()=>{
    if(data.type==='document'){
      if(!/^\d+$/.test(location.value)||Number(location.value)<1||Number(location.value)>data.totalPages)throw new Error('请输入有效页码');
      viewer.querySelector(`[data-page="${Number(location.value)}"]`)?.scrollIntoView({block:'start'});
    }else viewer.querySelector('iframe')?.contentWindow.postMessage({type:'preview-locate',value:location.value},'*');
  });
  form.append(query,find,location,locate,status);details.append(summary,form,results);viewer.prepend(details);
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!query.value.trim())return;
    if(query.value!==lastQuery){index=0;lastQuery=query.value;pdfMatches=null;}
    if(data.type!=='document'){viewer.querySelector('iframe')?.contentWindow.postMessage({type:'preview-find',query:query.value,index:index++},'*');return;}
    find.disabled=true;status.textContent='正在查找全文…';results.replaceChildren();
    const requested=query.value;
    try{if(!data.dataBase64)throw new Error('请重新打开文件后查找');const result=pdfMatches||await window.petAPI.searchFileBytes({dataBase64:data.dataBase64,query:requested});if(!viewer.isConnected||query.value!==requested)return;pdfMatches=result;status.textContent=`${result.matches.length} 页匹配`;for(const match of result.matches)results.append(WritingWorkbench.button(`第 ${match.page} 页 · ${match.excerpt}`,()=>viewer.querySelector(`[data-page="${match.page}"]`)?.scrollIntoView({block:'start'})));}catch(error){status.textContent=`无法查找：${error.message}`;}finally{find.disabled=false;}
  });
  const listener=event=>{if(event.source===viewer.querySelector('iframe')?.contentWindow&&event.data?.type==='preview-find-result')status.textContent=event.data.message;};window.addEventListener('message',listener);
  const observer=new MutationObserver(()=>{if(!viewer.isConnected){window.removeEventListener('message',listener);observer.disconnect();}});observer.observe(el['empirical-preview-content'],{childList:true});
}};
