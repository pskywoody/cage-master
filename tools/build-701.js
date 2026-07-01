/**
 * 构造第701关（显性数对教学关）
 * 策略：从一个合法数独解出发，手工设计笼子和初始数字，确保：
 * 1. 初始裸单3-5个
 * 2. 填完裸单+隐单后卡壳
 * 3. 卡壳点恰好有一个显性数对
 * 4. 应用数对排除后连锁收官
 */
const fs = require('fs');
const { KillerSudokuValidator } = require('./puzzle-validator');

const v = new KillerSudokuValidator();
const L = 'ABCDEFGHI';

// ========== 第一步：确定一个合法数独解 ==========
// 使用一个经典的合法数独解
const solution = [
  [1, 2, 3, 4, 5, 6, 7, 8, 9],
  [4, 5, 6, 7, 8, 9, 1, 2, 3],
  [7, 8, 9, 1, 2, 3, 4, 5, 6],
  [2, 3, 1, 5, 6, 4, 8, 9, 7],
  [5, 6, 4, 8, 9, 7, 2, 3, 1],
  [8, 9, 7, 2, 3, 1, 5, 6, 4],
  [3, 1, 2, 6, 4, 5, 9, 7, 8],
  [6, 4, 5, 9, 7, 8, 3, 1, 2],
  [9, 7, 8, 3, 1, 2, 6, 4, 5]
];

// 验证这是合法数独
function validateSudoku(grid) {
  for (let r = 0; r < 9; r++) {
    const seen = new Set();
    for (let c = 0; c < 9; c++) { if (seen.has(grid[r][c])) return false; seen.add(grid[r][c]); }
  }
  for (let c = 0; c < 9; c++) {
    const seen = new Set();
    for (let r = 0; r < 9; r++) { if (seen.has(grid[r][c])) return false; seen.add(grid[r][c]); }
  }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const seen = new Set();
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
      const v = grid[br*3+dr][bc*3+dc]; if (seen.has(v)) return false; seen.add(v);
    }
  }
  return true;
}
console.log('解合法:', validateSudoku(solution));

// ========== 第二步：设计笼子 ==========
// 我将设计简单的笼子（2-4格为主），确保：
// - 每个笼子内数字不重复
// - 笼子和值正确
// - 笼子形状合理（相邻格子）

// 让我采用一种系统方法：将盘面划分为合理的笼子
// 然后通过选择哪些数字作为"给定"来控制难度

// 先打印解
console.log('\n=== 标准解 ===');
v.printGrid(solution);

// 设计笼子 - 手工划分，每个笼子2-4格，形状为L形或直线形
// 我将从左上角开始，逐区域设计
const cages = [];
let cageId = 1;

function addCage(cells, id) {
  let sum = 0;
  for (const [r,c] of cells) sum += solution[r][c];
  cages.push({ id: id || cageId++, sum, cells });
  return sum;
}

// 我需要非常小心地设计笼子使得：
// 1. 笼子不交叉重叠
// 2. 每个笼子内数字不重复（这在标准数独中同一行/列/宫的格子自然满足，但笼子可能跨宫）
// 3. 笼子形状是连通的

// 采用策略：先设计一个满足"卡壳有数对"的盘面，再反推笼子

// ========== 更直接的方法：手工构造教学盘面 ==========
// 我需要一个盘面，其中：
// - 某行/列/宫中恰好有两个空格，它们共享相同的两个候选数
// - 这两个候选数排除后，同一区域的其他某个空格变为裸单
// - 这个裸单引发连锁直到通关

// 让我换一个思路：直接写一个满足条件的boardData和cages
// 使用一个经典的naked pair教学局面

// 经典显性数对例子（在D行）：
// D行已填: 2, _, _, 5, _, 4, 8, _, 7
// 使得D2和D3恰好有候选{1,3}（形成数对）
// 然后D5有候选{6,9}（不，我需要D5在排除1,3后只剩一个候选）
// 不对，数对的效果是：D2=1/3, D3=1/3 → D行其他空格不能是1或3

// 让我直接构造：
// 从solution出发，保留大约40-45个数字作为"给定"，其余为0
// 然后设计笼子使得笼子约束恰好制造出需要数对的局面

