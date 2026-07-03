/**
 * 调试：为什么人类模拟器的 45法则 使用量为 0？
 */

const fs = require('fs');
const path = require('path');
const HumanSimulator = require(path.join(__dirname, '..', 'node-script', 'human-simulator.js')).HumanSimulator;

const levels = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
  'utf-8'
));

// 拿一道入门级的题
const lv = levels[0];
const cages = lv.cages.map(c => ({
  id: c.id,
  sum: c.sum,
  cells: c.cells
}));

console.log('=== 关卡信息 ===');
console.log('名称:', lv.name);
console.log('难度:', lv.difficulty);
console.log('笼子数:', cages.length);
console.log('已知数字:', lv.cells.flat().filter(n => n > 0).length, '/ 81');

// 初始化模拟器
const sim = new HumanSimulator(lv.cells, cages);

console.log('\n=== 初始候选检查 ===');
// 检查一个空格子的候选
let emptyCell = null;
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    if (lv.cells[r][c] === 0) {
      emptyCell = [r, c];
      break;
    }
  }
  if (emptyCell) break;
}

if (emptyCell) {
  const [r, c] = emptyCell;
  console.log(`格子 (${r},${c}) 的候选:`, Array.from(sim.candidates[r][c]).sort((a,b)=>a-b));
  const cageId = sim.cageIdMap[r][c];
  console.log(`所属笼子: ${cageId}, 和为: ${sim.cageMap[cageId].sum}`);
}

console.log('\n=== 检查45法则函数 ===');
console.log('typeof _findRule45Placement:', typeof sim._findRule45Placement);
console.log('typeof _rule45ForScope:', typeof sim._rule45ForScope);

// 手动跑一轮看看
console.log('\n=== 手动跑 10 步 ===');
for (let i = 0; i < 10; i++) {
  const eliminated = sim._doEliminationRound();
  const naked = sim._findNakedSingle();
  const hidden = sim._findHiddenSingle();
  const rule45 = sim._findRule45Placement();

  console.log(`第${i+1}轮: 摒除进展=${eliminated ? '有' : '无'}, 裸单=${naked ? `(${naked.r},${naked.c})=${naked.num}` : '无'}, 隐单=${hidden ? '有' : '无'}, 45法则=${rule45 ? '有' : '无'}`);

  if (naked) {
    sim._placeNumber(naked.r, naked.c, naked.num, { technique: 'nakedSingle' });
  } else if (hidden) {
    sim._placeNumber(hidden.r, hidden.c, hidden.num, { technique: 'hiddenSingle' });
  } else if (rule45) {
    sim._placeNumber(rule45.r, rule45.c, rule45.num, { technique: 'rule45' });
    console.log('  ⭐ 45法则应用!', rule45);
  } else {
    console.log('  ⚠️ 卡住了!');
    break;
  }
}

console.log('\n=== 最终统计 ===');
console.log('技巧统计:', sim.techniques);
console.log('已填步数:', sim.steps.length);
