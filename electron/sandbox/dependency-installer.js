// Trusted, project-scoped wheel acquisition. Model-generated code never runs here.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const https = require('node:https');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const JSZip = require('jszip');

const MAX_WHEEL_BYTES = 80 * 1024 * 1024;
const MAX_INSTALL_BYTES = 220 * 1024 * 1024;
const MAX_FILES = 12000;
const normalize = value => String(value).toLowerCase().replace(/[-_.]+/g, '-');

function validateRequirement(name, version) {
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,79}$/.test(String(name || ''))) throw new Error('依赖名称只能包含英文字母、数字、点、下划线和连字符。');
  if (version != null && version !== '' && !/^[0-9][A-Za-z0-9.!+_-]{0,39}$/.test(String(version))) throw new Error('版本号无效；不能传入 pip 参数、URL 或路径。');
  return { name: normalize(name), version: version ? String(version) : '' };
}

function projectDependencyRoot(userDataPath, projectId) {
  if (!userDataPath || !projectId) throw new Error('缺少项目标识，不能安装共享依赖。');
  const id = crypto.createHash('sha256').update(String(projectId)).digest('hex').slice(0, 32);
  return path.join(userDataPath, 'analysis-dependencies', id);
}

function currentDependencyDir(userDataPath, projectId) {
  const root = projectDependencyRoot(userDataPath, projectId);
  const pointer = path.join(root, 'current.json');
  if (!fs.existsSync(pointer)) return null;
  const { version } = JSON.parse(fs.readFileSync(pointer, 'utf8'));
  if (!/^[a-f0-9]{32}$/.test(version)) throw new Error('项目依赖索引损坏。');
  const dir = path.join(root, 'versions', version);
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) throw new Error('项目依赖文件不完整。');
  return dir;
}

function getJson(url, signal) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 20000, headers: { 'User-Agent': 'AI-Paper-Pet/0.1' } }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`PyPI 元数据请求失败：HTTP ${response.statusCode}`)); return; }
      let bytes = 0, chunks = [];
      response.on('data', chunk => { bytes += chunk.length; if (bytes > 3 * 1024 * 1024) req.destroy(new Error('PyPI 元数据超过限制')); else chunks.push(chunk); });
      response.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (error) { reject(error); } });
      response.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('PyPI 元数据请求超时')));
    req.on('error', reject);
    signal?.addEventListener('abort', () => req.destroy(new Error('安装已取消')), { once: true });
  });
}

function pipDownload(python, args, signal) {
  return new Promise((resolve, reject) => {
    const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
      PATH: path.dirname(python), TEMP: os.tmpdir(), TMP: os.tmpdir(),
      PYTHONNOUSERSITE: '1', PIP_CONFIG_FILE: 'NUL' };
    execFile(python, ['-I', '-m', 'pip', '--isolated', 'download', '--disable-pip-version-check', '--no-input', '--no-cache-dir',
      '--index-url', 'https://pypi.org/simple', '--only-binary=:all:', '--implementation', 'cp', '--python-version', '3.14',
      '--platform', 'win_amd64', '--abi', 'cp314', '--abi', 'abi3', '--abi', 'none', ...args],
    { env, windowsHide: true, timeout: 180000, maxBuffer: 1024 * 1024, signal }, (error, stdout, stderr) => {
      if (error) reject(new Error(`pip 下载失败：${String(stderr || stdout || error.message).slice(-1800)}`));
      else resolve(stdout);
    });
  });
}

function safeWheelPath(entry) {
  const parts = entry.split('/');
  if (!parts.length || parts.some(part => !part || part === '.' || part === '..' || part.includes(':') || part.includes('\\'))) throw new Error('wheel 含不安全的文件路径。');
  if (parts[0].endsWith('.data')) {
    if (!['purelib', 'platlib'].includes(parts[1])) return null;
    parts.splice(0, 2);
  }
  const relative = parts.join('/');
  if (!relative || relative.endsWith('.pth') || relative.endsWith('.exe') || relative.endsWith('.bat') || relative.endsWith('.cmd')) throw new Error('wheel 含不允许的启动文件。');
  return relative;
}

