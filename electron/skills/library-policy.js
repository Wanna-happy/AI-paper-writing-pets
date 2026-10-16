// These sources remain in the user's local archive, never in a distributable app.
const EXCLUDED_COLLECTIONS = ['49-voidborne-d-humanize-chinese', '54-scdenney-open-science-skills'];
const EXCLUDED_PATHS = EXCLUDED_COLLECTIONS.map(name => `assets/research-skills/skills/${name}/`)
  .concat('assets/research-skills/skills/67-econfin-workflow-toolkit/significance-search/');
function isPublishableResearchFile(file) {
  const name = String(file).replaceAll('\\', '/').replace(/^\//, '').toLowerCase();
  return !EXCLUDED_PATHS.some(prefix => name === prefix.slice(0, -1).toLowerCase() || name.startsWith(prefix.toLowerCase()));
}
module.exports = { EXCLUDED_COLLECTIONS, EXCLUDED_PATHS, isPublishableResearchFile };
