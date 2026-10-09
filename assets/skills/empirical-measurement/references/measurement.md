# 描述/关联/比较
报告样本流程、缺失率、单位、连续变量N/均值/SD/分位点/范围、分类变量频数/比例。百分比明确分母，ID/地区编码不是连续指标。不把读入缺失占位数当有效观测。
Pearson、Spearman按估计目标与数据尺度选择，报告有效配对N和区间/多重比较处理；相关矩阵不是因果方向。每对删失导致N不同应报告，不能只画颜色。
scipy.stats.ttest_ind(equal_var=False)可作独立均值比较；ttest_rel用于配对且匹配ID；重复/层级数据不能默认独立。Mann-Whitney一般检验分布差异，不无条件称为中位数检验；列联表chi2_contingency核对期望频数，适用Fisher仅2x2等受支持场景。报告效应量和区间，而非只星号。
# 信度/EFA
根据已确认题项与反向规则计分。Alpha=k/(k-1)*(1-sum(item variances)/total variance)，使用共同有效样本，区分raw与standardized，零方差或不足题项不可估计。删除题项需要理论依据不能为了升alpha自动删。
EFA可用sklearn.decomposition.FactorAnalysis进行确认的因子数估计，报告预处理、载荷、因子方差/适用拟合和旋转方案；PCA不是EFA，不能替代CFA。序数Likert采用连续近似要注明，特殊多分相关估计需要扩展。KMO/Bartlett只有确实计算才报告；不把阈值通过叫“效度通过”。
