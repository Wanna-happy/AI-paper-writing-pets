const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { rememberAnswers, decisionContext, unansweredQuestions } = require('./agent/decision-memory');
const { inspectDataFile, runDataAnalysis } = require('./tools/code-analysis');
const { findPythonExecutable } = require('./tools/tool-registry');
const workflow = require('./empirical-workflow');
const { artifactFile } = require('./empirical-artifacts');

async function main() {
  const project = { id: 'p', clarifications: { c: { id: 'first', status: 'answered', questions: [{ id: 'q', decisionKey: 'analysis-chain', question: '是否保持路径 A？' }], answers: [{ id: 'q', answer: '保持路径 A' }] } } };
  project.confirmedDecisions = rememberAnswers(project, project.clarifications);
  project.clarifications.c = { id: 'second', status: 'pending', questions: [{ id: 'new', question: '聚类输入变量？' }] };
  const reloaded = JSON.parse(JSON.stringify(project));
  assert(decisionContext(reloaded, 'c').includes('保持路径 A'), '换卡、重载后不能丢失明确答案');
  assert.equal(unansweredQuestions([{ decisionKey: 'analysis-chain', question: '再次确认方法链？', options: ['保持路径 A'] }], reloaded, 'c').length, 0);
  assert.equal(unansweredQuestions([{ question: '聚类输入变量？' }], reloaded, 'c').length, 1, '新变量设定不能被方法确认吞掉');
  assert.equal(unansweredQuestions([{ decisionKey: 'analysis-chain', options: ['路径 B'], question: '更改路径？' }], reloaded, 'c').length, 1);
  assert(!decisionContext(reloaded, 'other').includes('保持路径 A'), '对话决策不能串线');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-conversation-repair-'));
  try {
    const source = path.join(root, 'dirty.csv');
    const original = 'country_id,year,Cash_support,Time_support\n1,2020,"1,234.50",12\n1,2021,"2 000.0",24\n15,2020,"3,000",12\n1,2022,"4,000",12\n2,2020,"1\u202f500",\n2,2021,"1,600",36\n';
    fs.writeFileSync(source, original);
    const attachment = { id: 'data', name: 'dirty.csv', extension: '.csv' };
    let pythonCalls = 0;
    const dependencies = { attachment, attachments: [attachment], resolveAttachment: () => source, userDataPath: root, projectId: 'p', loadSettings: () => ({}), findPython: async settings => { pythonCalls++; return findPythonExecutable(settings); } };
    const raw = await inspectDataFile(dependencies);
    assert.equal(raw.rows, 6);
    assert.equal(raw.columns.find(item => item.name === 'Cash_support').numericProbe.invalidCount, 0, 'object 类型不等于非法字符');
    const cached = await inspectDataFile(dependencies);
    assert.equal(cached.cacheHit, true);
    assert.equal(pythonCalls, 1, '第二轮相同文件和范围不启动 Python');
    const selection = { yearRange: { min: 2020, max: 2021 }, filters: [{ column: 'country_id', op: 'ne', values: ['15'] }], numericColumns: ['Cash_support'], missingValues: [{ column: 'Time_support', values: ['12'] }] };
    const selected = await inspectDataFile({ ...dependencies, selection });
    assert.equal(selected.rows, 4); assert.equal(selected.rowsBeforeFilter, 6);
    assert.equal(selected.cacheHit, false, '全表缓存不能代替筛选口径');
    assert.equal(selected.columns.find(item => item.name === 'Cash_support').statistics.mean, 1583.625);
    assert.equal(selected.columns.find(item => item.name === 'Time_support').missing, 2);
    const scope = { projectId: 'p', conversationId: 'c', attachments: [attachment], resolveAttachment: dependencies.resolveAttachment };
    const propose = () => workflow.normalizeProposal({ researchQuestion: '合成清洗链路验收', dataFile: attachment.id, dataDescription: '明确年份与国家筛选', dataSelection: selection,
      steps: [{ methodId: 'data-prep', purpose: '准备副本', specification: '按 dataSelection 执行' }, { methodId: 'descriptive', purpose: '使用清洗后的数据', specification: '计算 Cash_support 均值' }] }, scope);
    const pending = propose();
    const plan = workflow.approvePlan(pending, { id: pending.id, revision: pending.revision }, scope);
    const prep = await runDataAnalysis({ ...dependencies, analysisPlan: plan, stepId: 'a1', requestModel: () => { throw new Error('确定性清洗不能调用模型'); } });
    assert.equal(prep.error, null, prep.error); assert.equal(prep.structured.sampleSize, 4);
    assert.equal(fs.readFileSync(source, 'utf8'), original, '原数据不可改变');
    const output = artifactFile({ ...plan, results: [prep.structured] }, { planId: plan.id, revision: plan.revision, stepId: 'a1', kind: 'data', index: 0 }, path.join(root, 'analysis-runs', 'p'));
    assert.equal(output.extension, 'csv'); assert(output.data.toString().includes('1234.5'));
    const code = `import os,json,pandas as pd
d=pd.read_csv(os.environ['DATA_FILE'])
assert len(d)==4 and pd.api.types.is_numeric_dtype(d['Cash_support']) and d['Time_support'].isna().sum()==2
assert 15 not in set(d['country_id']) and d['year'].max()==2021
print('PAPER_PET_RESULT='+json.dumps({'schemaVersion':1,'stepId':'a2','methodId':'descriptive','status':'completed','sampleSize':len(d),'summary':'清洗后的真实均值','tables':[{'title':'均值','columns':['数值'],'rows':[[float(d['Cash_support'].mean())]]}],'diagnostics':[]}))`;
    const result = await runDataAnalysis({ ...dependencies, analysisPlan: plan, stepId: 'a2', priorResults: [prep.structured], requestModel: async () => ({ content: '```python\n' + code + '\n```' }) });
    assert.equal(result.error, null, result.error);
    assert.equal(result.structured.tables[0].rows[0][0], 1583.625, '下游模型必须读取数值化副本');
    fs.writeFileSync(source, original.replace('1,234.50', '1,23'));
    const changed = await inspectDataFile(dependencies);
    assert.equal(changed.cacheHit, false, '同名文件内容变化必须失效');
    assert.notEqual(changed.sourceFingerprint, raw.sourceFingerprint);
    assert.equal(changed.columns.find(item => item.name === 'Cash_support').numericProbe.invalidCount, 1);
    const changedPending = propose();
    const changedPlan = workflow.approvePlan(changedPending, { id: changedPending.id, revision: changedPending.revision }, scope);
    const invalid = await runDataAnalysis({ ...dependencies, analysisPlan: changedPlan, stepId: 'a1' });
    assert.match(invalid.error, /数值转换失败/); assert(!invalid.structured, '不能悄悄丢弃失败记录并继续建模');
    console.log('Persistent decisions, cache scopes/version invalidation, deterministic preparation, CSV export and cleaned-data handoff passed');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
