/**
 * 系统化搜索显性数对教学盘面
 * 方法：从完整解出发，随机移除givens，直到满足教学条件
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
  for (let i = 0; i < 9; i++) { if (grid[r][i] !== 0) used.add(grid[r][i]); }
  for (let i = 0; i < 9; i++) { if (grid[i][c] !== 0) used.add(grid[i][c]); }
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  for (let i = br; i < br+3; i++) for (let j = bc; j < bc+3; j++) { if (grid[i][j] !== 0) used.add(grid[i][j]); }
  if (cageMap) {
    const cid = cageMap.cellCage[`${r},${c}`];
    if (cid !== undefined && cageMap.cageCells[cid]) {
      for (const [cr,cc] of cageMap.cageCells[cid]) { if (grid[cr][cc] !== 0) used.add(grid[cr][cc]); }
    }
  }
  const out = []; for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n); return out;
}

function findNS(grid, cageMap) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] !== 0) continue;
    const ca = getCands(grid, r, c, cageMap);
    if (ca.length === 1) return {r, c, num: ca[0]};
  }
  return null;
}

function findHS(grid, cageMap) {
  for (let r = 0; r < 9; r++) {
    const pm = new Map();
    for (let c = 0; c < 9; c++) { if (grid[r][c] !== 0) continue; for (const n of getCands(grid,r,c,cageMap)) { if(!pm.has(n))pm.set(n,[]); pm.get(n).push(c); } }
    for (const [n,cs] of pm) if (cs.length===1) return {r,c:cs[0],num:n,type:'row'};
  }
  for (let c = 0; c < 9; c++) {
    const pm = new Map();
    for (let r = 0; r < 9; r++) { if (grid[r][c] !== 0) continue; for (const n of getCands(grid,r,c,cageMap)) { if(!pm.has(n))pm.set(n,[]); pm.get(n).push(r); } }
    for (const [n,rs] of pm) if (rs.length===1) return {r:rs[0],c,num:n,type:'col'};
  }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const pm = new Map();
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) { const r=br*3+dr,c=bc*3+dc; if(grid[r][c]!==0)continue; for(const n of getCands(grid,r,c,cageMap)){if(!pm.has(n))pm.set(n,[]);pm.get(n).push([r,c]);} }
    for (const [n,ps] of pm) if (ps.length===1) return {r:ps[0][0],c:ps[0][1],num:n,type:'box'};
  }
  return null;
}

function simulate(grid, cageMap) {
  const g = clone(grid);
  let filled = 0;
  const log = [];
  while (true) {
    const ns = findNS(g, cageMap);
    if (ns) { g[ns.r][ns.c] = ns.num; filled++; log.push(`${L[ns.r]}${ns.c+1}=${ns.num}(N)`); continue; }
    const hs = findHS(g, cageMap);
    if (hs) { g[hs.r][hs.c] = hs.num; filled++; log.push(`${L[hs.r]}${hs.c+1}=${hs.num}(H)`); continue; }
    break;
  }
  let empty = 0; for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (g[r][c] === 0) empty++;
  return {grid: g, filled, empty, log};
}

function findNakedPairs(grid, cageMap) {
  const pairs = [];
  const checkUnit = (cells, type) => {
    const bi = [];
    for (const [r,c] of cells) { if (grid[r][c] !== 0) continue; const ca = getCands(grid,r,c,cageMap); if (ca.length===2) bi.push({r,c,nums:ca}); }
    for (let i = 0; i < bi.length; i++) for (let j = i+1; j < bi.length; j++) {
      if (bi[i].nums[0]===bi[j].nums[0] && bi[i].nums[1]===bi[j].nums[1]) {
        const {nums} = bi[i];
        let determined = null;
        for (const [r,c] of cells) {
          if ((r===bi[i].r&&c===bi[i].c)||(r===bi[j].r&&c===bi[j].c)||grid[r][c]!==0) continue;
          const ca = getCands(grid,r,c,cageMap);
          const filtered = ca.filter(n => n!==nums[0] && n!==nums[1]);
          if (filtered.length===1 && ca.length>1) { determined = {r,c,num:filtered[0]}; break; }
        }
        if (determined) pairs.push({type,r1:bi[i].r,c1:bi[i].c,r2:bi[j].r,c2:bi[j].c,nums,determined});
      }
    }
  };
  for (let r = 0; r < 9; r++) { const cells=[]; for(let c=0;c<9;c++) cells.push([r,c]); checkUnit(cells,'row'); }
  for (let c = 0; c < 9; c++) { const cells=[]; for(let r=0;r<9;r++) cells.push([r,c]); checkUnit(cells,'col'); }
  for (let br=0;br<3;br++)for(let bc=0;bc<3;bc++){const cells=[];for(let dr=0;dr<3;dr++)for(let dc=0;dc<3;dc++)cells.push([br*3+dr,bc*3+dc]);checkUnit(cells,'box');}
  return pairs;
}

// Search for a good puzzle by removing givens from the solution
console.log('搜索教学盘面...');

let bestResult = null;

for (let attempt = 0; attempt < 50000; attempt++) {
  // Start from full solution, randomly remove 45-55 cells (keep 26-36 givens)
  const keepCount = 26 + Math.floor(Math.random() * 11);
  const positions = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r,c]);
  for (let i = positions.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [positions[i],positions[j]]=[positions[j],positions[i]]; }
  
  const board = clone(solution);
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) board[r][c] = 0;
  for (let i = 0; i < keepCount; i++) { const [r,c] = positions[i]; board[r][c] = solution[r][c]; }
  
  // Count initial naked singles
  let initialNS = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (board[r][c] !== 0) continue;
    if (getCands(board, r, c, null).length === 1) initialNS++;
  }
  
  if (initialNS < 2 || initialNS > 5) continue;
  
  // Simulate basic cascade
  const sim = simulate(board, null);
  if (sim.empty === 0) continue; // Solved by singles
  if (sim.filled < 8) continue; // Too few initial fills
  if (sim.empty < 3) continue; // Too few cells left
  
  // Check for naked pairs at stuck point
  const pairs = findNakedPairs(sim.grid, null);
  if (pairs.length === 0) continue;
  
  // Check if applying the pair leads to completion
  for (const pair of pairs) {
    const testGrid = clone(sim.grid);
    testGrid[pair.determined.r][pair.determined.c] = pair.determined.num;
    const sim2 = simulate(testGrid, null);
    
    // Count how many cells are correctly filled (match solution)
    let correct = 0, wrong = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (testGrid[r][c] !== 0 && sim2.grid[r][c] !== 0) {
        // Check against solution
        const finalVal = sim2.grid[r][c];
        if (finalVal === solution[r][c]) correct++;
        else wrong++;
      }
    }
    
    if (wrong === 0 && sim2.empty <= 3) {
      // Good candidate! Save it.
      bestResult = { board, pair, sim, sim2, initialNS, keepCount };
      console.log(`\n✅ 尝试${attempt}: 找到候选盘面!`);
      console.log(`  保留${keepCount}个给定, 初始裸单${initialNS}个`);
      console.log(`  基础连锁: ${sim.filled}个, 卡壳${sim.empty}空格`);
      console.log(`  数对: ${L[pair.r1]}${pair.c1+1}和${L[pair.r2]}${pair.c2+1}={${pair.nums[0]},${pair.nums[1]}} (${pair.type})`);
      console.log(`  确定: ${L[pair.determined.r]}${pair.determined.c+1}=${pair.determined.num}`);
      console.log(`  数对后: 填${sim2.filled+1}个, 剩${sim2.empty}空格, 错误${wrong}个`);
      break;
    }
  }
  
  if (bestResult) break;
}

if (bestResult) {
  console.log('\n=== 初始盘面 ===');
  v.printGrid(bestResult.board);
  
  console.log('\n=== 卡壳盘面 ===');
  v.printGrid(bestResult.sim.grid);
  
  console.log('\nboardData JSON:');
  console.log(JSON.stringify(bestResult.board));
  
  // Now design cages for this board
  console.log('\n=== 设计笼子 ===');
  // Design simple cages: 2-cell horizontal/vertical pairs, ensure no duplicates
  const board = bestResult.board;
  const cages = [];
  const visited = Array(9).fill(null).map(() => Array(9).fill(false));
  let cid = 1;
  
  function canAddToCage(existingCells, r, c) {
    if (visited[r][c]) return false;
    const seen = new Set();
    for (const [er,ec] of existingCells) seen.add(solution[er][ec]);
    return !seen.has(solution[r][c]);
  }
  
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (visited[r][c]) continue;
    
    const cells = [[r,c]];
    visited[r][c] = true;
    
    // Try to add right neighbor
    if (c < 8 && !visited[r][c+1] && canAddToCage(cells, r, c+1)) {
      cells.push([r,c+1]); visited[r][c+1] = true;
    }
    // If single cell, try down neighbor
    if (cells.length === 1 && r < 8 && !visited[r+1][c] && canAddToCage(cells, r+1, c)) {
      cells.push([r+1,c]); visited[r+1][c] = true;
    }
    
    let sum = 0;
    for (const [cr,cc] of cells) sum += solution[cr][cc];
    cages.push({id: cid++, sum, cells});
  }
  
  // Verify no duplicates in cages
  let cageErr = 0;
  for (const cage of cages) {
    const seen = new Set();
    for (const [cr,cc] of cage.cells) {
      if (seen.has(solution[cr][cc])) { cageErr++; console.log(`笼${cage.id}重复: ${solution[cr][cc]}`); }
      seen.add(solution[cr][cc]);
    }
    let s = 0; for (const [cr,cc] of cage.cells) s += solution[cr][cc];
    if (s !== cage.sum) cageErr++;
  }
  console.log(`笼子设计完成: ${cages.length}个, ${cageErr}个错误`);
  
  // Validate with the full validator
  const cageMap = { cageCells: {}, cellCage: {} };
  for (const cage of cages) {
    cageMap.cageCells[cage.id] = cage.cells;
    for (const [cr,cc] of cage.cells) cageMap.cellCage[`${cr},${cc}`] = cage.id;
  }
  
  const testLevel = { boardData: bestResult.board, cages, solution };
  const report = v.validate(testLevel, {maxInitialNaked: 6, requireTechnique: 'nakedPair'});
  console.log('\n=== 最终验证 ===');
  console.log('合法:', report.valid);
  console.log('初始裸单:', report.info.initialNakedSingles);
  console.log('基础填:', report.info.beforePairFilled);
  console.log('卡壳空格:', report.info.beforePairEmpty);
  console.log('数对:', report.info.nakedPairsAtStuckPoint);
  if (report.info.breakthroughPair) {
    console.log('破局对:', report.info.breakthroughPair.cells, '=', report.info.breakthroughPair.nums);
    console.log('多米诺:', report.info.dominoComplete);
  }
  if (report.errors.length > 0) {
    console.log('错误:');
    for (const e of report.errors) console.log(' -', e);
  }
  
  // Save result
  const output = {
    levelId: 701,
    title: "第1关：数对之锁",
    gridSize: 9,
    difficulty: "中等",
    teachingGoal: "学习显性数对（Naked Pair）：当同一区域两个格子恰好只能填入相同的两个数字时，这两个数字可以从该区域其他格子中排除。",
    boardData: bestResult.board,
    cages: cages,
    solution: solution,
    breakthroughCell: [bestResult.pair.determined.r, bestResult.pair.determined.c],
    pairCells: [[bestResult.pair.r1, bestResult.pair.c1], [bestResult.pair.r2, bestResult.pair.c2]],
    pairNums: bestResult.pair.nums,
    stats: {
      initialNakedSingles: bestResult.initialNS,
      basicFilled: bestResult.sim.filled,
      stuckEmpty: bestResult.sim.empty
    }
  };
  
  fs.writeFileSync('d:/killersudoku/tools/level701-final.json', JSON.stringify(output, null, 2));
  console.log('\n已保存到 tools/level701-final.json');
} else {
  console.log('❌ 未找到合适盘面，需要调整参数或增加搜索次数');
}
