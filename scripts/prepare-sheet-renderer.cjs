const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
(async () => {
  const root = path.resolve(__dirname, '../src/vendor'), base = 'https://cdn.sheetjs.com/xlsx-0.20.3/package/';
  const manifest = {version:'0.20.3',files:[]};
  for (const [remote, local] of [['dist/xlsx.full.min.js','xlsx.full.min.js'],['LICENSE','xlsx.LICENSE']]) {
    const response = await fetch(base + remote); if(!response.ok)throw new Error('Download failed: '+response.status);
    const bytes = Buffer.from(await response.arrayBuffer());
    if(local.endsWith('.js')&&!bytes.toString().includes('0.20.3'))throw new Error('Unexpected spreadsheet renderer version');
    fs.writeFileSync(path.join(root,local),bytes);manifest.files.push({file:local,url:base+remote,sha256:crypto.createHash('sha256').update(bytes).digest('hex')});
  }
  fs.writeFileSync(path.join(root,'xlsx-manifest.json'),JSON.stringify(manifest,null,2));
  console.log('Pinned local spreadsheet parser downloaded; no Office application or package-manager changes');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
