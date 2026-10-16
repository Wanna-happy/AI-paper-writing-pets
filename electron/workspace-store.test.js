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
  store.updateProject('project-1', { clarifications: { c: { id: 'first', status: 'answered', questions: [{ id: 'q', question: '年份范围？' }], answers: [{ id: 'q', answer: '2000—2021' }] } } });
  store.updateProject('project-1', { clarifications: { c: { id: 'second', status: 'pending', questions: [{ id: 'q2', question: '聚类变量？' }] } } });
  const remembered = store.loadWorkspace().projects.find(item => item.id === 'project-1').confirmedDecisions.c;
  assert.equal(remembered[0].answer, '2000—2021', '替换问题卡不能丢失已经确认的决策');

  store.setApiKey('session-a', 'session', 'agent-a');
  store.setApiKey('session-b', 'session', 'agent-b');
  assert.equal(store.getApiKey('session', 'agent-a'), 'session-a');
  assert.equal(store.getApiKey('session', 'agent-b'), 'session-b');
  store.setApiKey('stored-a', 'encrypted', 'agent-a');
  store.setApiKey('stored-b', 'encrypted', 'agent-b');
  store.setApiKey('', 'encrypted', 'agent-a');
  assert.equal(store.getApiKey('encrypted', 'agent-a'), '');
  assert.equal(store.getApiKey('encrypted', 'agent-b'), 'stored-b');
  fs.writeFileSync(path.join(userData, 'api-key.bin'), 'legacy-test-key');
  assert.equal(store.getApiKey('encrypted', 'deepseek'), 'legacy-test-key');
  store.setApiKey('', 'encrypted', 'deepseek');
  assert.equal(store.getApiKey('encrypted', 'deepseek'), '', 'Deleting a key must also remove legacy fallback');
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
  const reviewDraft = store.saveDraft(created.id, { content: '<p>正文过长</p>', mode: 'api', lengthReview: { contract: { minimum: 2, maximum: 3, label: '2—3汉字' } } });
  assert.equal(reviewDraft.lengthReview.passed, false);
  assert.equal(reviewDraft.lengthReview.actual, 4);
  assert.equal(reviewDraft.deliveryStatus, 'needs-revision');
  const edited = store.saveDraft(created.id, { ...reviewDraft, content: '<p>正文</p>' });
  assert.equal(edited.history[0].content,'<p>正文过长</p>');
  assert.equal(edited.history.at(-1).content,'<p>正文</p>');
  assert.throws(()=>store.saveDraft(created.id,{...reviewDraft,content:'旧窗口覆盖',expectedContent:reviewDraft.content}),/其他操作修改/);
  assert.equal(edited.lengthReview.passed, true);
  assert.equal(edited.deliveryStatus, 'needs-review', '篇幅达标不能代替引用核验');
  assert(!edited.checks.some(item => item.startsWith('篇幅未达标')));
  const empiricalPlans = { [createdProject.activeConversationId]: { id: 'synthetic-plan', revision: 2, status: 'results-review', results: [{ sampleSize: 128 }], history: [{ revision: 1 }] } };
  store.updateProject(created.id, { empiricalPlans });
  const uploaded = path.join(userData, 'upload.csv');
  fs.writeFileSync(uploaded, 'x,y\n1,2\n2,4');
  const projectFiles = require('./project-files');
  await projectFiles.importProjectFiles({ store, ragStore: { indexProject: async () => {} }, projectId: created.id, paths: [uploaded] });
  fs.unlinkSync(uploaded);
  await store.closeWorkspace();
  const restarted = store.loadWorkspace().projects.find(project => project.id === created.id);
  assert.deepEqual(restarted.empiricalPlans, empiricalPlans, '重启后方案版本与实际结果必须保留');
  const available = projectFiles.availableProjectFiles(store, restarted);
  assert.equal(available.length, 1, '关闭数据库并删除原文件后，项目数据仍必须可用');
  assert.equal(fs.readFileSync(require('./conversation-files').resolveConversationAttachment(available[0]), 'utf8'), 'x,y\n1,2\n2,4');
  store.removeDocument(created.id, available[0].documentId);
  assert.equal(projectFiles.availableProjectFiles(store, store.loadWorkspace().projects.find(project => project.id === created.id)).length, 0, '删除项目文件后不得从历史任务恢复它');
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
