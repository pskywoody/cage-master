/**
 * ============================================================
 *  Rule45 - 星衡法则算法模块
 * ============================================================
 *
 *  合并自 Rule45Math 和 Rule45Calc。
 *  星衡法则（Rule of 45）相关的纯数学计算，无 DOM 依赖。
 *
 *  包含：
 *    - findCombinations()     回溯法枚举所有 k 数和为 S 的组合
 *    - calcCombinations()     对象参数风格的组合计算（兼容 Rule45Calc）
 *    - sumFirstK() / sumLastK()
 *    - calcInnie() / calcOutie()  内突外突计算
 *    - analyzeBox()          单宫 45 法则分析
 *
 *  用法：
 *    const result = Rule45.findCombinations(3, 15);
 *    const result2 = Rule45.calcCombinations({ cellCount: 3, targetSum: 15, mustNums: [1] });
 *
 * ============================================================
 */

const Rule45 = (function() {

  // ========================================================
  //  核心算法：组合枚举
  // ========================================================

  /**
   * 找出所有 k 个不同数字的组合，其和为 targetSum
   * 回溯法枚举，结果按从小到大排列
   *
   * @param {number} k - 数字个数（格子数）
   * @param {number} targetSum - 目标和
   * @param {number[]} [availableNums=null] - 可用数字池（默认 1-9）
   * @param {number[]} [mustInclude=[]] - 必含数字
   * @param {number[]} [mustExclude=[]] - 必排除数字
   * @returns {number[][]} - 所有满足条件的组合，每个组合是升序数组
   */
  function findCombinations(k, targetSum, availableNums = null, mustInclude = [], mustExclude = []) {
    // 默认数字池 1-9
    if (!availableNums) {
      availableNums = [];
      for (let i = 1; i <= 9; i++) availableNums.push(i);
    }

    // 过滤排除数字
    const excludeSet = new Set(mustExclude);
    let pool = availableNums.filter(n => !excludeSet.has(n));

    // 必含数字校验
    const mustSet = new Set(mustInclude);
    for (const m of mustSet) {
      if (!pool.includes(m)) return [];
    }
    if (mustSet.size > k) return [];

    // 如果有必含数字，先从目标和中减去
    let remainingK = k;
    let remainingSum = targetSum;
    let remainingPool = [...pool];

    if (mustSet.size > 0) {
      const mustSum = mustInclude.reduce((a, b) => a + b, 0);
      remainingK -= mustSet.size;
      remainingSum -= mustSum;
      remainingPool = pool.filter(n => !mustSet.has(n));
    }

    // 边界快速判断
    if (remainingK < 0) return [];
    if (remainingK === 0) {
      return remainingSum === 0 ? [mustInclude.sort((a, b) => a - b)] : [];
    }
    if (remainingPool.length < remainingK) return [];

    const minSum = sumFirstK(remainingPool, remainingK);
    const maxSum = sumLastK(remainingPool, remainingK);
    if (remainingSum < minSum || remainingSum > maxSum) return [];

    // 回溯枚举
    const results = [];
    const current = [];

    const backtrack = (start, kLeft, sumLeft) => {
      if (kLeft === 0) {
        if (sumLeft === 0) {
          const combo = [...mustInclude, ...current].sort((a, b) => a - b);
          results.push(combo);
        }
        return;
      }

      for (let i = start; i < remainingPool.length; i++) {
        const num = remainingPool[i];
        if (num > sumLeft) break;
        const remainingAfterPick = remainingPool.length - i - 1;
        if (remainingAfterPick < kLeft - 1) continue;
        const minRest = sumFirstK(remainingPool.slice(i + 1), kLeft - 1);
        if (num + minRest > sumLeft) continue;

        current.push(num);
        backtrack(i + 1, kLeft - 1, sumLeft - num);
        current.pop();
      }
    };

    backtrack(0, remainingK, remainingSum);
    return results;
  }

  /**
   * 对象参数风格的组合计算（兼容 Rule45Calc API）
   * @param {Object} options
   * @param {number} options.cellCount - 格子数（k）
   * @param {number} options.targetSum - 目标和
   * @param {number[]|Set} [options.mustNums] - 必含数字
   * @param {number[]|Set} [options.excludeNums] - 排除数字
   * @param {number} [options.maxNum=9] - 数字范围上限
   * @returns {Object} { combinations: number[][], error: string|null }
   */
  function calcCombinations(options) {
    const cellCount = parseInt(options.cellCount) || 0;
    const targetSum = parseInt(options.targetSum) || 0;
    const maxNum = options.maxNum || 9;

    // 边界检查
    if (cellCount < 1 || cellCount > maxNum || targetSum < 1) {
      return { combinations: [], error: '请输入有效的格子数和目标和' };
    }

    // 标准化必含/排除数字
    const mustNums = options.mustNums
      ? new Set(Array.isArray(options.mustNums) ? options.mustNums : [...options.mustNums])
      : new Set();
    const excludeNums = options.excludeNums
      ? new Set(Array.isArray(options.excludeNums) ? options.excludeNums : [...options.excludeNums])
      : new Set();

    if (mustNums.size > cellCount) {
      return { combinations: [], error: '必含数字数量不能超过格子数' };
    }

    // 必含数字不能同时被排除
    for (const m of mustNums) {
      if (excludeNums.has(m)) {
        return { combinations: [], error: '必含数字不能同时被排除' };
      }
    }

    // 构建可用数字池
    const availableNums = [];
    for (let i = 1; i <= maxNum; i++) {
      if (!excludeNums.has(i)) availableNums.push(i);
    }

    const combos = findCombinations(
      cellCount,
      targetSum,
      availableNums,
      Array.from(mustNums),
      Array.from(excludeNums)
    );

    return { combinations: combos, error: null };
  }

  // ========================================================
  //  工具函数
  // ========================================================

  /** 数组中前 k 个最小数字之和 */
  function sumFirstK(arr, k) {
    if (k <= 0 || arr.length < k) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    let sum = 0;
    for (let i = 0; i < k; i++) sum += sorted[i];
    return sum;
  }

  /** 数组中前 k 个最大数字之和 */
  function sumLastK(arr, k) {
    if (k <= 0 || arr.length < k) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    let sum = 0;
    for (let i = sorted.length - k; i < sorted.length; i++) sum += sorted[i];
    return sum;
  }

  // ========================================================
  //  内突外突计算
  // ========================================================

  /**
   * 计算内突（innie）：笼子部分在宫内，部分在宫外
   * @param {number} cageSum - 笼子和
   * @param {number} cageCount - 笼子格数
   * @param {number} insideCount - 宫内格数
   * @param {number} [gridSize=9] - 棋盘大小（用于计算目标和）
   * @returns {{innieValue: number, outieValue: number}}
   */
  function calcInnie(cageSum, cageCount, insideCount, gridSize = 9) {
    const totalSum = gridSize * (gridSize + 1) / 2;
    return {
      innieValue: cageSum - totalSum,
      outieValue: totalSum - cageSum
    };
  }

  /**
   * 计算外突（outie）— calcInnie 的别名
   */
  function calcOutie(cageSum, cageCount, outsideCount, gridSize = 9) {
    return calcInnie(cageSum, cageCount, cageCount - outsideCount, gridSize);
  }

  // ========================================================
  //  单宫分析
  // ========================================================

  /**
   * 计算一个宫的 45 法则分析
   * @param {Array} cages - 所有笼子 [{ sum, cells: [[r,c],...] }]
   * @param {number} boxId - 宫编号
   * @param {number} [gridSize=9] - 棋盘大小
   * @param {Object} [boxDim] - 宫尺寸 { boxW, boxH, boxCols }
   * @returns {Object} 分析结果
   */
  function analyzeBox(cages, boxId, gridSize = 9, boxDim = null) {
    // 计算宫尺寸
    let boxW, boxH, boxCols;
    if (boxDim) {
      boxW = boxDim.boxW;
      boxH = boxDim.boxH;
      boxCols = boxDim.boxCols;
    } else {
      // 自动推断
      if (gridSize === 4) { boxW = 2; boxH = 2; boxCols = 2; }
      else if (gridSize === 6) { boxW = 3; boxH = 2; boxCols = 3; }
      else { boxW = 3; boxH = 3; boxCols = 3; } // 9x9 默认
    }

    const boxR = Math.floor(boxId / boxCols) * boxH;
    const boxC = (boxId % boxCols) * boxW;

    let currentSum = 0;
    const innieCells = [];
    const outieCells = [];
    const crossedCages = [];

    for (const cage of cages) {
      let insideCount = 0;
      let outsideCount = 0;
      const insideCells = [];
      const outsideCells = [];

      for (const [r, c] of cage.cells) {
        const inBox = r >= boxR && r < boxR + boxH && c >= boxC && c < boxC + boxW;
        if (inBox) {
          insideCount++;
          insideCells.push([r, c]);
        } else {
          outsideCount++;
          outsideCells.push([r, c]);
        }
      }

      if (insideCount === cage.cells.length) {
        // 完全在宫内
        currentSum += cage.sum;
      } else if (insideCount > 0 && outsideCount > 0) {
        // 跨宫
        crossedCages.push({ cage, insideCount, outsideCount, insideCells, outsideCells });
        currentSum += (cage.sum * insideCount / cage.cells.length);
      }
    }

    // 每宫目标和 = sum(1..gridSize) = gridSize * (gridSize + 1) / 2
    const totalSum = gridSize * (gridSize + 1) / 2;
    const remaining = totalSum - currentSum;

    // 找内突/外突单元格（只有一格突出的情况）
    let innieCell = null;
    let innieValue = null;
    let outieCell = null;
    let outieValue = null;

    for (const cross of crossedCages) {
      if (cross.outsideCount === 1) {
        innieCell = cross.outsideCells[0];
        innieValue = cross.cage.sum - (totalSum - cross.cage.sum);
        innieCells.push(cross.outsideCells[0]);
      }
      if (cross.insideCount === 1) {
        outieCell = cross.insideCells[0];
        outieValue = totalSum - cross.cage.sum;
        outieCells.push(cross.insideCells[0]);
      }
    }

    return {
      currentSum,
      totalSum,
      remaining,
      innieCells,
      outieCells,
      innieValue,
      outieValue,
      crossedCages
    };
  }

  // ========================================================
  //  公共 API
  // ========================================================

  return {
    // 核心组合计算（两种 API 风格）
    findCombinations,
    calcCombinations,
    // 工具函数
    sumFirstK,
    sumLastK,
    // 内突外突
    calcInnie,
    calcOutie,
    // 单宫分析
    analyzeBox,
  };
})();

// ============================================================
//  全局导出（兼容旧名称）
// ============================================================
if (typeof window !== 'undefined') {
  window.Rule45 = Rule45;
  window.Rule45Math = Rule45;  // 兼容旧名称
  window.Rule45Calc = Rule45;  // 兼容旧名称
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rule45;
}
