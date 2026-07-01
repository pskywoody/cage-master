/**
 * search-v2.js: 更智能的搜索 - 支持多种笼子设计和爬山法
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require('./puzzle-validator.js');

const v = new KillerSudokuValidator();

// 经典数独解
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

// 简化笼子设计：主要用单格笼（给定）+ 少量2格笼（和数有多种组合，不泄露信息）
// 设计原则：
// - 所有单格笼直接是给定数字（类似普通数独的预填）
// - 两格笼选择"和数组合多"的数字对，避免唯一组合
// - 笼子连通且覆盖全部81格
// - 卡壳点设在第7-9行（G-I），特别是右下宫（box9: G7-I9）

// 我将重新设计笼子，使其更"透明"（不增加过多额外约束）
// 策略：大面积使用单格笼，在卡壳点区域使用2-3格笼

// 先定义哪些格子是单格笼（给定），哪些是多格笼
// 单格笼位置 = 预填数字位置（我们后面会调整）
// 多格笼位置 = 需要挖空推理的位置

// 让我用一种混合策略：固定笼子划分，然后搜索挖空
// 这次笼子更简洁：在卡壳区域用大块笼子增加歧义

const cages = [
  // === 顶部3行 (A-C) ===
  // 左上宫 box1 (A1-C3)
  { id: 1, sum: 5, cells: [[0,0]] },       // A1=5 单格
  { id: 2, sum: 3, cells: [[0,1]] },       // A2=3 单格
  { id: 3, sum: 4+2+8, cells: [[0,2],[1,2],[2,2]] },  // A3,B3,C3 = 4+2+8=14
  { id: 4, sum: 6+7, cells: [[1,0],[1,1]] },           // B1+B2=6+7=13
  { id: 5, sum: 1+9, cells: [[2,0],[2,1]] },           // C1+C2=1+9=10
  // 中上宫 box2 (A4-C6)
  { id: 6, sum: 6+1+3, cells: [[0,3],[1,3],[2,3]] },   // A4+B4+C4=6+1+3=10
  { id: 7, sum: 7+9+4, cells: [[0,4],[1,4],[2,4]] },   // A5+B5+C5=7+9+4=20
  { id: 8, sum: 8+5+2, cells: [[0,5],[1,5],[2,5]] },   // A6+B6+C6=8+5+2=15
  // 右上宫 box3 (A7-C9)
  { id: 9, sum: 9+3+5, cells: [[0,6],[1,6],[2,6]] },   // A7+B7+C7=9+3+5=17
  { id: 10, sum: 1+4+6, cells: [[0,7],[1,7],[2,7]] },  // A8+B8+C8=1+4+6=11
  { id: 11, sum: 2+8+7, cells: [[0,8],[1,8],[2,8]] },  // A9+B9+C9=2+8+7=17

  // === 中部3行 (D-F) ===
  // 左中宫 box4 (D1-F3)
  { id: 12, sum: 8+4+7, cells: [[3,0],[4,0],[5,0]] },  // D1+E1+F1=8+4+7=19
  { id: 13, sum: 5+2+1, cells: [[3,1],[4,1],[5,1]] },  // D2+E2+F2=5+2+1=8
  { id: 14, sum: 9+6+3, cells: [[3,2],[4,2],[5,2]] },  // D3+E3+F3=9+6+3=18
  // 中中宫 box5 (D4-F6)
  { id: 15, sum: 7+8+9, cells: [[3,3],[4,3],[5,3]] },  // D4+E4+F4=7+8+9=24
  { id: 16, sum: 6+5+2, cells: [[3,4],[4,4],[5,4]] },  // D5+E5+F5=6+5+2=13
  { id: 17, sum: 1+3+4, cells: [[3,5],[4,5],[5,5]] },  // D6+E6+F6=1+3+4=8
  // 右中宫 box6 (D7-F9)
  { id: 18, sum: 4+7+8, cells: [[3,6],[4,6],[5,6]] },  // D7+E7+F7=4+7+8=19
  { id: 19, sum: 2+9+5, cells: [[3,7],[4,7],[5,7]] },  // D8+E8+F8=2+9+5=16
  { id: 20, sum: 3+1+6, cells: [[3,8],[4,8],[5,8]] },  // D9+E9+F9=3+1+6=10

  // === 下部3行 (G-I) —— 卡壳点区域 ===
  // 左下宫 box7 (G1-I3) —— 设计成较模糊
  { id: 21, sum: 9+2+3, cells: [[6,0],[7,0],[8,0]] },  // G1+H1+I1=9+2+3=14
  { id: 22, sum: 6+8+4, cells: [[6,1],[7,1],[8,1]] },  // G2+H2+I2=6+8+4=18
  { id: 23, sum: 1+7+5, cells: [[6,2],[7,2],[8,2]] },  // G3+H3+I3=1+7+5=13
  // 中下宫 box8 (G4-I6) —— 这里设计显性数对
  // 让G4,I4 形成 {2,5} 数对? 实际 G4=5, H4=4, I4=2
  // 重新设计：让G6和H6或其他位置形成数对
  // G4=5, H4=4, I4=2; G5=3, H5=1, I5=8; G6=7, H6=9, I6=6
  { id: 24, sum: 5+4+2, cells: [[6,3],[7,3],[8,3]] },  // G4+H4+I4=5+4+2=11
  { id: 25, sum: 3+1+8, cells: [[6,4],[7,4],[8,4]] },  // G5+H5+I5=3+1+8=12
  { id: 26, sum: 7+9+6, cells: [[6,5],[7,5],[8,5]] },  // G6+H6+I6=7+9+6=22
  // 右下宫 box9 (G7-I9) —— 卡壳数对在这里设计
  // G7=2, H7=6, I7=1; G8=8, H8=3, I8=7; G9=4, H9=5, I9=9
  // 设计笼子让数对形成：
  // 设想：G8 和 I8 形成数对? 实际是8和7
  // 让G9=4, H9=5 用2格笼? 4+5=9, 组合: {1,8},{2,7},{3,6},{4,5} 多组合好!
  // 让H7=6, I7=1, I9=9?
  // 我要让两个格子在同一行/列/宫中恰好剩 {a,b}
  // 策略：H8和H9在同一行(H行)，如果H行其他都填了，且H8,H9各剩2候选且相同
  // H行: H1=2, H2=8, H3=7, H4=4, H5=1, H6=9, H7=6, H8=3, H9=5
  // 如果 H7=6 不给定（设为0），H8=3, H9=5不给定...
  // 让我把右下宫分成几个笼子，使得有2格在同一行/宫形成数对
  { id: 27, sum: 2+6, cells: [[6,6],[7,6]] },           // G7+H7=2+6=8
  { id: 28, sum: 1, cells: [[8,6]] },                   // I7=1 单格（给一个锚点）
  { id: 29, sum: 8+3+7, cells: [[6,7],[7,7],[8,7]] },  // G8+H8+I8=8+3+7=18
  { id: 30, sum: 4+5+9, cells: [[6,8],[7,8],[8,8]] },  // G9+H9+I9=4+5+9=18
];

// 验证笼子
function validateCagesBasic(cages, solution) {
  const covered = new Set();
  const errors = [];
  for (const cage of cages) {
    let sum = 0;
    const seen = new Set();
    for (const [r, c] of cage.cells) {
      const key = `${r},${c}`;
      if (covered.has(key)) errors.push(`笼${cage.id}重复覆盖 ${key}`);
      covered.add(key);
      const val = solution[r][c];
      sum += val;
      if (seen.has(val)) errors.push(`笼${cage.id}数字${val}重复`);
      seen.add(val);
    }
    if (sum !== cage.sum) errors.push(`笼${cage.id}和错误: 实际${sum} vs 配置${cage.sum}`);
  }
  if (covered.size !== 81) errors.push(`只覆盖${covered.size}格，应为81`);
  return { valid: errors.length === 0, errors };
}

const cc = validateCagesBasic(cages, solution);
console.log('笼子检查:', cc.valid ? '通过' : '失败');
if (!cc.valid) { console.log(cc.errors); process.exit(1); }

// 单格笼
const forced = new Set();
for (const cage of cages) {
  if (cage.cells.length === 1) {
    forced.add(`${cage.cells[0][0]},${cage.cells[0][1]}`);
  }
}
console.log('单格笼强制给定:', forced.size);

// 非单格笼的格子
const optional = [];
for (let r = 0; r < 9; r++) {
  for (let c = 0; c < 9; c++) {
    if (!forced.has(`${r},${c}`)) optional.push([r,c]);
  }
}
console.log('可调位置:', optional.length);

function evaluate(givens) {
  // givens: Set of "r,c" that are pre-filled
  const bd = solution.map(row => row.slice());
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!givens.has(`${r},${c}`)) bd[r][c] = 0;
  }
  const level = { boardData: bd, cages, solution };
  const report = v.validate(level, { maxInitialNaked: 5, requireTechnique: 'nakedPair' });
  return { bd, report };
}

// 评分
function score(report) {
  if (!report) return -10000;
  let s = 0;
  const ns = report.info.initialNakedSingles || 0;
  if (ns >= 3 && ns <= 5) s += 200;
  else s -= Math.abs(ns-4) * 30;
  if (report.info.beforePairEmpty === 0) s -= 500;
  else s += 50;
  if (report.info.nakedPairsAtStuckPoint >= 1) s += 50;
  if (report.info.breakthroughPair) s += 300;
  if (report.info.dominoComplete) s += 500;
  // 给定数 30-35
  const filled = report.info.beforePairFilled + ns; // approx
  if (report.valid) s += 1000;
  s -= report.errors.length * 100;
  return s;
}

// 爬山法搜索
function climbSearch(maxIters = 20000) {
  // 初始：随机选约32个给定（包含forced）
  const targetTotal = 30 + Math.floor(Math.random() * 6); // 30-35
  const needMore = targetTotal - forced.size;
  const shuffled = optional.slice().sort(() => Math.random() - 0.5);
  const givens = new Set(forced);
  for (let i = 0; i < needMore; i++) {
    givens.add(`${shuffled[i][0]},${shuffled[i][1]}`);
  }
  
  let best = evaluate(givens);
  let bestScore = score(best.report);
  
  for (let iter = 0; iter < maxIters; iter++) {
    // 随机变异：加一个或减一个
    const newGivens = new Set(givens);
    const addMode = Math.random() < 0.5 || newGivens.size < 28;
    if (addMode && newGivens.size < 45) {
      // 加一个
      const candidates = optional.filter(([r,c]) => !newGivens.has(`${r},${c}`));
      if (candidates.length > 0) {
        const [r,c] = candidates[Math.floor(Math.random() * candidates.length)];
        newGivens.add(`${r},${c}`);
      }
    } else if (newGivens.size > forced.size + 5) {
      // 减一个（不能减forced）
      const removable = [...newGivens].filter(k => !forced.has(k));
      if (removable.length > 0) {
        const k = removable[Math.floor(Math.random() * removable.length)];
        newGivens.delete(k);
      }
    }
    
    const res = evaluate(newGivens);
    const s = score(res.report);
    if (s > bestScore) {
      bestScore = s;
      best = res;
      givens.clear();
      for (const k of newGivens) givens.add(k);
      if (res.report.valid && res.report.info.dominoComplete) {
        return { givens, report: res.report, bd: res.bd, success: true };
      }
    }
    
    if (iter % 2000 === 0) {
      const gc = [...givens].filter(k => !forced.has(k)).length + forced.size;
      console.log(`iter${iter}: score=${bestScore}, givens=${gc}, valid=${best.report.valid}, NS=${best.report.info.initialNakedSingles}, empty=${best.report.info.beforePairEmpty}, pairs=${best.report.info.nakedPairsAtStuckPoint}, breakthrough=${!!best.report.info.breakthroughPair}, domino=${best.report.info.dominoComplete}`);
      if (best.report.errors.length) console.log('  errors:', best.report.errors[0]);
    }
  }
  return { givens, report: best.report, bd: best.bd, success: best.report.valid && best.report.info.dominoComplete };
}

// 多次重启
let bestOverall = null;
for (let restart = 0; restart < 10; restart++) {
  console.log(`\n=== 重启 ${restart+1} ===`);
  const r = climbSearch(15000);
  if (r.success) {
    console.log('\n*** 成功! ***');
    v.printGrid(r.bd);
    console.log('Info:', JSON.stringify(r.report.info, null, 2));
    // 保存
    const givenList = [...r.givens].map(k => k.split(',').map(Number));
    const digList = [];
    for (let rr = 0; rr < 9; rr++) for (let cc = 0; cc < 9; cc++) {
      if (!r.givens.has(`${rr},${cc}`)) digList.push([rr,cc]);
    }
    fs.writeFileSync(path.join(__dirname, 'found-result.json'), JSON.stringify({
      givens: givenList,
      digs: digList,
      info: r.report.info,
      steps: r.report.steps
    }, null, 2));
    process.exit(0);
  }
  if (!bestOverall || score(r.report) > score(bestOverall.report)) bestOverall = r;
}

console.log('\n未找到完美解，最佳:');
v.printGrid(bestOverall.bd);
console.log('Info:', JSON.stringify(bestOverall.report.info, null, 2));
console.log('Errors:', bestOverall.report.errors);
