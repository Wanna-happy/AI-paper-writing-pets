const methods = require('../assets/research-runtime/methods.json').methods;
const TYPES = { case:'案例研究', qualitative:'访谈与质性研究', survey:'问卷研究', quantitative:'计量与定量研究', mixed:'混合研究', conceptual:'理论与文献研究' };
function inferType(value) {
  const s=String(value||'');
  const qualitative=/案例|访谈|田野|质性|定性|扎根|主题分析|case stud|qualitative/i.test(s);
  const quantitative=/问卷|量表|回归|计量|定量|面板|\bSEM\b|\bCFA\b|结构方程|实验|统计检验|预测模型|survey|quantitative/i.test(s);
  if(/混合研究|混合方法|mixed.method/i.test(s)||(qualitative&&quantitative))return 'mixed';
  if(/案例|case stud/i.test(s))return 'case';
  if(qualitative)return 'qualitative';
  if(/问卷|量表|\bSEM\b|\bCFA\b|结构方程|survey/i.test(s))return 'survey';
  if(quantitative)return 'quantitative';
  if(/理论研究|文献研究|概念研究|conceptual/i.test(s))return 'conceptual';
  return '';
}
function researchDesign(project={}, task='') {
  const profile=project.thesisProfile||{};
  const current=inferType(task), stored=TYPES[profile.researchType]?profile.researchType:'';
  const id=current||stored||inferType(profile.methodology)||inferType(project.goal)||'';
  return {id,label:TYPES[id]||'尚未明确研究类型',source:current?'current-task':stored?'project-choice':inferType(profile.methodology)?'methodology':id?'goal':'unspecified'};
}
const REQUIREMENTS = [
  [/\bSEM\b|\bCFA\b|结构方程|验证性因子/i,'sem-cfa'], [/错位.*DID|交错.*DID|staggered/i,'staggered-did'],
  [/动态面板|system.?GMM|difference.?GMM/i,'dynamic-panel-gmm'],[/Tobit|Heckman/i,'tobit-heckman'],
  [/空间计量|空间杜宾|空间滞后/i,'spatial-econometrics'],[/DML|因果森林|causal.forest|double.machine/i,'causal-ml'],
  [/复杂抽样|抽样加权/i,'survey-design'],[/面板回归|固定效应/i,'panel-fe'],[/OLS|线性回归/i,'ols'],
  [/信度|EFA|探索性因子/i,'reliability-efa'],
];
function methodPreflight(project={}, task='') {
  // Inspect declared methodology and this request, not incidental literature or project titles.
  const value=[project.thesisProfile?.methodology,task].filter(Boolean).join('\n').replace(/(?:不(?:使用|采用|做|进行)|无需|排除)\s*(?:SEM|CFA|结构方程)/gi,'');
  const requested=REQUIREMENTS.filter(([rx])=>rx.test(value)).map(([,id])=>methods.find(m=>m.id===id)).filter(Boolean);
  return {researchType:researchDesign(project,task),methods:requested.map(m=>({id:m.id,name:m.name,status:m.status,dependencyStatus:'check-at-execution'})),
    blockers:requested.filter(m=>m.status!=='available').map(m=>`${m.name}尚未接入执行；不得用其他方法替代或承诺已完成。`)};
}
function designContext(project={}, task='') {
  const preflight=methodPreflight(project,task);
  return '# 项目研究类型与方法预检查\n'+JSON.stringify(preflight)+'\n学科不等于方法。已有明确方法不重复询问；只有制定或执行受限制的计算方案时才阻断对应计算，文献解释与研究设计讨论仍可继续。当前请求与项目设置不同只约束本轮，长期更改须由用户明确更新项目。依赖与数据适用性仍需真实检查。';
}
module.exports={TYPES,inferType,researchDesign,methodPreflight,designContext};
