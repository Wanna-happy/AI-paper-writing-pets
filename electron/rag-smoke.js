const os = require('os');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const userData = path.join(os.tmpdir(), 'ai-paper-pet-rag-smoke');
fs.rmSync(userData, { recursive: true, force: true });
app.setPath('userData', userData);
const resultPath = path.join(os.tmpdir(), 'ai-paper-pet-rag-smoke-result.json');
fs.rmSync(resultPath, { force: true });

app.whenReady().then(async () => {
  const ragStore = require('./rag-store');
  const project = {
    id: 'smoke-project',
    documents: [
      {
        id: 'doc-rag',
        name: '检索增强生成研究.pdf',
        fingerprint: 'rag-fixture-v1',
        status: 'parsed',
        text: '[第 1 页]\n检索增强生成通过从外部知识库召回相关证据，让语言模型依据证据回答，从而减少事实性幻觉并提高引用可追溯性。\n\n[第 2 页]\n向量检索可以结合关键词检索形成混合检索，以兼顾语义相关性和专业术语精确匹配。',
      },
      {
        id: 'doc-unrelated',
        name: '校园植物观察.pdf',
        fingerprint: 'plant-fixture-v1',
        status: 'parsed',
        text: '[第 3 页]\n银杏是常见的校园绿化植物，秋季叶片呈金黄色。',
      },
    ],
  };
  const index = await ragStore.indexProject(project);
  const result = await ragStore.retrieve(project, '如何利用外部知识减少大语言模型的事实性幻觉？', 3);
  const output = {
    mode: result.mode,
    chunks: index.chunks.length,
    topDocument: result.hits[0]?.documentName,
    topPage: result.hits[0]?.page,
    topText: result.hits[0]?.text,
    error: result.error,
  };
  console.log(`RAG_SMOKE_RESULT=${JSON.stringify(output)}`);
  fs.writeFileSync(resultPath, JSON.stringify({ ok: true, output }, null, 2), 'utf8');
  if (!result.hits.length || result.hits[0].documentId !== 'doc-rag' || result.hits[0].page !== 1) {
    throw new Error('RAG 检索结果不符合预期');
  }
  app.exit(0);
}).catch((error) => {
  console.error(`RAG_SMOKE_ERROR=${error.stack || error.message}`);
  fs.writeFileSync(resultPath, JSON.stringify({ ok: false, error: error.stack || error.message }, null, 2), 'utf8');
  app.exit(1);
});
