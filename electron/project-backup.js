const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const JSZip=require('jszip');
const MAX_BYTES=256*1024*1024;
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function within(root,file){const relative=path.relative(root,file);return relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);}
function walk(value,visit){
  if(Array.isArray(value))return value.map(item=>walk(item,visit));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,walk(v,visit)]));
  return visit(value);
}
async function createBackup(project,userData){
  const root=fs.realpathSync(userData),zip=new JSZip(),files=[],seen=new Map();let total=0;
  function add(file){
    if(!fs.existsSync(file)||!fs.statSync(file).isFile())throw new Error(`备份缺少文件：${path.basename(file)}`);
    const actual=fs.realpathSync(file);if(!within(root,actual))throw new Error('备份仅支持已导入本机工作区的文件');
    if(seen.has(actual))return seen.get(actual);
    if(/(?:api-key|\.sqlite|\.env|settings\.json)/i.test(path.basename(actual)))throw new Error('备份不包含模型配置或凭据文件');
    const size=fs.statSync(actual).size;if(size>MAX_BYTES-total)throw new Error('项目备份超过 256 MB，请先拆分项目');
    const bytes=fs.readFileSync(actual);total+=bytes.length;
    const entry=`files/${files.length}`,token=`backup-file:${files.length}`;
    files.push({entry,token,relative:path.relative(root,actual).split(path.sep).join('/'),sha256:hash(bytes),size:bytes.length});zip.file(entry,bytes);seen.set(actual,token);return token;
  }
  const saved=walk(project,value=>typeof value==='string'&&path.isAbsolute(value)&&fs.existsSync(value)&&fs.statSync(value).isFile()?add(value):value);
  function attachments(value){
    if(!value||typeof value!=='object')return;
    if(/^[a-f0-9-]{36}$/i.test(value.id||'')&&/^\.[a-z0-9]+$/i.test(value.extension||'')){
      const file=path.join(root,'conversation-files',`${value.id}${value.extension}`);if(fs.existsSync(file))add(file);
    }
    for(const item of Object.values(value))if(item&&typeof item==='object')attachments(item);
  }
  attachments(project);
  zip.file('manifest.json',JSON.stringify({format:'paper-pet-project',version:1,createdAt:new Date().toISOString(),project:saved,files}));
  return zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'});
}
async function restoreBackup(bytes,userData){
  if(bytes.length>MAX_BYTES)throw new Error('备份文件超过 256 MB');
  const zip=await JSZip.loadAsync(bytes),manifestFile=zip.file('manifest.json');if(!manifestFile)throw new Error('不是有效的项目备份');
  if(manifestFile._data?.uncompressedSize>64*1024*1024)throw new Error('备份清单过大');
  const manifestBytes=await manifestFile.async('nodebuffer');if(manifestBytes.length>64*1024*1024)throw new Error('备份清单过大');
  const data=JSON.parse(manifestBytes.toString('utf8'));
  if(data.format!=='paper-pet-project'||data.version!==1||!data.project?.id||!Array.isArray(data.project.documents)||!Array.isArray(data.project.drafts)||!Array.isArray(data.project.conversations)||!Array.isArray(data.files)||data.files.length>2000)throw new Error('备份格式或版本不受支持');
  const ids=new Map(), collect=value=>{if(!value||typeof value!=='object')return;if(typeof value.id==='string')ids.set(value.id,ids.get(value.id)||crypto.randomUUID());for(const v of Object.values(value))if(v&&typeof v==='object')collect(v);};collect(data.project);
  const remap=s=>{if(ids.has(s))return ids.get(s);return s.replace(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi,id=>ids.get(id)||id);};
  const newId=ids.get(data.project.id),root=path.resolve(userData),tokens=new Map(),pending=[];let total=0;
  // Validate every entry before writing anything. Never extract archive paths.
  for(const file of data.files){
    if(!/^files\/\d+$/.test(file.entry)||!/^backup-file:\d+$/.test(file.token)||typeof file.relative!=='string'||file.relative.includes('..')||path.isAbsolute(file.relative)||!Number.isSafeInteger(file.size)||file.size<0)throw new Error('备份包含无效文件路径');
    const entry=zip.file(file.entry);if(!entry)throw new Error('备份文件不完整');
    const declared=entry._data?.uncompressedSize;if(declared>MAX_BYTES||declared!==file.size)throw new Error('备份解压大小或文件声明不一致');
    total+=file.size;if(total>MAX_BYTES)throw new Error('备份解压大小超限');
    const content=await entry.async('nodebuffer');if(content.length!==file.size||hash(content)!==file.sha256)throw new Error('备份文件校验失败');
    const basename=remap(path.basename(file.relative));
    const target=file.relative.startsWith('conversation-files/')?path.join(root,'conversation-files',basename):file.relative.startsWith('library/')?path.join(root,'library',newId,basename):path.join(root,'restored-projects',newId,String(pending.length),basename);
    if(!within(root,target)||fs.existsSync(target))throw new Error('恢复文件位置冲突');
    tokens.set(file.token,target);pending.push({target,content});
  }
  function restore(value){if(Array.isArray(value))return value.map(restore);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!['apiKey','api','settings','storedApiKey'].includes(k)).map(([k,v])=>[remap(k),restore(v)]));if(typeof value==='string'){if(value.startsWith('backup-file:')){if(!tokens.has(value))throw new Error('备份缺少关联文件');return tokens.get(value);}if(path.isAbsolute(value))return '';return remap(value);}return value;}
  const project=restore(data.project);project.id=newId;project.title=`${project.title||'论文项目'}（恢复副本）`;project.updatedAt=new Date().toISOString();
  project.confirmedAnalysisChoices={};
  for(const plan of Object.values(project.empiricalPlans||{})){plan.status='pending-confirmation';delete plan.approvedAt;delete plan.writingApprovedAt;}
  const written=[];try{for(const file of pending){fs.mkdirSync(path.dirname(file.target),{recursive:true});if(!within(fs.realpathSync(root),fs.realpathSync(path.dirname(file.target))))throw new Error('恢复目录不能指向工作区之外');fs.writeFileSync(file.target,file.content,{flag:'wx'});written.push(file.target);}}catch(error){for(const file of written)fs.unlinkSync(file);throw error;}
  return project;
}
module.exports={createBackup,restoreBackup};
