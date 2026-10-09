const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');
async function test() {
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-attachments-'));
  const originalLoad = Module._load;
  Module._load = function (id, ...args) { return id === 'electron' ? { app: { getPath: () => folder } } : originalLoad.call(this, id, ...args); };
  try {
    const original = path.join(folder, 'notes.txt');
    fs.writeFileSync(original, '原始资料内容');
    const api = require('./conversation-files');
    const [attachment] = await api.prepareConversationFiles([original]);
    fs.unlinkSync(original);
    delete require.cache[require.resolve('./conversation-files')];
    const reloaded = require('./conversation-files');
    const stored = reloaded.resolveConversationAttachment(attachment);
    assert(stored);
    assert.equal(fs.readFileSync(stored, 'utf8'), '原始资料内容');
    assert.equal(reloaded.resolveConversationAttachment({ id: '../invalid', extension: '.txt' }), null);
    console.log('conversation attachment survives reload and original removal passed');
  } finally { Module._load = originalLoad; fs.rmSync(folder, { recursive: true, force: true }); }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
