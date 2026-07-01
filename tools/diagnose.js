/**
 * diagnose.js: 诊断工具 - 打印卡壳点详细候选数
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require('./puzzle-validator.js');

const v = new KillerSudokuValidator();

// 从best-v3.json或手工输入
// 先用search-v3中找到的最佳配置

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

// 复制search-v3的笼子设计
let nextId = 1;
const cages = [];
function cage(cells) {
  let sum = 0;
  for (const [r,c] of cells) sum += solution[r][c];
  cages.push({ id: nextId++, sum, cells });
}
// 重新生成笼子（和search-v3一致）
cage([[0,0]]);        // 1: A1=5
cage([[0,1]]);        // 2: A2=3
cage([[0,2],[1,2]]);  // 3: A3=4,B3=2
cage([[0,3],[1,3]]);  // 4: A4=6,B4=1
cage([[0,4]]);        // 5: A5=7
cage([[0,5]]);        // 6: A6=8
cage([[0,6],[1,6]]);  // 7: A7=9,B7=3
cage([[0,7],[1,7]]);  // 8: A8=1,B8=4
cage([[0,8],[1,8]]);  // 9: A9=2,B9=8
cage([[1,0]]);        // 10: B1=6
cage([[1,1],[2,1]]);  // 11: B2=7,C2=9
cage([[1,4],[2,4]]);  // 12: B5=9,C5=4
cage([[1,5],[2,5]]);  // 13: B6=5,C6=2
cage([[2,0]]);        // 14: C1=1
cage([[2,2],[3,2]]);  // 15: C3=8,D3=9
cage([[2,3]]);        // 16: C4=3
cage([[2,6]]);        // 17: C7=5
cage([[2,7]]);        // 18: C8=6
cage([[2,8],[3,8]]);  // 19: C9=7,D9=3
cage([[3,0],[4,0]]);  // 20: D1=8,E1=4
cage([[3,1],[4,1]]);  // 21: D2=5,E2=2
cage([[3,3],[4,3]]);  // 22: D4=7,E4=8
cage([[3,4],[4,4]]);  // 23: D5=6,E5=5
cage([[3,5],[4,5]]);  // 24: D6=1,E6=3
cage([[3,6],[4,6]]);  // 25: D7=4,E7=7
cage([[3,7],[4,7]]);  // 26: D8=2,E8=9
cage([[4,2],[5,2]]);  // 27: E3=6,F3=3
cage([[4,8],[5,8]]);  // 28: E9=1,F9=6
cage([[5,0]]);        // 29: F1=7
cage([[5,1]]);        // 30: F2=1
cage([[5,3]]);        // 31: F4=9
cage([[5,4],[6,4]]);  // 32: F5=2,G5=3
cage([[5,5],[6,5]]);  // 33: F6=4,G6=7
cage([[5,6]]);        // 34: F7=8
cage([[5,7],[6,7]]);  // 35: F8=5,G8=8
cage([[6,0],[7,0]]);  // 36: G1=9,H1=2
cage([[6,1],[7,1]]);  // 37: G2=6,H2=8
cage([[6,2],[7,2]]);  // 38: G3=1,H3=7
cage([[6,3],[7,3]]);  // 39: G4=5,H4=4
cage([[6,6],[7,6]]);  // 40: G7=2,H7=6
cage([[6,8],[7,8]]);  // 41: G9=4,H9=5
cage([[7,4],[8,4]]);  // 42: H5=1,I5=8
cage([[7,5],[8,5]]);  // 43: H6=9,I6=6
cage([[7,7],[8,7]]);  // 44: H8=3,I8=7
cage([[8,0]]);        // 45: I1=3
cage([[8,1]]);        // 46: I2=4
cage([[8,2],[8,3]]);  // 47: I3=5,I4=2
cage([[8,6]]);        // 48: I7=1
cage([[8,8]]);        // 49: I9=9

// 建立cage索引（validator需要）
const cageIdToCells = {};
const cellCageId = {};
for (const c of cages) {
  cageIdToCells[c.id] = c.cells;
  for (const [r,c2] of c.cells) cellCageId[`${r},${c2}`] = c.id;
}
v._cageIdToCells = cageIdToCells;
v._cellCageId = cellCageId;

// 手工指定boardData（调整这里来试验）
// 默认：单格笼给定 + 一些多格笼中填回的数字
const forced = new Set();
for (const c of cages) if (c.cells.length === 1) {
  const [r,c2] = c.cells[0];
  forced.add(`${r},${c2}`);
}

// 构建boardData
function makeBoard(fillSet) {
  const bd = solution.map(row => row.slice());
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!fillSet.has(`${r},${c}`)) bd[r][c] = 0;
  }
  return bd;
}

// 诊断：打印卡壳点候选
function diagnose(bd) {
  console.log('\n========== 盘面 ==========');
  v.printGrid(bd);
  
  // Build cage maps
  const cageIdToCells = {};
  const cellCageId = {};
  for (const c of cages) {
    cageIdToCells[c.id] = c.cells;
    for (const [r,c2] of c.cells) cellCageId[`${r},${c2}`] = c.id;
  }
  v._cageIdToCells = cageIdToCells;
  v._cellCageId = cellCageId;
  
  const sim = v._simulateBasicCascade(bd);
  console.log(`\n连锁后: 填了${sim.filled}个, 剩${sim.empty}个空格`);
  console.log('步骤:', sim.steps.join(' → '));
  
  const stuck = sim.grid;
  console.log('\n========== 卡壳盘面 ==========');
  v.printGrid(stuck);
  
  // 打印所有空格的候选数
  console.log('\n========== 卡壳点候选数 ==========');
  for (let r = 0; r < 9; r++) {
    let row = v.labels[r] + ' ';
    for (let c = 0; c < 9; c++) {
      if (stuck[r][c] !== 0) {
        row += '  ' + stuck[r][c] + '  ';
      } else {
        const ca = v._getCandidates(stuck, r, c);
        row += '[' + ca.join('') + '] ';
      }
      if (c === 2 || c === 5) row += '| ';
    }
    console.log(row);
    if (r === 2 || r === 5) console.log('  ' + '-'.repeat(40));
  }
  
  // 找数对并分析每个数对的排除效果
  const pairs = v._findNakedPairs(stuck);
  console.log(`\n========== 找到${pairs.length}个数对 ==========`);
  for (const p of pairs) {
    const {r1,c1,r2,c2,nums,unitType} = p;
    // 测试排除效果
    const testGrid = stuck.map(row => [...row]);
    // 建立cage maps again (in case overwritten)
    v._cageIdToCells = cageIdToCells;
    v._cellCageId = cellCageId;
    const elim = v._applyNakedPairElimination(testGrid, p);
    console.log(`  ${v.labels[r1]}${c1+1},${v.labels[r2]}${c2+1} = ${nums.join(',')} (${unitType}) → 排除${elim}个 → 新裸单:`);
    // 看新产生的裸单
    const newNS = v._findNakedSingles(testGrid);
    for (const n of newNS) {
      const ca = v._getCandidates(stuck, n.r, n.c); // 原候选
      console.log(`    ${v.labels[n.r]}${n.c+1}: 原候选[${ca.join(',')}] → 排除{nums.join(',')}后=${n.num} (答案=${solution[n.r][n.c]}) ${n.num===solution[n.r][n.c]?'✓':'✗ 错!'} `);
    }
    if (newNS.length === 0) console.log('    (无新裸单)');
  }
  
  return { stuck, pairs };
}

// 初始测试：forced + 一些额外填回
const fillSet = new Set(forced);
// 试填一些
const extraFills = [
  [0,2],[0,3],[0,6],[0,7],[0,8], // A行除了gap都填
  [1,0], // B1=6 (forced)
  [2,1],[2,2],[2,5],[2,8], // C行
  [3,2],[3,8], // D行 D3=9(forced via cage15?), D9
  [4,5],[4,6],[4,7], // E行
  [5,2],[5,7],[5,8], // F行
];
for (const [r,c] of extraFills) fillSet.add(`${r},${c}`);

let bd = makeBoard(fillSet);
console.log('初始给定数:', [...fillSet].length);
diagnose(bd);
