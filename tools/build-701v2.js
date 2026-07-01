/**
 * 手工构造显性数对教学关 v2
 * 策略：从卡壳状态反推
 * 
 * 我将使用一个经典的显性数对局面：
 * 在某一行中，有两个空格只能是{3,7}，同一行中另一个空格候选为{3,7,9}，
 * 排除3和7后，那个格子只能是9。
 */
const fs = require('fs');
const { KillerSudokuValidator } = require('./puzzle-validator');
const v = new KillerSudokuValidator();
const L = 'ABCDEFGHI';

// 我将从一个经典的、经过验证的数独盘面开始。
// 这是一个我手工设计的盘面，已知在某一步有显性数对。

// 完整解（我将使用一个已知有效的数独解）
const solution = [
  [4,3,5,8,2,1,6,7,9],
  [1,9,2,7,6,5,4,3,8],
  [8,6,7,9,4,3,1,2,5],
  [6,1,3,4,5,9,2,8,7],
  [2,5,9,1,8,7,3,4,6],
  [7,4,8,2,3,6,5,9,1],
  [9,7,6,3,1,4,8,5,2],
  [5,2,4,6,9,8,7,1,3],
  [3,8,1,5,7,2,9,6,4]
];

// 验证
function validateSudoku(grid) {
  for (let r = 0; r < 9; r++) {
    const s = new Set(); for (let c = 0; c < 9; c++) { if (s.has(grid[r][c])) return {ok:false, msg:`行${r}重复${grid[r][c]}`}; s.add(grid[r][c]); }
  }
  for (let c = 0; c < 9; c++) {
    const s = new Set(); for (let r = 0; r < 9; r++) { if (s.has(grid[r][c])) return {ok:false, msg:`列${c}重复${grid[r][c]}`}; s.add(grid[r][c]); }
  }
  for (let br = 0; br < 3; br++) for (let bc = 0; bc < 3; bc++) {
    const s = new Set();
    for (let dr = 0; dr < 3; dr++) for (let dc = 0; dc < 3; dc++) {
      const v = grid[br*3+dr][bc*3+dc]; if (s.has(v)) return {ok:false, msg:`宫${br*3+bc+1}重复${v}`}; s.add(v);
    }
  }
  return {ok:true};
}
console.log('解验证:', validateSudoku(solution));

// 打印解
console.log('\n=== 解 ===');
v.printGrid(solution);

// 候选数计算（仅行/列/宫，不含笼）
function getCands(grid, r, c) {
  const used = new Set();
  for (let i = 0; i < 9; i++) { if (grid[r][i] !== 0) used.add(grid[r][i]); }
  for (let i = 0; i < 9; i++) { if (grid[i][c] !== 0) used.add(grid[i][c]); }
  const br = Math.floor(r/3)*3, bc = Math.floor(c/3)*3;
  for (let i = br; i < br+3; i++) for (let j = bc; j < bc+3; j++) { if (grid[i][j] !== 0) used.add(grid[i][j]); }
  const out = []; for (let n = 1; n <= 9; n++) if (!used.has(n)) out.push(n); return out;
}

// 我将手工选择哪些数字保留为"给定"（givens），使得：
// 1. 初始有3-5个裸单
// 2. 填完裸单+隐单后卡壳
// 3. 卡壳点有显性数对
// 4. 数对排除后产生新裸单，连锁到通关

// 策略：保留足够的数字让开局有3-5个裸单，但在关键区域（将有数对的行/列/宫）留空
// 
// 我选择在D行(r=3)创建显性数对：
// D行解: [6,1,3,4,5,9,2,8,7]
// 我想让D2和D3形成数对。看看需要什么条件。
// D行保留: D1=6, D4=4, D6=9, D7=2, D9=7
// D2, D3, D5, D8为空
// D2候选需要是{1,3}（与D3相同），D5候选需要包含{5,?}但不是1或3
// D8候选需要包含{8,?}但不是1或3
// 
// 这需要通过其他行/列/宫的数字来排除。

