/**
 * 构造701关v5：使用9宫格作为笼子（每宫sum=45），等价于纯数独
 * 这样笼子约束不提供额外信息，数对只能由标准数独规则产生
 */
const fs = require('fs');
const { KillerSudokuValidator } = require('./puzzle-validator');
const v = new KillerSudokuValidator();
const L = 'ABCDEFGHI';

const solution = [
  [3,4,5,8,2,1,6,7,9],
  [1,9,2,7,6,5,4,3,8],
  [8,6,7,9,4,3,1,2,5],
  [6,1,3,4,5,9,2,8,7],
  [4,5,9,2,8,7,3,1,6],
  [7,2,8,1,3,6,5,9,4],
  [9,7,6,3,1,4,8,5,2],
  [2,3,4,5,9,8,7,6,1],
  [5,8,1,6,7,2,9,4,3]
];

function clone(g){return g.map(r=>[...r]);}

function getCands(grid, r, c, cageMap) {
  const used = new Set();
  for (let i = 0; i < 9; i++) { if (grid[r][i]!==0) used.add(grid[r][i]); }
  for (let i = 0; i < 9; i++) { if (grid[i][c]!==0) used.add(grid[i][c]); }
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let i=br;i<br+3;i++)for(let j=bc;j<bc+3;j++){if(grid[i][j]!==0)used.add(grid[i][j]);}
  if (cageMap) {
    const cid = cageMap.cellCage[`${r},${c}`];
    if (cid !== undefined && cageMap.cageCells[cid]) {
      for (const [cr,cc] of cageMap.cageCells[cid]) { if (grid[cr][cc]!==0) used.add(grid[cr][cc]); }
    }
  }
  const out=[]; for(let n=1;n<=9;n++)if(!used.has(n))out.push(n); return out;
}

function findNS(grid, cageMap) {
  for (let r=0;r<9;r++)for(let c=0;c<9;c++){
    if(grid[r][c]!==0)continue;
    if(getCands(grid,r,c,cageMap).length===1)return{r,c,num:getCands(grid,r,c,cageMap)[0]};
  }
  return null;
}

function findHS(grid, cageMap) {
  for(let r=0;r<9;r++){
    const pm=new Map();
    for(let c=0;c<9;c++){if(grid[r][c]!==0)continue;for(const n of getCands(grid,r,c,cageMap)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push(c);}}
    for(const[n,cs]of pm)if(cs.length===1)return{r,c:cs[0],num:n,type:'row'};
  }
  for(let c=0;c<9;c++){
    const pm=new Map();
    for(let r=0;r<9;r++){if(grid[r][c]!==0)continue;for(const n of getCands(grid,r,c,cageMap)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push(r);}}
    for(const[n,rs]of pm)if(rs.length===1)return{r:rs[0],c,num:n,type:'col'};
  }
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){
    const pm=new Map();
    for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++){const r=br*3+dr,c=bc*3+dc;if(grid[r][c]!==0)continue;for(const n of getCands(grid,r,c,cageMap)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push([r,c]);}}
    for(const[n,ps]of pm)if(ps.length===1)return{r:ps[0][0],c:ps[0][1],num:n,type:'box'};
  }
  // Cage HS
  if(cageMap){
    for(const cid of Object.keys(cageMap.cageCells)){
      const cells=cageMap.cageCells[cid];
      const pm=new Map();
      for(const[r,c]of cells){if(grid[r][c]!==0)continue;for(const n of getCands(grid,r,c,cageMap)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push([r,c]);}}
      for(const[n,ps]of pm)if(ps.length===1)return{r:ps[0][0],c:ps[0][1],num:n,type:'cage'};
    }
  }
  return null;
}

function simulate(grid, cageMap) {
  const g=clone(grid);let filled=0;const log=[];
  while(true){
    const ns=findNS(g,cageMap);
    if(ns){g[ns.r][ns.c]=ns.num;filled++;log.push(`${L[ns.r]}${ns.c+1}=${ns.num}(N)`);continue;}
    const hs=findHS(g,cageMap);
    if(hs){g[hs.r][hs.c]=hs.num;filled++;log.push(`${L[hs.r]}${hs.c+1}=${hs.num}(H:${hs.type})`);continue;}
    break;
  }
  let empty=0;for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(g[r][c]===0)empty++;
  return{grid:g,filled,empty,log};
}

