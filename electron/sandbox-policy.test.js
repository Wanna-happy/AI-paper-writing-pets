const assert = require('assert');
const fs = require('fs');
const { getSandboxStatus, runSandbox, helperPath } = require('./sandbox/windows-sandbox');

async function test() {
  const exists = fs.existsSync;
  fs.existsSync = file => file === helperPath() ? false : exists(file);
  try {
    assert.equal(getSandboxStatus().available, false);
    // Missing launcher must reject before touching any Python/runtime/input paths.
    await assert.rejects(runSandbox({ python: { executable: 'MUST_NEVER_RUN' } }), /已拒绝执行/);
  } finally { fs.existsSync = exists; }
  console.log('Missing system sandbox fails closed before any execution passed');
}
test().catch(error => { console.error(error); process.exitCode = 1; });
