// ==========================================
// 第二章 & 第三章（6x6部分）教学关卡生成器
// 基于 teaching-level-generator.js 的工具函数
// ==========================================

const fs = require('fs');
const path = require('path');
const {
  generateSolution,
  KillerSudokuSolver,
  hasUniqueSolution,
  generateCages,
  validateCages
} = require('./teaching-level-generator.js');

// 原脚本未导出的工具函数，这里重新定义
function calcCageSum(cageCells, solution) {
  return cageCells.reduce((sum, [r, c]) => sum + solution[r][c], 0);
}

const SIZE = 6;
const ROW_SUM = 21; // 6x6每行和为21

// ==========================================
// 工具函数
// ==========================================

function createPuzzle(size, cages, solution) {
  const cells = Array.from({ length: size }, () => Array(size).fill(0));
  return {
    size,
    cells,
    cages: JSON.parse(JSON.stringify(cages)),
    solution: solution.map(row => row.slice())
  };
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 6x6中2格笼的唯一组合和值
const TWO_CELL_UNIQUE_SUMS = [3, 4, 10, 11];
// 6x6中2格笼的少组合和值（2种组合）
const TWO_CELL_FEW_SUMS = [3, 4, 5, 9, 10, 11];
// 6x6中3格笼的唯一组合和值
const THREE_CELL_UNIQUE_SUMS = [6, 7, 14, 15];

/**
 * 获取6x6中2格笼和值的所有组合
 */
function getTwoCellCombos(sum) {
  const combos = [];
  for (let a = 1; a <= 6; a++) {
    const b = sum - a;
    if (b > a && b <= 6) combos.push([a, b]);
  }
  return combos;
}

/**
 * 获取6x6中3格笼和值的所有组合
 */
function getThreeCellCombos(sum) {
  const combos = [];
  for (let a = 1; a <= 6; a++) {
    for (let b = a + 1; b <= 6; b++) {
      const c = sum - a - b;
      if (c > b && c <= 6) combos.push([a, b, c]);
    }
  }
  return combos;
}

/**
 * 用指定的固定笼子生成关卡，并验证唯一解
 * @param {Array} fixedCages - 固定笼子 [{cells: [[r,c],...]}]
 * @param {Object} options - { minSize, maxSize, maxAttempts, solutionAttempts }
 */
function generateLevelWithFixedCages(fixedCages, options = {}) {
  const {
    minSize = 2,
    maxSize = 3,
    maxAttempts = 500,
    solutionAttempts = 200,
    cageAttempts = 50
  } = options;

  for (let solAttempt = 0; solAttempt < solutionAttempts; solAttempt++) {
    const solution = generateSolution(SIZE);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const cages = generateCages(solution, SIZE, {
        minSize,
        maxSize,
        fixedCages,
        attempts: cageAttempts
      });

      if (!cages) continue;
      if (!validateCages(cages, solution, SIZE)) continue;

      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        return createPuzzle(SIZE, cages, solution);
      }
    }
  }
  return null;
}

// ==========================================
// 第二章关卡生成
// ==========================================

/**
 * 第201关「21法则初现」
 * 6x6，第一行刚好能用21法则算出1个确定数
 *
 * 设计：第一行有5个格子被"完全在第一行内"的笼子覆盖，
 * 第6个格子属于一个跨行笼子。
 * 玩家可用 21 - 完全在第一行的笼子和 = 跨行格子在第一行的值
 *
 * 具体布局：
 *   第一行：[笼A 2格][笼B 3格][笼C的上格]
 *   笼C：(0,5) + (1,5) 垂直2格笼
 *   21 - 笼A和 - 笼B和 = (0,5)的值
 */
