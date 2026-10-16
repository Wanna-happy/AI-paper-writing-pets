const { app, BrowserWindow } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../.ui-smoke/spreadsheet-render'); app.setPath('userData', root);
app.whenReady().then(async () => {
  let win;
  try {
    fs.mkdirSync(root, { recursive: true });
    win = new BrowserWindow({show:false,width:1540,height:1000,webPreferences:{preload:path.join(__dirname,'ui-smoke-preload.cjs'),contextIsolation:true,sandbox:false,backgroundThrottling:false}});
    require('../electron/app-security').secureWindow(win,path.resolve(__dirname,'..'));
    win.webContents.on('console-message',event=>console.log('Renderer:',event.message));
    await win.loadFile(path.resolve(__dirname,'../src/feed.html'));
    const open = async (sheet,id='real-excel') => {
      await win.webContents.executeJavaScript(`(async()=>{switchView('workbench');await openUploadedAttachment({id:${JSON.stringify(id)},name:'完整格式.xlsx'},1,${sheet});if(!el['empirical-preview'].classList.contains('is-expanded'))el['preview-expand'].click();})()`);
      let frame;
      for(let i=0;i<100;i++) {
        frame = win.webContents.mainFrame.frames.find(item=>item.url.endsWith('/spreadsheet-preview.html'));
        if(frame && await frame.executeJavaScript(`!!document.querySelector('table')`)) return frame;
        await new Promise(resolve=>setTimeout(resolve,50));
      }
      throw new Error('工作表未加载');
    };
    let frame=await open(0);
    const merged=await frame.executeJavaScript(`({end:document.body.textContent.includes('SHEET_TWO_END'),merged:!!document.querySelector('[colspan="4"]'),styled:[...document.querySelectorAll('td')].some(x=>getComputedStyle(x).fontSize==='32px'),numberFormat:document.querySelector('[data-cell="B3"]').textContent==='12.35%',chinese:document.body.textContent.includes('完整格式预览'),scripts:document.scripts.length})`);
    assert(merged.end&&merged.merged&&merged.styled&&merged.numberFormat&&merged.chinese,JSON.stringify(merged));
    await win.webContents.capturePage();await new Promise(r=>setTimeout(r,300));fs.writeFileSync(path.join(root,'merged-sheet.png'),(await win.webContents.capturePage()).toPNG());
    frame=await open(1);
    const styled=await frame.executeJavaScript(`getComputedStyle(document.querySelector('[data-cell="A1"]')).backgroundColor==='rgb(146, 208, 80)'`);assert(styled);
    for(let i=0;i<100;i++){if(await frame.executeJavaScript(`!!document.querySelector('[data-cell="AJ260"]')`))break;await new Promise(r=>setTimeout(r,20));}
    const full=await frame.executeJavaScript(`({end:document.body.textContent.includes('R260C36'),rows:document.querySelectorAll('tbody tr').length,manualPaging:/上一段|下一段|跳转到行/.test(document.querySelector('nav').textContent),columns:document.querySelector('thead').querySelectorAll('th').length-1,scrollWidth:document.querySelector('.grid-scroll').scrollWidth})`);
    assert(full.end&&full.rows===260&&!full.manualPaging&&full.columns===36,JSON.stringify(full));
    await frame.executeJavaScript(`const end=[...document.querySelectorAll('td')].find(x=>x.textContent.trim()==='R260C36');end.scrollIntoView({block:'center',inline:'center'})`);
    await win.webContents.capturePage();await new Promise(r=>setTimeout(r,350));fs.writeFileSync(path.join(root,'last-cell.png'),(await win.webContents.capturePage()).toPNG());
    const sourceLocked=await win.webContents.executeJavaScript(`el['preview-open-menu'].hidden&&!el['empirical-preview-content'].querySelector('[contenteditable="true"],textarea')`);assert(sourceLocked);
    assert(await win.webContents.executeJavaScript(`!!document.querySelector('.preview-toolbar [aria-label="文档缩放"]')`));
    const setZoom=async value=>win.webContents.executeJavaScript(`{const control=document.querySelector('[aria-label="文档缩放"]');control.value=${JSON.stringify(value)};control.dispatchEvent(new Event('change'));}`);
    await setZoom('150');for(let i=0;i<100;i++){if(await frame.executeJavaScript(`document.querySelector('table').style.zoom==='1.5'`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await frame.executeJavaScript(`document.querySelector('table').style.zoom==='1.5'`));
    await frame.executeJavaScript(`document.querySelector('[role="tab"]').click()`);
    for(let i=0;i<100;i++){if(await frame.executeJavaScript(`document.body.textContent.includes('SHEET_TWO_END')`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await frame.executeJavaScript(`document.querySelector('table').style.zoom==='1.5'`));
    await frame.executeJavaScript(`document.querySelectorAll('[role="tab"]')[1].click()`);
    for(let i=0;i<100;i++){if(await frame.executeJavaScript(`!!document.querySelector('[data-cell="AJ260"]')`))break;await new Promise(r=>setTimeout(r,20));}
    await setZoom('fit');await new Promise(r=>setTimeout(r,100));
    assert(await frame.executeJavaScript(`document.querySelector('table').getBoundingClientRect().width<=document.querySelector('.grid-scroll').clientWidth+2`));
    await setZoom('75');await new Promise(r=>setTimeout(r,100));assert(await frame.executeJavaScript(`document.querySelector('table').style.zoom==='0.75'`));
    frame=await open(0,'real-xls');assert(await frame.executeJavaScript(`document.body.textContent.includes('SHEET_TWO_END')`));
    frame=await open(0,'real-csv');assert(await frame.executeJavaScript(`document.body.textContent.includes('变量')&&document.body.textContent.includes('生育率')`));
    const X=require('../src/vendor/xlsx.full.min.js'),book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet(Array.from({length:737},(_,r)=>Array.from({length:12},(_,c)=>`R${r+1}C${c+1}`))),'全部737行');
    const bytes=Buffer.from(X.write(book,{type:'buffer',bookType:'xlsx'})).toString('base64');
    await win.webContents.executeJavaScript(`document.querySelector('.docx-native-frame').contentWindow.postMessage({type:'render-spreadsheet',bytes:Uint8Array.from(atob(${JSON.stringify(bytes)}),x=>x.charCodeAt(0))},'*')`);
    for(let i=0;i<200;i++){if(await frame.executeJavaScript(`document.querySelectorAll('tbody tr').length===737`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await frame.executeJavaScript(`document.querySelectorAll('tbody tr').length===737&&!document.querySelector('input[aria-label="跳转到行"]')`));
    await win.webContents.executeJavaScript(`document.querySelector('.docx-native-frame').contentWindow.postMessage({type:'preview-locate',value:'L737'},'*')`);
    for(let i=0;i<100;i++){if(await frame.executeJavaScript(`!!document.querySelector('[data-cell="L737"].preview-search-hit')`))break;await new Promise(r=>setTimeout(r,20));}
    assert(await frame.executeJavaScript(`!!document.querySelector('[data-cell="L737"].preview-search-hit')`));
    const bottom=await frame.executeJavaScript(`(()=>{const grid=document.querySelector('.grid-scroll'),cell=document.querySelector('[data-cell="L737"]'),a=grid.getBoundingClientRect(),b=cell.getBoundingClientRect();return grid.scrollTop>0&&b.bottom<=a.bottom&&b.top>=a.top;})()`);assert(bottom);
    await win.webContents.capturePage();await new Promise(r=>setTimeout(r,250));fs.writeFileSync(path.join(root,'continuous-737-rows.png'),(await win.webContents.capturePage()).toPNG());
    console.log(JSON.stringify({merged,full,continuous737Rows:bottom,toolbarZoom:true,zoomPersistsAcrossSheets:true,fitWidth:true,legacyXls:true,chineseCsv:true,readOnly:sourceLocked}));win.destroy();app.exit(0);
  }catch(error){console.error(error.stack);win?.destroy();app.exit(1);}
});