function findNakedPairs(grid,cageMap){
  const pairs=[];
  const checkUnit=(cells,type)=>{
    const bi=[];
    for(const[r,c]of cells){if(grid[r][c]!==0)continue;const ca=getCands(grid,r,c,cageMap);if(ca.length===2)bi.push({r,c,nums:ca});}
    for(let i=0;i<bi.length;i++)for(let j=i+1;j<bi.length;j++){
      if(bi[i].nums[0]===bi[j].nums[0]&&bi[i].nums[1]===bi[j].nums[1]){
        const{nums}=bi[i];let det=null;
        for(const[r,c]of cells){
          if((r===bi[i].r&&c===bi[i].c)||(r===bi[j].r&&c===bi[j].c)||grid[r][c]!==0)continue;
          const ca=getCands(grid,r,c,cageMap);
          const f=ca.filter(n=>n!==nums[0]&&n!==nums[1]);
          if(f.length===1&&ca.length>1){det={r,c,num:f[0]};break;}
        }
        if(det)pairs.push({type,r1:bi[i].r,c1:bi[i].c,r2:bi[j].r,c2:bi[j].c,nums,det});
      }
    }
  };
  for(let r=0;r<9;r++){const cells=[];for(let c=0;c<9;c++)cells.push([r,c]);checkUnit(cells,'row');}
  for(let c=0;c<9;c++){const cells=[];for(let r=0;r<9;r++)cells.push([r,c]);checkUnit(cells,'col');}
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){const cells=[];for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)cells.push([br*3+dr,bc*3+dc]);checkUnit(cells,'box');}
  return pairs;
}

// Use 9 box-cages (each 3x3 box, sum=45) - equivalent to pure sudoku
const boxCages = [];
let cid = 1;
for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){
  const cells=[];
  for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)cells.push([br*3+dr,bc*3+dc]);
  boxCages.push({id:cid++,sum:45,cells});
}
const boxCageMap={cageCells:{},cellCage:{}};
for(const cage of boxCages){
  boxCageMap.cageCells[cage.id]=cage.cells;
  for(const[r,c]of cage.cells)boxCageMap.cellCage[`${r},${c}`]=cage.id;
}

console.log('=== 使用9宫笼(s=45)搜索纯数独教学盘面 ===');

let best=null;
for(let attempt=0;attempt<200000;attempt++){
  const keepCount=28+Math.floor(Math.random()*8);
  const positions=[];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)positions.push([r,c]);
  for(let i=positions.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[positions[i],positions[j]]=[positions[j],positions[i]];}
  const board=Array(9).fill(null).map(()=>Array(9).fill(0));
  for(let i=0;i<keepCount;i++){const[r,c]=positions[i];board[r][c]=solution[r][c];}
  
  let ns0=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){if(board[r][c]!==0)continue;if(getCands(board,r,c,boxCageMap).length===1)ns0++;}
  if(ns0<3||ns0>5)continue;
  
  const sim=simulate(board,boxCageMap);
  if(sim.empty===0)continue;
  if(sim.filled<10)continue;
  if(sim.empty<3)continue;
  
  const pairs=findNakedPairs(sim.grid,boxCageMap);
  if(pairs.length===0)continue;
  
  for(const pair of pairs){
    const tg=clone(sim.grid);
    tg[pair.det.r][pair.det.c]=pair.det.num;
    const sim2=simulate(tg,boxCageMap);
    let wrong=false;
    for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(sim2.grid[r][c]!==0&&sim2.grid[r][c]!==solution[r][c])wrong=true;
    if(!wrong&&sim2.empty===0){
      best={board,pair,sim,sim2,ns0,keepCount};
      break;
    }
  }
  if(best)break;
}

if(!best){console.log('❌ 未找到');process.exit(1);}

console.log(`✅ 找到! 保留${best.keepCount}给定, 初始裸单${best.ns0}`);
console.log(`基础连锁: ${best.sim.filled}个, 卡壳${best.sim.empty}空格`);
const p=best.pair;
console.log(`数对: ${L[p.r1]}${p.c1+1}和${L[p.r2]}${p.c2+1}={${p.nums[0]},${p.nums[1]}}(${p.type})`);
console.log(`确定: ${L[p.det.r]}${p.det.c+1}=${p.det.num}`);
console.log(`多米诺: ${best.sim2.empty===0?'成功':'失败('+best.sim2.empty+'空格)'}`);

console.log('\n初始盘面:');
v.printGrid(best.board);
console.log('\n卡壳盘面:');
v.printGrid(best.sim.grid);

