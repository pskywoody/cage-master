/**
 * 调试：检查 TechRaterAdapter 对第101关的分类结果
 */

const fs = require('fs');
const path = require('path');

// 模拟浏览器环境
global.window = global;

// 加载 board.js
const boardPath = path.join(__dirname, '..', 'game', 'board.js');
eval(fs.readFileSync(boardPath, 'utf-8'));
const Board = global.Board;

// 加载 tech-rater.js
const techRaterPath = path.join(__dirname, '..', 'game', 'tech-rater.js');
const techRaterModule = require(techRaterPath);
const TechRater = techRaterModule.TechRater || techRaterModule;

// 加载 tech-rater-adapter.js
const adapterPath = path.join(__dirname, '..', 'game', 'tech-rater-adapter.js');
eval(fs.readFileSync(adapterPath, 'utf-8'));
const TechRaterAdapter = global.TechRaterAdapter;

// 读取第1关数据
const chapterData = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'data', 'chapters', 'chapter-01.json'), 'utf-8'
));
const level = chapterData.levels[0];

console.log('关卡:', level.levelId, level.title);
console.log('gridSize:', level.gridSize);
console.log('空格数:', level.boardData.reduce((s, r) => s + r.filter(v => v === 0).length, 0));
console.log('笼子数:', (level.cages || []).length);
console.log('');

// 创建 board
const board = new Board(level.gridSize);
board.loadLevel({
  cells: level.boardData,
  cages: level.cages || [],
});

console.log('Board 创建成功');
console.log('board.size:', board.size);
console.log('board.cells[0][0]:', board.cells[0][0]);
console.log('');

// 创建 adapter
console.log('创建 TechRaterAdapter...');
try {
  const adapter = new TechRaterAdapter(board);
  console.log('Adapter 创建成功');
  console.log('adapter.size:', adapter.size);
  console.log('adapter.solveResult:', adapter.solveResult ? '存在' : 'null');
  if (adapter.solveResult) {
    console.log('  solvable:', adapter.solveResult.solvable);
    console.log('  steps:', adapter.solveResult.steps?.length || 0);
  }
  console.log('');

  console.log('生成 heatmap (novice)...');
  const heatmap = adapter.generateHeatmap('novice');
  console.log('heatmap.status:', heatmap.status);
  console.log('heatmap.stats:', JSON.stringify(heatmap.stats));
  console.log('');

  // 检查 gridMeta
  const gridMeta = heatmap.gridMeta;
  let simple = 0, gate = 0, core = 0, filled = 0;
  for (let r = 0; r < adapter.size; r++) {
    for (let c = 0; c < adapter.size; c++) {
      const cat = gridMeta[r][c].category;
      if (cat === 'simple') simple++;
      else if (cat === 'gate') gate++;
      else if (cat === 'core') core++;
      else if (cat === 'filled') filled++;
    }
  }
  console.log(`gridMeta 分类: simple=${simple}, gate=${gate}, core=${core}, filled=${filled}`);
  console.log('');

  // 检查 timeline
  if (heatmap.rhythmTimeline) {
    console.log('timeline.phases:');
    const phases = heatmap.rhythmTimeline.phases;
    console.log('  opening.cellKeys:', phases?.opening?.cellKeys?.length || 0);
    console.log('  breakthrough.gateCells:', phases?.breakthrough?.gateCells?.length || 0);
    console.log('  avalanche.dominoSequence:', phases?.avalanche?.dominoSequence?.length || 0);
  } else {
    console.log('timeline: null');
  }

} catch (e) {
  console.error('ERROR:', e.message);
  console.error(e.stack);
}
