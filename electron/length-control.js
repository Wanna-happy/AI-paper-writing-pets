function countBodyHanzi(html) {
  const body = String(html || '')
    .replace(/<h[1-6]\b[^>]*>\s*(?:\d+[.、\s]*)?(?:参考文献|引用文献|References)\s*<\/h[1-6]>[\s\S]*$/gi, '')
    .replace(/<section\b[^>]*class=["'][^"']*\bfootnotes\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, '')
    .replace(/<(h[1-6]|sup|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/\[E\d+\]/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
      const cp = parseInt(hex || dec, hex ? 16 : 10);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    });
  return (body.match(/\p{Script=Han}/gu) || []).length;
}

function inspectLength(html, contract) {
  const actual = contract?.metric === 'words' ? countBodyWords(html) : countBodyHanzi(html);
  return { actual, contract, passed: !contract || ((contract.minimum == null || actual >= contract.minimum) && (contract.maximum == null || actual <= contract.maximum)) };
}

async function enforceLength({ text, contract, revise, inspect = value => inspectLength(value, contract), onAttempt = () => {} }) {
  let current = text;
  const attempts = [];
  for (let attempt = 0; attempt <= 2; attempt++) {
    const check = inspect(current);
    attempts.push(check);
    if (check.passed) return { text: current, attempts, passed: true, actual: check.actual, contract };
    if (attempt === 2) {
      return { text: current, attempts, passed: false, actual: check.actual, contract,
        warning: `篇幅未达标：正文 ${check.actual} ${contract.metric === 'words' ? '英文词' : '汉字'}，要求${contract.label}；已自动返修两轮，正文已保留，可查看、编辑和导出。` };
    }
    onAttempt(attempt + 1, check);
    try { current = await revise(current, check, attempt + 1); }
    catch (error) {
      error.lengthReview = { text: current, attempts };
      throw error;
    }
  }
}

function countBodyWords(html) {
  const body = String(html || '').replace(/<h[1-6]\b[^>]*>\s*(?:参考文献|引用文献|References)\s*<\/h[1-6]>[\s\S]*$/gi, '')
    .replace(/<section\b[^>]*class=["'][^"']*\bfootnotes\b[^"']*["'][^>]*>[\s\S]*?<\/section>/gi, '')
    .replace(/<(h[1-6]|sup|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/\[E\d+\]/g, '')
    .replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;|&#\d+;/gi, ' ');
  return (body.match(/[A-Za-z]+(?:['’\-][A-Za-z]+)*/g) || []).length;
}
module.exports = { countBodyHanzi, countBodyWords, inspectLength, enforceLength };
