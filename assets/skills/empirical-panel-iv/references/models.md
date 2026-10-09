# 静态面板
linearmodels.panel.PanelOLS/RandomEffects/FirstDifferenceOLS。df.set_index([entity,time])前验证重复、时间类型、排序、每实体期数；不能把重复观察压成平均值。PanelOLS.from_formula('y ~ 1 + x + controls + EntityEffects + TimeEffects',data).fit(cov_type='clustered',cluster_entity=True)仅在已确认双向FE和实体聚类时使用；时间聚类或双向聚类根据误差相关结构选，报告实际实体/时间群组数。组内常数被吸收说明原因，不能为估计它偷偷取消FE。
RE要求效应与解释项的相关假设；比较FE/RE先说明设计和变量可识别性，不把机械Hausman作为唯一选择依据。不存在直接可用的“通用Hausman”接口，不发明API；适用比较需共同样本和正确协方差差矩阵，病态矩阵报告限制。
# 工具变量
linearmodels.iv.IV2SLS.from_formula('y ~ 1 + exog + [endog ~ instrument]',df).fit(cov_type='robust')；IVGMM.from_formula用于静态IV-GMM，与Arellano-Bond动态面板不同。每个内生项与排除工具明确，first_stage.diagnostics、wu_hausman()/durbin()以及适用过度识别统计均从对象提取；IV2SLS与IVGMM的检验属性不完全相同，不能强取。第一阶段F不能不顾稳健/聚类和多内生项结构机械用10判定可靠。确认聚类时clusters需估计样本对齐。
共同报告OLS基准与IV目标参数含义；工具相关性无法证明排除限制。找不到工具来源或识别依据时not-applicable。
来源：https://bashtage.github.io/linearmodels/panel/examples/examples.html
https://bashtage.github.io/linearmodels/iv/examples/advanced-examples.html
