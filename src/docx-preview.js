let documentZoom='fit';
function fitDocument(){
  const page=document.querySelector('section.docx'),wrapper=document.querySelector('.docx-wrapper');
  if(page&&wrapper){
    const anchorY=Math.min(100,window.innerHeight/4),anchor=[...document.querySelectorAll('section.docx')].find(item=>{const box=item.getBoundingClientRect();return box.top<=anchorY&&box.bottom>anchorY;});
    const before=anchor?.getBoundingClientRect(),fraction=before?(anchorY-before.top)/before.height:0;
    wrapper.style.zoom=String(documentZoom==='fit'?Math.min(1,(window.innerWidth-24)/(page.offsetWidth||800)):Number(documentZoom)/100);
    if(anchor){const after=anchor.getBoundingClientRect();window.scrollBy(0,after.top+fraction*after.height-anchorY);}
  }
}
window.addEventListener('resize',fitDocument);
window.addEventListener('message', async event => {
  if(event.source===window.parent&&['preview-find','preview-locate'].includes(event.data?.type)){
    let target,message;
    if(event.data.type==='preview-find'){
      const query=String(event.data.query||'').trim().toLowerCase();
      const matches=query?[...document.querySelectorAll('section.docx p')].filter(p=>p.textContent.toLowerCase().includes(query)):[];
      const index=matches.length?Number(event.data.index||0)%matches.length:0;target=matches[index];message=matches.length?`第 ${index+1} / ${matches.length} 处`:'未找到内容';
    }else {const pages=[...document.querySelectorAll('section.docx')],value=String(event.data.value||'');target=/^\d+$/.test(value)?pages[Number(value)-1]:null;message=target?`第 ${value} 页`:'请输入有效页码';}
    document.querySelectorAll('.preview-search-hit').forEach(el=>el.classList.remove('preview-search-hit'));if(target){target.classList.add('preview-search-hit');target.scrollIntoView({block:'center'});}
    window.parent.postMessage({type:'preview-find-result',message},'*');return;
  }
  if(event.source===window.parent&&event.data?.type==='preview-zoom'){
    if(['fit','50','75','100','125','150','200'].includes(event.data.value)){documentZoom=event.data.value;fitDocument();}return;
  }
  if (event.source !== window.parent || event.data?.type !== 'render-docx') return;
  try {
    // The pinned renderer handles style-level breaks, but not a paragraph's
    // direct pageBreakBefore property. Normalize those breaks in memory only.
    const archive = await JSZip.loadAsync(event.data.bytes);
    const xml = await archive.file('word/document.xml').async('string');
    const parsed = new DOMParser().parseFromString(xml, 'application/xml');
    const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const paragraphs = [...parsed.getElementsByTagNameNS(ns, 'p')];
    for (const prop of [...parsed.getElementsByTagNameNS(ns, 'pageBreakBefore')]) {
      if (['0', 'false', 'off'].includes(prop.getAttributeNS(ns, 'val'))) continue;
      const paragraph = prop.parentElement?.parentElement;
      if (!paragraph || paragraph === paragraphs[0]) continue;
      const run = parsed.createElementNS(ns, 'w:r'), br = parsed.createElementNS(ns, 'w:br');
      br.setAttributeNS(ns, 'w:type', 'page'); run.append(br);
      paragraph.insertBefore(run, prop.parentElement.nextSibling); prop.remove();
    }
    archive.file('word/document.xml', new XMLSerializer().serializeToString(parsed));
    await docx.renderAsync(await archive.generateAsync({type: 'uint8array'}), document.getElementById('document'), null, { inWrapper: true, ignoreWidth: false, ignoreHeight: false, ignoreFonts: false, breakPages: true, ignoreLastRenderedPageBreak: false, renderHeaders: true, renderFooters: true, renderFootnotes: true, renderEndnotes: true, renderAltChunks: false, useBase64URL: true });
    for (const link of document.querySelectorAll('a')) link.removeAttribute('href');
    fitDocument();
    window.parent.postMessage({ type: 'docx-rendered', pages: document.querySelectorAll('section.docx').length }, '*');
  } catch { window.parent.postMessage({ type: 'docx-render-error' }, '*'); }
});
