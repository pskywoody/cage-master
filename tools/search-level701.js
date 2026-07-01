/**
 * 自动搜索器：从完整盘面逐步挖空，直到找到满足教学要求的配置
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require('./puzzle-validator.js');

const v = new KillerSudokuValidator();

// 使用相同的数独终盘和笼子（笼子设计是好的）
const solution = [
  [5,3,4,6,7,8,9,1,2],
  [6,7,2,1,9,5,3,4,8],
  [1,9,8,3,4,2,5,6,7],
  [8,5,9,7,6,1,4,2,3],
  [4,2,6,8,5,3,7,9,1],
  [7,1,3,9,2,4,8,5,6],
  [9,6,1,5,3,7,2,8,4],
  [2,8,7,4,1,9,6,3,5],
  [3,4,5,2,8,6,1,7,9]
];

// 与 build-level701.js 相同的笼子设计
const cages = [
  { id: 1, sum: 5, cells: [[0,0]] },
  { id: 2, sum: 6, cells: [[1,0]] },
  { id: 3, sum: 10, cells: [[0,1],[1,1]] },
  { id: 4, sum: 10, cells: [[2,0],[2,1]] },
  { id: 5, sum: 14, cells: [[0,2],[1,2],[2,2]] },
  { id: 6, sum: 7, cells: [[0,3],[1,3]] },
  { id: 7, sum: 7, cells: [[0,4]] },
  { id: 8, sum: 13, cells: [[1,4],[2,4]] },
  { id: 9, sum: 8, cells: [[0,5]] },
  { id: 10, sum: 7, cells: [[1,5],[2,5]] },
  { id: 11, sum: 12, cells: [[0,6],[1,6]] },
  { id: 12, sum: 11, cells: [[0,7],[1,7],[2,7]] },
  { id: 13, sum: 17, cells: [[0,8],[1,8],[2,8]] },
  { id: 14, sum: 3, cells: [[2,3]] },
  { id: 15, sum: 5, cells: [[2,6]] },
  { id: 16, sum: 19, cells: [[3,0],[4,0],[5,0]] },
  { id: 17, sum: 8, cells: [[3,1],[4,1],[5,1]] },
  { id: 18, sum: 9, cells: [[3,2]] },
  { id: 19, sum: 9, cells: [[4,2],[5,2]] },
  { id: 20, sum: 15, cells: [[3,3],[4,3]] },
  { id: 21, sum: 9, cells: [[5,3]] },
  { id: 22, sum: 13, cells: [[3,4],[4,4],[5,4]] },
  { id: 23, sum: 8, cells: [[3,5],[4,5],[5,5]] },
  { id: 24, sum: 11, cells: [[3,6],[4,6]] },
  { id: 25, sum: 8, cells: [[5,6]] },
  { id: 26, sum: 16, cells: [[3,7],[4,7],[5,7]] },
  { id: 27, sum: 10, cells: [[3,8],[4,8],[5,8]] },
  { id: 28, sum: 9, cells: [[6,0]] },
  { id: 29, sum: 5, cells: [[7,0],[8,0]] },
  { id: 30, sum: 18, cells: [[6,1],[7,1],[8,1]] },
  { id: 31, sum: 13, cells: [[6,2],[7,2],[8,2]] },
  { id: 32, sum: 11, cells: [[6,3],[7,3],[8,3]] },
  { id: 33, sum: 3, cells: [[6,4]] },
  { id: 34, sum: 9, cells: [[7,4],[8,4]] },
  { id: 35, sum: 22, cells: [[6,5],[7,5],[8,5]] },
  { id: 36, sum: 2, cells: [[6,6]] },
  { id: 37, sum: 7, cells: [[7,6],[8,6]] },
  { id: 38, sum: 8, cells: [[6,7]] },
  { id: 39, sum: 10, cells: [[7,7],[8,7]] },
  { id: 40, sum: 18, cells: [[6,8],[7,8],[8,8]] },
];

// 单格笼位置（强制为给定）
const forced = new Set();
for (const cage of cages) {
  if (cage.cells.length === 1) {
    forced.add(`${cage.cells[0][0]},${cage.cells[0][1]}`);
  }
}
console.log('强制给定(单格笼):', forced.size, '个');

// 非强制位置列表
const optional = [];
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    if (!forced.has(`${r},${c}`)) optional.push([r,c]);
  }
}
console.log('可调位置:', optional.length, '个');

// 检查指定dig集合下的盘面是否满足教学要求
// digSet: Set of "r,c" strings that are dug out (set to 0)
function checkDig(digSet) {
  const bd = solution.map(row => row.slice());
  for (const key of digSet) {
    const [r,c] = key.split(',').map(Number);
    bd[r][c] = 0;
  }
  const level = { boardData: bd, cages, solution };
  const report = v.validate(level, { maxInitialNaked: 5, requireTechnique: 'nakedPair' });
  return { bd, report };
}

// 评分函数：评估当前挖空接近目标的程度
function score(report, digCount) {
  let s = 0;
  // 初始裸单 3-5
  const ns = report.info.initialNakedSingles || 0;
  if (ns >= 3 && ns <= 5) s += 100;
  else s -= Math.abs(ns - 4) * 20;
  // 不能直接填满
  if (report.info.beforePairEmpty === 0) s -= 200;
  // 需要有数对
  const np = report.info.nakedPairsAtStuckPoint || 0;
  if (np >= 1) s += 50;
  // 需要破局数对
  if (report.info.breakthroughPair) s += 200;
  // 需要多米诺收官
  if (report.info.dominoComplete) s += 300;
  // 给定数 30-35 (挖空 46-51)
  const givens = 81 - digCount;
  if (givens >= 30 && givens <= 35) s += 50;
  else s -= Math.abs(givens - 33) * 5;
  // 总合法性
  if (report.valid) s += 500;
  // 错误惩罚
  s -= report.errors.length * 30;
  return s;
}

// 从全给定开始，逐步挖空
// 策略：贪心挖空，每步选使分数最高的挖法
let digSet = new Set(); // 初始全填

// 先全部强制给的情况下看初始分数
let { report: initReport } = checkDig(digSet);
console.log('全给定时验证:', initReport.valid, '初始裸单:', initReport.info.initialNakedSingles);

// 随机重启搜索
const TARGET_GIVENS_MIN = 30;
const TARGET_GIVENS_MAX = 35;
const TARGET_DIG_MIN = 81 - TARGET_GIVENS_MAX; // 46
const TARGET_DIG_MAX = 81 - TARGET_GIVENS_MIN; // 51

const MAX_ATTEMPTS = 5000;

function randomSearch() {
  let bestScore = -Infinity;
  let bestDig = null;
  let bestReport = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // 随机选择挖空集合：从optional中随机挖TARGET_DIG_MIN~TARGET_DIG_MAX个
    const targetDig = TARGET_DIG_MIN + Math.floor(Math.random() * (TARGET_DIG_MAX - TARGET_DIG_MIN + 1));
    // 打乱optional
    const shuffled = optional.slice().sort(() => Math.random() - 0.5);
    const dig = new Set();
    for (let i = 0; i < targetDig; i++) {
      dig.add(`${shuffled[i][0]},${shuffled[i][1]}`);
    }
    
    const { report } = checkDig(dig);
    const s = score(report, targetDig);
    
    if (report.valid && report.info.dominoComplete && report.info.breakthroughPair) {
      console.log(`\n*** 找到候选! 尝试${attempt}: 挖${targetDig}格, 裸单${report.info.initialNakedSingles}, 卡壳空格${report.info.beforePairEmpty}, 数对${report.info.nakedPairsAtStuckPoint}, 破局数对:`, report.info.breakthroughPair.cells, report.info.breakthroughPair.nums);
      return { dig, report };
    }
    
    if (s > bestScore) {
      bestScore = s;
      bestDig = dig;
      bestReport = report;
      if (attempt % 100 === 0 || s > 300) {
        console.log(`尝试${attempt}: score=${s}, 挖${targetDig}, valid=${report.valid}, NS=${report.info.initialNakedSingles}, filled=${report.info.beforePairFilled}, empty=${report.info.beforePairEmpty}, pairs=${report.info.nakedPairsAtStuckPoint}, breakthrough=${!!report.info.breakthroughPair}, domino=${report.info.dominoComplete}`);
        if (report.errors.length) console.log('  错误:', report.errors.slice(0,3));
      }
    }
  }
  return { dig: bestDig, report: bestReport };
}

console.log('开始随机搜索...');
const result = randomSearch();

if (result && result.report && result.report.valid) {
  console.log('\n========== 找到合适配置! ==========');
  const bd = solution.map(row => row.slice());
  for (const key of result.dig) {
    const [r,c] = key.split(',').map(Number);
    bd[r][c] = 0;
  }
  v.printGrid(bd);
  console.log('Report:', JSON.stringify(result.report.info, null, 2));
  
  // 记录下来
  const digList = [...result.dig].map(k => k.split(',').map(Number));
  fs.writeFileSync(path.join(__dirname, 'dig-found.json'), JSON.stringify({
    digList,
    info: result.report.info,
    breakthrough: result.report.info.breakthroughPair
  }, null, 2));
  console.log('挖空列表已保存到 dig-found.json');
} else {
  console.log('\n未找到完美配置，最佳结果:');
  console.log(JSON.stringify(result.report?.info || 'no result', null, 2));
  console.log('错误:', result.report?.errors);
}
