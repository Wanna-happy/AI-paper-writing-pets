const DEFAULT_FORMATTING=Object.freeze({bodyFont:'宋体',latinFont:'Times New Roman',headingFont:'黑体',bodySize:14,heading1Size:18,heading2Size:16,heading3Size:14,lineMode:'multiple',lineValue:1.75,firstLineChars:2,marginTop:2.75,marginBottom:2.75,marginLeft:3.1,marginRight:2.75,requirementsSource:''});
function normalizeFormatting(raw={}){
  raw=raw&&typeof raw==='object'?raw:{};const result={...DEFAULT_FORMATTING};
  for(const key of ['bodyFont','latinFont','headingFont'])if(typeof raw[key]==='string'&&raw[key].trim())result[key]=raw[key].replace(/[\r\n\x00-\x1f<>]/g,'').trim().slice(0,60)||DEFAULT_FORMATTING[key];
  const number=(key,min,max)=>{const n=Number(raw[key]);if(raw[key]!==undefined&&raw[key]!==''&&Number.isFinite(n)&&n>=min&&n<=max)result[key]=n;};
  for(const key of ['bodySize','heading1Size','heading2Size','heading3Size'])number(key,8,36);
  result.lineMode=raw.lineMode==='exact'?'exact':'multiple';result.lineValue=result.lineMode==='exact'?28:1.75;number('lineValue',result.lineMode==='exact'?10:1,result.lineMode==='exact'?60:3);
  number('firstLineChars',0,4);for(const key of ['marginTop','marginBottom','marginLeft','marginRight'])number(key,0.5,6);
  if(typeof raw.requirementsSource==='string')result.requirementsSource=raw.requirementsSource.slice(0,200);
  return result;
}
function paragraphSpacing(format){return {line:Math.round(format.lineValue*(format.lineMode==='exact'?20:240)),lineRule:format.lineMode==='exact'?'exact':'auto'};}
function parseFormattingRequirements(text){
  const source=String(text||'').slice(0,100000),patch={},recognized=[];
  const set=(key,value)=>{patch[key]=value;recognized.push(key);};
  const sizes={'小五':9,'五号':10.5,'小四':12,'四号':14,'小三':15,'三号':16,'小二':18,'二号':22,'小一':24,'一号':26};
  const size=fragment=>{for(const [name,value] of Object.entries(sizes))if(fragment.includes(name))return value;const m=fragment.match(/(\d+(?:\.\d+)?)\s*(?:pt|磅)/i);return m?Number(m[1]):null;};
  const fonts=/Times New Roman|微软雅黑|宋体|黑体|仿宋|楷体|SimSun|SimHei|Arial|Calibri/i;
  const body=source.match(/(?:正文|全文|文本)[：:\s]*([^\n。；;]{0,110})/);
  if(body){const f=body[1].match(fonts),s=size(body[1]);if(f)set('bodyFont',f[0]);if(s)set('bodySize',s);}
  const latin=source.match(/(?:英文|西文|数字)[：:\s]*([^\n。；;]{0,70})/);if(latin?.[1].match(fonts))set('latinFont',latin[1].match(fonts)[0]);
  for(const [index,label] of [[1,'一级标题'],[2,'二级标题'],[3,'三级标题']]){const line=source.match(new RegExp(label+'[：:\\s]*([^\\n。；;]{0,80})'));if(line){const s=size(line[1]);if(s)set(`heading${index}Size`,s);const f=line[1].match(fonts);if(f){if(!patch.headingFont)set('headingFont',f[0]);}}}
  const fixed=source.match(/(?:行距[^\n。；;]{0,15}?(?:固定值?|固定)|固定(?:值|行距)?)[：:\s]*(\d+(?:\.\d+)?)\s*(?:pt|磅)/i);
  const multiple=source.match(/(?:行距[：:\s]*)?(\d+(?:\.\d+)?)\s*倍(?:行距)?/);
  if(fixed){set('lineMode','exact');set('lineValue',Number(fixed[1]));}else if(multiple){set('lineMode','multiple');set('lineValue',Number(multiple[1]));}else if(/单倍行距/.test(source)){set('lineMode','multiple');set('lineValue',1);}else if(/双倍行距/.test(source)){set('lineMode','multiple');set('lineValue',2);}
  const indent=source.match(/首行(?:缩进)?[：:\s]*(\d+(?:\.\d+)?)\s*(?:字|字符)/);if(indent)set('firstLineChars',Number(indent[1]));
  for(const [cn,key] of [['上','Top'],['下','Bottom'],['左','Left'],['右','Right']]){const m=source.match(new RegExp(cn+'(?:页?边距)?[：:\\s]*(\\d+(?:\\.\\d+)?)\\s*(厘米|cm|毫米|mm)','i'));if(m)set('margin'+key,Number(m[1])/(m[2]==='mm'||m[2]==='毫米'?10:1));}
  const warnings=[];
  const normalized=normalizeFormatting(patch);
  for(const key of Object.keys(patch))if(typeof patch[key]==='number'&&patch[key]!==normalized[key]){delete patch[key];warnings.push(`${key} 超出支持范围，未自动填入，请手动核对。`);if(key==='lineValue')delete patch.lineMode;}
  const fields=Object.fromEntries(Object.keys(patch).map(key=>[key,normalized[key]]));
  const citation=source.match(/GB\/?T\s*7714|APA|MLA|Chicago/i);
  return {documentFormatting:fields,defaultCitation:citation?(citation[0].replace(/\s/g,'').toLowerCase().includes('7714')?'GB/T 7714':({apa:'APA',mla:'MLA',chicago:'Chicago'}[citation[0].toLowerCase()])):null,recognizedFields:[...new Set(recognized)].filter(key=>key in fields),warnings:[...warnings,'仅提取可识别的正文、统一标题字体、字号、行距和页边距；封面、目录、分节及不同级别标题使用不同字体等复杂要求需人工核对。']};
}
module.exports={DEFAULT_FORMATTING,normalizeFormatting,paragraphSpacing,parseFormattingRequirements};
