const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {runDataAnalysis}=require('./tools/code-analysis'),{findPythonExecutable,runProcess}=require('./tools/tool-registry');
const {fingerprint}=require('./empirical-workflow');
async function main(){
 const root=path.resolve(__dirname,'../.ui-smoke/management-regression',String(Date.now()));fs.mkdirSync(root,{recursive:true});const file=path.join(root,'survey.csv');
 fs.writeFileSync(file,'x,y\n'+Array.from({length:20},(_,i)=>`${i+1},${1+2*(i+1)+(i%2?.2:-.2)}`).join('\n'));
 const original=fingerprint(file),step={id:'a1',methodId:'ols',label:'管理学合成问卷OLS验收',purpose:'校验真实执行与交接',specification:'y~1+x，报告系数及95%CI',outputs:'系数表'};
 const analysisPlan={id:'management-plan',projectId:'management',conversationId:'c',revision:1,status:'approved',attachment:{id:'survey',name:'survey.csv',extension:'.csv'},dataFingerprint:original,dataSelection:{},steps:[step],objective:'association',researchQuestion:'管理学问卷回归合成验收'};
 const code=`import os,json,matplotlib
matplotlib.use('Agg')
import pandas as pd
import numpy as np
import statsmodels.api as sm
d=pd.read_csv(os.environ['DATA_FILE'])
X=sm.add_constant(d[['x']])
m=sm.OLS(d['y'],X).fit()
ci=m.conf_int()
result={'schemaVersion':1,'stepId':'a1','methodId':'ols','status':'completed','sampleSize':int(m.nobs),'summary':'合成数据OLS估计已完成，仅作程序验收，不代表真实管理学结论。','tables':[{'title':'OLS系数','columns':['变量','系数','下界','上界'],'rows':[[str(k),float(m.params[k]),float(ci.loc[k,0]),float(ci.loc[k,1])] for k in m.params.index]}],'diagnostics':['design_rank='+str(np.linalg.matrix_rank(X))],'limitations':['合成数据，仅用于定向测试，不作因果推断']}
print('PAPER_PET_RESULT='+json.dumps(result,ensure_ascii=True,allow_nan=False))`;
 let hasChecks=false;
 const result=await runDataAnalysis({plan:{request:step.label,dataFile:'survey.csv'},request:step.label,analysisPlan,stepId:'a1',attachments:[analysisPlan.attachment],resolveAttachment:()=>file,userDataPath:root,projectId:'management',findPython:findPythonExecutable,executeProcess:runProcess,loadSettings:()=>({}),requestModel:async input=>{hasChecks=input.messages[0].content.includes('当前方法检查卡');return {content:'```python\n'+code+'\n```'};}});
 assert.equal(result.error,null,result.error);assert(hasChecks);assert.equal(result.structured.sampleSize,20);const estimate=result.structured.tables[0].rows.find(r=>r[0]==='x')[1];assert(Math.abs(estimate-2)<.01);assert.equal(fingerprint(file),original);assert.equal(result.structured.validation.statisticalCorrectness,'not-certified');
 console.log('management survey: real sandbox OLS, known coefficient, CI table, original preserved and source-bound result passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
