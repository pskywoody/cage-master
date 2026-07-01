// 手动设计第100关：规则体验关
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

// 我设计的盘面
const sol = [
  [1,3,2,4],
  [4,2,3,1],
  [2,4,1,3],
  [3,1,4,2]
];
// 验证终盘合法
console.log('终盘合法:', builder.isValidSolution(sol, SIZE));
builder.printGrid(sol, SIZE);

// 初始盘面：给几个提示数字，教学排除法
// 设计思路：
// 第0行：1,_,_,4 → 缺2,3
// 第1列：_,2,_,_ → (0,1)不能是2（列排除）→ (0,1)=3，(0,2)=2
const board = [
  [1,0,0,4],
  [0,2,0,0],
  [0,0,0,0],
  [3,0,0,2]
];
console.log('\n初始盘面:');
builder.printGrid(board, SIZE);

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
    if (r === -1) { solutions.push(builder.cloneGrid(grid)); return; }
    for (const n of builder.getCands(grid, r, c, SIZE, bw, bh)) {
      grid[r][c] = n; solve(); grid[r][c] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  solve();
  return solutions;
}

const sols = countSolutions(board, 3);
console.log(`解的数量: ${sols.length}`);
for (let i = 0; i < sols.length; i++) {
  console.log(`解${i+1}:`);
  builder.printGrid(sols[i], SIZE);
}

// 检查裸单
function findNakeds(grid) {
  const res = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (grid[r][c]) continue;
    const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
    if (cd.length === 1) res.push({r,c,n:cd[0], cd});
  }
  return res;
}

function findHiddens(grid) {
  const res = [];
  for (let r = 0; r < SIZE; r++) for (let n = 1; n <= SIZE; n++) {
    let pos = [];
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === n) { pos = []; break; }
      if (grid[r][c]) continue;
      if (builder.getCands(grid,r,c,SIZE,bw,bh).includes(n)) pos.push([r,c]);
    }
    if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'row'});
  }
  for (let c = 0; c < SIZE; c++) for (let n = 1; n <= SIZE; n++) {
    let pos = [];
    for (let r = 0; r < SIZE; r++) {
      if (grid[r][c] === n) { pos = []; break; }
      if (grid[r][c]) continue;
      if (builder.getCands(grid,r,c,SIZE,bw,bh).includes(n)) pos.push([r,c]);
    }
    if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'col'});
  }
  for (let br = 0; br < 2; br++) for (let bc = 0; bc < 2; bc++) for (let n = 1; n <= SIZE; n++) {
    let pos = [];
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
      const r = br*2+dr, c = bc*2+dc;
      if (grid[r][c] === n) { pos = []; break; }
      if (grid[r][c]) continue;
      if (builder.getCands(grid,r,c,SIZE,bw,bh).includes(n)) pos.push([r,c]);
    }
    if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'box'});
  }
  return res;
}

// 分析教学步骤
console.log('\n📊 教学节奏分析:');
let g = builder.cloneGrid(board);
let step = 1;

// 先看初始状态的候选数
console.log('\n初始状态候选数:');
for (let r = 0; r < SIZE; r++) {
  let line = '';
  for (let c = 0; c < SIZE; c++) {
    if (g[r][c]) line += g[r][c];
    else line += `[${builder.getCands(g,r,c,SIZE,bw,bh).join('')}]`;
    if (c === 1) line += ' | ';
  }
  console.log('  ' + line);
}

const nakeds0 = findNakeds(g);
const hiddens0 = findHiddens(g);
console.log(`\n初始裸单: ${nakeds0.length}个`);
if (nakeds0.length > 0) console.log('  ', nakeds0);
console.log(`初始隐单（排除法）: ${hiddens0.length}个`);
if (hiddens0.length > 0) console.log('  ', hiddens0.slice(0,5));
