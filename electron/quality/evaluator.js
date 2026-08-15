function evaluateRun({ plan, retrieval, toolResult, draft, timings = {} }) {
  const mappings = draft?.mappings || [];
  const checks = draft?.checks || [];
  const content = String(draft?.content || '');
  const evidenceMarkers = new Set([...content.matchAll(/data-footnote="(\d+)"/g)].map((match) => Number(match[1])));
  return {
    planFallback: Boolean(plan?.fallback),
    planValidationError: plan?.validationError || null,
    retrievalHitCount: retrieval?.hits?.length || 0,
    retrievalQueryCount: plan?.queries?.length || 0,
    citedEvidenceCount: evidenceMarkers.size,
    mappedEvidenceCount: mappings.length,
    auditIssueCount: checks.length,
    toolUsed: toolResult?.kind || null,
    toolCacheHit: Boolean(toolResult?.cacheHit),
    outputCharacters: content.replace(/<[^>]+>/g, '').length,
    timings,
  };
}

function summarizeRuns(runs = []) {
  const completed = runs.filter((run) => run.status === 'COMPLETED');
  const failed = runs.filter((run) => run.status === 'FAILED');
  const average = (selector) => completed.length ? completed.reduce((sum, run) => sum + Number(selector(run) || 0), 0) / completed.length : 0;
  return {
    totalRuns: runs.length,
    completionRate: runs.length ? completed.length / runs.length : 0,
    failureRate: runs.length ? failed.length / runs.length : 0,
    planFallbackRate: completed.length ? completed.filter((run) => run.quality?.planFallback).length / completed.length : 0,
    averageRetrievalHits: average((run) => run.quality?.retrievalHitCount),
    averageAuditIssues: average((run) => run.quality?.auditIssueCount),
    averageDurationMs: average((run) => run.durationMs),
    toolCacheHitRate: completed.filter((run) => run.quality?.toolUsed).length
      ? completed.filter((run) => run.quality?.toolCacheHit).length / completed.filter((run) => run.quality?.toolUsed).length
      : 0,
  };
}

module.exports = { evaluateRun, summarizeRuns };