function generateLevel201() {
  const maxSolAttempts = 300;

  for (let solAttempt = 0; solAttempt < maxSolAttempts; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 固定笼子：第一行前5格分成2+3的笼子，第6格属于垂直跨笼
    const fixedCages = [
      { cells: [[0, 0], [0, 1]] },          // 笼A：第一行前2格
      { cells: [[0, 2], [0, 3], [0, 4]] },  // 笼B：第一行中间3格
      { cells: [[0, 5], [1, 5]] }           // 笼C：跨行2格笼
    ];

    // 验证21法则确实能算出(0,5)的值
    const row0Sum = solution[0][0] + solution[0][1] + solution[0][2] + solution[0][3] + solution[0][4];
    const expected = ROW_SUM - row0Sum;
    if (expected !== solution[0][5]) continue; // 理论上一定相等，保险检查

    // 其余格子生成笼子
    const result = generateLevelWithFixedCages(fixedCages, {
      minSize: 2,
      maxSize: 3,
      maxAttempts: 300,
      solutionAttempts: 1,
      cageAttempts: 50
    });

    if (result) {
      // 确认第一行确实可以用21法则确定(0,5)
      const cages = result.cages;
      // 找完全在第一行的笼子
      let row0CompleteSum = 0;
      let row0CompleteCount = 0;
      for (const cage of cages) {
        const allInRow0 = cage.cells.every(([r, c]) => r === 0);
        if (allInRow0) {
          row0CompleteSum += cage.sum;
          row0CompleteCount += cage.cells.length;
        }
      }
      // 应该有5格在完全第一行的笼子里，差1格
      if (row0CompleteCount === 5) {
        const derivedVal = ROW_SUM - row0CompleteSum;
        if (derivedVal === result.solution[0][5]) {
          return result;
        }
      }
    }
  }

  // 保底方案：增加更多约束
  for (let solAttempt = 0; solAttempt < 500; solAttempt++) {
    const solution = generateSolution(SIZE);
    const fixedCages = [
      { cells: [[0, 0], [0, 1]] },
      { cells: [[0, 2], [0, 3]] },
      { cells: [[0, 4], [1, 4]] },  // 跨行，剩(0,5)单独? 不对...
    ];
    // 重新设计：第一行有4格完全在第一行（2个2格笼），
    // 第5格属于跨行笼，第6格... 不对，要刚好差1个

    // 设计：笼1: (0,0)-(0,1) 行内2格
    //       笼2: (0,2)-(0,3)-(0,4) 行内3格
    //       笼3: (0,5)-(1,5) 跨行2格
    // 第一行有5格完全在行内笼子里，差1格
    const fc = [
      { cells: [[0, 0], [0, 1]] },
      { cells: [[0, 2], [0, 3], [0, 4]] },
      { cells: [[0, 5], [1, 5]] },
      // 加几个单格笼增加确定性
      { cells: [[5, 0]] },
      { cells: [[5, 5]] }
    ];

    const result = generateLevelWithFixedCages(fc, {
      minSize: 2,
      maxSize: 3,
      maxAttempts: 200,
      solutionAttempts: 1,
      cageAttempts: 50
    });

    if (result) return result;
  }

  throw new Error('无法生成第201关');
}

/**
 * 第202关「两数组合」
 * 6x6，大量极端和值的2格笼（和=3/4/10/11等只有唯一组合的）
 *
 * 策略：
 * 1. 生成随机解
 * 2. 生成全2格笼划分
 * 3. 统计唯一组合和值的笼子数量
 * 4. 确保有足够多的唯一组合笼，且有唯一解
 */
function generateLevel202() {
  const uniqueSums = TWO_CELL_UNIQUE_SUMS;
  let bestPuzzle = null;
  let bestUniqueCount = 0;

  // 尝试多种2格笼划分方式
  for (let solAttempt = 0; solAttempt < 200; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 尝试不同的划分方式
    for (let divAttempt = 0; divAttempt < 100; divAttempt++) {
      const division = randomTwoCellDivision6x6();
      if (!division) continue;

      const cages = division.map((cells, idx) => ({
        id: idx + 1,
        sum: calcCageSum(cells, solution),
        cells
      }));

      // 统计唯一组合的笼子数量
      let uniqueCount = 0;
      for (const cage of cages) {
        if (cage.cells.length === 2 && uniqueSums.includes(cage.sum)) {
          uniqueCount++;
        }
      }

      // 至少要有8个以上唯一组合的2格笼
      if (uniqueCount < 8) continue;

      // 验证唯一解
      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        if (uniqueCount > bestUniqueCount) {
          bestUniqueCount = uniqueCount;
          bestPuzzle = createPuzzle(SIZE, cages, solution);
          if (uniqueCount >= 12) return bestPuzzle; // 足够好就直接返回
        }
      }
    }
  }

  if (bestPuzzle) return bestPuzzle;

  // 保底：用水平配对 + 调整
  for (let solAttempt = 0; solAttempt < 500; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 水平配对：每行3个2格笼
    const cages = [];
    let id = 1;
    let uniqueCount = 0;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c += 2) {
        const cells = [[r, c], [r, c + 1]];
        const sum = solution[r][c] + solution[r][c + 1];
        cages.push({ id: id++, sum, cells });
        if (uniqueSums.includes(sum)) uniqueCount++;
      }
    }

    if (uniqueCount < 6) continue;

    const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    if (hasUniqueSolution(cells, cages, SIZE)) {
      return createPuzzle(SIZE, cages, solution);
    }
  }

  throw new Error('无法生成第202关');
}

/**
 * 随机生成6x6的全2格笼划分
 */
function randomTwoCellDivision6x6() {
  const size = 6;
  const assigned = Array.from({ length: size }, () => Array(size).fill(false));
  const cages = [];
  let remaining = 36;

  while (remaining > 0) {
    let found = false;
    for (let r = 0; r < size && !found; r++) {
      for (let c = 0; c < size && !found; c++) {
        if (!assigned[r][c]) {
          const neighbors = [];
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && !assigned[nr][nc]) {
              neighbors.push([nr, nc]);
            }
          }
          if (neighbors.length === 0) return null;

          const [nr, nc] = neighbors[randInt(0, neighbors.length - 1)];
          assigned[r][c] = true;
          assigned[nr][nc] = true;
          cages.push([[r, c], [nr, nc]]);
          remaining -= 2;
          found = true;
        }
      }
    }
    if (!found) break;
  }

  return cages.length === 18 ? cages : null;
}

