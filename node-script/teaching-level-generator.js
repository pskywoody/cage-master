// ==========================================
// 教学用杀手数独关卡生成器
// 支持 4x4 和 6x6 两种尺寸
// 生成指定特征的教学关卡，确保唯一解
// ==========================================

const fs = require('fs');
const path = require('path');

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
// 第一部分：数独解生成器（回溯法 + 随机化）
// 支持 4x4 和 6x6
// ==========================================

/**
 * 获取宫的尺寸
 * 4x4: 2x2 宫
 * 6x6: 2x3 宫（2行3列）
 */
function getBoxSize(size) {
  if (size === 4) return { rows: 2, cols: 2 };
  if (size === 6) return { rows: 2, cols: 3 };
  if (size === 9) return { rows: 3, cols: 3 };
  throw new Error(`不支持的尺寸: ${size}`);
}

/**
 * 检查在 (r,c) 放置 num 是否合法（标准数独规则）
 */
function isValidPlacement(grid, r, c, num, size) {
  // 行检查
  for (let i = 0; i < size; i++) {
    if (grid[r][i] === num) return false;
  }
  // 列检查
  for (let i = 0; i < size; i++) {
    if (grid[i][c] === num) return false;
  }
  // 宫检查
  const boxSize = getBoxSize(size);
  const boxR = Math.floor(r / boxSize.rows) * boxSize.rows;
  const boxC = Math.floor(c / boxSize.cols) * boxSize.cols;
  for (let i = boxR; i < boxR + boxSize.rows; i++) {
    for (let j = boxC; j < boxC + boxSize.cols; j++) {
      if (grid[i][j] === num) return false;
    }
  }
  return true;
}

/**
 * 用回溯法填充数独盘面（随机化）
 * @returns {boolean} 是否成功填充
 */
