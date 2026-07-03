/**
 * 测试不同难度题目，看看45法则的使用情况
 */

const fs = require('fs');
const path = require('path');
const HumanSimulator = require(path.join(__dirname, '..', 'node-script', 'human-simulator.js')).HumanSimulator;

const levels = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
  'utf-8'
));

// 各难度各抽3道
const diffs = ['入门', '简单', '中等', '困难', '地狱'];

for (const diff of diffs) {
  const group = levels.filter(l => l.difficulty === diff);
  console.log(`\n========== ${diff} ==========`);

  for (let i = 0; i < Math.min(3, group.length); i++) {
    const lv = group[i];
    const cages = lv.cages.map(c => ({ id: c.id, sum: c.sum, cells: c.cells }));
    const known = lv.cells.flat().filter(n => n > 0).length;

    const sim = new HumanSimulator(lv.cells, cages);
    const result = sim.solve(500);
    const rating = sim.getDifficultyRating();

    console.log(`  #${lv.id}: 已知${known}格 | 完成=${result.complete} | 分数=${rating.score}(${rating.level}) | 裸单${result.techniques.nakedSingle} 隐单${result.techniques.hiddenSingle} 45法${result.techniques.rule45} 摒除${result.techniques.elimination}轮`);
  }
}

// 再测一道地狱级的，详细看步骤
console.log('\n\n========== 地狱级详细步骤分析 ==========');
const hellLevel = levels.find(l => l.difficulty === '地狱');
const cages = hellLevel.cages.map(c => ({ id: c.id, sum: c.sum, cells: c.cells }));
const sim = new HumanSimulator(hellLevel.cells, cages);
const result = sim.solve(500);

console.log(`题目: ${hellLevel.name}`);
console.log(`已知数字: ${hellLevel.cells.flat().filter(n => n > 0).length}`);
console.log(`完成: ${result.complete}`);
console.log(`总步数: ${result.totalSteps}`);
console.log(`技巧统计:`, result.techniques);

// 前20步的技巧分布
console.log('\n前20步:');
result.steps.slice(0, 20).forEach((s, i) => {
  console.log(`  ${i+1}. (${s.row},${s.col})=${s.num} [${s.technique}]${s.scope ? ' ' + s.scope : ''}`);
});

// 第一次出现45法则的位置
const first45 = result.steps.findIndex(s => s.technique === 'rule45');
console.log(`\n第一次45法则出现在第 ${first45 >= 0 ? first45 + 1 : 'N/A'} 步`);

// 第一次出现隐单的位置
const firstHidden = result.steps.findIndex(s => s.technique === 'hiddenSingle');
console.log(`第一次隐单出现在第 ${firstHidden >= 0 ? firstHidden + 1 : 'N/A'} 步`);
