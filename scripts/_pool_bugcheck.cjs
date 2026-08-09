// Validate expert pool entries (data/pool-*.json -> {metadata, pool:[...]})
// Same rigor as _content_bugcheck: cage sums, solution validity, solvability+uniqueness.
const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'data');

function getBoxSize(n){ if(n===4)return{boxW:2,boxH:2}; if(n===6)return{boxW:3,boxH:2}; return{boxW:3,boxH:3}; }

function solve(lv, cap){
  const N=lv.gridSize; const {boxW,boxH}=getBoxSize(N);
  const board=lv.boardData.map(r=>r.slice());
  const cages=lv.cages||[];
  const cageOf=Array.from({length:N},()=>new Array(N).fill(-1));
  cages.forEach((cg,i)=>cg.cells.forEach(([r,c])=>{cageOf[r][c]=i;}));
  const rowMask=new Array(N).fill(0),colMask=new Array(N).fill(0);
  const boxMask=new Array(N/boxH*N/boxW).fill(0);
  const boxIndex=(r,c)=>Math.floor(r/boxH)*(N/boxW)+Math.floor(c/boxW);
  const cSum=new Array(cages.length).fill(0),cFilled=new Array(cages.length).fill(0);
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){const v=board[r][c];if(v!==0){const bit=1<<v;if(rowMask[r]&bit||colMask[c]&bit||boxMask[boxIndex(r,c)]&bit)return{count:0,first:null};rowMask[r]|=bit;colMask[c]|=bit;boxMask[boxIndex(r,c)]|=bit;if(cageOf[r][c]>=0){cSum[cageOf[r][c]]+=v;cFilled[cageOf[r][c]]++;}}}
  let count=0,first=null;const capN=cap||2;
  function bt(){
    if(count>=capN)return;
    let best=null,bc=99;
    for(let r=0;r<N;r++)for(let c=0;c<N;c++){if(board[r][c]!==0)continue;const used=rowMask[r]|colMask[c]|boxMask[boxIndex(r,c)];let cnt=0;const cand=[];for(let v=1;v<=N;v++)if(!(used&(1<<v))){cnt++;cand.push(v);}if(cnt===0)return;if(cnt<bc){bc=cnt;best=[r,c,cand];if(cnt===1)break;}}
    if(!best){count++;if(!first)first=board.map(x=>x.slice());return;}
    const [r,c,cand]=best;const ci=cageOf[r][c];
    for(const v of cand){
      if(ci>=0){const placed=cSum[ci]+v;const rem=cages[ci].cells.filter(([rr,cc])=>board[rr][cc]===0||(rr===r&&cc===c)).length-1;if(placed>cages[ci].sum)continue;const need=cages[ci].sum-placed;if(need<rem*1)continue;if(need>rem*N)continue;}
      const bit=1<<v;board[r][c]=v;rowMask[r]|=bit;colMask[c]|=bit;boxMask[boxIndex(r,c)]|=bit;
      let pS=0,pF=0;if(ci>=0){pS=cSum[ci];pF=cFilled[ci];cSum[ci]+=v;cFilled[ci]++;}
      bt();
      board[r][c]=0;rowMask[r]&=~bit;colMask[c]&=~bit;boxMask[boxIndex(r,c)]&=~bit;
      if(ci>=0){cSum[ci]=pS;cFilled[ci]=pF;}
      if(count>=capN)return;
    }
  }
  bt();return{count,first};
}

function validateOne(lv){
  const issues=[];
  const N=lv.gridSize;const sol=lv.solution;
  // solution rows/cols/boxes
  for(let r=0;r<N;r++){if(new Set(sol[r]).size!==N)issues.push('solution 行'+r+' 非排列');}
  for(let c=0;c<N;c++){const col=[];for(let r=0;r<N;r++)col.push(sol[r][c]);if(new Set(col).size!==N)issues.push('solution 列'+c+' 非排列');}
  const {boxW,boxH}=getBoxSize(N);
  for(let br=0;br<N/boxH;br++)for(let bc=0;bc<N/boxW;bc++){const v=[];for(let dr=0;dr<boxH;dr++)for(let dc=0;dc<boxW;dc++)v.push(sol[br*boxH+dr][bc*boxW+dc]);if(new Set(v).size!==N)issues.push('solution 宫非排列');}
  if(lv.cages)for(const cg of lv.cages){const vals=cg.cells.map(([r,c])=>sol[r][c]);if(new Set(vals).size!==vals.length)issues.push('cage '+cg.id+' 重复');const s=vals.reduce((a,b)=>a+b,0);if(s!==cg.sum)issues.push('cage '+cg.id+' 和值 '+s+'!='+cg.sum);}
  // givens
  for(let r=0;r<N;r++)for(let c=0;c<N;c++){if(lv.boardData[r][c]!==0&&lv.boardData[r][c]!==sol[r][c])issues.push('given['+r+']['+c+']不符');}
  // solvability
  let info;try{info=solve(lv,2);}catch(e){issues.push('求解异常:'+e.message);}
  if(info){if(info.count===0)issues.push('无解');else if(info.count>1)issues.push('多解(count>=2)');else if(info.first){for(let r=0;r<N;r++)for(let c=0;c<N;c++)if(info.first[r][c]!==sol[r][c]){issues.push('唯一解与声明不符');break;}}}
  return issues;
}

function main(){
  const files=fs.readdirSync(DIR).filter(f=>f.startsWith('pool-')&&f.endsWith('.json')).sort();
  let total=0, badFiles=0, badLevels=0; const details=[];
  for(const f of files){
    let data;try{data=JSON.parse(fs.readFileSync(path.join(DIR,f),'utf8'));}catch(e){console.log('PARSE FAIL',f,e.message);badFiles++;continue;}
    const pool=data.pool||[];
    for(let i=0;i<pool.length;i++){total++;const lv=pool[i];const iss=validateOne(lv);if(iss.length){badLevels++;details.push(`  ${f}#${i} (${lv.levelId}) : ${iss.slice(0,4).join('; ')}`);}}
  }
  console.log('Pool files:',files.join(', '));
  console.log('Pool entries total:',total,'| bad:',badLevels,'| files unparseable:',badFiles);
  if(details.length){console.log('\n--- 问题条目 ---');details.slice(0,60).forEach(d=>console.log(d));if(details.length>60)console.log('  ... 共 '+details.length+' 条');}
  else console.log('✅ 全部池关卡内容校验通过');
}
main();
