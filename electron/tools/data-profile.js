const path = require('node:path');

const DATA_EXTENSIONS = new Set(['.csv', '.xlsx']);
function isDataFile(file) { return DATA_EXTENSIONS.has(String(file?.extension || path.extname(file?.name || '')).toLowerCase()); }

function selectDataAttachment(files, selector = '') {
  const requested = String(selector || '').trim().toLowerCase();
  const legacyRequested = (files || []).some(file => String(file.extension).toLowerCase() === '.xls' &&
    (requested ? [file.id, file.name].some(value => String(value || '').toLowerCase() === requested) : !(files || []).some(isDataFile)));
  if (legacyRequested) throw new Error('旧版 XLS 暂不支持，请另存为 XLSX 或 CSV 后导入。');
  const candidates = (files || []).filter(isDataFile);
  const query = String(selector || '').trim().toLowerCase();
  const matches = query ? candidates.filter(file => String(file.id || '').toLowerCase() === query || String(file.name || '').toLowerCase() === query) : candidates;
  if (matches.length === 1) return matches[0];
  // Historical chat memory may contain an obsolete alias (for example W1).
  // When there is exactly one current project data file, its ID is authoritative.
  if (query && !matches.length && candidates.length === 1) return candidates[0];
  if (!matches.length) throw new Error(query ? `当前项目没有可读取的数据文件“${selector}”。可用文件：${candidates.map(file => file.name).join('、') || '无'}` : '当前项目没有可读取的 CSV/XLSX 数据文件。');
  throw new Error(`请指定数据文件：${matches.map(file => `${file.name}（${file.id}）`).join('、')}`);
}

function normalizeDataSelection(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('数据范围参数应为对象');
  const short = (value, label) => { const text = String(value || '').trim(); if (text.length > 160) throw new Error(`${label}过长`); return text; };
  const selection = {};
  if (input.sheetName) selection.sheetName = short(input.sheetName, '工作表名');
  if (input.cellRange) {
    const range = short(input.cellRange, '单元格范围').toUpperCase();
    if (!/^[A-Z]{1,3}[1-9]\d*:[A-Z]{1,3}[1-9]\d*$/.test(range)) throw new Error('单元格范围应写成 A1:K738');
    selection.cellRange = range;
  }
  if (input.headerRow !== undefined) {
    const row = Number(input.headerRow);
    if (!Number.isInteger(row) || row < 1 || row > 1000) throw new Error('标题行须为 1—1000 的行号');
    selection.headerRow = row;
  }
  if (input.yearRange) {
    const min = Number(input.yearRange.min), max = Number(input.yearRange.max);
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || min < 1800 || max > 2200) throw new Error('年份范围无效');
    selection.yearRange = { min, max, ...(input.yearRange.column ? { column: short(input.yearRange.column, '年份列') } : {}) };
  }
  if (input.columns) {
    if (!Array.isArray(input.columns) || input.columns.length > 200) throw new Error('最多选择 200 个字段');
    selection.columns = input.columns.map(value => short(value, '字段名')).filter(Boolean);
  }
  if (input.numericColumns) {
    if (!Array.isArray(input.numericColumns) || input.numericColumns.length > 200) throw new Error('最多转换 200 个数值字段');
    selection.numericColumns = [...new Set(input.numericColumns.map(value => short(value, '数值字段')).filter(Boolean))];
  }
  if (input.probeValues) {
    if (!Array.isArray(input.probeValues) || input.probeValues.length > 20) throw new Error('最多检查 20 个特殊取值');
    selection.probeValues = input.probeValues.map(value => short(value, '特殊取值')).filter(Boolean);
  }
  if (input.missingValues) {
    if (!Array.isArray(input.missingValues) || input.missingValues.length > 30) throw new Error('最多指定 30 个缺失值处理字段');
    selection.missingValues = input.missingValues.map(item => {
      if (!item || !Array.isArray(item.values) || !item.values.length || item.values.length > 20) throw new Error('缺失值规则须指定字段与取值');
      return { column: short(item.column, '缺失值字段'), values: item.values.map(value => short(value, '缺失标记')).filter(Boolean) };
    });
  }
  if (input.filters) {
    if (!Array.isArray(input.filters) || input.filters.length > 20) throw new Error('最多设置 20 个筛选条件');
    selection.filters = input.filters.map(filter => {
      if (!filter || !['eq', 'ne', 'in', 'not_in', 'between'].includes(filter.op)) throw new Error('筛选仅支持 eq、ne、in、not_in、between');
      const values = Array.isArray(filter.values) ? filter.values : [filter.value];
      if (!values.length || values.length > 100 || values.some(value => !['string', 'number'].includes(typeof value))) throw new Error('筛选值无效');
      if (filter.op === 'between' && (values.length !== 2 || values.some(value => !Number.isFinite(Number(value))))) throw new Error('between 需要两个数值边界');
      return { column: short(filter.column, '筛选列'), op: filter.op, values: values.map(value => String(value).trim().slice(0, 160)) };
    });
  }
  return selection;
}