// 简化方法：先生成一个纯标准数独（无笼子）的naked pair题，再加笼子
// 对于纯标准数独，笼子规则不增加额外约束（只要笼子内数字不重复且和正确）

// 让我先不考虑笼子，只做标准数独的naked pair教学题，然后再把笼子作为"装饰"加上去
// （笼子做成单格笼，和值就是那个格子的数字，这样笼子不提供任何额外信息）

// 不对，杀手数独的笼子应该是有意义的。但为了教学显性数对（标准数独技巧），
// 我们可以设计笼子使得笼子本身不直接给出答案，但笼子约束不违反数对教学目的。

// 最简单的方法：大部分笼子做成单格笼（和值=该格数字），少数2格笼做成合法的和值
// 这样笼子约束等价于"无额外信息"（因为单格笼的和值直接告诉你答案，不行！）

// 那就把笼子设计成2格笼，和值正确，但笼子的两个格子在同一行/列/宫中
// 这样笼子和值提供少量信息但不直接给出答案

// 更好的方案：使用3-4格笼，让笼子和值约束不直接帮助解题
// 但保证盘面通过标准数独的行/列/宫规则+naked pair可解

// 让我先用纯数独构造一个naked pair题（无笼子），验证通过后再添加合法笼子

// ========== 构造纯数独naked pair题 ==========
// 从solution出发，挖空使得产生一个显性数对

// 我将采用一种确定性构造：
// 选定目标数对位置和效果位置，然后保留其他所有数字

// 方案：在第5宫（D4-F6）中创建显性数对
// solution第5宫：
// D4=5 D5=6 D6=4
// E4=8 E5=9 E6=7
// F4=2 F5=3 F6=1
// 
// 我想在D行创建数对。D行：[2,3,1,5,6,4,8,9,7]
// 保留D1=2, D4=5, D6=4, D7=8, D9=7，挖空D2,D3,D5,D8
// D2候选: {3,?} 需要让它和D3恰好都是{1,3}或其他数对
//
// 这需要其他行/列/宫的数字配合排除。手工构造太复杂了。
// 让我写一个自动搜索脚本来找到合适的挖空方案。

console.log('\n=== 自动搜索合适的挖空方案 ===');

// 方法：从完整解开始，逐步挖空（把数字改为0），每次挖空后检查：
// 1. 是否仍有唯一解（通过简单的裸单+隐单+数对链检查）
// 2. 跟踪裸单连锁长度
// 3. 当裸单连锁到某个点停止且存在显性数对时，检查数对是否导致收官

// 简化版：我们不需要保证唯一解（教学关可以通过引导来保证），
// 只需要保证：游戏引擎的提示系统（裸单>隐单>数对）能一路引导到终点

function getCandidatesNoCage(grid, r, c) {
  const used = new Set();
  for (let i = 0; i < 9; i++) { if (grid[r][i] !== 0) used.add(grid[r][i]); }
  for (let i = 0; i < 9; i++) { if (grid[i][c] !== 0) used.add(grid[i][c]); }
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  for (let i = br; i < br+3; i++) for (let j = bc; j < bc+3; j++) { if (grid[i][j] !== 0) used.add(grid[i][j]); }
  const out = [];
  for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n);
  return out;
}

function findNS(grid) {
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (grid[r][c] !== 0) continue;
    const ca = getCandidatesNoCage(grid, r, c);
    if (ca.length === 1) return {r, c, num: ca[0]};
  }
  return null;
}

function findHS(grid) {
  for (let r = 0; r < 9; r++) {
    const pm = new Map();
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue;
      for (const n of getCandidatesNoCage(grid, r, c)) {
        if (!pm.has(n)) pm.set(n, []);
        pm.get(n).push(c);
      }
    }
    for (const [n, cs] of pm) if (cs.length === 1) return {r, c: cs[0], num: n};
  }
  for (let c = 0; c < 9; c++) {
    const pm = new Map();
    for (let r = 0; r < 9; r++) {
      if (grid[r][c] !== 0) continue;
      for (const n of getCandidatesNoCage(grid, r, c)) {
        if (!pm.has(n)) pm.set(n, []);
        pm.get(n).push(r);
      }
    }
    for (const [n, rs] of pm) if (rs.length === 1) return {r: rs[0], c, num: n};
  }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const pm = new Map();
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
      const r = br*3+dr, c = bc*3+dc;
      if (grid[r][c] !== 0) continue;
      for (const n of getCandidatesNoCage(grid, r, c)) {
        if (!pm.has(n)) pm.set(n, []);
        pm.get(n).push([r,c]);
      }
    }
    for (const [n, ps] of pm) if (ps.length === 1) return {r: ps[0][0], c: ps[0][1], num: n};
  }
  return null;
}

