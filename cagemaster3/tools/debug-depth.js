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

const rater = new TechRater(board);
const result = rater.solve(200);

console.log('Total steps:', result.steps.length);
console.log('Solvable:', result.solvable);

// 统计步骤类型
const typeCount = {};
const techCount = {};
let maxCumDepth = 0;

let runningMaxElim = 0;
for (let i = 0; i < result.steps.length; i++) {
  const step = result.steps[i];
  typeCount[step.type] = (typeCount[step.type] || 0) + 1;
  techCount[step.technique] = (techCount[step.technique] || 0) + 1;
  
  if (step.type === 'elimination') {
    if (step.depth > runningMaxElim) runningMaxElim = step.depth;
  }
  
  if (step.type === 'fill') {
    const cum = runningMaxElim + (step.depth || 0);
    if (cum > maxCumDepth) maxCumDepth = cum;
  }
  
  if (i < 40) {
    console.log('Step ' + i + ': ' + step.type + ' ' + step.technique + ' depth=' + step.depth + (step.type === 'fill' ? ' val=' + step.num + ' pos=(' + step.row + ',' + step.col + ')' : ''));
  }
}

console.log('\nStep types:', JSON.stringify(typeCount));
console.log('Techniques:', JSON.stringify(techCount));
console.log('Max cumulative depth:', maxCumDepth);
console.log('Running max elim depth:', runningMaxElim);

// 检查 adapter 的结果
const adapter = new TechRaterAdapter(board);
const heatmap = adapter.generateHeatmap();
console.log('\nHeatmap stats:', JSON.stringify(heatmap.stats));

// 看看各个格子的深度分布
const depthDist = {};
let gateCount = 0;
let coreCount = 0;
let simpleCount = 0;
for (let r = 0; r < size; r++) {
  for (let c = 0; c < size; c++) {
    const meta = heatmap.gridMeta[r][c];
    if (meta.category === 'filled') continue;
    const d = meta.depth || 0;
    depthDist[d] = (depthDist[d] || 0) + 1;
    if (meta.category === 'gate') gateCount++;
    else if (meta.category === 'core') coreCount++;
    else simpleCount++;
  }
}
console.log('Depth distribution:', JSON.stringify(depthDist));
console.log('Categories: simple=' + simpleCount + ' core=' + coreCount + ' gate=' + gateCount);
console.log('GATE_THRESHOLD:', sandbox.window.TechRaterAdapter ? 'checking...' : 'not found');

// 检查配置
console.log('\nAdapter CONFIG:', JSON.stringify(TechRaterAdapter.CONFIG));
