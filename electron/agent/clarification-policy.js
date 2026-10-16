// Environment setup is an execution concern, not a research-method choice.
// Keep an LLM-generated clarification card from turning a missing package
// claim into an implicit request to abandon the user's chosen method.
function hasDependencyMethodSwitch(questions) {
  const dependencyClaim = /(?:库|依赖|包|环境|运行时|package|pip).{0,24}(?:不可用|缺失|未安装|装不上|没有|失败|无法使用|unavailable|missing)|(?:不可用|缺失|未安装|装不上|没有|失败).{0,24}(?:库|依赖|包|环境|运行时|package|pip)/i;
  const methodChoice = /(?:口径|方法|算法|路径|替代|改用|选哪|选用|选择|继续|保留|放弃|DTW|K.?Means|欧氏)/i;
  for (const item of Array.isArray(questions) ? questions : []) {
    const combined = [item.question, ...(item.options || []), item.suggestedAnswer].filter(Boolean).join(' ');
    if (dependencyClaim.test(combined) && methodChoice.test(combined)) return true;
  }
  return false;
}

function assertResearchClarificationQuestions(questions) {
  if (hasDependencyMethodSwitch(questions)) throw new Error('不能把分析依赖缺失作为更换已选研究方法的确认问题。先调用 install_python_dependency 核查或安装依赖，再按原方法提交方案；真实安装或执行失败时如实报告。');
}

function shouldSupersedeClarification(clarification, task) {
  if (clarification?.status !== 'pending') return false;
  if (hasDependencyMethodSwitch(clarification.questions)) return true;
  const explicitRevision = /(?:重新|重跑|再跑|改为|改用|撤回|不用|不需要|直接|已经|已安装|装好了|按我说的|继续执行)/i.test(String(task || ''));
  if (!explicitRevision) return false;
  const text = (clarification.questions || []).map(item => [item.question, ...(item.options || [])].join(' ')).join(' ');
  const taskMethods = String(task || '').match(/DTW|K[ -]?Means|OLS|DID|PSM|SHAP|Bootstrap|回归|聚类/gi) || [];
  return taskMethods.some(method => text.toLowerCase().includes(method.toLowerCase()));
}

module.exports = { assertResearchClarificationQuestions, hasDependencyMethodSwitch, shouldSupersedeClarification };
