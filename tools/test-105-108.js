// 快速验证105和108关
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
        const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
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

// 检查笼子覆盖
function checkCageCoverage(cages) {
  const covered = new Set();
  for (const cage of cages) {
    for (const [r,c] of cage.cells) {
      const key = `${r},${c}`;
      if (covered.has(key)) return {ok: false, error: `格子(${r},${c})属于多个笼子`};
      covered.add(key);
    }
  }
  if (covered.size !== SIZE*SIZE) return {ok: false, error: `只覆盖了${covered.size}/${SIZE*SIZE}个格子`};
  return {ok: true};
}

// 测试105关（修复笼子，不重叠，全覆盖）
const sol105 = [[2,4,1,3],[1,3,4,2],[4,2,3,1],[3,1,2,4]];
const board105 = [
  [0,4,0,3],
  [1,0,4,0],
  [4,0,0,1],
  [0,1,0,0]
];
// 重新设计笼子，覆盖所有16格，不重叠
const cages105 = [
  { id: 0, cells: [[0,0],[1,0]], sum: 3 },   // 2+1=3 纵向唯一组合
  { id: 1, cells: [[0,2],[1,2]], sum: 5 },   // 1+4=5 纵向
  { id: 2, cells: [[0,1]], sum: 4 },         // 单格=4
  { id: 3, cells: [[0,3]], sum: 3 },         // 单格=3
  { id: 4, cells: [[1,1],[1,3]], sum: 5 },   // 3+2=5 横向
  { id: 5, cells: [[2,0],[3,0]], sum: 7 },   // 4+3=7 纵向唯一组合
  { id: 6, cells: [[2,1],[3,1]], sum: 3 },   // 2+1=3 纵向唯一组合
  { id: 7, cells: [[2,2],[2,3]], sum: 4 },   // 3+1=4 横向唯一组合
  { id: 8, cells: [[3,2],[3,3]], sum: 6 }    // 2+4=6 横向唯一组合
];

console.log('=== 105关验证 ===');
console.log('终盘合法性:', builder.isValidSolution(sol105, SIZE) ? '✅' : '❌');
const cov = checkCageCoverage(cages105);
console.log('笼子覆盖:', cov.ok ? '✅' : '❌', cov.error || '');
console.log('笼子和值:', builder.verifyCages(sol105, cages105) ? '✅' : '❌');
const s105 = countSolutions(board105, cages105, 3);
console.log('解的数量:', s105.length);
if (s105.length === 1) {
  const sim = simNaked(board105, cages105);
  console.log('开局裸单可填:', sim.filled, '个, 剩余空格:', sim.empty);
  if (!sim.done) {
    const hiddens = findHidden(sim.grid);
    console.log('裸单后隐单数量:', hiddens.length);
    if (hiddens.length > 0) {
      console.log('第一个隐单:', hiddens[0]);
      const testG = builder.cloneGrid(sim.grid);
      testG[hiddens[0].r][hiddens[0].c] = hiddens[0].n;
      const after = simNaked(testG, cages105);
      console.log('填入隐单后裸单连锁:', after.filled, '个, 剩余:', after.empty);
      console.log(after.done ? '✅ 完美！隐单后收官！' : '');
    }
  } else {
    console.log('❌ 裸单直接解完，不需要隐单！');
  }
}
console.log();

// 测试108关（给提示数字，不全空白）
const sol108 = [[1,2,3,4],[3,4,1,2],[2,1,4,3],[4,3,2,1]];
const board108 = [
  [1,0,0,0],
  [0,0,0,2],
  [0,0,0,0],
  [0,3,0,0]
];
const cages108 = [
  { id: 0, cells: [[0,0],[0,1]], sum: 3 },   // 1+2=3
  { id: 1, cells: [[0,2],[0,3]], sum: 7 },   // 3+4=7
  { id: 2, cells: [[1,0],[2,0]], sum: 5 },   // 3+2=5
  { id: 3, cells: [[1,1],[1,2]], sum: 5 },   // 4+1=5
  { id: 4, cells: [[1,3],[2,3]], sum: 5 },   // 2+3=5
  { id: 5, cells: [[2,1],[2,2]], sum: 5 },   // 1+4=5
  { id: 6, cells: [[3,0],[3,1]], sum: 7 },   // 4+3=7
  { id: 7, cells: [[3,2],[3,3]], sum: 3 }    // 2+1=3
];

console.log('=== 108关验证 ===');
console.log('终盘合法性:', builder.isValidSolution(sol108, SIZE) ? '✅' : '❌');
const cov8 = checkCageCoverage(cages108);
console.log('笼子覆盖:', cov8.ok ? '✅' : '❌', cov8.error || '');
console.log('笼子和值:', builder.verifyCages(sol108, cages108) ? '✅' : '❌');
const s108 = countSolutions(board108, cages108, 3);
console.log('解的数量:', s108.length);
if (s108.length === 1) {
  const sim = simNaked(board108, cages108);
  console.log('开局裸单可填:', sim.filled, '个');
  builder.printGrid(board108, SIZE);
}
