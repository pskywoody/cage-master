/**
 * 追踪笼子10的45法则应用
 */

const fs = require('fs');
const path = require('path');
const HumanSimulator = require(path.join(__dirname, '..', 'node-script', 'human-simulator.js')).HumanSimulator;

const levels = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
  'utf-8'
));

const lv = levels[100]; // 简单级第1题
const cages = lv.cages.map(c => ({ id: c.id, sum: c.sum, cells: c.cells }));

const sim = new HumanSimulator(lv.cells, cages);

// 笼子10: 和=5, 单元格(2,6)=?, (2,7)=4
const cageId = 10;
const cage = sim.cageMap[cageId];
const state = sim.cageState[cageId];

console.log('=== 笼子10 初始状态 ===');
console.log('和:', cage.sum, '已填:', state.filled, '当前和:', state.sum);
console.log('空格:', state.emptyCells);
state.emptyCells.forEach(([r, c]) => {
  console.log(`  (${r},${c}) 候选: [${Array.from(sim.candidates[r][c]).sort((a,b)=>a-b).join(',')}]`);
});

// 手动调用 _rule45ForScope
console.log('\n=== 调用 _rule45ForScope ===');
const result = sim._rule45ForScope('cage', cageId);
console.log('结果:', result);

// 手动分析：剩1格，和应该是5-4=1，候选是[1,3]
// 应该能确定是1，或者至少摒除3
console.log('\n=== 手动分析 ===');
const targetSum = cage.sum - state.sum; // 5-4=1
const emptyCount = state.emptyCells.length; // 1
console.log(`剩余${emptyCount}格，目标和=${targetSum}`);

// 检查 _analyzeRemainingCells
const emptyCells = state.emptyCells;
const cellCandidates = emptyCells.map(([r, c]) =>
  Array.from(sim.candidates[r][c]).sort((a, b) => a - b)
);
console.log('每格候选:', cellCandidates);

// 手动调用 _enumCombinations
const combinations = [];
sim._enumCombinations(cellCandidates, 0, targetSum, [], new Set(), combinations);
console.log('可能的组合数:', combinations.length);
combinations.forEach((c, i) => console.log(`  组合${i+1}: [${c.join(',')}]`));

// 问题可能出在：1格笼子被 _applyCageSumConstraint 在初始化时就处理了？
// 或者 _canPlace 已经做了笼子和值约束检查，候选初始化时就已经过滤了？
console.log('\n=== 检查初始化时的笼子约束 ===');
console.log('候选初始化调用了 _canPlace，它检查笼子和值约束');
console.log('所以笼子剩1格时，_canPlace 应该已经过滤了不可能的数字');
console.log('但笼子10的候选还是[1,3]，说明 _canPlace 没正确过滤');

// 检查 _canPlace
console.log('\n=== 测试 _canPlace(2,6,3) ===');
const canPlace3 = sim._canPlace(2, 6, 3);
console.log('能否放3:', canPlace3);
console.log('(如果是true，说明_canPlace没正确检查笼子最后一格的和值约束)');