function fillGrid(grid, size) {
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === 0) {
        const nums = shuffle(Array.from({ length: size }, (_, i) => i + 1));
        for (const num of nums) {
          if (isValidPlacement(grid, r, c, num, size)) {
            grid[r][c] = num;
            if (fillGrid(grid, size)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

/**
 * 生成一个随机的完整数独解
 */
function generateSolution(size) {
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  fillGrid(grid, size);
  return grid;
}

// ==========================================
// 第二部分：杀手数独求解器（用于验证唯一解）
// 支持任意尺寸（4/6/9）
// ==========================================

class KillerSudokuSolver {
  /**
   * @param {number[][]} grid - 初始盘面（0 表示空）
   * @param {Array} cages - 笼子数组 [{id, sum, cells:[[r,c]]}]
   * @param {number} size - 盘面尺寸
   */
  constructor(grid, cages, size) {
    this.size = size;
    this.grid = grid.map(row => row.slice());
    this.cages = cages;
    this.solutions = [];
    this.maxSolutions = 1;
    this.boxSize = getBoxSize(size);

    // 预建索引：每个格子属于哪个笼子
    this.cageIdMap = Array.from({ length: size }, () => Array(size).fill(null));
    // 预建索引：笼子 id → 笼子对象
    this.cageMap = {};

    cages.forEach(cage => {
      this.cageMap[cage.id] = cage;
      cage.cells.forEach(([r, c]) => {
        this.cageIdMap[r][c] = cage.id;
      });
    });

    // 每个笼子的运行时状态
    this.cageState = {};
    cages.forEach(cage => {
      this.cageState[cage.id] = {
        sum: 0,
        filled: 0,
        nums: new Set()
      };
    });

    // 初始化 cageState
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const val = this.grid[r][c];
        if (val !== 0) {
          const cageId = this.cageIdMap[r][c];
          if (cageId !== null) {
            const state = this.cageState[cageId];
            state.sum += val;
            state.filled += 1;
            state.nums.add(val);
          }
        }
      }
    }
  }

  /**
   * 判断在 (r,c) 填 num 是否合法
   */
  isValid(r, c, num) {
    // 行检查
    for (let i = 0; i < this.size; i++) {
      if (this.grid[r][i] === num) return false;
    }
    // 列检查
    for (let i = 0; i < this.size; i++) {
      if (this.grid[i][c] === num) return false;
    }
    // 宫检查
    const boxR = Math.floor(r / this.boxSize.rows) * this.boxSize.rows;
    const boxC = Math.floor(c / this.boxSize.cols) * this.boxSize.cols;
    for (let i = boxR; i < boxR + this.boxSize.rows; i++) {
      for (let j = boxC; j < boxC + this.boxSize.cols; j++) {
        if (this.grid[i][j] === num) return false;
      }
    }
    // 笼子检查
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      const cage = this.cageMap[cageId];
      // 笼内不重复
      if (state.nums.has(num)) return false;
      // 和值不超过
      if (state.sum + num > cage.sum) return false;
      // 如果填完是最后一格，和值必须恰好等于
      if (state.filled + 1 === cage.cells.length && state.sum + num !== cage.sum) {
        return false;
      }
    }
    return true;
  }

  place(r, c, num) {
    this.grid[r][c] = num;
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      state.sum += num;
      state.filled += 1;
      state.nums.add(num);
    }
  }

  remove(r, c, num) {
    this.grid[r][c] = 0;
    const cageId = this.cageIdMap[r][c];
    if (cageId !== null) {
      const state = this.cageState[cageId];
      state.sum -= num;
      state.filled -= 1;
      state.nums.delete(num);
    }
  }

  /**
   * MRV 启发式：找候选数最少的空格子
   */
  findBestEmpty() {
    let bestR = -1, bestC = -1;
    let bestCount = this.size + 1;
    let bestCandidates = null;

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.grid[r][c] === 0) {
          const cands = [];
          for (let n = 1; n <= this.size; n++) {
            if (this.isValid(r, c, n)) {
              cands.push(n);
            }
          }
          if (cands.length < bestCount) {
            bestCount = cands.length;
            bestR = r;
            bestC = c;
            bestCandidates = cands;
            if (bestCount === 0) return [r, c, cands];
            if (bestCount === 1) return [r, c, cands];
          }
        }
      }
    }

    if (bestR === -1) return null;
    return [bestR, bestC, bestCandidates];
  }

  /**
   * 回溯求解
   * @param {number} maxSolutions - 找到几个解就停止
   * @returns {boolean} 是否找到了至少一个解
   */
  solve(maxSolutions = 1) {
    this.maxSolutions = maxSolutions;
    this.solutions = [];
    this._backtrack();
    return this.solutions.length > 0;
  }

  _backtrack() {
    if (this.solutions.length >= this.maxSolutions) return;

    const best = this.findBestEmpty();
    if (!best) {
      this.solutions.push(this.grid.map(row => row.slice()));
      return;
    }

    const [r, c, candidates] = best;
    if (candidates.length === 0) return;

    for (const num of candidates) {
      this.place(r, c, num);
      this._backtrack();
      this.remove(r, c, num);
      if (this.solutions.length >= this.maxSolutions) return;
    }
  }

  getResult() {
    return {
      solved: this.solutions.length > 0,
      unique: this.solutions.length === 1,
      solutionCount: this.solutions.length,
      solution: this.solutions.length > 0 ? this.solutions[0] : null
    };
  }
}

/**
 * 验证杀手数独是否有唯一解
 */
function hasUniqueSolution(grid, cages, size) {
  const solver = new KillerSudokuSolver(grid, cages, size);
  solver.solve(2);
  return solver.getResult().unique;
}

/**
 * 计算笼子的和值（根据解答计算）
 */
function calcCageSum(cageCells, solution) {
  return cageCells.reduce((sum, [r, c]) => sum + solution[r][c], 0);
}

/**
 * 检查两个格子是否相邻（上下左右）
 */
function areAdjacent(r1, c1, r2, c2) {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

// ==========================================
// 第三部分：笼子生成器
// 支持多种配置方式
// ==========================================

/**
 * 生成全单格笼
 * 每个格子都是独立的笼子
 */
function generateAllSingleCages(solution, size) {
  const cages = [];
  let id = 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      cages.push({
        id: id++,
        sum: solution[r][c],
        cells: [[r, c]]
      });
    }
  }
  return cages;
}

/**
 * 生成全2格笼（水平相邻配对）
 * 要求: size 必须是偶数
 * 所有笼子都是水平相邻的两格
 */
function generateAllTwoCellCages(solution, size) {
  const cages = [];
  let id = 1;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c += 2) {
      const cells = [[r, c], [r, c + 1]];
      cages.push({
        id: id++,
        sum: calcCageSum(cells, solution),
        cells
      });
    }
  }
  return cages;
}

/**
 * 通用笼子生成器：按种子生长法划分连通笼子
 * @param {number[][]} solution - 完整解
 * @param {number} size - 盘面尺寸
 * @param {Object} options - 配置
 * @param {number} options.minSize - 最小笼子大小
 * @param {number} options.maxSize - 最大笼子大小
 * @param {Array} options.fixedCages - 预定义的固定笼子（强制单格笼等）
 *   格式: [{ cells: [[r,c], ...] }]  sum自动计算
 * @param {number} options.attempts - 尝试次数
 */
