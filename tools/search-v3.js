/**
 * search-v3.js: 更有针对性的笼子设计 - 顶部/中部用单格笼，底部用多格笼制造数对
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require('./puzzle-validator.js');

const v = new KillerSudokuValidator();

// 经典数独解（保持不变）
const solution = [
  [5,3,4,6,7,8,9,1,2],   // A
  [6,7,2,1,9,5,3,4,8],   // B
  [1,9,8,3,4,2,5,6,7],   // C
  [8,5,9,7,6,1,4,2,3],   // D
  [4,2,6,8,5,3,7,9,1],   // E
  [7,1,3,9,2,4,8,5,6],   // F
  [9,6,1,5,3,7,2,8,4],   // G
  [2,8,7,4,1,9,6,3,5],   // H
  [3,4,5,2,8,6,1,7,9]    // I
];

// 笼子设计策略：
// - 前6行(A-F): 主要用单格笼（即直接给定），少量2格笼
// - 后3行(G-I): 用多格笼制造数对卡壳点
// 单格笼的数字必须保留（因为sum=N的单格笼必然是N）
// 多格笼的格子可以挖空（设为0），由笼和提供约束

// 手工设计笼子（确保覆盖、无重复、和正确）
// 我将按区域设计，确保卡壳点在右下
let nextId = 1;
function cage(cells) {
  let sum = 0;
  const seen = new Set();
  for (const [r,c] of cells) {
    const val = solution[r][c];
    sum += val;
    if (seen.has(val)) {
      console.error('笼内重复:', cells, val);
      process.exit(1);
    }
    seen.add(val);
  }
  return { id: nextId++, sum, cells };
}

const cages = [];

// ---- 行A (0) ----
// A1=5, A2=3 单格（作为起始裸单）
cages.push(cage([[0,0]])); // A1=5
cages.push(cage([[0,1]])); // A2=3
cages.push(cage([[0,2]])); // A3=4
// A4=6 单格
cages.push(cage([[0,3]])); // A4=6
cages.push(cage([[0,4]])); // A5=7
cages.push(cage([[0,5]])); // A6=8
cages.push(cage([[0,6]])); // A7=9
cages.push(cage([[0,7]])); // A8=1
cages.push(cage([[0,8]])); // A9=2
// 行A全部单格笼 → 全部给定！这样第一行直接全部给出

// ---- 行B (1) ----
cages.push(cage([[1,0]])); // B1=6
cages.push(cage([[1,1]])); // B2=7
cages.push(cage([[1,2]])); // B3=2
cages.push(cage([[1,3]])); // B4=1
cages.push(cage([[1,4]])); // B5=9
// B6=5 单格
cages.push(cage([[1,5]])); // B6=5
cages.push(cage([[1,6]])); // B7=3
cages.push(cage([[1,7]])); // B8=4
cages.push(cage([[1,8]])); // B9=8
// 行B全部单格笼 → 全部给定

// ---- 行C (2) ----
cages.push(cage([[2,0]])); // C1=1
cages.push(cage([[2,1]])); // C2=9
cages.push(cage([[2,2]])); // C3=8
cages.push(cage([[2,3]])); // C4=3
cages.push(cage([[2,4]])); // C5=4
cages.push(cage([[2,5]])); // C6=2
cages.push(cage([[2,6]])); // C7=5
cages.push(cage([[2,7]])); // C8=6
cages.push(cage([[2,8]])); // C9=7
// 行C全部单格笼 → 全部给定

// 等下，前3行全给的话，顶部完全给出，会导致中部快速填满，可能直接解出
// 这样太简单了，不行。我需要让中部有挖空。
// 重新设计：前3行不全给，而是有选择地给，形成3-5个起始裸单

// 重置
cages.length = 0;
nextId = 1;

// 新策略：
// - 前3行（A-C）：给一部分单格笼，让开局有裸单可以填
// - 中3行（D-F）：部分单格笼，部分多格笼
// - 后3行（G-I）：大部分多格笼，制造卡壳点

// --- 行A ---
cages.push(cage([[0,0]]));       // A1=5 单格(给)
cages.push(cage([[0,1]]));       // A2=3 单格(给)
cages.push(cage([[0,2]]));       // A3=4 单格(给) → 这样行A的1,2,3列给定
cages.push(cage([[0,3],[1,3]])); // A4=6,B4=1 sum=7 两格笼
cages.push(cage([[0,4]]));       // A5=7 单格(给)
cages.push(cage([[0,5]]));       // A6=8 单格(给)
cages.push(cage([[0,6],[1,6]])); // A7=9,B7=3 sum=12
cages.push(cage([[0,7],[1,7]])); // A8=1,B8=4 sum=5
cages.push(cage([[0,8],[1,8],[2,8]])); // A9=2,B9=8,C9=7 sum=17

// --- 行B ---
cages.push(cage([[1,0]]));       // B1=6 单格(给)
cages.push(cage([[1,1],[2,1]])); // B2=7,C2=9 sum=16
cages.push(cage([[1,2],[2,2]])); // B3=2,C3=8 sum=10
cages.push(cage([[1,4],[2,4]])); // B5=9,C5=4 sum=13
cages.push(cage([[1,5],[2,5]])); // B6=5,C6=2 sum=7

// --- 行C ---
cages.push(cage([[2,0]]));       // C1=1 单格(给)
cages.push(cage([[2,3]]));       // C4=3 单格(给)
cages.push(cage([[2,6]]));       // C7=5 单格(给)
cages.push(cage([[2,7]]));       // C8=6 单格(给)

// --- 行D ---
cages.push(cage([[3,0],[4,0],[5,0]])); // D1=8,E1=4,F1=7 sum=19
cages.push(cage([[3,1],[4,1],[5,1]])); // D2=5,E2=2,F2=1 sum=8
cages.push(cage([[3,2]]));             // D3=9 单格(给)
cages.push(cage([[3,3],[4,3]]));       // D4=7,E4=8 sum=15
cages.push(cage([[3,4],[4,4],[5,4]])); // D5=6,E5=5,F5=2 sum=13
cages.push(cage([[3,5],[4,5],[5,5]])); // D6=1,E6=3,F6=4 sum=8
cages.push(cage([[3,6],[4,6]]));       // D7=4,E7=7 sum=11
cages.push(cage([[3,7],[4,7],[5,7]])); // D8=2,E8=9,F8=5 sum=16
cages.push(cage([[3,8],[4,8],[5,8]])); // D9=3,E9=1,F9=6 sum=10

// --- 行E ---
// E行已经通过上面的笼子完全覆盖了

// --- 行F ---
cages.push(cage([[5,2]]));       // F3=3 单格(给)? 不，F3在D3,E3,F3组里？检查覆盖
// 等等，D3=9单格，E3和F3没被覆盖！让我修正
// F3=3需要被覆盖。让我把E3加入
// 先修正: 删除cage([[3,2]])单格，改成包含E3和F3

// 让我重新组织一下D-F行的笼子，确保E3和F3被覆盖
// 重新设计中部
cages.length = 0;
nextId = 1;

// 让我更系统地做：列出所有格子然后分配到笼子
// 先做一个分配表 cageAssign[r][c] = cage id
const cageAssign = Array.from({length:9}, () => Array(9).fill(-1));
let cid = 1;

function assignCage(cells) {
  const c = { id: cid, cells: cells.map(x => [...x]) };
  let sum = 0;
  const seen = new Set();
  for (const [r,cc] of cells) {
    if (cageAssign[r][cc] !== -1) {
      console.error(`格子(${r},${cc})已分配到笼${cageAssign[r][cc]}`);
      process.exit(1);
    }
    cageAssign[r][cc] = cid;
    const v = solution[r][cc];
    sum += v;
    if (seen.has(v)) { console.error(`笼${cid}内数字${v}重复`); process.exit(1); }
    seen.add(v);
  }
  c.sum = sum;
  cages.push(c);
  cid++;
  return c;
}

// ===== 设计笼子 =====
// 行A: 给几个单格，和B行组合一些两格笼
assignCage([[0,0]]);        // 1: A1=5
assignCage([[0,1]]);        // 2: A2=3
assignCage([[0,2],[1,2]]);  // 3: A3=4,B3=2 sum=6
assignCage([[0,3],[1,3]]);  // 4: A4=6,B4=1 sum=7
assignCage([[0,4]]);        // 5: A5=7
assignCage([[0,5]]);        // 6: A6=8
assignCage([[0,6],[1,6]]);  // 7: A7=9,B7=3 sum=12
assignCage([[0,7],[1,7]]);  // 8: A8=1,B8=4 sum=5
assignCage([[0,8],[1,8]]);  // 9: A9=2,B9=8 sum=10

// 行B
assignCage([[1,0]]);        // 10: B1=6
assignCage([[1,1],[2,1]]);  // 11: B2=7,C2=9 sum=16
assignCage([[1,4],[2,4]]);  // 12: B5=9,C5=4 sum=13
assignCage([[1,5],[2,5]]);  // 13: B6=5,C6=2 sum=7

// 行C
assignCage([[2,0]]);        // 14: C1=1
assignCage([[2,2],[3,2]]);  // 15: C3=8,D3=9 sum=17
assignCage([[2,3]]);        // 16: C4=3
assignCage([[2,6]]);        // 17: C7=5
assignCage([[2,7]]);        // 18: C8=6
assignCage([[2,8],[3,8]]);  // 19: C9=7,D9=3 sum=10

// 行D
assignCage([[3,0],[4,0]]);  // 20: D1=8,E1=4 sum=12
assignCage([[3,1],[4,1]]);  // 21: D2=5,E2=2 sum=7
assignCage([[3,3],[4,3]]);  // 22: D4=7,E4=8 sum=15
assignCage([[3,4],[4,4]]);  // 23: D5=6,E5=5 sum=11
assignCage([[3,5],[4,5]]);  // 24: D6=1,E6=3 sum=4
assignCage([[3,6],[4,6]]);  // 25: D7=4,E7=7 sum=11
assignCage([[3,7],[4,7]]);  // 26: D8=2,E8=9 sum=11

// 行E
assignCage([[4,2],[5,2]]);  // 27: E3=6,F3=3 sum=9
assignCage([[4,8],[5,8]]);  // 28: E9=1,F9=6 sum=7

// 行F
assignCage([[5,0]]);        // 29: F1=7
assignCage([[5,1]]);        // 30: F2=1
assignCage([[5,3]]);        // 31: F4=9
assignCage([[5,4],[6,4]]);  // 32: F5=2,G5=3 sum=5
assignCage([[5,5],[6,5]]);  // 33: F6=4,G6=7 sum=11
assignCage([[5,6]]);        // 34: F7=8
assignCage([[5,7],[6,7]]);  // 35: F8=5,G8=8 sum=13

// 行G (下部开始)
assignCage([[6,0],[7,0]]);  // 36: G1=9,H1=2 sum=11
assignCage([[6,1],[7,1]]);  // 37: G2=6,H2=8 sum=14
assignCage([[6,2],[7,2]]);  // 38: G3=1,H3=7 sum=8
assignCage([[6,3],[7,3]]);  // 39: G4=5,H4=4 sum=9
assignCage([[6,6],[7,6]]);  // 40: G7=2,H7=6 sum=8
assignCage([[6,8],[7,8]]);  // 41: G9=4,H9=5 sum=9

// 行H
assignCage([[7,4],[8,4]]);  // 42: H5=1,I5=8 sum=9
assignCage([[7,5],[8,5]]);  // 43: H6=9,I6=6 sum=15
assignCage([[7,7],[8,7]]);  // 44: H8=3,I8=7 sum=10

// 行I (最后一行)
assignCage([[8,0]]);        // 45: I1=3 单格
assignCage([[8,1]]);        // 46: I2=4 单格
assignCage([[8,2],[8,3]]);  // 47: I3=5,I4=2 sum=7 (同一行的两格)
assignCage([[8,6]]);        // 48: I7=1 单格
assignCage([[8,8]]);        // 49: I9=9 单格

// 检查覆盖
let covered = 0;
const uncovered = [];
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  if (cageAssign[r][c] === -1) uncovered.push([r,c]);
  else covered++;
}
console.log('已覆盖:', covered, '/81');
if (uncovered.length) {
  console.log('未覆盖格子:', uncovered);
  process.exit(1);
}

// 验证所有笼子
function validateCages() {
  const cellSet = new Set();
  for (const c of cages) {
    let sum = 0;
    const seen = new Set();
    for (const [r,cc] of c.cells) {
      const k = `${r},${cc}`;
      if (cellSet.has(k)) { console.error('重复覆盖:', k); return false; }
      cellSet.add(k);
      const v = solution[r][cc];
      sum += v;
      if (seen.has(v)) { console.error(`笼${c.id}数字${v}重复`); return false; }
      seen.add(v);
    }
    if (sum !== c.sum) { console.error(`笼${c.id}和错误:${sum} vs ${c.sum}`); return false; }
  }
  return cellSet.size === 81;
}

if (!validateCages()) {
  console.error('笼子设计有bug!');
  process.exit(1);
}
console.log('笼子验证通过, 共', cages.length, '个笼');

// 单格笼
const forced = new Set();
for (const c of cages) {
  if (c.cells.length === 1) {
    forced.add(`${c.cells[0][0]},${c.cells[0][1]}`);
  }
}
console.log('单格笼(强制给定):', forced.size, '个:', [...forced]);

// 可选位置
const optional = [];
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  if (!forced.has(`${r},${c}`)) optional.push([r,c]);
}
console.log('可调位置:', optional.length);

function evaluate(givens) {
  const bd = solution.map(row => row.slice());
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!givens.has(`${r},${c}`)) bd[r][c] = 0;
  }
  const level = { boardData: bd, cages, solution };
  const report = v.validate(level, { maxInitialNaked: 5, requireTechnique: 'nakedPair' });
  return { bd, report };
}

function score(report) {
  if (!report) return -10000;
  let s = 0;
  const ns = report.info.initialNakedSingles || 0;
  if (ns >= 3 && ns <= 5) s += 300;
  else s -= Math.abs(ns-4) * 50;
  if (report.info.beforePairEmpty === 0) s -= 1000;
  if ((report.info.nakedPairsAtStuckPoint||0) >= 1) s += 100;
  if ((report.info.nakedPairsAtStuckPoint||0) <= 5) s += 100; // 不要太多数对（混乱）
  if (report.info.breakthroughPair) s += 400;
  if (report.info.dominoComplete) s += 800;
  if (report.valid) s += 2000;
  s -= report.errors.length * 200;
  // 卡壳点空格数适中(5-20)
  const empty = report.info.beforePairEmpty || 0;
  if (empty >= 5 && empty <= 20) s += 100;
  else s -= Math.abs(empty - 12) * 10;
  return s;
}

// 多次随机爬山
function climb(restart) {
  const targetTotal = 30 + Math.floor(Math.random() * 6);
  const needMore = Math.max(0, targetTotal - forced.size);
  const shuffled = optional.slice().sort(() => Math.random() - 0.5);
  const givens = new Set(forced);
  for (let i = 0; i < needMore; i++) givens.add(`${shuffled[i][0]},${shuffled[i][1]}`);
  
  let best = evaluate(givens);
  let bestScore = score(best.report);
  let bestGivens = new Set(givens);
  
  const iters = 8000;
  for (let iter = 0; iter < iters; iter++) {
    const newG = new Set(givens);
    const sz = newG.size;
    const mode = Math.random();
    if (mode < 0.35 && sz < 40) {
      // add
      const cands = optional.filter(([r,c]) => !newG.has(`${r},${c}`));
      if (cands.length) {
        const [r,c] = cands[Math.floor(Math.random()*cands.length)];
        newG.add(`${r},${c}`);
      }
    } else if (mode < 0.85 && sz > forced.size + 3) {
      // remove
      const rem = [...newG].filter(k => !forced.has(k));
      if (rem.length) {
        const k = rem[Math.floor(Math.random()*rem.length)];
        newG.delete(k);
      }
    } else {
      // swap
      const rem = [...newG].filter(k => !forced.has(k));
      const add = optional.filter(([r,c]) => !newG.has(`${r},${c}`));
      if (rem.length && add.length) {
        newG.delete(rem[Math.floor(Math.random()*rem.length)]);
        const [r,c] = add[Math.floor(Math.random()*add.length)];
        newG.add(`${r},${c}`);
      }
    }
    
    const res = evaluate(newG);
    const s = score(res.report);
    if (s > bestScore) {
      bestScore = s;
      best = res;
      bestGivens = new Set(newG);
      givens.clear();
      for (const k of newG) givens.add(k);
      if (res.report.valid && res.report.info.dominoComplete) {
        return { success: true, givens: bestGivens, report: res.report, bd: res.bd };
      }
    }
    
    if (iter % 2000 === 0 && restart === 0) {
      console.log(`  iter${iter}: score=${bestScore}, sz=${bestGivens.size}, valid=${best.report.valid}, NS=${best.report.info.initialNakedSingles}, filled=${best.report.info.beforePairFilled}, empty=${best.report.info.beforePairEmpty}, pairs=${best.report.info.nakedPairsAtStuckPoint}, bt=${!!best.report.info.breakthroughPair}, dom=${best.report.info.dominoComplete}`);
    }
  }
  return { success: best.report.valid && best.report.info.dominoComplete, givens: bestGivens, report: best.report, bd: best.bd };
}

let best = null;
for (let r = 0; r < 30; r++) {
  console.log(`\n=== Restart ${r+1} ===`);
  const res = climb(r);
  if (res.success) {
    console.log('\n*** SUCCESS! ***');
    v.printGrid(res.bd);
    console.log('Info:', JSON.stringify(res.report.info, null, 2));
    console.log('Steps:');
    res.report.steps.forEach(s => console.log(' ', s));
    if (res.report.errors.length) console.log('Errors:', res.report.errors);
    
    // Save
    const out = {
      cages,
      givens: [...res.givens].map(k => k.split(',').map(Number)),
      boardData: res.bd,
      info: res.report.info,
      steps: res.report.steps
    };
    fs.writeFileSync(path.join(__dirname, 'found-v3.json'), JSON.stringify(out, null, 2));
    console.log('Saved to found-v3.json');
    process.exit(0);
  }
  if (!best || score(res.report) > score(best.report)) best = res;
  console.log(`  best score so far: ${score(best.report)}`);
}

console.log('\n=== Best result found ===');
v.printGrid(best.bd);
console.log('Info:', JSON.stringify(best.report.info, null, 2));
console.log('Errors:', best.report.errors);
console.log('Warnings:', best.report.warnings?.slice(0,5));
fs.writeFileSync(path.join(__dirname, 'best-v3.json'), JSON.stringify({
  cages,
  givens: [...best.givens].map(k => k.split(',').map(Number)),
  boardData: best.bd,
  info: best.report.info,
  errors: best.report.errors,
  warnings: best.report.warnings
}, null, 2));