// 让我换一种更可靠的方法：先在全填满的盘面上，确定哪些格子需要是空的来形成数对，
// 然后逐步填入其他数字，确保初始裸单数量合适。

// 确定数对位置和效果位置：
// 我选择第5行(F行, r=5)作为数对行
// F行解: [7,4,8,2,3,6,5,9,1]
// 让F2和F6形成数对？不行，数对需要是同一行/列/宫中两个格子恰好共享相同的两个候选。
// 
// 更好的方案：选择第4列(c=3)作为数对列
// 第4列解: D4=2, E4=1, F4=8? 不对，让我重新看solution
// solution:
// A: 4 3 5 | 8 2 1 | 6 7 9
// B: 1 9 2 | 7 6 5 | 4 3 8
// C: 8 6 7 | 9 4 3 | 1 2 5
// D: 6 1 3 | 4 5 9 | 2 8 7
// E: 2 5 9 | 1 8 7 | 3 4 6
// F: 7 4 8 | 2 3 6 | 5 9 1
// G: 9 7 6 | 3 1 4 | 8 5 2
// H: 5 2 4 | 6 9 8 | 7 1 3
// I: 3 8 1 | 5 7 2 | 9 6 4

// 让我在第4宫(D1-F3)中创建数对：
// D1=6, D2=1, D3=3
// E1=2, E2=5, E3=9
// F1=7, F2=4, F3=8
// 这个宫填满了。
// 
// 第5宫(D4-F6):
// D4=4, D5=5, D6=9
// E4=1, E5=8, E6=7
// F4=2, F5=3, F6=6
// 
// 第6宫(D7-F9):
// D7=2, D8=8, D9=7
// E7=3, E8=4, E9=6
// F7=5, F9=1
// 
// 我需要在某个区域留下两个格子只有{1,3}候选（或其他数对）。
// 让我尝试在D行创建数对：
// 如果我挖空D2, D3, D5, D8以及其他行的相关数字来排除：
// - 需要让D2和D3的候选数都是{1,3}
// - D2=1, D3=3是解
// - 所以D2候选{1,3}, D3候选{1,3}
// - 这意味着D行不能有其他1和3（D2和D3已经占了1和3的位置）
// - D行已有6,4,9,2,7 → 缺1,3,5,8
// - 所以D5候选是{5,8}, D8候选是{5,8}... 不对，解是D5=5,D8=8
// - 那如果D5和D8候选都是{5,8}，那就是数对了，但这不是我要的
// 
// 让我换个方案。在第4行(D行)保留6,_,_,4,_,9,2,_,7
// 缺1,3,5,8。我要D2和D5形成数对{3,5}，那么D3候选{1,8}, D8候选{1,8}
// 不对，解是D2=1,D3=3,D5=5,D8=8。
// 如果我要D2候选{3,5}，那需要1在D行中出现在其他位置...不行，D行只有D2=1
// 
// 我需要换一个数对方案。让我在第2列创建数对：
// 第2列解: A2=3,B2=9,C2=6,D2=1,E2=5,F2=4,G2=7,H2=2,I2=8
// 第2列没有重复。
// 
// 让我直接用一个不同的solution，这个solution太规整了（按数字顺序排列），不容易产生数对。
// 我需要一个更"混乱"的solution。

// 使用一个经典的有数对的数独盘面作为起点
const solution2 = [
  [3,4,5,8,2,1,6,7,9],
  [1,9,2,7,6,5,4,3,8],
  [8,6,7,9,4,3,1,2,5],
  [6,1,3,4,5,9,2,8,7],
  [4,5,9,2,8,7,3,1,6],
  [7,2,8,1,3,6,5,9,4],
  [9,7,6,3,1,4,8,5,2],
  [2,3,4,5,9,8,7,6,1],
  [5,8,1,6,7,2,9,4,3]
];
console.log('\n解2验证:', validateSudoku(solution2));
v.printGrid(solution2);

// 实际上让我换一个策略：使用一个我已知有数对的经典数独题。
// 或者，我可以直接从701关的solution出发，但修复笼子错误，然后调整初始给定数字。

