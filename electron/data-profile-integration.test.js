const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { inspectDataFile, runDataAnalysis } = require('./tools/code-analysis');
const { findPythonExecutable } = require('./tools/tool-registry');
const workflow = require('./empirical-workflow');
const { selectDataAttachment } = require('./tools/data-profile');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-excel-selection-'));
  try {
    const python = await findPythonExecutable({});
    const source = path.join(root, 'same.xlsx');
    const create = `from openpyxl import Workbook
import sys
w=Workbook(); intro=w.active; intro.title='说明'; intro.append(['仅为说明页'])
s=w.create_sheet('Panel'); s.append(['Country','Year','Metric','Code'])
for row in [('France',2020,1,0),('France',2021,2,0),('France',2022,12,12),('Israel',2020,3,0),('Germany',2021,4,0),('Israel',2022,12,12)]: s.append(row)
w.save(sys.argv[1])`;
    const created = spawnSync(python.executable, [...(python.prefix || []), '-c', create, source], { encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    const attachment = { id: 'current-version', name: 'same.xlsx', extension: '.xlsx' };
    assert.equal(selectDataAttachment([attachment], 'W1').id, attachment.id, '旧对话里的别名不能挡住唯一的当前文件');
    const resolveAttachment = () => source;
    const dependencies = { resolveAttachment, userDataPath: root, projectId: 'p', loadSettings: () => ({}), findPython: findPythonExecutable };
    const all = await inspectDataFile({ ...dependencies, attachment });
    assert.equal(all.sheet, 'Panel', '应自动跳过说明页');
    assert.equal(all.rows, 6);
    assert.equal(all.columns.find(column => column.name === 'Code').valueCounts.some(item => item.value === 12 && item.count === 2), true);
    const converted = await inspectDataFile({ ...dependencies, attachment, selection: { sheetName: 'Panel', probeValues: ['12'], missingValues: [{ column: 'Code', values: ['12'] }] } });
    assert.equal(converted.missingConverted[0].count, 2);
    assert.equal(converted.columns.find(column => column.name === 'Code').missing, 2);
    assert.equal(converted.columns.find(column => column.name === 'Metric').probeCounts['12'], 2, '不得改动未指定字段中的 12');
    const dataSelection = { sheetName: 'Panel', cellRange: 'A1:D7', yearRange: { column: 'Year', min: 2020, max: 2021 }, filters: [{ column: 'Country', op: 'ne', values: ['Israel'] }] };
    const filtered = await inspectDataFile({ ...dependencies, attachment, selection: dataSelection });
    assert.equal(filtered.rowsBeforeFilter, 6);
    assert.equal(filtered.rows, 3);
    assert.equal(filtered.columns.find(column => column.name === 'Metric').statistics.mean, 2.333333);
    assert.equal(filtered.previewRows.every(row => row[0] !== 'Israel'), true);
    await assert.rejects(inspectDataFile({ ...dependencies, attachment, selection: { sheetName: 'Panel', cellRange: 'A1:Z99' } }), /范围|超出/);
    const scope = { projectId: 'p', conversationId: 'c', attachments: [attachment], resolveAttachment };
    const pending = workflow.normalizeProposal({ researchQuestion: '合成数据分析', objective: 'association', dataFile: attachment.name, dataDescription: '国家年度表', dataSelection,
      steps: [{ methodId: 'ols', purpose: '验证筛选输入', specification: '仅验证输入样本数' }] }, scope);
    const plan = workflow.approvePlan(pending, { id: pending.id, revision: pending.revision }, scope);
    const code = `import os,json,pandas as pd
d=pd.read_csv(os.environ['DATA_FILE'])
assert len(d)==3 and set(d['Country'])=={'France','Germany'} and d['Year'].max()==2021
print('PAPER_PET_RESULT='+json.dumps({'schemaVersion':1,'stepId':'a1','methodId':'ols','status':'completed','sampleSize':len(d),'summary':'真实筛选后3行','tables':[{'title':'筛选核验','columns':['指标','数值'],'rows':[['样本量',len(d)]]}],'diagnostics':[],'limitations':['仅为合成验收']}))`;
    const result = await runDataAnalysis({ ...dependencies, attachments: [attachment], plan: { dataFile: attachment.name, request: '核验样本' }, analysisPlan: plan, stepId: 'a1', requestModel: async () => ({ content: '```python\n' + code + '\n```' }) });
    assert.equal(result.error, null, result.error);
    assert.equal(result.structured.sampleSize, 3);
    assert.equal(result.structured.sourceRows, 3);
    assert.equal(result.structured.sourceSheet, 'Panel');
    console.log('Excel sheets/range/year/country selection and analyst handoff passed');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
