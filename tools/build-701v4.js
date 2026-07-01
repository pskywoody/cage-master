/**
 * 构造701关v4：先生成纯数独盘面，再添加不泄露答案的笼子
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

function getCands(grid, r, c) {
  const used = new Set();
  for (let i = 0; i < 9; i++) { if (grid[r][i]!==0) used.add(grid[r][i]); }
  for (let i = 0; i < 9; i++) { if (grid[i][c]!==0) used.add(grid[i][c]); }
  const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
  for(let i=br;i<br+3;i++)for(let j=bc;j<bc+3;j++){if(grid[i][j]!==0)used.add(grid[i][j]);}
  const out=[]; for(let n=1;n<=9;n++)if(!used.has(n))out.push(n); return out;
}

function getCandsWithCages(grid, r, c, cageMap) {
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
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c]!==0) continue;
    const ca = cageMap ? getCandsWithCages(grid,r,c,cageMap) : getCands(grid,r,c);
    if (ca.length===1) return {r,c,num:ca[0]};
  }
  return null;
}

function findHS(grid, cageMap) {
  const gc = cageMap ? (r,c)=>getCandsWithCages(grid,r,c,cageMap) : (r,c)=>getCands(grid,r,c);
  for (let r = 0; r < 9; r++) {
    const pm=new Map();
    for(let c=0;c<9;c++){if(grid[r][c]!==0)continue;for(const n of gc(r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push(c);}}
    for(const[n,cs]of pm)if(cs.length===1)return{r,c:cs[0],num:n,type:'row'};
  }
  for (let c = 0; c < 9; c++) {
    const pm=new Map();
    for(let r=0;r<9;r++){if(grid[r][c]!==0)continue;for(const n of gc(r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push(r);}}
    for(const[n,rs]of pm)if(rs.length===1)return{r:rs[0],c,num:n,type:'col'};
  }
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){
    const pm=new Map();
    for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++){const r=br*3+dr,c=bc*3+dc;if(grid[r][c]!==0)continue;for(const n of gc(r,c)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push([r,c]);}}
    for(const[n,ps]of pm)if(ps.length===1)return{r:ps[0][0],c:ps[0][1],num:n,type:'box'};
  }
  return null;
}

function simulate(grid, cageMap) {
  const g = clone(grid);
  let filled=0;
  while(true) {
    const ns = findNS(g, cageMap);
    if (ns) { g[ns.r][ns.c]=ns.num; filled++; continue; }
    const hs = findHS(g, cageMap);
    if (hs) { g[hs.r][hs.c]=hs.num; filled++; continue; }
    break;
  }
  let empty=0; for(let r=0;r<9;r++)for(let c=0;c<9;c++)if(g[r][c]===0)empty++;
  return {grid:g, filled, empty};
}

function findNakedPairs(grid, cageMap) {
  const gc = cageMap ? (r,c)=>getCandsWithCages(grid,r,c,cageMap) : (r,c)=>getCands(grid,r,c);
  const pairs = [];
  const checkUnit = (cells, type) => {
    const bi=[];
    for(const[r,c]of cells){if(grid[r][c]!==0)continue;const ca=gc(r,c);if(ca.length===2)bi.push({r,c,nums:ca});}
    for(let i=0;i<bi.length;i++)for(let j=i+1;j<bi.length;j++){
      if(bi[i].nums[0]===bi[j].nums[0]&&bi[i].nums[1]===bi[j].nums[1]){
        const{nums}=bi[i];
        let determined=null;
        for(const[r,c]of cells){
          if((r===bi[i].r&&c===bi[i].c)||(r===bi[j].r&&c===bi[j].c)||grid[r][c]!==0)continue;
          const ca=gc(r,c);
          const filtered=ca.filter(n=>n!==nums[0]&&n!==nums[1]);
          if(filtered.length===1&&ca.length>1){determined={r,c,num:filtered[0]};break;}
        }
        if(determined)pairs.push({type,r1:bi[i].r,c1:bi[i].c,r2:bi[j].r,c2:bi[j].c,nums,determined});
      }
    }
  };
  for(let r=0;r<9;r++){const cells=[];for(let c=0;c<9;c++)cells.push([r,c]);checkUnit(cells,'row');}
  for(let c=0;c<9;c++){const cells=[];for(let r=0;r<9;r++)cells.push([r,c]);checkUnit(cells,'col');}
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){const cells=[];for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)cells.push([br*3+dr,bc*3+dc]);checkUnit(cells,'box');}
  return pairs;
}

// Search for good pure sudoku puzzle
console.log('搜索纯数独教学盘面...');
let best = null;

for (let attempt = 0; attempt < 100000; attempt++) {
  const keepCount = 28 + Math.floor(Math.random()*8);
  const positions = [];
  for(let r=0;r<9;r++)for(let c=0;c<9;c++)positions.push([r,c]);
  for(let i=positions.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[positions[i],positions[j]]=[positions[j],positions[i]];}
  
  const board = Array(9).fill(null).map(()=>Array(9).fill(0));
  for(let i=0;i<keepCount;i++){const[r,c]=positions[i];board[r][c]=solution[r][c];}
  
  let initialNS=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){if(board[r][c]!==0)continue;if(getCands(board,r,c).length===1)initialNS++;}
  if(initialNS<3||initialNS>5)continue;
  
  const sim = simulate(board, null);
  if(sim.empty===0)continue;
  if(sim.filled<10)continue;
  if(sim.empty<5)continue;
  
  const pairs = findNakedPairs(sim.grid, null);
  if(pairs.length===0)continue;
  
  for(const pair of pairs) {
    const testGrid = clone(sim.grid);
    testGrid[pair.determined.r][pair.determined.c] = pair.determined.num;
    const sim2 = simulate(testGrid, null);
    
    // Check correctness
    let wrong = false;
    for(let r=0;r<9;r++)for(let c=0;c<9;c++){
      if(sim2.grid[r][c]!==0&&sim2.grid[r][c]!==solution[r][c])wrong=true;
    }
    
    if(!wrong && sim2.empty===0) {
      best = {board, pair, sim, sim2, initialNS, keepCount};
      break;
    }
  }
  if(best)break;
}

if(!best){console.log('未找到');process.exit(1);}

console.log(`找到! 保留${best.keepCount}个给定, 初始裸单${best.initialNS}`);
console.log(`基础连锁: ${best.sim.filled}个, 卡壳${best.sim.empty}空格`);
const p = best.pair;
console.log(`数对: ${L[p.r1]}${p.c1+1}和${L[p.r2]}${p.c2+1}={${p.nums[0]},${p.nums[1]}} (${p.type})`);
console.log(`确定格: ${L[p.determined.r]}${p.determined.c+1}=${p.determined.num}`);
console.log(`多米诺收官: ${best.sim2.empty===0?'成功':'失败'}`);

v.printGrid(best.board);
console.log('\n卡壳盘面:');
v.printGrid(best.sim.grid);

// Now design cages that DON'T create extra naked singles
// Strategy: create larger cages (3-5 cells) that contain at least 2 empty cells,
// so cage sum doesn't immediately determine any single cell
console.log('\n=== 设计不泄露答案的笼子 ===');

function designSafeCages(board, sol) {
  // Region-growing approach: build cages of 3-4 cells
  const cages = [];
  const visited = Array(9).fill(null).map(()=>Array(9).fill(false));
  let cid = 1;
  
  function getAdj(r, c) {
    const adj = [];
    if(r>0&&!visited[r-1][c])adj.push([r-1,c]);
    if(r<8&&!visited[r+1][c])adj.push([r+1,c]);
    if(c>0&&!visited[r][c-1])adj.push([r,c-1]);
    if(c<8&&!visited[r][c+1])adj.push([r,c+1]);
    return adj;
  }
  
  function hasDup(cells) {
    const seen=new Set();
    for(const[r,c]of cells){if(seen.has(sol[r][c]))return true;seen.add(sol[r][c]);}
    return false;
  }
  
  function cageSum(cells) {
    let s=0; for(const[r,c]of cells)s+=sol[r][c]; return s;
  }
  
  // Count empty cells in a cage
  function emptyCount(cells) {
    let n=0; for(const[r,c]of cells)if(board[r][c]===0)n++; return n;
  }

  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if(visited[r][c])continue;
    
    const cells=[[r,c]];
    visited[r][c]=true;
    let frontier=getAdj(r,c);
    const targetSize=3+Math.floor(Math.random()*2); // 3 or 4
    
    while(cells.length<targetSize&&frontier.length>0){
      const idx=Math.floor(Math.random()*frontier.length);
      const[nr,nc]=frontier.splice(idx,1)[0];
      if(visited[nr][nc])continue;
      const testCells=[...cells,[nr,nc]];
      if(!hasDup(testCells)){
        cells.push([nr,nc]);
        visited[nr][nc]=true;
        for(const[ar,ac]of getAdj(nr,nc))if(!visited[ar][ac])frontier.push([ar,ac]);
      }
    }
    
    cages.push({id:cid++,sum:cageSum(cells),cells});
  }
  
  return cages;
}

// Try many cage layouts, find one that doesn't break the puzzle
let safeCages = null;
for(let attempt=0;attempt<2000;attempt++){
  const cages = designSafeCages(best.board, solution);
  
  // Verify cages
  let cageErr=false;
  for(const cage of cages){
    const seen=new Set();let s=0;
    for(const[r,c]of cage.cells){s+=solution[r][c];if(seen.has(solution[r][c]))cageErr=true;seen.add(solution[r][c]);}
    if(s!==cage.sum)cageErr=true;
  }
  if(cageErr)continue;
  
  const cageMap={cageCells:{},cellCage:{}};
  for(const cage of cages){
    cageMap.cageCells[cage.id]=cage.cells;
    for(const[r,c]of cage.cells)cageMap.cellCage[`${r},${c}`]=cage.id;
  }
  
  // Check initial naked singles count with cages
  let nsCount=0;
  for(let r=0;r<9;r++)for(let c=0;c<9;c++){
    if(best.board[r][c]!==0)continue;
    if(getCandsWithCages(best.board,r,c,cageMap).length===1)nsCount++;
  }
  if(nsCount<2||nsCount>6)continue;
  
  // Simulate with cages
  const simC = simulate(best.board, cageMap);
  if(simC.empty===0)continue; // Cages made it too easy
  if(simC.filled<8)continue;
  
  // Check for naked pairs with cages
  const pairsC = findNakedPairs(simC.grid, cageMap);
  if(pairsC.length===0)continue;
  
  // Try the pair
  for(const pair of pairsC) {
    const testG = clone(simC.grid);
    testG[pair.determined.r][pair.determined.c]=pair.determined.num;
    const sim2C = simulate(testG, cageMap);
    let wrong=false;
    for(let r=0;r<9;r++)for(let c=0;c<9;c++){
      if(sim2C.grid[r][c]!==0&&sim2C.grid[r][c]!==solution[r][c])wrong=true;
    }
    if(!wrong&&sim2C.empty===0){
      safeCages=cages;
      console.log(`找到安全笼子布局(尝试${attempt}): 初始裸单${nsCount}, 基础填${simC.filled}, 卡壳${simC.empty}空格, 数对存在, 多米诺成功`);
      break;
    }
  }
  if(safeCages)break;
}

if(!safeCages){
  console.log('❌ 未找到安全笼子布局，使用最简笼子（大区域笼）');
  // Fallback: use large cages covering whole boxes
  safeCages = [];
  let cid=1;
  for(let br=0;br<3;br++)for(let bc=0;bc<3;bc++){
    const cells=[];
    for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)cells.push([br*3+dr,bc*3+dc]);
    let s=0;for(const[r,c]of cells)s+=solution[r][c];
    safeCages.push({id:cid++,sum:s,cells});
  }
}

// Final validation with the KillerSudokuValidator
const cageMap={cageCells:{},cellCage:{}};
for(const cage of safeCages){
  cageMap.cageCells[cage.id]=cage.cells;
  for(const[r,c]of cage.cells)cageMap.cellCage[`${r},${c}`]=cage.id;
}

const testLevel = {
  boardData: best.board,
  cages: safeCages,
  solution: solution
};

const report = v.validate(testLevel, {maxInitialNaked:6, requireTechnique:'nakedPair'});
console.log('\n========== 最终验证报告 ==========');
console.log('合法:', report.valid);
console.log('初始裸单:', report.info.initialNakedSingles);
console.log('基础填:', report.info.beforePairFilled);
console.log('卡壳空格:', report.info.beforePairEmpty);
console.log('数对:', report.info.nakedPairsAtStuckPoint);
if(report.info.breakthroughPair){
  const bp=report.info.breakthroughPair;
  console.log('破局对:', bp.cells, '=', bp.nums, `(${bp.unit})`);
  console.log('多米诺:', bp.dominates?'是':'否');
}
if(report.errors.length){console.log('错误:');for(const e of report.errors)console.log(' -',e);}
if(report.warnings.length){console.log('警告:');for(const w of report.warnings)console.log(' -',w);}
for(const s of report.steps)console.log(' ',s);

// Save final level
const finalLevel = {
  levelId: 701,
  title: "第1关：数对之锁",
  gridSize: 9,
  difficulty: "中等",
  teachingGoal: "学习显性数对（Naked Pair）：当同一区域两个格子恰好只能填入相同的两个数字时，这两个数字可以从该区域其他格子中排除。",
  features: {
    allowDraft: true,
    assistant45: true,
    showHints: true,
    perspectiveMode: true,
    highlightRow: true,
    highlightCol: true,
    highlightBox: true,
    highlightNumber: true,
    highlightCage: true
  },
  boardData: best.board,
  cages: safeCages,
  solution: solution,
  breakthroughCell: [best.pair.determined.r, best.pair.determined.c],
  pairCells: [[best.pair.r1, best.pair.c1], [best.pair.r2, best.pair.c2]],
  pairNums: best.pair.nums
};

fs.writeFileSync('d:/killersudoku/tools/level701-final.json', JSON.stringify(finalLevel, null, 2));
console.log('\n✅ 已保存到 tools/level701-final.json');
