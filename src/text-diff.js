(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ManuscriptDiff=api;})(globalThis,()=>{
  const LIMIT=1000000;
  function diff(before,after,options={}){
    let simplified=false;const output=[];
    function add(type,text){if(!text)return;const last=output.at(-1);if(last?.type===type)last.text+=text;else output.push({type,text});}
    function compare(a,b,refine=false){
      let start=0,end=0;while(start<Math.min(a.length,b.length)&&a[start]===b[start])start++;
      while(end<Math.min(a.length,b.length)-start&&a[a.length-end-1]===b[b.length-end-1])end++;
      add('equal',a.slice(0,start).join(''));const x=a.slice(start,a.length-end),y=b.slice(start,b.length-end);
      if(!x.length)add('insert',y.join(''));
      else if(!y.length)add('delete',x.join(''));
      else if((x.length+1)*(y.length+1)>LIMIT){simplified=true;add('delete',x.join(''));add('insert',y.join(''));}
      else{
        const width=y.length+1,table=new Uint32Array((x.length+1)*width);
        for(let i=x.length-1;i>=0;i--)for(let j=y.length-1;j>=0;j--)table[i*width+j]=x[i]===y[j]?table[(i+1)*width+j+1]+1:Math.max(table[(i+1)*width+j],table[i*width+j+1]);
        const parts=[];let i=0,j=0;
        const part=(type,text)=>{const last=parts.at(-1);if(last?.type===type)last.text+=text;else parts.push({type,text});};
        while(i<x.length||j<y.length){if(i<x.length&&j<y.length&&x[i]===y[j]){part('equal',x[i++]);j++;}else if(i<x.length&&(j===y.length||table[(i+1)*width+j]>=table[i*width+j+1]))part('delete',x[i++]);else part('insert',y[j++]);}
        if(refine){for(let k=0;k<parts.length;k++){const p=parts[k],next=parts[k+1];if(p.type==='delete'&&next?.type==='insert'){compare(Array.from(p.text),Array.from(next.text));k++;}else add(p.type,p.text);}}
        else for(const p of parts)add(p.type,p.text);
      }
      add('equal',end?a.slice(-end).join(''):'');
    }
    const a=String(before||''),b=String(after||'');
    if(options.linesOnly)compare(a.match(/[^\n]*\n|[^\n]+$/g)||[],b.match(/[^\n]*\n|[^\n]+$/g)||[],false);
    else if(a.length*b.length<=LIMIT)compare(Array.from(a),Array.from(b));
    else compare(a.match(/[^\n]*\n|[^\n]+$/g)||[],b.match(/[^\n]*\n|[^\n]+$/g)||[],true);
    return {parts:output,simplified};
  }
  return {diff};
});