// 让我看看当前701关的solution：
const sol701 = [
  [3,4,5,8,2,1,6,7,9],
  [1,9,2,7,6,5,4,3,8],
  [8,6,7,9,4,3,1,2,5],
  [6,1,3,4,5,9,2,8,7],
  [4,5,9,2,8,7,3,1,6],
  [7,2,8,1,3,6,5,9,4],
  [9,7,6,3,1,4,8,5,2],
  [2,3,4,5,9,8,7,6,1],
  [5,8,1,6,7,2,9,4,3]
];
// 等等，让我从chapters.json中读取701关的solution
const chaptersData = JSON.parse(fs.readFileSync('d:/killersudoku/game-src/data/chapters.json', 'utf8'));
let level701 = null;
for (const key of Object.keys(chaptersData)) {
  const ch = chaptersData[key];
  if (ch.levels) for (const lv of ch.levels) if (lv.levelId === 701) { level701 = lv; break; }
  if (level701) break;
}
const sol701actual = level701.solution;
console.log('\n=== 701关实际solution ===');
v.printGrid(sol701actual);
console.log('验证:', validateSudoku(sol701actual));

// 现在问题是笼子有重复数字。我需要重新设计笼子，使得：
// 1. 每个笼子内数字不重复
// 2. 笼子和值正确
// 3. 笼子划分合理（连通、不交叉）
// 4. 笼子约束本身不会使得裸单太多（即不要有太多单格笼直接暴露答案）

// 最好的方法是把整个盘面划分成2-4格的小笼子，每个笼子内数字不重复，和值正确。
// 让我系统地划分笼子。

function designCages(sol) {
  const cages = [];
  const visited = Array(9).fill(null).map(() => Array(9).fill(false));
  let cageId = 1;
  const labels = 'ABCDEFGHI';
  
  // 使用简单的贪心策略：从左到右，从上到下，给未访问的格子分配笼子
  function getNeighbors(r, c) {
    const n = [];
    if (r > 0 && !visited[r-1][c]) n.push([r-1, c]);
    if (r < 8 && !visited[r+1][c]) n.push([r+1, c]);
    if (c > 0 && !visited[r][c-1]) n.push([r, c-1]);
    if (c < 8 && !visited[r][c+1]) n.push([r, c+1]);
    return n;
  }
  
  function hasDuplicateInCage(cells) {
    const seen = new Set();
    for (const [r,c] of cells) {
      if (seen.has(sol[r][c])) return true;
      seen.add(sol[r][c]);
    }
    return false;
  }
  
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (visited[r][c]) continue;
    
    // Start a new cage, try to make it 2-3 cells
    const cells = [[r,c]];
    visited[r][c] = true;
    
    // Try to add 1-2 more adjacent cells
    const targetSize = 2 + Math.floor(Math.random() * 2); // 2 or 3
    let frontier = getNeighbors(r, c);
    
    while (cells.length < targetSize && frontier.length > 0) {
      // Pick a random neighbor
      const idx = Math.floor(Math.random() * frontier.length);
      const [nr, nc] = frontier.splice(idx, 1)[0];
      if (visited[nr][nc]) continue;
      
      const testCells = [...cells, [nr, nc]];
      if (!hasDuplicateInCage(testCells)) {
        cells.push([nr, nc]);
        visited[nr][nc] = true;
        // Add new neighbors
        for (const [nnr, nnc] of getNeighbors(nr, nc)) {
          if (!visited[nnr][nnc]) frontier.push([nnr, nnc]);
        }
      }
    }
    
    let sum = 0;
    for (const [cr, cc] of cells) sum += sol[cr][cc];
    cages.push({ id: cageId++, sum, cells });
  }
  
  return cages;
}