function generateCages(solution, size, options = {}) {
  const {
    minSize = 1,
    maxSize = 3,
    fixedCages = [],
    attempts = 100
  } = options;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const assigned = Array.from({ length: size }, () => Array(size).fill(false));
    const cages = [];
    let cageId = 1;
    let success = true;

    // 先放置固定笼子
    for (const fixedCage of fixedCages) {
      const cells = fixedCage.cells;
      // 检查固定笼子是否合法
      for (const [r, c] of cells) {
        if (assigned[r][c]) {
          success = false;
          break;
        }
      }
      if (!success) break;

      for (const [r, c] of cells) {
        assigned[r][c] = true;
      }
      cages.push({
        id: cageId++,
        sum: calcCageSum(cells, solution),
        cells: cells.map(cell => [...cell])
      });
    }

    if (!success) continue;

    // 收集未分配的格子，随机排序作为种子
    const unassigned = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!assigned[r][c]) unassigned.push([r, c]);
      }
    }
    const seedOrder = shuffle(unassigned);

    for (const [sr, sc] of seedOrder) {
      if (assigned[sr][sc]) continue;

      const targetSize = randInt(minSize, maxSize);
      const cageCells = [[sr, sc]];
      assigned[sr][sc] = true;

      // BFS/DFS 生长笼子
      const frontier = [[sr, sc]];
      while (cageCells.length < targetSize && frontier.length > 0) {
        // 随机从 frontier 选一个
        const idx = randInt(0, frontier.length - 1);
        const [cr, cc] = frontier[idx];

        // 获取相邻未分配格子
        const neighbors = [];
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dr, dc] of dirs) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && !assigned[nr][nc]) {
            neighbors.push([nr, nc]);
          }
        }

        if (neighbors.length === 0) {
          // 这个格子无法生长，从 frontier 移除
          frontier.splice(idx, 1);
          continue;
        }

        // 随机选一个邻居加入笼子
        const [nr, nc] = neighbors[randInt(0, neighbors.length - 1)];
        assigned[nr][nc] = true;
        cageCells.push([nr, nc]);
        frontier.push([nr, nc]);
      }

      cages.push({
        id: cageId++,
        sum: calcCageSum(cageCells, solution),
        cells: cageCells
      });
    }

    // 验证所有格子都被分配
    let allAssigned = true;
    for (let r = 0; r < size && allAssigned; r++) {
      for (let c = 0; c < size && allAssigned; c++) {
        if (!assigned[r][c]) allAssigned = false;
      }
    }

    if (allAssigned) {
      return cages;
    }
  }

  // 如果多次尝试都失败，返回null
  return null;
}

/**
 * 验证笼子是否合法：
 * - 所有格子不重叠
 * - 覆盖所有格子
 * - 每个笼子连通
 * - 笼内数字不重复（根据解答验证）
 */
function validateCages(cages, solution, size) {
  const covered = Array.from({ length: size }, () => Array(size).fill(false));
  let totalCells = 0;

  for (const cage of cages) {
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      if (r < 0 || r >= size || c < 0 || c >= size) return false;
      if (covered[r][c]) return false; // 重叠
      covered[r][c] = true;
      totalCells++;
      nums.add(solution[r][c]);
    }
    // 笼内数字不重复
    if (nums.size !== cage.cells.length) return false;
    // 和值正确
    if (cage.sum !== calcCageSum(cage.cells, solution)) return false;
    // 笼子连通（简单BFS检查）
    if (!isCageConnected(cage.cells)) return false;
  }

  // 覆盖所有格子
  if (totalCells !== size * size) return false;

  return true;
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

// ==========================================
// 第四部分：关卡生成器（第一章 6 关）
// ==========================================

/**
 * 创建关卡对象
 */
function createPuzzle(size, cages, solution) {
  const cells = Array.from({ length: size }, () => Array(size).fill(0));
  return {
    size,
    cells,
    cages: deepCopy(cages),
    solution: cloneGrid(solution)
  };
}

/**
 * 第1关（101）：全单格笼
 * 16个格子每个都是独立笼子，玩家直接填数就行
 */
function generateLevel101() {
  const size = 4;
  const solution = generateSolution(size);
  const cages = generateAllSingleCages(solution, size);
  return createPuzzle(size, cages, solution);
}