/**
 * 第203关「组合排除」
 * 6x6，2格笼有多种组合，但用行列宫规则能排除掉一些
 *
 * 设计思路：
 * - 全2格笼或大部分2格笼
 * - 有一些和值是多组合的（如和=7有3种组合）
 * - 但结合行/列/宫的约束，可以排除掉部分组合
 * - 难度：简单
 *
 * 策略：生成全2格笼，确保有唯一解，但不要求都是唯一组合。
 * 自然地，玩家需要用行列宫规则来排除组合。
 */
function generateLevel203() {
  for (let solAttempt = 0; solAttempt < 300; solAttempt++) {
    const solution = generateSolution(SIZE);

    for (let divAttempt = 0; divAttempt < 100; divAttempt++) {
      const division = randomTwoCellDivision6x6();
      if (!division) continue;

      const cages = division.map((cells, idx) => ({
        id: idx + 1,
        sum: calcCageSum(cells, solution),
        cells
      }));

      // 统计有多少个2格笼是多组合的（2种或以上）
      let multiComboCount = 0;
      for (const cage of cages) {
        if (cage.cells.length === 2) {
          const combos = getTwoCellCombos(cage.sum);
          if (combos.length >= 2) multiComboCount++;
        }
      }

      // 至少要有8个多组合的笼子（这样玩家需要用排除法）
      // 但也不能太多，否则太难
      if (multiComboCount < 8 || multiComboCount > 14) continue;

      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        return createPuzzle(SIZE, cages, solution);
      }
    }
  }

  // 保底方案：混合2格和3格笼，加几个单格笼确保唯一解
  const result = generateLevelWithFixedCages([
    { cells: [[0, 0]] },
    { cells: [[5, 5]] }
  ], {
    minSize: 2,
    maxSize: 2,
    maxAttempts: 500,
    solutionAttempts: 300,
    cageAttempts: 50
  });

  if (result) return result;
  throw new Error('无法生成第203关');
}

/**
 * 第204关「草稿本」
 * 6x6，需要标记候选数才能顺利推进的题
 * 难度：简单-中等
 *
 * 设计思路：
 * - 没有单格笼（没有直接给出的数字）
 * - 笼子以2格为主，少量3格
 * - 没有明显的显单，需要通过候选数标记推进
 * - 有唯一解
 *
 * 策略：生成没有单格笼的题目，确保有唯一解。
 * 没有直接给出的数字自然需要标记候选数。
 */
function generateLevel204() {
  for (let solAttempt = 0; solAttempt < 300; solAttempt++) {
    const solution = generateSolution(SIZE);

    for (let attempt = 0; attempt < 200; attempt++) {
      const cages = generateCages(solution, SIZE, {
        minSize: 2,
        maxSize: 3,
        fixedCages: [],
        attempts: 50
      });

      if (!cages) continue;
      if (!validateCages(cages, solution, SIZE)) continue;

      // 确保没有单格笼
      const hasSingle = cages.some(c => c.cells.length === 1);
      if (hasSingle) continue;

      // 统计2格笼和3格笼的比例
      const twoCellCount = cages.filter(c => c.cells.length === 2).length;
      if (twoCellCount < 8) continue; // 至少要有一些2格笼

      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        return createPuzzle(SIZE, cages, solution);
      }
    }
  }

  throw new Error('无法生成第204关');
}

/**
 * 第205关「三格密码笼」
 * 6x6，首次出现3格笼，且至少有一个和值极端（只有唯一组合）
 * 难度：中等
 *
 * 设计：
 * - 至少有一个3格笼是极端和值（和=6/7/14/15，唯一组合）
 * - 混合2格笼和3格笼
 * - 难度适中
 *
 * 策略：固定放置一个3格极端和值笼子在显眼位置（如左上角）
 */
