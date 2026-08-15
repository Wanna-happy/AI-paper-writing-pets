const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

const TOOL_VERSION = 1;

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function fileFingerprint(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function runProcess(executable, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(executable, args, { ...options, windowsHide: true, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr?.trim() || error.message));
      else resolve(stdout);
    });
  });
}

async function findPythonExecutable(settings = {}) {
  const configured = String(settings.dataEnvironment?.pythonPath || process.env.PAPER_PET_PYTHON || '').trim();
  const candidates = configured ? [[configured, ['--version']]] : [['python', ['--version']], ['py', ['-3', '--version']]];
  for (const [executable, args] of candidates) {
    try {
      await runProcess(executable, args);
      return executable === 'py' ? { executable, prefix: ['-3'] } : { executable, prefix: [] };
    } catch {}
  }
  throw new Error('未检测到可用 Python。请在“设置 → 数据分析环境”填写 Python 3.10+ 路径。');
}

class ToolRegistry {
  constructor({
    userDataPath,
    scriptPath,
    resolveAttachment,
    loadSettings,
    saveToolRun = () => {},
    findPython = findPythonExecutable,
    executeProcess = runProcess,
  }) {
    this.userDataPath = userDataPath;
    this.scriptPath = scriptPath;
    this.resolveAttachment = resolveAttachment;
    this.loadSettings = loadSettings;
    this.saveToolRun = saveToolRun;
    this.findPython = findPython;
    this.executeProcess = executeProcess;
    this.tools = new Map();
    this.registerBuiltIns();
  }

  register(definition) {
    if (!definition?.name || typeof definition.buildConfig !== 'function') throw new Error('工具定义无效');
    this.tools.set(definition.name, definition);
  }

  registerBuiltIns() {
    this.register({
      name: 'data_analysis',
      buildConfig: (plan, attachments) => {
        const attachment = attachments.find((item) => item.name === plan.dataFile && ['.csv', '.xlsx'].includes(String(item.extension || '').toLowerCase()));
        const source = this.resolveAttachment(attachment);
        if (!source) throw new Error('数据工具未找到指定 CSV/XLSX 文件');
        return { tool: 'data_analysis', source, sourceFingerprint: fileFingerprint(source), chartType: plan.chartType || 'auto', x: plan.x || '', y: plan.y || '', title: plan.title || '' };
      },
    });
    this.register({
      name: 'mechanism_diagram',
      buildConfig: (plan) => ({ tool: 'mechanism_diagram', title: plan.title || '研究机制图', nodes: plan.nodes || [], edges: plan.edges || [] }),
    });
  }

  async execute({ agentRunId, projectId, plan, attachments = [] }) {
    if (!plan?.name) return null;
    const definition = this.tools.get(plan.name);
    if (!definition) return { error: 'Agent 请求了未授权的工具。' };
    const config = definition.buildConfig(plan, attachments);
    const cacheKey = crypto.createHash('sha256').update(stableJson({ version: TOOL_VERSION, name: plan.name, config })).digest('hex');
    const outputDir = path.join(this.userDataPath, 'tool-cache', projectId, cacheKey);
    const resultPath = path.join(outputDir, 'result.json');
    const startedAt = new Date().toISOString();
    if (fs.existsSync(resultPath)) {
      try {
        const cached = JSON.parse(fs.readFileSync(resultPath, 'utf8'));
        if ((cached.files || []).every((file) => fs.existsSync(file))) {
          this.saveToolRun({ id: crypto.randomUUID(), agentRunId, cacheKey, toolName: plan.name, status: 'cache-hit', createdAt: startedAt, result: cached });
          return { ...cached, cacheHit: true };
        }
      } catch {}
    }
    fs.mkdirSync(outputDir, { recursive: true });
    const configPath = path.join(outputDir, 'tool-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config), 'utf8');
    try {
      const python = await this.findPython(this.loadSettings());
      const stdout = await this.executeProcess(python.executable, [...python.prefix, this.scriptPath, '--config', configPath, '--output-dir', outputDir]);
      const result = JSON.parse(stdout.trim());
      if (result.error) throw new Error(result.error);
      result.files = (result.files || []).map((file) => path.resolve(file));
      fs.writeFileSync(resultPath, JSON.stringify(result), 'utf8');
      this.saveToolRun({ id: crypto.randomUUID(), agentRunId, cacheKey, toolName: plan.name, status: 'completed', createdAt: startedAt, result });
      return { ...result, cacheHit: false };
    } catch (error) {
      this.saveToolRun({ id: crypto.randomUUID(), agentRunId, cacheKey, toolName: plan.name, status: 'failed', createdAt: startedAt, error: error.message });
      return { error: error.message };
    }
  }
}

module.exports = { TOOL_VERSION, ToolRegistry, findPythonExecutable, runProcess, stableJson };
