# pi 编排运行时

更新日期：2026-10-08

- model-layer.mjs：基于 pi-ai，统一场景模型、Base URL、鉴权与模型消息。
- planner.mjs：模型根据角色与 Skill 目录生成任务 DAG，收到真实 Key 与中断信号。
- registry.mjs：analyst / writer 角色目录。
- agent-factory.mjs：基于 pi-agent-core 的 Agent 工厂，外部 signal 连接 agent.abort，并清理订阅。
- agent-tools.mjs：Python 分析工具与带稳定 E 编号的本地 RAG 工具。
- run-engine.mjs：依赖排序、上游产出传递、恢复输出复用和部分文本续写。

主流程由 electron/agent/orchestrator.js 接入，存档使用现有 SQLite。界面入口位于 src/feed.js。

回归测试：`npm run test:harness`、`npm run test:model-layer`、`npm run test:orchestrator`。真实 API 的合成任务验证：`npm run diagnose:api`。
