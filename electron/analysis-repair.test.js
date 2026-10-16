const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { runDataAnalysis, generateAnalysisCode } = require('./tools/code-analysis');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-repair-'));
  try {
    const source = path.join(root, 'sample.csv');
    fs.writeFileSync(source, 'x\n1\n2\n3\n', 'utf8');
    const attachment = { id: 'sample', name: 'sample.csv', extension: '.csv' };
    const step = { id: 'a1', methodId: 'descriptive', label: '描述统计', purpose: '描述样本', specification: 'x 的均值', outputs: '一张描述统计表' };
    const analysisPlan = { id: 'plan', revision: 1, projectId: 'project', conversationId: 'chat', status: 'approved', attachment, steps: [step], dataFingerprint: createHash('sha256').update(fs.readFileSync(source)).digest('hex'), dataSelection: {} };
    const code = labelArgument => `import os\nimport json\nimport matplotlib\nmatplotlib.use('Agg')\nimport matplotlib.pyplot as plt\nimport pandas as pd\nimport numpy as np\ndf = pd.read_csv(os.environ['DATA_FILE'])\nfig, ax = plt.subplots()\nax.boxplot([df.x.values], ${labelArgument}=['x'])\nprint('PAPER_PET_RESULT=' + json.dumps({'schemaVersion':1,'stepId':'a1','methodId':'descriptive','status':'completed','sampleSize':len(df),'summary':'实际样本均值','tables':[{'title':'描述统计','columns':['变量','均值'],'rows':[['x',float(df.x.mean())]]}],'diagnostics':[],'limitations':[]},ensure_ascii=True,allow_nan=False))`;
    let calls = 0;
    const result = await runDataAnalysis({
      plan: { dataFile: attachment.name, request: '描述 x' }, attachments: [attachment], analysisPlan, stepId: step.id,
      requestModel: async () => ({ content: `\`\`\`python\n${code(++calls === 1 ? 'labels' : 'tick_labels')}\n\`\`\`` }),
      resolveAttachment: () => source, loadSettings: () => ({}), findPython: async () => ({ executable: path.resolve(__dirname, '../assets/python/win32-x64/python.exe'), prefix: [] }),
      userDataPath: root, projectId: 'project',
    });
    assert.equal(result.error, null);
    assert.equal(calls, 2, '运行时参数错误后应只修复一次');
    assert.equal(result.structured.sampleSize, 3);
    assert.equal(result.structured.tables[0].rows[0][1], 2);
    assert.match(result.code, /tick_labels=/);
    let truncatedCalls = 0;
    const compact = await generateAnalysisCode({ requestModel: async ({ options }) => {
      truncatedCalls++;
      if (truncatedCalls === 1) { const error = new Error('length'); error.code = 'MODEL_OUTPUT_TRUNCATED'; throw error; }
      assert.equal(options.maxTokens, 8192);
      return { content: `\`\`\`python\n${code('tick_labels')}\n\`\`\`` };
    }, request: '只分析当前步骤', dataFileName: 'sample.csv', analysisPlan, step });
    assert.equal(compact.error, null);
    assert.equal(truncatedCalls, 2, '分析代码截断后应自动紧凑重试一次');
    let formatCalls = 0;
    const malformed = code('tick_labels').replace("[['x',float(df.x.mean())]]", "[['x']]");
    const formatted = await runDataAnalysis({
      plan: { dataFile: attachment.name, request: '描述 x' }, attachments: [attachment], analysisPlan, stepId: step.id,
      requestModel: async () => ({ content: `\`\`\`python\n${++formatCalls === 1 ? malformed : code('tick_labels')}\n\`\`\`` }),
      resolveAttachment: () => source, loadSettings: () => ({}), findPython: async () => ({ executable: path.resolve(__dirname, '../assets/python/win32-x64/python.exe'), prefix: [] }),
      userDataPath: root, projectId: 'project',
    });
    assert.equal(formatted.error, null);
    assert.equal(formatCalls, 2, '结果表格式不符后应自动修复一次');
    assert.equal(formatted.structured.tables[0].rows[0][1], 2);
    console.log('Matplotlib 运行时错误自动修复并重跑通过');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