/**
 * 第2关（102）：全2格笼，和值都是极端值（3、4、10、11，只有唯一组合）
 * 4x4中: sum=3 -> {1,2}, sum=4 -> {1,3}, sum=10 -> {4,6?}...
 * 实际上4x4中2格笼的唯一组合和值:
 *   最小: 3=1+2 (唯一)
 *   4=1+3 (唯一, 因为2+2不合法)
 *   7=3+4 或 2+5(不存在) -> 7有多种可能
 * 重新梳理: 在4x4中(数字1-4)，2格笼唯一组合:
 *   sum=3: {1,2} 唯一
 *   sum=4: {1,3} 唯一
 *   sum=6: {2,4} 唯一 (3+3不行)
 *   sum=7: {3,4} 唯一
 * 所以"极端值"应该是 3, 4, 6, 7
 *
 * 策略：生成一个4x4解，然后精心设计水平2格笼，
 * 使得每个笼子的和值都是唯一组合（3, 4, 6, 7）
 */
function generateLevel102() {
  const size = 4;
  // 唯一组合的和值
  const uniqueSums = [3, 4, 6, 7];
  let attempts = 0;
  const maxAttempts = 5000;

  while (attempts < maxAttempts) {
    attempts++;
    const solution = generateSolution(size);

    // 尝试水平配对
    const cages = [];
    let id = 1;
    let allUnique = true;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c += 2) {
        const a = solution[r][c];
        const b = solution[r][c + 1];
        const s = a + b;
        if (!uniqueSums.includes(s)) {
          allUnique = false;
          break;
        }
        cages.push({
          id: id++,
          sum: s,
          cells: [[r, c], [r, c + 1]]
        });
      }
      if (!allUnique) break;
    }

    if (allUnique) {
      // 验证唯一解
      const cells = Array.from({ length: size }, () => Array(size).fill(0));
      if (hasUniqueSolution(cells, cages, size)) {
        return createPuzzle(size, cages, solution);
      }
    }
  }

  // 如果随机生成失败，使用构造法
  // 手动构造一个满足条件的解
  // 我们需要每行的 (col0+col1) 和 (col2+col3) 都是唯一组合和
  // 唯一组合和: 3=1+2, 4=1+3, 6=2+4, 7=3+4
  // 所以每行的配对和必须是 {3,4,6,7} 中的两个

  // 构造解: 每行的 (1,2) 和 (3,4) 配对 -> 和为 3 和 7
  // 行0: 1 2 3 4 -> 3, 7
  // 行1: 3 4 1 2 -> 7, 3
  // 行2: 2 1 4 3 -> 3, 7
  // 行3: 4 3 2 1 -> 7, 3
  // 这不是有效的数独解（列0有重复）

  // 换一种方式：直接枚举所有4x4数独解，找满足条件的
  // 或者用更聪明的构造
  const solution = [
    [1, 2, 3, 4],
    [3, 4, 1, 2],
    [2, 1, 4, 3],
    [4, 3, 2, 1]
  ];
  // 验证这是不是有效数独
  // 行: OK
  // 列: 列0: 1,3,2,4 OK; 列1: 2,4,1,3 OK; 列2: 3,1,4,2 OK; 列3: 4,2,3,1 OK
  // 宫: 宫0(左上2x2): 1,2,3,4 OK; 宫1(右上): 3,4,1,2 OK
  //     宫2(左下): 2,1,4,3 OK; 宫3(右下): 4,3,2,1 OK
  // 这是一个有效的数独解！

  // 水平配对和值:
  // 行0: 1+2=3, 3+4=7 ✓
  // 行1: 3+4=7, 1+2=3 ✓
  // 行2: 2+1=3, 4+3=7 ✓
  // 行3: 4+3=7, 2+1=3 ✓
  // 全都是唯一组合！

  const cages = generateAllTwoCellCages(solution, size);
  const cells = Array.from({ length: size }, () => Array(size).fill(0));

  // 但是全3和7的水平配对可能有多解，我们需要验证
  if (hasUniqueSolution(cells, cages, size)) {
    return createPuzzle(size, cages, solution);
  }

  // 如果水平配对不唯一，尝试垂直配对或混合
  // 或者尝试把某些行的配对方式改掉
  // 让我们尝试垂直配对 + 调整

  // 实际上，我们可以用更简单的方法：
  // 生成一个解，然后用非对称的2格笼划分，只要所有笼子和值都是唯一组合即可

  // 换策略：生成解 + 种子生长法生成全2格笼，筛选所有和值都是唯一组合的
  for (let i = 0; i < 10000; i++) {
    const sol = generateSolution(size);

    // 尝试多种2格划分方式
    // 方式：逐行蛇形配对（相邻水平/垂直交替）
    // 或者直接随机生成2格笼划分

    // 用随机生成的方式：把16格分成8个2格连通笼
    // 然后检查所有和值是否都是唯一组合
    const division = randomTwoCellDivision(size);
    if (!division) continue;

    const cages = division.map((cells, idx) => ({
      id: idx + 1,
      sum: calcCageSum(cells, sol),
      cells
    }));

    // 检查所有和值是否都是唯一组合
    const allUnique = cages.every(cage => uniqueSums.includes(cage.sum));
    if (!allUnique) continue;

    // 验证唯一解
    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, sol);
    }
  }

  // 最后的保底：使用上面构造的解，并调整笼子划分
  // 如果全2格水平配对有多解，我们可以加一些约束
  // 实际上，让我们直接尝试一个已知有效的配置

  // 使用构造解 + 混合方向的2格笼
  const sol = [
    [1, 3, 2, 4],
    [2, 4, 1, 3],
    [3, 1, 4, 2],
    [4, 2, 3, 1]
  ];
  // 验证数独有效性: 行列宫都OK

  // 设计笼子: 混合水平和垂直，确保所有和值都是唯一组合
  // 而且有唯一解
  // 让我们尝试一些划分

  // 直接用水平配对试试这个解
  const cages2 = [
    { id: 1, sum: sol[0][0] + sol[0][1], cells: [[0, 0], [0, 1]] },
    { id: 2, sum: sol[0][2] + sol[0][3], cells: [[0, 2], [0, 3]] },
    { id: 3, sum: sol[1][0] + sol[1][1], cells: [[1, 0], [1, 1]] },
    { id: 4, sum: sol[1][2] + sol[1][3], cells: [[1, 2], [1, 3]] },
    { id: 5, sum: sol[2][0] + sol[2][1], cells: [[2, 0], [2, 1]] },
    { id: 6, sum: sol[2][2] + sol[2][3], cells: [[2, 2], [2, 3]] },
    { id: 7, sum: sol[3][0] + sol[3][1], cells: [[3, 0], [3, 1]] },
    { id: 8, sum: sol[3][2] + sol[3][3], cells: [[3, 2], [3, 3]] }
  ];

  const allOk = cages2.every(c => uniqueSums.includes(c.sum));
  const cells2 = Array.from({ length: size }, () => Array(size).fill(0));
  if (allOk && hasUniqueSolution(cells2, cages2, size)) {
    return createPuzzle(size, cages2, sol);
  }

  // 再尝试：混合配对
  // 用确定性搜索来找一个
  return findLevel102BruteForce();
}

