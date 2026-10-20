// First-party adaptation. Upstream research instructions remain unchanged.
const PREFIX = 'paper-pet::';
const BASE = '只处理本轮已授权范围，复用已确认材料和结果，不强制整篇流程。遵循项目学科、语言、引用与排版；用户本轮明确要求优先。缺少证据时标记待补，不虚构来源、数据、访谈或结论。只用真实提供的工具。';
const definitions = [
  ['abstract', '摘要与学术翻译', /摘要|关键词|abstract|翻译|translate/i, ['writer','chat'], '从已有正文提取目的、方法、真实结果、结论和关键词。未执行研究不得写成已有结果。翻译保留术语、数字、方向、引用和原意；不执行开题流程，不套用AER的100词限制，篇幅依用户要求。', '输入：当前正文、已确认篇幅与语言。检查：摘要与正文逐项一致，无新增发现。'],
  ['introduction', '研究背景与绪论', /研究背景|引言|绪论|introduction/i, ['writer','chat'], '交代研究背景、具体问题、已有研究与缺口、研究目标及论文安排。根据学科选证据，不把经济学五段式或无Introduction标题作为通用规定；不预告尚未得到的实证结论。', '输入：研究问题与可核验文献。输出：用户要求的绪论范围，而非完整论文。'],
  ['discussion', '讨论与研究边界', /讨论|研究局限|discussion|limitations/i, ['writer','chat'], '区分实际发现、解释、与文献的关系及适用边界。讨论相反证据和研究限制；预测、相关不得升级为因果。没有结果时只提供讨论框架并说明缺口。', '输入：真实结果及采用的文献。检查：每一发现可回指结果，不以建议替代研究结论。'],
  ['conclusion', '结论与全篇一致性', /结论|总结全文|全篇|章节一致|conclusion/i, ['writer','chat'], '围绕原研究问题总结已得到的结论、贡献、局限及后续方向；不新增方法或结果。核对术语、研究对象、样本、变量、论证和章节间重复。', '输入：已有全文或相关章节。检查：结论回应问题，摘要、结果和结论数字一致。'],
  ['design', '跨学科选题与研究设计', /选题|开题|研究设计|研究方法|理论框架|理论基础|假设推导|proposal|research design/i, ['coordinator','writer','chat'], '先识别学科、研究问题、材料和设计类型，区分文本研究、案例、问卷、实验、预测和因果识别。只询问会改变本轮方案的必要缺口。理论框架可以是解释框架，不强制量化假设；预期结果是待检验设想而非事实。', '输出：本轮设计、所需材料、方法前提和边界；执行方法以get_research_capabilities为准。'],
  ['evidence', '资料理解、综述与引用核验', /文献|引用|DOI|参考书目|证据|资料阅读|上传资料|literature|citation|bibliograph/i, ['collector','writer','chat','coordinator'], '区分文献、原始数据、已有正文、格式要求；记录文件与页码/段落。综述按问题综合比较，不逐篇堆摘要。需要联网元数据时由有权限的lookup_scholarly_metadata查询；元数据存在不证明全文支持论断。未读全文、解析不完整、不可访问或匹配不确定必须标记。引用保留来源ID与位置，不把对话记录当学术证据。', '产物：文献/论断/证据位置/核验状态台账；文内引用与文后书目一一对应。'],
  ['preparation', '数据审计与变量构造', /数据清洗|数据准备|缺失|变量构造|合并数据|数据字典|清理数据|反向题|data prep|cleaning/i, ['preparer','analyst','coordinator','chat'], '先检查字段、类型、单位、唯一键、编码与缺失。明确筛选、重复、转换、异常值和合并规则，输出变更前后行数、排除原因和变量字典。重要未知编码先确认；不默认12是缺失、不静默删样本、不为显著性选规则。只写副本并保留数据指纹。', '产物：副本、审计、单位和样本流失说明。插补/反向计分等只执行已明确授权规则。'],
  ['prediction', '预测、轨迹聚类与模型解释', /预测|聚类|DTW|LightGBM|SHAP|LOWESS|交叉验证|数据泄漏|prediction|clustering/i, ['analyst','coordinator','chat'], '遵守指定算法、距离、种子与输出。分组/时间结构决定训练验证划分；缩放、插补和特征选择仅拟合训练折。DTW距离不得改成欧氏距离；K-Means必须使用与指定距离相容的原型/实现。报告真实折外性能及波动、聚类诊断与稳定性。TreeSHAP说明模型、背景样本、输出尺度；LOWESS报告参数，候选阈值仅为形态描述，给出不确定性或明确尚未估计。预测贡献不是因果效应。', '检查：数据泄漏、重复距离计算、训练/测试混用、SHAP变量与输出尺度、阈值被写成确定因果。'],
  ['results', '结果到表图与实证正文', /结果解释|实证正文|回归解释|分析报告|研究结果|结果写作|result handoff/i, ['writer','analyst','chat'], '正文中的样本量、系数、方向、置信区间、指标及表图须对应实际stepId、methodId和数据版本；长结果用read_analysis_result分页。不完整步骤说明未完成，不写成零效应。保留非显著结果；区分描述、预测、关联和因果。图表以实际保存文件为准。', '输出：结论→结果ID→表图的对应关系；检查摘要、表格、正文是否矛盾，不替换或重跑未授权方法。'],
  ['qualitative', '访谈、案例与扎根理论', /访谈|主题分析|定性编码|扎根理论|案例研究|qualitative|grounded theory|thematic/i, ['collector','analyst','coordinator','writer','chat'], '按已选择方法建立编码本、片段定位、主题与证据链。对访谈材料匿名化，区分原话、研究者解释和模型建议；没有逐字稿不得造受访者或引语。主题分析不自动等同扎根理论；案例需解释选择依据与反例。结论与饱和度须有证据，保留人工复核环节。', '产物：匿名片段ID、编码本、主题/案例证据矩阵、反例与待复核项。不调用量化回归来代替定性分析。'],
  ['questionnaire', '问卷与测量设计', /问卷|量表|信效度|反向计分|SEM|CFA|EFA|questionnaire|psychometric/i, ['coordinator','analyst','writer','chat'], '从构念、维度、适用人群、既有量表来源和计分规则设计；检查双重提问、诱导、反向题与预测试。不伪称新题项已验证；信度、EFA、CFA/SEM分别报告条件和能力。复杂抽样加权不是题项设计。SEM/CFA执行尚未接入时不得用EFA替代。', '产物：构念→题项→来源→计分表、预测试方案；需要计算时先检查方法能力并确认方案。'],
  ['review', '系统综述与Meta分析', /系统综述|PRISMA|Meta.?分析|荟萃|效应量合并|合并效应量|systematic review|meta-analysis/i, ['collector','coordinator','analyst','writer','chat'], '预先明确检索式、数据库、日期、去重、纳排标准、筛选台账与全文排除原因，记录人工复核和偏倚评价。PRISMA是报告规范，不等同实际检索或统计合并。Meta需独立效应量/方差、依赖性、模型、异质性和敏感性方案；未接通计算不得声称已合并，不能因“异质性”调用普通回归稳健性代替Meta。', '产物：真实检索和筛选记录、证据提取表、报告缺项；统计合并执行能力单独检查。'],
  ['editing', '保真修改、压缩与交付', /润色|修订|改写|压缩|缩写|扩写|排版|导出|交付|polish|revision/i, ['writer','chat'], '按请求润色、压缩或重组，保留事实、数字、统计方向、引用与术语。扩写只解释现有证据；翻译遵循目标语言，不自行增加结论。输出与原文的变更范围清楚；整篇检查不得静默改写。交付前核对授权章节、篇幅、引用、表图和文件；导出遵循产品设置，原上传文件只读。', '产物：修改稿及实际交付文件、未完成事项；不新增历史版本界面或伪造导出成功。'],
];
const cards = definitions.map(([key,name,pattern,roles,guidance,acceptance]) => ({
  id:PREFIX+key, name, pattern, roles, tier:'core', collection:'paper-pet', version:1,
  description:`${name}。${guidance}`, license:'Product-owned', commercial_use:'allowed',
  source:`# ${name}\n版本：1\n${BASE}\n\n## 必要输入、过程与边界\n${guidance}\n\n## 交付与验收\n${acceptance}`,
  filePath:__filename, references:[], disabledReason:'', product:true,
}));
function matchingCards(task, role='') { return cards.filter(c=>(!role||c.roles.includes(role))&&c.pattern.test(String(task))); }
function applicableExternal(id, task, project={}) {
  const t=String(task), domains=(project.domains||[project.domain]).join(' ');
  if (/aer-introduction/.test(id)) return /AER|AEJ/i.test(t);
  if (/Econfin-Proposal|aer-identification/.test(id)) return /经济|金融|会计|计量/.test(domains+' '+t)&&!/摘要|翻译/.test(t);
  if (/Full-empirical-analysis|aer-robustness/.test(id)&&/访谈|扎根理论|案例研究|Meta.?分析|荟萃|合并效应量/i.test(t)) return false;
  return true;
}
module.exports={cards,matchingCards,applicableExternal,BASE};
