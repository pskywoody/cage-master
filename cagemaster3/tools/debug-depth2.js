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
const level = levels.find(l => l.levelId === 203); // 45法则关

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

// 打印初始候选数分布
console.log('=== 初始候选数分布 ===');
let count1 = 0, count2 = 0, count3 = 0, count4 = 0, count5 = 0, count6plus = 0;
let totalEmpty = 0;

for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    const cell = board.cells[r][c];
    const isFilled = cell.fixedNum !== 0;
    if (isFilled) continue;
    totalEmpty++;
    const mask = adapter._initialCandidates[r][c];
    const count = (mask).toString(2).replace(/0/g, '').length;
    if (count === 1) count1++;
    else if (count === 2) count2++;
    else if (count === 3) count3++;
    else if (count === 4) count4++;
    else if (count === 5) count5++;
    else count6plus++;
  }
}

console.log('总空格数:', totalEmpty);
console.log('候选数=1:', count1, '(' + Math.round(count1/totalEmpty*100) + '%)');
console.log('候选数=2:', count2, '(' + Math.round(count2/totalEmpty*100) + '%)');
console.log('候选数=3:', count3, '(' + Math.round(count3/totalEmpty*100) + '%)');
console.log('候选数=4:', count4, '(' + Math.round(count4/totalEmpty*100) + '%)');
console.log('候选数=5:', count5, '(' + Math.round(count5/totalEmpty*100) + '%)');
console.log('候选数=6+:', count6plus, '(' + Math.round(count6plus/totalEmpty*100) + '%)');

// 打印 stepMap 中的难度分分布
const heatmap = adapter.generateHeatmap();
console.log('\n=== 难度分分布 ===');
const scoreDist = {};
for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    const meta = heatmap.gridMeta[r][c];
    if (meta.category === 'filled') continue;
    const s = meta.depth || 0;
    scoreDist[s] = (scoreDist[s] || 0) + 1;
  }
}
console.log('Score distribution:', JSON.stringify(scoreDist));
console.log('Categories:', JSON.stringify(heatmap.stats));

// 打印几个典型格子的详细信息
console.log('\n=== 样本格子详情（前10个空格） ===');
let printed = 0;
for (let r = 0; r < size && printed < 10; r++) {
  for (let c = 0; c < size && printed < 10; c++) {
    const cell = board.cells[r][c];
    if (cell.fixedNum !== 0) continue;
    const mask = adapter._initialCandidates[r][c];
    const count = (mask).toString(2).replace(/0/g, '').length;
    const meta = heatmap.gridMeta[r][c];
    console.log(`  (${r},${c}): initCands=${count}, score=${meta.depth}, category=${meta.category}`);
    printed++;
  }
}
