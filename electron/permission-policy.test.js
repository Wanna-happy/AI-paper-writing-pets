const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Module=require('node:module');
const policy=require('./permission-policy');
async function main(){
  assert.equal(policy.permissions({dataEnvironment:{networkEnabled:true}}).webAccess,'collect');
  assert.equal(policy.permissions({permissions:{webAccess:'search'},dataEnvironment:{networkEnabled:false}}).webAccess,'search');
  const invalid=policy.normalizePermissions({sandboxMode:'unrestricted',dependencyInstall:'yes',webAccess:'all',approvalPolicy:'never'});
  assert.equal(invalid.sandboxMode,'read-only');assert.equal(invalid.webAccess,'off');assert.equal(invalid.dependencyInstall,'deny');assert.equal(invalid.approvalPolicy,'always');
  for(const operation of ['prepare','analysis','collect','dependency'])assert.throws(()=>policy.assertAllowed({permissions:{sandboxMode:'read-only',webAccess:'collect'}},operation),{code:'PERMISSION_DENIED'});
  assert.doesNotThrow(()=>policy.assertAllowed({permissions:{sandboxMode:'read-only',webAccess:'search'}},'search'));
  assert.throws(()=>policy.assertAllowed({permissions:{webAccess:'search'}},'collect'));
  assert.equal(policy.needsApproval({permissions:{dependencyInstall:'ask'}},'dependency'),true);
  let called=0,approved=0,settings={permissions:{sandboxMode:'read-only'}};const tool={name:'run_data_analysis',execute:async()=>++called};
  let guarded=policy.guardTools([tool],{loadSettings:()=>settings,authorizeTool:async()=>approved++})[0];
  await assert.rejects(()=>guarded.execute('1',{}));assert.equal(called,0);assert.equal(approved,0);
  settings={permissions:{sandboxMode:'project',approvalPolicy:'always'}};
  guarded=policy.guardTools([tool],{loadSettings:()=>settings})[0];await assert.rejects(()=>guarded.execute('2',{}),/确认通道/);assert.equal(called,0);
  guarded=policy.guardTools([tool],{loadSettings:()=>settings,authorizeTool:async()=>{approved++;settings.permissions.sandboxMode='read-only';}})[0];
  await assert.rejects(()=>guarded.execute('3',{}));assert.equal(called,0);
  settings.permissions.sandboxMode='project';guarded=policy.guardTools([tool],{loadSettings:()=>settings,authorizeTool:async()=>approved++})[0];await guarded.execute('4',{});assert.equal(called,1);
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'paper-permissions-')),original=Module._load;
  try{
    Module._load=function(name,...args){return name==='electron'?{app:{getPath:()=>root}}:original.call(this,name,...args);};
    const stored=require('./settings');fs.writeFileSync(path.join(root,'settings.json'),JSON.stringify({petName:'保留昵称',dataEnvironment:{networkEnabled:true}}));
    assert.equal(stored.loadSettings().permissions.webAccess,'collect');
    const next=stored.saveSettings({permissions:{webAccess:'search',sandboxMode:'read-only',sandboxNetwork:false},documentFormatting:{bodySize:12}});
    assert.equal(next.petName,'保留昵称');assert.equal(next.dataEnvironment.networkEnabled,false);assert.equal(next.documentFormatting.bodySize,12);assert.equal(stored.loadSettings().permissions.webAccess,'search');
    stored.saveSettings({theme:'light'});assert.equal(stored.loadSettings().permissions.sandboxMode,'read-only');
  }finally{Module._load=original;fs.rmSync(root,{recursive:true,force:true});}
  console.log('Permissions: migration, invalid modes, backend denial, approval, revocation and settings persistence passed');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
