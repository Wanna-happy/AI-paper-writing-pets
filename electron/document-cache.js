const fs = require('fs');
const path = require('path');

const DOCUMENT_CACHE_VERSION = 1;

function safeSegment(value) {
  return String(value || '').replace(/[^a-z0-9_-]/gi, '') || 'unknown';
}

function getDocumentCachePath(libraryPath, projectId, document) {
  const parserVersion = Number(document?.parserVersion) || 0;
  const fingerprint = safeSegment(document?.fingerprint).slice(0, 64);
  return path.join(libraryPath, safeSegment(projectId), '.cache', `${fingerprint}-p${parserVersion}.json`);
}

function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(value), 'utf8');
  fs.renameSync(temporaryPath, filePath);
}

function writeDocumentCache(libraryPath, projectId, document) {
  const text = String(document?.text || '');
  const cachePath = getDocumentCachePath(libraryPath, projectId, document);
  if (!text) {
    fs.rmSync(cachePath, { force: true });
    return false;
  }
  if (readDocumentCache(libraryPath, projectId, document) === text) return true;
  atomicWriteJson(cachePath, {
    version: DOCUMENT_CACHE_VERSION,
    fingerprint: document.fingerprint,
    parserVersion: Number(document.parserVersion) || 0,
    text,
    createdAt: new Date().toISOString(),
  });
  return true;
}

function readDocumentCache(libraryPath, projectId, document) {
  try {
    const cached = JSON.parse(fs.readFileSync(getDocumentCachePath(libraryPath, projectId, document), 'utf8'));
    if (cached.version !== DOCUMENT_CACHE_VERSION) return null;
    if (cached.fingerprint !== document.fingerprint) return null;
    if (cached.parserVersion !== (Number(document.parserVersion) || 0)) return null;
    return typeof cached.text === 'string' ? cached.text : null;
  } catch {
    return null;
  }
}

function removeDocumentCache(libraryPath, projectId, document) {
  fs.rmSync(getDocumentCachePath(libraryPath, projectId, document), { force: true });
}

module.exports = {
  DOCUMENT_CACHE_VERSION,
  getDocumentCachePath,
  readDocumentCache,
  removeDocumentCache,
  writeDocumentCache,
};