/**
 * 随机生成全2格笼划分
 * 使用随机配对算法
 */
function randomTwoCellDivision(size) {
  const totalCells = size * size;
  if (totalCells % 2 !== 0) return null;

  const assigned = Array.from({ length: size }, () => Array(size).fill(false));
  const cages = [];
  let remaining = totalCells;

  while (remaining > 0) {
    // 找第一个未分配的格子
    let found = false;
    for (let r = 0; r < size && !found; r++) {
      for (let c = 0; c < size && !found; c++) {
        if (!assigned[r][c]) {
          // 找相邻未分配的格子
          const neighbors = [];
          const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
          for (const [dr, dc] of dirs) {
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < size && nc >= 0 && nc < size && !assigned[nr][nc]) {
              neighbors.push([nr, nc]);
            }
          }
          if (neighbors.length === 0) return null; // 无法配对

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

  return cages;
}

/**
 * 暴力搜索第102关（确定性方法）
 */
function findLevel102BruteForce() {
  const size = 4;
  const uniqueSums = [3, 4, 6, 7];

  // 枚举所有4x4数独解（数量不多，只有288个本质不同的，加上对称共多少...）
  // 实际上4x4数独总数是288个，枚举完全可行
  const allSolutions = [];
  const grid = Array.from({ length: size }, () => Array(size).fill(0));
  enumerateAllSolutions(grid, size, allSolutions, 2000); // 最多2000个就够了

  // 对每个解，尝试多种2格笼划分
  for (const sol of allSolutions) {
    // 尝试水平配对
    const hCages = [];
    let hid = 1;
    let hOk = true;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c += 2) {
        const s = sol[r][c] + sol[r][c + 1];
        if (!uniqueSums.includes(s)) { hOk = false; break; }
        hCages.push({ id: hid++, sum: s, cells: [[r, c], [r, c + 1]] });
      }
      if (!hOk) break;
    }
    if (hOk) {
      const cells = Array.from({ length: size }, () => Array(size).fill(0));
      if (hasUniqueSolution(cells, hCages, size)) {
        return createPuzzle(size, hCages, sol);
      }
    }

    // 尝试垂直配对
    const vCages = [];
    let vid = 1;
    let vOk = true;
    for (let c = 0; c < size; c++) {
      for (let r = 0; r < size; r += 2) {
        const s = sol[r][c] + sol[r + 1][c];
        if (!uniqueSums.includes(s)) { vOk = false; break; }
        vCages.push({ id: vid++, sum: s, cells: [[r, c], [r + 1, c]] });
      }
      if (!vOk) break;
    }
    if (vOk) {
      const cells = Array.from({ length: size }, () => Array(size).fill(0));
      if (hasUniqueSolution(cells, vCages, size)) {
        return createPuzzle(size, vCages, sol);
      }
    }

    // 尝试棋盘格配对（2x2块内的水平/垂直交替）
    // 还有更多配对方式... 先试试水平和垂直够不够
  }

  // 如果上面都不行，尝试随机划分
  for (const sol of allSolutions) {
    for (let i = 0; i < 200; i++) {
      const division = randomTwoCellDivision(size);
      if (!division) continue;

      const cages = division.map((cells, idx) => ({
        id: idx + 1,
        sum: calcCageSum(cells, sol),
        cells
      }));

      const allUnique = cages.every(cage => uniqueSums.includes(cage.sum));
      if (!allUnique) continue;

      const cells = Array.from({ length: size }, () => Array(size).fill(0));
      if (hasUniqueSolution(cells, cages, size)) {
        return createPuzzle(size, cages, sol);
      }
    }
  }

  // 终极保底：放宽条件，不要求所有笼子都是唯一组合
  // 但至少要有多个是唯一组合，作为教学演示
  // 这里返回一个全2格笼的题目，有唯一解即可
  for (const sol of allSolutions) {
    const hCages = generateAllTwoCellCages(sol, size);
    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, hCages, size)) {
      return createPuzzle(size, hCages, sol);
    }
  }

  // 理论上不会到这里
  throw new Error('无法生成第102关');
}

