function reviewDelivery(checks = [], lengthReview = null) {
  const issues = [...new Set(checks.filter(Boolean))].map(message => ({ message,
    level: /不存在的脚注|不存在的引用|未知.*来源|引用.*错误/.test(message) ? 'block'
      : /未检测到脚注|来源|证据|尚未解析|未完成|未达标|缺少|未覆盖/.test(message) ? 'review' : 'warning' }));
  const blocking = issues.filter(issue => issue.level === 'block');
  const status = blocking.length ? 'blocked' : lengthReview?.passed === false ? 'needs-revision'
    : issues.some(issue => issue.level === 'review') ? 'needs-review' : 'ready';
  return { status, issues, blocking };
}
module.exports = { reviewDelivery };
