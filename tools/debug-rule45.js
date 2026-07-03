/**
 * 深度调试：为什么45法则用不上？
 * 拿一道简单题，逐步追踪笼子状态
 */

const fs = require('fs');
const path = require('path');
const HumanSimulator = require(path.join(__dirname, '..', 'node-script', 'human-simulator.js')).HumanSimulator;

const levels = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
  'utf-8'
));

// 拿一道简单题
const lv = levels[100]; // 简单级第1题
const cages = lv.cages.map(c => ({ id: c.id, sum: c.sum, cells: c.cells }));

console.log('=== 题目信息 ===');
console.log('名称:', lv.name);
console.log('难度:', lv.difficulty);
console.log('已知数字:', lv.cells.flat().filter(n => n > 0).length);

const sim = new HumanSimulator(lv.cells, cages);

// 找一个2格的笼子，看看初始状态
console.log('\n=== 2格笼子初始状态 ===');
const twoCellCages = cages.filter(c => c.cells.length === 2);
console.log(`2格笼子共 ${twoCellCages.length} 个`);

for (const cage of twoCellCages.slice(0, 5)) {
  const state = sim.cageState[cage.id];
  const cellsInfo = cage.cells.map(([r, c]) => {
    const val = sim.grid[r][c];
    const cands = val === 0 ? Array.from(sim.candidates[r][c]).sort((a,b)=>a-b) : [val];
    return `(${r},${c})=${val || '?'}[${cands.join(',')}]`;
  }).join(' ');
  console.log(`  笼子${cage.id} 和=${cage.sum} 已填=${state.filled}/${cage.cells.length} 和=${state.sum}/${cage.sum}: ${cellsInfo}`);
}

// 手动逐步求解，记录每一步的状态
console.log('\n=== 逐步求解（前30步） ===');
for (let step = 0; step < 30; step++) {
  // 先做一轮摒除
  const eliminated = sim._doEliminationRound();

  // 找45法则能确定的数
  const rule45 = sim._findRule45Placement();
  // 找裸单
  const naked = sim._findNakedSingle();
  // 找隐单
  const hidden = sim._findHiddenSingle();

  let technique = '卡壳';
  let placed = null;

  if (naked) {
    sim._placeNumber(naked.r, naked.c, naked.num, { technique: 'nakedSingle' });
    sim.techniques.nakedSingle++;
    technique = '裸单';
    placed = `(${naked.r},${naked.c})=${naked.num}`;
  } else if (hidden) {
    sim._placeNumber(hidden.r, hidden.c, hidden.num, { technique: 'hiddenSingle' });
    sim.techniques.hiddenSingle++;
    technique = '隐单';
    placed = `(${hidden.r},${hidden.c})=${hidden.num} [${hidden.scope}]`;
  } else if (rule45) {
    sim._placeNumber(rule45.r, rule45.c, rule45.num, { technique: 'rule45' });
    sim.techniques.rule45++;
    technique = '⭐45法则';
    placed = `(${rule45.r},${rule45.c})=${rule45.num} [${rule45.scope}]`;
  } else {
    console.log(`  第${step+1}步: ⚠️ 卡住了！摒除进展=${eliminated ? '有' : '无'}`);
    break;
  }

  if (technique === '⭐45法则' || step < 10 || step % 5 === 4) {
    console.log(`  第${step+1}步: ${technique} ${placed} (摒除:${eliminated ? '有' : '无'})`);
  }
}

console.log('\n=== 最终统计 ===');
console.log('技巧统计:', sim.techniques);
console.log('完成度:', sim._isComplete() ? '100%' : `${Math.round(sim.steps.length/81*100)}%`);