function generateLevel205() {
  const uniqueSums = THREE_CELL_UNIQUE_SUMS;

  for (let solAttempt = 0; solAttempt < 500; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 尝试在不同位置放置3格极端和值笼
    const threeCellPositions = [
      [[0, 0], [0, 1], [1, 0]],  // L形 左上角
      [[0, 0], [0, 1], [0, 2]],  // 水平 第一行
      [[0, 0], [1, 0], [2, 0]],  // 垂直 第一列
      [[0, 1], [0, 2], [1, 1]],  // T-like
      [[5, 5], [5, 4], [4, 5]],  // L形 右下角
    ];

    for (const pos of threeCellPositions) {
      // 检查这个3格笼的和值是否是唯一组合
      const sum = calcCageSum(pos, solution);
      if (!uniqueSums.includes(sum)) continue;

      // 检查笼内数字不重复（应该是的，因为是数独解，但位置可能有同行同列同宫问题？）
      const nums = new Set(pos.map(([r, c]) => solution[r][c]));
      if (nums.size !== 3) continue;

      const fixedCages = [
        { cells: pos },  // 3格极端和值笼
      ];

      const result = generateLevelWithFixedCages(fixedCages, {
        minSize: 2,
        maxSize: 3,
        maxAttempts: 200,
        solutionAttempts: 1,
        cageAttempts: 50
      });

      if (result) {
        // 确认至少有一个3格唯一组合笼
        const hasThreeUnique = result.cages.some(c =>
          c.cells.length === 3 && uniqueSums.includes(c.sum)
        );
        if (hasThreeUnique) return result;
      }
    }
  }

  // 保底：强制放置一个3格笼 + 几个单格笼
  for (let solAttempt = 0; solAttempt < 1000; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 找一个3格水平笼，和值是唯一组合
    let found = false;
    let threeCellCage = null;
    for (let r = 0; r < SIZE && !found; r++) {
      for (let c = 0; c <= SIZE - 3 && !found; c++) {
        const cells = [[r, c], [r, c + 1], [r, c + 2]];
        const sum = solution[r][c] + solution[r][c + 1] + solution[r][c + 2];
        if (uniqueSums.includes(sum)) {
          threeCellCage = { cells };
          found = true;
        }
      }
    }

    if (!threeCellCage) continue;

    const fixedCages = [
      threeCellCage,
      { cells: [[0, 5]] },
      { cells: [[5, 0]] },
    ];

    const result = generateLevelWithFixedCages(fixedCages, {
      minSize: 2,
      maxSize: 3,
      maxAttempts: 200,
      solutionAttempts: 1,
      cageAttempts: 50
    });

    if (result) return result;
  }

  throw new Error('无法生成第205关');
}

/**
 * 第206关「多笼推理」
 * 6x6，需要结合多个笼子的信息推理
 * 难度：中等
 *
 * 设计：
 * - 笼子大小混合（2格、3格为主）
 * - 没有或很少单格笼
 * - 需要综合多个笼子的和值信息推理
 * - 有一定难度但可以解
 *
 * 策略：混合2-3格笼，少量单格笼（0-2个）
 */
function generateLevel206() {
  let bestPuzzle = null;
  let bestScore = 0;

  for (let solAttempt = 0; solAttempt < 200; solAttempt++) {
    const solution = generateSolution(SIZE);

    for (let attempt = 0; attempt < 100; attempt++) {
      const cages = generateCages(solution, SIZE, {
        minSize: 2,
        maxSize: 4,
        fixedCages: [],
        attempts: 50
      });

      if (!cages) continue;
      if (!validateCages(cages, solution, SIZE)) continue;

      // 评分：3格笼数量 + 4格笼数量，越多越需要多笼推理
      const threeCellCount = cages.filter(c => c.cells.length === 3).length;
      const fourCellCount = cages.filter(c => c.cells.length === 4).length;
      const singleCellCount = cages.filter(c => c.cells.length === 1).length;

      // 不能有单格笼
      if (singleCellCount > 0) continue;

      // 至少3个3格笼
      if (threeCellCount < 3) continue;

      const score = threeCellCount * 2 + fourCellCount * 3;

      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        if (score > bestScore) {
          bestScore = score;
          bestPuzzle = createPuzzle(SIZE, cages, solution);
        }
      }
    }
  }

  if (bestPuzzle) return bestPuzzle;

  // 保底
  const result = generateLevelWithFixedCages([], {
    minSize: 2,
    maxSize: 4,
    maxAttempts: 500,
    solutionAttempts: 300,
    cageAttempts: 50
  });

  if (result) return result;
  throw new Error('无法生成第206关');
}

/**
 * 第207关「章节测试」
 * 6x6，中等难度综合题
 *
 * 设计：
 * - 综合第二章所有技巧
 * - 混合大小笼子
 * - 中等难度
 * - 有唯一解
 */
function generateLevel207() {
  let bestPuzzle = null;
  let bestDifficulty = 0;

  for (let solAttempt = 0; solAttempt < 200; solAttempt++) {
    const solution = generateSolution(SIZE);

    for (let attempt = 0; attempt < 100; attempt++) {
      const cages = generateCages(solution, SIZE, {
        minSize: 2,
        maxSize: 4,
        fixedCages: [],
        attempts: 50
      });

      if (!cages) continue;
      if (!validateCages(cages, solution, SIZE)) continue;

      // 统计笼子大小分布
      const sizeCounts = {};
      for (const cage of cages) {
        const s = cage.cells.length;
        sizeCounts[s] = (sizeCounts[s] || 0) + 1;
      }

      // 要求：有2格、3格、4格笼（综合各种技巧）
      if (!sizeCounts[2] || !sizeCounts[3]) continue;
      if (sizeCounts[1] && sizeCounts[1] > 2) continue; // 最多2个单格笼

      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        // 用求解器的回溯次数粗略估计难度
        const difficulty = estimateDifficulty(cells, cages, SIZE);
        if (difficulty > bestDifficulty) {
          bestDifficulty = difficulty;
          bestPuzzle = createPuzzle(SIZE, cages, solution);
        }
      }
    }
  }

  if (bestPuzzle) return bestPuzzle;

  // 保底
  const result = generateLevelWithFixedCages([
    { cells: [[0, 0]] },
  ], {
    minSize: 2,
    maxSize: 4,
    maxAttempts: 500,
    solutionAttempts: 300,
    cageAttempts: 50
  });

  if (result) return result;
  throw new Error('无法生成第207关');
}

