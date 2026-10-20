// Host-owned permissions. Skill text and model arguments cannot grant capabilities.
const DEFAULT_PERMISSIONS = Object.freeze({ approvalPolicy:'on-request', sandboxMode:'project', webAccess:'off', dependencyInstall:'allow', sandboxNetwork:false });
const OPERATIONS = { prepare_data_file:'prepare', run_data_analysis:'analysis', search_web:'search', lookup_scholarly_metadata:'search', collect_data:'collect', install_python_dependency:'dependency' };
const LABELS = { prepare:'生成清洗数据副本', analysis:'执行分析代码', search:'搜索公开网页', collect:'下载并解析公开数据', dependency:'安装项目分析依赖' };
function normalizePermissions(raw={},legacy={}) {
  raw=raw&&typeof raw==='object'?raw:{};
  const choose=(name,values,fallback)=>raw[name]===undefined?fallback:values.includes(raw[name])?raw[name]:values[0];
  return { approvalPolicy:choose('approvalPolicy',['always','on-request'],'on-request'),
    sandboxMode:choose('sandboxMode',['read-only','project'],'project'),
    webAccess:choose('webAccess',['off','search','collect'],legacy.networkEnabled===true?'collect':'off'),
    dependencyInstall:choose('dependencyInstall',['deny','ask','allow'],'allow'),
    sandboxNetwork:raw.sandboxNetwork===undefined?legacy.networkEnabled===true:raw.sandboxNetwork===true };
}
function permissions(settings={}) {return normalizePermissions(settings?.permissions,settings?.dataEnvironment);}
function assertAllowed(settings,operation) {
  const p=permissions(settings);let reason='';
  if(['prepare','analysis','collect','dependency'].includes(operation)&&p.sandboxMode==='read-only')reason='当前为只读检查模式，不允许生成数据副本、执行分析代码或安装依赖';
  else if(operation==='search'&&p.webAccess==='off')reason='网页访问已关闭';
  else if(operation==='collect'&&p.webAccess!=='collect')reason='当前未允许下载并采集公开数据';
  else if(operation==='dependency'&&p.dependencyInstall==='deny')reason='依赖安装已禁止';
  if(reason){const error=new Error(`${reason}。可在“设置 → 权限”中调整。`);error.code='PERMISSION_DENIED';throw error;}
  return p;
}
function needsApproval(settings,operation) {const p=permissions(settings);return p.approvalPolicy==='always'||(operation==='dependency'&&p.dependencyInstall==='ask');}
function guardTools(tools,context={}){return tools.map(tool=>{const operation=OPERATIONS[tool.name];if(!operation)return tool;return {...tool,execute:async(...args)=>{
  const settings=()=>context.loadSettings?.()||{};assertAllowed(settings(),operation);
  if(needsApproval(settings(),operation)&&!context.authorizeTool)throw new Error('当前操作需要用户确认，缺少权限确认通道。');
  await context.authorizeTool?.(tool.name,args[1]);assertAllowed(settings(),operation);return tool.execute(...args);
}};});}
module.exports={DEFAULT_PERMISSIONS,OPERATIONS,LABELS,normalizePermissions,permissions,assertAllowed,needsApproval,guardTools};
