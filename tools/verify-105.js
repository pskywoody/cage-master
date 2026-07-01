// 验证105关
const fs = require('fs');
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

function countSolutions(boardData, cages, maxSolutions = 3) {
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

// 105关数据
const SOL = {
  f: [[1,3,4,2],[2,4,3,1],[3,1,2,4],[4,2,1,3]]
};
const boardData = [
  [1,0,4,0],
  [0,4,0,1],
  [3,0,2,4],
  [0,2,0,3]
];
const cages = [
  { id: 0, cells: [[0,1],[0,3]], sum: 5 },
  { id: 1, cells: [[1,0],[2,0]], sum: 5 },
  { id: 2, cells: [[3,0],[3,2]], sum: 5 }
];

console.log('🔍 105关盘面:');
builder.printGrid(boardData, SIZE);
console.log('终盘(SOL.f):');
builder.printGrid(SOL.f, SIZE);
console.log();

// 先验证solution是否匹配boardData
console.log('验证终盘与初始提示是否一致:');
let match = true;
for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    if (boardData[r][c] !== 0 && boardData[r][c] !== SOL.f[r][c]) {
      console.log(`❌ (${r},${c})提示=${boardData[r][c]}, 终盘=${SOL.f[r][c]}`);
      match = false;
    }
  }
}
if (match) console.log('✅ 提示数字与终盘一致');

// 验证笼子和值
console.log('\n验证笼子和值:');
for (const cage of cages) {
  let sum = 0;
  for (const [r,c] of cage.cells) sum += SOL.f[r][c];
  const ok = sum === cage.sum ? '✅' : '❌';
  console.log(`  ${ok} 笼${cage.id}: ${JSON.stringify(cage.cells)} 和=${sum} (预期${cage.sum})`);
}

// 数解
const sols = countSolutions(boardData, cages, 3);
console.log(`\n🔍 解的数量: ${sols.length}`);
for (let i = 0; i < sols.length; i++) {
  console.log(`\n─── 解 ${i+1} ───`);
  builder.printGrid(sols[i], SIZE);
}
