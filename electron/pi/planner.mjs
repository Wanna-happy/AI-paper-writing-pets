// planner.mjs — 意图识别 + 任务 DAG 生成（harness 的 [L2] 第一环）
//
// 核心：纯 LLM 驱动，零关键词正则。模型依据"角色目录 + 技能目录"自行判断：
//   - 用户到底要"分析"还是"写作"，或两者都要（多意图）；
//   - 谁先谁后（依赖关系），例如先分析出结论、再据此写章节；
//   - 写作任务该配哪些 skill。
// 下方的 few-shot 只是引导形态，不是触发条件——模型应基于语义灵活判断，不被例子关键词束缚。
//
// 这层替换了原 orchestrator.js 里那段正则硬触发（/(?:数据分析|回归|相关|...)/），
// 也是你最初质疑"为什么识别不出双意图"的根本解法。

import { requestModel } from './model-layer.mjs';

// 构造编排器系统提示词：把可选角色与技能摊开给模型看。
function buildSystemPrompt(registry) {
  const rolesText = registry.roleList
    .map((r) => `- ${r.id}（${r.name}）：${r.description}\n  可用工具：${r.tools.join('、') || '无'}`)
    .join('\n');
  const skillsText = registry.skills.length
    ? registry.skills.map((s) => `- ${s.id}：${s.name} — ${s.description}`).join('\n')
    : '（暂无额外技能，可写空数组 []）';

  return `你是论文写作产品的"任务编排器"。你的职责是把用户的自然语言请求，拆成一串**可由不同 Agent 角色协作完成的子任务**，并标明依赖关系。

可用 Agent 角色（role 字段只能从下面挑，不要自创）：
${rolesText}

可用技能（skills 字段，按角色职责和相关性挑 id；对话澄清与分析执行也可以使用）：
${skillsText}

输出要求：
1. 只输出一个 JSON 对象，不要解释、不要 markdown 代码块包裹。
2. JSON 结构：
{
  "tasks": [
    {
      "id": "t1",
      "role": "chat、analyst 或 writer（必须来自上面的角色 id）",
      "task": "用一句话写清这个子任务要做什么（要具体、可执行）",
      "skills": ["技能id", "..."],
      "dependsOn": ["上游任务 id（本任务需要等它先完成；无则写 []）"]
    }
  ]
}
3. 依赖规则：若某任务必须"先有另一个任务的产出才能做"（例如先分析数据出结论、再据此写章节），就把 dependsOn 指向它。同角色也可有多个任务。
4. 若请求只涉及一个角色，就只产出一个该角色任务，dependsOn 为 []。
5. role 必须精确等于上面给出的 id。
6. 先判断交付物：基本问答、工作回顾、进度查询、解释、需求确认与澄清使用chat，普通问答skills=[]，实证方案澄清选择empirical-analysis-plan；只有明确请求论文正文/正式文档时才使用writer。历史里在写论文不代表本轮所有话都是续写指令。用户说“告诉我你之前干了什么”“这些内容已经确定过了”时只安排chat，不新建写作任务。
7. 要求实际计算/检验/建模才安排analyst；询问方法含义交给chat。实证分析在未确认具体方案时仍交给chat，选择empirical-analysis-plan，检查字段并提交方案。意图不明确时交给chat询问必要问题，不默认生成正文。
8. 任何实证分析先确认步骤、变量、标准误、检验和图表；实际执行由产品根据用户确认的方案安排。分析完成先展示结果，不自动安排writer。用户提出结果修改先交chat确认新方案；实证正文写作需chat提交标题/章节/篇幅方案并经用户确认。基本问答与工作回顾不调用方案工具。

下面几个**示意**例子只说明输出形态（不要被例子的具体字眼限制，要根据真实请求语义判断）：
示例A（请求同时要求"分析数据"与"写某一章"）：
{"tasks":[{"id":"t1","role":"chat","task":"澄清数据、变量、方法与分析步骤，提交具体分析方案供用户确认；分析后再确认写作范围","skills":["empirical-analysis-plan"],"dependsOn":[]}]}
示例B（请求只要求写一段文字）：
{"tasks":[{"id":"t1","role":"writer","task":"撰写文献综述这一节","skills":["academic-writing-core","literature-review"],"dependsOn":[]}]}
示例C（请求只要求对数据做检验）：
{"tasks":[{"id":"t1","role":"chat","task":"检查问卷字段与量表设计，提交信度及适用的效度分析方案供确认","skills":["empirical-analysis-plan"],"dependsOn":[]}]}
示例D（先分析再写讨论）：
{"tasks":[{"id":"t1","role":"chat","task":"确认实验设计和分析步骤，提交分析方案；结果审阅后再提交讨论部分的标题与范围方案","skills":["empirical-analysis-plan"],"dependsOn":[]}]}
示例E（告诉我你之前干了什么）：
{"tasks":[{"id":"t1","role":"chat","task":"根据本对话历史回顾已完成工作、未达标项和下一步，不生成论文正文","skills":[],"dependsOn":[]}]}`;
}

