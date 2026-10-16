let spreadsheetZoom='100';
function applySpreadsheetZoom(){
  const table=document.querySelector('table'),grid=document.querySelector('.grid-scroll');
  if(table&&grid){
    const anchorY=grid.getBoundingClientRect().top+(table.querySelector('thead')?.getBoundingClientRect().height||0)+2;
    const row=[...(table.tBodies[0]?.rows||[])].find(item=>{const box=item.getBoundingClientRect();return box.top<=anchorY&&box.bottom>anchorY;});
    const before=row?.getBoundingClientRect(),fraction=before?(anchorY-before.top)/before.height:0;
    table.style.zoom=spreadsheetZoom==='fit'?String(Math.min(1,grid.clientWidth/(table.offsetWidth||1))):String(Number(spreadsheetZoom)/100);
    if(row){const after=row.getBoundingClientRect(),nextY=grid.getBoundingClientRect().top+(table.querySelector('thead')?.getBoundingClientRect().height||0)+2;grid.scrollTop+=after.top+fraction*after.height-nextY;}
  }
}
window.addEventListener('resize',applySpreadsheetZoom);
window.addEventListener('message', async event => {
  if(event.source===window.parent&&['preview-find','preview-locate'].includes(event.data?.type)){
    let target,message;
    if(event.data.type==='preview-find'){
      const query=String(event.data.query||'').trim().toLowerCase(),matches=query?[...document.querySelectorAll('td[data-cell]')].filter(cell=>cell.textContent.toLowerCase().includes(query)):[];
      const index=matches.length?Number(event.data.index||0)%matches.length:0;target=matches[index];message=matches.length?`第 ${index+1} / ${matches.length} 个单元格`:'当前工作表未找到内容';
    }else {const value=String(event.data.value||'').toUpperCase();target=/^[A-Z]{1,4}[1-9]\d*$/.test(value)?document.querySelector(`[data-cell="${value}"]`):null;message=target?value:'请输入当前工作表中有效的单元格地址';}
    document.querySelectorAll('.preview-search-hit').forEach(el=>el.classList.remove('preview-search-hit'));if(target){target.classList.add('preview-search-hit');target.click();target.scrollIntoView({block:'center',inline:'center'});}
    window.parent.postMessage({type:'preview-find-result',message},'*');return;
  }
  if(event.source===window.parent&&event.data?.type==='preview-zoom'){
    if(['fit','50','75','100','125','150','200'].includes(event.data.value)){spreadsheetZoom=event.data.value;applySpreadsheetZoom();}return;
  }
  if (event.source !== window.parent || event.data?.type !== 'render-spreadsheet') return;
  try {
    const bytes = event.data.bytes;
    let input=bytes,type='array';
    if(['.csv','.tsv'].includes(event.data.format)){
      try{input=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{input=new TextDecoder('gb18030').decode(bytes);}
      type='string';
    }
    const book = XLSX.read(input, {type,cellStyles:true,cellNF:true,cellText:true});
    const root = document.getElementById('sheet'); root.replaceChildren();
    const toolbar = document.createElement('nav');toolbar.setAttribute('role','tablist');toolbar.setAttribute('aria-label','工作表');
    const sheetButtons=book.SheetNames.map((name,sheetIndex)=>{const button=document.createElement('button');button.type='button';button.setAttribute('role','tab');button.textContent=name;button.onclick=()=>{index=sheetIndex;refresh();};toolbar.append(button);return button;});
    const scroller=document.createElement('div');scroller.className='grid-scroll';
    const valuePreview=document.createElement('output');valuePreview.className='cell-value';valuePreview.hidden=true;
    root.append(scroller,valuePreview,toolbar);
    let archive, sheetPaths=[], borders=[], xmlStyles=new Map();
    const parse = text => new DOMParser().parseFromString(text,'application/xml');
    const children = (node,name) => [...(node?.children||[])].filter(x=>x.localName===name);
    const first = (node,name) => children(node,name)[0];
    const color = value => value?.rgb ? '#'+value.rgb.slice(-6) : null;
    if(bytes[0]===0x50&&bytes[1]===0x4b) {
      archive=await JSZip.loadAsync(bytes);
      const workbook=parse(await archive.file('xl/workbook.xml').async('string'));
      const rels=parse(await archive.file('xl/_rels/workbook.xml.rels').async('string'));
      const targets=new Map([...rels.getElementsByTagNameNS('*','Relationship')].map(x=>[x.getAttribute('Id'),x.getAttribute('Target')]));
      sheetPaths=[...workbook.getElementsByTagNameNS('*','sheet')].map(x=>{
        const target=targets.get(x.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'));
        return target?.startsWith('/') ? target.slice(1) : 'xl/'+target;
      });
      if(archive.file('xl/styles.xml'))borders=children(first(parse(await archive.file('xl/styles.xml').async('string')).documentElement,'borders'),'border');
    }
    let index=Math.max(0,Math.min(Number(event.data.sheet)||0,book.SheetNames.length-1)), renderSequence=0;
    const cssBorder = side => {
      if(!side?.getAttribute('style'))return null;
      const style=side.getAttribute('style'), c=first(side,'color');
      const rgb=c?.getAttribute('rgb');
      return `${/medium|thick/.test(style)?2:1}px ${/dotted|hair/.test(style)?'dotted':/dash/i.test(style)?'dashed':style==='double'?'double':'solid'} ${rgb?'#'+rgb.slice(-6):'#333'}`;
    };
    async function render() {
      const sequence=++renderSequence;
      const sheetIndex=index;valuePreview.hidden=true;
      sheetButtons.forEach((button,i)=>{button.setAttribute('aria-selected',String(i===sheetIndex));button.tabIndex=i===sheetIndex?0:-1;});
      const sheet=book.Sheets[book.SheetNames[index]]||{}, range=XLSX.utils.decode_range(sheet['!ref']||'A1');
      const merges=sheet['!merges']||[];
      for(const merge of merges){range.e.r=Math.max(range.e.r,merge.e.r);range.e.c=Math.max(range.e.c,merge.e.c);}
      let metadata=xmlStyles.get(sheetIndex);
      if(!metadata){
        metadata={cells:new Map(),columns:[],rows:new Map()};
        const entry=archive?.file(sheetPaths[sheetIndex]);
        if(entry){
          const xml=parse(await entry.async('string'));
          for(const cell of xml.getElementsByTagNameNS('*','c'))metadata.cells.set(cell.getAttribute('r'),Number(cell.getAttribute('s')||0));
          for(const col of xml.getElementsByTagNameNS('*','col'))for(let c=Number(col.getAttribute('min'))-1;c<Number(col.getAttribute('max'));c++)metadata.columns[c]=Number(col.getAttribute('width'));
          for(const row of xml.getElementsByTagNameNS('*','row'))if(row.hasAttribute('ht'))metadata.rows.set(Number(row.getAttribute('r'))-1,Number(row.getAttribute('ht')));
        }
        xmlStyles.set(sheetIndex,metadata);
      }
      if(sequence!==renderSequence)return;
      const totalRows=range.e.r+1,totalCols=range.e.c+1;
      const table=document.createElement('table'),cols=document.createElement('colgroup');cols.append(document.createElement('col'));
      for(let c=0;c<totalCols;c++){const col=document.createElement('col');const width=metadata.columns[c]??sheet['!cols']?.[c]?.wch??10;col.style.width=Math.max(24,Math.round(width*7+5))+'px';cols.append(col);}table.append(cols);
      const head=document.createElement('thead'),header=document.createElement('tr');header.append(document.createElement('th'));
      for(let c=0;c<totalCols;c++){const th=document.createElement('th');th.textContent=XLSX.utils.encode_col(c);th.scope='col';header.append(th);}head.append(header);table.append(head);
      const body=document.createElement('tbody'),mergeAt=new Map(),covered=new Set();
      for(const m of merges){mergeAt.set(`${m.s.r}/${m.s.c}`,m);for(let r=m.s.r;r<=m.e.r;r++)for(let c=m.s.c;c<=m.e.c;c++)if(r!==m.s.r||c!==m.s.c)covered.add(`${r}/${c}`);}
      table.style.zoom=spreadsheetZoom==='fit'?'1':String(Number(spreadsheetZoom)/100);table.append(body);scroller.replaceChildren(table);scroller.scrollTop=0;scroller.scrollLeft=0;
      let batch=document.createDocumentFragment();
      for(let r=0;r<totalRows;r++){
        const tr=document.createElement('tr'),rowHead=document.createElement('th');rowHead.textContent=String(r+1);rowHead.scope='row';tr.append(rowHead);
        const height=metadata.rows.get(r)??sheet['!rows']?.[r]?.hpt;if(height)tr.style.height=height+'pt';
        for(let c=0;c<totalCols;c++){
          if(covered.has(`${r}/${c}`))continue;
          const address=XLSX.utils.encode_cell({r,c}),cell=sheet[address],td=document.createElement('td'),merge=mergeAt.get(`${r}/${c}`);
          td.dataset.cell=address;
          if(merge){td.colSpan=merge.e.c-merge.s.c+1;td.rowSpan=merge.e.r-merge.s.r+1;}
          td.textContent=cell?.w??(cell?.v==null?(cell?.f?'='+cell.f:''):String(cell.v));
          td.title=td.textContent;
          td.addEventListener('click',()=>{valuePreview.textContent=address+'：'+td.textContent;valuePreview.hidden=false;});
          const xf=book.Styles?.CellXf?.[metadata.cells.get(address)??0],font=book.Styles?.Fonts?.[xf?.fontId??0],fill=book.Styles?.Fills?.[xf?.fillId??0]||cell?.s,alignment=xf?.alignment;
          if(font){if(font.name)td.style.fontFamily=font.name;if(font.sz)td.style.fontSize=font.sz+'pt';if(font.bold)td.style.fontWeight='bold';if(font.italic)td.style.fontStyle='italic';if(font.underline)td.style.textDecoration='underline';if(color(font.color))td.style.color=color(font.color);}
          if(fill?.patternType==='solid'&&color(fill.fgColor))td.style.backgroundColor=color(fill.fgColor);
          td.style.textAlign=alignment?.horizontal==='centerContinuous'?'center':alignment?.horizontal||(cell?.t==='n'?'right':'left');
          td.style.verticalAlign=alignment?.vertical==='center'?'middle':alignment?.vertical||'bottom';
          td.style.whiteSpace=alignment?.wrapText?'pre-wrap':'pre';
          for(const side of ['top','right','bottom','left']){const line=cssBorder(first(borders[xf?.borderId],side));if(line)td.style['border'+side[0].toUpperCase()+side.slice(1)]=line;}
          tr.append(td);
        }batch.append(tr);
        // Yield while extending one continuous table; no manual segment limits.
        if((r+1)%100===0){body.append(batch);batch=document.createDocumentFragment();await new Promise(resolve=>requestAnimationFrame(resolve));if(sequence!==renderSequence)return;}
      }
      body.append(batch);
      applySpreadsheetZoom();
      window.parent.postMessage({type:'spreadsheet-rendered',sheets:book.SheetNames.length,rows:totalRows,columns:totalCols},'*');
    }
    const refresh=()=>void render().catch(()=>window.parent.postMessage({type:'spreadsheet-render-error'},'*'));
    await render();
  }catch{window.parent.postMessage({type:'spreadsheet-render-error'},'*');}
});
