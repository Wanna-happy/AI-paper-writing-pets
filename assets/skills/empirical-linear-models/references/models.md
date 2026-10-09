# 模型实施
## OLS/WLS/GLS
statsmodels.formula.api.ols(formula,data).fit(cov_type='HC3')可用于确认HC3的横截面模型；聚类用fit(cov_type='cluster',cov_kwds={'groups':实际估计样本分组})。先共同dropna所需变量以保证groups对齐。WLS权重来源需明确，不能当调查设计权重；GLS协方差结构须有依据。分类变量C()明确参照组，中文列名用patsy Q()或建立可逆列名映射；跨模型可比时使用同一共同样本并报告变化。
OLS报告残差诊断、N、df、R2/调整R2、协方差类型。二元处理变量保留可解释编码；缩放和变换记录实际口径。
## Logit/Probit/多项/有序
statsmodels.formula.api.logit/probit；二元Y必须0/1，类别含义由用户明确。报告收敛、完全分离/稀疏单元，OR只属于Logit log-odds，置信区间同时exp。get_margeff可按适用模型计算平均边际效应并清楚写明。MNLogit需记录类别/基准。statsmodels.miscmodels.ordinal_model.OrderedModel有序模型不能加截距或隐含常数，类别次序需已确认；平行斜率假设不能假装自动检验通过。
## 计数/GLM
smf.poisson、smf.negativebinomial或sm.GLM适当family，非负整数计数验证；offset/exposure按观测暴露量说明，不能把拟合成功当分布适合。过度离散诊断依据条件模型，简单全样本var/mean只作提示。零膨胀模型使用statsmodels.discrete.count_model，并说明两部分变量/机制与收敛。Gamma用于正值连续，链接函数解释需一致。
## 分位数
smf.quantreg(formula,data).fit(q=事先确认分位点)，输出各分位系数和区间。分位回归与OLS估计目标不同，不能把其“显著”当同一效应的稳健证明；群组依赖区间需对应方法，不能套普通独立样本区间。
## 多层
smf.mixedlm(formula,data,groups=...,re_formula=...)，明确随机截距/斜率及层级。报告收敛、随机效应方差、实际群组数，固定部分与随机部分分开。随机效应假设需解释，不以“数据有组”自动选该模型。
# 结果提取
statsmodels results.params/bse/pvalues/conf_int()对应同一拟合对象；不是所有模型均有rsquared或同一检验接口，使用hasattr与实际结果。表格：模型、变量、估计、SE、p、CI下/上、N、协方差。数组/Series转换JSON数值并把不可估计项明确标null与原因。
来源：https://www.statsmodels.org/stable/index.html
