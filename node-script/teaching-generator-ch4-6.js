// ==========================================
// 9x9 杀手数独教学关卡生成器（第四、五、六章）
// ==========================================

const fs = require('fs');
const path = require('path');
const { KillerSudokuSolver, quickRateDifficulty } = require('./solver-rater');

const SIZE = 9;

// ==========================================
// 工具函数
// ==========================================

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cloneGrid(grid) {
  return grid.map(row => row.slice());
}

function deepCopy(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ==========================================
// 数独解生成器
// ==========================================

function isValidPlacement(grid, r, c, num) {
  for (let i = 0; i < SIZE; i++) {
    if (grid[r][i] === num) return false;
    if (grid[i][c] === num) return false;
  }
  const boxR = Math.floor(r / 3) * 3;
  const boxC = Math.floor(c / 3) * 3;
  for (let i = boxR; i < boxR + 3; i++) {
    for (let j = boxC; j < boxC + 3; j++) {
      if (grid[i][j] === num) return false;
    }
  }
  return true;
}

function fillGrid(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const num of nums) {
          if (isValidPlacement(grid, r, c, num)) {
            grid[r][c] = num;
            if (fillGrid(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function generateSolution() {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  fillGrid(grid);
  return grid;
}

// ==========================================
// 求解器封装
// ==========================================

function hasUniqueSolution(cages) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const solver = new KillerSudokuSolver(grid, cages);
  solver.solve(2);
  return solver.getResult().unique;
}

function checkUniqueAndGetSolution(cages) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const solver = new KillerSudokuSolver(grid, cages);
  solver.solve(2);
  const result = solver.getResult();
  return { unique: result.unique, solution: result.solution, solved: result.solved };
}

// ==========================================
// 笼子工具函数
// ==========================================

function calcCageSum(cells, solution) {
  return cells.reduce((sum, [r, c]) => sum + solution[r][c], 0);
}

function isCageConnected(cells) {
  if (cells.length <= 1) return true;
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
  const visited = new Set();
  const queue = [cells[0]];
  visited.add(`${cells[0][0]},${cells[0][1]}`);
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const key = `${r + dr},${c + dc}`;
      if (cellSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([r + dr, c + dc]);
      }
    }
  }
  return visited.size === cells.length;
}

function validateCages(cages, solution) {
  const covered = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  let totalCells = 0;
  for (const cage of cages) {
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      if (covered[r][c]) return false;
      covered[r][c] = true;
      totalCells++;
      nums.add(solution[r][c]);
    }
    if (nums.size !== cage.cells.length) return false;
    if (cage.sum !== calcCageSum(cage.cells, solution)) return false;
    if (!isCageConnected(cage.cells)) return false;
  }
  if (totalCells !== SIZE * SIZE) return false;
  return true;
}

function getAssignedCells(cages) {
  const assigned = new Set();
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      assigned.add(`${r},${c}`);
    }
  }
  return assigned;
}

// ==========================================
// 填充剩余格子为随机大小的笼子
// ==========================================

function fillRemainingCages(solution, fixedCages, minSize, maxSize) {
  const assignedSet = getAssignedCells(fixedCages);
  const cages = [...fixedCages];
  let nextId = cages.length > 0 ? Math.max(...cages.map(c => c.id)) + 1 : 1;

  const unassigned = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!assignedSet.has(`${r},${c}`)) {
        unassigned.push([r, c]);
      }
    }
  }

  const seedOrder = shuffle(unassigned);

  for (const [sr, sc] of seedOrder) {
    if (assignedSet.has(`${sr},${sc}`)) continue;

    const targetSize = randInt(minSize, maxSize);
    const cageCells = [[sr, sc]];
    assignedSet.add(`${sr},${sc}`);
    const cageNums = new Set([solution[sr][sc]]);

    const frontier = [[sr, sc]];
    while (cageCells.length < targetSize && frontier.length > 0) {
      const idx = randInt(0, frontier.length - 1);
      const [cr, cc] = frontier[idx];

      const neighbors = [];
      const safeNeighbors = [];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !assignedSet.has(`${nr},${nc}`)) {
          neighbors.push([nr, nc]);
          if (!cageNums.has(solution[nr][nc])) {
            safeNeighbors.push([nr, nc]);
          }
        }
      }

      if (neighbors.length === 0) {
        frontier.splice(idx, 1);
        continue;
      }

      const pool = safeNeighbors.length > 0 ? safeNeighbors : neighbors;
      const pick = pool[randInt(0, pool.length - 1)];
      cageCells.push(pick);
      cageNums.add(solution[pick[0]][pick[1]]);
      assignedSet.add(`${pick[0]},${pick[1]}`);
      frontier.push(pick);
    }

    cageCells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    cages.push({
      id: nextId++,
      sum: calcCageSum(cageCells, solution),
      cells: cageCells
    });
  }

  const allAssigned = assignedSet.size === SIZE * SIZE;
  if (!allAssigned) return null;

  return cages;
}

// ==========================================
// 45法则分析工具（修正版）
// ==========================================

