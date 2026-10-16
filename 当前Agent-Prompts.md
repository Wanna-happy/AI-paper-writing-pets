# 当前 Agent 提示词索引

更新日期：2026-10-16。这里只维护运行源索引，不复制整份提示词，以免与代码分叉。整体实现见 [技术实现文档](docs/技术实现文档.md)。

| 场景 | 当前来源 |
| --- | --- |
| 首次任务创建项目 | electron/paper-writing-agent.js 的 createProjectBootstrapPrompt |
| 每轮理解与契约 | electron/agent/pipeline-prompts.js 的 UNDERSTANDING；electron/pi/intent.mjs |
| 动态任务依赖规划 | pipeline-prompts.js 的 PLANNING；electron/pi/planner.mjs |
| 采集、准备、方案角色 | pipeline-prompts.js 的 COLLECTOR、PREPARER、COORDINATOR |
| 对话、分析、写作角色 | electron/pi/registry.mjs 的 ROLE_DEFINITIONS |
| 角色与分支权限 | electron/agent/flow-policy.js、pipeline-policy.js、electron/pi/agent-tools.mjs |
| 执行输入和上游结果 | electron/pi/run-engine.mjs 的 buildUserMessage；agent/context-policy.js |
| 论文 HTML 与学术约束 | electron/paper-writing-agent.js、electron/writing-session.js |
| Python 生成与修复 | electron/tools/code-analysis.js |
| 选区改写和引用保护 | electron/agent/local-edit.js |
| 技能正文和方法指引 | assets/research-skills；electron/skills/external-runtime.js |
| 旧技能 ID 映射及产品接入契约 | electron/skills/research-adapter.js |
| 可执行方法目录 | assets/research-runtime/methods.json |

场景模型配置使用 settings.api.agents，场景为 planning、chat、analysis、writing；默认继承共用配置。角色不等于独立模型账号，多个角色可以使用同一场景配置。

产品接入契约要求每轮只做当前目标需要的部分。外部技能的完整流程、工具名称和私人路径不构成执行权限。先有真实文件及工具结果，再交给后续步骤；没有产物不能宣称完成。新分析或变更方案按现有批准机制执行，不要求用户反复输入继续。
