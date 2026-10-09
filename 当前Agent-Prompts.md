# 当前 Agent Prompts

更新日期：2026-10-08。为避免文档复制与运行代码再次分叉，这里保留实际来源索引。

| 场景 | 当前来源 |
| --- | --- |
| 首次任务创建项目 | electron/paper-writing-agent.js → createProjectBootstrapPrompt |
| 规划任务依赖图 | electron/pi/planner.mjs → buildSystemPrompt |
| 分析／写作角色与工具范围 | electron/pi/registry.mjs → ROLE_DEFINITIONS |
| 论文 HTML 与学术约束 | electron/paper-writing-agent.js → createPaperWritingAgentPrompt |
| 按需写作 Skill | assets/skills/*/SKILL.md，经 electron/skills/skill-runtime.js 装配 |
| 执行输入、上游结果与续写说明 | electron/pi/run-engine.mjs → buildUserMessage |
| Python 代码生成 | electron/tools/code-analysis.js → ANALYSIS_SYSTEM_PROMPT |
| 选区改写及引用保护 | electron/agent/local-edit.js |

规划、分析、写作共享已保存密钥，模型按 settings.api.scenarios 选择。旧固定 Plan Schema 的路由 Prompt 已移除。
