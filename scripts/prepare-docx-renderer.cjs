// Vendor the pinned renderer without asking a package manager to rewrite dependencies.
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
(async () => {
  const metadata = await (await fetch('https://registry.npmjs.org/docx-preview/0.3.7')).json();
  const bytes = Buffer.from(await (await fetch(metadata.dist.tarball)).arrayBuffer());
  if ('sha512-' + crypto.createHash('sha512').update(bytes).digest('base64') !== metadata.dist.integrity) throw new Error('Renderer archive integrity mismatch');
  const archive = zlib.gunzipSync(bytes), destination = path.resolve(__dirname, '../src/vendor');
  const needed = new Map([['package/dist/docx-preview.min.js', 'docx-preview.min.js'], ['package/LICENSE', 'docx-preview.LICENSE']]);
  for (let index = 0; index < archive.length;) {
    const header = archive.subarray(index, index + 512); if (header.every(value => value === 0)) break;
    const name = header.subarray(0, 100).toString().replace(/\0.*$/, '');
    const size = parseInt(header.subarray(124, 136).toString().replace(/\0.*$/, '').trim(), 8) || 0;
    if (needed.has(name)) { fs.writeFileSync(path.join(destination, needed.get(name)), archive.subarray(index + 512, index + 512 + size)); needed.delete(name); }
    index += 512 + Math.ceil(size / 512) * 512;
  }
  if (needed.size) throw new Error('Renderer archive missing files: ' + [...needed.keys()].join(', '));
  fs.copyFileSync(path.resolve(__dirname, '../node_modules/jszip/dist/jszip.min.js'), path.join(destination, 'jszip.min.js'));
  fs.copyFileSync(path.resolve(__dirname, '../node_modules/jszip/LICENSE.markdown'), path.join(destination, 'jszip.LICENSE'));
  require('./build-docx-frame.cjs');
  console.log('Pinned DOCX renderer 0.3.7 integrity verified; local assets installed without dependency reordering');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
