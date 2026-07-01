// 调整第100关盘面，确保唯一解
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
    if (r === -1) { solutions.push(builder.cloneGrid(grid)); return; }
    for (const n of builder.getCands(grid, r, c, SIZE, bw, bh)) {
      grid[r][c] = n; solve(); grid[r][c] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  solve();
  return solutions;
}

// 原始多解盘面
const sol = [
  [1,3,2,4],
  [4,2,3,1],
  [2,4,1,3],
  [3,1,4,2]
];

// 尝试在不同位置加一个提示数字，找到唯一解
const base = [
  [1,0,0,4],
  [0,2,0,0],
  [0,0,0,0],
  [3,0,0,2]
];

console.log('🔍 尝试加一个提示数字让盘面唯一解...\n');

for (let r = 0; r < SIZE; r++) {
  for (let c = 0; c < SIZE; c++) {
    if (base[r][c] !== 0) continue;
    const test = builder.cloneGrid(base);
    test[r][c] = sol[r][c];
    const sols = countSolutions(test, 2);
    if (sols.length === 1) {
      console.log(`✅ 加(${r},${c})=${sol[r][c]}后唯一解！`);
      console.log('盘面:');
      builder.printGrid(test, SIZE);
      
      // 检查教学节奏
      function findNakeds(g) {
        const res = [];
        for (let rr = 0; rr < SIZE; rr++) for (let cc = 0; cc < SIZE; cc++) {
          if (g[rr][cc]) continue;
          const cd = builder.getCands(g, rr, cc, SIZE, bw, bh);
          if (cd.length === 1) res.push({r:rr,c:cc,n:cd[0]});
        }
        return res;
      }
      
      const nakeds = findNakeds(test);
      console.log(`初始裸单: ${nakeds.length}个:`, nakeds.map(n=>`(${n.r},${n.c})=${n.n}`).join(', '));
      
      // 模拟填完裸单
      let g = builder.cloneGrid(test);
      let filled = 0;
      while (true) {
        const ns = findNakeds(g);
        if (ns.length === 0) break;
        for (const n of ns) { g[n.r][n.c] = n.n; filled++; }
      }
      let empty = 0;
      for (let rr = 0; rr < SIZE; rr++) for (let cc = 0; cc < SIZE; cc++) if (!g[rr][cc]) empty++;
      console.log(`裸单连锁填${filled}个后剩${empty}个空格`);
      if (empty > 0) {
        console.log('需要用排除法（隐单）继续！\n');
        console.log('🎉 这是完美的教学节奏：裸单热身 → 卡壳 → 需要排除法！');
        process.exit(0);
      }
    }
  }
}

console.log('\n没找到单个提示的解，尝试加2个提示...');
// 如果加1个不够，尝试加2个
