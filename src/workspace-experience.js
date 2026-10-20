// Shared workspace interactions: preserve reading position and use current pet artwork.
(() => {
  const scroller=el['chat-scroll'],latest=document.getElementById('chat-latest');
  let readingRevision=0;
  for(const event of ['wheel','touchstart','pointerdown','keydown'])scroller.addEventListener(event,()=>{readingRevision++;},{passive:true});
  const atBottom=()=>scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<48;
  function updateLatest(){const busy=!!streamingDraft&&(!streamingDraft.projectId||streamingDraft.projectId===activeProject()?.id)&&(!streamingDraft.conversationId||streamingDraft.conversationId===activeConversation()?.id);latest.hidden=!busy&&atBottom();latest.textContent=busy?'…':'↓';latest.classList.toggle('is-busy',busy);latest.setAttribute('aria-label',busy?'任务执行中，回到最新消息':'回到最新消息');}
  window.addEventListener('turn-state-change',updateLatest);
  scroller.addEventListener('scroll',()=>{chatFollowsLatest=atBottom();updateLatest();},{passive:true});
  latest.addEventListener('click',()=>{readingRevision++;chatFollowsLatest=true;scrollConversation(true);updateLatest();});
  new MutationObserver(updateLatest).observe(el.conversation,{childList:true,subtree:true});
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='f'&&!el['empirical-preview'].hidden){const viewer=el['empirical-preview-content'].querySelector('.artifact-viewer:not([hidden])'),find=viewer?.querySelector('.reading-tools');if(find){event.preventDefault();find.hidden=false;find.querySelector('input')?.focus();}}});
  const scope=()=>`${activeProject()?.id}/${activeConversation()?.id}`;
  function anchor(){const box=scroller.getBoundingClientRect(),item=[...el.conversation.children].find(item=>item.getBoundingClientRect().bottom>box.top);return {scope:scope(),revision:readingRevision,item,offset:item?item.getBoundingClientRect().top-box.top:0,top:scroller.scrollTop,bottom:atBottom()};}
  function restore(saved){if(!saved||saved.scope!==scope()||saved.revision!==readingRevision)return;if(saved.bottom){scrollConversation(true);return;}const box=scroller.getBoundingClientRect();if(saved.item?.isConnected)scroller.scrollTop+=saved.item.getBoundingClientRect().top-box.top-saved.offset;else scroller.scrollTop=saved.top;updateLatest();}
  function wrap(name,fn){return function(...args){const saved=anchor();layoutAnchor=saved;const result=fn.apply(this,args);requestAnimationFrame(()=>restore(saved));if(result?.then)return result.finally(()=>requestAnimationFrame(()=>restore(saved)));return result;};}
  openUploadedAttachment=wrap('upload',openUploadedAttachment);openPaperPreview=wrap('paper',openPaperPreview);openPlanPreview=wrap('plan',openPlanPreview);openEmpiricalPreview=wrap('result',openEmpiricalPreview);closeEmpiricalPreview=wrap('close',closeEmpiricalPreview);
  let layoutAnchor;
  document.getElementById('preview-expand').addEventListener('pointerdown',()=>{layoutAnchor=anchor();});
  document.getElementById('preview-expand').addEventListener('click',()=>{requestAnimationFrame(()=>restore(layoutAnchor));});
  document.getElementById('preview-resizer').addEventListener('pointerdown',()=>{layoutAnchor=anchor();});
  let lastWidth=scroller.clientWidth;
  new ResizeObserver(()=>{if(lastWidth!==scroller.clientWidth){lastWidth=scroller.clientWidth;restore(layoutAnchor);}updateLatest();}).observe(scroller);
  function avatars(){const pet=PETS[settings?.pet]?settings.pet:'ember-pup';for(const avatar of document.querySelectorAll('.assistant-avatar,.empty-pet')){
    if(avatar.dataset.pet===pet)continue;avatar.dataset.pet=pet;avatar.setAttribute('role','img');avatar.setAttribute('aria-label',settings?.petName||'论文伙伴');const sprite=node('span','pet-preview-sprite');sprite.dataset.petPreview=pet;sprite.setAttribute('aria-hidden','true');avatar.replaceChildren(sprite);
  }}
  new MutationObserver(avatars).observe(el.conversation,{childList:true,subtree:true});
  let renderedScope='';const previousRenderAll=renderAll;renderAll=function(...args){const current=scope();if(current!==renderedScope){renderedScope=current;chatFollowsLatest=true;}const result=previousRenderAll(...args);avatars();layoutAnchor=null;return result;};
  window.petAPI.onPetChanged?.(pet=>{if(settings)settings.pet=pet;avatars();});
  const maximize=document.getElementById('window-maximize');
  async function control(action){try{const state=await window.petAPI.controlWorkspaceWindow?.(action);if(!state)return;maximize.textContent=state.maximized?'❐':'□';maximize.setAttribute('aria-pressed',String(state.maximized));maximize.setAttribute('aria-label',state.maximized?'还原窗口':'最大化');maximize.title=state.maximized?'还原窗口':'最大化';}catch(error){showToast(error.message,true);}}
  document.getElementById('window-minimize').addEventListener('click',()=>void control('minimize'));maximize.addEventListener('click',()=>void control('toggle-maximize'));
  window.addEventListener('resize',()=>void control('state'));void control('state');
})();
