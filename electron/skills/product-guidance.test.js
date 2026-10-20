const assert=require('node:assert/strict');
const {SkillRuntime}=require('./skill-runtime');
const {checks,methodGuidance}=require('./method-guidance');
const {methodCatalog,resolveMethod,planningContext}=require('../empirical-workflow');
const runtime=new SkillRuntime();
const cases=[
 ['writer','教育学','根据已有正文写摘要和关键词','abstract'],
 ['writer','文学','将中文摘要翻译成英文','abstract'],
 ['writer','教育学','撰写绪论','introduction'],
 ['writer','文学','写研究背景','introduction'],
 ['writer','管理学','写讨论与研究局限','discussion'],
 ['writer','文学','写论文结论','conclusion'],
 ['coordinator','文学','制定选题和开题报告','design'],
 ['writer','文学','建立理论框架','design'],
 ['coordinator','社会学','研究设计与研究方法','design'],
 ['collector','教育学','核验参考文献DOI与文中引用','evidence'],
 ['collector','社会学','参考文献作者年份核对','evidence'],
 ['analyst','管理学','开展案例研究与扎根理论编码','qualitative'],
 ['analyst','教育学','分析教师访谈并开展主题分析','qualitative'],
 ['analyst','心理学','进行Meta分析，合并效应量与异质性检验','review'],
 ['collector','医学','写系统综述 PRISMA','review'],
 ['coordinator','教育学','设计问卷与测量量表','questionnaire'],
 ['analyst','心理学','开展信效度检验与SEM CFA','questionnaire'],
 ['analyst','社会学','DTW聚类、LightGBM预测、TreeSHAP与LOWESS','prediction'],
 ['preparer','社会学','数据清洗缺失值处理与变量构造','preparation'],
 ['analyst','工学','预测建模与交叉验证，避免数据泄漏','prediction'],
 ['writer','社会学','结果解释与实证正文写作','results'],
 ['writer','社会学','润色和压缩正文并保持原意','editing'],
];
for(const [role,domain,task,key]of cases){
 const project={domains:[domain]},id='paper-pet::'+key;
 assert(runtime.fallbackSkillIds(task,project,role).includes(id),task);
 assert(runtime.getCatalog({project,task,role,limit:12}).slice(0,3).some(x=>x.id===id),task);
 const composed=runtime.composePrompt(project,task,[],9000,{role});
 assert(composed.skill.ids.includes(id),task);assert(composed.prompt.length<=9000);
 assert(composed.skill.fragments.every(x=>x.contentHash.length===64));
}
const old=runtime.composePrompt({domains:['教育学']},'根据正文写摘要和关键词',['thesis-planning'],9000,{role:'writer'});
assert(!old.skill.ids.some(id=>id.includes('Econfin-Proposal')));
assert(runtime.readDocument('paper-pet::abstract').text.includes('不执行开题流程'));
assert.throws(()=>runtime.readDocument('paper-pet::abstract','../product-guidance.js'));
assert(!runtime.fallbackSkillIds('Meta分析与异质性检验',{},'analyst').some(id=>/aer-robustness|Full-empirical/.test(id)));
assert(runtime.getCatalog({task:'写结论',role:'writer'}).every(s=>runtime.skills.get(s.id).tier!=='out-of-domain'));
assert.equal(runtime.getCatalog({task:'写结论',limit:0}).length,0);
assert.equal(runtime.getCatalog({task:'写摘要和关键词',role:'writer',project:{domains:['教育学'],goal:'economics regression python data analysis research '.repeat(1000)},limit:12})[0].id,'paper-pet::abstract');
for(const method of methodCatalog()) {
 assert.equal(method.validationStatus,'not-certified');
 if(method.status==='available')assert(checks[method.id]);
 else assert.throws(()=>resolveMethod(method.id),/尚未接入/);
}
assert.equal(resolveMethod('tree-shap-analysis').method.id,'prediction');
assert(methodGuidance({methodId:'prediction',label:'TreeSHAP LOWESS'}).includes('背景样本'));
assert(planningContext(null).includes('不表示依赖已安装'));
console.log(`${cases.length} role/discipline routing cases, legacy adaptation, bounded fragments and 36 method capability checks passed`);