// Now design BETTER cages (not just 9-box cages). 
// Strategy: Overlay interesting cages on top of the 9-box solution.
// Since box-cages don't add constraints, I'll design additional killer-cage-like shapes
// by merging adjacent cells within boxes, ensuring:
// 1. No duplicate numbers in any cage
// 2. Sum is correct
// 3. Cages span across box boundaries where possible to look like real killer sudoku
// 4. But cages are designed so they don't give away naked singles via cage-sum

// For simplicity, let me use a real killer sudoku cage layout.
// I'll design cages by hand to look natural.
function designKillerCages(board, sol) {
  // Hand-designed cage layout for a natural killer sudoku look
  // I'll create L-shaped and straight cages of 2-4 cells
  const cages = [];
  const visited = Array(9).fill(null).map(()=>Array(9).fill(false));
  let nextId = 1;
  
  function addCage(cells) {
    let sum = 0;
    const seen = new Set();
    for (const [r,c] of cells) {
      if (visited[r][c]) return false;
      if (seen.has(sol[r][c])) return false;
      seen.add(sol[r][c]);
      sum += sol[r][c];
    }
    for (const [r,c] of cells) visited[r][c] = true;
    cages.push({id: nextId++, sum, cells});
    return true;
  }
  
  // Design cages row by row, creating natural-looking shapes
  // Row A: A1-A2-A3, A4-A5-A6, A7-A8-A9 (all horizontal triplets within boxes)
  // But need to check for duplicates
  
  // Let me use a systematic approach: greedy region growing with 2-3 cells
  const shapes = [
    // Horizontal pairs and triplets
    [[0,0],[0,1]], [[0,2],[1,2]], // top-left area
    [[0,3],[0,4],[1,4]], // top-middle
    [[0,5],[1,5],[0,6]], // crossing center
    [[0,7],[0,8],[1,8]], // top-right
    [[1,0],[2,0],[2,1]], // left
    [[1,1]],  // single leftover (avoid if possible)
    [[1,3],[2,3],[2,4]], // middle-top
    [[1,6],[1,7],[2,7]], // right
    [[2,2],[3,2]], // crossing to D
    [[2,5],[2,6],[3,6]], // right-middle
    [[2,8],[3,8]], // far right edge
  ];
  
  // Actually this is getting too complex. Let me use a proven safe approach:
  // Design cages that are ALL 2-cell horizontal pairs within the same row,
  // PLUS connect some vertically to make 3-cell L-shapes.
  // The key constraint: no two cells in a cage can have the same solution number.
  
  // Simplest safe approach: just pair adjacent cells horizontally if they have different numbers,
  // else pair vertically.
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (visited[r][c]) continue;
      
      // Try horizontal pair
      if (c < 8 && !visited[r][c+1] && sol[r][c] !== sol[r][c+1]) {
        addCage([[r,c],[r,c+1]]);
      } else if (r < 8 && !visited[r+1][c] && sol[r][c] !== sol[r+1][c]) {
        // Try vertical pair
        addCage([[r,c],[r+1,c]]);
      } else {
        // Single cell cage (sum = answer)
        addCage([[r,c]]);
      }
    }
  }
  
  // Check for single-cell cages on empty cells (those give away the answer!)
  let badSingles = 0;
  for (const cage of cages) {
    if (cage.cells.length === 1) {
      const [r,c] = cage.cells[0];
      if (board[r][c] === 0) badSingles++;
    }
  }
  
  return { cages, badSingles };
}

// Actually, single-cell cages on empty cells reveal the answer (sum = the number).
// For empty cells, I MUST put them in multi-cell cages.
// Let me write a better cage designer that guarantees:
// 1. Every empty cell is in a cage of size >= 2
// 2. No duplicate numbers in any cage
// 3. Cages are connected (adjacent cells)
// 4. Cage sums are correct

