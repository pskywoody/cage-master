// 自动搜索需要隐单的4×4杀手数独
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

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

function simNaked(boardData, cages) {
  const grid = builder.cloneGrid(boardData);
  let filled = 0;
  while (true) {
    let found = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== 0) continue;
        // 考虑笼子唯一组合
        let cd = builder.getCands(grid, r, c, SIZE, bw, bh);
        // 检查所在笼子是否是唯一组合
        for (const cage of cages) {
          const isInCage = cage.cells.some(([cr,cc]) => cr===r && cc===c);
          if (isInCage && cage.cells.length === 2) {
            const uniq = {3:[1,2],4:[1,3],6:[2,4],7:[3,4]};
            if (uniq[cage.sum]) {
              const [n1,n2] = uniq[cage.sum];
              const other = cage.cells.find(([cr,cc]) => !(cr===r && cc===c));
              if (grid[other[0]][other[1]] !== 0) {
                // 搭档已填，这格确定
                cd = [cage.sum - grid[other[0]][other[1]]];
              } else {
                // 两个都空，用唯一组合约束候选
                cd = cd.filter(n => n === n1 || n === n2);
              }
            }
          }
        }
        if (cd.length === 1) {
          grid[r][c] = cd[0];
          filled++;
          found = true;
        }
      }
    }
    if (!found) break;
  }
  let empty = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty++;
  return {grid, filled, empty, done: empty === 0};
}

function findHidden(grid) {
  const res = [];
  // 行
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
  // 列
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
  return res;
}

// 生成所有终盘
function allSolutions() {
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

// 生成随机笼子划分（2格笼为主，可能有单格笼）
function randomCages(sol) {
  // 简单的笼子生成：横向或纵向相邻2格
  const cages = [];
  const used = Array(SIZE).fill(null).map(()=>Array(SIZE).fill(false));
  let id = 0;
  
  // 随机选择一些格子做单格笼（给提示）
  const singles = 2 + Math.floor(Math.random()*2); // 2-3个单格笼
  const allPos = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) allPos.push([r,c]);
  for (let i = allPos.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [allPos[i], allPos[j]] = [allPos[j], allPos[i]];
  }
  for (let i = 0; i < singles; i++) {
    const [r,c] = allPos[i];
    used[r][c] = true;
    cages.push({id: id++, cells: [[r,c]], sum: sol[r][c]});
  }
  
  // 剩下的组2格笼
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (used[r][c]) continue;
      // 尝试向右
      if (c+1 < SIZE && !used[r][c+1]) {
        used[r][c] = used[r][c+1] = true;
        cages.push({id: id++, cells: [[r,c],[r,c+1]], sum: sol[r][c]+sol[r][c+1]});
      } else if (r+1 < SIZE && !used[r+1][c]) {
        used[r][c] = used[r+1][c] = true;
        cages.push({id: id++, cells: [[r,c],[r+1,c]], sum: sol[r][c]+sol[r+1][c]});
      } else {
        // 找一个搭档
        let found = false;
        for (let dr = -1; dr <= 1 && !found; dr++) {
          for (let dc = -1; dc <= 1 && !found; dc++) {
            if (Math.abs(dr)+Math.abs(dc)!==1) continue;
            const nr = r+dr, nc = c+dc;
            if (nr>=0&&nr<SIZE&&nc>=0&&nc<SIZE&&!used[nr][nc]) {
              used[r][c] = used[nr][nc] = true;
              cages.push({id: id++, cells: [[r,c],[nr,nc]], sum: sol[r][c]+sol[nr][nc]});
              found = true;
            }
          }
        }
      }
    }
  }
  return cages;
}

// 从笼子生成初始盘面（单格笼作为提示，其他为空）
function boardFromCages(cages) {
  const board = Array(SIZE).fill(null).map(()=>Array(SIZE).fill(0));
  for (const cage of cages) {
    if (cage.cells.length === 1) {
      const [r,c] = cage.cells[0];
      board[r][c] = cage.sum;
    }
  }
  return board;
}

console.log('🔍 搜索需要隐单的4×4杀手数独...\n');
const allSols = allSolutions();
console.log(`共${allSols.length}个终盘`);

let best = null;

for (let attempt = 0; attempt < 5000; attempt++) {
  const sol = allSols[Math.floor(Math.random()*allSols.length)];
  const cages = randomCages(sol);
  const board = boardFromCages(cages);
  
  // 数给定提示
  let given = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (board[r][c]) given++;
  if (given < 2 || given > 4) continue; // 2-4个提示比较合适
  
  // 唯一解
  const sols = countSolutions(board, cages, 2);
  if (sols.length !== 1) continue;
  
  // 模拟裸单+唯一组合
  const sim = simNaked(board, cages);
  if (sim.done) continue; // 裸单解完了
  if (sim.filled < 1 || sim.filled > 6) continue; // 开局填1-6个
  
  // 找隐单
  const hiddens = findHidden(sim.grid);
  if (hiddens.length === 0) continue;
  
  // 填第一个隐单看是否连锁
  const testG = builder.cloneGrid(sim.grid);
  testG[hiddens[0].r][hiddens[0].c] = hiddens[0].n;
  const after = simNaked(testG, cages);
  
  if (after.done || after.empty <= 2) {
    best = {
      board, cages, solution: sol,
      openingFilled: sim.filled,
      remainingAfterOpening: sim.empty,
      hiddenSingle: hiddens[0],
      chainAfterHidden: after.filled,
      doneAfterHidden: after.done
    };
    console.log(`🎯 [尝试${attempt}] 提示${given}个, 开局裸单填${sim.filled}, 剩${sim.empty}格, 隐单(${hiddens[0].r},${hiddens[0].c})=${hiddens[0].n}(${hiddens[0].where}), 之后连锁${after.filled}格, 完成:${after.done}`);
    if (after.done && sim.filled >= 2 && sim.filled <= 4) {
      break; // 完美
    }
  }
}

if (best) {
  console.log('\n🎉 找到理想盘面！');
  console.log('\n初始盘面（单格笼为提示）:');
  builder.printGrid(best.board, SIZE);
  console.log('\n终盘:');
  builder.printGrid(best.solution, SIZE);
  console.log('\n笼子:');
  for (const c of best.cages) {
    console.log(`  笼${c.id}: 和值${c.sum}, 格子${JSON.stringify(c.cells)}`);
  }
  console.log(`\n开局裸单+唯一组合填${best.openingFilled}个，剩${best.remainingAfterOpening}格需要隐单`);
  console.log(`隐单在(${best.hiddenSingle.r},${best.hiddenSingle.c})=${best.hiddenSingle.n}(${best.hiddenSingle.where})`);
  console.log(`隐单后连锁${best.chainAfterHidden}格，收官:${best.doneAfterHidden}`);
  
  const fs = require('fs');
  fs.writeFileSync('./tools/level105-result.json', JSON.stringify(best, null, 2));
  console.log('\n💾 已保存到 level105-result.json');
} else {
  console.log('\n❌ 没找到，尝试更多次数或调整参数');
}