// 从模型输出里抠出 JSON（容忍 ```json 包裹或前后有文字）。
function parsePlan(text) {
  if (!text) return null;
  const fenced = String(text).match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : String(text);
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end < 0) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

// 清洗 / 校验模型产出的 DAG：去无效项、未知角色降级为 writer、过滤悬空依赖。
function normalizePlan(parsed, registry) {
  if (!parsed || !Array.isArray(parsed.tasks) || parsed.tasks.length === 0 || parsed.tasks.length > 16) return null;
  const validIds = new Set();
  const tasks = [];
  for (const raw of parsed.tasks) {
    if (!raw || typeof raw.task !== 'string' || !raw.task.trim()) continue;
    let role = String(raw.role || '').trim();
    if (!registry.roles[role]) role = registry.roles.chat ? 'chat' : 'writer';
    const id = String(raw.id || `t${tasks.length + 1}`).trim() || `t${tasks.length + 1}`;
    if (validIds.has(id)) return null;
    const dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn.map(String) : [];
    const knownSkills = new Set(registry.skills.map(skill => skill.id));
    const skills = Array.isArray(raw.skills) ? [...new Set(raw.skills.map(String))].filter(id => knownSkills.has(id) && (role !== 'chat' || id === 'empirical-analysis-plan')).slice(0, 4) : [];
    tasks.push({ id, role, task: raw.task.trim(), skills, dependsOn });
    validIds.add(id);
  }
  if (tasks.length === 0) return null;
  for (const t of tasks) {
    if (t.dependsOn.some(d => !validIds.has(d) || d === t.id)) return null;
  }
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    if (!byId.get(id).dependsOn.every(visit)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  }
  if (!tasks.every(task => visit(task.id))) return null;
  return { tasks };
}

export async function planTasks({ layer, registry, userPrompt, attachments = [], projectContext = '', apiKey = '', signal = null }) {
  const attachmentInfo = attachments.length
    ? `\n用户本次附带的文件：${attachments.map((a) => a.name || a.fileName || '未命名文件').join('、')}`
    : '\n用户本次没有附带文件。';
  const ctx = projectContext ? `\n论文项目背景：${projectContext}` : '';
  const userMessage = `用户请求：\n${userPrompt}\n${attachmentInfo}${ctx}\n\n请输出任务 DAG 的 JSON。`;

  let parsed = null;
  let raw = '';
  try {
    const res = await requestModel(layer, {
      scenario: 'planning',
      messages: [
        { role: 'system', content: buildSystemPrompt(registry) },
        { role: 'user', content: userMessage },
      ],
      options: { temperature: 0.2, maxTokens: 1200 },
      apiKey,
      signal,
    });
    raw = res?.content || '';
    parsed = normalizePlan(parsePlan(raw), registry);
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error;
    parsed = null;
  }

  if (!parsed) {
    // 兜底：把整个请求当成一次写作任务，保证用户意图不丢。
    return { tasks: [{ id: 't1', role: registry.roles.chat ? 'chat' : 'writer', task: userPrompt, skills: [], dependsOn: [] }], raw, fallback: true };
  }
  return { tasks: parsed.tasks, raw, fallback: false };
}