function designProperCages(board, sol) {
  const cages = [];
  const visited = Array(9).fill(null).map(()=>Array(9).fill(false));
  let nextId = 1;
  
  function isEmpty(r,c) { return board[r][c] === 0; }
  
  function getAdj(r,c) {
    const adj = [];
    if(r>0&&!visited[r-1][c])adj.push([r-1,c]);
    if(r<8&&!visited[r+1][c])adj.push([r+1,c]);
    if(c>0&&!visited[r][c-1])adj.push([r,c-1]);
    if(c<8&&!visited[r][c+1])adj.push([r,c+1]);
    return adj;
  }
  
  function canAdd(cells, r, c) {
    if (visited[r][c]) return false;
    const seen = new Set();
    for (const [cr,cc] of cells) seen.add(sol[cr][cc]);
    return !seen.has(sol[r][c]);
  }
  
  // First, ensure all empty cells are placed in cages of size >= 2
  // Process empty cells first
  const emptyCells = [];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(isEmpty(r,c))emptyCells.push([r,c]);
  
  for (const [r,c] of emptyCells) {
    if (visited[r][c]) continue;
    
    const cells = [[r,c]];
    visited[r][c] = true;
    
    // Add at least 1 more cell (preferably another empty cell, or a given)
    let frontier = getAdj(r,c);
    let targetSize = 2 + Math.floor(Math.random()*2); // 2 or 3
    
    while (cells.length < targetSize && frontier.length > 0) {
      const idx = Math.floor(Math.random()*frontier.length);
      const [nr,nc] = frontier.splice(idx,1)[0];
      if (visited[nr][nc]) continue;
      if (canAdd(cells, nr, nc)) {
        cells.push([nr,nc]);
        visited[nr][nc] = true;
        for (const [ar,ac] of getAdj(nr,nc)) if (!visited[ar][ac]) frontier.push([ar,ac]);
      }
    }
    
    let sum = 0;
    for (const [cr,cc] of cells) sum += sol[cr][cc];
    cages.push({id: nextId++, sum, cells});
  }
  
  // Now fill remaining visited=false cells (all givens) with any valid grouping
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if(visited[r][c])continue;
    const cells=[[r,c]];visited[r][c]=true;
    // Try to add a neighbor
    const adj=getAdj(r,c);
    for(const[nr,nc]of adj){
      if(!visited[nr][nc]&&canAdd(cells,nr,nc)){
        cells.push([nr,nc]);visited[nr][nc]=true;
        if(cells.length>=2)break;
      }
    }
    let sum=0;for(const[cr,cc]of cells)sum+=sol[cr][cc];
    cages.push({id:nextId++,sum,cells});
  }
  
  // Verify
  let errors=0;
  for(const cage of cages){
    const seen=new Set();let s=0;
    for(const[r,c]of cage.cells){
      if(seen.has(sol[r][c]))errors++;
      seen.add(sol[r][c]);s+=sol[r][c];
    }
    if(s!==cage.sum)errors++;
    // Check empty cells not in single-cell cages
    if(cage.cells.length===1 && isEmpty(cage.cells[0][0],cage.cells[0][1]))errors++;
  }
  
  // Verify all cells covered
  let covered=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(visited[r][c])covered++;
  
  return {cages, errors, covered};
}

// Try multiple cage layouts
let goodCages = null;
for(let i=0;i<5000;i++){
  const {cages,errors,covered} = designProperCages(best.board, solution);
  if(errors>0||covered!==81)continue;
  
  const cm={cageCells:{},cellCage:{}};
  for(const cage of cages){cm.cageCells[cage.id]=cage.cells;for(const[r,c]of cage.cells)cm.cellCage[`${r},${c}`]=cage.id;}
  
  // Check initial NS count with these cages
  let ns=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){if(best.board[r][c]!==0)continue;if(getCands(best.board,r,c,cm).length===1)ns++;}
  if(ns<2||ns>6)continue;
  
  const sim=simulate(best.board,cm);
  if(sim.empty===0)continue;
  if(sim.filled<8)continue;
  
  const pairs=findNakedPairs(sim.grid,cm);
  if(pairs.length===0)continue;
  
  for(const pair of pairs){
    const tg=clone(sim.grid);
    tg[pair.det.r][pair.det.c]=pair.det.num;
    const sim2=simulate(tg,cm);
    let wrong=false;
    for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(sim2.grid[r][c]!==0&&sim2.grid[r][c]!==solution[r][c])wrong=true;
    if(!wrong&&sim2.empty===0){
      goodCages={cages,pair:pair,sim,sim2,ns};
      break;
    }
  }
  if(goodCages)break;
}

if(!goodCages){
  console.log('⚠️ 未能设计出满足条件的复杂笼子，降级使用9宫笼');
  goodCages={cages:boxCages,pair:best.pair,sim:best.sim,sim2:best.sim2,ns:best.ns0};
}

console.log(`\n笼子数量: ${goodCages.cages.length}`);

