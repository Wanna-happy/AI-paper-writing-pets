# pi 编排运行时

更新日期：2026-10-16。完整说明见 [技术实现文档](../../docs/技术实现文档.md)。

- intent.mjs：把本轮自然语言、项目与历史转为意图和任务契约；内部格式修复不冒充用户需求缺口。
- planner.mjs：结合角色、技能和有效进度生成动态任务 DAG，不固定完整论文流程。
- registry.mjs：chat / collector / preparer / coordinator / analyst / writer 六类角色。
- model-layer.mjs：按 planning / chat / analysis / writing 场景选择模型与凭据，接入 pi-ai。
- agent-factory.mjs：构造 pi-agent-core Agent，传递中断信号并清理订阅。
- agent-tools.mjs：装配检索、历史、核查、准备、方案、分析、技能与采集等受限工具。
- run-engine.mjs：按依赖顺序执行、传递真实产物、复用有效完成项和处理中断存档。

主流程由 electron/agent/orchestrator.js 接入；agent/flow-policy.js 和 pipeline-policy.js 负责分支权限、契约覆盖及依赖约束；interaction-broker.js 绑定本轮的澄清和批准。存档继续使用现有 SQLite。

常用验证：npm run test:harness、npm run test:model-layer、npm run test:orchestrator，以及 intent-flow、pipeline-flow 和 empirical-flow 等测试。真实 API 验证入口 npm run diagnose:api 会使用已保存配置并产生模型用量，不能与离线模拟测试混淆。
