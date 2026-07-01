// 第100关：规则体验关
// 纯数独（无笼子），4×4，通过触发器引导玩家体验"行/列/宫不重复"规则
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

function countSolutions(boardData, maxSolutions = 2) {
  const grid = builder.cloneGrid(boardData);
  let solutions = [];
  function solve() {
    if (solutions.length >= maxSolutions) return;
    let r = -1, c = -1;
    for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE; j++) {
      if (grid[i][j] === 0) { r=i;c=j;break }
    }
    if(r===-1){solutions.push(builder.cloneGrid(grid));return}
    for(const n of builder.getCands(grid,r,c,SIZE,bw,bh)){grid[r][c]=n;solve();grid[r][c]=0;if(solutions.length>=maxSolutions)return}
  }
  solve();
  return solutions;
}

// 设计一个盘面：6个提示，剩余10个格子通过裸单连锁可解
// 教学节奏：每填2-3个格就有引导提示
const sol = [
  [1,4,2,3],
  [3,2,4,1],
  [4,1,3,2],
  [2,3,1,4]
];

// 盘面：6个提示，剩下10格通过裸单连锁解
const board = [
  [1,0,0,3],
  [0,2,0,0],
  [0,0,3,0],
  [2,0,0,4]
];

console.log('终盘:');
builder.printGrid(sol, SIZE);
console.log('终盘合法:', builder.isValidSolution(sol, SIZE));

console.log('\n初始盘面:');
builder.printGrid(board, SIZE);

const sols = countSolutions(board, 3);
console.log(`\n解的数量: ${sols.length}`);

if (sols.length === 1) {
  console.log('✅ 唯一解！');
  
  // 模拟解题步骤
  function findNakeds(g) {
    const res = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
      if (g[r][c]) continue;
      const cd = builder.getCands(g, r, c, SIZE, bw, bh);
      if (cd.length === 1) res.push({r,c,n:cd[0], cd});
    }
    return res;
  }
  
  let g = builder.cloneGrid(board);
  let step = 0;
  console.log('\n📊 解题步骤（裸单连锁）:');
  while (true) {
    const ns = findNakeds(g);
    if (ns.length === 0) break;
    step++;
    for (const n of ns) {
      const cands = builder.getCands(g, n.r, n.c, SIZE, bw, bh);
      // 分析是行/列/宫哪个约束起作用
      const rowNums = new Set(), colNums = new Set(), boxNums = new Set();
      for (let c = 0; c < SIZE; c++) if (g[n.r][c]) rowNums.add(g[n.r][c]);
      for (let r = 0; r < SIZE; r++) if (g[r][n.c]) colNums.add(g[r][n.c]);
      const br = Math.floor(n.r/bw)*bw, bc = Math.floor(n.c/bh)*bh;
      for (let dr = 0; dr < bw; dr++) for (let dc = 0; dc < bh; dc++) if (g[br+dr][bc+dc]) boxNums.add(g[br+dr][bc+dc]);
      
      let reason = [];
      if (rowNums.size === 3) reason.push('行已有'+[...rowNums].join(','));
      if (colNums.size === 3) reason.push('列已有'+[...colNums].join(','));
      if (boxNums.size === 3) reason.push('宫已有'+[...boxNums].join(','));
      
      console.log(`  步骤${step}: (${n.r},${n.c}) = ${n.n}  ← ${reason.join(' + ') || '候选='+cands.join(',')}`);
      g[n.r][n.c] = n.n;
    }
  }
  
  let empty = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!g[r][c]) empty++;
  console.log(`\n剩余空格: ${empty} ${empty === 0 ? '✅ 全部解完' : '⚠️ 需要高级技巧'}`);
  
  // 保存
  const fs = require('fs');
  fs.writeFileSync('./tools/level100-final.json', JSON.stringify({
    board,
    solution: sol,
    cages: [], // 无笼子
    given: 6
  }, null, 2));
  console.log('💾 已保存');
}
