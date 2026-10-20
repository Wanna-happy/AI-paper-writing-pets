function extractOutline(source, existing=[]) {
  const titles=[...new Set(String(source||'').split(/\r?\n/).map(line=>line.trim().replace(/^#+\s*/,''))
    .filter(line=>/^(第[一二三四五六七八九十百\d]+章\s*.+|摘要|Abstract|参考文献|致谢)$/i.test(line))
    .map(line=>line.replace(/[.．·…]{2,}\s*\d+\s*$/,'').trim()))].slice(0,40);
  if(!titles.length)throw new Error('未识别到一级章节，请手动添加或修改目录；不会覆盖已有设置');
  return titles.map(title=>({id:existing.find(c=>c.title===title)?.id||`outline-${require('node:crypto').randomUUID()}`,title:title.slice(0,120),
    sectionIds:[/^参考文献/.test(title)?'references':require('./research-workflow').detectSection(title).id],targetWords:existing.find(c=>c.title===title)?.targetWords||0,purpose:''}));
}
module.exports={extractOutline};