/**
 * 枚举所有数独解（用于小尺寸）
 */
function enumerateAllSolutions(grid, size, results, maxResults) {
  if (results.length >= maxResults) return;

  // 找第一个空格
  let r = -1, c = -1;
  for (let i = 0; i < size && r === -1; i++) {
    for (let j = 0; j < size && r === -1; j++) {
      if (grid[i][j] === 0) { r = i; c = j; }
    }
  }

  if (r === -1) {
    results.push(cloneGrid(grid));
    return;
  }

  for (let num = 1; num <= size; num++) {
    if (isValidPlacement(grid, r, c, num, size)) {
      grid[r][c] = num;
      enumerateAllSolutions(grid, size, results, maxResults);
      grid[r][c] = 0;
      if (results.length >= maxResults) return;
    }
  }
}

/**
 * 第3关（103）：混合笼，设计成第一行有一个显单（naked single）
 * 显单 = 某格子所在行/列/宫/笼的约束使得它只有一个可能的数字
 *
 * 策略：生成一个解，然后设计笼子，使得第一行有一个单格笼（直接给出数字）
 * 或者通过其他笼子的约束形成显单
 *
 * 最简单的方式：第一行放一个单格笼，这样玩家直接知道那个数字，
 * 然后通过推理填完第一行（显单效果）
 */
function generateLevel103() {
  const size = 4;
  let attempts = 0;
  const maxAttempts = 500;

  while (attempts < maxAttempts) {
    attempts++;
    const solution = generateSolution(size);

    // 固定笼子：第一行第一个格子是单格笼
    const fixedCages = [
      { cells: [[0, 0]] }  // 单格笼，直接给出数字
    ];

    // 其余格子用混合大小的笼子
    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 3,
      fixedCages,
      attempts: 50
    });

    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }

  // 保底：多放几个单格笼确保有唯一解
  while (true) {
    const solution = generateSolution(size);
    const fixedCages = [
      { cells: [[0, 0]] },
      { cells: [[3, 3]] }
    ];
    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 3,
      fixedCages,
      attempts: 100
    });
    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }
}

