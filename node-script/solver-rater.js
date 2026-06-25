// ==========================================
// 杀手数独求解器 + 单解验证
// 支持笼子约束（和值 + 笼内不重复）
// ==========================================

class KillerSudokuSolver {
  /**
   * @param {number[][]} grid - 9x9 初始盘面（0 表示空）
   * @param {Array} cages - 笼子数组 [{id, sum, cells:[[r,c]]}]
   */
  constructor(grid, cages) {
    this.size = 9;
    this.grid = grid.map(row => row.slice());
    this.cages = cages;
    this.solutions = [];
    this.maxSolutions = 1; // 找几个解就停止（单解验证时设为 2）

    // 预建索引：每个格子属于哪个笼子
    this.cageIdMap = Array.from({ length: 9 }, () => Array(9).fill(null));
    // 预建索引：笼子 id → 笼子对象
    this.cageMap = {};

    cages.forEach(cage => {
      this.cageMap[cage.id] = cage;
      cage.cells.forEach(([r, c]) => {
        this.cageIdMap[r][c] = cage.id;
      });
    });

    // 每个笼子的已填数统计（运行时维护，加速校验）
    this.cageState = {};
    cages.forEach(cage => {
      this.cageState[cage.id] = {
        sum: 0,
        filled: 0,
        nums: new Set()
      };
    });

    // 初始化 cageState：扫描初始数字
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
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
   * 检查：行、列、3×3宫、笼子（和值不超过+不重复）
   */
  isValid(r, c, num) {
    // 行检查
    for (let i = 0; i < 9; i++) {
      if (this.grid[r][i] === num) return false;
    }

    // 列检查
    for (let i = 0; i < 9; i++) {
      if (this.grid[i][c] === num) return false;
    }

    // 3×3 宫检查
    const boxR = Math.floor(r / 3) * 3;
    const boxC = Math.floor(c / 3) * 3;
    for (let i = boxR; i < boxR + 3; i++) {
      for (let j = boxC; j < boxC + 3; j++) {
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

  /**
   * 放置数字（更新 grid 和 cageState）
   */
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

  /**
   * 移除数字（回溯用）
   */
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
   * 找候选数最少的空格子（MRV 启发式）
   * 大幅减少回溯次数
   * @returns {[r, c, number[]] | null}
   */
  findBestEmpty() {
    let bestR = -1, bestC = -1;
    let bestCount = 10;
    let bestCandidates = null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c] === 0) {
          // 计算候选数
          const cands = [];
          for (let n = 1; n <= 9; n++) {
            if (this.isValid(r, c, n)) {
              cands.push(n);
            }
          }
          if (cands.length < bestCount) {
            bestCount = cands.length;
            bestR = r;
            bestC = c;
            bestCandidates = cands;
            if (bestCount === 0) return [r, c, cands]; // 无候选，立即返回
            if (bestCount === 1) return [r, c, cands]; // 只有1个，直接用
          }
        }
      }
    }

    if (bestR === -1) return null; // 没有空格了
    return [bestR, bestC, bestCandidates];
  }

  /**
   * 回溯求解
   * @param {number} maxSolutions - 找到几个解就停止（1=找一个，2=验证单解）
   * @returns {boolean} - 是否找到了至少一个解
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
      // 没有空格了，找到一个解
      this.solutions.push(this.grid.map(row => row.slice()));
      return;
    }

    const [r, c, candidates] = best;
    if (candidates.length === 0) return; // 死路

    for (const num of candidates) {
      this.place(r, c, num);
      this._backtrack();
      this.remove(r, c, num);
      if (this.solutions.length >= this.maxSolutions) return; // 提前退出
    }
  }

  /**
   * 获取结果
   */
  getResult() {
    return {
      solved: this.solutions.length > 0,
      unique: this.solutions.length === 1,
      solutionCount: this.solutions.length,
      solution: this.solutions.length > 0 ? this.solutions[0] : null
    };
  }
}

// ==========================================
// 难度初步评级（基于回溯求解耗时 + 搜索节点数）
// 更精细的评级由 human-simulator 提供，这里仅做快速粗分
// ==========================================

function quickRateDifficulty(grid, cages) {
  const solver = new KillerSudokuSolver(grid, cages);
  const startTime = Date.now();
  let nodeCount = 0;

  // 装饰 _backtrack 统计节点数
  const originalBacktrack = solver._backtrack.bind(solver);
  solver._backtrack = function() {
    nodeCount++;
    return originalBacktrack();
  };

  solver.solve(1);
  const elapsed = Date.now() - startTime;
  const result = solver.getResult();

  if (!result.solved) {
    return { difficulty: '未知', score: 0, elapsedMs: elapsed, nodes: nodeCount };
  }

  // 粗略评分：基于搜索节点数
  let score = Math.min(100, Math.floor(Math.log2(nodeCount + 1) * 8));
  let difficulty = '简单';
  if (score >= 65) difficulty = '困难';
  else if (score >= 35) difficulty = '中等';

  return {
    difficulty,
    score,
    elapsedMs: elapsed,
    nodes: nodeCount
  };
}

