const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');
const { LruCache } = require('./lru-cache');

const INDEX_VERSION = 2;
const CHUNK_VERSION = 1;
const EMBEDDING_VERSION = 1;
const EMBEDDING_MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const TARGET_CHUNK_LENGTH = 900;
const CHUNK_OVERLAP = 160;
const HASH_VECTOR_SIZE = 768;
let extractorPromise = null;
const indexCache = new LruCache({ max: 12, ttl: 5 * 60 * 1000 });
const retrievalCache = new LruCache({ max: 120, ttl: 10 * 60 * 1000 });

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getProjectFolder(projectId) {
  return path.join(app.getPath('userData'), 'library', projectId);
}

function getIndexPath(projectId) {
  return path.join(getProjectFolder(projectId), 'rag-index.json');
}

function emptyIndex(projectId) {
  return {
    version: INDEX_VERSION,
    chunkVersion: CHUNK_VERSION,
    embeddingVersion: EMBEDDING_VERSION,
    projectId,
    model: EMBEDDING_MODEL,
    mode: 'local-hybrid',
    updatedAt: null,
    documents: {},
    chunks: [],
  };
}

function loadIndex(projectId) {
  const cached = indexCache.get(projectId);
  if (cached) return cached;
  try {
    const index = JSON.parse(fs.readFileSync(getIndexPath(projectId), 'utf8'));
    if (index.version !== INDEX_VERSION
      || index.chunkVersion !== CHUNK_VERSION
      || index.embeddingVersion !== EMBEDDING_VERSION
      || index.model !== EMBEDDING_MODEL) return emptyIndex(projectId);
    indexCache.set(projectId, index);
    return index;
  } catch {
    return emptyIndex(projectId);
  }
}

