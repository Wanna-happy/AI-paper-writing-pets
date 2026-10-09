const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const BACKEND = 'windows-lpac-job';
const RUNTIME_VERSION = 6;
const REQUIRED = ['numpy', 'pandas', 'scipy', 'matplotlib', 'openpyxl'];
const PACKAGES = [...REQUIRED, 'dateutil', 'pytz', 'tzdata', 'packaging', 'PIL', 'contourpy', 'cycler', 'fontTools', 'kiwisolver', 'pyparsing', 'et_xmlfile', 'six', 'mpl_toolkits',
  'statsmodels', 'sklearn', 'linearmodels', 'lifelines', 'autograd', 'autograd_gamma', 'cloudpickle', 'formulaic', 'interface_meta', 'joblib', 'mypy_extensions', 'narwhals', 'patsy', 'pyhdfe', 'threadpoolctl', 'typing_extensions', 'wrapt'];
const preparations = new Map();

function helperPath() {
  return path.resolve(__dirname, '../../assets/sandbox/win32/paper-pet-sandbox.exe').replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

function getSandboxStatus() {
  const supported = process.platform === 'win32' && process.arch === 'x64' && Number(os.release().split('.')[2]) >= 15063;
  const helperAvailable = fs.existsSync(helperPath());
  return {
    available: supported && helperAvailable,
    backend: BACKEND,
    supported, helperAvailable,
    policy: { network: 'denied', capabilities: ['registryRead'], inputs: 'read-only-copy', runtime: 'read-execute-copy', output: 'per-run', processLimit: 1, memoryMb: 1024 },
    error: !supported ? '数据分析要求 Windows 10 1703+/11 x64 的 LPAC 沙箱。' : !helperAvailable ? '缺少系统沙箱启动器，请重新安装应用或构建沙箱。' : null,
  };
}

function executeTrusted(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { windowsHide: true, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options }, (error, stdout, stderr) => {
      if (error) { error.stdout = stdout; error.stderr = stderr; reject(error); }
      else resolve(stdout);
    });
  });
}

// This probe is fixed application code, never model-generated code.
const PROBE = `import sys,sysconfig,importlib.util,importlib.metadata,json,os
names=${JSON.stringify(PACKAGES)}
packages={}
for name in names:
 spec=importlib.util.find_spec(name)
 if spec:
  source=list(spec.submodule_search_locations)[0] if spec.submodule_search_locations else spec.origin
  packages[name]=source
metadata=[]
for name in packages:
 try:
  dist=importlib.metadata.distribution({'sklearn':'scikit-learn','PIL':'pillow'}.get(name,name))
  folder=str(dist._path)
  if os.path.isdir(folder) and folder not in metadata: metadata.append(folder)
 except importlib.metadata.PackageNotFoundError: pass
print(json.dumps({'base':sys.base_prefix,'executable':sys.executable,'version':sys.version,'packages':packages,'metadata':metadata}))`;

function listFiles(root, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (['__pycache__', '.git'].includes(entry.name)) continue;
    const source = path.join(root, entry.name);
    const stat = fs.lstatSync(source);
    if (stat.isSymbolicLink()) throw new Error(`Python 运行时包含不支持的链接：${source}`);
    const target = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(source, target));
    else if (entry.isFile()) files.push({ source, target, size: stat.size, modified: stat.mtimeMs });
  }
  return files;
}

async function prepareRuntime(python, cacheDir, signal) {
  const key = `${python.executable}:${JSON.stringify(python.prefix || [])}:${cacheDir}`;
  if (preparations.has(key)) return preparations.get(key);
  const pending = (async () => {
    signal?.throwIfAborted();
    const info = JSON.parse(await executeTrusted(python.executable, [...(python.prefix || []), '-I', '-c', PROBE], { timeout: 30000, signal }));
    for (const name of REQUIRED) if (!info.packages[name]) throw new Error(`沙箱 Python 缺少 ${name}，请在数据分析环境中安装依赖。`);
    const files = [];
    const rootFiles = fs.readdirSync(info.base).filter(name => /^python(?:w|\d*)\.exe$/i.test(name) || /\.(?:dll|pyd|zip|_pth)$/i.test(name));
    for (const name of rootFiles) {
      const source = path.join(info.base, name), stat = fs.lstatSync(source);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Python 安装包含不支持的链接。');
      files.push({ source, target: name, size: stat.size, modified: stat.mtimeMs });
    }
    for (const name of ['DLLs', 'Lib']) {
      const folder = path.join(info.base, name);
      if (!fs.existsSync(folder)) continue;
      if (name === 'DLLs') files.push(...listFiles(folder, name));
      else {
        for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
          if (['site-packages', '__pycache__', 'test', 'tests', 'idlelib', 'tkinter', 'turtledemo'].includes(entry.name)) continue;
          const source = path.join(folder, entry.name), target = path.join(name, entry.name);
          const stat = fs.lstatSync(source);
          if (stat.isSymbolicLink()) throw new Error('Python 标准库包含不支持的链接。');
          if (entry.isDirectory()) files.push(...listFiles(source, target));
          else if (entry.isFile()) files.push({ source, target, size: stat.size, modified: stat.mtimeMs });
        }
      }
    }
    for (const [name, source] of Object.entries(info.packages)) {
      const stat = fs.lstatSync(source);
      if (stat.isSymbolicLink()) throw new Error(`Python 包含不支持的链接：${name}`);
      const target = path.join('Lib', 'site-packages', path.basename(source));
      if (stat.isDirectory()) files.push(...listFiles(source, target));
      else files.push({ source, target, size: stat.size, modified: stat.mtimeMs });
      // Windows wheels keep native DLL dependencies next to their package.
      const libNames = new Set([`${name.toLowerCase()}.libs`, name === 'PIL' ? 'pillow.libs' : name === 'sklearn' ? 'scikit_learn.libs' : `${name}.libs`]);
      for (const libs of libNames) {
        const sibling = path.join(path.dirname(source), libs);
        if (fs.existsSync(sibling)) files.push(...listFiles(sibling, path.join('Lib', 'site-packages', libs)));
      }
    }
    for (const folder of info.metadata || []) files.push(...listFiles(folder, path.join('Lib', 'site-packages', path.basename(folder))));
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify({ version: RUNTIME_VERSION, python: info.version, files })).digest('hex').slice(0, 24);
    const runtime = path.join(cacheDir, fingerprint);
    const manifest = path.join(runtime, 'runtime.json');
    if (!fs.existsSync(manifest)) {
      const staging = path.join(cacheDir, `${fingerprint}.${crypto.randomUUID()}.tmp`);
      fs.mkdirSync(staging, { recursive: true });
      try {
        for (const file of files) {
          signal?.throwIfAborted();
          const destination = path.join(staging, file.target);
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(file.source, destination);
        }
        if (!fs.existsSync(path.join(staging, 'python.exe'))) throw new Error('沙箱需要标准 Windows CPython 安装，当前解释器不受支持。');
        fs.writeFileSync(path.join(staging, 'runtime.json'), JSON.stringify({ version: RUNTIME_VERSION, fingerprint, packages: Object.keys(info.packages), fileCount: files.length }));
        for (let attempt = 0; ; attempt++) {
          try { fs.renameSync(staging, runtime); break; } catch (error) {
            if (fs.existsSync(manifest)) break;
            if (!['EPERM', 'EBUSY', 'EACCES'].includes(error.code) || attempt >= 10) throw error;
            await new Promise(resolve => setTimeout(resolve, 100 * (attempt + 1)));
          }
        }
      } finally {
        if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      }
    }
    return runtime;
  })();
  preparations.set(key, pending);
  try { return await pending; } finally { preparations.delete(key); }
}