function buildDataProfileCode(fileName, fileId, selection, { writeSelected = false } = {}) {
  const payload = JSON.stringify(JSON.stringify(normalizeDataSelection(selection)));
  return `import os,json,math,re,pandas as pd
from openpyxl import load_workbook
from openpyxl.utils.cell import range_boundaries
p=os.environ['DATA_FILE']
sel=json.loads(${payload})
def safe(v):
    if pd.isna(v): return None
    if hasattr(v,'item'): v=v.item()
    if hasattr(v,'isoformat'): return v.isoformat()
    if isinstance(v,float) and not math.isfinite(v): return None
    return v if isinstance(v,(str,int,float,bool)) else str(v)
def number(v):
    v=float(v)
    return round(v,6) if math.isfinite(v) else None
def count_probe(series, value):
    return int(match_value(series,value).sum())
def match_value(series, value):
    text=str(value).strip()
    try:
        numeric=float(text)
        return pd.to_numeric(series,errors='coerce').eq(numeric)
    except ValueError:
        return series.astype(str).str.strip().str.casefold().eq(text.casefold())
def col(name):
    if name in df.columns: return name
    key=re.sub(r'[\\s_\\-]+','',str(name)).casefold()
    found=[c for c in df.columns if re.sub(r'[\\s_\\-]+','',str(c)).casefold()==key]
    if len(found)==1: return found[0]
    raise ValueError('找不到字段 '+str(name)+'；实际字段：'+'、'.join(map(str,df.columns[:80])))
sheets=[]
chosen=None
if p.lower().endswith('.xlsx'):
    book=load_workbook(p,read_only=True,data_only=True)
    for ws in book.worksheets[:30]:
        preview_limit=60 if ws.max_row<=60 and ws.max_column<=8 else 3
        preview=[[safe(v) for v in row[:12]] for row in ws.iter_rows(min_row=1,max_row=min(ws.max_row,preview_limit),values_only=True)]
        sheets.append({'name':ws.title,'rows':ws.max_row,'columns':ws.max_column,'preview':preview})
    chosen=sel.get('sheetName') or max(sheets,key=lambda s:s['rows']*min(s['columns'],100))['name']
    if chosen not in book.sheetnames: raise ValueError('找不到工作表 '+chosen+'；实际工作表：'+'、'.join(book.sheetnames))
    ws=book[chosen]
    if sel.get('cellRange'):
        left,top,right,bottom=range_boundaries(sel['cellRange'])
        if bottom>ws.max_row or right>ws.max_column or right<left or bottom<=top or (right-left+1)*(bottom-top+1)>1000000:
            raise ValueError('单元格范围超出工作表或范围过大；实际尺寸为 '+str(ws.max_row)+' 行 × '+str(ws.max_column)+' 列')
        rows=list(ws.iter_rows(min_row=top,max_row=bottom,min_col=left,max_col=right,values_only=True))
        df=pd.DataFrame(rows[1:],columns=[str(v).strip() if v is not None else '空列'+str(i+1) for i,v in enumerate(rows[0])])
    else:
        df=pd.read_excel(p,sheet_name=chosen,header=sel.get('headerRow',1)-1)
else:
    if sel.get('sheetName') or sel.get('cellRange'): raise ValueError('CSV 文件没有工作表或 Excel 单元格范围')
    df=pd.read_csv(p,encoding='utf-8-sig',header=sel.get('headerRow',1)-1)
df.columns=[str(c).strip() for c in df.columns]
total=len(df)
applied=[]
if sel.get('yearRange'):
    yc=col(sel['yearRange'].get('column') or next((c for c in df.columns if str(c).strip().casefold() in ('year','time','年份','年度','年')),''))
    year=pd.to_numeric(df[yc],errors='coerce')
    lo,hi=sel['yearRange']['min'],sel['yearRange']['max']
    df=df.loc[year.between(lo,hi)].copy()
    applied.append(str(yc)+' '+str(lo)+'—'+str(hi))
for f in sel.get('filters',[]):
    c=col(f['column'])
    if f['op']=='between':
        bounds=[float(v) for v in f['values']]
        if bounds[0]>bounds[1]: raise ValueError('筛选范围下界大于上界')
        match=pd.to_numeric(df[c],errors='coerce').between(bounds[0],bounds[1])
    else:
        match=pd.Series(False,index=df.index)
        for v in f['values']: match=match | match_value(df[c],v)
    df=df.loc[(~match if f['op'] in ('ne','not_in') else match)].copy()
    applied.append(str(c)+' '+f['op']+' '+','.join(f['values']))
if sel.get('columns'):
    chosen_cols=[col(c) for c in sel['columns']]
    df=df.loc[:,chosen_cols].copy()
    applied.append('字段 '+','.join(map(str,chosen_cols)))
missing_converted=[]
for rule in sel.get('missingValues',[]):
    c=col(rule['column'])
    mask=pd.Series(False,index=df.index)
    for v in rule['values']: mask=mask | match_value(df[c],v)
    count=int(mask.sum())
    df.loc[mask,c]=pd.NA
    missing_converted.append({'column':str(c),'values':rule['values'],'count':count})
def numeric_probe(series):
    text=series.astype('string').str.strip()
    text=text.str.replace(r'[ \\u00a0\\u202f]', '', regex=True)
    # Only unambiguous groups of three digits are thousands separators.
    grouped=text.str.match(r'^[+-]?\\d{1,3}(,\\d{3})+(\\.\\d+)?$', na=False)
    text=text.where(~grouped,text.str.replace(',', '', regex=False))
    valid=text.str.match(r'^[+-]?(\\d+(\\.\\d*)?|\\.\\d+)([eE][+-]?\\d+)?$', na=False)
    numeric=pd.to_numeric(text.where(valid),errors='coerce')
    invalid=series.notna() & (numeric.isna() | numeric.isin([float('inf'),float('-inf')]))
    examples=[{'sourceRow':int(i)+(range_boundaries(sel['cellRange'])[1]+1 if sel.get('cellRange') else sel.get('headerRow',1)+1),'value':safe(series.loc[i])} for i in series.index[invalid][:20]]
    return numeric, {'nonMissing':int(series.notna().sum()),'convertible':int((series.notna() & ~invalid).sum()),'invalidCount':int(invalid.sum()),'invalidExamples':examples}
numeric_converted=[]
for name in sel.get('numericColumns',[]):
    c=col(name)
    values,audit=numeric_probe(df[c])
    audit['column']=str(c)
    numeric_converted.append(audit)
    # Inspection reports ambiguity; execution stops instead of silently creating missing values.
    if ${writeSelected ? 'True' : 'False'} and audit['invalidCount']:
        raise ValueError('数值转换失败，未删除任何行：'+json.dumps(audit,ensure_ascii=True))
    if not audit['invalidCount']: df[c]=values
columns=[]
for c in df.columns[:200]:
    s=df[c]
    item={'name':str(c),'dtype':str(s.dtype),'missing':int(s.isna().sum()),'distinct':int(s.nunique(dropna=True))}
    if pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s):
        v=pd.to_numeric(s,errors='coerce').dropna()
        item['statistics']={'n':int(len(v)),'mean':number(v.mean()) if len(v) else None,'sd':number(v.std()) if len(v)>1 else None,'min':number(v.min()) if len(v) else None,'q1':number(v.quantile(.25)) if len(v) else None,'median':number(v.median()) if len(v) else None,'q3':number(v.quantile(.75)) if len(v) else None,'max':number(v.max()) if len(v) else None}
    if not pd.api.types.is_numeric_dtype(s):
        _,item['numericProbe']=numeric_probe(s)
    if item['distinct']<=50:
        item['valueCounts']=[{'value':safe(k),'count':int(v)} for k,v in s.value_counts(dropna=False).head(50).items()]
    if sel.get('probeValues'):
        item['probeCounts']={str(v):count_probe(s,v) for v in sel['probeValues']}
    columns.append(item)
profile={'file':${JSON.stringify(fileName)},'fileId':${JSON.stringify(fileId)},'sheet':chosen,'sheets':sheets,'rowsBeforeFilter':total,'rows':len(df),'selectedRange':sel.get('cellRange'),'appliedFilters':applied,'missingConverted':missing_converted,'numericConverted':numeric_converted,'selection':sel,'columns':columns,'previewRows':[[safe(v) for v in row] for row in df.iloc[:3,:12].itertuples(index=False,name=None)]}
if ${writeSelected ? 'True' : 'False'}:
    if not len(df): raise ValueError('所选范围没有匹配行，已停止分析')
    out=os.path.join(os.environ['CHART_DIR'],'selected.csv')
    df.to_csv(out,index=False,encoding='utf-8-sig')
print(json.dumps(profile,ensure_ascii=True,allow_nan=False))
`;
}

module.exports = { isDataFile, selectDataAttachment, normalizeDataSelection, buildDataProfileCode };
