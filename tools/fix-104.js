// 修复104关唯一解问题
const fs = require('fs');
const path = require('path');
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

const sol = [
  [3,1,4,2],
  [4,2,3,1],
  [1,3,2,4],
  [2,4,1,3]
];

console.log('🔧 测试104关不同配置...\n');

// 方案A：把(0,3)作为提示数字
const boardA = [
  [0,0,4,2],
  [0,2,0,0],
  [0,0,2,4],
  [0,0,0,0]
];
const cagesA = [
  { id: 0, cells: [[0,0],[0,1]], sum: 4 },
  { id: 1, cells: [[1,2],[1,3]], sum: 4 },
  { id: 2, cells: [[2,0],[3,0]], sum: 3 },
  { id: 3, cells: [[3,2],[3,3]], sum: 4 }
];
const solsA = countSolutions(boardA, cagesA, 3);
console.log(`方案A（(0,3)=2作为提示）: ${solsA.length}个解`);
if (solsA.length === 1) {
  console.log('✅ A可用！');
}

// 方案B：调整笼子，让(0,3)+(1,3)组成和值3的笼（唯一组合1+2）
const boardB = [
  [0,0,4,0],
  [0,2,0,0],
  [0,0,2,4],
  [0,0,0,0]
];
const cagesB = [
  { id: 0, cells: [[0,0],[0,1]], sum: 4 },
  { id: 1, cells: [[0,3],[1,3]], sum: 3 },
  { id: 2, cells: [[2,0],[3,0]], sum: 3 },
  { id: 3, cells: [[3,2],[3,3]], sum: 4 }
];
const solsB = countSolutions(boardB, cagesB, 3);
console.log(`方案B（纵向笼(0,3)+(1,3)=3）: ${solsB.length}个解`);
if (solsB.length === 1) {
  console.log('✅ B可用！');
  builder.printGrid(boardB, SIZE);
}

// 方案C：增加一个单格笼
const boardC = [
  [0,0,4,0],
  [0,2,0,0],
  [0,0,2,4],
  [0,0,0,0]
];
const cagesC = [
  { id: 0, cells: [[0,0],[0,1]], sum: 4 },
  { id: 1, cells: [[1,3]], sum: 1 },
  { id: 2, cells: [[2,0],[3,0]], sum: 3 },
  { id: 3, cells: [[3,2],[3,3]], sum: 4 }
];
const solsC = countSolutions(boardC, cagesC, 3);
console.log(`方案C（(1,3)单格笼=1）: ${solsC.length}个解`);
if (solsC.length === 1) {
  console.log('✅ C可用！');
}

// 方案D：把(1,2)也作为提示
const boardD = [
  [0,0,4,0],
  [0,2,3,0],
  [0,0,2,4],
  [0,0,0,0]
];
const cagesD = [
  { id: 0, cells: [[0,0],[0,1]], sum: 4 },
  { id: 1, cells: [[2,0],[3,0]], sum: 3 },
  { id: 2, cells: [[3,2],[3,3]], sum: 4 }
];
const solsD = countSolutions(boardD, cagesD, 3);
console.log(`方案D（(1,2)=3作为提示）: ${solsD.length}个解`);
if (solsD.length === 1) {
  console.log('✅ D可用！');
}

// 找到最佳方案
let chosen = null;
if (solsB.length === 1) chosen = { board: boardB, cages: cagesB, name: 'B' };
else if (solsA.length === 1) chosen = { board: boardA, cages: cagesA, name: 'A' };
else if (solsC.length === 1) chosen = { board: boardC, cages: cagesC, name: 'C' };
else if (solsD.length === 1) chosen = { board: boardD, cages: cagesD, name: 'D' };

if (chosen) {
  console.log(`\n🎉 采用方案${chosen.name}`);
  console.log('新盘面:');
  builder.printGrid(chosen.board, SIZE);
  console.log('终盘:');
  builder.printGrid(sol, SIZE);
  process.exit(0);
} else {
  console.log('\n❌ 都不行，需要更多测试');
  process.exit(1);
}
