const fs = require('fs');
const path = require('path');
const { resolveConversationImage } = require('./conversation-files');
const { buildAcademicTable, normalizeCitationMarkers } = require('./citation-format');

const IMAGE_MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};
const MAX_EMBEDDED_IMAGE_SIZE = 12 * 1024 * 1024;

function asEmbeddedImage(filePath) {
  const extension = path.extname(filePath || '').toLowerCase();
  const mimeType = IMAGE_MIME_TYPES[extension];
  if (!mimeType || !fs.existsSync(filePath)) return null;
  if (fs.statSync(filePath).size > MAX_EMBEDDED_IMAGE_SIZE) return null;
  return `data:${mimeType};base64,${fs.readFileSync(filePath).toString('base64')}`;
}

function paperImageSources(attachments = [], toolResult = null) {
  const attachmentImages = new Map(attachments.map((attachment) => [attachment.id, attachment.previewDataUrl || resolveConversationImage(attachment)]));
  const generatedImages = new Set((toolResult?.files || [])
    .filter((filePath) => IMAGE_MIME_TYPES[path.extname(filePath || '').toLowerCase()])
    .map((filePath) => path.resolve(filePath).toLowerCase()));
  return { attachmentImages, generatedImages };
}

function materializePaperImages(content, attachments = [], toolResult = null) {
  const { attachmentImages, generatedImages } = paperImageSources(attachments, toolResult);
  return String(content || '').replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, source) => {
    let filePath = null;
    if (source.startsWith('attachment://')) filePath = attachmentImages.get(source.slice('attachment://'.length));
    else {
      try {
        const candidate = source.startsWith('file:') ? new URL(source).pathname : source;
        const resolved = path.resolve(decodeURIComponent(candidate));
        if (generatedImages.has(resolved.toLowerCase())) filePath = resolved;
      } catch {
        filePath = null;
      }
    }
    const embedded = typeof filePath === 'string' && filePath.startsWith('data:image/')
      ? filePath
      : filePath ? asEmbeddedImage(filePath) : null;
    return embedded ? `${prefix}${quote}${embedded}${quote}` : match;
  });
}

function removeUnavailablePaperImages(content, attachments = [], toolResult = null) {
  const { attachmentImages, generatedImages } = paperImageSources(attachments, toolResult);
  return String(content || '').replace(/<figure\b[^>]*>[\s\S]*?<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1[^>]*>[\s\S]*?<\/figure>/gi, (figure, _quote, source) => {
    const isAttachment = source.startsWith('attachment://') && attachmentImages.has(source.slice('attachment://'.length));
    let isGenerated = false;
    try { isGenerated = generatedImages.has(path.resolve(decodeURIComponent(source)).toLowerCase()); } catch { isGenerated = false; }
    return isAttachment || isGenerated || source.startsWith('data:image/') ? figure : '';
  });
}

function ensureToolImagesInPaper(content, toolResult = null) {
  const imageFiles = (toolResult?.files || []).filter((filePath) => IMAGE_MIME_TYPES[path.extname(filePath || '').toLowerCase()]);
  if (!imageFiles.length) return content;
  const used = new Set([...String(content || '').matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)/gi)].map((match) => {
    try { return path.resolve(decodeURIComponent(match[1])).toLowerCase(); } catch { return ''; }
  }));
  const figures = imageFiles.filter((filePath) => !used.has(path.resolve(filePath).toLowerCase())).map((filePath, index) => {
    const name = path.basename(filePath, path.extname(filePath));
    return `<figure><img src="${filePath}" alt="${name}"><figcaption>图 ${index + 1} ${name}</figcaption></figure>`;
  }).join('\n');
  return figures ? `${content}\n${figures}` : content;
}

function ensureAttachmentImagesInPaper(content, attachments = []) {
  const imageAttachments = attachments.filter((attachment) => attachment.previewDataUrl || resolveConversationImage(attachment));
  if (!imageAttachments.length) return content;
  const used = new Set([...String(content || '').matchAll(/attachment:\/\/([^"'\s>]+)/gi)].map((match) => match[1]));
  const figures = imageAttachments
    .filter((attachment) => !used.has(attachment.id))
    .map((attachment, index) => `<figure><img src="${attachment.previewDataUrl || `attachment://${attachment.id}`}" alt="${attachment.name}"><figcaption>图 ${index + 1} ${attachment.name}</figcaption></figure>`)
    .join('\n');
  if (!figures) return content;
  const firstFigureReference = /(<p\b[^>]*>[^<]*图\s*\d+[\s\S]*?<\/p>)/i;
  return firstFigureReference.test(content)
    ? content.replace(firstFigureReference, `$1\n${figures}`)
    : `${content}\n${figures}`;
}

function postProcessAgentContent(rawContent, attachments, toolResult, retrievalHits) {
  const citationEvidence = retrievalHits.map((hit, index) => ({ index: index + 1, documentName: hit.documentName, page: hit.page }));
  const tables = toolResult?.tables || (toolResult?.table ? [toolResult.table] : []);
  const generatedTables = tables.map((table, index) => buildAcademicTable(table, index + 1)).filter(Boolean);
  const contentWithoutPlaceholders = removeUnavailablePaperImages(rawContent, attachments, toolResult);
  const contentWithRequiredToolImages = ensureToolImagesInPaper(contentWithoutPlaceholders, toolResult);
  const contentWithRequiredImages = ensureAttachmentImagesInPaper(contentWithRequiredToolImages, attachments);
  const contentWithImages = materializePaperImages(contentWithRequiredImages, attachments, toolResult);
  const contentWithFootnotes = normalizeCitationMarkers(contentWithImages, citationEvidence);
  const missingTables = generatedTables.filter(table => !contentWithFootnotes.includes(table));
  return [contentWithFootnotes, ...missingTables].join('\n\n');
}

module.exports = { postProcessAgentContent };
