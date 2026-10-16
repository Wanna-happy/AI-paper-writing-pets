const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runSandbox, getSandboxStatus } = require('./windows-sandbox');
const { bundledPythonPath } = require('../python-runtime');

assert.equal(getSandboxStatus(false).policy.network, 'denied');
assert.equal(getSandboxStatus(true).policy.network, 'internet-client');

async function main() {
  if (!process.argv.includes('--online')) return console.log('sandbox network permission metadata passed');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-network-test-'));
  try {
    const scriptPath = path.join(root, 'probe.py');
    fs.writeFileSync(scriptPath, `import socket\ntry:\n s=socket.create_connection(('1.1.1.1',443),timeout=8)\n s.close()\n print('CONNECTED')\nexcept OSError as e:\n print('DENIED',type(e).__name__)\n`);
    const python = { executable: bundledPythonPath(), prefix: [] };
    const off = await runSandbox({ python, scriptPath, outputDir: path.join(root, 'analysis-runs', 'p', 'off'), networkEnabled: false, timeoutMs: 30000 });
    assert.match(off.stdout, /DENIED/);
    assert.equal(off.sandbox.networkCapabilities, 0);
    const on = await runSandbox({ python, scriptPath, outputDir: path.join(root, 'analysis-runs', 'p', 'on'), networkEnabled: true, timeoutMs: 30000 });
    assert.match(on.stdout, /CONNECTED/);
    assert.equal(on.sandbox.networkCapabilities, 1);
    assert.deepEqual(on.sandbox.capabilities, ['registryRead', 'internetClient']);
    console.log('LPAC network opt-in connects to Internet; opt-out denies');
  } finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
