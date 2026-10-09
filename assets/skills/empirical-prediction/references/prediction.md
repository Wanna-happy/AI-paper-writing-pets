# 预测
sklearn Pipeline/ColumnTransformer将SimpleImputer、编码、缩放和模型封装；训练折内fit，验证/测试只transform。普通横截面按样本独立性分组/分层，时序TimeSeriesSplit或明确时间留出；跨实体泛化用GroupKFold且训练/测试无组重叠。单次随机拆分不适合所有面板任务。报告索引划分、seed、数据量、目标分布、搜索空间和训练折调参；测试集仅最终评估。
Dummy基线与Ridge/Logistic/RandomForest等按需求比较，分类报告混淆、precision/recall/F1和适用AUC/校准，回归MAE/RMSE/R2。n_jobs=1，树模型不需机械标准化。permutation_importance说明在哪个留出数据上计算与重复次数，不叫因果贡献。
# 时间序列
statsmodels ARIMA/SARIMAX、VAR/VECM：频率、趋势、季节、外生变量的未来可得性、ADF/KPSS、适用Johansen协整与rank说明；不能“ADF不显著就自动差分”忽略结构/检验功效。滞后和rank在训练窗口选择，输出实际估计样本与预测区间。Granger是条件预测关系，不直接因果。
# 生存
lifelines KaplanMeierFitter/CoxPHFitter：duration单位、event编码、左截断/删失、协变量时序，核对事件数和风险集。Cox报告HR及CI、比例风险诊断、收敛和事件量；PH不适合不能仅依赖C-index继续解释。重现估计步骤，不能把后续事件信息作为基线协变量。
来源：https://scikit-learn.org/stable/common_pitfalls.html
https://lifelines.readthedocs.io/en/latest/Survival%20Regression.html
