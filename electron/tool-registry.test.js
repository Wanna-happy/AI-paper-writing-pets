const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ToolRegistry } = require('./tools/tool-registry');

async function run() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-tools-'));
  const toolRuns = [];
  let executions = 0;
  try {
    const registry = new ToolRegistry({
      userDataPath: folder,
      scriptPath: path.join(folder, 'fake-tool.py'),
      resolveAttachment: () => null,
      loadSettings: () => ({}),
      saveToolRun: (toolRun) => toolRuns.push(toolRun),
      findPython: async () => ({ executable: 'fake-python', prefix: [] }),
      executeProcess: async (_executable, args) => {
        executions += 1;
        const outputDir = args[args.indexOf('--output-dir') + 1];
        const outputFile = path.join(outputDir, 'diagram.svg');
        fs.writeFileSync(outputFile, '<svg/>', 'utf8');
        return JSON.stringify({ kind: 'mechanism-diagram', files: [outputFile] });
      },
    });
    const request = {
      agentRunId: 'run-1',
      projectId: 'project-1',
      plan: { name: 'mechanism_diagram', title: '协同机制', nodes: ['A', 'B'], edges: [['A', 'B']] },
    };
    const first = await registry.execute(request);
    const second = await registry.execute({ ...request, agentRunId: 'run-2' });
    assert.strictEqual(first.cacheHit, false);
    assert.strictEqual(second.cacheHit, true);
    assert.strictEqual(executions, 1);
    assert.deepStrictEqual(toolRuns.map((item) => item.status), ['completed', 'cache-hit']);
    console.log('tool registry cache test passed');
  } finally {
    fs.rmSync(folder, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
