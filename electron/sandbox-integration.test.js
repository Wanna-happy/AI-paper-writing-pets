const assert = require('assert');
const fs = require('fs');
const path = require('path');
const net = require('net');
const { randomUUID } = require('crypto');
const { execFileSync } = require('child_process');
const { runSandbox } = require('./sandbox/windows-sandbox');

async function test() {
  if (process.platform !== 'win32') throw new Error('Windows LPAC integration tests require Windows; unsupported hosts must not execute generated code.');
  const root = path.resolve(__dirname, '../.sandbox-tests');
  const session = randomUUID();
  const oldToken = process.env.PAPER_PET_TEST_SECRET_TOKEN;
  process.env.PAPER_PET_TEST_SECRET_TOKEN = 'synthetic-host-secret';
  fs.mkdirSync(root, { recursive: true });
  const source = path.join(root, 'input.csv');
  fs.writeFileSync(source, 'x,y\n1,2\n3,4\n');
  const secret = path.join(root, 'private-sentinel.txt');
  fs.writeFileSync(secret, 'SENTINEL_PRIVATE_DATA');
  const aap = path.join(root, `aap-${session}.txt`);
  fs.writeFileSync(aap, 'AAP_ONLY');
  execFileSync('icacls.exe', [aap, '/grant', '*S-1-15-2-1:R'], { windowsHide: true });
  const server = net.createServer(socket => socket.end());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  async function execute(name, code, extra = {}) {
    const outputDir = path.join(root, 'analysis-runs', 'project', `${session}-${name}`);
    fs.mkdirSync(outputDir, { recursive: true });
    const scriptPath = path.join(outputDir, 'host-script.py');
    fs.writeFileSync(scriptPath, code);
    return runSandbox({ python: { executable: require('./python-runtime').bundledPythonPath() || 'python', prefix: [] }, scriptPath, dataFilePath: source, outputDir, timeoutMs: 120000, ...extra });
  }
  try {
    const paths = { secret, aap, hostPid: process.pid, outside: path.join(root, `escaped-${session}.txt`), port: server.address().port };
    const code = `print('SANDBOX_PYTHON_STARTED',flush=True)
import os,sys,json,socket,subprocess,ctypes
from ctypes import wintypes
import pandas as pd
print('PANDAS_OK',flush=True)
import scipy.stats
print('SCIPY_OK',flush=True)
import numpy as np
from dtaidistance import dtw
trajectories=[np.array([1.,2.,3.]),np.array([1.,2.,4.]),np.array([5.,6.,7.])]
distances=dtw.distance_matrix_fast(trajectories,window=3,parallel=False)
assert distances.shape==(3,3) and np.isfinite(distances).all() and np.allclose(distances,distances.T)
print('DTW_OK',flush=True)
import openpyxl
print('OPENPYXL_OK',flush=True)
import matplotlib
print('MATPLOTLIB_OK',flush=True)
matplotlib.use('Agg')
import matplotlib.pyplot as plt
print('PYPLOT_OK',flush=True)
paths=${JSON.stringify(paths)}
results={}
data=pd.read_csv(os.environ['DATA_FILE'])
results['mean']=float(data.x.mean())
plt.plot(data.x,data.y)
plt.savefig(os.path.join(os.environ['CHART_DIR'],'result.png'))
print('PLOT_OK',flush=True)
def denied(label, action):
 try:
  action()
  results[label]=False
 except (OSError,PermissionError): results[label]=True
denied('private_read',lambda:open(paths['secret']).read())
denied('aap_read',lambda:open(paths['aap']).read())
denied('outside_write',lambda:open(paths['outside'],'w').write('escape'))
denied('input_write',lambda:open(os.environ['DATA_FILE'],'w').write('tamper'))
denied('runtime_write',lambda:open(os.path.join(os.path.dirname(sys.executable),'tamper.py'),'w').write('escape'))
def connect():
 with socket.socket() as s:
  s.settimeout(2)
  s.connect(('127.0.0.1',paths['port']))
denied('network',connect)
denied('child_process',lambda:subprocess.run([sys.executable,'-I','-c','print(123)'],check=True))
results['clean_env']=not any('KEY' in k or 'TOKEN' in k or 'PROXY' in k for k in os.environ)
adv=ctypes.WinDLL('advapi32',use_last_error=True)
kernel=ctypes.WinDLL('kernel32',use_last_error=True)
kernel.GetCurrentProcess.restype=wintypes.HANDLE
kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD]
kernel.OpenProcess.restype=wintypes.HANDLE
results['host_process']=not bool(kernel.OpenProcess(0x1F0FFF,False,paths['hostPid']))
adv.OpenProcessToken.argtypes=[wintypes.HANDLE,wintypes.DWORD,ctypes.POINTER(wintypes.HANDLE)]
adv.GetTokenInformation.argtypes=[wintypes.HANDLE,ctypes.c_int,ctypes.c_void_p,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD)]
tok=wintypes.HANDLE()
assert adv.OpenProcessToken(kernel.GetCurrentProcess(),8,ctypes.byref(tok))
v=wintypes.DWORD(); size=wintypes.DWORD()
assert adv.GetTokenInformation(tok,29,ctypes.byref(v),4,ctypes.byref(size))
results['appcontainer']=v.value==1
adv.GetTokenInformation(tok,30,None,0,ctypes.byref(size))
buf=ctypes.create_string_buffer(size.value)
assert adv.GetTokenInformation(tok,30,buf,size,ctypes.byref(size))
results['capability_count']=wintypes.DWORD.from_buffer(buf).value
print(json.dumps(results))
`;
    const result = await execute('boundaries', code);
    assert(result.stdout.includes('DTW_OK'), '内置 DTW 库未在系统沙箱中完成距离计算');
    const checks = JSON.parse(result.stdout.trim().split('\n').pop());
    assert.equal(checks.mean, 2);
    for (const key of ['private_read', 'aap_read', 'outside_write', 'input_write', 'runtime_write', 'network', 'child_process', 'host_process', 'clean_env', 'appcontainer']) assert.equal(checks[key], true, key);
    assert.equal(checks.capability_count, 1, '仅允许 Windows 启动所需 registryRead 能力');
    assert.equal(result.charts.length, 1);
    assert.equal(fs.readFileSync(secret, 'utf8'), 'SENTINEL_PRIVATE_DATA');
    assert.equal(fs.readFileSync(source, 'utf8'), 'x,y\n1,2\n3,4\n');
    assert.equal(fs.existsSync(paths.outside), false);
    console.log('LPAC: real science/plot + file/network/process/environment boundaries passed');

    const memory = await execute('memory', 'try:\n x=bytearray(300*1024*1024)\n print("UNBOUNDED")\nexcept MemoryError:\n print("MEMORY_LIMIT")\n', { memoryMb: 96 });
    assert(memory.stdout.includes('MEMORY_LIMIT'));
    await assert.rejects(execute('timeout', 'while True: pass\n', { timeoutMs: 300 }), /超时/);
    const controller = new AbortController();
    const running = execute('cancel', 'import os,time\np=os.path.join(os.environ["CHART_DIR"],"heartbeat")\nwhile True:\n open(p,"w").write(str(time.time()))\n time.sleep(.02)\n', { signal: controller.signal });
    const outcome = running.then(() => null, error => error);
    const heartbeat = path.join(root, 'analysis-runs/project', `${session}-cancel`, 'sandbox/output/charts/heartbeat');
    for (let i=0; i<300 && !fs.existsSync(heartbeat); i++) await new Promise(resolve => setTimeout(resolve, 100));
    assert(fs.existsSync(heartbeat), '取消测试未启动沙箱进程');
    controller.abort();
    assert.equal((await outcome).name, 'AbortError');
    const timestamp = fs.statSync(heartbeat).mtimeMs;
    await new Promise(resolve => setTimeout(resolve, 150));
    assert.equal(fs.statSync(heartbeat).mtimeMs, timestamp, '取消后仍有进程运行');
    console.log('Job Object: memory limit, timeout and cancellation termination passed');
  } finally {
    if (oldToken === undefined) delete process.env.PAPER_PET_TEST_SECRET_TOKEN;
    else process.env.PAPER_PET_TEST_SECRET_TOKEN = oldToken;
    await new Promise(resolve => server.close(resolve));
  }
}
test().catch(error => { console.error(error); process.exitCode = 1; });