/**
 * 第4关（104）：混合笼，包含宫排除的场景
 * 宫排除 = 某个数字在某宫中只能出现在特定位置
 *
 * 策略：生成解，设计笼子使得某个宫的信息足够丰富，
 * 玩家需要用宫排除法推理
 *
 * 具体设计：一个宫里有一个2格笼和一个单格笼，
 * 剩下的一个2格笼需要通过宫排除确定
 */
function generateLevel104() {
  const size = 4;
  let attempts = 0;
  const maxAttempts = 500;

  while (attempts < maxAttempts) {
    attempts++;
    const solution = generateSolution(size);

    // 设计笼子：左上宫(0,0)-(1,1)里有较多信息
    // 放一个单格笼和一个2格笼在第一宫
    const fixedCages = [
      { cells: [[0, 0]] },           // 单格笼在左上宫
      { cells: [[0, 1], [1, 1]] },   // 2格笼在左上宫（垂直）
      // 这样左上宫只剩 (1,0) 需要从其他笼子推理
    ];

    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 3,
      fixedCages,
      attempts: 50
    });

    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }

  // 保底方案
  while (true) {
    const solution = generateSolution(size);
    const fixedCages = [
      { cells: [[0, 0]] },
      { cells: [[0, 3]] },
      { cells: [[3, 0]] },
    ];
    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 3,
      fixedCages,
      attempts: 100
    });
    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }
}

/**
 * 第5关（105）：6x6过渡关，简单的6x6题目
 * 玩家第一次接触6x6，需要相对简单
 * 策略：多放一些单格笼，笼子较小
 */
function generateLevel105() {
  const size = 6;
  let attempts = 0;
  const maxAttempts = 200;

  while (attempts < maxAttempts) {
    attempts++;
    const solution = generateSolution(size);

    // 放4个角的单格笼作为入门提示
    const fixedCages = [
      { cells: [[0, 0]] },
      { cells: [[0, 5]] },
      { cells: [[5, 0]] },
      { cells: [[5, 5]] }
    ];

    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 3,
      fixedCages,
      attempts: 30
    });

    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }

  // 增加单格笼数量
  while (true) {
    const solution = generateSolution(size);
    const fixedCages = [
      { cells: [[0, 0]] },
      { cells: [[0, 5]] },
      { cells: [[5, 0]] },
      { cells: [[5, 5]] },
      { cells: [[2, 2]] },
      { cells: [[3, 3]] }
    ];
    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 2,
      fixedCages,
      attempts: 50
    });
    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }
}

/**
 * 第6关（106）：6x6小综合
 * 比105稍难，笼子更大一些，需要综合运用多种技巧
 */
function generateLevel106() {
  const size = 6;
  let attempts = 0;
  const maxAttempts = 200;

  while (attempts < maxAttempts) {
    attempts++;
    const solution = generateSolution(size);

    // 只放2个单格笼，笼子稍大
    const fixedCages = [
      { cells: [[0, 0]] },
      { cells: [[5, 5]] }
    ];

    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 4,
      fixedCages,
      attempts: 30
    });

    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }

  // 保底：多几个单格笼
  while (true) {
    const solution = generateSolution(size);
    const fixedCages = [
      { cells: [[0, 0]] },
      { cells: [[0, 5]] },
      { cells: [[5, 0]] },
      { cells: [[5, 5]] },
    ];
    const cages = generateCages(solution, size, {
      minSize: 2,
      maxSize: 3,
      fixedCages,
      attempts: 50
    });
    if (!cages) continue;
    if (!validateCages(cages, solution, size)) continue;

    const cells = Array.from({ length: size }, () => Array(size).fill(0));
    if (hasUniqueSolution(cells, cages, size)) {
      return createPuzzle(size, cages, solution);
    }
  }
}

// ==========================================
// 第五部分：关卡数据输出
// ==========================================

/**
 * 生成第一章所有关卡
 */
