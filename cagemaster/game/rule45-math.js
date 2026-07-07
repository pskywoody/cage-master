/**
 * ============================================================
 *  Rule45Math - 星衡法则纯算法模块
 * ============================================================
 *
 *  星衡法则相关的纯数学计算，无 DOM 依赖，可独立测试。
 *
 *  包含：
 *    - findCombinations()  回溯法枚举所有 k 数和为 S 的组合
 *    - sumFirstK()        前 k 小数字之和
 *    - sumLastK()         前 k 大数字之和
 *    - calcInnie()        内突计算
 *    - calcOutie()       外突计算
 *
 *  用法：
 *    const result = Rule45Math.findCombinations(3, 15, [1,2,3,4,5,6,7,8,9]);
 *    // 返回: [[1,5,9], [1,6,8], [2,4,9], [2,5,8], [2,6,7], [3,4,8], [3,5,7], [4,5,6]]
 *
 * ============================================================
 */

const Rule45Math = {
  /**
   * 找出所有 k 个不同数字的组合，其和为 targetSum
   * 回溯法枚举，结果按从小到大排列
   *
   * @param {number} k - 数字个数（格子数）
   * @param {number} targetSum - 目标和
   * @param {number[]} availableNums - 可用数字池（默认 1-9）
   * @param {number[]} mustInclude - 必含数字（可选）
   * @param {number[]} mustExclude - 必排除数字（可选）
   * @returns {number[][]} - 所有满足条件的组合，每个组合是升序数组
   */
  findCombinations(k, targetSum, availableNums = null, mustInclude = [], mustExclude = []) {
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
      if (!pool.includes(m)) return []; // 必含数字不在池中，无解
    }
    if (mustSet.size > k) return []; // 必含数超过格子数，无解

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

    const minSum = this.sumFirstK(remainingPool, remainingK);
    const maxSum = this.sumLastK(remainingPool, remainingK);
    if (remainingSum < minSum || remainingSum > maxSum) return [];

    // 回溯枚举
    const results = [];
    const current = [];

    const backtrack = (start, kLeft, sumLeft) => {
      if (kLeft === 0) {
        if (sumLeft === 0) {
          // 加上必含数字，排序
          const combo = [...mustInclude, ...current].sort((a, b) => a - b);
          results.push(combo);
        }
        return;
      }

      for (let i = start; i < remainingPool.length; i++) {
        const num = remainingPool[i];
        if (num > sumLeft) break; // 剪枝：剩余数字太大
        // 剩余 kLeft-1 个数字的最小和不能超过 sumLeft - num
        const remainingAfterPick = remainingPool.length - i - 1;
        if (remainingAfterPick < kLeft - 1) continue;
        const minRest = this.sumFirstK(remainingPool.slice(i + 1), kLeft - 1);
        if (num + minRest > sumLeft) continue;

        current.push(num);
        backtrack(i + 1, kLeft - 1, sumLeft - num);
        current.pop();
      }
    };

    backtrack(0, remainingK, remainingSum);
    return results;
  },

  /**
   * 数组中前 k 个最小数字之和
   */
  sumFirstK(arr, k) {
    if (k <= 0 || arr.length < k) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    let sum = 0;
    for (let i = 0; i < k; i++) sum += sorted[i];
    return sum;
  },

  /**
   * 数组中前 k 个最大数字之和
   */
  sumLastK(arr, k) {
    if (k <= 0 || arr.length < k) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    let sum = 0;
    for (let i = sorted.length - k; i < sorted.length; i++) sum += sorted[i];
    return sum;
  },

  /**
   * 计算内突（innie）：笼子部分在宫内，部分在宫外
   * @param {number} cageSum - 笼子和
   * @param {number} cageCount - 笼子格数
   * @param {number} insideCount - 宫内格数
   * @returns {{innieValue: number, outieValue: number}}
   */
  calcInnie(cageSum, cageCount, insideCount) {
    // 宫内部分的和 = 45 - 宫外部分的和
    // 内突值 = 笼子和 - 45 （当笼子只有一格在宫外时）
    // 更通用的方法：
    const outsideCount = cageCount - insideCount;
    // 宫内最小和 = 前insideCount个最小数之和
    // 宫内最大和 = 前insideCount个最大数之和
    // 外突=笼子和-45 (1格突出时)
    return {
      innieValue: cageSum - 45, // 1格外突时的内突值
      outieValue: 45 - cageSum  // 1格内突时的外突值
    };
  },

  /**
   * 计算一个宫（3x3）的 45 法则分析
   * @param {Array} cages - 所有笼子 [{ sum, cells: [[r,c],...] }]
   * @param {number} boxId - 宫编号 0-8
   * @param {number} gridSize - 棋盘大小（默认9）
   * @returns {{currentSum: number, totalSum: number, innieCells: Array, outieCells: Array, remaining: number}}
   */
  analyzeBox(cages, boxId, gridSize = 9) {
    const boxR = Math.floor(boxId / 3) * 3;
    const boxC = (boxId % 3) * 3;
    const boxSize = gridSize / 3;

    let currentSum = 0;
    const innieCells = [];  // 完全在宫内的笼子中，有格子在宫外 → 内突
    const outieCells = [];  // 完全在宫外的笼子中，有格子在宫内 → 外突
    const crossedCages = []; // 跨宫笼子

    for (const cage of cages) {
      let insideCount = 0;
      let outsideCount = 0;
      const insideCells = [];
      const outsideCells = [];

      for (const [r, c] of cage.cells) {
        const inBox = r >= boxR && r < boxR + boxSize && c >= boxC && c < boxC + boxSize;
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
        currentSum += (cage.sum * insideCount / cage.cells.length); // 粗略估算
      }
      // 完全在宫外：不计入
    }

    const totalSum = gridSize === 9 ? 45 : (gridSize === 6 ? 21 : 10); // 9x9=45, 6x6=21, 4x4=10
    const remaining = totalSum - currentSum;

    // 找内突/外突单元格（只有一格突出的情况）
    let innieCell = null;
    let innieValue = null;
    let outieCell = null;
    let outieValue = null;

    for (const cross of crossedCages) {
      if (cross.outsideCount === 1) {
        // 1格在宫外 → 内突
        innieCell = cross.outsideCells[0];
        innieValue = cross.cage.sum - (totalSum - cross.outsideCells.reduce((s, c) => s + (cross.cage.cells.length - 1), 0));
        // 简化：内突值 = 笼子和 - (totalSum - 笼子在宫内部分的和)
        // 更准确的：跨宫笼子只有一格突出时，突出格的值 = cageSum - (宫内其他格的值)
        // 但这里不知道各格的值，只能用笼子和与 totalSum 的关系来表示
        innieValue = cross.cage.sum - (totalSum - (totalSum - cross.cage.sum + cross.outsideCells.length * 0));
        // 简化计算：1格突出时，突出格的值 ≈ cageSum - (宫内格数的平均和)
        // 实际应用中由求解器精确计算，这里只做粗略分析
        innieValue = cross.cage.sum - (totalSum - cross.cage.sum);
        innieCells.push(cross.outsideCells[0]);
      }
      if (cross.insideCount === 1) {
        // 1格在宫内 → 外突
        outieCell = cross.insideCells[0];
        outieValue = totalSum - (cross.cage.sum - (totalSum - totalSum));
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
};

// 兼容 CommonJS（Node 环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Rule45Math;
}