function saveIndex(index) {
  fs.mkdirSync(getProjectFolder(index.projectId), { recursive: true });
  index.updatedAt = new Date().toISOString();
  const indexPath = getIndexPath(index.projectId);
  const temporaryPath = `${indexPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(index), 'utf8');
  fs.renameSync(temporaryPath, indexPath);
  indexCache.set(index.projectId, index);
  retrievalCache.clear();
  return index;
}

function splitPages(text) {
  const source = String(text || '').replace(/\r\n/g, '\n').trim();
  const marker = /^\[第\s*(\d+)\s*页\]\s*$/gm;
  const matches = [...source.matchAll(marker)];
  if (!matches.length) return [{ page: null, text: source }];
  return matches.map((match, index) => ({
    page: Number(match[1]),
    text: source.slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length).trim(),
  })).filter((page) => page.text);
}

function splitSentences(text) {
  const paragraphs = String(text || '').split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  return paragraphs.flatMap((paragraph) => {
    if (paragraph.length <= TARGET_CHUNK_LENGTH) return [paragraph];
    return paragraph.split(/(?<=[。！？.!?；;])\s*/).map((item) => item.trim()).filter(Boolean);
  });
}

function chunkDocument(document) {
  const chunks = [];
  for (const page of splitPages(document.text)) {
    const sentences = splitSentences(page.text);
    const pageTexts = [];
    let current = '';
    for (const sentence of sentences) {
      if (current && current.length + sentence.length + 1 > TARGET_CHUNK_LENGTH) {
        pageTexts.push(current.trim());
        current = `${current.slice(-CHUNK_OVERLAP)} ${sentence}`;
      } else {
        current += `${current ? ' ' : ''}${sentence}`;
      }
    }
    if (current.trim()) pageTexts.push(current.trim());

    pageTexts.forEach((text, index) => {
      chunks.push({
        id: crypto.createHash('sha1').update(`${document.id}:${page.page}:${index}:${text}`).digest('hex').slice(0, 16),
        documentId: document.id,
        documentName: document.name,
        page: page.page,
        position: index + 1,
        text,
        terms: extractTerms(text),
        embedding: null,
      });
    });
  }
  return chunks;
}

function extractTerms(text) {
  const normalized = String(text || '').toLowerCase();
  const latin = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) || [];
  const chineseRuns = normalized.match(/[\u3400-\u9fff]{2,}/g) || [];
  const cjk = [];
  for (const run of chineseRuns) {
    for (let index = 0; index < run.length - 1; index += 1) cjk.push(run.slice(index, index + 2));
  }
  return [...new Set([...latin, ...cjk])].slice(0, 500);
}

function hashText(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function localHashEmbedding(text) {
  const normalized = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const vector = new Float32Array(HASH_VECTOR_SIZE);
  const terms = extractTerms(normalized);
  const features = [...terms];
  for (let index = 0; index < normalized.length - 2; index += 1) {
    const trigram = normalized.slice(index, index + 3);
    if (!/^\s+$/.test(trigram)) features.push(trigram);
  }
  for (const feature of features) {
    const hash = hashText(feature);
    const slot = hash % HASH_VECTOR_SIZE;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[slot] += sign;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm) || 1;
  for (let index = 0; index < vector.length; index += 1) vector[index] /= norm;
  return Array.from(vector);
}

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const transformers = await import('@xenova/transformers');
      const modelCache = path.join(app.getPath('userData'), 'models');
      const modelFolder = path.join(modelCache, ...EMBEDDING_MODEL.split('/'));
      const modelWeights = path.join(modelFolder, 'onnx', 'model_quantized.onnx');
      if (!fs.existsSync(modelWeights)) throw new Error('本机未安装可选的神经向量模型');
      transformers.env.cacheDir = modelCache;
      transformers.env.allowLocalModels = true;
      transformers.env.allowRemoteModels = false;
      return transformers.pipeline('feature-extraction', EMBEDDING_MODEL, { quantized: true });
    })();
  }
  return extractorPromise;
}

function encodeVector(vector) {
  return Buffer.from(new Float32Array(vector).buffer).toString('base64');
}

function decodeVector(encoded) {
  const buffer = Buffer.from(encoded, 'base64');
  return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / Float32Array.BYTES_PER_ELEMENT);
}

async function embedTexts(texts) {
  if (!texts.length) return [];
  const extractor = await getExtractor();
  const vectors = [];
  for (let offset = 0; offset < texts.length; offset += 12) {
    const batch = texts.slice(offset, offset + 12);
    const output = await extractor(batch, { pooling: 'mean', normalize: true });
    vectors.push(...output.tolist());
  }
  return vectors;
}

async function indexProject(project) {
  const parsed = project.documents.filter((document) => document.status === 'parsed' && document.text);
  const previous = loadIndex(project.id);
  const index = emptyIndex(project.id);
  const changedDocuments = [];
  for (const document of parsed) {
    const previousDocument = previous.documents[document.id];
    const unchanged = previous.updatedAt
      && previousDocument?.fingerprint === document.fingerprint
      && previousDocument?.parserVersion === (Number(document.parserVersion) || 0);
    index.documents[document.id] = {
      name: document.name,
      fingerprint: document.fingerprint,
      parserVersion: Number(document.parserVersion) || 0,
      chunks: 0,
    };
    if (unchanged) {
      const reusable = previous.chunks.filter((chunk) => chunk.documentId === document.id);
      index.chunks.push(...reusable);
      index.documents[document.id].chunks = reusable.length;
    } else {
      changedDocuments.push(document);
    }
  }
  const changedChunks = changedDocuments.flatMap((document) => {
    const chunks = chunkDocument(document);
    index.documents[document.id].chunks = chunks.length;
    return chunks;
  });
  index.chunks.push(...changedChunks);

  if (!index.chunks.length) return saveIndex(index);
  if (!changedChunks.length) {
    index.mode = previous.mode;
    index.error = previous.error || null;
    index.neuralModelStatus = previous.neuralModelStatus || null;
  } else if (previous.updatedAt && previous.mode === 'local-hybrid-hash') {
    changedChunks.forEach((chunk) => {
      chunk.embedding = encodeVector(localHashEmbedding(chunk.text));
    });
    index.mode = 'local-hybrid-hash';
    index.neuralModelStatus = previous.neuralModelStatus || null;
  } else {
    try {
      const vectors = await embedTexts(changedChunks.map((chunk) => chunk.text));
      changedChunks.forEach((chunk, chunkIndex) => {
        chunk.embedding = encodeVector(vectors[chunkIndex]);
      });
      index.mode = 'local-hybrid';
      index.error = null;
    } catch (error) {
      extractorPromise = null;
      index.chunks.forEach((chunk) => {
        chunk.embedding = encodeVector(localHashEmbedding(chunk.text));
      });
      index.mode = 'local-hybrid-hash';
      index.error = null;
      index.neuralModelStatus = error.message;
    }
  }
  if (index.mode === 'local-hybrid-hash' && index.chunks.some((chunk) => !chunk.embedding)) {
    index.chunks.forEach((chunk) => {
      chunk.embedding = encodeVector(localHashEmbedding(chunk.text));
    });
  }
  return saveIndex(index);
}

function keywordScore(queryTerms, chunkTerms) {
  if (!queryTerms.length || !chunkTerms.length) return 0;
  const terms = new Set(chunkTerms);
  const matched = queryTerms.reduce((count, term) => count + (terms.has(term) ? 1 : 0), 0);
  return matched / Math.sqrt(queryTerms.length * Math.max(1, chunkTerms.length));
}

function cosineScore(left, right) {
  if (!left || !right || left.length !== right.length) return 0;
  let score = 0;
  for (let index = 0; index < left.length; index += 1) score += left[index] * right[index];
  return score;
}

async function retrieve(project, query, limit = 8) {
  let index = loadIndex(project.id);
  const expected = project.documents.filter((document) => document.status === 'parsed' && document.text);
  const needsRebuild = expected.some((document) => index.documents[document.id]?.fingerprint !== document.fingerprint
      || index.documents[document.id]?.parserVersion !== (Number(document.parserVersion) || 0))
    || Object.keys(index.documents).some((documentId) => !expected.some((document) => document.id === documentId));
  if (needsRebuild || (!index.updatedAt && expected.length)) index = await indexProject(project);

  const cacheKey = JSON.stringify([project.id, index.updatedAt, String(query || ''), Number(limit) || 8]);
  const cached = retrievalCache.get(cacheKey);
  if (cached) return clone(cached);

  const queryTerms = extractTerms(query);
  let queryVector = null;
  if (index.mode === 'local-hybrid' && index.chunks.some((chunk) => chunk.embedding)) {
    try {
      const [vector] = await embedTexts([query]);
      queryVector = vector;
    } catch (error) {
      index.mode = 'keyword-fallback';
      index.error = `查询向量化失败：${error.message}`;
    }
  } else if (index.mode === 'local-hybrid-hash') {
    queryVector = localHashEmbedding(query);
  }

  const ranked = index.chunks.map((chunk) => {
    const lexical = keywordScore(queryTerms, chunk.terms || extractTerms(chunk.text));
    const semantic = queryVector && chunk.embedding ? cosineScore(queryVector, decodeVector(chunk.embedding)) : 0;
    const semanticWeight = index.mode === 'local-hybrid' ? 0.78 : 0.55;
    return { ...chunk, score: queryVector ? semantic * semanticWeight + lexical * (1 - semanticWeight) : lexical };
  }).sort((left, right) => right.score - left.score);

  const perDocument = new Map();
  const hits = [];
  for (const chunk of ranked) {
    if (hits.length >= limit) break;
    const count = perDocument.get(chunk.documentId) || 0;
    if (count >= 3) continue;
    if (!queryVector && chunk.score <= 0 && hits.length >= 3) continue;
    perDocument.set(chunk.documentId, count + 1);
    hits.push(chunk);
  }

  const result = {
    mode: index.mode,
    model: index.model,
    error: index.error || null,
    neuralModelStatus: index.neuralModelStatus || null,
    totalChunks: index.chunks.length,
    hits,
  };
  retrievalCache.set(cacheKey, result);
  return clone(result);
}

async function retrieveMulti(project, queries, limit = 14) {
  const normalizedQueries = queries
    .map((query, index) => typeof query === 'string' ? { label: `检索视角 ${index + 1}`, text: query } : query)
    .filter((query) => query?.text)
    .slice(0, 4);
  if (!normalizedQueries.length) return retrieve(project, '', limit);

  const results = [];
  results.push(await retrieve(project, normalizedQueries[0].text, Math.min(10, limit)));
  const remaining = await Promise.all(normalizedQueries.slice(1).map((query) => retrieve(project, query.text, 8)));
  results.push(...remaining);

  const merged = new Map();
  results.forEach((result, queryIndex) => {
    result.hits.forEach((hit, rank) => {
      const current = merged.get(hit.id) || {
        ...hit,
        reciprocalRank: 0,
        matchedQueries: [],
      };
      current.reciprocalRank += 1 / (60 + rank + 1);
      current.score = Math.max(current.score || 0, hit.score || 0);
      current.matchedQueries.push(normalizedQueries[queryIndex].label);
      merged.set(hit.id, current);
    });
  });

  const ranked = [...merged.values()].sort((left, right) => {
    if (right.matchedQueries.length !== left.matchedQueries.length) return right.matchedQueries.length - left.matchedQueries.length;
    return right.reciprocalRank - left.reciprocalRank;
  });
  const perDocument = new Map();
  const hits = [];
  for (const hit of ranked) {
    if (hits.length >= limit) break;
    const documentCount = perDocument.get(hit.documentId) || 0;
    if (documentCount >= 4) continue;
    perDocument.set(hit.documentId, documentCount + 1);
    hits.push({ ...hit, matchedQueries: [...new Set(hit.matchedQueries)] });
  }

  return {
    mode: results[0].mode,
    model: results[0].model,
    error: [...new Set(results.map((result) => result.error).filter(Boolean))].join('；') || null,
    neuralModelStatus: results[0].neuralModelStatus || null,
    totalChunks: results[0].totalChunks,
    queries: normalizedQueries,
    hits,
  };
}

function getStatus(project) {
  const index = loadIndex(project.id);
  return {
    mode: index.mode,
    model: index.model,
    error: index.error || null,
    neuralModelStatus: index.neuralModelStatus || null,
    documentCount: Object.keys(index.documents).length,
    chunkCount: index.chunks.length,
    documents: index.documents,
    updatedAt: index.updatedAt,
  };
}

module.exports = {
  getStatus,
  indexProject,
  retrieve,
  retrieveMulti,
};
