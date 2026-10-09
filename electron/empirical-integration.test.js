const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const e = require('./empirical-workflow');
const { runDataAnalysis, inspectDataFile } = require('./tools/code-analysis');
const { findPythonExecutable } = require('./tools/tool-registry');

async function test() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-empirical-'));
  try {
    const source = path.join(root, 'synthetic.csv');
    let csv = 'entity,time,x,z,y\n';
    for (let entity = 0; entity < 16; entity++) for (let time = 0; time < 8; time++) {
      const z = Math.sin(entity * 3 + time * 5), x = z + Math.cos(entity + time * 2) * .4;
      csv += `${entity},${time},${x},${z},${2 * x + entity * .3 + Math.sin(entity * 2 + time * 3) * .2}\n`;
    }
    fs.writeFileSync(source, csv);
    const attachment = { id: 'f', name: 'synthetic.csv', extension: '.csv' };
    const scope = { projectId: 'synthetic', conversationId: 'c', attachments: [attachment], resolveAttachment: () => source };
    const pending = e.normalizeProposal({ researchQuestion: '合成数据x与y关联', objective: 'association', dataFile: attachment.name, dataDescription: '国家年度合成面板，128行', steps: [{ methodId: 'ols', purpose: '测试实际估计', specification: 'y ~ x，HC3；仅合成测试' }] }, scope);
    const plan = e.approvePlan(pending, { id: pending.id, revision: 1 }, scope);
    const dependencies = { attachments: [attachment], resolveAttachment: () => source, userDataPath: root, projectId: 'synthetic', loadSettings: () => ({}), findPython: findPythonExecutable };
    const profile = await inspectDataFile({ ...dependencies, attachment });
    assert.equal(profile.rows, 128); assert.equal(profile.columns.length, 5);
    const code = `import os,json
assert os.environ.get('JOBLIB_MULTIPROCESSING') == '0'
import numpy as np,pandas as pd
print('DATA_LIBS_OK',flush=True)
import statsmodels.api as sm
print('STATSMODELS_OK',flush=True)
import statsmodels.formula.api as smf
from linearmodels.panel import PanelOLS
from linearmodels.iv import IV2SLS
print('LINEARMODELS_OK',flush=True)
from sklearn.linear_model import LinearRegression
print('SKLEARN_OK',flush=True)
from lifelines import KaplanMeierFitter
print('LIFELINES_OK',flush=True)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
df=pd.read_csv(os.environ['DATA_FILE'])
r=smf.ols('y ~ x',df).fit(cov_type='HC3')
print('OLS_OK',flush=True)
fe=PanelOLS.from_formula('y ~ 1 + x + EntityEffects',df.set_index(['entity','time'])).fit(cov_type='clustered',cluster_entity=True)
iv=IV2SLS.from_formula('y ~ 1 + [x ~ z]',df).fit(cov_type='robust')
ml=LinearRegression(n_jobs=1).fit(df[['x']],df.y)
km=KaplanMeierFitter().fit(np.arange(1,9),event_observed=[1,1,0,1,1,0,1,1])
assert 1.7 < fe.params['x'] < 2.3
assert np.isfinite(iv.params['x'])
assert ml.coef_[0] == ml.coef_[0]
plt.scatter(df.x,df.y);plt.xlabel('x');plt.ylabel('y');plt.savefig(os.path.join(os.environ['CHART_DIR'],'ols.png'));plt.close()
result={'schemaVersion':1,'stepId':'a1','methodId':'ols','status':'completed','sampleSize':int(r.nobs),'summary':'OLS实际拟合，样本量128，HC3标准误；系数为'+str(round(float(r.params['x']),3)),'tables':[{'title':'OLS回归结果','columns':['变量','系数','标准误','p值'],'rows':[[str(v),round(float(r.params[v]),3),round(float(r.bse[v]),3),round(float(r.pvalues[v]),3)] for v in r.params.index]}],'diagnostics':[{'panelCoefficient':float(fe.params['x']),'ivCoefficient':float(iv.params['x'])}],'limitations':['合成数据，仅用于验证程序']}
print('PAPER_PET_RESULT='+json.dumps(result,ensure_ascii=True,allow_nan=False))
`;
    let calls = 0;
    const result = await runDataAnalysis({ ...dependencies, analysisPlan: plan, stepId: 'a1', skillPrompt: '\nSKILL_SENTINEL_HC3\n', plan: { request: '测试合成数据', dataFile: attachment.name }, requestModel: async ({ messages }) => {
      calls++; assert(messages[0].content.includes('SKILL_SENTINEL_HC3')); assert(messages[1].content.includes('"methodId":"ols"'));
      return { content: '```python\n' + code + '\n```' };
    } });
    if (result.error) console.error(result.summary);
    assert.equal(result.error, null, result.error);
    assert.equal(result.structured.sampleSize, 128);
    assert.equal(result.files.length, 1); assert.equal(result.tables[0].rows.length, 2);
    assert.equal(result.sandbox.backend, 'windows-lpac-job'); assert.equal(result.structured.codeSha256.length, 64);
    const invalid = { ...plan, status: 'pending-confirmation' };
    await assert.rejects(runDataAnalysis({ ...dependencies, analysisPlan: invalid, stepId: 'a1' }), /尚未确认/);
    assert.equal(calls, 1);
    console.log('actual LPAC Python 3.14 OLS/FE/IV/sklearn/lifelines, profile/table/chart/provenance passed');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
