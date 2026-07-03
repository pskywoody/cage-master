/**
 * 调试：验证求解器和人类模拟器是否正确工作
 */

const fs = require('fs');
const path = require('path');

// 测试1：检查 levels-killer.json 格式
const levels = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
  'utf-8'
));

console.log('=== levels-killer.json 格式检查 ===');
const lv = levels[0];
console.log('第1题 keys:', Object.keys(lv));
console.log('id:', lv.id, 'name:', lv.name, 'difficulty:', lv.difficulty);
console.log('cells 尺寸:', lv.cells.length, 'x', lv.cells[0].length);
console.log('cages 数量:', lv.cages.length);
console.log('cage[0]:', JSON.stringify(lv.cages[0]));

// 测试2：检查 createSolver 的笼子格式
const { createSolver } = require(path.join(__dirname, '..', 'crawlers', 'killer-generator.js'));

// 构造 solver 期望的 cages 格式
const cagesForSolver = lv.cages.map(c => ({
  id: c.id,
  sum: c.sum,
  cells: c.cells  // 已经是 [[r,c],...] 格式
}));

console.log('\n=== 测试求解器 ===');
try {
  const solver = createSolver(9, 3, 3, cagesForSolver);
  const sols = solver(lv.cells, 3, 10000);
  console.log('解的数量:', sols.length);
  if (sols.length > 0) {
    console.log('第1个解:');
    for (let r = 0; r < 9; r++) {
      console.log('  ' + sols[0][r].join(' '));
    }
  }
} catch (e) {
  console.log('求解器报错:', e.message);
  console.log(e.stack);
}

// 测试3：人类模拟器
const HumanSimulator = require(path.join(__dirname, '..', 'node-script', 'human-simulator.js')).HumanSimulator;

console.log('\n=== 测试人类模拟器 ===');
try {
  const sim = new HumanSimulator(lv.cells, cagesForSolver);
  const result = sim.solve(500);
  console.log('完成:', result.complete);
  console.log('填数步数:', result.totalSteps);
  console.log('技巧统计:', JSON.stringify(result.techniques));
  console.log('剩余空格:', result.complete ? 0 : 81 - result.totalSteps);
  console.log('最后填的5步:');
  result.steps.slice(-5).forEach(s => {
    console.log(`  (${s.row},${s.col})=${s.num} [${s.technique}]`);
  });
} catch (e) {
  console.log('模拟器报错:', e.message);
  console.log(e.stack);
}
