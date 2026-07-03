// ==========================================
// 残局生成引擎 v2
// ==========================================
// 两种残局类型：
// 1. 卡壳点残局 (stuck-endgame) - 解到完全卡住的天然残局
// 2. 技巧密集残局 (tech-endgame) - 解题过程中技巧密度最高的阶段
// ==========================================

const SIZE = 9;
const { TechRaterSolver } = require('./tech-rater-v2.js');
const { createSolver } = require('./killer-generator.js');

const TECH_LEVELS = {
  nakedSingle: 1,
  cageUnique: 2,
  hiddenSingle: 3,
  rule45: 4,
  nakedPair: 5,
  hiddenPair: 6,
  pointingClaiming: 7,
  nakedTriplet: 8,
  xWing: 9
};

function getTechLevel(techId) {
  return TECH_LEVELS[techId] || 10;
}

// ==========================================
// 1. 卡壳点残局（从0预填解到完全卡住）
// ==========================================
function generateStuckEndgame(solution, cages, options = {}) {
  const {
    minEmpties = 10,
    maxEmpties = 60,
    minNonTrivialPct = 0.05,
    minMaxTech = 2
  } = options;
  
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  const emptyBoard = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  const solver = new TechRaterSolver(emptyBoard, normCages);
  const result = solver.solve(500);
  
  const filled = result.steps;
  const empties = result.remaining;
  
  if (result.complete) return null;
  if (empties < minEmpties || empties > maxEmpties) return null;
  
  const rating = solver.getRating();
  
  if (rating.maxTechLevel < minMaxTech) return null;
  
  const nonTrivial = filled - (rating.techCount.nakedSingle || 0);
  const nonTrivialPct = filled > 0 ? nonTrivial / filled : 0;
  if (nonTrivialPct < minNonTrivialPct) return null;
  
  const board = solver.grid.map(row => [...row]);
  
  const solve = createSolver(cages);
  const valid = solve(board, 2, 3000);
  if (valid.count !== 1) return null;
  
  return {
    board,
    givenCount: filled,
    empties,
    rating,
    nonTrivialPct,
    nonTrivialCount: nonTrivial,
    endgameType: 'stuck',
    stuckAtLevel: rating.maxTechLevel
  };
}

// ==========================================
// 2. 技巧密集残局（解题过程中技巧密度最高的阶段）
// ==========================================
// 从0预填开始解题，记录每一步的盘面，
// 找到"技巧密度最高"的区间作为残局。
//
// 技巧密度定义：最近N步中，非裸单的比例
// ==========================================
function generateTechEndgame(solution, cages, options = {}) {
  const {
    targetEmpties = 20,    // 目标空格数（近似）
    minTechDensity = 0.3,  // 最低技巧密度（非裸单比例）
    minMaxTech = 2,        // 最低最高技巧
    windowSize = 10        // 滑动窗口大小
  } = options;
  
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  // 分步解题，记录每一步的状态
  const emptyBoard = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  const solver = new TechRaterSolver(emptyBoard, normCages);
  
  const steps = []; // 每步: { r, c, num, tech, boardSnapshot }
  let lastTech = null;
  
  // 覆写_fillCell来捕获每一步
  const origFillCell = solver._fillCell.bind(solver);
  solver._fillCell = function(row, col, num, techId) {
    steps.push({
      r: row,
      c: col,
      num,
      tech: techId,
      stepIndex: steps.length
    });
    return origFillCell(row, col, num, techId);
  };
  
  const result = solver.solve(500);
  const totalSteps = steps.length;
  
  if (totalSteps < 10) return null; // 步数太少，没意义
  
  const fullRating = solver.getRating();
  
  if (fullRating.maxTechLevel < minMaxTech) return null;
  
  // 找技巧密度最高的窗口
  let bestWindowStart = -1;
  let bestDensity = 0;
  let bestEmpties = 0;
  
  // 只考虑剩余空格在 [targetEmpties-10, targetEmpties+20] 范围内的位置
  for (let i = 0; i <= totalSteps - windowSize; i++) {
    const empties = 81 - (i + windowSize);
    if (empties < Math.max(8, targetEmpties - 15)) continue;
    if (empties > targetEmpties + 25) continue;
    
    // 计算窗口内的非裸单数量
    let nonTrivial = 0;
    for (let j = i; j < i + windowSize && j < totalSteps; j++) {
      if (steps[j].tech !== 'nakedSingle') {
        nonTrivial++;
      }
    }
    const density = nonTrivial / windowSize;
    
    // 加权：越接近目标空格数越好
    const emptiesDiff = Math.abs(empties - targetEmpties);
    const emptiesBonus = 1 - Math.min(emptiesDiff, 30) / 30;
    const score = density * 0.7 + emptiesBonus * 0.3;
    
    const bestScore = bestDensity * 0.7 + (1 - Math.min(Math.abs(bestEmpties - targetEmpties), 30) / 30) * 0.3;
    
    if (score > bestScore && density >= minTechDensity * 0.8) {
      bestWindowStart = i;
      bestDensity = density;
      bestEmpties = empties;
    }
  }
  
  if (bestWindowStart < 0) {
    // 没找到足够技巧密度的窗口，降级为卡壳点残局
    return null;
  }
  
  // 重建残局盘面（从第0步到bestWindowStart + windowSize步）
  const board = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  const endStep = Math.min(bestWindowStart + windowSize, totalSteps);
  for (let i = 0; i < endStep; i++) {
    board[steps[i].r][steps[i].c] = steps[i].num;
  }
  
  // 验证唯一解
  const solve = createSolver(cages);
  const valid = solve(board, 2, 3000);
  if (valid.count !== 1) return null;
  
  // 计算从这个盘面出发的难度
  const boardSolver = new TechRaterSolver(board.map(row => [...row]), normCages);
  boardSolver.solve(500);
  const boardRating = boardSolver.getRating();
  
  // 计算"剩余空格中需要技巧的比例"
  let techCells = 0;
  let totalEmpty = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0) {
        totalEmpty++;
        const cellTech = boardSolver.cellTech[r * SIZE + c];
        if (!cellTech || getTechLevel(cellTech) >= 2) {
          techCells++;
        }
      }
    }
  }
  const techDensity = totalEmpty > 0 ? techCells / totalEmpty : 0;
  
  return {
    board,
    givenCount: 81 - totalEmpty,
    empties: totalEmpty,
    rating: fullRating,
    boardRating,
    techDensity,
    endgameType: 'tech',
    windowDensity: bestDensity,
    startStep: bestWindowStart,
    windowSize
  };
}

// ==========================================
// 3. 生成多种残局（从一道题生成多个不同阶段的残局）
// ==========================================
function generateAllEndgames(solution, cages, options = {}) {
  const results = [];
  
  // 1. 卡壳点残局
  const stuck = generateStuckEndgame(solution, cages, options);
  if (stuck) results.push(stuck);
  
  // 2. 技巧密集残局（不同目标空格数）
  const targets = [15, 20, 25, 30, 35];
  for (const target of targets) {
    const tech = generateTechEndgame(solution, cages, {
      ...options,
      targetEmpties: target
    });
    if (tech) {
      // 去重：和已有结果空格数差小于5的算重复
      const dup = results.find(r => Math.abs(r.empties - tech.empties) < 5);
      if (!dup) results.push(tech);
    }
  }
  
  return results;
}

module.exports = {
  generateStuckEndgame,
  generateTechEndgame,
  generateAllEndgames,
  getTechLevel,
  TECH_LEVELS
};