function simulateCascade(grid) {
  const g = grid.map(r => [...r]);
  let filled = 0;
  while (true) {
    const ns = findNS(g);
    if (ns) { g[ns.r][ns.c] = ns.num; filled++; continue; }
    const hs = findHS(g);
    if (hs && getCandidatesNoCage(g, hs.r, hs.c).includes(hs.num)) { g[hs.r][hs.c] = hs.num; filled++; continue; }
    break;
  }
  let empty = 0;
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (g[r][c] === 0) empty++;
  return {grid: g, filled, empty};
}

function findNakedPairsNoCage(grid) {
  const pairs = [];
  for (let r = 0; r < 9; r++) {
    const bi = [];
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] !== 0) continue;
      const ca = getCandidatesNoCage(grid, r, c);
      if (ca.length === 2) bi.push({r, c, nums: ca});
    }
    for (let i = 0; i < bi.length; i++) for (let j = i+1; j < bi.length; j++) {
      if (bi[i].nums[0] === bi[j].nums[0] && bi[i].nums[1] === bi[j].nums[1]) {
        // Check if this pair eliminates something
        const {nums} = bi[i];
        let elim = 0, determined = null;
        for (let c = 0; c < 9; c++) {
          if ((c===bi[i].c||c===bi[j].c) || grid[r][c] !== 0) continue;
          const ca = getCandidatesNoCage(grid, r, c);
          const filtered = ca.filter(n => n !== nums[0] && n !== nums[1]);
          if (filtered.length === 1 && ca.length > 1) { determined = {r, c, num: filtered[0]}; elim++; }
        }
        if (determined) pairs.push({type:'row', r1:bi[i].r,c1:bi[i].c,r2:bi[j].r,c2:bi[j].c,nums,determined});
      }
    }
  }
  for (let c = 0; c < 9; c++) {
    const bi = [];
    for (let r = 0; r < 9; r++) {
      if (grid[r][c] !== 0) continue;
      const ca = getCandidatesNoCage(grid, r, c);
      if (ca.length === 2) bi.push({r, c, nums: ca});
    }
    for (let i = 0; i < bi.length; i++) for (let j = i+1; j < bi.length; j++) {
      if (bi[i].nums[0] === bi[j].nums[0] && bi[i].nums[1] === bi[j].nums[1]) {
        const {nums} = bi[i];
        let determined = null;
        for (let r = 0; r < 9; r++) {
          if ((r===bi[i].r||r===bi[j].r) || grid[r][c] !== 0) continue;
          const ca = getCandidatesNoCage(grid, r, c);
          const filtered = ca.filter(n => n !== nums[0] && n !== nums[1]);
          if (filtered.length === 1 && ca.length > 1) { determined = {r, c, num: filtered[0]}; }
        }
        if (determined) pairs.push({type:'col', r1:bi[i].r,c1:bi[i].c,r2:bi[j].r,c2:bi[j].c,nums,determined});
      }
    }
  }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const bi = [];
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
      const r = br*3+dr, c = bc*3+dc;
      if (grid[r][c] !== 0) continue;
      const ca = getCandidatesNoCage(grid, r, c);
      if (ca.length === 2) bi.push({r, c, nums: ca});
    }
    for (let i = 0; i < bi.length; i++) for (let j = i+1; j < bi.length; j++) {
      if (bi[i].nums[0] === bi[j].nums[0] && bi[i].nums[1] === bi[j].nums[1]) {
        const {nums} = bi[i];
        let determined = null;
        for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
          const r = br*3+dr, c = bc*3+dc;
          if (((r===bi[i].r&&c===bi[i].c)||(r===bi[j].r&&c===bi[j].c)) || grid[r][c] !== 0) continue;
          const ca = getCandidatesNoCage(grid, r, c);
          const filtered = ca.filter(n => n !== nums[0] && n !== nums[1]);
          if (filtered.length === 1 && ca.length > 1) { determined = {r, c, num: filtered[0]}; }
        }
        if (determined) pairs.push({type:'box', r1:bi[i].r,c1:bi[i].c,r2:bi[j].r,c2:bi[j].c,nums,determined});
      }
    }
  }
  return pairs;
}

