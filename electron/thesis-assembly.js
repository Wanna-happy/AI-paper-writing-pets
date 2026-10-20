function assemble(project) {
  const {ensureThesisControl,createThesisUnit}=require('./thesis-controller');
  const control=ensureThesisControl(project), checks=[],latest=new Map();
  for(const draft of project.drafts||[]) {
    if(draft.mode!=='api'||!String(draft.content||'').trim())continue;
    const unit=draft.thesisUnit||createThesisUnit(project,draft.workflow||{},draft.task||'',{conversationId:draft.conversationId});
    if(!unit){checks.push(`稿件「${draft.title||draft.id}」尚未指定章节，未并入全文；请指定章节归属。`);continue;}
    const old=latest.get(unit.id);
    if(!old||new Date(draft.updatedAt||draft.createdAt||0)>new Date(old.updatedAt||old.createdAt||0))latest.set(unit.id,{...draft,thesisUnit:unit});
  }
  for(const [id,draftId]of Object.entries(project.assemblySelections||{})){
    const draft=(project.drafts||[]).find(d=>d.id===draftId&&d.mode==='api'&&d.thesisUnit?.id===id&&d.content);
    if(draft)latest.set(id,draft);
  }
  const all=[...latest.values()];
  const chapters=control.chapters.flatMap(c=>all.filter(d=>d.thesisUnit.chapterId===c.id).sort((a,b)=>(a.thesisUnit.sequence||0)-(b.thesisUnit.sequence||0)));
  const whole=all.filter(d=>d.thesisUnit.chapterId==='whole-document').sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
  const units=chapters.length?chapters:whole.slice(0,1);
  if(chapters.length&&whole.length)checks.push('已有分章节正文，未重复拼入独立全文稿。');
  for(const d of all.filter(d=>d.thesisUnit.chapterId!=='whole-document'&&!control.chapters.some(c=>c.id===d.thesisUnit.chapterId)))checks.push(`稿件「${d.title||d.id}」所属章节已移出目录，未并入全文；原稿保留。`);
  let noteNumber=0,figureNumber=0,tableNumber=0;
  const content=units.map(draft=>{
    let body=draft.content;const notes=new Map();
    for(const match of body.matchAll(/data-footnote=["'](\d+)["']/g))if(!notes.has(match[1]))notes.set(match[1],++noteNumber);
    body=body.replace(/<sup\b([^>]*data-footnote=["'])(\d+)(["'][^>]*)>[\s\S]*?<\/sup>/gi,(_,before,id,after)=>`<sup${before}${notes.get(id)}${after}>${notes.get(id)}</sup>`);
    body=body.replace(/<p\b([^>]*data-footnote=["'])(\d+)(["'][^>]*)>\s*<sup>\d+<\/sup>/gi,(_,before,id,after)=>`<p${before}${notes.get(id)}${after}><sup>${notes.get(id)}</sup>`);
    const numbers={表:new Map(),图:new Map()};
    for(const caption of body.matchAll(/<(?:p\b[^>]*class=["'][^"']*table-title[^"']*["'][^>]*|figcaption\b[^>]*)>([\s\S]*?)<\/(?:p|figcaption)>/gi)){
      const n=caption[1].replace(/<[^>]*>/g,'').match(/(表|图)\s*(\d+)(?![\d.－—-])/);
      if(n&&!numbers[n[1]].has(n[2]))numbers[n[1]].set(n[2],n[1]==='表'?++tableNumber:++figureNumber);
    }
    body=body.replace(/(<[^>]+>)|([^<]+)/g,(whole,tag,value)=>tag||value.replace(/(表|图)\s*(\d+)(?![\d.－—-])/g,(original,kind,id)=>numbers[kind].has(id)?`${kind} ${numbers[kind].get(id)}`:original));
    const refs=[...body.matchAll(/<sup\b[^>]*data-footnote=["'](\d+)["']/g)].map(m=>m[1]);
    const defs=new Set([...body.matchAll(/<p\b[^>]*data-footnote=["'](\d+)["']/g)].map(m=>m[1]));
    if(refs.some(id=>!defs.has(id)))checks.push(`稿件「${draft.title||draft.id}」存在缺少来源说明的脚注。`);
    checks.push(...(draft.checks||[]).map(item=>`${draft.title||draft.id}：${item}`));
    if(/待核验|待补|TODO|TBD|\[E\d+\]/i.test(body))checks.push(`稿件「${draft.title||draft.id}」存在待补或未核验内容。`);
    return body;
  }).join('\n\n');
  const draftedWords=units.reduce((sum,d)=>sum+String(d.content).replace(/<[^>]*>/g,' ').replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/g,' ').replace(/\s/g,'').length,0);
  if(!units.length)checks.push('尚无可组装的正式正文，请先完成正文并指定章节。');
  if(draftedWords<control.profile.targetWords)checks.push(`当前可组装正文约 ${draftedWords} 字，低于目标 ${control.profile.targetWords} 字。`);
  if(!whole.length||chapters.length)for(const c of control.chapters)if(!chapters.some(d=>d.thesisUnit.chapterId===c.id))checks.push(`缺少章节：${c.title}。`);
  if(!control.outlineConfirmed)checks.push('论文目录尚未确认，请在项目设置中核对。');
  const budget=control.chapters.reduce((sum,c)=>sum+(c.targetWords||0),0);
  if(budget&&budget!==control.profile.targetWords)checks.push(`章节预算合计 ${budget} 字，与全文目标 ${control.profile.targetWords} 字不同，请核对。`);
  checks.push(...require('./research-design').methodPreflight(project).blockers);
  if(!control.profile.schoolOrJournal)checks.push('尚未提供学校或期刊格式要求，请核对模板。');
  checks.push('本次仅组装已有正文；参考文献完整性、跨章论证及复杂学校格式仍需核对。');
  return {title:`${project.title||'论文'}（组装草稿）`,task:'按确认目录组装当前论文草稿',content,
    citations:[...new Set(units.flatMap(d=>d.citations||[]))],evidence:units.flatMap(d=>(d.evidence||[]).map(e=>({...e,sourceDraftId:d.id}))),
    mappings:units.flatMap(d=>(d.mappings||[]).map(m=>`${d.title||d.id}：${m}`)),checks:[...new Set(checks)],deliveryStatus:'needs-review',mode:'assembled-thesis',thesisControl:control,
    assembly:{unitIds:units.map(d=>d.thesisUnit.id),draftIds:units.map(d=>d.id),draftedWords,figureCount:figureNumber,tableCount:tableNumber,footnoteCount:noteNumber}};
}
module.exports={assemble};
