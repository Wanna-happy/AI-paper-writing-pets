// A self-contained trusted frame can run in an opaque sandbox without file access.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const root = path.resolve(__dirname, '../src');
const writeFrame=(file,html)=>{if(process.argv.includes('--check')){if(fs.readFileSync(file,'utf8')!==html)throw new Error('预览包与源码不一致，请运行 node scripts/build-docx-frame.cjs');}else fs.writeFileSync(file,html);};
const scripts = ['vendor/jszip.min.js', 'vendor/docx-preview.min.js', 'docx-preview.js'].map(file => fs.readFileSync(path.join(root, file), 'utf8').replace(/<\/script/gi, '<\\/script'));
const hashes = scripts.map(code => "'sha256-" + crypto.createHash('sha256').update(code).digest('base64') + "'").join(' ');
const style = fs.readFileSync(path.join(root, 'styles/docx-preview.css'), 'utf8');
writeFrame(path.join(root, 'docx-preview.html'), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${hashes}; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none';"><style>${style}</style></head><body><main id="document"></main>${scripts.map(code => '<script>' + code + '</script>').join('')}</body></html>`);
const sheetScripts = ['vendor/jszip.min.js','vendor/xlsx.full.min.js','spreadsheet-preview.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8').replace(/<\/script/gi,'<\\/script'));
const sheetHashes = sheetScripts.map(code=>"'sha256-"+crypto.createHash('sha256').update(code).digest('base64')+"'").join(' ');
const sheetCss = fs.readFileSync(path.join(root,'styles/spreadsheet-preview.css'),'utf8');
writeFrame(path.join(root, 'spreadsheet-preview.html'), `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${sheetHashes}; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none';"><style>${sheetCss}</style></head><body><main id="sheet"></main>${sheetScripts.map(code=>'<script>'+code+'</script>').join('')}</body></html>`);