// 获取区域内的格子集合
function getRegionCells(regionType, regionId) {
  const cells = new Set();
  if (regionType === 'row') {
    for (let c = 0; c < SIZE; c++) cells.add(`${regionId},${c}`);
  } else if (regionType === 'col') {
    for (let r = 0; r < SIZE; r++) cells.add(`${r},${regionId}`);
  } else if (regionType === 'box') {
    const br = Math.floor(regionId / 3) * 3;
    const bc = (regionId % 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) cells.add(`${r},${c}`);
    }
  }
  return cells;
}

/**
 * 分析某区域的45法则：是否能直接算出某个格子的值
 * 
 * 原理：
 * 区域总和 = 45
 * = 完全在区域内的笼子的和 + 跨边界笼子在区域内的部分
 * 
 * 如果跨边界笼子在区域内只有1个格子 → 可以算出那格的值
 * 如果跨边界笼子在区域外只有1个格子 → 可以算出那格的值
 * 
 * @returns {Object|null} - {cell: [r,c], value: number, type: 'inside_single'|'outside_single'}
 */
function analyze45Rule(cages, regionType, regionId) {
  const regionCells = getRegionCells(regionType, regionId);
  
  let fullyInsideSum = 0;
  let totalCrossingSum = 0; // 所有跨边界笼子的总和
  
  const insideCrossingCells = []; // 跨笼在区域内的格子
  const outsideCrossingCells = []; // 跨笼在区域外的格子
  
  for (const cage of cages) {
    let inside = 0;
    let outside = 0;
    const inCells = [];
    const outCells = [];
    
    for (const [r, c] of cage.cells) {
      if (regionCells.has(`${r},${c}`)) {
        inside++;
        inCells.push([r, c]);
      } else {
        outside++;
        outCells.push([r, c]);
      }
    }
    
    if (outside === 0) {
      // 完全在区域内
      fullyInsideSum += cage.sum;
    } else if (inside > 0) {
      // 跨边界
      totalCrossingSum += cage.sum;
      insideCrossingCells.push(...inCells);
      outsideCrossingCells.push(...outCells);
    }
  }
  
  // 情况1：区域内只有1个格子属于跨边界笼子
  // 区域和 = fullyInsideSum + 那1格的值 = 45
  // 那1格的值 = 45 - fullyInsideSum
  if (insideCrossingCells.length === 1) {
    return {
      cell: insideCrossingCells[0],
      value: 45 - fullyInsideSum,
      type: 'inside_single',
      fullyInsideSum,
      crossingCageCount: outsideCrossingCells.length > 0 ? 1 : 0
    };
  }
  
  // 情况2：区域外只有1个格子属于跨边界笼子
  // 区域和 = fullyInsideSum + (totalCrossingSum - 那1格的值) = 45
  // 那1格的值 = fullyInsideSum + totalCrossingSum - 45
  if (outsideCrossingCells.length === 1) {
    return {
      cell: outsideCrossingCells[0],
      value: fullyInsideSum + totalCrossingSum - 45,
      type: 'outside_single',
      fullyInsideSum,
      totalCrossingSum
    };
  }
  
  return null;
}

// 检查任意行/列/宫是否有45法则可算的单格
function hasAny45RuleSingle(cages) {
  for (let r = 0; r < SIZE; r++) {
    if (analyze45Rule(cages, 'row', r)) return true;
  }
  for (let c = 0; c < SIZE; c++) {
    if (analyze45Rule(cages, 'col', c)) return true;
  }
  for (let b = 0; b < 9; b++) {
    if (analyze45Rule(cages, 'box', b)) return true;
  }
  return false;
}

// 计算笼子的可能组合数
function countCombinations(cageSize, cageSum) {
  const results = [];
  function combo(start, remaining, sum, current) {
    if (remaining === 0) {
      if (sum === cageSum) results.push([...current]);
      return;
    }
    if (sum > cageSum) return;
    for (let i = start; i <= 9; i++) {
      current.push(i);
      combo(i + 1, remaining - 1, sum + i, current);
      current.pop();
    }
  }
  combo(1, cageSize, 0, []);
  return results.length;
}

// ==========================================
// 难度评级
// ==========================================

function rateDifficulty(cages) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  return quickRateDifficulty(grid, cages);
}

// ==========================================
// 创建关卡对象
// ==========================================

function createLevel(id, name, difficulty, cages, solution) {
  const cells = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  return {
    id,
    size: SIZE,
    cells,
    cages: deepCopy(cages),
    solution: cloneGrid(solution),
    name,
    difficulty
  };
}

// ==========================================
// 第四章：45号机关 关卡生成
// ==========================================

