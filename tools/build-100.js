// 重新设计第100关：规则体验关
// 核心教学目标：通过操作让玩家理解"行、列、宫不能有重复数字"
// 教学节奏：先有2-3个裸单热身，然后卡壳，必须用排除法（看行/列/宫）才能继续
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

function findNakeds(g) {
  const res = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) {
    if (g[r][c]) continue;
    const cd = builder.getCands(g, r, c, SIZE, bw, bh);
    if (cd.length === 1) res.push({r,c,n:cd[0]});
  }
  return res;
}

function simulate(g) {
  // 返回：填完所有裸单后的盘面，以及是否解完
  const grid = builder.cloneGrid(g);
  let total = 0;
  while (true) {
    const ns = findNakeds(grid);
    if (ns.length === 0) break;
    for (const n of ns) { grid[n.r][n.c] = n.n; total++; }
  }
  let empty = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty++;
  return {grid, filled: total, empty, done: empty === 0};
}

function findHiddens(g) {
  const res = [];
  // 行隐单
  for (let r = 0; r < SIZE; r++) for (let n = 1; n <= SIZE; n++) {
    let pos = [];
    for (let c = 0; c < SIZE; c++) {
      if (g[r][c] === n) { pos = []; break; }
      if (g[r][c]) continue;
      if (builder.getCands(g,r,c,SIZE,bw,bh).includes(n)) pos.push([r,c]);
    }
    if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'row'});
  }
  // 列隐单
  for (let c = 0; c < SIZE; c++) for (let n = 1; n <= SIZE; n++) {
    let pos = [];
    for (let r = 0; r < SIZE; r++) {
      if (g[r][c] === n) { pos = []; break; }
      if (g[r][c]) continue;
      if (builder.getCands(g,r,c,SIZE,bw,bh).includes(n)) pos.push([r,c]);
    }
    if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'col'});
  }
  // 宫隐单
  for (let br = 0; br < 2; br++) for (let bc = 0; bc < 2; bc++) for (let n = 1; n <= SIZE; n++) {
    let pos = [];
    for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
      const r = br*2+dr, c = bc*2+dc;
      if (g[r][c] === n) { pos = []; break; }
      if (g[r][c]) continue;
      if (builder.getCands(g,r,c,SIZE,bw,bh).includes(n)) pos.push([r,c]);
    }
    if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'box'});
  }
  return res;
}

// 枚举所有4×4终盘，搜索完美教学节奏的盘面
// 理想节奏：
// - 初始4-5个提示数字
// - 初始1-2个裸单热身
// - 填完裸单后剩4-8个空格，需要用排除法（隐单）才能继续
// - 唯一解

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

const allSolutions = allSols();
console.log(`共${allSolutions.length}个终盘，开始搜索...\n`);

let best = null;
let attempts = 0;

for (const sol of allSolutions) {
  // 对每个终盘，随机挖空多次
  for (let trial = 0; trial < 300; trial++) {
    attempts++;
    // 随机4-6个提示
    const given = 4 + Math.floor(Math.random()*3);
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
    const sim = simulate(board);
    const initialNakeds = findNakeds(board);
    
    // 理想：初始1-2个裸单，填完裸单后剩4-8个空格（需要排除法）
    if (initialNakeds.length >= 1 && initialNakeds.length <= 3 && 
        sim.empty >= 4 && sim.empty <= 9 && !sim.done) {
      const hiddens = findHiddens(sim.grid);
      if (hiddens.length >= 1) {
        best = {
          board,
          solution: sol,
          cages: [], // 无笼子！纯规则教学
          given,
          initialNakeds: initialNakeds.length,
          afterNakedsEmpty: sim.empty,
          hiddens: hiddens.length,
          afterGrid: sim.grid
        };
        console.log(`🎉 尝试${attempts}次找到！`);
        console.log('初始盘面:');
        builder.printGrid(board, SIZE);
        console.log('终盘:');
        builder.printGrid(sol, SIZE);
        console.log(`提示数: ${given}, 初始裸单: ${initialNakeds.length}, 填完裸单剩${sim.empty}空格, 隐单: ${hiddens.length}`);
        
        // 填一个隐单后看后续
        const g2 = builder.cloneGrid(sim.grid);
        g2[hiddens[0].r][hiddens[0].c] = hiddens[0].n;
        const sim2 = simulate(g2);
        console.log(`填第一个隐单(${hiddens[0].r},${hiddens[0].c})=${hiddens[0].n}(${hiddens[0].where}排除)后剩${sim2.empty}空格, done=${sim2.done}`);
        
        const fs = require('fs');
        fs.writeFileSync('./tools/level100-final.json', JSON.stringify(best, null, 2));
        process.exit(0);
      }
    }
  }
}

console.log(`尝试${attempts}次没找到完美的，放宽条件...`);
// 放宽条件
for (const sol of allSolutions) {
  for (let trial = 0; trial < 500; trial++) {
    attempts++;
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
    const sols = countSolutions(board, 2);
    if (sols.length !== 1) continue;
    const sim = simulate(board);
    const initialNakeds = findNakeds(board);
    if (initialNakeds.length >= 0 && !sim.done && sim.empty >= 3) {
      const hiddens = findHiddens(sim.grid);
      if (hiddens.length >= 1) {
        best = {board, solution: sol, cages: [], given, initialNakeds: initialNakeds.length, afterNakedsEmpty: sim.empty, hiddens: hiddens.length};
        console.log(`🎉 尝试${attempts}次找到（放宽条件）！`);
        builder.printGrid(board, SIZE);
        console.log(`提示:${given}, 裸单:${initialNakeds.length}, 剩${sim.empty}空, 隐单:${hiddens.length}`);
        const fs = require('fs');
        fs.writeFileSync('./tools/level100-final.json', JSON.stringify(best, null, 2));
        process.exit(0);
      }
    }
  }
}
console.log('❌ 没找到');
