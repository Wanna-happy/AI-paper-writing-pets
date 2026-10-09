---
name: empirical-causal-designs
description: 根据已确认识别设计执行基础DID、ITS、合成控制、PSM/IPW或局部线性RDD，输出假设诊断与限制。
---

# 开始前
读取 [设计对应的执行规则](references/designs.md)。处理/对照、政策时点、阈值、目标效应、比较群体和处理前协变量须已确认。模型名称不能替代识别假设。
不能把任意面板送入DID。错位实施与异质效应需要专门估计器；当前 simple-did 仅支持共同处理时点的明确比较设计，不自动套TWFE。ITT/ATT/ATE需清楚说明。
PSM/IPW要检查共同支持、平衡和极端权重，控制项不能包含处理后的变量；匹配不解决未观测混杂。RDD要核对running variable与cutoff、局部带宽、两侧样本、连续性及操纵风险；当前local-rdd的常规局部线性区间不是偏差校正区间，不冒充完整rdrobust。
稳健性按已确认替代设定执行，记录全部结果；失败或识别不足输出not-applicable和原因，不偷偷切换模型。
