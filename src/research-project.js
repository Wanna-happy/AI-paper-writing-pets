window.ResearchProject=(()=>{
  const fields=document.getElementById('thesis-profile-fields');
  const make=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
  const typeLabel=make('label','研究类型（与学科分别设置）'),type=make('select');type.id='project-research-type';
  for(const [value,label]of [['','尚未明确，沿用研究方法说明'],['case','案例研究'],['qualitative','访谈与质性研究'],['survey','问卷研究'],['quantitative','计量与定量研究'],['mixed','混合研究'],['conceptual','理论与文献研究']]){const option=make('option',label);option.value=value;type.append(option);}typeLabel.append(type);fields.prepend(typeLabel);
  const status=make('p');status.id='project-method-status';status.className='project-field-help';status.setAttribute('role','status');typeLabel.after(status);
  let generation=0,revision=0;
  function input(){return {type:el['project-type'].value,domains:[...el['project-domains'].querySelectorAll('input:checked')].map(i=>i.value),thesisProfile:{targetWords:Number(el['thesis-target-words'].value)||50000,researchType:type.value,methodology:el['thesis-methodology'].value}};}
  async function preflight(){const token=generation,version=revision;status.textContent='正在核对研究方法…';try{const value=await window.petAPI.getResearchBlueprint(input());if(token!==generation||version!==revision)return;status.textContent=value.preflight.blockers.length?value.preflight.blockers.join(' '):`${value.preflight.researchType.label}。具体方法仍需核对数据、依赖与确认方案。`;}catch(error){if(token===generation&&version===revision)status.textContent=error.message;}}
  type.addEventListener('change',()=>{revision++;preflight();});
  let timer;
  el['thesis-methodology'].addEventListener('input',()=>{revision++;clearTimeout(timer);timer=setTimeout(preflight,250);});
  function open(project){generation++;revision=0;type.value=project?.thesisProfile?.researchType||'';preflight();}
  function read(){return {researchType:type.value};}
  return {open,read};
})();
