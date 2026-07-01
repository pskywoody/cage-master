/**
 * build-level701.js - 构造显性数对教学关 v2
 * 核心：手工设计连通的、模糊的笼子，然后贪心挖空
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require(path.join(__dirname, 'puzzle-validator.js'));

const SOLUTION = [
  [5,3,4,6,7,8,9,1,2],
  [6,7,2,1,9,5,3,4,8],
  [1,9,8,3,4,2,5,6,7],
  [8,5,9,7,6,1,4,2,3],
  [4,2,6,8,5,3,7,9,1],
  [7,1,3,9,2,4,8,5,6],
  [9,6,1,5,3,7,2,8,4],
  [2,8,7,4,1,9,6,3,5],
  [3,4,5,2,8,6,1,7,9]
];

const labels='ABCDEFGHI';

// 手工设计笼子 - 确保连通性和数字不重复
// 我将逐格指定cage ID，确保连通
const CAGE_MAP = [
  [1, 1, 2, 3, 3, 4, 5, 5, 6],
  [1, 7, 2, 2, 4, 4, 5, 6, 6],
  [7, 7, 8, 8, 9, 9,10,10,11],
  [12,13,8,14,14,15,10,11,11],
  [12,13,13,14,16,15,15,17,18],
  [19,19,20,16,16,21,22,17,18],
  [20,20,21,21,22,22,23,23,24],
  [25,26,26,27,27,28,23,24,24],
  [25,25,27,27,28,28,29,29,29]
];

function buildCagesFromMap(sol, map) {
  const cageMap = {};
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const id = map[r][c];
      if (!cageMap[id]) cageMap[id] = [];
      cageMap[id].push([r, c]);
    }
  const cages = [];
  for (const id of Object.keys(cageMap).map(Number).sort((a,b)=>a-b)) {
    const cells = cageMap[id];
    // Check connectivity
    const visited = new Set();
    const queue = [cells[0]];
    visited.add(`${cells[0][0]},${cells[0][1]}`);
    while (queue.length > 0) {
      const [r,c] = queue.shift();
      for (const [dr,dc] of [[0,1],[0,-1],[1,0],[-1,0]]) {
        const nr=r+dr,nc=c+dc;
        const k=`${nr},${nc}`;
        if (!visited.has(k) && cells.some(([cr,cc])=>cr===nr&&cc===nc)) {
          visited.add(k);
          queue.push([nr,nc]);
        }
      }
    }
    if (visited.size !== cells.length) {
      console.log(`DISCONNECTED cage #${id}: ${cells.map(([r,c])=>labels[r]+(c+1)).join(',')}`);
      return null;
    }
    const nums = cells.map(([r,c]) => sol[r][c]);
    const sum = nums.reduce((a,b)=>a+b,0);
    if (new Set(nums).size !== nums.length) {
      console.log(`DUP cage #${id}: nums=[${nums}] cells=${cells.map(([r,c])=>labels[r]+(c+1)).join(',')}`);
      return null;
    }
    cages.push({id, cells, sum});
  }
  return cages;
}

let CAGES = buildCagesFromMap(SOLUTION, CAGE_MAP);
if (!CAGES) process.exit(1);

console.log(`Cages: ${CAGES.length}`);
const sizes = {};
for (const cage of CAGES) {
  const s = cage.cells.length;
  sizes[s] = (sizes[s]||0)+1;
  const nums = cage.cells.map(([r,c]) => SOLUTION[r][c]);
  const cells = cage.cells.map(([r,c]) => labels[r] + (c+1)).join(',');
  console.log(`  #${String(cage.id).padStart(2,' ')}: [${cells.padEnd(14,' ')}] sum=${String(cage.sum).padStart(2,' ')} nums=[${nums}] (${s}格)`);
}
console.log('Size distribution:', sizes);

// Verify unique sum combos for 2-cell cages (avoid forced combos)
const twoCellSums = {3:true,4:true,16:true,17:true}; // sums with only 1 possible combo for 2 cells
let problemCages = [];
for (const cage of CAGES) {
  if (cage.cells.length === 2 && twoCellSums[cage.sum]) {
    problemCages.push(cage);
  }
}
if (problemCages.length > 0) {
  console.log('\nWARNING: 2-cell cages with unique sums:', problemCages.map(c=>`#${c.id} sum=${c.sum}`));
}

// ========== 求解器 ==========
const c2c={},ccid={};
for(const cage of CAGES){c2c[cage.id]=cage.cells;for(const[r,c]of cage.cells)ccid[`${r},${c}`]=cage.id;}

function getCands(g,r,c){
  if(g[r][c])return [g[r][c]];
  const used=new Set();
  for(let i=0;i<9;i++)if(g[r][i])used.add(g[r][i]);
  for(let i=0;i<9;i++)if(g[i][c])used.add(g[i][c]);
  const br=Math.floor(r/3)*3,bc=Math.floor(c/3)*3;
  for(let i=br;i<br+3;i++)for(let j=bc;j<bc+3;j++)if(g[i][j])used.add(g[i][j]);
  const cid=ccid[`${r},${c}`];
  if(cid!==undefined&&c2c[cid])for(const[cr,cc]of c2c[cid])if(g[cr][cc])used.add(g[cr][cc]);
  const o=[];for(let n=1;n<=9;n++)if(!used.has(n))o.push(n);
  return o;
}

function findNS(g){const r=[];for(let i=0;i<9;i++)for(let j=0;j<9;j++){if(g[i][j])continue;const c=getCands(g,i,j);if(c.length===1)r.push({r:i,c:j,num:c[0]});}return r;}

function findHS(g){
  for(let r=0;r<9;r++){const pm=new Map();for(let c=0;c<9;c++){if(g[r][c])continue;for(const n of getCands(g,r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push(c);}}for(const[n,cs]of pm)if(cs.length===1)return{r,c:cs[0],num:n,type:'row'};}
  for(let c=0;c<9;c++){const pm=new Map();for(let r=0;r<9;r++){if(g[r][c])continue;for(const n of getCands(g,r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push(r);}}for(const[n,rs]of pm)if(rs.length===1)return{r:rs[0],c,num:n,type:'col'};}
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){const pm=new Map();for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++){const r=br*3+dr,c=bc*3+dc;if(g[r][c])continue;for(const n of getCands(g,r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push([r,c]);}}for(const[n,ps]of pm)if(ps.length===1)return{r:ps[0][0],c:ps[0][1],num:n,type:'box'};}
  for(const cage of Object.values(c2c)){const pm=new Map();for(const[r,c]of cage){if(g[r][c])continue;for(const n of getCands(g,r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push([r,c]);}}for(const[n,ps]of pm)if(ps.length===1)return{r:ps[0][0],c:ps[0][1],num:n,type:'cage'};}
  return null;
}

function cascade(s){
  const g=s.map(r=>[...r]);let f=0;
  for(let i=0;i<500;i++){
    let found=false;
    const ns=findNS(g);
    if(ns.length>0){g[ns[0].r][ns[0].c]=ns[0].num;f++;found=true;continue;}
    const hs=findHS(g);
    if(hs){const c=getCands(g,hs.r,hs.c);if(c.includes(hs.num)){g[hs.r][hs.c]=hs.num;f++;found=true;continue;}}
    break;
  }
  let e=0;for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!g[r][c])e++;
  return{g,f,e};
}

function findPairs(g){
  const pairs=[];
  function chk(cells,ut){
    const bi=[];for(const[r,c]of cells){if(g[r][c])continue;const ca=getCands(g,r,c);if(ca.length===2)bi.push({r,c,nums:ca});}
    for(let i=0;i<bi.length;i++)for(let j=i+1;j<bi.length;j++){const a=bi[i],b=bi[j];if(a.nums[0]===b.nums[0]&&a.nums[1]===b.nums[1])pairs.push({r1:a.r,c1:a.c,r2:b.r,c2:b.c,nums:a.nums,ut,cells});}
  }
  for(let r=0;r<9;r++){const cs=[];for(let c=0;c<9;c++)cs.push([r,c]);chk(cs,'row');}
  for(let c=0;c<9;c++){const cs=[];for(let r=0;r<9;r++)cs.push([r,c]);chk(cs,'col');}
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){const cs=[];for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)cs.push([br*3+dr,bc*3+dc]);chk(cs,'box');}
  return pairs;
}

function applyPair(g,pair){
  const{nums,cells,r1,c1,r2,c2}=pair;let elim=0;
  const others=cells.filter(([r,c])=>!((r===r1&&c===c1)||(r===r2&&c===c2)));
  for(const[r,c]of others){if(g[r][c])continue;const ca=getCands(g,r,c);const f=ca.filter(n=>n!==nums[0]&&n!==nums[1]);if(f.length===1&&ca.length>1){g[r][c]=f[0];elim++;}}
  return elim;
}

function evaluate(bd){
  const ns=findNS(bd);
  const cas=cascade(bd);
  let dom=false,btPair=null;
  if(cas.e>0){
    const pairs=findPairs(cas.g);
    for(const pair of pairs){
      const tg=cas.g.map(rr=>[...rr]);
      const elim=applyPair(tg,pair);
      if(elim>0){
        btPair=pair;
        const after=cascade(tg);
        if(after.e===0){dom=true;}
        break;
      }
    }
  }
  return{ns:ns.length,filled:cas.f,empty:cas.e,bt:!!btPair,dom,btPair,stuckGrid:cas.g};
}

// ========== 贪心挖空 ==========
console.log('\n=== Greedy digging ===\n');
const forced=new Set();
for(const cage of CAGES)if(cage.cells.length===1)forced.add(`${cage.cells[0][0]},${cage.cells[0][1]}`);

let mask=Array.from({length:9},()=>Array(9).fill(true));
let givens=81;

while(givens>28){
  const candidates=[];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)
    if(mask[r][c]&&!forced.has(`${r},${c}`))candidates.push([r,c]);
  if(candidates.length===0)break;
  
  let bestMove=null,bestScore=-Infinity,bestInfo=null;
  for(const[r,c]of candidates){
    mask[r][c]=false;
    const bd=[];for(let i=0;i<9;i++){bd.push([]);for(let j=0;j<9;j++)bd[i][j]=mask[i][j]?SOLUTION[i][j]:0;}
    const ev=evaluate(bd);
    
    let sc=-1000;
    if(ev.ns<=5){
      if(ev.ns>=3&&ev.ns<=5)sc+=300;
      else if(ev.ns>0)sc+=100;
      else sc-=200;
      if(ev.empty>0){
        sc+=ev.empty*8;
        if(ev.bt)sc+=100;
        if(ev.dom)sc+=2000;
      }else{sc-=1000;}
    }else{sc=-1000;}
    
    if(sc>bestScore){bestScore=sc;bestMove=[r,c];bestInfo=ev;}
    mask[r][c]=true;
  }
  if(bestMove){
    mask[bestMove[0]][bestMove[1]]=false;
    givens--;
    if(givens%5===0||bestInfo.dom){
      const p=bestInfo.btPair?`[${bestInfo.btPair.ut}:${labels[bestInfo.btPair.r1]}${bestInfo.btPair.c1+1},${labels[bestInfo.btPair.r2]}${bestInfo.btPair.c2+1}={${bestInfo.btPair.nums}}]`:'';
      console.log(`G=${givens} NS=${bestInfo.ns} fill=${bestInfo.filled} emp=${bestInfo.empty} BT=${bestInfo.bt} dom=${bestInfo.dom} ${p} sc=${bestScore}`);
    }
    if(bestInfo.dom&&bestInfo.ns>=3&&bestInfo.ns<=5&&givens>=30&&givens<=35){
      console.log('*** PERFECT! ***');break;
    }
  }else break;
}

// 构建结果
const finalBd=[];
for(let r=0;r<9;r++){finalBd.push([]);for(let c=0;c<9;c++)finalBd[r][c]=mask[r][c]?SOLUTION[r][c]:0;}
console.log(`\nFinal givens: ${finalBd.flat().filter(v=>v).length}`);

// 用官方validator验证
const V=new KillerSudokuValidator(9,3,3);
let rep=V.validate({boardData:finalBd,cages:CAGES,solution:SOLUTION},{maxInitialNaked:5,requireTechnique:'nakedPair'});
console.log(`\nValidation: valid=${rep.valid} dom=${rep.info.dominoComplete} NS=${rep.info.initialNakedSingles}`);
console.log('Errors:',rep.errors);
console.log('Info:',JSON.stringify(rep.info,null,2));

if(!(rep.valid&&rep.info.dominoComplete&&rep.info.initialNakedSingles>=3&&rep.info.initialNakedSingles<=5)){
  console.log('\n=== Hill climbing refinement ===\n');
  for(let iter=0;iter<500000;iter++){
    const r=Math.floor(Math.random()*9),c=Math.floor(Math.random()*9);
    if(forced.has(`${r},${c}`))continue;
    mask[r][c]=!mask[r][c];
    const bd=[];for(let i=0;i<9;i++){bd.push([]);for(let j=0;j<9;j++)bd[i][j]=mask[i][j]?SOLUTION[i][j]:0;}
    const gc=bd.flat().filter(v=>v).length;
    if(gc<28||gc>40){mask[r][c]=!mask[r][c];continue;}
    const r2=V.validate({boardData:bd,cages:CAGES,solution:SOLUTION},{maxInitialNaked:5,requireTechnique:'nakedPair'});
    if(r2.valid&&r2.info.dominoComplete&&r2.info.initialNakedSingles>=3&&r2.info.initialNakedSingles<=5&&gc>=30&&gc<=35){
      console.log(`*** PERFECT at hc#${iter}! gc=${gc}`);
      for(let r=0;r<9;r++)for(let c=0;c<9;c++)finalBd[r][c]=bd[r][c];
      rep=r2;
      break;
    }
    mask[r][c]=!mask[r][c];
    if(iter%100000===99999)console.log(`  hc ${iter+1} iters`);
  }
}

// 输出
const gc=finalBd.flat().filter(v=>v).length;
console.log(`\nFinal: gc=${gc} valid=${rep.valid} dom=${rep.info.dominoComplete} NS=${rep.info.initialNakedSingles}`);
console.log('Board:');
V.printGrid(finalBd);

if(rep.info.breakthroughPair){
  console.log(`Breakthrough pair: ${labels[rep.info.breakthroughPair.cells[0][0]]}${rep.info.breakthroughPair.cells[0][1]+1},${labels[rep.info.breakthroughPair.cells[1][0]]}${rep.info.breakthroughPair.cells[1][1]+1} = {${rep.info.breakthroughPair.nums}} in ${rep.info.breakthroughPair.unitType}`);
}

const level={
  levelId:701,title:"显性数对教学",gridSize:9,difficulty:2,teachingGoal:"nakedPair",
  features:["教学关","标准杀手数独","显性数对技巧"],
  triggers:{nakedPair:{dialogTitle:"发现显性数对！",dialogBody:"观察卡壳的盘面：在同一行/列/宫中，有两个格子的候选数完全相同（都是{a,b}）。这意味着a和b必然占据这两个格子之一，因此可以从同行/列/宫的其他格子中排除a和b。排除后会产生新的裸单，继续连锁填满全盘。",highlightCells:[],highlightNums:[]}},
  boardData:finalBd,cages:CAGES,solution:SOLUTION,
  preDialog:{title:"显性数对教学关",body:"欢迎来到杀手数独进阶课堂！在这一关中，你将学习「显性数对」技巧。当你填完所有裸单和隐单后如果发现卡壳，不要急，仔细观察同一行/列/宫中是否有两个格子恰好只有相同的两个候选数——这就是显性数对！"},
  clearDialog:{title:"恭喜过关！",body:"你已经掌握了显性数对技巧！记住：当两个格子在同一单元（行/列/宫）中共享完全相同的两个候选数时，这两个数一定在这两个格子里，可以安全地从同单元其他格子中排除它们。"}
};
if(rep.info.breakthroughPair){
  level.triggers.nakedPair.highlightCells=rep.info.breakthroughPair.cells;
  level.triggers.nakedPair.highlightNums=rep.info.breakthroughPair.nums;
}
const jsonStr=JSON.stringify(level,null,2);
console.log('\n=== FULL JSON ===\n');
console.log(jsonStr);
const outPath=path.join(__dirname,'level701-new.json');
fs.writeFileSync(outPath,jsonStr,'utf-8');
console.log(`\nWritten to: ${outPath}`);
