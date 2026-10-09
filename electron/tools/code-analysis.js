const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { runSandbox, getSandboxStatus } = require('../sandbox/windows-sandbox');
const { validateStep, parseResult, fingerprint } = require('../empirical-workflow');
const { createHash } = require('crypto');

/**
 * UC-ANA-01 · Agent 编写代码并本地执行
 * 区别于 v1 的固定脚本：本期由模型根据用户自然语言分析需求生成自包含的 Python 脚本，
 * 在系统级沙箱中本地执行（pandas / numpy / scipy / matplotlib，离线），收集文字摘要与图表。
 *
 * Windows LPAC + Job Object 强制隔离：独立身份、输入副本只读、运行时
 * 副本只读、禁止网络及子进程，限定内存；取消与超时终止任务。
 * 沙箱不可用或启动失败时拒绝执行，不回退到普通 Python 进程。
 */

const ANALYSIS_SYSTEM_PROMPT = `你是一名严谨的社会科学定量研究编程助手。用户会给出一段中文自然语言的数据分析需求，以及一个通过环境变量传入的数据文件绝对路径。

要求：
1. 只输出一个 Python 代码块（用 \`\`\`python 包裹），不要任何解释性文字、不要 markdown 之外的符号。
2. 代码必须自包含、可直接运行。内置环境支持 pandas、numpy、scipy、matplotlib、openpyxl、statsmodels、sklearn、linearmodels、lifelines；使用前核对方法与输入条件。全部离线，禁止网络及子进程，n_jobs=1。
3. 数据文件路径从环境变量读取：data_path = os.environ.get('DATA_FILE')；若为空，打印 “NO_DATA_FILE” 并 exit(0)，给出分析设计建议即可。
4. 图表保存目录：chart_dir = os.environ.get('CHART_DIR')；如需绘图，保存到该目录（文件名用英文字母与数字），并用 matplotlib 的 Agg 后端（plt.switch_backend('Agg') 或设置 MPLBACKEND=Agg），禁止 plt.show()。
5. 代码开头必须：import os；import matplotlib；matplotlib.use('Agg')；import pandas as pd；import numpy as np。
6. 用中文把关键结果打印到 stdout：描述统计、分组比较、相关/回归的核心数值、图表文件名与含义；数字保留 2-3 位小数；不要打印整张 DataFrame。
7. 若数据不适合已确认方法，输出not-applicable及原因；不换成其他模型或检验。不修改输入数据，不为了显著性筛选样本。
8. 严禁编造数据或结果；仅基于真实读取的数据计算。`;

