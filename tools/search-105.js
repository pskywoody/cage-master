// 自动搜索符合教学要求的4x4关卡
const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

// 数解器
function countSolutions(boardData, cages, maxSolutions = 2) {
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
      if (builder.verifyCages(grid, cages)) solutions.push(builder.cloneGrid(grid));
      return;
    }
    const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
    for (const n of cands) {
      grid[r][c] = n;
      let valid = true;
      for (const cage of cages) {
        let s = 0, empty = 0;
        for (const [cr, cc] of cage.cells) {
          if (grid[cr][cc]) s += grid[cr][cc]; else empty++;
        }
        if (s > cage.sum) { valid = false; break; }
        if (empty === 0 && s !== cage.sum) { valid = false; break; }
      }
      if (valid) solve();
      grid[r][c] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  solve();
  return solutions;
}

// 用裸单模拟能填多少
function simulateNakedSingles(boardData, cages) {
  const grid = builder.cloneGrid(boardData);
  let filled = 0;
  let history = [];
  while (true) {
    let found = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== 0) continue;
        const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cands.length === 1) {
          history.push({r, c, n: cands[0], type: 'naked'});
          grid[r][c] = cands[0];
          filled++;
          found = true;
        }
      }
    }
    if (!found) break;
  }
  return {grid, filled, history, completed: filled + countNonZero(boardData) === SIZE*SIZE};
}

function countNonZero(g) {
  let n = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (g[r][c]) n++;
  return n;
}

// 找隐单：某数字在某行/列/宫只有一个位置可放
function findHiddenSingle(grid) {
  const results = [];
  // 行
  for (let r = 0; r < SIZE; r++) {
    for (let n = 1; n <= SIZE; n++) {
      let positions = [];
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === n) { positions = []; break; }
        if (grid[r][c] !== 0) continue;
        const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cands.includes(n)) positions.push([r,c]);
      }
      if (positions.length === 1) results.push({r: positions[0][0], c: positions[0][1], n, where: 'row'});
    }
  }
  // 列
  for (let c = 0; c < SIZE; c++) {
    for (let n = 1; n <= SIZE; n++) {
      let positions = [];
      for (let r = 0; r < SIZE; r++) {
        if (grid[r][c] === n) { positions = []; break; }
        if (grid[r][c] !== 0) continue;
        const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cands.includes(n)) positions.push([r,c]);
      }
      if (positions.length === 1) results.push({r: positions[0][0], c: positions[0][1], n, where: 'col'});
    }
  }
  // 宫
  for (let br = 0; br < SIZE/bh; br++) {
    for (let bc = 0; bc < SIZE/bw; bc++) {
      for (let n = 1; n <= SIZE; n++) {
        let positions = [];
        for (let dr = 0; dr < bh; dr++) {
          for (let dc = 0; dc < bw; dc++) {
            const r = br*bh+dr, c = bc*bw+dc;
            if (grid[r][c] === n) { positions = []; break; }
            if (grid[r][c] !== 0) continue;
            const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
            if (cands.includes(n)) positions.push([r,c]);
          }
        }
        if (positions.length === 1) results.push({r: positions[0][0], c: positions[0][1], n, where: 'box'});
      }
    }
  }
  return results;
}

// 生成所有可能的终盘
function generateAllSolutions() {
  const sols = [];
  const g = Array(SIZE).fill(null).map(()=>Array(SIZE).fill(0));
  function solve() {
    let r=-1,c=-1;
    for(let i=0;i<SIZE;i++){for(let j=0;j<SIZE;j++){if(g[i][j]===0){r=i;c=j;break}}if(r!==-1)break}
    if(r===-1){sols.push(builder.cloneGrid(g));return}
    for(const n of builder.getCands(g,r,c,SIZE,bw,bh)){
      g[r][c]=n;solve();g[r][c]=0;
    }
  }
  solve();
  return sols;
}

