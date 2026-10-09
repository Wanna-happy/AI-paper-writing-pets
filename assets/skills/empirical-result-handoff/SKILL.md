---
name: empirical-result-handoff
description: 统一计量输出、图表来源、代码与诊断记录，并指导写作 Agent 基于真实结果和项目资料组织正文。
---

# 分析Agent交付
每次执行输出一行 PAPER_PET_RESULT= 后接合法JSON（ensure_ascii=True, allow_nan=False）。schemaVersion=1；stepId/methodId必须等于本次已确认步骤；status为completed或not-applicable；sampleSize为本次实际估计样本数；summary为结果概括；tables为[{title,columns:[列名],rows:[[单元格]]}]；diagnostics为诊断列表；limitations为限制列表。not-applicable需reason。空值用null，不使用NaN/Infinity。
结果表不是打印整个原始数据，应包含描述统计、模型估计、测试或比较的真实汇总数值。模型表保留充分精度，展示时再格式化。图表保存到CHART_DIR，使用Agg、PNG、清晰标签和区间；不能把示例数据当用户结果。产品会附加项目/对话/方案版本、数据hash、代码hash、PNG路径、环境和时间。
# 写作Agent使用
优先使用上游结构化结果，而非分析Agent自由复述。严格对应方法、样本、数值、方向、区间和诊断状态；必须报告不显著、失败或不适用步骤，不能补出缺失结果。先研究设计与数据，再描述统计、主模型、诊断/稳健性、异质性与小结，按用户章节需求调整。没有实际结果只能写方法或待补模板，不能写发现。
将每张结果表转成语义化HTML table（caption、thead、tbody），对其做正文解释，不把原始JSON或脚本塞入论文。图表和表格来源写“本项目数据计算”并附步骤标识；文献依据用当前项目RAG的[E编号]，不得将RAG文献结果冒充本次估计。关联与预测结果不得升级为因果结论。
