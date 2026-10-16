import assert from 'node:assert/strict';
import { makeDependencyTool } from './agent-tools.mjs';

let called = null;
const tool = makeDependencyTool({
  installDependency: async args => { called = args; return { status: 'already-installed', name: 'dtaidistance', version: '2.5.1' }; },
  findPython: async () => ({ executable: 'bundled-python.exe' }),
  loadSettings: () => ({ dataEnvironment: { runtimeMode: 'bundled' } }),
  userDataPath: 'test-user-data', projectId: 'project-A',
});
assert.equal(tool.name, 'install_python_dependency');
const result = await tool.execute('call-1', { name: 'dtaidistance' });
assert.equal(called.projectId, 'project-A');
assert.equal(called.python.executable, 'bundled-python.exe');
assert.match(result.content[0].text, /already-installed/);
assert.match(result.content[0].text, /产品分析运行时/);
console.log('chat dependency tool routes to project-scoped installer');
