const { app, clipboard, ClipboardItem, nativeImage } = require('electron');

app.whenReady().then(async () => {
  const previous = await clipboard.read();
  // Electron returns read-only ClipboardItem objects. Reconstruct writable
  // entries *before* changing the OS clipboard, including all exposed types.
  const restore = await Promise.all(previous.map(async item => new ClipboardItem(Object.fromEntries(
    await Promise.all(item.types.map(async type => [type, await item.getType(type)]))
  ))));
  try {
    const text = '变量\t系数\n样本量\t128';
    const html = '<!DOCTYPE html><html><body><!--StartFragment--><table><tr><th>变量</th><th>系数</th></tr><tr><td>样本量</td><td>128</td></tr></table><!--EndFragment--></body></html>';
    await clipboard.write([new ClipboardItem({ 'text/plain': text, 'text/html': html })]);
    if (await clipboard.readText() !== text) throw new Error('plain text round-trip failed');
    if (!(await clipboard.has('text/html'))) throw new Error('HTML clipboard format missing');
    const items = await clipboard.read();
    const rich = await items[0].getType('text/html');
    if (!(await rich.text()).includes('<table>')) throw new Error('HTML table round-trip failed');
    const image = nativeImage.createFromBitmap(Buffer.from([255, 0, 0, 255]), { width: 1, height: 1 });
    await clipboard.write([new ClipboardItem({ 'image/png': new Blob([image.toPNG()], { type: 'image/png' }) })]);
    if (!(await clipboard.has('image/png'))) throw new Error(`PNG clipboard format missing: ${JSON.stringify((await clipboard.read()).map(item => item.types))}`);
    console.log('Electron 44 clipboard HTML, plain text and PNG round-trip passed');
  } finally {
    if (restore.length) await clipboard.write(restore); else clipboard.clear();
    app.quit();
  }
}).catch(error => { console.error(error); app.exit(1); });
