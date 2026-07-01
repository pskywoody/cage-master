/**
 * search-final.js: 综合搜索（快速版）
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require('./puzzle-validator.js');

const v = new KillerSudokuValidator();

function generateFullSolution(size, boxH, boxW) {
  const grid = Array.from({length:size},()=>Array(size).fill(0));
  function ivp(r,c,n){for(let i=0;i<size;i++){if(grid[r][i]===n)return false;if(grid[i][c]===n)return false;}const bR=Math.floor(r/boxH)*boxH,bC=Math.floor(c/boxW)*boxW;for(let i=bR;i<bR+boxH;i++)for(let j=bC;j<bC+boxW;j++)if(grid[i][j]===n)return false;return true;}
  function fc(idx){if(idx>=size*size)return true;const r=Math.floor(idx/size),c=idx%size;const ns=[];for(let n=1;n<=size;n++)ns.push(n);for(let i=ns.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ns[i],ns[j]]=[ns[j],ns[i]];}for(const n of ns){if(ivp(r,c,n)){grid[r][c]=n;if(fc(idx+1))return true;grid[r][c]=0;}}return false;}
  fc(0);return grid;
}

function generateCages(sol, size) {
  const covered = Array.from({length:size},()=>Array(size).fill(false));
  const cages = [];
  let cid = 1;
  function nbrs(r,c){const o=[];for(const[dr,dc]of[[0,1],[1,0],[0,-1],[-1,0]]){const nr=r+dr,nc=c+dc;if(nr>=0&&nr<size&&nc>=0&&nc<size&&!covered[nr][nc])o.push([nr,nc]);}return o;}
  function ps(){const r=Math.random();if(r<0.1)return 1;if(r<0.5)return 2;if(r<0.85)return 3;return 4;}
  for(let r=0;r<size;r++)for(let c=0;c<size;c++){
    if(covered[r][c])continue;
    const t=ps();
    const cells=[[r,c]];const vs=new Set([sol[r][c]]);covered[r][c]=true;
    while(cells.length<t){
      const f=[];
      for(const[cr,cc]of cells)for(const[nr,nc]of nbrs(cr,cc)){
        if(f.some(x=>x[0]===nr&&x[1]===nc))continue;
        if(vs.has(sol[nr][nc]))continue;
        f.push([nr,nc]);
      }
      if(!f.length)break;
      const p=f[Math.floor(Math.random()*f.length)];
      cells.push(p);vs.add(sol[p[0]][p[1]]);covered[p[0]][p[1]]=true;
    }
    let s=0;for(const[cr,cc]of cells)s+=sol[cr][cc];
    cages.push({id:cid++,sum:s,cells});
  }
  return cages;
}

function evalLevel(sol, cages, bd) {
  const cim={},cci={};
  for(const c of cages){cim[c.id]=c.cells;for(const[r,cc]of c.cells)cci[`${r},${cc}`]=c.id;}
  v._cageIdToCells=cim;v._cellCageId=cci;
  return v.validate({boardData:bd,cages,solution:sol},{maxInitialNaked:5,requireTechnique:'nakedPair'});
}

function score(rep, gc) {
  if(!rep)return-1e9;
  let s=0;
  if(rep.valid)s+=10000;
  const ns=rep.info.initialNakedSingles||0;
  if(ns>=3&&ns<=5)s+=1000;else s-=Math.abs(ns-4)*200;
  if(rep.info.beforePairEmpty===0)s-=5000;else s+=200;
  const np=rep.info.nakedPairsAtStuckPoint||0;
  if(np>=1&&np<=10)s+=500;
  if(rep.info.breakthroughPair)s+=2000;
  if(rep.info.dominoComplete)s+=5000;
  if(gc>=30&&gc<=35)s+=500;else s-=Math.abs(gc-33)*50;
  s-=rep.errors.length*500;
  return s;
}

function searchGivens(sol, cages, tg) {
  const forced=new Set();
  const opt=[];
  for(const cg of cages){if(cg.cells.length===1)forced.add(`${cg.cells[0][0]},${cg.cells[0][1]}`);}
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!forced.has(`${r},${c}`))opt.push([r,c]);
  if(forced.size>tg)return null;
  const need=tg-forced.size;
  if(need>opt.length)return null;
  
  function mkBd(extra){
    const bd=sol.map(row=>row.slice());
    const gs=new Set(forced);
    for(const[r,c]of extra)gs.add(`${r},${c}`);
    for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(!gs.has(`${r},${c}`))bd[r][c]=0;
    return bd;
  }
  
  let bestSc=-1e10,bestBd=null,bestRep=null;
  // Try multiple random starts
  for(let restart=0;restart<3;restart++){
    const sh=opt.slice().sort(()=>Math.random()-0.5);
    let extra=sh.slice(0,need);
    let bd=mkBd(extra);
    let rep=evalLevel(sol,cages,bd);
    let bs=score(rep,tg);
    
    for(let it=0;it<1500;it++){
      const ne=extra.slice();
      const ri=Math.floor(Math.random()*ne.length);
      const ng=opt.filter(([r,c])=>!ne.some(([r2,c2])=>r2===r&&c2===c));
      if(!ng.length)continue;
      const ad=ng[Math.floor(Math.random()*ng.length)];
      ne[ri]=ad;
      const nbd=mkBd(ne);
      const nrep=evalLevel(sol,cages,nbd);
      const ns=score(nrep,tg);
      if(ns>bs){bs=ns;bd=nbd;rep=nrep;extra=ne;}
    }
    if(bs>bestSc){bestSc=bs;bestBd=bd;bestRep=rep;}
    if(bestRep&&bestRep.valid&&bestRep.info.dominoComplete&&bestRep.info.breakthroughPair)break;
  }
  return {success:bestRep&&bestRep.valid&&bestRep.info.dominoComplete&&bestRep.info.breakthroughPair,bd:bestBd,report:bestRep,cages,score:bestSc};
}

// Main
let best=null;
const MAX=100;
for(let r=0;r<MAX;r++){
  const sol=generateFullSolution(9,3,3);
  for(let cg=0;cg<4;cg++){
    const cages=generateCages(sol,9);
    for(const tg of [31,32,33,34]){
      const res=searchGivens(sol,cages,tg);
      if(!res)continue;
      if(res.success){
        console.log(`\n*** FOUND! round=${r} cg=${cg} tg=${tg} ***`);
        v.printGrid(res.bd);
        console.log('Info:',JSON.stringify(res.report.info,null,2));
        console.log('Steps:');res.report.steps.forEach(s=>console.log(' ',s));
        const out={levelId:701,title:'第1关：数对之锁',gridSize:9,difficulty:'中等',
          teachingGoal:'学习显性数对（Naked Pair）：当同一行/列/宫中两个格子恰好只能填入相同的两个数字时，这两个数字可以从该区域其他格子中排除。',
          features:{allowDraft:true,assistant45:true,showHints:true,perspectiveMode:true,highlightRow:true,highlightCol:true,highlightBox:true,highlightNumber:true,highlightCage:true},
          boardData:res.bd,cages:res.cages,solution:sol,
          triggers:[
            {condition:"onLevelStart",type:"freeze_mask",highlight:"full",text:"第一卷「数对之锁」：观察盘面，先把所有能一眼看出的裸单填上。填到推不动的时候，就需要「显性数对」。",once:true},
            {condition:"onFillCountReached",count:15,type:"enter_phase",phase:"breakthrough",once:true},
            {condition:"onStuckForSeconds",seconds:20,type:"enter_phase",phase:"breakthrough",once:true},
            {condition:"onStuckForSeconds",seconds:30,type:"popup_hint",position:"top",text:"💡 用候选数笔记标记每个空格的可能数字。当两个格子恰好只能填相同的两个数字时，就形成了「数对」——这两个数字可以从同行/列/宫的其他格子中排除。",delay:500},
            {condition:"onFillCountReached",count:30,type:"enter_phase",phase:"finishing",once:true}
          ],
          preDialog:[
            {speaker:"守笼人",text:"第一卷：「数对之锁」。这是最基础的高阶技巧，也是一切后续推演的根基。"},
            {speaker:"守笼人",text:"当某一行、列或宫中，有两个格子恰好都只能填入相同的两个数字时，这两个格子就形成了一把「锁」。"},
            {speaker:"阿岩",text:"两个格子都只能是那两个数字，不管怎么分配，这一行的其他格子就都不能是这两个数字了！"},
            {speaker:"守笼人",text:"正是如此。这就是「显性数对」——它锁住了那两个数字，让你可以安全地从其他候选中排除它们。"}
          ],
          clearDialog:[
            {speaker:"阿岩",text:"太妙了！找到数对之后，排除掉不可能的数字，盘面一下子就清晰了！"},
            {speaker:"守笼人",text:"数对是所有高阶技巧的基础。掌握它，你就迈出了通往星辰梭的第一步。"}
          ],isBoss:false
        };
        fs.writeFileSync(path.join(__dirname,'level701-new.json'),JSON.stringify(out,null,2),'utf8');
        console.log('\n========== 完整JSON输出 ==========');
        console.log(JSON.stringify(out,null,2));
        console.log('\n已写入 level701-new.json');
        process.exit(0);
      }
      if(!best||res.score>best.score)best=res;
    }
  }
  if(r%10===0&&best){
    console.log(`r=${r} best.score=${best.score} valid=${best.report.valid} NS=${best.report.info.initialNakedSingles} empty=${best.report.info.beforePairEmpty} pairs=${best.report.info.nakedPairsAtStuckPoint} bt=${!!best.report.info.breakthroughPair} dom=${best.report.info.dominoComplete} errs=${best.report.errors.slice(0,1)}`);
  }
}
console.log('\nBest not good enough:');
console.log('Score:',best.score);
if(best.bd)v.printGrid(best.bd);
console.log('Info:',JSON.stringify(best.report.info,null,2));
console.log('Errors:',best.report.errors);
