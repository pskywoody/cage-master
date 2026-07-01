// 搜索第100关（规则体验关）的盘面
// 要求：无笼子，纯数独，4×4，通过"排除"来教学行/列/宫不重复规则
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

function countSolutions(boardData, maxSolutions = 2) {
  const grid = builder.cloneGrid(boardData);
  let solutions = [];
  function solve() {
    if (solutions.length >= maxSolutions) return;
    let r = -1, c = -1;
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        if (grid[i][j] === 0) { r = i; c = j; break; }
      }
      if (r !== -1) break;
    }
    if (r === -1) {
      solutions.push(builder.cloneGrid(grid));
      return;
    }
    const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
    for (const n of cands) {
      grid[r][c] = n;
      solve();
      grid[r][c] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  solve();
  return solutions;
}

function findNakeds(grid) {
  const res = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c]) continue;
      const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
      if (cd.length === 1) res.push({r,c,n:cd[0]});
    }
  }
  return res;
}

function findHiddens(grid) {
  const res = [];
  // 行隐单
  for (let r = 0; r < SIZE; r++) {
    for (let n = 1; n <= SIZE; n++) {
      let pos = [];
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'row'});
    }
  }
  // 列隐单
  for (let c = 0; c < SIZE; c++) {
    for (let n = 1; n <= SIZE; n++) {
      let pos = [];
      for (let r = 0; r < SIZE; r++) {
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'col'});
    }
  }
  // 宫隐单
  for (let br = 0; br < 2; br++) {
    for (let bc = 0; bc < 2; bc++) {
      for (let n = 1; n <= SIZE; n++) {
        let pos = [];
        for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
          const r = br*2+dr, c = bc*2+dc;
          if (grid[r][c] === n) { pos = []; break; }
          if (grid[r][c]) continue;
          const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
          if (cd.includes(n)) pos.push([r,c]);
        }
        if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'box'});
      }
    }
  }
  return res;
}

function simStep(boardData) {
  // 模拟一步：填所有裸单，然后找一个隐单
  const grid = builder.cloneGrid(boardData);
  // 先填裸单
  while (true) {
    const nakeds = findNakeds(grid);
    if (nakeds.length === 0) break;
    for (const {r,c,n} of nakeds) grid[r][c] = n;
  }
  let empty = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty++;
  if (empty === 0) return {grid, done: true};
  const hiddens = findHiddens(grid);
  return {grid, done: false, nakeds: findNakeds(grid), hiddens, empty};
}

// 生成所有终盘
function allSols() {
  const sols = [];
  const g = Array(SIZE).fill(null).map(()=>Array(SIZE).fill(0));
  function solve() {
    let r=-1,c=-1;
    for(let i=0;i<SIZE;i++){for(let j=0;j<SIZE;j++){if(g[i][j]===0){r=i;c=j;break}}if(r!==-1)break}
    if(r===-1){sols.push(builder.cloneGrid(g));return}
    for(const n of builder.getCands(g,r,c,SIZE,bw,bh)){g[r][c]=n;solve();g[r][c]=0}
  }
  solve();
  return sols;
}

console.log('🔍 搜索第100关（规则体验关）盘面...\n');
const allSolutions = allSols();
console.log(`共${allSolutions.length}个4×4终盘`);

// 教学节奏要求：
// 1. 给定5-7个提示数字
// 2. 第一步：玩家看第一行，发现只能填2或3（行排除教学）
// 3. 第二步：看列排除，找到一个隐单
// 4. 第三步：看宫排除
// 5. 第四步：综合排除
// 6. 没有裸单开局（必须学会排除才能填第一个数）
// 但作为第一关，也可以给1-2个裸单热身

let best = null;

for (const sol of allSolutions) {
  for (let trial = 0; trial < 200; trial++) {
    // 随机挖空，给定5-7个提示
    const given = 5 + Math.floor(Math.random()*3);
    const positions = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) positions.push([r,c]);
    for (let i = positions.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    const board = builder.cloneGrid(sol);
    for (let i = 0; i < SIZE*SIZE - given; i++) {
      board[positions[i][0]][positions[i][1]] = 0;
    }
    
    // 唯一解
    const sols = countSolutions(board, 2);
    if (sols.length !== 1) continue;
    
    // 模拟
    const step1 = simStep(board);
    if (step1.done) continue; // 裸单直接解完，不行
    
    // 至少要有隐单
    if (step1.hiddens.length === 0) continue;
    
    // 填第一个隐单后看后续
    const g2 = builder.cloneGrid(step1.grid);
    g2[step1.hiddens[0].r][step1.hiddens[0].c] = step1.hiddens[0].n;
    const step2 = simStep(g2);
    
    if (!best || (step1.hiddens.length > 0 && step2.hiddens.length > 0)) {
      best = {
        board,
        solution: sol,
        cages: [], // 无笼子
        given,
        firstHidden: step1.hiddens[0],
        step1Empty: step1.empty,
        step1Hiddens: step1.hiddens.length,
        step2Empty: step2.done ? 0 : step2.empty
      };
      // 理想：开局0-1个裸单，必须用排除
      if (step1.empty >= 8 && step1.hiddens.length >= 2) {
        break;
      }
    }
  }
  if (best && best.step1Empty >= 8) break;
}

if (best) {
  console.log('\n🎉 找到合适盘面！');
  console.log('初始盘面:');
  builder.printGrid(best.board, SIZE);
  console.log('终盘:');
  builder.printGrid(best.solution, SIZE);
  console.log(`给定提示: ${best.given}个`);
  console.log(`第一个隐单: (${best.firstHidden.r},${best.firstHidden.c})=${best.firstHidden.n} (${best.firstHidden.where})`);
  console.log(`开局裸单后剩余空格: ${best.step1Empty}, 隐单数量: ${best.step1Hiddens}`);
  
  const fs = require('fs');
  fs.writeFileSync('./tools/level100-candidate.json', JSON.stringify(best, null, 2));
  console.log('\n💾 已保存');
} else {
  console.log('❌ 没找到');
}