// ==========================================
// CLI 测试入口
// ==========================================

if (require.main === module) {
  // 测试用例：一个简单的杀手数独
  const testCages = [
    { id: 1, sum: 15, cells: [[0,0],[0,1],[1,0]] },
    { id: 2, sum: 9,  cells: [[0,2],[1,2]] },
    { id: 3, sum: 12, cells: [[0,3],[0,4]] },
    { id: 4, sum: 8,  cells: [[0,5],[1,5]] },
    { id: 5, sum: 14, cells: [[0,6],[0,7]] },
    { id: 6, sum: 10, cells: [[0,8],[1,8]] },
    { id: 7, sum: 11, cells: [[1,1],[2,1]] },
    { id: 8, sum: 13, cells: [[1,3],[1,4]] },
    { id: 9, sum: 16, cells: [[1,6],[2,6]] },
    { id: 10, sum: 7,  cells: [[2,0],[3,0]] },
    { id: 11, sum: 18, cells: [[2,2],[2,3]] },
    { id: 12, sum: 9,  cells: [[2,4],[3,4]] },
    { id: 13, sum: 12, cells: [[2,5],[2,6]] },
    { id: 14, sum: 14, cells: [[2,7],[2,8]] },
    { id: 15, sum: 10, cells: [[3,1],[3,2]] },
    { id: 16, sum: 15, cells: [[3,3],[4,3]] },
    { id: 17, sum: 8,  cells: [[3,5],[4,5]] },
    { id: 18, sum: 13, cells: [[3,6],[3,7]] },
    { id: 19, sum: 11, cells: [[3,8],[4,8]] },
    { id: 20, sum: 16, cells: [[4,0],[4,1]] },
    { id: 21, sum: 9,  cells: [[4,2],[5,2]] },
    { id: 22, sum: 12, cells: [[4,4],[5,4]] },
    { id: 23, sum: 15, cells: [[4,6],[4,7]] },
    { id: 24, sum: 14, cells: [[5,0],[6,0]] },
    { id: 25, sum: 8,  cells: [[5,1],[5,2]] },
    { id: 26, sum: 13, cells: [[5,3],[5,4]] },
    { id: 27, sum: 11, cells: [[5,5],[6,5]] },
    { id: 28, sum: 17, cells: [[5,6],[5,7]] },
    { id: 29, sum: 9,  cells: [[5,8],[6,8]] },
    { id: 30, sum: 12, cells: [[6,1],[6,2]] },
    { id: 31, sum: 10, cells: [[6,3],[7,3]] },
    { id: 32, sum: 14, cells: [[6,4],[6,5]] },
    { id: 33, sum: 16, cells: [[6,6],[7,6]] },
    { id: 34, sum: 7,  cells: [[7,0],[8,0]] },
    { id: 35, sum: 15, cells: [[7,1],[7,2]] },
    { id: 36, sum: 9,  cells: [[7,4],[8,4]] },
    { id: 37, sum: 12, cells: [[7,5],[7,6]] },
    { id: 38, sum: 13, cells: [[7,7],[8,7]] },
    { id: 39, sum: 11, cells: [[7,8],[8,8]] },
    { id: 40, sum: 18, cells: [[8,1],[8,2],[8,3]] },
    { id: 41, sum: 10, cells: [[8,5],[8,6]] }
  ];
  const testGrid = Array.from({ length: 9 }, () => Array(9).fill(0));

  console.log('🧪 测试求解器...');
  const solver = new KillerSudokuSolver(testGrid, testCages);

  console.time('求解耗时');
  const found = solver.solve(2); // 找2个解用于验证单解
  console.timeEnd('求解耗时');

  const result = solver.getResult();
  console.log('找到解数:', result.solutionCount);
  console.log('唯一解:', result.unique);
  if (result.solution) {
    console.log('解:');
    result.solution.forEach(row => console.log(row.join(' ')));
  }

  console.log('\n📊 难度粗评:');
  const rating = quickRateDifficulty(testGrid, testCages);
  console.log(JSON.stringify(rating, null, 2));
}

module.exports = { KillerSudokuSolver, quickRateDifficulty };