async function installAnalysisDependency({ name, version, userDataPath, projectId, python, signal }) {
  const requirement = validateRequirement(name, version);
  const executable = python?.executable;
  if (!executable || !fs.existsSync(path.join(path.dirname(executable), 'runtime-manifest.json'))) throw new Error('受控安装仅支持产品自带的 Python 3.14。');
  const base = JSON.parse(fs.readFileSync(path.join(path.dirname(executable), 'runtime-manifest.json'), 'utf8'));
  if (base.python !== '3.14.8' || !base.packages?.some(item => normalize(item.name) === 'pip')) throw new Error('产品自带 Python 尚未包含 pip，请更新运行时。');
  const root = projectDependencyRoot(userDataPath, projectId);
  const current = currentDependencyDir(userDataPath, projectId);
  const previous = current ? JSON.parse(fs.readFileSync(path.join(current, 'manifest.json'), 'utf8')).packages : [];
  const installed = [...base.packages, ...previous];
  const existing = installed.find(item => normalize(item.name) === requirement.name);
  if (existing) {
    if (!requirement.version || existing.version === requirement.version) return { status: 'already-installed', name: existing.name, version: existing.version, projectId };
    throw new Error(`${existing.name} 已固定为 ${existing.version}；当前运行时不允许覆盖已有包版本。`);
  }
  fs.mkdirSync(root, { recursive: true });
  const staging = fs.mkdtempSync(path.join(root, 'download-'));
  try {
    const wheelsDir = path.join(staging, 'wheels'), siteDir = path.join(staging, 'site-packages');
    fs.mkdirSync(wheelsDir); fs.mkdirSync(siteDir);
    if (current) fs.cpSync(path.join(current, 'site-packages'), siteDir, { recursive: true });
    const constraints = path.join(staging, 'constraints.txt');
    fs.writeFileSync(constraints, installed.map(item => `${item.name}==${item.version}`).join('\n') + '\n');
    await pipDownload(executable, ['--constraint', constraints, '--dest', wheelsDir, `${requirement.name}${requirement.version ? `==${requirement.version}` : ''}`], signal);
    const wheelNames = fs.readdirSync(wheelsDir).filter(item => item.endsWith('.whl'));
    if (!wheelNames.length || wheelNames.length > 30) throw new Error('pip 未返回有效数量的 wheel。');
    let totalBytes = 0, totalFiles = 0;
    const packages = [...previous];
    const existingVersions = new Map(installed.map(item => [normalize(item.name), item.version]));
    const previousNames = new Set(previous.map(item => normalize(item.name)));
    for (const wheel of wheelNames) {
      signal?.throwIfAborted();
      const [wheelName, wheelVersion] = wheel.split('-');
      if (!wheelName || !wheelVersion) throw new Error('wheel 文件名无效。');
      const normalized = normalize(wheelName);
      const source = path.join(wheelsDir, wheel), stat = fs.statSync(source);
      totalBytes += stat.size;
      if (stat.size > MAX_WHEEL_BYTES || totalBytes > MAX_INSTALL_BYTES) throw new Error('下载大小超过受控安装限制。');
      const metadata = await getJson(`https://pypi.org/pypi/${encodeURIComponent(wheelName)}/${encodeURIComponent(wheelVersion)}/json`, signal);
      const artifact = metadata.urls?.find(item => item.filename === wheel);
      const digest = crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
      if (!artifact || artifact.yanked || artifact.digests?.sha256 !== digest || new URL(artifact.url).hostname !== 'files.pythonhosted.org') throw new Error(`wheel 已撤回或 SHA256 校验失败：${wheel}`);
      if (existingVersions.has(normalized)) {
        if (existingVersions.get(normalized) !== wheelVersion) throw new Error(`pip 返回了已固定包的另一版本：${wheelName}`);
        continue;
      }
      const archive = await JSZip.loadAsync(fs.readFileSync(source));
      for (const [entryName, entry] of Object.entries(archive.files)) {
        if (entry.dir) continue;
        if (++totalFiles > MAX_FILES) throw new Error('依赖文件数量超过限制。');
        const relative = safeWheelPath(entryName);
        if (!relative) continue;
        const claimedSize = entry._data?.uncompressedSize;
        if (claimedSize != null && (!Number.isSafeInteger(claimedSize) || claimedSize > MAX_INSTALL_BYTES - totalBytes)) throw new Error('wheel 解压大小超过限制。');
        const unixMode = entry.unixPermissions;
        if (unixMode && (unixMode & 0o170000) === 0o120000) throw new Error('wheel 包含符号链接。');
        const destination = path.join(siteDir, ...relative.split('/'));
        if (fs.existsSync(destination)) throw new Error(`依赖与已有文件冲突：${relative}`);
        const data = await entry.async('nodebuffer');
        totalBytes += data.length;
        if (totalBytes > MAX_INSTALL_BYTES) throw new Error('解压大小超过受控安装限制。');
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, data, { flag: 'wx' });
      }
      packages.push({ name: wheelName, version: wheelVersion, wheel, sha256: digest });
    }
    if (!packages.some(item => normalize(item.name) === requirement.name)) throw new Error('pip 未下载所请求的依赖。');
    const id = crypto.randomBytes(16).toString('hex');
    const destination = path.join(root, 'versions', id);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify({ packages, createdAt: new Date().toISOString() }));
    fs.rmSync(wheelsDir, { recursive: true });
    fs.rmSync(constraints);
    fs.renameSync(staging, destination);
    const pointer = path.join(root, `current-${id}.tmp`);
    fs.writeFileSync(pointer, JSON.stringify({ version: id }));
    fs.renameSync(pointer, path.join(root, 'current.json'));
    const chosen = packages.find(item => normalize(item.name) === requirement.name);
    return { status: 'installed', name: chosen.name, version: chosen.version, dependencies: packages.filter(item => !previousNames.has(normalize(item.name))).map(item => `${item.name}==${item.version}`), projectId };
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
  }
}

module.exports = { validateRequirement, projectDependencyRoot, currentDependencyDir, installAnalysisDependency };
