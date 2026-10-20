const {app,BrowserWindow}=require('electron'),path=require('node:path'),assert=require('node:assert/strict');
app.setPath('userData',path.resolve(__dirname,'../.ui-smoke/workspace-window-profile'));
app.on('browser-window-created',(_event,win)=>win.on('show',()=>win.hide()));
process.argv.push('--workspace');require('../electron/main.js');
const timeout=setTimeout(()=>{console.error('窗口控制验收超时');app.exit(1);},30000);
app.whenReady().then(async()=>{try{
 let win;for(let i=0;i<150;i++){win=BrowserWindow.getAllWindows().find(item=>item.webContents.getURL().endsWith('/feed.html'));if(win&&!win.webContents.isLoading())break;await new Promise(r=>setTimeout(r,50));}assert(win);
 const calls=[];let maximized=false;
 // Hidden-window integration: verify trusted IPC dispatch and renderer state without displaying a window.
 win.isMaximized=()=>maximized;win.maximize=()=>{calls.push('maximize');maximized=true;};win.unmaximize=()=>{calls.push('restore');maximized=false;};win.minimize=()=>{calls.push('minimize');};
 await win.webContents.executeJavaScript(`(async()=>{const state=await petAPI.controlWorkspaceWindow('toggle-maximize');if(!state.maximized)throw new Error('最大化请求未生效');const restored=await petAPI.controlWorkspaceWindow('toggle-maximize');if(restored.maximized)throw new Error('还原请求未生效');await petAPI.controlWorkspaceWindow('minimize');let denied=false;try{await petAPI.controlWorkspaceWindow('unknown-action');}catch{denied=true;}if(!denied)throw new Error('接受了未知窗口操作');})()`);
 assert.deepEqual(calls,['maximize','restore','minimize']);
 win.setSize(1100,780);win.emit('resized');const saved=require('../electron/settings').loadSettings().workspaceBounds;assert.equal(saved.width,1100);assert.equal(saved.height,780);
 console.log('Trusted window IPC dispatch, maximize/restore/minimize state, unknown-action rejection and normal size persistence passed (hidden window; native maximization visually untested)');clearTimeout(timeout);app.exit(0);
 }catch(error){console.error(error.stack);clearTimeout(timeout);app.exit(1);}});