/**
 * 估算难度（用求解器的节点访问数）
 */
function estimateDifficulty(cells, cages, size) {
  const solver = new KillerSudokuSolver(
    cells.map(r => r.slice()),
    JSON.parse(JSON.stringify(cages)),
    size
  );
  let count = 0;
  const originalBacktrack = solver._backtrack.bind(solver);
  solver._backtrack = function() {
    count++;
    if (count > 10000) return; // 限制上限
    return originalBacktrack();
  };
  solver.solve(1);
  return count;
}

// ==========================================
// 第三章前3关（6x6部分）
// ==========================================

/**
 * 第301关「双行合璧」
 * 6x6，两行联合的21法则（21×2=42）可以算出一个或多个确定数
 * 难度：中等
 *
 * 设计：
 * - 前两行（第0、1行）有大量笼子完全在前两行内
 * - 只有1个（或少数几个）格子属于"超出前两行"的笼子
 * - 玩家可以用 42 - 完全在前两行的笼子和 = 超出格子的值（的和）
 *
 * 具体布局示例：
 *   前两行有11个格子被"完全在前两行"的笼子覆盖
 *   第12个格子属于一个跨出前两行的笼子（和第2行连接）
 *   42 - 前两行笼子和 = 第12格的值
 */
function generateLevel301() {
  for (let solAttempt = 0; solAttempt < 500; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 设计固定笼子：
    // 前两行有11格完全在前两行内，1格跨到第2行
    // 布局：
    //   行0: [  笼A 3格  ][ 笼B 2格 ][笼C上格]
    //   行1: [ 笼D 2格 ][  笼E 3格  ][笼C中格]
    //   行2: [ ...    ][ ...       ][笼C下格]
    // 不对，笼C跨3行就完全超出了

    // 重新设计：
    // 前两行有5个笼子共11格完全在前两行
    // 第12格(1,5)属于一个跨到第2行的笼子
    // 这样 42 - 前两行5个笼子的和 = (1,5)的值

    // 固定笼子布局（前两行）：
    // 笼1: (0,0)-(0,1)-(0,2) 水平3格
    // 笼2: (0,3)-(0,4) 水平2格
    // 笼3: (0,5)-(1,5) 垂直2格 -> 这是跨出的？不，完全在前两行
    // 不对，要让1个格子跨出前两行

    // 正确设计：
    // 笼1: (0,0)-(0,1)-(0,2) 3格
    // 笼2: (0,3)-(0,4) 2格
    // 笼3: (1,0)-(1,1)-(1,2) 3格
    // 笼4: (1,3)-(1,4) 2格
    // 笼5: (0,5)-(1,5)-(2,5) 垂直3格 -> 只有2格在前两行，1格在第2行
    // 前两行共 3+2+3+2+2 = 12格？不对，是3+2+3+2+2=12，那笼5的2格完全在前两行吗？
    // 笼5有2格在前两行(0,5和1,5)，1格在第2行(2,5)
    // 所以笼5不是"完全在前两行"的笼子
    // 完全在前两行的笼子：笼1(3) + 笼2(2) + 笼3(3) + 笼4(2) = 10格
    // 不完全的：笼5有2格在前两行
    // 42 - (笼1+笼2+笼3+笼4) = 前两行剩下2格的值的和
    // 但玩家不知道这2格分别是多少，只知道和

    // 要"算出一个确定数"，需要差刚好是1个格子
    // 即前两行有11个格子被"完全在前两行的笼子"覆盖，第12个格子不属于任何完全笼子
    // 42 - 完全笼子和 = 那个格子的值

    // 设计：
    // 笼1: (0,0)-(0,1)-(0,2)-(0,3)-(0,4) 水平5格 -> 完全在第0行
    // 笼2: (1,0)-(1,1)-(1,2)-(1,3)-(1,4) 水平5格 -> 完全在第1行
    // 笼3: (0,5)-(1,5)-(2,5) 垂直3格 -> 只有(0,5)和(1,5)在前两行
    // 完全在前两行的格子：5+5=10格
    // 不完全的：2格(0,5和1,5)
    // 42 - 笼1和 - 笼2和 = solution[0][5] + solution[1][5]
    // 这只能算出2个格子的和，不是单个确定数

    // 让前两行有11个格子在完全笼子里：
    // 比如前两行有一个5格笼 + 一个6格笼 = 11格
    // 或者更自然的布局...

    // 换一种方式：前两行的11个格子组成若干个笼子（都完全在前两行内）
    // 第12个格子（比如(1,5)）属于一个跨到第2行的笼子
    // 42 - 前两行完全笼子的和 = (1,5)的值

    // 布局：
    // 行0: [笼A 2格][笼B 2格][笼C 2格] -> 3个2格笼，共6格
    // 行1: [笼D 2格][笼E 2格][笼F的上格] -> 2个2格笼 + 1格，共5格
    // 笼F: (1,5)-(2,5) 垂直2格 -> 1格在前两行
    // 完全在前两行：6+4 = 10格，差2格(0,5和1,5)... 不对

    // 让(0,5)属于笼C（完全在第0行），(1,5)属于笼F（跨行）
    // 笼C: (0,4)-(0,5) 水平2格 -> 完全在第0行
    // 这样前两行的完全笼子有：
    // 笼A(2) + 笼B(2) + 笼C(2) + 笼D(2) + 笼E(2) = 10格
    // 不完全的：(1,5) 属于笼F
    // 42 - 5个笼子的和 = (1,5)的值 ✓

    const fixedCages = [
      { cells: [[0, 0], [0, 1]] },              // 笼A
      { cells: [[0, 2], [0, 3]] },              // 笼B
      { cells: [[0, 4], [0, 5]] },              // 笼C
      { cells: [[1, 0], [1, 1]] },              // 笼D
      { cells: [[1, 2], [1, 3]] },              // 笼E
      { cells: [[1, 5], [2, 5]] },              // 笼F：跨到第2行
    ];

    // 验证：前两行的完全笼子和 + (1,5) = 42
    let completeSum = 0;
    for (let i = 0; i < 5; i++) {
      completeSum += calcCageSum(fixedCages[i].cells, solution);
    }
    const derived = 42 - completeSum;
    if (derived !== solution[1][5]) continue; // 理论上应该相等

    // 生成其余笼子
    const result = generateLevelWithFixedCages(fixedCages, {
      minSize: 2,
      maxSize: 3,
      maxAttempts: 200,
      solutionAttempts: 1,
      cageAttempts: 50
    });

    if (result) {
      // 验证双行法则确实有效
      let row01CompleteSum = 0;
      let row01CompleteCells = 0;
      for (const cage of result.cages) {
        const allInFirstTwoRows = cage.cells.every(([r, c]) => r < 2);
        if (allInFirstTwoRows) {
          row01CompleteSum += cage.sum;
          row01CompleteCells += cage.cells.length;
        }
      }
      // 应该有11格完全在前两行，差1格
      if (row01CompleteCells === 11) {
        return result;
      }
    }
  }

  // 保底方案：加单格笼确保唯一解
  for (let solAttempt = 0; solAttempt < 500; solAttempt++) {
    const solution = generateSolution(SIZE);
    const fixedCages = [
      { cells: [[0, 0], [0, 1]] },
      { cells: [[0, 2], [0, 3]] },
      { cells: [[0, 4], [0, 5]] },
      { cells: [[1, 0], [1, 1]] },
      { cells: [[1, 2], [1, 3]] },
      { cells: [[1, 4], [2, 4]] },  // 跨行
      { cells: [[5, 0]] },
      { cells: [[5, 5]] },
    ];

    const result = generateLevelWithFixedCages(fixedCages, {
      minSize: 2,
      maxSize: 3,
      maxAttempts: 200,
      solutionAttempts: 1,
      cageAttempts: 50
    });

    if (result) return result;
  }

  throw new Error('无法生成第301关');
}

