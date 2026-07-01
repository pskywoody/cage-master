/**
 * handcraft.js: 快速手工迭代
 * 我手工定义solution, cages, 和boardData，然后打印诊断信息
 */
const fs = require('fs');
const path = require('path');
const { KillerSudokuValidator } = require('./puzzle-validator.js');

const v = new KillerSudokuValidator();
const L = 'ABCDEFGHI';

// 固定数独解
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

// ====== 手工定义笼子 ======
// 我要让这个puzzle尽量接近标准数独（笼子在box内，笼和有多种组合）
// 先确定哪些cell是given(单格笼或多格笼中预填的)
// givensMap: Set of "r,c"
// cages: 多格笼列表

// 策略：
// 1. 选30-35个givens（单格笼）
// 2. 剩余46-51个空cell，按box内相邻原则分组为2-3格笼，选笼和使其有多种组合
// 3. 调整givens直到满足教学要求

// 手工选择givens，目标：开局3-5裸单，连锁到右下卡壳，数对在box9/box8

// 第一轮givens（约32个）
const givensList = [
  // A行给几个
  [0,0],[0,1],[0,4],[0,5],[0,7],
  // B行
  [1,0],[1,3],[1,6],
  // C行
  [2,0],[2,3],[2,6],[2,7],
  // D行
  [3,2],[3,8],
  // E行
  [4,7],
  // F行
  [5,0],[5,3],[5,6],
  // G行
  [6,0],[6,4],[6,6],[6,7],
  // H行
  [7,6],
  // I行
  [8,0],[8,6],[8,8],
];

// 这是之前v3的基础。让我先看看它的行为，然后微调
// 剩余空cell需要被分组成笼
function buildCages(givens, multiCageDefs) {
  // givens: Set of "r,c"
  // multiCageDefs: array of cells arrays, will be multi-cell cages
  // All givens become single-cell cages
  const cages = [];
  let cid = 1;
  const covered = new Set();
  
  for (const key of givens) {
    const [r,c] = key.split(',').map(Number);
    cages.push({ id: cid++, sum: solution[r][c], cells: [[r,c]] });
    covered.add(key);
  }
  for (const cells of multiCageDefs) {
    let sum = 0;
    const seen = new Set();
    for (const [r,c] of cells) {
      const k = `${r},${c}`;
      if (covered.has(k)) { console.error('Cage overlap at', k); return null; }
      covered.add(k);
      sum += solution[r][c];
      if (seen.has(solution[r][c])) { console.error('Dup in cage', cells); return null; }
      seen.add(solution[r][c]);
    }
    cages.push({ id: cid++, sum, cells });
  }
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!covered.has(`${r},${c}`)) { console.error('Uncovered cell', r, c); return null; }
  }
  return cages;
}

// 手工设计多格笼（把空cell按相邻原则分组）
// 空cell列表（不在givensList中的）
function getEmpty(givens) {
  const emp = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
    if (!givens.has(`${r},${c}`)) emp.push([r,c]);
  }
  return emp;
}

const givensSet = new Set(givensList.map(([r,c]) => `${r},${c}`));
const emptyCells = getEmpty(givensSet);
console.log('Empty cells:', emptyCells.length);
// Print empty cells per row
for (let r = 0; r < 9; r++) {
  const ec = emptyCells.filter(([rr])=>rr===r).map(([,c])=>`${L[r]}${c+1}=${solution[r][c]}`);
  console.log(`  ${L[r]}: ${ec.join(', ')}`);
}

// 手工分组空cell为多格笼（连通，box内，2-3格）
// 我将直接在下面定义多格笼

// 空cell列表：
// A行: A2=3?不A1,A2给了, A3=4, A4=6, A6=8给了(A5给了), A8=1给了(A6=8给了), A7=9, A9=2
//   Wait: A0=0给, A1=1给, A2=2空(4), A3=3空(6), A4=4给(7), A5=5给(8), A6=6空(9), A7=7给(1), A8=8空(2)
// B行: B0给(6), B1空(7), B2空(2), B3给(1), B4空(9), B5空(5), B6给(3), B7空(4), B8空(8)
// C行: C0给(1), C1空(9), C2空(8), C3给(3), C4空(4), C5空(2), C6给(5), C7给(6), C8空(7)
// D行: D0空(8), D1空(5), D2给(9), D3空(7), D4空(6), D5空(1), D6空(4), D7空(2), D8给(3)
// E行: E0空(4), E1空(2), E2空(6), E3空(8), E4空(5), E5空(3), E6空(7), E7给(9), E8空(1)
// F行: F0给(7), F1空(1), F2空(3), F3给(9), F4空(2), F5空(4), F6给(8), F7空(5), F8空(6)
// G行: G0给(9), G1空(6), G2空(1), G3空(5), G4给(3), G5空(7), G6给(2), G7给(8), G8空(4)
// H行: H0空(2), H1空(8), H2空(7), H3空(4), H4空(1), H5空(9), H6给(6), H7空(3), H8空(5)
// I行: I0给(3), I1空(4), I2空(5), I3空(2), I4空(8), I5空(6), I6给(1), I7空(7), I8给(9)

// 分组多格笼（手工设计，确保连通、box内、和有多种组合）
const multiCages = [
  // A行空cell: A2(0,2)=4, A3(0,3)=6, A6(0,6)=9, A8(0,8)=2
  // box1 (A1-C3): A2=4,B1空=7,B2=2,C1=9,C2=8
  //   已给: A1=5,B1?B0给了(6),B3给了(1),C0给了(1),C3给了(3)
  //   box1空: A2=4, B1=7? wait B0 is (1,0)=B1, that's given [1,0]
  // Let me just manually pair adjacent empties
  
  // box1 (r0-2, c0-2) empties: (0,2),(1,1),(1,2),(2,1),(2,2)
  // A3(0,2)=4, B2(1,1)=7, B3(1,2)=2, C2(2,1)=9, C3(2,2)=8
  [[0,2],[1,2]],    // A3+B3 = 4+2=6 (sum=6: {1,5},{2,4} 多组合)
  [[1,1],[2,1]],    // B2+C2 = 7+9=16 (sum=16: {7,9}唯一！不好)
  // 改一下: [[2,1],[2,2]] C2+C3 = 9+8=17 (sum=17: {8,9}唯一！也不好)
  // 让我换一下：(0,2),(1,2),(2,2)是竖列4+2+8=14（3格，sum=14多组合）
  // 剩下(1,1),(2,1): 7+9=16唯一... 不行
  // 换给定点：让B2=7也给定？这样就少一个空
];

// 让我换givens，使分组更容易
// 更好的策略：先确定笼子划分，再决定哪些cell给值
// 让我重新写一个更灵活的方法

// 直接采用：所有笼子都设计好，包括单格和多格，然后boardData中哪些填0哪些填数我手工选择
