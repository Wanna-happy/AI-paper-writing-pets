// A registered execution path is not a certificate of statistical correctness.
const checks = {
  'data-prep':'报告输入/输出行数、缺失/转换/排除规则和变量字典；只写副本。',
  ols:'检查设计矩阵秩、共线性、标准误设定和残差；报告系数、区间和N。',
  'wls-gls':'明确权重/协方差来源、含义与模型假设；检查正权重，不猜权重。',
  'logit-probit':'检查结局编码、分离、收敛和事件数；区分系数、优势比与边际效应。',
  'multinomial-ordered':'明确类别顺序/参照组、收敛和适用假设；无序类别不能当有序。',
  'count-glm':'检查计数支持、暴露量、过度离散与零值；分清对数系数与发生率比。',
  quantile:'记录分位点和推断方法；条件分位数效应不是总体均值效应。',
  'mixed-effects':'明确层级、组数、随机结构、收敛与奇异拟合；披露组内相关和限制。',
  'panel-fe':'核对实体-时间唯一键、平衡性、组内变异、吸收变量与聚类标准误。',
  'panel-re':'说明随机效应与解释变量独立假设、组数和标准误，不按显著性选FE/RE。',
  'panel-first-difference':'按实体/时间排序并检查时间间隔，差分不得跨实体或时间缺口。',
  'iv-2sls':'报告工具定义、排除限制依据、第一阶段与弱工具诊断；检验不证明工具有效。',
  'iv-gmm':'说明矩条件、工具数、权重矩阵、稳健推断与识别限制。',
  'simple-did':'明确处理组/时点、对照、平行趋势依据与聚类标准误；错位处理不得改为简单TWFE。',
  its:'检查干预时点、水平/趋势变化、自相关、季节性与同时干预。',
  'synthetic-control':'报告供体池、处理前拟合、权重与置换诊断及适用边界。',
  'psm-ipw':'检查共同支持、极端得分/权重、加权后平衡、目标效应和未观测混杂限制。',
  'local-rdd':'明确运行变量、阈值、带宽、核函数，检查操纵与协变量连续性；限阈值附近解释。',
  descriptive:'每变量报告有效N、缺失、单位与筛选范围；不把缺失填零。',
  correlation:'说明Pearson/Spearman、缺失规则、实际N与多重比较；相关不是因果。',
  'group-tests':'核对配对/独立、组数、分布与方差条件；按确认方案报告效应量/区间，不按p值挑检验。',
  'reliability-efa':'确认题项计分、反向题、缺失、相关矩阵、因子数与旋转；EFA不代表CFA/SEM完成。',
  'time-series':'明确频率、缺口、平稳/季节设定、时间留出与残差诊断，禁止未来信息泄漏。',
  prediction:'按国家/实体/时间结构划分验证；插补、缩放和调参仅拟合训练折。报告真实折外指标与波动，保留指定LightGBM等算法。',
  'trajectory-clustering':'确认时间对齐、缩放、距离与相容原型；DTW不能换欧氏距离。报告K诊断与实际计算的稳定性。',
  survival:'核验事件/删失编码、随访和时间起点，按模型检查比例风险等假设及有效事件数。',
  diagnostics:'诊断围绕实际模型假设；失败如实披露，不反复改设定掩盖。',
  robustness:'只运行已授权设定，保留全部结果，包括不显著及方向改变。',
  heterogeneity:'说明分组/交互、组样本与多重比较；一组显著另一组不显著不证明组间差异。',
};
function capability(method) { return { ...method, executionStatus:method.status==='available'?'connected':'requires-extension',
  validationStatus:'not-certified', dependencyStatus:'check-at-execution',
  checks:checks[method.id]||'尚未接入执行指导，不擅自替换方法。' }; }
function methodGuidance(step={}) {
  step = step || {};
  let text=`# 当前方法检查卡\n方法：${step.methodId||'按确认步骤'}。${checks[step.methodId]||'检查输入、依赖、诊断与已确认方法的一致性。'}\n登记接入不代表环境就绪、数据适用或统计正确性认证。依赖缺失时用受控安装工具。diagnostics仅填写实际计算/核对记录；未做检查放入limitations，不能写成通过。只交付已确认输出，不为显著性更改方法。`;
  const request=JSON.stringify(step);
  if (/SHAP/i.test(request)) text+='\nSHAP：明确模型、背景样本、输出尺度和版本，特征列顺序一致；预测贡献不解释为因果。';
  if (/LOWESS/i.test(request)) text+='\nLOWESS：记录frac与真实数据，阈值仅为候选形态；未估计不确定性时如实说明，不作确定因果阈值。';
  return text;
}
module.exports={checks,capability,methodGuidance};