/**
 * 第302关「组合交叉」
 * 6x6，相邻笼子组合可以交叉验证排除
 * 难度：中等
 *
 * 设计：
 * - 有一些相邻的2格笼（或3格笼），它们的候选组合互相约束
 * - 例如：两个相邻的2格笼共享一行/列/宫，
 *   它们的组合候选可以互相排除
 * - 以2格笼为主，有少量3格笼
 *
 * 策略：
 * - 全2格笼为主
 * - 设计一些"相邻对"笼子，它们共享行/列/宫
 * - 玩家需要交叉验证这些笼子的组合
 * - 确保有唯一解
 */
function generateLevel302() {
  let bestPuzzle = null;
  let bestScore = 0;

  for (let solAttempt = 0; solAttempt < 200; solAttempt++) {
    const solution = generateSolution(SIZE);

    for (let divAttempt = 0; divAttempt < 100; divAttempt++) {
      const division = randomTwoCellDivision6x6();
      if (!division) continue;

      const cages = division.map((cells, idx) => ({
        id: idx + 1,
        sum: calcCageSum(cells, solution),
        cells
      }));

      // 计算"组合交叉"评分：
      // 有多少对相邻笼子共享行/列，且它们都是多组合的
      let crossScore = 0;
      for (let i = 0; i < cages.length; i++) {
        for (let j = i + 1; j < cages.length; j++) {
          // 检查是否相邻
          const ci = cages[i], cj = cages[j];
          let adjacent = false;
          for (const [r1, c1] of ci.cells) {
            for (const [r2, c2] of cj.cells) {
              if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) {
                adjacent = true;
                break;
              }
            }
            if (adjacent) break;
          }
          if (!adjacent) continue;

          // 两个都是2格笼且都是多组合的
          if (ci.cells.length === 2 && cj.cells.length === 2) {
            const combosI = getTwoCellCombos(ci.sum);
            const combosJ = getTwoCellCombos(cj.sum);
            if (combosI.length >= 2 && combosJ.length >= 2) {
              crossScore++;
            }
          }
        }
      }

      // 至少有5对交叉组合
      if (crossScore < 5) continue;

      const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
      if (hasUniqueSolution(cells, cages, SIZE)) {
        if (crossScore > bestScore) {
          bestScore = crossScore;
          bestPuzzle = createPuzzle(SIZE, cages, solution);
        }
      }
    }
  }

  if (bestPuzzle) return bestPuzzle;

  // 保底
  for (let solAttempt = 0; solAttempt < 300; solAttempt++) {
    const solution = generateSolution(SIZE);
    const cages = generateAllTwoCellHorizontal6x6(solution);
    const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    if (hasUniqueSolution(cells, cages, SIZE)) {
      return createPuzzle(SIZE, cages, solution);
    }
  }

  throw new Error('无法生成第302关');
}