// 策略：从solution出发，挖掉大量格子（只保留约30个给定），
// 然后逐步加回数字直到初始裸单<=5，且填完裸单+隐单后卡壳在一个naked pair上

function cloneGrid(g) { return g.map(r => [...r]); }

// 随机尝试不同的挖空模式
function tryConstruct() {
  // 从solution出发，尝试不同的"保留数字"模式
  // 保留对角线上的数字作为种子
  for (let attempt = 0; attempt < 1000; attempt++) {
    // 随机保留约28-35个数字
    const givensCount = 28 + Math.floor(Math.random() * 8);
    const positions = [];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) positions.push([r,c]);
    // Shuffle
    for (let i = positions.length-1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i+1));
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    
    const board = cloneGrid(solution);
    // 先全部挖空
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) board[r][c] = 0;
    // 然后随机保留givensCount个
    for (let i = 0; i < givensCount; i++) {
      const [r,c] = positions[i];
      board[r][c] = solution[r][c];
    }
    
    // 数初始裸单
    let nsCount = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      if (board[r][c] !== 0) continue;
      if (getCandidatesNoCage(board, r, c).length === 1) nsCount++;
    }
    
    if (nsCount < 2 || nsCount > 6) continue;
    
    // 模拟连锁
    const sim = simulateCascade(board);
    if (sim.empty === 0) continue; // 直接填满了，不需要数对
    if (sim.filled < 8) continue; // 填太少了，开局不够
    
    // 找数对
    const pairs = findNakedPairsNoCage(sim.grid);
    if (pairs.length === 0) continue;
    
    // 尝试应用数对看是否能收官
    for (const pair of pairs) {
      const testGrid = cloneGrid(sim.grid);
      // 应用数对排除：在determined位置填入确定的数字
      testGrid[pair.determined.r][pair.determined.c] = pair.determined.num;
      // 继续连锁
      const sim2 = simulateCascade(testGrid);
      if (sim2.empty === 0) {
        // 成功！
        return { board, pair, sim, sim2, nsCount };
      }
    }
  }
  return null;
}

console.log('搜索中...');
const result = tryConstruct();
if (result) {
  console.log('\n✅ 找到合适盘面！');
  console.log(`初始裸单: ${result.nsCount}个`);
  console.log(`基础连锁填: ${result.sim.filled}个, 剩${result.sim.empty}空格`);
  const p = result.pair;
  console.log(`破局数对: ${L[p.r1]}${p.c1+1}和${L[p.r2]}${p.c2+1}={${p.nums[0]},${p.nums[1]}} (${p.type})`);
  console.log(`确定格: ${L[p.determined.r]}${p.determined.c+1}=${p.determined.num}`);
  console.log(`数对后连锁: ${result.sim2.filled}个, 剩${result.sim2.empty}空格 → 收官`);
  
  console.log('\n=== 初始盘面 ===');
  v.printGrid(result.board);
  
  console.log('\n=== 卡壳盘面 ===');
  v.printGrid(result.sim.grid);
  
  // 输出boardData
  console.log('\nboardData:');
  console.log(JSON.stringify(result.board));
  
  // 保存到文件
  const output = {
    boardData: result.board,
    solution: solution,
    pair: result.pair,
    stats: {
      initialNS: result.nsCount,
      basicFilled: result.sim.filled,
      stuckEmpty: result.sim.empty,
      afterPairEmpty: result.sim2.empty
    }
  };
  fs.writeFileSync('d:/killersudoku/tools/puzzle701-candidate.json', JSON.stringify(output, null, 2));
  console.log('\n已保存到 tools/puzzle701-candidate.json');
} else {
  console.log('❌ 未找到合适盘面，尝试增加搜索次数或调整参数');
}
