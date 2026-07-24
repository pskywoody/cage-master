const path = require('path');
const fs = require('fs');
const vm = require('vm');

const sandbox = { window: {}, global: {}, console };
vm.createContext(sandbox);

const raterCode = fs.readFileSync(path.join('d:/killersudoku/cagemaster3/game/tech-rater.js'), 'utf8');
vm.runInContext(raterCode, sandbox);

const adapterCode = fs.readFileSync(path.join('d:/killersudoku/cagemaster3/game/tech-rater-adapter.js'), 'utf8');
vm.runInContext(adapterCode, sandbox);

const { TechRater, TechRaterAdapter } = sandbox.window;

// 加载关卡数据
const levels = JSON.parse(fs.readFileSync('d:/killersudoku/cagemaster3/data/all_levels.json', 'utf8'));
const level = levels.find(l => l.levelId === 203);

// 创建 board
const size = level.gridSize;
const cells = [];
for (let r = 0; r < size; r++) {
  cells[r] = [];
  for (let c = 0; c < size; c++) {
    cells[r][c] = {
      r, c,
      fixedNum: level.cells[r][c] || 0,
      fillNum: 0,
      cageId: null,
      cageIds: [],
    };
  }
}

const cages = level.cages.map(c => ({
  id: c.id,
  sum: c.sum,
  cells: c.cells,
}));

for (const cage of cages) {
  for (const [r, c] of cage.cells) {
    cells[r][c].cageId = cage.id;
    cells[r][c].cageIds.push(cage.id);
  }
}

const board = { size, cells, cages };

const adapter = new TechRaterAdapter(board);

// 手动调试一个 score=3 的格子
console.log('=== 调试 score=3 的格子 ===');

// 先找到 score=3 的格子
const heatmap = adapter.generateHeatmap();
let targetCell = null;
for (let r = 0; r < size && !targetCell; r++) {
  for (let c = 0; c < size && !targetCell; c++) {
    const meta = heatmap.gridMeta[r][c];
    if (meta.depth === 3 && meta.category === 'simple') {
      targetCell = { r, c, meta };
    }
  }
}

if (targetCell) {
  const { r, c, meta } = targetCell;
  console.log(`目标格: (${r}, ${c})`);
  console.log(`  score: ${meta.depth}`);
  console.log(`  category: ${meta.category}`);
  console.log(`  technique: ${meta.technique}`);
  
  // 检查初始候选数
  const initMask = adapter._initialCandidates[r][c];
  const initCount = initMask.toString(2).replace(/0/g, '').length;
  console.log(`  初始候选数: ${initCount}`);
  
  // 检查空间聚集
  const isSpatial = adapter._isSpatiallySalient(r, c);
  console.log(`  空间聚集: ${isSpatial}`);
  
  // 检查笼子显著性
  const isCageSalient = adapter._isCageSalient(r, c);
  console.log(`  笼子显著: ${isCageSalient}`);
  
  // 打印这一行/列/宫的已填数
  let rowFilled = 0;
  for (let cc = 0; cc < size; cc++) {
    if (board.cells[r][cc].fixedNum !== 0) rowFilled++;
  }
  console.log(`  第${r}行已填: ${rowFilled}`);
  
  let colFilled = 0;
  for (let rr = 0; rr < size; rr++) {
    if (board.cells[rr][c].fixedNum !== 0) colFilled++;
  }
  console.log(`  第${c}列已填: ${colFilled}`);
  
  const boxR = Math.floor(r / 3) * 3;
  const boxC = Math.floor(c / 3) * 3;
  let boxFilled = 0;
  for (let rr = boxR; rr < boxR + 3; rr++) {
    for (let cc = boxC; cc < boxC + 3; cc++) {
      if (board.cells[rr][cc].fixedNum !== 0) boxFilled++;
    }
  }
  console.log(`  宫(${boxR},${boxC})已填: ${boxFilled}`);
} else {
  console.log('没有找到 score=3 且 category=simple 的格子');
}

// 再检查分类统计
console.log('\n=== 按分类统计难度分 ===');
const cats = { simple: {}, core: {}, gate: {} };
for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    const meta = heatmap.gridMeta[r][c];
    if (meta.category === 'filled') continue;
    const cat = meta.category;
    const score = meta.depth || 0;
    if (!cats[cat][score]) cats[cat][score] = 0;
    cats[cat][score]++;
  }
}
console.log('Simple scores:', JSON.stringify(cats.simple));
console.log('Core scores:', JSON.stringify(cats.core));
console.log('Gate scores:', JSON.stringify(cats.gate));

// 检查 SIMPLE_SCORE_MAX 和 GATE_THRESHOLD
console.log('\n=== 配置 ===');
console.log('SIMPLE_SCORE_MAX:', TechRaterAdapter.CONFIG.SIMPLE_SCORE_MAX);
console.log('GATE_DEPTH_THRESHOLD:', TechRaterAdapter.CONFIG.GATE_DEPTH_THRESHOLD);