function generateAllTwoCellHorizontal6x6(solution) {
  const cages = [];
  let id = 1;
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 6; c += 2) {
      cages.push({
        id: id++,
        sum: solution[r][c] + solution[r][c + 1],
        cells: [[r, c], [r, c + 1]]
      });
    }
  }
  return cages;
}

/**
 * 第303关「区块初探」
 * 6x6，有区块排除法的应用场景
 * 难度：中等
 *
 * 区块排除法：某个数字在某宫/行/列中只能出现在特定位置，
 * 而这些位置都在同一个笼子里（或同一个行/列），
 * 因此可以排除该数字在其他地方的可能性。
 *
 * 设计：
 * - 混合2格和3格笼
 * - 某个宫的笼子布局使得某个数字只能出现在特定的几格中
 * - 这些格子恰好都在同一行/列，形成区块排除
 *
 * 策略：
 * - 设计特定的宫级笼子布局
 * - 使得某个数字在某宫中只能出现在同一行的两个格子里
 * - 这样就可以在该行的其他宫排除这个数字
 */
function generateLevel303() {
  for (let solAttempt = 0; solAttempt < 300; solAttempt++) {
    const solution = generateSolution(SIZE);

    // 设计左上宫(0-1行, 0-2列)的笼子布局
    // 使得某个数字只能出现在同一行/列
    //
    // 布局示例：
    // 笼1: (0,0)-(1,0) 垂直2格
    // 笼2: (0,1)-(0,2) 水平2格
    // 笼3: (1,1)-(1,2) 水平2格
    // 这样第一列的两个格子在同一笼，第二三列的每行各在一笼
    //
    // 或者更简单的布局：
    // 笼1: (0,0)-(0,1) 水平2格
    // 笼2: (1,0)-(1,1) 水平2格
    // 笼3: (0,2)-(1,2) 垂直2格
    // 这样有一个垂直跨笼，其他是水平的

    // 让我用一个更可能产生区块排除的布局：
    // 左上宫：
    //   笼A: (0,0)-(1,0)-(1,1) L形3格
    //   笼B: (0,1)-(0,2) 水平2格
    // 这样笼B的2格都在第0行，如果笼B的组合包含某个特定数字，
    // 而那个数字在左上宫中只能出现在第0行...

    // 实际上，区块排除的场景比较复杂，让我用更直接的方式：
    // 生成一个有唯一解的题目，确保其求解过程中需要用到区块排除
    // 由于我们的求解器不做人类技巧分析，我们用启发式：
    // - 没有单格笼
    // - 3格笼较多
    // - 某些宫里的笼子布局比较"散"

    const fixedCages = [
      // 左上宫：L形3格 + 水平2格 + 垂直1格（总共6格）
      { cells: [[0, 0], [1, 0], [1, 1]] },    // L形3格
      { cells: [[0, 1], [0, 2]] },            // 水平2格
      // (1,2) 留给其他笼子
    ];

    // 检查笼内数字不重复
    const cage0Nums = new Set(fixedCages[0].cells.map(([r, c]) => solution[r][c]));
    const cage1Nums = new Set(fixedCages[1].cells.map(([r, c]) => solution[r][c]));
    if (cage0Nums.size !== 3 || cage1Nums.size !== 2) continue;

    const result = generateLevelWithFixedCages(fixedCages, {
      minSize: 2,
      maxSize: 3,
      maxAttempts: 200,
      solutionAttempts: 1,
      cageAttempts: 50
    });

    if (result) {
      // 检查有没有单格笼
      const hasSingle = result.cages.some(c => c.cells.length === 1);
      if (hasSingle) continue;
      // 检查3格笼数量
      const threeCount = result.cages.filter(c => c.cells.length === 3).length;
      if (threeCount >= 4) return result;
    }
  }

  // 保底方案
  for (let solAttempt = 0; solAttempt < 500; solAttempt++) {
    const solution = generateSolution(SIZE);
    const cages = generateCages(solution, SIZE, {
      minSize: 2,
      maxSize: 4,
      fixedCages: [],
      attempts: 50
    });
    if (!cages) continue;
    if (!validateCages(cages, solution, SIZE)) continue;

    const hasSingle = cages.some(c => c.cells.length === 1);
    if (hasSingle) continue;

    const threeCount = cages.filter(c => c.cells.length === 3).length;
    if (threeCount < 4) continue;

    const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    if (hasUniqueSolution(cells, cages, SIZE)) {
      return createPuzzle(SIZE, cages, solution);
    }
  }

  // 终极保底
  const result = generateLevelWithFixedCages([], {
    minSize: 2,
    maxSize: 4,
    maxAttempts: 500,
    solutionAttempts: 300,
    cageAttempts: 50
  });
  if (result) return result;

  throw new Error('无法生成第303关');
}