async function runSandbox({ python, scriptPath, dataFilePath, outputDir, timeoutMs = 60000, memoryMb = 1024, signal }) {
  const status = getSandboxStatus();
  if (!status.available) throw new Error(`${status.error} 为保护本机数据，已拒绝执行分析代码。`);
  signal?.throwIfAborted();
  const root = path.join(outputDir, 'sandbox');
  const input = path.join(root, 'input'), output = path.join(root, 'output'), control = path.join(root, 'control');
  for (const folder of [input, output, control, ...['charts', 'tmp', 'profile', 'mpl'].map(name => path.join(output, name))]) fs.mkdirSync(folder, { recursive: true });
  const runtime = await prepareRuntime(python, path.join(path.dirname(path.dirname(outputDir)), '.sandbox-runtime'), signal);
  fs.copyFileSync(scriptPath, path.join(input, 'analysis_script.py'));
  const dataName = dataFilePath ? `data${path.extname(dataFilePath).toLowerCase()}` : '';
  if (dataName) fs.copyFileSync(dataFilePath, path.join(input, dataName));
  const config = path.join(control, 'config.json');
  fs.writeFileSync(config, JSON.stringify({ runtime, input, output, control, dataName, timeoutMs, memoryMb }));
  const cancel = () => fs.writeFileSync(path.join(control, 'cancel'), '1');
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) cancel();
  let result;
  try {
    let stdout;
    try { stdout = await executeTrusted(helperPath(), [config], { timeout: Math.max(100, Math.min(timeoutMs, 600000)) + 30000 }); }
    catch (error) { if (error.stdout?.trim().startsWith('{')) stdout = error.stdout; else throw new Error('Windows 系统沙箱启动或运行失败，分析已停止；不会切换到普通进程执行。'); }
    try { result = JSON.parse(stdout.trim()); } catch { throw new Error('系统沙箱返回无效结果，分析已停止。'); }
  } finally { signal?.removeEventListener('abort', cancel); }
  if (signal?.aborted || result.reason === 'canceled') throw new DOMException('分析已挂起', 'AbortError');
  if (result.error || !result.appContainer || result.backend !== BACKEND) throw new Error(result.error || '系统沙箱身份验证失败，已拒绝结果。');
  if (result.reason) {
    const error = new Error(result.reason === 'timeout' ? '沙箱分析超时，进程已终止。' : '沙箱输出超过限制，进程已终止。');
    error.stdout = String(result.stdout || '').slice(-1600);
    throw error;
  }
  if (result.exitCode !== 0) throw new Error(`沙箱内 Python 执行失败（退出码 ${result.exitCode}）：${String(result.stderr || '').slice(-1600)}`);
  const chartsDir = path.join(output, 'charts');
  if (fs.lstatSync(output).isSymbolicLink() || fs.lstatSync(chartsDir).isSymbolicLink()
      || fs.realpathSync(output).toLowerCase() !== path.resolve(output).toLowerCase()) throw new Error('沙箱输出目录被重定向，已拒绝读取。');
  const charts = fs.readdirSync(chartsDir).filter(name => /\.png$/i.test(name)).map(name => {
    const file = path.join(chartsDir, name), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !fs.realpathSync(file).startsWith(fs.realpathSync(chartsDir) + path.sep)) throw new Error('沙箱输出包含不安全的链接，已拒绝读取。');
    if (stat.size > 12 * 1024 * 1024) throw new Error('单张图表超过 12 MB，已拒绝读取。');
    return file;
  });
  return { stdout: result.stdout, charts, sandbox: { backend: BACKEND, appContainer: true, networkCapabilities: 0, capabilities: result.capabilities, processLimit: 1, memoryMb: result.memoryMb } };
}

module.exports = { BACKEND, getSandboxStatus, runSandbox, prepareRuntime, helperPath };