function extractPythonCode(text) {
  if (!text) return '';
  const fence = String(text).match(/```(?:python|py)?\s*\n([\s\S]*?)```/i);
  if (fence && fence[1].trim()) return fence[1].trim();
  if (/^\s*(import\s|from\s|def\s|print\(|#!)/.test(String(text))) return String(text).trim();
  return '';
}

async function generateAnalysisCode({ requestModel, request, dataFileName, skillPrompt = '', analysisPlan, step }) {
  const messages = [
    { role: 'system', content: ANALYSIS_SYSTEM_PROMPT + skillPrompt },
    {
      role: 'user',
      content: `分析需求：${request || '对数据进行描述性统计与基础分析'}\n数据文件（运行时通过环境变量 DATA_FILE 提供绝对路径，请勿在代码里写死路径）：${dataFileName || '（未提供）'}\n${analysisPlan ? `已确认方案：${JSON.stringify({ researchQuestion: analysisPlan.researchQuestion, dataDescription: analysisPlan.dataDescription, objective: analysisPlan.objective, missingDataPolicy: analysisPlan.missingDataPolicy, interpretationLimits: analysisPlan.interpretationLimits })}\n只执行当前步骤：${JSON.stringify(step)}\n最后打印一行 PAPER_PET_RESULT= 加JSON：{schemaVersion:1,stepId:"${step.id}",methodId:"${step.methodId}",status:"completed"或"not-applicable",sampleSize:实际N,summary:结果概括,tables:[{title:表名,columns:[列名],rows:[[值]]}],diagnostics:[实际诊断],limitations:[限制],reason:不适用原因}。json.dumps(...,ensure_ascii=True,allow_nan=False)，缺失值转None。` : ''}\n\n请直接输出 Python 代码块。`,
    },
  ];
  try {
    const res = await requestModel({ scenario: 'analysis', messages, options: { temperature: 0.2, maxTokens: analysisPlan ? 6500 : 2400 } });
    const code = extractPythonCode(res?.content || '');
    return { code, raw: res?.content || '', error: code ? null : '模型未返回可执行的 Python 代码块。' };
  } catch (error) {
    return { code: '', raw: '', error: error.message };
  }
}

async function executeAnalysisCode({ code, dataFilePath, outputDir, python, timeoutMs = 60000, signal }) {
  signal?.throwIfAborted();
  fs.mkdirSync(outputDir, { recursive: true });
  const scriptPath = path.join(outputDir, 'analysis_script.py');
  fs.writeFileSync(scriptPath, code, 'utf8');

  try {
    const result = await runSandbox({ python, scriptPath, dataFilePath, outputDir, timeoutMs, signal });
    return { ...result, stdout: String(result.stdout || '').trim(), error: null };
  } catch (error) {
    if (signal?.aborted) throw new DOMException('分析已挂起', 'AbortError');
    const message = error?.killed ? `分析超时（超过 ${Math.round(timeoutMs / 1000)} 秒被终止）。请简化需求或减小数据量。` : (error.message || '分析执行失败。');
    return { stdout: String(error.stdout || '').trim(), charts: [], error: message };
  }
}

async function runDataAnalysis({
  plan, request, attachments, requestModel, findPython, executeProcess,
  resolveAttachment, loadSettings, userDataPath, projectId, signal,
  analysisPlan = null, stepId = '', skillPrompt = '', priorResults = [],
}) {
  const step = analysisPlan ? validateStep(analysisPlan, stepId, plan?.dataFile, resolveAttachment) : null;
  const candidates = (attachments || []).filter(item => ['.csv', '.xlsx'].includes(String(item.extension || '').toLowerCase()));
  const dataFile = plan?.dataFile ? String(plan.dataFile) : candidates.length === 1 ? candidates[0].name : '';
  let source = null;
  if (dataFile) {
    const attachment = (attachments || []).find((item) => item.name === dataFile);
    source = attachment ? resolveAttachment(attachment) : null;
  }
  if (!source) return { error: '未找到可读取的数据文件。请添加 CSV/XLSX 工作文件；有多个文件时请指定分析哪一个。', summary: '', columns: [], files: [], code: '' };
  const sandboxStatus = getSandboxStatus();
  if (!sandboxStatus.available) return { error: `${sandboxStatus.error} 为保护本机数据，已拒绝执行分析代码。`, summary: '', columns: [], files: [], code: '' };
  const analysisRequest = plan?.request || request || '对数据进行描述性统计与基础分析';
  const python = await findPython(loadSettings());
  const outputDir = path.join(userDataPath, 'analysis-runs', String(projectId || 'default'), randomUUID());
  const generated = await generateAnalysisCode({ requestModel, request: analysisRequest + (priorResults.length ? `\n已完成步骤的真实结果（仅作基准，涉及替代设定时重新在同一输入数据上拟合）：${JSON.stringify(priorResults)}` : ''), dataFileName: dataFile || null, skillPrompt, analysisPlan, step });
  if (!generated.code) {
    return { error: generated.error || '模型未生成代码。', code: generated.raw, summary: '', columns: [], files: [] };
  }
  signal?.throwIfAborted();
  if (analysisPlan) validateStep(analysisPlan, stepId, dataFile, resolveAttachment);
  const exec = await executeAnalysisCode({ code: generated.code, dataFilePath: source, outputDir, python, executeProcess, timeoutMs: analysisPlan ? 120000 : 60000, signal });
  const summary = exec.error
    ? `分析执行出错：\n${exec.error}\n${exec.stdout || ''}`
    : (exec.stdout || '(模型未输出文字摘要，请参考生成的图表文件)');
  let structured = null;
  if (analysisPlan && !exec.error) {
    try {
      if (fingerprint(source) !== analysisPlan.dataFingerprint) throw new Error('分析期间数据已变化，请重新确认方案');
      structured = parseResult(exec.stdout, { plan: analysisPlan, step, sourceFingerprint: fingerprint(source) });
      structured.files = exec.charts;
      structured.code = generated.code;
      structured.codeSha256 = createHash('sha256').update(generated.code).digest('hex');
      structured.sandbox = exec.sandbox;
      fs.writeFileSync(path.join(outputDir, 'analysis-result.json'), JSON.stringify(structured, null, 2), 'utf8');
    } catch (error) { exec.error = error.message; }
  }
  return {
    summary: structured?.summary || summary,
    columns: [],
    files: exec.charts,
    code: generated.code,
    error: exec.error || null,
    sandbox: exec.sandbox || null,
    table: null,
    tables: structured?.tables || [],
    structured,
  };
}

async function inspectDataFile({ attachment, resolveAttachment, findPython, loadSettings, userDataPath, projectId, signal }) {
  const source = resolveAttachment(attachment);
  if (!source || !['.csv', '.xlsx'].includes(String(attachment.extension).toLowerCase())) throw new Error('请选择当前对话的CSV/XLSX数据文件');
  const code = `import os,json,pandas as pd\np=os.environ['DATA_FILE']\ndf=pd.read_excel(p) if p.endswith('.xlsx') else pd.read_csv(p)\nprint(json.dumps({'file':${JSON.stringify(attachment.name)},'rows':len(df),'columns':[{'name':str(c),'dtype':str(df[c].dtype),'missing':int(df[c].isna().sum()),'distinct':int(df[c].nunique(dropna=True))} for c in df.columns]},ensure_ascii=True))\n`;
  const outputDir = path.join(userDataPath, 'analysis-runs', projectId, randomUUID());
  const result = await executeAnalysisCode({ code, dataFilePath: source, outputDir, python: await findPython(loadSettings()), signal });
  if (result.error) throw new Error(result.error);
  return JSON.parse(result.stdout.split(/\r?\n/).at(-1));
}

module.exports = { ANALYSIS_SYSTEM_PROMPT, extractPythonCode, generateAnalysisCode, executeAnalysisCode, runDataAnalysis, inspectDataFile };