console.log('🔍 搜索隐单教学关...\n');

// 要求：
// 1. 唯一解
// 2. 开局裸单只能填2-4格（建立信心）
// 3. 裸单用完后，必须通过隐单才能继续（这就是破局点）
// 4. 隐单填入后，连锁触发裸单收官

const allSols = generateAllSolutions();
console.log(`共${allSols.length}个合法4×4终盘`);

let best = null;
let attempts = 0;

for (const sol of allSols) {
  // 随机挖空，初始给5-8个提示
  for (let trial = 0; trial < 50; trial++) {
    attempts++;
    const given = 5 + Math.floor(Math.random()*4); // 5-8个提示
    const positions = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) positions.push([r,c]);
    // 打乱
    for (let i = positions.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    const board = builder.cloneGrid(sol);
    for (let i = 0; i < SIZE*SIZE - given; i++) {
      board[positions[i][0]][positions[i][1]] = 0;
    }
    
    // 不用笼子（纯标准数独，先找符合教学的盘面）
    const cages = [];
    const sols = countSolutions(board, cages, 2);
    if (sols.length !== 1) continue;
    
    // 模拟开局裸单
    const sim = simulateNakedSingles(board, cages);
    if (sim.completed) continue; // 裸单直接解完了，不行
    if (sim.filled < 2 || sim.filled > 5) continue; // 开局填2-5个比较合适
    
    // 找隐单
    const hiddens = findHiddenSingle(sim.grid);
    if (hiddens.length === 0) continue;
    
    // 填第一个隐单，看是否能连锁收官
    const testGrid = builder.cloneGrid(sim.grid);
    testGrid[hiddens[0].r][hiddens[0].c] = hiddens[0].n;
    const afterHidden = simulateNakedSingles(testGrid, cages);
    
    // 最好是填完隐单后能继续推进很多
    if (afterHidden.filled < 3) continue;
    
    // 找到一个！
    if (!best || afterHidden.filled > best.afterHiddenFilled) {
      best = {
        board,
        solution: sol,
        cages,
        openingFilled: sim.filled,
        hiddenSingle: hiddens[0],
        afterHiddenFilled: afterHidden.filled,
        totalEmpty: SIZE*SIZE - given
      };
      console.log(`🎯 找到候选! 开局填${sim.filled}, 隐单(${hiddens[0].r},${hiddens[0].c})=${hiddens[0].n}, 之后连锁${afterHidden.filled}步`);
      if (afterHidden.filled >= SIZE*SIZE - given - sim.filled - 1) {
        // 几乎收官了，完美
        break;
      }
    }
  }
  if (best && best.afterHiddenFilled >= 8) break;
}

if (best) {
  console.log('\n🎉 找到理想盘面!');
  console.log('初始盘面:');
  builder.printGrid(best.board, SIZE);
  console.log('终盘:');
  builder.printGrid(best.solution, SIZE);
  console.log(`开局裸单: ${best.openingFilled}个`);
  console.log(`破局隐单: (${best.hiddenSingle.r},${best.hiddenSingle.c}) = ${best.hiddenSingle.n} (${best.hiddenSingle.where})`);
  console.log(`隐单后连锁: ${best.afterHiddenFilled}个裸单`);
  
  // 保存到文件
  const output = {
    boardData: best.board,
    solution: best.solution,
    cages: best.cages,
    meta: {
      openingNaked: best.openingFilled,
      hiddenSingleAt: [best.hiddenSingle.r, best.hiddenSingle.c],
      hiddenSingleValue: best.hiddenSingle.n,
      hiddenSingleType: best.hiddenSingle.where
    }
  };
  fs.writeFileSync(path.join(__dirname, 'level105-candidate.json'), JSON.stringify(output, null, 2));
  console.log('\n💾 已保存到 level105-candidate.json');
} else {
  console.log('\n❌ 没找到合适盘面，扩大搜索');
}
