const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { runDataAnalysis } = require('./tools/code-analysis');
const { runProcess } = require('./tools/tool-registry');
async function test() {
  const empty = await runDataAnalysis({ attachments: [], plan: {} });
  assert(empty.error, '无数据文件不能当成成功分析');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-analysis-'));
  try {
    const source = path.join(folder, 'data.csv');
    fs.writeFileSync(source, 'x\n1\n3\n');
    const result = await runDataAnalysis({
      plan: { request: '计算平均值' }, attachments: [{ id: 'a', name: 'data.csv', extension: '.csv' }],
      resolveAttachment: () => source, userDataPath: folder, projectId: 'test',
      requestModel: async () => ({ content: '```python\nimport os\nimport pandas as pd\ndf = pd.read_csv(os.environ["DATA_FILE"])\nprint("mean", df.x.mean())\n```' }),
      loadSettings: () => ({}), findPython: async () => ({ executable: 'python', prefix: [] }), executeProcess: runProcess,
    });
    assert.equal(result.error, null);
    assert.match(result.summary, /mean 2\.0/);
    console.log('generated Python executes against selected real data passed');
  } finally { fs.rmSync(folder, { recursive: true, force: true }); }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