function generateChapter1() {
  console.log('========== 生成第一章教学关卡 ==========\n');

  const levels = [];

  console.log('生成第 101 关（全单格笼 4x4）...');
  const l101 = generateLevel101();
  console.log(`  尺寸: ${l101.size}x${l101.size}, 笼子数: ${l101.cages.length}, 唯一解: ${verifyUnique(l101)}`);
  levels.push({ id: 101, ...l101, name: '第1关：单格笼的秘密', difficulty: '入门' });

  console.log('生成第 102 关（全2格笼 4x4）...');
  const l102 = generateLevel102();
  console.log(`  尺寸: ${l102.size}x${l102.size}, 笼子数: ${l102.cages.length}, 唯一解: ${verifyUnique(l102)}`);
  levels.push({ id: 102, ...l102, name: '第2关：双格笼推理', difficulty: '入门' });

  console.log('生成第 103 关（混合笼 4x4 显单）...');
  const l103 = generateLevel103();
  console.log(`  尺寸: ${l103.size}x${l103.size}, 笼子数: ${l103.cages.length}, 唯一解: ${verifyUnique(l103)}`);
  levels.push({ id: 103, ...l103, name: '第3关：寻找显单', difficulty: '简单' });

  console.log('生成第 104 关（混合笼 4x4 宫排除）...');
  const l104 = generateLevel104();
  console.log(`  尺寸: ${l104.size}x${l104.size}, 笼子数: ${l104.cages.length}, 唯一解: ${verifyUnique(l104)}`);
  levels.push({ id: 104, ...l104, name: '第4关：宫排除技巧', difficulty: '简单' });

  console.log('生成第 105 关（6x6 过渡关）...');
  const l105 = generateLevel105();
  console.log(`  尺寸: ${l105.size}x${l105.size}, 笼子数: ${l105.cages.length}, 唯一解: ${verifyUnique(l105)}`);
  levels.push({ id: 105, ...l105, name: '第5关：6x6初体验', difficulty: '简单' });

  console.log('生成第 106 关（6x6 小综合）...');
  const l106 = generateLevel106();
  console.log(`  尺寸: ${l106.size}x${l106.size}, 笼子数: ${l106.cages.length}, 唯一解: ${verifyUnique(l106)}`);
  levels.push({ id: 106, ...l106, name: '第6关：6x6小综合', difficulty: '中等' });

  console.log('\n========== 生成完成 ==========');
  return levels;
}

/**
 * 验证关卡是否有唯一解
 */
function verifyUnique(puzzle) {
  return hasUniqueSolution(puzzle.cells, puzzle.cages, puzzle.size);
}

/**
 * 打印关卡信息（调试用）
 */
function printPuzzleInfo(puzzle) {
  console.log(`\n--- 关卡 ${puzzle.id || ''} ---`);
  console.log(`尺寸: ${puzzle.size}x${puzzle.size}`);
  console.log(`笼子数: ${puzzle.cages.length}`);
  console.log('笼子列表:');
  for (const cage of puzzle.cages) {
    const cellStr = cage.cells.map(([r, c]) => `(${r},${c})`).join(', ');
    console.log(`  笼${cage.id}: 和=${cage.sum}, 格数=${cage.cells.length} [${cellStr}]`);
  }
  console.log('解答:');
  for (const row of puzzle.solution) {
    console.log('  ' + row.join(' '));
  }
}

// ==========================================
// 主入口
// ==========================================

function main() {
  const levels = generateChapter1();

  // 输出到控制台
  console.log('\n========== JSON 输出 ==========\n');
  console.log(JSON.stringify(levels, null, 2));

  // 输出到文件
  const outputPath = path.join(__dirname, '..', 'game-src', 'data', 'teaching-levels-chapter1.json');
  fs.writeFileSync(outputPath, JSON.stringify(levels, null, 2), 'utf-8');
  console.log(`\n关卡数据已保存到: ${outputPath}`);

  // 验证所有关卡
  console.log('\n========== 最终验证 ==========');
  let allPass = true;
  for (const level of levels) {
    const valid = validateCages(level.cages, level.solution, level.size);
    const unique = hasUniqueSolution(level.cells, level.cages, level.size);
    const status = valid && unique ? 'PASS' : 'FAIL';
    if (status === 'FAIL') allPass = false;
    console.log(`  ${level.id} (${level.name}): ${status}  笼子合法=${valid}, 唯一解=${unique}`);
  }
  console.log(`\n总结果: ${allPass ? '全部通过' : '有失败项'}`);
}

// 导出模块
module.exports = {
  generateSolution,
  KillerSudokuSolver,
  hasUniqueSolution,
  generateAllSingleCages,
  generateAllTwoCellCages,
  generateCages,
  validateCages,
  generateLevel101,
  generateLevel102,
  generateLevel103,
  generateLevel104,
  generateLevel105,
  generateLevel106,
  generateChapter1
};

// 如果直接运行，执行主函数
if (require.main === module) {
  main();
}