// 401：45法则入门 - 第一行能用45法则算出1个确定数
function generateLevel401(maxAttempts = 1000) {
  console.log('  生成第401关：45法则入门...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    // 设计第一行笼子：
    // cage1: [0,0][0,1] 2格水平（行0内）
    // cage2: [0,2][0,3] 2格水平（行0内）
    // cage3: [0,4][0,5] 2格水平（行0内）
    // cage4: [0,6][0,7] 2格水平（行0内）
    // cage5: [0,8][1,8] 2格垂直（跨行0-1，行0内有1格）
    // 行0: 2+2+2+2+1 = 9格 ✓
    // 用45法则可算出 [0,8] = 45 - (cage1+cage2+cage3+cage4)
    
    if (solution[0][0] === solution[0][1]) continue;
    if (solution[0][2] === solution[0][3]) continue;
    if (solution[0][4] === solution[0][5]) continue;
    if (solution[0][6] === solution[0][7]) continue;
    if (solution[0][8] === solution[1][8]) continue;

    const fixedCages = [
      { id: 1, sum: solution[0][0] + solution[0][1], cells: [[0, 0], [0, 1]] },
      { id: 2, sum: solution[0][2] + solution[0][3], cells: [[0, 2], [0, 3]] },
      { id: 3, sum: solution[0][4] + solution[0][5], cells: [[0, 4], [0, 5]] },
      { id: 4, sum: solution[0][6] + solution[0][7], cells: [[0, 6], [0, 7]] },
      { id: 5, sum: solution[0][8] + solution[1][8], cells: [[0, 8], [1, 8]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    // 验证行0可以用45法则算出1格
    const row0Result = analyze45Rule(cages, 'row', 0);
    if (!row0Result) continue;

    const [vr, vc] = row0Result.cell;
    if (row0Result.value !== solution[vr][vc]) continue;

    // 难度检查：简单（9x9无初始数字的题目基准分偏高，简单定义为≤58）
    const rating = rateDifficulty(cages);
    if (rating.score > 58) continue;

    console.log(`  ✓ 第401关生成成功（尝试${attempt + 1}次）`);
    console.log(`    45法则可算出：行0的 (${vr},${vc}) = ${row0Result.value}（${row0Result.type}）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(401, '401 45法则入门', '简单', cages, check.solution);
  }

  throw new Error('第401关生成失败');
}

// 402：单列45 - 某一列的45法则应用
function generateLevel402(maxAttempts = 1000) {
  console.log('  生成第402关：单列45...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    const targetCol = 4; // 中间列

    // 列4笼子设计：
    // cage1: [0,4][1,4] 2格垂直（列4内）
    // cage2: [2,4][3,4] 2格垂直（列4内）
    // cage3: [5,4][6,4] 2格垂直（列4内）
    // cage4: [7,4][8,4] 2格垂直（列4内）
    // cage5: [4,3][4,4] 2格水平（跨列3-4，列4内有1格）
    // 列4: 2+2+2+2+1 = 9格 ✓

    if (solution[0][targetCol] === solution[1][targetCol]) continue;
    if (solution[2][targetCol] === solution[3][targetCol]) continue;
    if (solution[5][targetCol] === solution[6][targetCol]) continue;
    if (solution[7][targetCol] === solution[8][targetCol]) continue;
    if (solution[4][targetCol - 1] === solution[4][targetCol]) continue;

    const fixedCages = [
      { id: 1, sum: solution[0][targetCol] + solution[1][targetCol], cells: [[0, targetCol], [1, targetCol]] },
      { id: 2, sum: solution[2][targetCol] + solution[3][targetCol], cells: [[2, targetCol], [3, targetCol]] },
      { id: 3, sum: solution[5][targetCol] + solution[6][targetCol], cells: [[5, targetCol], [6, targetCol]] },
      { id: 4, sum: solution[7][targetCol] + solution[8][targetCol], cells: [[7, targetCol], [8, targetCol]] },
      { id: 5, sum: solution[4][targetCol - 1] + solution[4][targetCol], cells: [[4, targetCol - 1], [4, targetCol]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const colResult = analyze45Rule(cages, 'col', targetCol);
    if (!colResult) continue;

    const [vr, vc] = colResult.cell;
    if (colResult.value !== solution[vr][vc]) continue;

    const rating = rateDifficulty(cages);
    if (rating.score > 58) continue;

    console.log(`  ✓ 第402关生成成功（尝试${attempt + 1}次）`);
    console.log(`    45法则可算出：列${targetCol}的 (${vr},${vc}) = ${colResult.value}（${colResult.type}）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(402, '402 单列45', '简单', cages, check.solution);
  }

  throw new Error('第402关生成失败');
}

// 403：内外差 - 典型的"伸进伸出"差值场景
function generateLevel403(maxAttempts = 1000) {
  console.log('  生成第403关：内外差...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    const targetRow = 2;

    // 行2设计：
    // cage1: [2,0][2,1][2,2] 3格水平（行2内）
    // cage2: [2,3][2,4] 2格水平（行2内）
    // cage3: [2,5][2,6] 2格水平（行2内）
    // cage4: [1,7][2,7] 2格垂直（内突1格：从行1伸进行2）
    // cage5: [2,8][3,8] 2格垂直（外突1格：从行2伸出到行3）
    // 行2: 3+2+2+1+1 = 9格 ✓
    //
    // 45法则：行2和 = cage1+cage2+cage3 + [2,7] + [2,8] = 45
    // cage4.sum = [1,7] + [2,7] → [2,7] = cage4.sum - [1,7]
    // cage5.sum = [2,8] + [3,8] → [2,8] = cage5.sum - [3,8]
    // 所以：cage1+cage2+cage3 + cage4.sum - [1,7] + cage5.sum - [3,8] = 45
    // [3,8] - [1,7] = cage1+cage2+cage3 + cage4.sum + cage5.sum - 45
    // 即：外突格 - 内突格 = 差值（可以算出差值）

    if (new Set([solution[2][0], solution[2][1], solution[2][2]]).size !== 3) continue;
    if (solution[2][3] === solution[2][4]) continue;
    if (solution[2][5] === solution[2][6]) continue;
    if (solution[1][7] === solution[2][7]) continue;
    if (solution[2][8] === solution[3][8]) continue;

    const fixedCages = [
      { id: 1, sum: solution[2][0] + solution[2][1] + solution[2][2],
        cells: [[2, 0], [2, 1], [2, 2]] },
      { id: 2, sum: solution[2][3] + solution[2][4], cells: [[2, 3], [2, 4]] },
      { id: 3, sum: solution[2][5] + solution[2][6], cells: [[2, 5], [2, 6]] },
      { id: 4, sum: solution[1][7] + solution[2][7], cells: [[1, 7], [2, 7]] },
      { id: 5, sum: solution[2][8] + solution[3][8], cells: [[2, 8], [3, 8]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    // 验证行2有内外差（不是单格可解，但有差）
    const rowCells = getRegionCells('row', targetRow);
    let insideCount = 0;
    let outsideCount = 0;
    for (const cage of cages) {
      let inR = 0, outR = 0;
      for (const [r, c] of cage.cells) {
        if (rowCells.has(`${r},${c}`)) inR++;
        else outR++;
      }
      if (inR > 0 && outR > 0) {
        insideCount += inR;
        outsideCount += outR;
      }
    }
    // 应该有2个跨笼格在内，2个在外
    if (insideCount < 2 || outsideCount < 2) continue;

    const rating = rateDifficulty(cages);
    if (rating.score > 58) continue;

    console.log(`  ✓ 第403关生成成功（尝试${attempt + 1}次）`);
    console.log(`    行${targetRow}：跨笼内格${insideCount}个，跨笼外格${outsideCount}个（有内外差）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(403, '403 内外差', '简单', cages, check.solution);
  }

  throw new Error('第403关生成失败');
}

// 404：组合计算器 - 有多个2格或3格笼需要查组合
function generateLevel404(maxAttempts = 1000) {
  console.log('  生成第404关：组合计算器...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    // 放置几个特定组合数的笼子在显眼位置
    // 2格笼唯一组合：sum=3(1+2), sum=4(1+3), sum=17(8+9), sum=16(7+9)
    // 2格笼双组合：sum=5(1+4,2+3), sum=6(1+5,2+4), sum=15(6+9,7+8)
    // 3格笼唯一组合：sum=6(1+2+3), sum=24(7+8+9)
    
    // 确保左上角有低组合数的2格笼作为教学示例
    const cageA_sum = solution[0][0] + solution[0][1];
    const cageA_combos = countCombinations(2, cageA_sum);
    if (cageA_combos > 3) continue;
    if (solution[0][0] === solution[0][1]) continue;

    const cageB_sum = solution[0][2] + solution[1][2];
    const cageB_combos = countCombinations(2, cageB_sum);
    if (cageB_combos > 3) continue;
    if (solution[0][2] === solution[1][2]) continue;

    const fixedCages = [
      { id: 1, sum: cageA_sum, cells: [[0, 0], [0, 1]] },
      { id: 2, sum: cageB_sum, cells: [[0, 2], [1, 2]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    // 统计2格笼和低组合笼数量
    let twoCellCages = 0;
    let lowComboCages = 0;
    for (const cage of cages) {
      if (cage.cells.length === 2) twoCellCages++;
      const combos = countCombinations(cage.cells.length, cage.sum);
      if (combos <= 3) lowComboCages++;
    }

    if (twoCellCages < 15 || lowComboCages < 8) continue;

    const rating = rateDifficulty(cages);
    if (rating.score > 58) continue;

    console.log(`  ✓ 第404关生成成功（尝试${attempt + 1}次）`);
    console.log(`    2格笼：${twoCellCages}个，少组合(≤3)笼：${lowComboCages}个`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(404, '404 组合计算器', '简单', cages, check.solution);
  }

  throw new Error('第404关生成失败');
}

// 405：多区域45 - 两行/两列联合的45法则
function generateLevel405(maxAttempts = 1000) {
  console.log('  生成第405关：多区域45...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    // 两行联合：行0+行1，和为90
    // 设计：大部分笼子在两行内，只有1格伸出到行2
    // 这样可以算出那个外突格的值
    //
    // 行0: [0,0][0,1], [0,2][0,3], [0,4][0,5], [0,6][0,7][0,8] → 2+2+2+3=9
    // 行1: [1,0][1,1], [1,2][1,3], [1,4][1,5], [1,6][1,7], [1,8][2,8] → 2+2+2+2+1(跨)=9
    // 两行共18格，其中1格伸出到行2

    if (solution[0][0] === solution[0][1]) continue;
    if (solution[0][2] === solution[0][3]) continue;
    if (solution[0][4] === solution[0][5]) continue;
    if (new Set([solution[0][6], solution[0][7], solution[0][8]]).size !== 3) continue;
    if (solution[1][0] === solution[1][1]) continue;
    if (solution[1][2] === solution[1][3]) continue;
    if (solution[1][4] === solution[1][5]) continue;
    if (solution[1][6] === solution[1][7]) continue;
    if (solution[1][8] === solution[2][8]) continue;

    const fixedCages = [
      { id: 1, sum: solution[0][0] + solution[0][1], cells: [[0, 0], [0, 1]] },
      { id: 2, sum: solution[0][2] + solution[0][3], cells: [[0, 2], [0, 3]] },
      { id: 3, sum: solution[0][4] + solution[0][5], cells: [[0, 4], [0, 5]] },
      { id: 4, sum: solution[0][6] + solution[0][7] + solution[0][8],
        cells: [[0, 6], [0, 7], [0, 8]] },
      { id: 5, sum: solution[1][0] + solution[1][1], cells: [[1, 0], [1, 1]] },
      { id: 6, sum: solution[1][2] + solution[1][3], cells: [[1, 2], [1, 3]] },
      { id: 7, sum: solution[1][4] + solution[1][5], cells: [[1, 4], [1, 5]] },
      { id: 8, sum: solution[1][6] + solution[1][7], cells: [[1, 6], [1, 7]] },
      { id: 9, sum: solution[1][8] + solution[2][8], cells: [[1, 8], [2, 8]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    // 验证两行联合45法则
    const twoRowCells = new Set();
    for (let r = 0; r <= 1; r++)
      for (let c = 0; c < SIZE; c++)
        twoRowCells.add(`${r},${c}`);

    let fullyInsideSum = 0;
    let totalCrossingSum = 0;
    const outsideCells = [];
    
    for (const cage of cages) {
      let inside = 0, outside = 0;
      for (const [r, c] of cage.cells) {
        if (twoRowCells.has(`${r},${c}`)) inside++;
        else outside++;
      }
      if (outside === 0 && inside > 0) {
        fullyInsideSum += cage.sum;
      } else if (inside > 0 && outside > 0) {
        totalCrossingSum += cage.sum;
        for (const [r, c] of cage.cells) {
          if (!twoRowCells.has(`${r},${c}`)) outsideCells.push([r, c]);
        }
      }
    }

    if (outsideCells.length !== 1) continue;
    
    const outieValue = fullyInsideSum + totalCrossingSum - 90;
    const [or, oc] = outsideCells[0];
    if (outieValue !== solution[or][oc]) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 52 || rating.score > 65) continue;

    console.log(`  ✓ 第405关生成成功（尝试${attempt + 1}次）`);
    console.log(`    两行联合45可算出：(${or},${oc}) = ${outieValue}`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(405, '405 多区域45', '中等', cages, check.solution);
  }

  throw new Error('第405关生成失败');
}

// 406：组合+45 - 45法则算出和值后再用组合确定数字
function generateLevel406(maxAttempts = 1000) {
  console.log('  生成第406关：组合+45...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    // 设计：宫0用45法则可以算出一个2格组合的和
    // 然后玩家查组合表得到可能的数字
    //
    // 宫0（左上3x3）设计：
    // cage1: [0,0][1,0][2,0] 3格垂直（宫0内）
    // cage2: [0,1][1,1] 2格垂直（宫0内）
    // cage3: [0,2][1,2] 2格垂直（宫0内）
    // cage4: [2,1][2,2] 2格水平（宫0内）
    // cage5: [2,0]不对... 
    // 重新算：3+2+2+2 = 9格 ✓ 等等 [2,0] 还没分配
    // cage1: [0,0][1,0][2,0] (3格，包含[2,0])
    // cage2: [0,1][1,1] (2格)
    // cage3: [0,2][1,2] (2格)
    // cage4: [2,1][2,2] (2格)
    // 3+2+2+2 = 9... 不对，应该是 3+2+2+2 = 9？ 3+2+2+2=9 ✓
    // 但这样所有笼子都在宫内，不需要45法则

    // 需要一个跨宫的笼子来制造45法则场景
    // 宫0（9格）：
    // cage1: [0,0][0,1] 2格水平（宫0内）
    // cage2: [1,0][2,0] 2格垂直（宫0内）
    // cage3: [0,2][1,2][2,2] 3格垂直（宫0内）
    // cage4: [1,1][2,1] 2格垂直（宫0内）
    // 2+2+3+2 = 9 ✓ 还是都在宫内

    // 跨宫设计：
    // cage1: [0,0][0,1] 2格（宫0内）
    // cage2: [1,0][2,0] 2格（宫0内）
    // cage3: [0,2][1,2] 2格（宫0内）
    // cage4: [2,1][2,2] 2格（宫0内）
    // cage5: [1,1][1,3] 不对，不连通
    // cage5: [1,1][0,1] 不对，[0,1]已用
    // 
    // 换一种：让cage跨到宫3（下方）
    // cage1: [0,0][0,1][0,2] 3格水平（宫0内，第一行）
    // cage2: [1,0][2,0] 2格垂直（宫0内）
    // cage3: [1,1][1,2] 2格水平（宫0内）
    // cage4: [2,1][2,2] 2格水平（宫0内）
    // 3+2+2+2 = 9 ✓ 还是都在宫内

    // 真的需要跨宫：
    // cage1: [0,0][0,1] 2格（宫0内）
    // cage2: [0,2][1,2] 2格（宫0内，垂直）
    // cage3: [1,0][2,0] 2格（宫0内，垂直）
    // cage4: [2,1][2,2] 2格（宫0内，水平）
    // cage5: [1,1][1,3] → 不连通
    // [1,1] 在宫0，[1,3] 在宫1，中间隔了[1,2]
    // 不行，笼子必须连通
    // cage5: [1,1][2,1] → 但 [2,1] 已在 cage4 里了
    // cage5: [1,1][0,1] → [0,1] 在 cage1 里了

    // 让我们重新设计宫0：
    // cage1: [0,0][0,1] 2格水平（宫0内）
    // cage2: [1,0][2,0] 2格垂直（宫0内）
    // cage3: [0,2][1,2][2,2] 3格垂直（宫0内）
    // cage跨: [1,1][2,1][3,1] 3格垂直（宫0有2格：[1,1][2,1]，宫3有1格：[3,1]）
    // 宫0内：2+2+3+2 = 9格 ✓
    // 跨笼有2格在宫0内，1格在宫3
    //
    // 45法则：宫0和 = 45
    // = cage1 + cage2 + cage3 + 跨笼的2格
    // 跨笼的2格之和 = 45 - (cage1+cage2+cage3)
    // 跨笼的第3格 = cage跨.sum - 跨笼的2格之和
    // 这样可以算出单个值，但不是组合应用

    // 要体现"组合+45"，我们需要一个场景：
    // 45法则算出某2格的和 → 然后查这2格的组合
    // 
    // 最直接的做法：
    // - 某行/列/宫用45法则算出1个值
    // - 这个值所在的笼子是3格笼，算出后剩下2格的和也知道了
    // - 然后查2格组合
    //
    // 或者更直接：
    // - 一个3格笼，其中2格在某宫内，1格在宫外
    // - 用45法则算出宫内2格的和
    // - 这2格的和 → 查2格组合

    // 就用上面的设计，宫0的跨笼2格和可以用45法则算出
    // 玩家需要先算这个和，然后查2格组合

    if (solution[0][0] === solution[0][1]) continue; // cage1
    if (solution[1][0] === solution[2][0]) continue; // cage2
    if (new Set([solution[0][2], solution[1][2], solution[2][2]]).size !== 3) continue; // cage3
    if (new Set([solution[1][1], solution[2][1], solution[3][1]]).size !== 3) continue; // cage跨

    const fixedCages = [
      { id: 1, sum: solution[0][0] + solution[0][1], cells: [[0, 0], [0, 1]] },
      { id: 2, sum: solution[1][0] + solution[2][0], cells: [[1, 0], [2, 0]] },
      { id: 3, sum: solution[0][2] + solution[1][2] + solution[2][2],
        cells: [[0, 2], [1, 2], [2, 2]] },
      { id: 4, sum: solution[1][1] + solution[2][1] + solution[3][1],
        cells: [[1, 1], [2, 1], [3, 1]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    // 验证宫0的45法则：能算出跨笼的2格在宫内的和
    const box0Cells = getRegionCells('box', 0);
    let fullyInsideSum = 0;
    let crossCageInsideCells = [];
    let crossCage = null;
    
    for (const cage of cages) {
      let inside = 0, outside = 0;
      const inCells = [];
      for (const [r, c] of cage.cells) {
        if (box0Cells.has(`${r},${c}`)) { inside++; inCells.push([r, c]); }
        else outside++;
      }
      if (outside === 0 && inside > 0) {
        fullyInsideSum += cage.sum;
      } else if (inside === 2 && outside === 1) {
        crossCage = cage;
        crossCageInsideCells = inCells;
      }
    }

    if (!crossCage || crossCageInsideCells.length !== 2) continue;
    
    const twoCellSum = 45 - fullyInsideSum;
    const actualSum = crossCageInsideCells.reduce((s, [r, c]) => s + solution[r][c], 0);
    if (twoCellSum !== actualSum) continue;

    // 检查这个2格和的组合数（应该有几种组合需要查）
    const combos = countCombinations(2, twoCellSum);
    if (combos < 2 || combos > 6) continue; // 2-6种组合，需要查组合表

    const rating = rateDifficulty(cages);
    if (rating.score < 52 || rating.score > 65) continue;

    console.log(`  ✓ 第406关生成成功（尝试${attempt + 1}次）`);
    console.log(`    宫0 45法则算出2格和=${twoCellSum}，组合数=${combos}`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(406, '406 组合+45', '中等', cages, check.solution);
  }

  throw new Error('第406关生成失败');
}

// 407：章节测试 - 中等难度综合题
function generateLevel407(maxAttempts = 500) {
  console.log('  生成第407关：章节测试...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();

    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;

    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 55 || rating.score > 68) continue;

    // 确保有45法则场景
    if (!hasAny45RuleSingle(cages)) continue;

    console.log(`  ✓ 第407关生成成功（尝试${attempt + 1}次）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(407, '407 章节测试', '中等', cages, check.solution);
  }

  throw new Error('第407关生成失败');
}

// ==========================================
// 第五章：候选迷宫 关卡生成
// ==========================================

function generateLevel501(maxAttempts = 800) {
  console.log('  生成第501关：候选数系统...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 60 || rating.score > 72) continue;

    console.log(`  ✓ 第501关生成成功（尝试${attempt + 1}次）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(501, '501 候选数系统', '中等', cages, check.solution);
  }

  throw new Error('第501关生成失败');
}

function generateLevel502(maxAttempts = 800) {
  console.log('  生成第502关：数对法...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 62 || rating.score > 75) continue;

    // 2格笼占比高（更容易形成数对）
    const twoCellRatio = cages.filter(c => c.cells.length === 2).length / cages.length;
    if (twoCellRatio < 0.5) continue;

    console.log(`  ✓ 第502关生成成功（尝试${attempt + 1}次）`);
    console.log(`    2格笼占比：${(twoCellRatio * 100).toFixed(0)}%，难度评分：${rating.score}`);
    return createLevel(502, '502 数对法', '中等', cages, check.solution);
  }

  throw new Error('第502关生成失败');
}

function generateLevel503(maxAttempts = 800) {
  console.log('  生成第503关：区块排除...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 62 || rating.score > 75) continue;

    console.log(`  ✓ 第503关生成成功（尝试${attempt + 1}次）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(503, '503 区块排除', '中等', cages, check.solution);
  }

  throw new Error('第503关生成失败');
}

function generateLevel504(maxAttempts = 800) {
  console.log('  生成第504关：隐单寻踪...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 65 || rating.score > 78) continue;

    console.log(`  ✓ 第504关生成成功（尝试${attempt + 1}次）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(504, '504 隐单寻踪', '中等', cages, check.solution);
  }

  throw new Error('第504关生成失败');
}

function generateLevel505(maxAttempts = 600) {
  console.log('  生成第505关：三链数...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 4);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 70 || rating.score > 82) continue;

    // 3格笼较多
    const threeCellCount = cages.filter(c => c.cells.length === 3).length;
    if (threeCellCount < 5) continue;

    console.log(`  ✓ 第505关生成成功（尝试${attempt + 1}次）`);
    console.log(`    3格笼：${threeCellCount}个，难度评分：${rating.score}`);
    return createLevel(505, '505 三链数', '中等偏难', cages, check.solution);
  }

  throw new Error('第505关生成失败');
}

function generateLevel506(maxAttempts = 600) {
  console.log('  生成第506关：组合+候选...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 4);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 72 || rating.score > 85) continue;

    // 有适量的中等组合数笼子
    let mediumComboCages = 0;
    for (const cage of cages) {
      const combos = countCombinations(cage.cells.length, cage.sum);
      if (combos >= 3 && combos <= 6) mediumComboCages++;
    }
    if (mediumComboCages < 8) continue;

    console.log(`  ✓ 第506关生成成功（尝试${attempt + 1}次）`);
    console.log(`    中等组合笼：${mediumComboCages}个，难度评分：${rating.score}`);
    return createLevel(506, '506 组合+候选', '中等偏难', cages, check.solution);
  }

  throw new Error('第506关生成失败');
}

function generateLevel507(maxAttempts = 500) {
  console.log('  生成第507关：章节测试...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 4);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 75 || rating.score > 88) continue;

    console.log(`  ✓ 第507关生成成功（尝试${attempt + 1}次）`);
    console.log(`    笼子数：${cages.length}，难度评分：${rating.score}`);
    return createLevel(507, '507 章节测试', '中等偏难', cages, check.solution);
  }

  throw new Error('第507关生成失败');
}

// ==========================================
// 第六章：最终档案 关卡生成
// ==========================================

function generateLevel601(maxAttempts = 600) {
  console.log('  生成第601关：综合热身一...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 60 || rating.score > 72) continue;

    console.log(`  ✓ 第601关生成成功（尝试${attempt + 1}次）`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(601, '601 综合热身一', '中等', cages, check.solution);
  }

  throw new Error('第601关生成失败');
}

function generateLevel602(maxAttempts = 600) {
  console.log('  生成第602关：综合热身二...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 65 || rating.score > 77) continue;

    console.log(`  ✓ 第602关生成成功（尝试${attempt + 1}次）`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(602, '602 综合热身二', '中等', cages, check.solution);
  }

  throw new Error('第602关生成失败');
}

function generateLevel603(maxAttempts = 500) {
  console.log('  生成第603关：进阶挑战...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 4);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 72 || rating.score > 85) continue;

    // 有45法则场景
    if (!hasAny45RuleSingle(cages)) continue;

    console.log(`  ✓ 第603关生成成功（尝试${attempt + 1}次）`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(603, '603 进阶挑战', '中等偏难', cages, check.solution);
  }

  throw new Error('第603关生成失败');
}

function generateLevel604(maxAttempts = 1000) {
  console.log('  生成第604关：高手挑战...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 82 || rating.score > 92) continue;

    console.log(`  ✓ 第604关生成成功（尝试${attempt + 1}次）`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(604, '604 高手挑战', '困难', cages, check.solution);
  }

  throw new Error('第604关生成失败');
}

function generateLevel605(maxAttempts = 1200) {
  console.log('  生成第605关：准大师...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 88 || rating.score > 96) continue;

    console.log(`  ✓ 第605关生成成功（尝试${attempt + 1}次）`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(605, '605 准大师', '困难', cages, check.solution);
  }

  throw new Error('第605关生成失败');
}

function generateLevel606(maxAttempts = 1500) {
  console.log('  生成第606关：毕业挑战...');

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], 2, 3);
    if (!cages) continue;
    if (!validateCages(cages, solution)) continue;

    const check = checkUniqueAndGetSolution(cages);
    if (!check.unique) continue;

    const rating = rateDifficulty(cages);
    if (rating.score < 93) continue;

    console.log(`  ✓ 第606关生成成功（尝试${attempt + 1}次）`);
    console.log(`    难度评分：${rating.score}`);
    return createLevel(606, '606 毕业挑战', '困难', cages, check.solution);
  }

  throw new Error('第606关生成失败');
}

// ==========================================
// 主生成流程
// ==========================================

function generateAllLevels() {
  console.log('==========================================');
  console.log('  生成第四、五、六章教学关卡（9x9）');
  console.log('==========================================\n');

  const levels = [];

  console.log('--- 第四章：45号机关 ---');
  levels.push(generateLevel401());
  levels.push(generateLevel402());
  levels.push(generateLevel403());
  levels.push(generateLevel404());
  levels.push(generateLevel405());
  levels.push(generateLevel406());
  levels.push(generateLevel407());
  console.log('');

  console.log('--- 第五章：候选迷宫 ---');
  levels.push(generateLevel501());
  levels.push(generateLevel502());
  levels.push(generateLevel503());
  levels.push(generateLevel504());
  levels.push(generateLevel505());
  levels.push(generateLevel506());
  levels.push(generateLevel507());
  console.log('');

  console.log('--- 第六章：最终档案 ---');
  levels.push(generateLevel601());
  levels.push(generateLevel602());
  levels.push(generateLevel603());
  levels.push(generateLevel604());
  levels.push(generateLevel605());
  levels.push(generateLevel606());
  console.log('');

  return levels;
}

// ==========================================
// 最终验证
// ==========================================

function verifyAllLevels(levels) {
  console.log('==========================================');
  console.log('  最终验证');
  console.log('==========================================\n');

  let allPass = true;
  for (const level of levels) {
    const check = checkUniqueAndGetSolution(level.cages);
    const cagesValid = validateCages(level.cages, level.solution);

    // 检查solution是否与笼子约束一致
    let solutionValid = true;
    for (const cage of level.cages) {
      const sum = cage.cells.reduce((s, [r, c]) => s + level.solution[r][c], 0);
      if (sum !== cage.sum) { solutionValid = false; break; }
      const nums = new Set(cage.cells.map(([r, c]) => level.solution[r][c]));
      if (nums.size !== cage.cells.length) { solutionValid = false; break; }
    }

    // 检查solution是否是有效数独
    let sudokuValid = true;
    for (let i = 0; i < SIZE; i++) {
      const rowNums = new Set();
      const colNums = new Set();
      for (let j = 0; j < SIZE; j++) {
        if (rowNums.has(level.solution[i][j])) { sudokuValid = false; break; }
        rowNums.add(level.solution[i][j]);
        if (colNums.has(level.solution[j][i])) { sudokuValid = false; break; }
        colNums.add(level.solution[j][i]);
      }
      if (!sudokuValid) break;
    }

    const pass = check.unique && cagesValid && solutionValid && sudokuValid;
    const status = pass ? 'PASS' : 'FAIL';
    if (!pass) allPass = false;

    console.log(`  ${level.id} ${level.name}: ${status}`);
    console.log(`    唯一解=${check.unique}, 笼子合法=${cagesValid}, 解答有效=${solutionValid}, 数独有效=${sudokuValid}`);
  }

  console.log(`\n总结果: ${allPass ? '全部通过 ✓' : '有失败项 ✗'}`);
  return allPass;
}

// ==========================================
// 主入口
// ==========================================

function main() {
  const startTime = Date.now();

  const levels = generateAllLevels();

  console.log('');
  const allPass = verifyAllLevels(levels);

  // 输出到文件
  const outputPath = path.join(__dirname, '..', 'game-src', 'data', 'teaching-levels-ch4-6.json');
  fs.writeFileSync(outputPath, JSON.stringify(levels, null, 2), 'utf-8');
  console.log(`\n关卡数据已保存到: ${outputPath}`);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`总耗时: ${elapsed}s`);

  if (!allPass) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  generateLevel401, generateLevel402, generateLevel403, generateLevel404,
  generateLevel405, generateLevel406, generateLevel407,
  generateLevel501, generateLevel502, generateLevel503, generateLevel504,
  generateLevel505, generateLevel506, generateLevel507,
  generateLevel601, generateLevel602, generateLevel603,
  generateLevel604, generateLevel605, generateLevel606,
  generateAllLevels, verifyAllLevels,
  analyze45Rule, hasAny45RuleSingle, countCombinations
};
