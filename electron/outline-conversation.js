const {normalizeOutline}=require('./thesis-controller');
const crypto=require('node:crypto');

// The model can propose a structure; only an exact user confirmation commits it.
async function discussOutline({input,store,projectId,conversationId,confirm}) {
  const latest=()=>store.loadWorkspace().projects.find(p=>p.id===projectId);
  const project=latest();
  if(!project)throw new Error('项目不存在');
  const originalOutline=JSON.stringify(project.thesisProfile?.outline||[]);
  const previous=project.thesisProfile?.outline||project.thesisControl?.chapters||[];
  const outline=normalizeOutline((input.chapters||[]).map(c=>({...c,id:c.id||previous.find(old=>old.title===c.title)?.id||`outline-${crypto.randomUUID()}`})));
  if(!outline.length||outline.length>12)throw new Error('请提出1—12章的目录，复杂结构可先讨论一级章节');
  const description=outline.map((c,i)=>`${i+1}. ${c.title}${c.targetWords?`（约${c.targetWords}字）`:''}`).join('\n');
  if(description.length>430)throw new Error('请简化一级章节标题后再提交确认');
  const hash=crypto.createHash('sha256').update(JSON.stringify(outline)).digest('hex').slice(0,20);
  const id=`outline-${hash}`;
  const answer=await confirm({purpose:'outline',title:'论文目录建议',questions:[{id,decisionKey:id,question:`这是根据当前讨论提出的目录，尚未保存：\n${description}\n确认采用，或填写需要调整的内容。`,options:['确认采用此目录','继续讨论调整'],required:true}]});
  const card=latest()?.clarifications?.[conversationId];
  const response=(answer.answers||((answer.status==='already-confirmed'&&card?.status==='answered')?card.answers:[])||[]).find(a=>a.id===id)?.answer;
  if(response!=='确认采用此目录')return {status:answer.status==='pending'?'pending':'needs-discussion',feedback:response||'',outline,instruction:'目录尚未确认保存，继续根据用户反馈讨论，不自动写正文。'};
  const current=latest();
  // A concurrent conversation may have replaced the outline while this card waited.
  if(JSON.stringify(current.thesisProfile?.outline||[])!==originalOutline)throw new Error('其他对话已更新目录，请读取最新目录后重新讨论确认');
  store.updateProject(projectId,{thesisProfile:{...current.thesisProfile,outline,outlineConfirmed:true}});
  return {status:'confirmed',outline,instruction:'用户已确认，目录已保存；未授权写正文时只说明保存结果。'};
}
module.exports={discussOutline};