// Final validation
const testLevel={boardData:best.board,cages:goodCages.cages,solution};
const report=v.validate(testLevel,{maxInitialNaked:6,requireTechnique:'nakedPair'});
console.log('\n========== 最终验证 ==========');
console.log('合法:',report.valid);
console.log('初始裸单:',report.info.initialNakedSingles);
console.log('基础填:',report.info.beforePairFilled);
console.log('卡壳空格:',report.info.beforePairEmpty);
console.log('数对:',report.info.nakedPairsAtStuckPoint);
if(report.info.breakthroughPair){
  const bp=report.info.breakthroughPair;
  console.log('破局对:',bp.cells,'=',bp.nums,`(${bp.unit})`);
  console.log('多米诺收官:',bp.dominates?'是':'否');
}
if(report.errors.length){console.log('❌ 错误:');for(const e of report.errors)console.log(' -',e);}
for(const s of report.steps)console.log(' ',s);

if(!report.valid){
  console.log('\n验证未通过，降级使用9宫笼方案');
  const testLevel2={boardData:best.board,cages:boxCages,solution};
  const r2=v.validate(testLevel2,{maxInitialNaked:6,requireTechnique:'nakedPair'});
  console.log('9宫笼方案合法:',r2.valid);
  console.log('初始裸单:',r2.info.initialNakedSingles);
  if(r2.info.breakthroughPair){
    console.log('破局对:',r2.info.breakthroughPair.cells,'=',r2.info.breakthroughPair.nums);
    console.log('多米诺:',r2.info.breakthroughPair.dominates?'是':'否');
  }
  if(r2.errors.length){for(const e of r2.errors)console.log(' -',e);}
}

// Output the final level JSON
const useCages = report.valid ? goodCages.cages : boxCages;
const finalPair = report.valid ? (report.info.breakthroughPair ? {
  r1: 0, c1: 0, r2: 0, c2: 0, nums: []
} : null) : null;

// Determine breakthrough cell from simulation
const cm={cageCells:{},cellCage:{}};
for(const cage of useCages){cm.cageCells[cage.id]=cage.cells;for(const[r,c]of cage.cells)cm.cellCage[`${r},${c}`]=cage.id;}
const simFinal=simulate(best.board,cm);
const pairsFinal=findNakedPairs(simFinal.grid,cm);
let finalBreakthrough=null;
for(const pair of pairsFinal){
  const tg=clone(simFinal.grid);
  tg[pair.det.r][pair.det.c]=pair.det.num;
  const sim2=simulate(tg,cm);
  let wrong=false;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(sim2.grid[r][c]!==0&&sim2.grid[r][c]!==solution[r][c])wrong=true;
  if(!wrong&&sim2.empty===0){finalBreakthrough=pair;break;}
}

console.log('\n=== 最终配置 ===');
if(finalBreakthrough){
  console.log(`数对: ${L[finalBreakthrough.r1]}${finalBreakthrough.c1+1}(${solution[finalBreakthrough.r1][finalBreakthrough.c1]}), ${L[finalBreakthrough.r2]}${finalBreakthrough.c2+1}(${solution[finalBreakthrough.r2][finalBreakthrough.c2]}) = {${finalBreakthrough.nums[0]},${finalBreakthrough.nums[1]}}`);
  console.log(`破局点: ${L[finalBreakthrough.det.r]}${finalBreakthrough.det.c+1} = ${finalBreakthrough.det.num}`);
}

const output = {
  levelId:701,
  title:"第1关：数对之锁",
  gridSize:9,
  difficulty:"中等",
  teachingGoal:"学习显性数对（Naked Pair）：当同一区域两个格子恰好只能填入相同的两个数字时，这两个数字可以从该区域其他格子中排除。",
  features:{allowDraft:true,assistant45:true,showHints:true,perspectiveMode:true,highlightRow:true,highlightCol:true,highlightBox:true,highlightNumber:true,highlightCage:true},
  boardData:best.board,
  cages:useCages,
  solution:solution,
  _debug:{
    initialNakedSingles:report.valid?report.info.initialNakedSingles:best.ns0,
    basicFilled:report.valid?report.info.beforePairFilled:best.sim.filled,
    stuckEmpty:report.valid?report.info.beforePairEmpty:best.sim.empty,
    breakthroughCell:finalBreakthrough?[finalBreakthrough.det.r,finalBreakthrough.det.c]:null,
    pairCells:finalBreakthrough?[[finalBreakthrough.r1,finalBreakthrough.c1],[finalBreakthrough.r2,finalBreakthrough.c2]]:null,
    pairNums:finalBreakthrough?finalBreakthrough.nums:null
  }
};

fs.writeFileSync('d:/killersudoku/tools/level701-final.json',JSON.stringify(output,null,2));
console.log('\n✅ 保存到 tools/level701-final.json');
console.log('\nboardData:');
console.log(JSON.stringify(best.board));
console.log('\ncages count:', useCages.length);