// ==========================================
// 主生成函数
// ==========================================

function generateChapter2() {
  console.log('========== 生成第二章教学关卡（6x6） ==========\n');
  const levels = [];

  const levelDefs = [
    { id: 201, name: '21法则初现', difficulty: '简单', gen: generateLevel201 },
    { id: 202, name: '两数组合', difficulty: '简单', gen: generateLevel202 },
    { id: 203, name: '组合排除', difficulty: '简单', gen: generateLevel203 },
    { id: 204, name: '草稿本', difficulty: '简单-中等', gen: generateLevel204 },
    { id: 205, name: '三格密码笼', difficulty: '中等', gen: generateLevel205 },
    { id: 206, name: '多笼推理', difficulty: '中等', gen: generateLevel206 },
    { id: 207, name: '章节测试', difficulty: '中等', gen: generateLevel207 },
  ];

  for (const def of levelDefs) {
    console.log(`生成第 ${def.id} 关（${def.name}）...`);
    const puzzle = def.gen();
    const valid = validateCages(puzzle.cages, puzzle.solution, puzzle.size);
    const unique = hasUniqueSolution(puzzle.cells, puzzle.cages, puzzle.size);
    console.log(`  尺寸: ${puzzle.size}x${puzzle.size}, 笼子数: ${puzzle.cages.length}`);
    console.log(`  笼子合法: ${valid}, 唯一解: ${unique}`);
    const sizeDist = {};
    for (const c of puzzle.cages) {
      sizeDist[c.cells.length] = (sizeDist[c.cells.length] || 0) + 1;
    }
    console.log(`  笼子大小分布: ${JSON.stringify(sizeDist)}`);

    levels.push({
      id: def.id,
      ...puzzle,
      name: def.name,
      difficulty: def.difficulty
    });
  }

  console.log('\n========== 第二章生成完成 ==========\n');
  return levels;
}

function generateChapter3_6x6() {
  console.log('========== 生成第三章6x6部分教学关卡 ==========\n');
  const levels = [];

  const levelDefs = [
    { id: 301, name: '双行合璧', difficulty: '中等', gen: generateLevel301 },
    { id: 302, name: '组合交叉', difficulty: '中等', gen: generateLevel302 },
    { id: 303, name: '区块初探', difficulty: '中等', gen: generateLevel303 },
  ];

  for (const def of levelDefs) {
    console.log(`生成第 ${def.id} 关（${def.name}）...`);
    const puzzle = def.gen();
    const valid = validateCages(puzzle.cages, puzzle.solution, puzzle.size);
    const unique = hasUniqueSolution(puzzle.cells, puzzle.cages, puzzle.size);
    console.log(`  尺寸: ${puzzle.size}x${puzzle.size}, 笼子数: ${puzzle.cages.length}`);
    console.log(`  笼子合法: ${valid}, 唯一解: ${unique}`);
    const sizeDist = {};
    for (const c of puzzle.cages) {
      sizeDist[c.cells.length] = (sizeDist[c.cells.length] || 0) + 1;
    }
    console.log(`  笼子大小分布: ${JSON.stringify(sizeDist)}`);

    levels.push({
      id: def.id,
      ...puzzle,
      name: def.name,
      difficulty: def.difficulty
    });
  }

  console.log('\n========== 第三章6x6部分生成完成 ==========\n');
  return levels;
}

function main() {
  const ch2 = generateChapter2();
  const ch3 = generateChapter3_6x6();

  const allLevels = [...ch2, ...ch3];

  // 输出到文件
  const outputPath = path.join(__dirname, '..', 'game-src', 'data', 'teaching-levels-ch2-3.json');
  fs.writeFileSync(outputPath, JSON.stringify(allLevels, null, 2), 'utf-8');
  console.log(`\n关卡数据已保存到: ${outputPath}`);

  // 最终验证
  console.log('\n========== 最终验证 ==========');
  let allPass = true;
  for (const level of allLevels) {
    const valid = validateCages(level.cages, level.solution, level.size);
    const unique = hasUniqueSolution(level.cells, level.cages, level.size);
    const status = valid && unique ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPass = false;
    console.log(`  ${level.id} (${level.name}): ${status}  笼子合法=${valid}, 唯一解=${unique}`);
  }
  console.log(`\n总结果: ${allPass ? '全部通过' : '有失败项'}`);
}

// 导出
module.exports = {
  generateLevel201,
  generateLevel202,
  generateLevel203,
  generateLevel204,
  generateLevel205,
  generateLevel206,
  generateLevel207,
  generateLevel301,
  generateLevel302,
  generateLevel303,
  generateChapter2,
  generateChapter3_6x6
};

if (require.main === module) {
  main();
}
