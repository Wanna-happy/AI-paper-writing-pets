const JSZip=require('jszip'),X=require('../src/vendor/xlsx.full.min.js');
module.exports=async function spreadsheetFixture(){
  const book=X.utils.book_new(),small=X.utils.aoa_to_sheet([['Second sheet 完整格式预览'],[],['SHEET_TWO_END',0.12345]]);
  small['!merges']=[X.utils.decode_range('A1:D1')];small['!ref']='A1:D3';small.B3.z='0.00%';
  const large=X.utils.aoa_to_sheet(Array.from({length:260},(_,r)=>Array.from({length:36},(_,c)=>`R${r+1}C${c+1}`)));
  X.utils.book_append_sheet(book,small,'SheetTwo');X.utils.book_append_sheet(book,large,'SheetOne');
  const zip=await JSZip.loadAsync(X.write(book,{type:'buffer',bookType:'xlsx'}));
  const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  zip.file('xl/styles.xml',`<styleSheet xmlns="${ns}"><fonts count="3"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font><font><sz val="24"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF92D050"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF00B0F0"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0"/><xf numFmtId="0" fontId="2" fillId="3" borderId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0"/></cellXfs></styleSheet>`);
  let xml=await zip.file('xl/worksheets/sheet1.xml').async('string');
  xml=xml.replace(/<c r="A1"/,'<c s="2" r="A1"').replace(/(<c r="B3")[^>]*>/,'$1 s="3">').replace('<sheetData>','<cols><col min="1" max="4" width="24" customWidth="1"/></cols><sheetData>');zip.file('xl/worksheets/sheet1.xml',xml);
  xml=await zip.file('xl/worksheets/sheet2.xml').async('string');
  xml=xml.replace(/(<row r="1">)([\s\S]*?)(<\/row>)/,(_m,a,b,c)=>a+b.replace(/<c /g,'<c s="1" ')+c).replace('<sheetData>','<cols><col min="1" max="36" width="10" customWidth="1"/></cols><sheetData>');zip.file('xl/worksheets/sheet2.xml',xml);
  return {xlsx:await zip.generateAsync({type:'nodebuffer'}),xls:X.write(book,{type:'buffer',bookType:'biff8'})};
};
