// 验证104关是否有唯一解
const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');

const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

// 104关数据
const boardData = [
  [0,0,4,0],
  [0,2,0,0],
  [0,0,2,4],
  [0,0,0,0]
];
const solution = [
  [3,1,4,2],
  [4,2,3,1],
  [1,3,2,4],
  [2,4,1,3]
];
const cages = [
  { id: 0, cells: [[0,0],[0,1]], sum: 4 },
  { id: 1, cells: [[1,2],[1,3]], sum: 4 },
  { id: 2, cells: [[2,0],[3,0]], sum: 3 },
  { id: 3, cells: [[3,2],[3,3]], sum: 4 }
];

console.log('🔍 验证104关唯一解...\n');
console.log('初始盘面:');
builder.printGrid(boardData, SIZE);
console.log();

// 暴力求解：找出所有可能的解
function solve(grid, solutions, cages) {
  if (solutions.length > 2) return; // 找到2个以上就不用找了
  
  // 找第一个空格
  let r = -1, c = -1;
  for (let i = 0; i < SIZE; i++) {
    for (let j = 0; j < SIZE; j++) {
      if (grid[i][j] === 0) { r = i; c = j; break; }
    }
    if (r !== -1) break;
  }
  
  if (r === -1) {
    // 填满了，验证笼子
    if (builder.verifyCages(grid, cages)) {
      solutions.push(builder.cloneGrid(grid));
    }
    return;
  }
  
  const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
  for (const n of cands) {
    grid[r][c] = n;
    // 剪枝：检查笼子和值是否可能
    let cageOk = true;
    for (const cage of cages) {
      let sum = 0, empty = 0;
      for (const [cr, cc] of cage.cells) {
        if (grid[cr][cc]) sum += grid[cr][cc];
        else empty++;
      }
      if (sum > cage.sum) { cageOk = false; break; }
      // 如果填满了检查sum
      if (empty === 0 && sum !== cage.sum) { cageOk = false; break; }
    }
    if (cageOk) {
      solve(grid, solutions, cages);
    }
    grid[r][c] = 0;
  }
}

const g = builder.cloneGrid(boardData);
const solutions = [];
solve(g, solutions, cages);

console.log(`找到 ${solutions.length} 个解:\n`);
for (let i = 0; i < solutions.length; i++) {
  console.log(`─── 解 ${i+1} ───`);
  builder.printGrid(solutions[i], SIZE);
  console.log();
}

if (solutions.length === 1) {
  console.log('✅ 唯一解！盘面设计正确。');
} else {
  console.log(`❌ 问题：存在 ${solutions.length} 个解，没有唯一解！`);
}
