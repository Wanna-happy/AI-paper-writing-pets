/* Marked 17.0.1 is vendored in ./vendor for offline rendering. */
(function (root) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
  const parser = new root.marked.Marked({
    gfm: true,
    breaks: true,
    renderer: {
      // Model output is text, never executable HTML. Images remain descriptive text;
      // attachments and analysis figures use their existing, separate preview paths.
      html: token => escape(token.text),
      image: token => escape(token.text),
    },
  });
  const allowed = new Set(['P', 'BR', 'STRONG', 'EM', 'DEL', 'CODE', 'PRE',
    'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'LI', 'BLOCKQUOTE',
    'HR', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'A', 'INPUT']);

  function normalizeDisplay(text) {
    // Repair emphasis edge whitespace without touching fenced or inline code.
    return String(text ?? '').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part, index) => {
      if (index % 2) return part;
      part = part.replace(/\*\*([^*\n]+)\*\*/g, (_, inner) => `**${inner.trim()}**`);
      // Models sometimes compress numbered Chinese sections into a single paragraph.
      part = part.replace(/(^|[。；！？\s])(\*\*[一二三四五六七八九十]+、[^*\n]+\*\*)[ \t]*/g, '$1\n\n### $2\n\n');
      return part.replace(/([：:。；！？）)])[ \t]+-[ \t]+(?=\S)/g, '$1\n\n- ');
    }).join('');
  }
  function render(target, text, { hideArtifacts = false } = {}) {
    const template = document.createElement('template');
    template.innerHTML = parser.parse(normalizeDisplay(text));
    // Discard parser formatting between blocks, not whitespace in message/code text.
    for (const child of [...template.content.childNodes]) {
      if (child.nodeType === Node.TEXT_NODE && !child.textContent.trim()) child.remove();
    }
    for (const element of template.content.querySelectorAll('*')) {
      if (!allowed.has(element.tagName)) {
        element.replaceWith(document.createTextNode(element.textContent || ''));
        continue;
      }
      const href = element.getAttribute('href');
      if (element.tagName === 'A' && /^artifact:\/\//.test(href || '') && (hideArtifacts || target.classList.contains('is-streaming'))) { element.remove(); continue; }
      const start = element.getAttribute('start');
      const checked = element.hasAttribute('checked');
      for (const attr of [...element.attributes]) element.removeAttribute(attr.name);
      if (element.tagName === 'A' && (/^https?:\/\//i.test(href || '') || /^artifact:\/\/(draft|analysis|plan|preparation)\//.test(href || ''))) {
        element.setAttribute('href', href);
        element.setAttribute('rel', 'noreferrer noopener');
        if (href.startsWith('artifact://')) element.addEventListener('click', event => { event.preventDefault(); element.dispatchEvent(new CustomEvent('artifact-link', { bubbles: true, detail: { href } })); });
      }
      if (element.tagName === 'OL' && /^\d+$/.test(start || '')) element.setAttribute('start', start);
      if (element.tagName === 'INPUT') {
        element.type = 'checkbox';
        element.disabled = true;
        element.checked = checked;
      }
    }
    // Scrolling belongs to the existing stream renderer. The saved/copied message
    // remains the original Markdown; only this display node is changed.
    target.classList.add('chat-markdown');
    target.replaceChildren(template.content);
    // Chat replies and document previews show the complete Markdown. Explicit
    // execution logs retain their own disclosure controls outside this renderer.
  }
  root.ChatMarkdown = { render };
})(globalThis);