// Generate many cage layouts and test
for (let attempt = 0; attempt < 100; attempt++) {
  const cages = designCages(sol701actual);
  
  // Build boardData: start with all givens from sol701actual's boardData, but we need to redesign
  // Let's instead create a boardData that has the right properties
  // For now, use the existing boardData but with corrected cages and test
  const testLevel = {
    boardData: level701.boardData,
    cages: cages,
    solution: sol701actual
  };
  
  const report = v.validate(testLevel, {maxInitialNaked: 8});
  if (report.valid && report.info.nakedPairsAtStuckPoint > 0 && report.info.beforePairFilled < 35) {
    console.log(`\n✅ 尝试${attempt}: 找到有效笼子划分!`);
    console.log(`初始裸单: ${report.info.initialNakedSingles}, 基础填: ${report.info.beforePairFilled}, 卡壳空格: ${report.info.beforePairEmpty}, 数对: ${report.info.nakedPairsAtStuckPoint}`);
    if (report.info.breakthroughPair) {
      console.log(`破局: ${JSON.stringify(report.info.breakthroughPair.cells)}={${report.info.breakthroughPair.nums}} 多米诺:${report.info.dominoComplete}`);
    }
    
    // Save this cage layout
    fs.writeFileSync('d:/killersudoku/tools/cages-candidate.json', JSON.stringify(cages, null, 2));
    console.log('保存到 tools/cages-candidate.json');
    break;
  }
}

// 实际上随机生成笼子不太可能自动满足教学要求。让我手工调整boardData。
// 核心问题是boardData初始给定太少/太多导致裸单连锁坍塌。
// 让我分析现有boardData为什么坍塌。

console.log('\n=== 分析现有701关的坍塌原因 ===');
// 当前boardData初始40个空格。让我找出哪些初始数字如果保留/挖空可以改变裸单连锁。
// 现有boardData：
const bd = level701.boardData;
console.log('初始给定数:', 81 - bd.flat().filter(v=>v===0).length);

// 让我尝试：增加初始给定数字（减少空格），使得裸单连锁在达到数对之前停止
// 或者：减少初始给定，使得开局裸单更少？不对，减少给定会增加裸单。
// 
// 等等，问题是裸单太多导致连锁坍塌。
// 初始有4个裸单(A5=2,A7=6,D8=1,I6=2)，但D8=1是错误的（由于笼5重复导致）。
// 如果修复了笼子，D8就不是裸单了。让我先修复笼子，再看裸单数量。

// 让我手工设计一个干净的笼子布局。
// 我将采用最直接的方式：将盘面划分为全部2格笼（水平或垂直相邻），确保每笼数字不同。

console.log('\n=== 手工设计笼子 ===');
const handCages = [];
let cid = 1;

// 我将逐行划分2格笼（水平相邻），遇到冲突时改为单格或3格
function addCage(cells) {
  let sum = 0;
  const seen = new Set();
  for (const [r,c] of cells) {
    sum += sol701actual[r][c];
    if (seen.has(sol701actual[r][c])) return false; // duplicate
    seen.add(sol701actual[r][c]);
  }
  handCages.push({ id: cid++, sum, cells });
  return true;
}

// 简单划分：每行水平2格一组，最后一个如果冲突就单独
// 这样划分太机械了。让我直接用单格笼和双格笼混合来验证boardData。
// 先用全部单格笼（sum=该格数字），这样cage约束不增加额外信息。
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  addCage([[r,c]]);
}

// 测试单格笼下的裸单情况（等价于纯数独）
const testLevel1 = {
  boardData: level701.boardData,
  cages: handCages,
  solution: sol701actual
};
const r1 = v.validate(testLevel1, {maxInitialNaked: 10});
console.log('单格笼（纯数独）验证:');
console.log(`  初始裸单: ${r1.info.initialNakedSingles}, 基础填: ${r1.info.beforePairFilled}, 卡壳: ${r1.info.beforePairEmpty}, 数对: ${r1.info.nakedPairsAtStuckPoint}`);
if (r1.errors.length > 0) {
  for (const e of r1.errors) console.log(`  ❌ ${e}`);
}
// 打印推演步骤
console.log('  步骤:', r1.steps.slice(0, 10).join(' → '));
if (r1.steps.length > 10) console.log(`  ... 共${r1.steps.length}步`);
