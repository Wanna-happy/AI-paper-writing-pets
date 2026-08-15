const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-pet-workspace-'));
const legacy = {
  activeProjectId: 'project-1',
  projects: [{
    id: 'project-1',
    title: '旧项目迁移',
    type: '硕士学位论文',
    domains: ['管理学'],
    documents: [{
      id: 'document-1',
      name: '旧资料.txt',
      extension: '.txt',
      fingerprint: 'legacy-fingerprint',
      parserVersion: 1,
      status: 'parsed',
      text: '这是旧工作区中需要迁移到文件缓存的解析正文。',
    }],
    drafts: [{ id: 'draft-1', title: '旧草稿', content: '<p>已保存内容</p>' }],
  }],
};
fs.writeFileSync(path.join(userData, 'workspace.json'), JSON.stringify(legacy), 'utf8');

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') {
    return {
      app: { getPath: (name) => name === 'userData' ? userData : userData },
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString: (value) => Buffer.from(value),
        decryptString: (value) => Buffer.from(value).toString('utf8'),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

async function run() {
try {
  const store = require('./workspace-store');
  const migrated = store.loadWorkspace();
  assert.strictEqual(migrated.projects[0].title, '旧项目迁移');
  assert.strictEqual(migrated.projects[0].documents[0].text, legacy.projects[0].documents[0].text);
  assert.strictEqual(migrated.projects[0].drafts[0].content, '<p>已保存内容</p>');
  assert.ok(migrated.projects[0].activeConversationId);
  assert.strictEqual(migrated.projects[0].conversations.length, 1);
  assert.strictEqual(migrated.projects[0].drafts[0].conversationId, migrated.projects[0].activeConversationId);
  assert.ok(fs.existsSync(path.join(userData, 'workspace.sqlite')));
  assert.ok(fs.existsSync(path.join(userData, 'workspace.json')), 'legacy workspace must remain as backup');

  const created = store.createProject({ title: 'SQLite 新项目', domains: ['经济学'] });
  assert.ok(created.id);
  const reloaded = store.loadWorkspace();
  assert.strictEqual(reloaded.projects[0].title, 'SQLite 新项目');
  assert.strictEqual(reloaded.projects.length, 2);
  const conversationState = store.createConversation(created.id, { title: '第二个对话' });
  const createdProject = conversationState.projects.find((project) => project.id === created.id);
  assert.strictEqual(createdProject.conversations[0].title, '第二个对话');
  store.saveDraft(created.id, { task: '对话内任务', content: '<p>内容</p>', mode: 'api' });
  const withDraft = store.loadWorkspace().projects.find((project) => project.id === created.id);
  assert.strictEqual(withDraft.drafts[0].conversationId, createdProject.activeConversationId);
  await store.closeWorkspace();
  console.log('workspace sqlite migration test passed');
} finally {
  Module._load = originalLoad;
  fs.rmSync(userData, { recursive: true, force: true });
}
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
