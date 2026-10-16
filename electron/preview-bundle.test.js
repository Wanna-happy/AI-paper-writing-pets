const {execFileSync}=require('node:child_process');
const path=require('node:path');
execFileSync(process.execPath,[path.resolve(__dirname,'../scripts/build-docx-frame.cjs'),'--check'],{stdio:'pipe',windowsHide:true});
console.log('Sandboxed DOCX/spreadsheet bundles match renderer sources and CSP hashes');
