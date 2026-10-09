const fs = require('fs');
const path = require('path');
const assert = require('assert');
const JSZip = require('jszip');
const { buildAcademicDocx } = require('./word-export');
const { countBodyHanzi } = require('./length-control');

async function verifyRealPaper({ repository, project, documents, sourceProjectId, output, requestId, draft }) {
  const runRow = repository.database.prepare('SELECT data FROM agent_runs WHERE id=?').get(requestId);
  const run = JSON.parse(runRow.data);
  const saved = repository.loadWorkspace().projects.find(item => item.id === project.id).drafts.find(item => item.id === run.draftId);
  assert(saved && (!draft || saved.content === draft.content), 'persistence-mismatch');
  draft = saved;
  assert.equal(run.status, 'COMPLETED');
  assert(!run.plan.fallback, 'planner-fallback');
  const body = draft.content.replace(/<section\s+class="footnotes">[\s\S]*?<\/section>/gi, '');
  const ids = [...new Set([...body.matchAll(/<sup\s+data-footnote="(\d+)"/g)].map(match => Number(match[1])))];
  assert(ids.length >= 3, 'insufficient-citations');
  const cited = ids.map(id => draft.evidence[id - 1]);
  assert(cited.every(hit => hit?.text), 'missing-evidence-snapshot');
  const citedDocumentCount = new Set(cited.map(hit => hit.documentName)).size;
  assert(citedDocumentCount >= 3, 'insufficient-distinct-sources');
  const docByName = new Map(documents.map(doc => [doc.name, doc]));
  const canonical = value => String(value || '').replace(/\s+/g, '');
  // RAG joins sentences/paragraphs with spaces; content, not layout whitespace,
  // must remain an exact substring of the parsed source document.
  assert(cited.every(hit => canonical(docByName.get(hit.documentName)?.text).includes(canonical(hit.text))), 'evidence-source-mismatch');
  assert(!draft.content.includes('〔待核验〕'), 'unknown-evidence-markers');
  const docx = await buildAcademicDocx(project, draft);
  const zip = await JSZip.loadAsync(docx);
  const xml = await zip.file('word/document.xml').async('string');
  assert(xml.includes('w:footnoteReference'), 'word-footnotes-missing');
  assert(zip.file('word/footnotes.xml'), 'word-footnote-file-missing');
  fs.writeFileSync(path.join(output, 'paper.docx'), docx);
  fs.writeFileSync(path.join(output, 'paper.html'), draft.content);
  fs.writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(draft.evidence, null, 2));
  const outputCharacters = body.replace(/<[^>]+>/g, '').length;
  const chineseCharacters = countBodyHanzi(draft.content);
  const withinRequestedLength = chineseCharacters >= 900 && chineseCharacters <= 1200;
  const report = {
    ok: withinRequestedLength, pipelinePassed: true, withinRequestedLength,
    completedAt: new Date().toISOString(), sourceProjectId, sourceDatabaseOpenedReadOnly: true,
    projectTitle: project.title, sourceDocumentCount: documents.length, sourceDocumentNames: documents.map(doc => doc.name),
    plannerFallback: Boolean(run.plan.fallback), roles: run.plan.tasks.map(task => task.role),
    retrievalHitCount: draft.evidence.length, citedEvidenceCount: ids.length, citedDocumentCount,
    outputCharacters, chineseCharacters, requestedLength: '900—1200汉字', sqliteVerified: true,
    lengthReview: run.lengthReview || null,
    evidenceSourceVerified: true, wordFootnotesVerified: true, checks: draft.checks, durationMs: run.durationMs,
  };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  return report;
}
module.exports = { verifyRealPaper };
