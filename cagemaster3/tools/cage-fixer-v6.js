/**
 * ============================================================
 *  CageFixer v6 - 杀手数独关卡生成器
 * ============================================================
 *
 *  核心策略：先固定笼子布局，再挖洞调难度。
 *
 *  生成流程（6步）：
 *    Step 1: 生成完整解（随机标准数独）
 *    Step 2: 划分笼子（随机生长，连通，大小1~5）
 *    Step 3: 计算笼子和值
 *    Step 4: 挖洞（移除数字，保持唯一解）
 *    Step 5: 难度评估（TechRater 评级）
 *    Step 6: 纯净度校验（可选）
 *
 *  公共 API:
 *    - new CageFixer(options)
 *    - generator.generate()          生成单个关卡
 *    - generator.generateBatch(n, opts)  批量生成
 *
 *  命令行:
 *    node tools/cage-fixer-v6.js --difficulty medium --count 1
 *
 * ============================================================
 */

(function (global) {
  'use strict';

  // ========================================================
  //  Node.js 环境：polyfill window（board.js 依赖 window 全局）
  // ========================================================

  if (typeof window === 'undefined') {
    global.window = global;
  }

  // ========================================================
  //  依赖加载
  // ========================================================

  const path = require('path');
  const fs = require('fs');

  // 动态加载依赖（兼容浏览器全局变量和 Node require）
  function _loadDeps() {
    const deps = {};

    // Board（board.js 没有 CommonJS 导出，只有 window 全局赋值）
    if (typeof Board !== 'undefined') {
      deps.Board = Board;
    } else if (typeof window !== 'undefined' && window.Board) {
      deps.Board = window.Board;
    } else {
      // 用 fs 读取并在全局上下文中执行，模拟浏览器环境
      const boardPath = path.join(__dirname, '..', 'game', 'board.js');
      const boardCode = fs.readFileSync(boardPath, 'utf-8');
      // 使用 eval 在全局作用域执行（这样 window.Board 赋值就会生效）
      // eslint-disable-next-line no-eval
      eval.call(global, boardCode);
      deps.Board = global.Board || window.Board;
    }

    // TechRater
    if (typeof TechRater !== 'undefined') {
      deps.TechRater = TechRater;
    } else if (typeof window !== 'undefined' && window.TechRater) {
      deps.TechRater = window.TechRater;
    } else {
      const techRaterModule = require(path.join(__dirname, '..', 'game', 'tech-rater.js'));
      deps.TechRater = techRaterModule.TechRater || techRaterModule;
    }

    // LevelValidator
    if (typeof LevelValidator !== 'undefined') {
      deps.LevelValidator = LevelValidator;
    } else if (typeof window !== 'undefined' && window.LevelValidator) {
      deps.LevelValidator = window.LevelValidator;
    } else {
      try {
        const lvModule = require(path.join(__dirname, '..', 'game', 'level-validator.js'));
        deps.LevelValidator = lvModule.LevelValidator || lvModule;
      } catch (e) {
        deps.LevelValidator = null;
      }
    }

    // TechnicalPurityValidator
    if (typeof TechnicalPurityValidator !== 'undefined') {
      deps.TechnicalPurityValidator = TechnicalPurityValidator;
    } else if (typeof window !== 'undefined' && window.TechnicalPurityValidator) {
      deps.TechnicalPurityValidator = window.TechnicalPurityValidator;
    } else {
      try {
        const tpvModule = require(path.join(__dirname, '..', 'game', 'technical-purity-validator.js'));
        deps.TechnicalPurityValidator = tpvModule.TechnicalPurityValidator || tpvModule;
      } catch (e) {
        deps.TechnicalPurityValidator = null;
      }
    }

    return deps;
  }

  // ========================================================
  //  工具函数
  // ========================================================

  function getBoxDimensions(size) {
    if (size === 4) return { boxW: 2, boxH: 2, boxRows: 2, boxCols: 2 };
    if (size === 6) return { boxW: 3, boxH: 2, boxRows: 2, boxCols: 3 };
    return { boxW: 3, boxH: 3, boxRows: 3, boxCols: 3 };
  }

  function shuffleArray(arr, rng) {
    const result = arr.slice();
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // 简单的种子随机数生成器（Mulberry32）
  function createRNG(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 深拷贝二维数组
  function deepCopyGrid(grid) {
    return grid.map(row => row.slice());
  }

  // ========================================================
  //  Step 1: 生成完整解（随机标准数独）
  // ========================================================

  function generateFullSolution(size, rng) {
    const dim = getBoxDimensions(size);
    const grid = Array.from({ length: size }, () => Array(size).fill(0));

    function isValid(r, c, num) {
      // 行检查
      for (let i = 0; i < size; i++) {
        if (grid[r][i] === num) return false;
      }
      // 列检查
      for (let i = 0; i < size; i++) {
        if (grid[i][c] === num) return false;
      }
      // 宫检查
      const br = Math.floor(r / dim.boxH) * dim.boxH;
      const bc = Math.floor(c / dim.boxW) * dim.boxW;
      for (let dr = 0; dr < dim.boxH; dr++) {
        for (let dc = 0; dc < dim.boxW; dc++) {
          if (grid[br + dr][bc + dc] === num) return false;
        }
      }
      return true;
    }

    function backtrack(pos) {
      if (pos === size * size) return true;

      const r = Math.floor(pos / size);
      const c = pos % size;

      if (grid[r][c] !== 0) return backtrack(pos + 1);

      const nums = shuffleArray(Array.from({ length: size }, (_, i) => i + 1), rng);

      for (const num of nums) {
        if (isValid(r, c, num)) {
          grid[r][c] = num;
          if (backtrack(pos + 1)) return true;
          grid[r][c] = 0;
        }
      }
      return false;
    }

    backtrack(0);
    return grid;
  }

  // ========================================================
  //  Step 2: 划分笼子（优先级生长法 / Priority Growth）
  // ========================================================

  /**
   * 将盘面划分为若干连通的笼子（优先级生长法实现）
   *
   * 核心策略：从大到小依次生成（大笼子优先占空间）
   *   - 根据权重预计算各大小笼子的目标数量
   *   - 从最大尺寸开始，依次生成目标数量的笼子
   *   - 每个笼子随机起点，生长时保证数字不重复、连通
   *   - 生长不足时允许"吞并"相邻已生成的小笼子来凑大小
   *   - 最后处理剩余格子并微调分布
   *
   * 解决的核心问题：
   *   原生长法的"边界优先"导致大笼子被挤在狭小空间里无法生长。
   *   新算法让大笼子先生成，有充足空间，大小分布更接近期望。
   *
   * @param {number} size - 盘面大小
   * @param {number[][]} solution - 完整解
   * @param {Function} rng - 随机数生成器
   * @param {number} minSize - 最小笼子大小
   * @param {number} maxSize - 最大笼子大小
   * @param {Object} [sizeWeights] - 可选的自定义大小权重
   */
  function partitionCages(size, solution, rng, minSize = 1, maxSize = 5, sizeWeights = null) {
    const totalCells = size * size;
    const assigned = Array.from({ length: size }, () => Array(size).fill(false));
    const cellToCageIdx = Array.from({ length: size }, () => Array(size).fill(-1));
    let cages = [];
    let nextCageId = 0;

    // 默认大小权重表
    const defaultWeights = {
      1: 0.10,
      2: 0.30,
      3: 0.30,
      4: 0.20,
      5: 0.10
    };
    const weights = sizeWeights || defaultWeights;

    // 预计算各大小的目标笼子数量
    // 目标数 = round(总格子数 * 权重 / 大小)
    // 对大笼子给予预补偿（乘以补偿系数），因为大笼子更容易失败
    // 注意：补偿系数不能太高，否则大笼子会过剩
    const targetCounts = {};
    const compensation = { 1: 0.5, 2: 1.2, 3: 1.1, 4: 1.0, 5: 1.2 };
    for (let s = minSize; s <= maxSize; s++) {
      const w = weights[s] || 0;
      const comp = compensation[s] || 1;
      targetCounts[s] = Math.max(0, Math.round((totalCells * w * comp) / s));
    }

    // 调整目标，使总目标格子数不超过 totalCells
    let totalTargetCells = 0;
    for (let s = minSize; s <= maxSize; s++) {
      totalTargetCells += targetCounts[s] * s;
    }
    if (totalTargetCells > totalCells) {
      // 按比例缩减
      const ratio = totalCells / totalTargetCells;
      for (let s = minSize; s <= maxSize; s++) {
        targetCounts[s] = Math.max(0, Math.floor(targetCounts[s] * ratio));
      }
    }

    // 计算剩余未分配格子数
    function countRemaining() {
      let count = 0;
      for (let r = 0; r < size; r++)
        for (let c = 0; c < size; c++)
          if (!assigned[r][c]) count++;
      return count;
    }

    // 找一个随机的未分配格子作为起点
    function findRandomStart() {
      const unassigned = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!assigned[r][c]) {
            unassigned.push([r, c]);
          }
        }
      }
      if (unassigned.length === 0) return null;
      return unassigned[Math.floor(rng() * unassigned.length)];
    }

    // 检查吞并一个笼子后，新笼子是否仍满足数字不重复
    function canAbsorb(cageNums, otherCage) {
      for (const [r, c] of otherCage.cells) {
        if (cageNums.has(solution[r][c])) return false;
      }
      return true;
    }

    // 生长一个指定大小的笼子（允许吞并相邻的小笼子）
    function growCage(startR, startC, targetSize) {
      const cageCells = [[startR, startC]];
      const inCage = new Set();
      const cageNumbers = new Set();
      const absorbedIndices = []; // 被吞并的笼子索引

      inCage.add(startR + ',' + startC);
      cageNumbers.add(solution[startR][startC]);
      assigned[startR][startC] = true;

      while (cageCells.length < targetSize) {
        // 收集所有可生长的边界
        const emptyFrontier = [];  // 未分配的空格子
        const absorbFrontier = []; // 可吞并的相邻笼子

        for (const [r, c] of cageCells) {
          const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of neighbors) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const key = nr + ',' + nc;
            if (inCage.has(key)) continue;

            if (!assigned[nr][nc]) {
              // 未分配的格子：检查数字不重复
              const num = solution[nr][nc];
              if (!cageNumbers.has(num)) {
                emptyFrontier.push([nr, nc]);
              }
            } else {
              // 已分配：检查所属笼子
              const otherIdx = cellToCageIdx[nr][nc];
              if (otherIdx < 0) continue;
              if (absorbedIndices.indexOf(otherIdx) >= 0) continue;
              const otherCage = cages[otherIdx];
              if (!otherCage) continue;

              // 只有更小的笼子才能被吞并
              if (otherCage.cells.length >= targetSize) continue;

              // 合并后大小不能超过 maxSize + 1（允许略超）
              const combined = cageCells.length + otherCage.cells.length;
              if (combined > maxSize + 2) continue;

              // 检查数字不重复
              if (canAbsorb(cageNumbers, otherCage)) {
                absorbFrontier.push(otherIdx);
              }
            }
          }
        }

        if (emptyFrontier.length === 0 && absorbFrontier.length === 0) break;

        // 优先扩展空格子（80%概率），其次才吞并
        let useAbsorb = false;
        if (emptyFrontier.length > 0 && rng() > 0.2) {
          useAbsorb = false;
        } else if (absorbFrontier.length > 0) {
          useAbsorb = true;
        } else {
          useAbsorb = false;
        }

        if (!useAbsorb && emptyFrontier.length > 0) {
          const idx = Math.floor(rng() * emptyFrontier.length);
          const [nr, nc] = emptyFrontier[idx];
          cageCells.push([nr, nc]);
          inCage.add(nr + ',' + nc);
          cageNumbers.add(solution[nr][nc]);
          assigned[nr][nc] = true;
        } else if (useAbsorb && absorbFrontier.length > 0) {
          // 随机选一个可吞并的笼子
          const uniqueAbsorb = [...new Set(absorbFrontier)];
          const otherIdx = uniqueAbsorb[Math.floor(rng() * uniqueAbsorb.length)];
          const otherCage = cages[otherIdx];

          // 吞并整个笼子
          absorbedIndices.push(otherIdx);
          for (const [r, c] of otherCage.cells) {
            cageCells.push([r, c]);
            inCage.add(r + ',' + c);
            cageNumbers.add(solution[r][c]);
          }
          // 标记被吞并的笼子
          cages[otherIdx] = null;
        } else {
          break;
        }
      }

      return { cells: cageCells, absorbed: absorbedIndices };
    }

    // === 主循环：从大到小生成 ===
    for (let targetSize = maxSize; targetSize >= minSize; targetSize--) {
      const targetCount = targetCounts[targetSize] || 0;
      if (targetCount === 0) continue;

      let generated = 0;
      let attempts = 0;
      const maxAttempts = targetCount * 5;

      while (generated < targetCount && attempts < maxAttempts) {
        attempts++;
        const remaining = countRemaining();
        if (remaining < targetSize) break;

        const start = findRandomStart();
        if (!start) break;

        const result = growCage(start[0], start[1], targetSize);

        // 如果生长出来的大小离目标太远（小于 targetSize 的一半），放弃
        if (result.cells.length < Math.max(1, Math.floor(targetSize * 0.5))) {
          // 回退
          for (const [r, c] of result.cells) {
            assigned[r][c] = false;
          }
          continue;
        }

        // 清理被吞并的笼子引用
        for (const idx of result.absorbed) {
          // cages[idx] 已经设为 null
        }

        // 添加新笼子
        const newCage = {
          id: nextCageId++,
          sum: 0,
          cells: result.cells
        };
        cages.push(newCage);

        // 更新 cellToCageIdx
        const newIdx = cages.length - 1;
        for (const [r, c] of result.cells) {
          cellToCageIdx[r][c] = newIdx;
        }

        generated++;
      }
    }

    // === 处理剩余格子 ===
    // 剩余格子尽量合并成合理大小的笼子，避免产生太多1格笼子
    let safety = 100;
    while (countRemaining() > 0 && safety-- > 0) {
      const start = findRandomStart();
      if (!start) break;

      const remaining = countRemaining();
      // 剩余格子尽量形成 2-3 格的笼子（避免太多1格）
      const target = Math.min(maxSize, Math.max(2, Math.min(remaining, 3)));
      const result = growCage(start[0], start[1], target);

      if (result.cells.length >= 2) {
        const newCage = {
          id: nextCageId++,
          sum: 0,
          cells: result.cells
        };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        for (const [r, c] of result.cells) {
          cellToCageIdx[r][c] = newIdx;
        }
      } else if (result.cells.length === 1) {
        // 只有1格，直接作为1格笼子
        const newCage = {
          id: nextCageId++,
          sum: 0,
          cells: [[start[0], start[1]]]
        };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        cellToCageIdx[start[0]][start[1]] = newIdx;
      } else {
        // 极端情况，强制分配
        assigned[start[0]][start[1]] = true;
        const newCage = {
          id: nextCageId++,
          sum: 0,
          cells: [[start[0], start[1]]]
        };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        cellToCageIdx[start[0]][start[1]] = newIdx;
      }
    }

    // 清理 null 笼子（被吞并的）
    cages = cages.filter(c => c !== null);

    // === 后处理：平衡大小分布 ===
    // 策略：如果小笼子过多、大笼子不足，尝试将相邻的小笼子合并
    cages = _balanceByMerging(cages, weights, minSize, maxSize, solution, size, rng);

    // 重新编号
    for (let i = 0; i < cages.length; i++) {
      cages[i].id = i;
    }

    // === 最后检查：合并过小的笼子 ===
    if (minSize > 1) {
      cages = mergeSmallCages(cages, solution, size, minSize, rng, maxSize);
    }

    return cages;
  }

  /**
   * 后处理：通过合并小笼子来平衡大小分布
   * 如果某大小的笼子过多，而更大的笼子不足，尝试合并
   */
  function _balanceByMerging(cages, weights, minSize, maxSize, solution, size, rng) {
    const totalCells = cages.reduce((sum, c) => sum + c.cells.length, 0);
    const totalCages = cages.length;

    // 计算期望的各大小笼子数量
    // 基于总格子数和权重计算：某大小的格子数 = 总格子 * 权重，笼子数 = 格子数 / 大小
    // 这种方式比基于笼子数的百分比更稳定
    const expectedCount = {};
    for (let s = minSize; s <= maxSize; s++) {
      const w = weights[s] || 0;
      expectedCount[s] = Math.max(0, Math.round((totalCells * w) / s));
    }

    // 统计当前分布
    function getCounts(cs) {
      const counts = {};
      for (let s = minSize; s <= maxSize; s++) counts[s] = 0;
      for (const cage of cs) {
        const s = cage.cells.length;
        if (s >= minSize && s <= maxSize) counts[s]++;
      }
      return counts;
    }

    // 构建 cell -> cageIdx 映射
    function buildCellMap(cs) {
      const map = {};
      for (let i = 0; i < cs.length; i++) {
        if (!cs[i]) continue;
        for (const [r, c] of cs[i].cells) {
          map[r + ',' + c] = i;
        }
      }
      return map;
    }

    // 预计算每个笼子的数字集合
    function buildNumSets(cs) {
      return cs.map(cage => {
        if (!cage) return null;
        const s = new Set();
        for (const [r, c] of cage.cells) s.add(solution[r][c]);
        return s;
      });
    }

    // 迭代合并，逐步调整分布（最多20轮，避免性能问题）
    for (let iter = 0; iter < 20; iter++) {
      let counts = getCounts(cages);
      let anyMerged = false;

      // 只重建一次映射（每轮开始时）
      const cellMap = buildCellMap(cages);
      const numSets = buildNumSets(cages);

      // 策略：从最小的过剩大小开始，找相邻的笼子合并
      // 优先合并1格笼子（最容易过剩）
      for (let smallS = minSize; smallS < maxSize; smallS++) {
        if (counts[smallS] <= expectedCount[smallS]) continue; // 不过剩

        let bestMerge = null;
        let bestScore = -1;

        for (let i = 0; i < cages.length; i++) {
          if (!cages[i]) continue;
          if (cages[i].cells.length !== smallS) continue;

          // 找相邻笼子
          const neighbors = new Set();
          for (const [r, c] of cages[i].cells) {
            const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
            for (const [nr, nc] of adj) {
              const key = nr + ',' + nc;
              const ni = cellMap[key];
              if (ni !== undefined && ni !== i && cages[ni]) {
                neighbors.add(ni);
              }
            }
          }

          for (const ni of neighbors) {
            if (!cages[ni]) continue;
            if (ni < i) continue; // 避免重复检查
            const sj = cages[ni].cells.length;
            const combined = smallS + sj;
            if (combined > maxSize) continue;

            // 检查数字是否重复
            let hasDup = false;
            for (const num of numSets[i]) {
              if (numSets[ni].has(num)) { hasDup = true; break; }
            }
            if (hasDup) continue;

            // 评分：优先合并到"最缺"的大小（按缺口百分比计算）
            let score = 50;
            const deficit = expectedCount[combined] - (counts[combined] || 0);
            const deficitPct = expectedCount[combined] > 0 ? deficit / expectedCount[combined] : 0;
            score += Math.max(0, deficitPct) * 60; // 缺口百分比权重高
            score -= combined * 3; // 大笼子惩罚（避免一路合并到5格）
            if (counts[sj] > expectedCount[sj]) score += 8; // 对方也过剩，一起合并更好
            // 特别优先 1+1=2 的合并（2格通常缺口最大）
            if (smallS === 1 && sj === 1 && combined === 2) score += 25;
            // 如果合并到5格且5格已经达标，大幅惩罚
            if (combined === maxSize && counts[maxSize] >= expectedCount[maxSize]) score -= 40;

            if (score > bestScore) {
              bestScore = score;
              bestMerge = [i, ni, combined];
            }
          }
        }

        if (bestMerge) {
          const [i, ni, combined] = bestMerge;
          cages[ni].cells = cages[ni].cells.concat(cages[i].cells);
          cages[i] = null;
          cages = cages.filter(c => c !== null);
          anyMerged = true;
          break; // 重新开始一轮
        }
      }

      if (!anyMerged) break;
    }

    return cages;
  }

  /**
   * 合并过小的笼子到相邻笼子
   * 合并时保证数字不重复
   */
  function mergeSmallCages(cages, solution, size, minSize, rng, maxSize = 5) {
    const cellToCage = {};
    for (let i = 0; i < cages.length; i++) {
      if (!cages[i]) continue;
      for (const [r, c] of cages[i].cells) {
        cellToCage[r + ',' + c] = i;
      }
    }

    // 预计算每个笼子的数字集合
    const cageNumSets = cages.map(cage => {
      if (!cage) return null;
      const s = new Set();
      for (const [r, c] of cage.cells) {
        s.add(solution[r][c]);
      }
      return s;
    });

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < cages.length; i++) {
        if (!cages[i]) continue;
        if (cages[i].cells.length >= minSize) continue;

        // 找相邻的笼子
        const neighbors = new Set();
        for (const [r, c] of cages[i].cells) {
          const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of adj) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const key = nr + ',' + nc;
            const ni = cellToCage[key];
            if (ni !== undefined && ni !== i && cages[ni]) {
              neighbors.add(ni);
            }
          }
        }

        if (neighbors.size === 0) continue;

        // 选一个相邻笼子合并（优先选合并后数字不重复且不超过 maxSize 的）
        const neighborList = [...neighbors];
        // 随机打乱
        for (let k = neighborList.length - 1; k > 0; k--) {
          const j = Math.floor(rng() * (k + 1));
          [neighborList[k], neighborList[j]] = [neighborList[j], neighborList[k]];
        }

        let merged = false;
        for (const ni of neighborList) {
          const combinedSize = cages[i].cells.length + cages[ni].cells.length;
          if (combinedSize > maxSize) continue; // 不超过最大笼子大小

          // 检查数字是否重复
          let hasDup = false;
          for (const num of cageNumSets[i]) {
            if (cageNumSets[ni].has(num)) {
              hasDup = true;
              break;
            }
          }
          if (hasDup) continue;

          // 合并 i 到 ni
          cages[ni].cells = cages[ni].cells.concat(cages[i].cells);
          for (const num of cageNumSets[i]) {
            cageNumSets[ni].add(num);
          }
          for (const [r, c] of cages[i].cells) {
            cellToCage[r + ',' + c] = ni;
          }
          cages[i] = null;
          cageNumSets[i] = null;
          changed = true;
          merged = true;
          break;
        }

        if (merged) break; // 重新扫描
      }
    }

    // 过滤掉 null 并重新编号
    const result = cages.filter(c => c !== null);
    for (let i = 0; i < result.length; i++) {
      result[i].id = i;
    }
    return result;
  }

  // ========================================================
  //  Step 3: 计算笼子和值
  // ========================================================

  function computeCageSums(cages, solution) {
    return cages.map(cage => {
      let sum = 0;
      for (const [r, c] of cage.cells) {
        sum += solution[r][c];
      }
      return {
        id: cage.id,
        sum: sum,
        cells: cage.cells
      };
    });
  }

  // ========================================================
  //  唯一解验证（暴力回溯）
  // ========================================================

  /**
   * 验证杀手数独是否有唯一解
   * 返回: { unique: boolean, solutionCount: number, firstSolution: grid|null }
   *
   * 算法：带笼子约束的回溯法
   * - 找到 2 个解就立即返回（剪枝）
   */
  function verifyUniqueSolution(grid, cages, size) {
    const dim = getBoxDimensions(size);
    const solution = deepCopyGrid(grid);
    let solutionCount = 0;
    let firstSolution = null;

    // 预计算笼子信息
    const cellCageMap = {}; // "r,c" -> cageIndex
    for (let i = 0; i < cages.length; i++) {
      for (const [r, c] of cages[i].cells) {
        cellCageMap[r + ',' + c] = i;
      }
    }

    // 预计算每个笼子当前已有的数字和和值
    const cageNumbers = cages.map(() => new Set());
    const cageSums = cages.map(() => 0);
    // 预计算每个笼子的空格数
    const cageEmptyCount = cages.map((cage) => cage.cells.length);

    // 初始化：填入已有的数字
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (solution[r][c] !== 0) {
          const ci = cellCageMap[r + ',' + c];
          if (ci !== undefined) {
            cageNumbers[ci].add(solution[r][c]);
            cageSums[ci] += solution[r][c];
            cageEmptyCount[ci]--;
          }
        }
      }
    }

    function isValidPlacement(r, c, num) {
      // 行检查
      for (let i = 0; i < size; i++) {
        if (solution[r][i] === num) return false;
      }
      // 列检查
      for (let i = 0; i < size; i++) {
        if (solution[i][c] === num) return false;
      }
      // 宫检查
      const br = Math.floor(r / dim.boxH) * dim.boxH;
      const bc = Math.floor(c / dim.boxW) * dim.boxW;
      for (let dr = 0; dr < dim.boxH; dr++) {
        for (let dc = 0; dc < dim.boxW; dc++) {
          if (solution[br + dr][bc + dc] === num) return false;
        }
      }
      // 笼子检查
      const ci = cellCageMap[r + ',' + c];
      if (ci !== undefined) {
        if (cageNumbers[ci].has(num)) return false;
        // 和值检查：不能超过目标和
        if (cageSums[ci] + num > cages[ci].sum) return false;
        // 下限检查：填入 num 后，剩余空格的最小/最大可能和是否能达到目标
        const remainingAfter = cageEmptyCount[ci] - 1;
        if (remainingAfter > 0) {
          // 计算剩余 remainingAfter 个格子的最小可能和（从小到大选可用数字）
          let minRest = 0;
          let minCount = 0;
          for (let n = 1; n <= size && minCount < remainingAfter; n++) {
            if (!cageNumbers[ci].has(n) && n !== num) {
              minRest += n;
              minCount++;
            }
          }
          // 计算剩余 remainingAfter 个格子的最大可能和（从大到小选可用数字）
          let maxRest = 0;
          let maxCount = 0;
          for (let n = size; n >= 1 && maxCount < remainingAfter; n--) {
            if (!cageNumbers[ci].has(n) && n !== num) {
              maxRest += n;
              maxCount++;
            }
          }
          // 已填 + num + 最小可能剩余 > 目标和 → 不可能达到，剪枝
          if (cageSums[ci] + num + minRest > cages[ci].sum) return false;
          // 已填 + num + 最大可能剩余 < 目标和 → 达不到，剪枝
          if (cageSums[ci] + num + maxRest < cages[ci].sum) return false;
        } else {
          // 没有剩余空格了，必须正好等于目标和
          if (cageSums[ci] + num !== cages[ci].sum) return false;
        }
      }
      return true;
    }

    // 找候选最少的空格（MRV 启发式）
    function findBestCell() {
      let bestR = -1, bestC = -1, bestCount = size + 1;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (solution[r][c] !== 0) continue;
          let count = 0;
          for (let n = 1; n <= size; n++) {
            if (isValidPlacement(r, c, n)) count++;
          }
          if (count < bestCount) {
            bestCount = count;
            bestR = r;
            bestC = c;
            if (bestCount === 0) return { r: bestR, c: bestC, count: 0 };
          }
        }
      }
      return { r: bestR, c: bestC, count: bestCount };
    }

    function backtrack() {
      if (solutionCount >= 2) return; // 找到 2 个就够了

      const { r, c, count } = findBestCell();
      if (r === -1) {
        // 找到一个解
        solutionCount++;
        if (solutionCount === 1) {
          firstSolution = deepCopyGrid(solution);
        }
        return;
      }

      if (count === 0) return; // 死路

      for (let num = 1; num <= size; num++) {
        if (!isValidPlacement(r, c, num)) continue;

        solution[r][c] = num;
        const ci = cellCageMap[r + ',' + c];
        if (ci !== undefined) {
          cageNumbers[ci].add(num);
          cageSums[ci] += num;
          cageEmptyCount[ci]--;
        }

        backtrack();

        solution[r][c] = 0;
        if (ci !== undefined) {
          cageNumbers[ci].delete(num);
          cageSums[ci] -= num;
          cageEmptyCount[ci]++;
        }

        if (solutionCount >= 2) return; // 提前退出
      }
    }

    backtrack();

    return {
      unique: solutionCount === 1,
      solutionCount: solutionCount,
      firstSolution: firstSolution
    };
  }

  // ========================================================
  //  CageFixer 主类
  // ========================================================

  class CageFixer {
    /**
     * @param {Object} options - 配置选项
     * @param {number} options.gridSize - 盘面大小 (4/6/9)
     * @param {string} options.targetDifficulty - 目标难度: easy/medium/hard/expert/master
     * @param {number} options.targetStar - 目标星级 (1-5)
     * @param {string|null} options.targetTechnique - 目标技巧（纯净关）
     * @param {number} options.minCageSize - 最小笼子大小
     * @param {number} options.maxCageSize - 最大笼子大小
     * @param {number|null} options.seed - 随机种子
     * @param {number} options.timeoutMs - 生成超时时间
     * @param {number} options.maxAttempts - 最大尝试次数
     */
    constructor(options = {}) {
      this.gridSize = options.gridSize || 9;
      this.targetDifficulty = options.targetDifficulty || 'medium';
      this.targetStar = options.targetStar || 3;
      this.targetTechnique = options.targetTechnique || null;
      this.minCageSize = options.minCageSize !== undefined ? options.minCageSize : 1;
      this.maxCageSize = options.maxCageSize || 5;
      this.seed = options.seed !== undefined ? options.seed : null;
      this.timeoutMs = options.timeoutMs || 30000;
      this.maxAttempts = options.maxAttempts || 50;

      // 加载依赖
      const deps = _loadDeps();
      this._Board = deps.Board;
      this._TechRater = deps.TechRater;
      this._LevelValidator = deps.LevelValidator;
      this._TechnicalPurityValidator = deps.TechnicalPurityValidator;

      // 内部状态
      this._rng = null;
      this._levelCounter = 0;
    }

    // ======================================================
    //  公共 API: 生成单个关卡
    // ======================================================

    /**
     * 生成一个关卡
     * 会多次尝试，返回最接近目标难度的结果
     * @returns {Object|null} 关卡数据，失败返回 null
     */
    generate() {
      const startTime = Date.now();
      let attempts = 0;
      let bestResult = null;
      let bestDiff = Infinity; // 与目标分数的差值（越小越好）

      const targetScore = (this._starToScoreMin(this.targetStar) + this._starToScoreMax(this.targetStar)) / 2;
      const minAcceptableScore = this._starToScoreMin(Math.max(1, this.targetStar - 1));
      const maxAcceptableScore = this._starToScoreMax(Math.min(5, this.targetStar + 1));

      while (attempts < this.maxAttempts) {
        attempts++;

        // 检查超时
        if (Date.now() - startTime > this.timeoutMs) {
          break;
        }

        try {
          const result = this._generateOne(attempts, startTime);
          if (result) {
            const score = result.difficultyInfo.score;
            const diff = Math.abs(score - targetScore);

            // 检查是否在可接受范围内
            const inRange = score >= minAcceptableScore && score <= maxAcceptableScore;

            if (inRange && diff < bestDiff) {
              bestResult = result;
              bestDiff = diff;

              // 如果非常接近目标，直接返回
              if (diff < 25) {
                bestResult.stats.attempts = attempts;
                bestResult.stats.generationTime = Date.now() - startTime;
                return bestResult;
              }
            } else if (!bestResult) {
              // 还没有任何结果，先存一个
              bestResult = result;
              bestDiff = diff;
            }
          }
        } catch (e) {
          console.error('[CageFixer] 生成异常:', e.message);
        }
      }

      if (bestResult) {
        bestResult.stats.attempts = attempts;
        bestResult.stats.generationTime = Date.now() - startTime;
        return bestResult;
      }

      console.error(`[CageFixer] 达到最大尝试次数 ${this.maxAttempts}，生成失败`);
      return null;
    }

    /**
     * 批量生成关卡
     * @param {number} count - 生成数量
     * @param {Object} options - 覆盖配置
     * @returns {Array} 生成的关卡数组
     */
    generateBatch(count, options = {}) {
      const results = [];
      const originalSeed = this.seed;

      for (let i = 0; i < count; i++) {
        // 每次用不同的种子
        if (originalSeed !== null) {
          this.seed = originalSeed + i * 1000;
        } else {
          this.seed = Date.now() + i;
        }
        const level = this.generate();
        if (level) {
          if (options.prefix) {
            level.levelId = `${options.prefix}-${String(i + 1).padStart(3, '0')}`;
          }
          results.push(level);
        }
      }

      this.seed = originalSeed;
      return results;
    }

    // ======================================================
    //  内部方法：单次生成尝试
    // ======================================================

    _generateOne(attempt, startTime) {
      // 初始化随机数生成器
      const seedVal = this.seed !== null ? this.seed + attempt : Date.now() + attempt;
      this._rng = createRNG(seedVal);

      // 根据目标难度调整笼子大小分布
      // 难度越高 -> 笼子越大 -> 信息越少 -> 越难
      const cageSizeWeights = this._getCageSizeWeights();

      // Step 1: 生成完整解
      const solution = generateFullSolution(this.gridSize, this._rng);
      if (!solution || solution[0][0] === 0) return null;

      // Step 2: 划分笼子（基于完整解，保证笼子内数字不重复）
      let cages = partitionCages(
        this.gridSize, solution, this._rng,
        this.minCageSize, this.maxCageSize,
        cageSizeWeights
      );
      if (!cages || cages.length === 0) return null;

      // Step 3: 计算笼子和值
      cages = computeCageSums(cages, solution);

      // Step 4 & 5: 挖洞 + 难度调节
      const puzzleResult = this._digAndTune(solution, cages, startTime);
      if (!puzzleResult) return null;

      const { grid, rating } = puzzleResult;

      // Step 6: 纯净度校验（如果指定了目标技巧）
      if (this.targetTechnique) {
        const purityOk = this._checkPurity(grid, cages);
        if (!purityOk) return null;
      }

      // 组装结果
      this._levelCounter++;
      const preFilledCount = this._countFilledCells(grid);

      return {
        levelId: 'GEN-' + String(this._levelCounter).padStart(3, '0'),
        title: `随机生成关卡 (${rating.level})`,
        gridSize: this.gridSize,
        difficulty: this._starToDifficulty(rating.level),
        boardData: grid,
        cages: cages,
        solution: solution,
        difficultyInfo: {
          level: rating.level,
          stars: this._levelToStars(rating.level),
          score: rating.score,
          techniquesUsed: Object.keys(rating.techCount || {})
        },
        stats: {
          totalCages: cages.length,
          preFilledCount: preFilledCount,
          generationTime: 0,
          attempts: attempt
        }
      };
    }

    // ======================================================
    //  挖洞 + 难度调节
    // ======================================================

    _digAndTune(solution, cages, startTime) {
      const size = this.gridSize;
      const grid = deepCopyGrid(solution);

      // 目标星级（1-5）
      const targetStar = this.targetStar;
      const targetScoreMin = this._starToScoreMin(targetStar);
      const targetScoreMax = this._starToScoreMax(targetStar);

      // 收集所有格子坐标
      const allCells = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          allCells.push([r, c]);
        }
      }

      // 打乱顺序
      let shuffledCells = shuffleArray(allCells, this._rng);

      // === 阶段 1: 随机挖洞（快速，只用 TechRater） ===
      // 先用 TechRater 快速挖出大部分洞
      // 暴力验证留到阶段2（难度调节）使用，避免初始阶段调用过多
      let digCount = 0;
      let rating = null;

      for (const [r, c] of shuffledCells) {
        if (Date.now() - startTime > this.timeoutMs * 0.35) break;

        const saved = grid[r][c];
        if (saved === 0) continue; // 已经是空的

        grid[r][c] = 0;

        // 用 TechRater 检查是否仍可解（快速路径）
        const testRating = this._rateWithTechRater(grid, cages);

        if (testRating && testRating.solvable) {
          // 逻辑可解 -> 唯一解，保留挖洞
          digCount++;
          rating = testRating;
        } else {
          // TechRater 解不出或不可解，恢复
          // （阶段1不调用暴力验证，保持快速）
          grid[r][c] = saved;
        }
      }

      // 如果还没有 rating（极端情况），评估一次
      if (!rating) {
        rating = this._rateWithTechRater(grid, cages);
      }

      if (!rating) return null;

      // === 阶段 2: 难度调节 ===

      // 当前星级
      let currentStar = this._levelToStars(rating.level);
      let bruteForceCount = 0; // 暴力验证调用计数
      const MAX_BRUTE_FORCE = 30; // 最多调用 30 次暴力验证（性能保护）

      // 情况 A: 太简单（分数低于目标下限）
      // 尝试挖更多洞，但这次优先挖"低级技巧就能确定"的格子
      if (rating.score < targetScoreMin && currentStar < targetStar) {
        // 找更多可以挖的格子
        // 策略：遍历剩余已填格，尝试挖掉，看是否还能解
        const remainingFilled = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (grid[r][c] !== 0) {
              remainingFilled.push([r, c]);
            }
          }
        }

        const shuffledRemaining = shuffleArray(remainingFilled, this._rng);

        for (const [r, c] of shuffledRemaining) {
          if (Date.now() - startTime > this.timeoutMs * 0.6) break;
          if (rating.score >= targetScoreMin) break; // 达到目标就停
          if (bruteForceCount >= MAX_BRUTE_FORCE) break; // 暴力验证次数限制

          const saved = grid[r][c];
          grid[r][c] = 0;

          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            digCount++;
            rating = testRating;
            currentStar = this._levelToStars(rating.level);
          } else {
            // TechRater 解不出，降级到暴力验证
            bruteForceCount++;
            const bruteCheck = verifyUniqueSolution(grid, cages, size);
            if (bruteCheck.unique) {
              digCount++;
              if (testRating) {
                rating = testRating;
                currentStar = this._levelToStars(rating.level);
              }
            } else {
              grid[r][c] = saved;
            }
          }
        }
      }

      // 情况 B: 太难（分数高于目标上限）
      // 回填一些数字，降低难度
      if (rating.score > targetScoreMax && currentStar > targetStar) {
        // 收集空格子
        const emptyCells = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            if (grid[r][c] === 0) {
              emptyCells.push([r, c]);
            }
          }
        }

        // 回填策略：随机回填，直到难度降到目标范围
        const shuffledEmpty = shuffleArray(emptyCells, this._rng);
        let backfillCount = 0;
        const maxBackfill = Math.floor(emptyCells.length * 0.4);

        for (const [r, c] of shuffledEmpty) {
          if (backfillCount >= maxBackfill) break;
          if (Date.now() - startTime > this.timeoutMs * 0.85) break;
          if (rating.score <= targetScoreMax) break;

          grid[r][c] = solution[r][c];
          backfillCount++;

          rating = this._rateWithTechRater(grid, cages);
          if (rating) {
            currentStar = this._levelToStars(rating.level);
          }
        }
      }

      // === 阶段 3: 最终验证 ===

      if (!rating) return null;

      // 如果 TechRater 能完全解出，说明唯一解
      if (rating.solvable) {
        return { grid, rating };
      }

      // TechRater 解不出来，用暴力验证唯一性
      const finalVerify = verifyUniqueSolution(grid, cages, size);
      if (!finalVerify.unique) return null;

      return { grid, rating };
    }

    // ======================================================
    //  用 TechRater 评估难度
    // ======================================================

    _rateWithTechRater(grid, cages) {
      try {
        const board = new this._Board(this.gridSize);
        board.loadLevel({
          cells: grid,
          cages: cages
        });

        const solver = new this._TechRater(board);
        solver.solve(2000);
        return solver.getRating();
      } catch (e) {
        console.error('[CageFixer] TechRater 评估异常:', e.message);
        return null;
      }
    }

    // ======================================================
    //  纯净度校验
    // ======================================================

    _checkPurity(grid, cages) {
      if (!this._TechnicalPurityValidator || !this.targetTechnique) return true;

      try {
        const validator = new this._TechnicalPurityValidator();
        validator.setDependencies({
          Board: this._Board,
          TechRater: this._TechRater
        });

        const result = validator.verifyPurity({
          gridSize: this.gridSize,
          boardData: grid,
          cages: cages
        }, this.targetTechnique);

        return result.isPure;
      } catch (e) {
        console.error('[CageFixer] 纯净度校验异常:', e.message);
        return false;
      }
    }

    // ======================================================
    //  辅助方法
    // ======================================================

    _countFilledCells(grid) {
      let count = 0;
      for (let r = 0; r < this.gridSize; r++) {
        for (let c = 0; c < this.gridSize; c++) {
          if (grid[r][c] !== 0) count++;
        }
      }
      return count;
    }

    _levelToStars(level) {
      const map = { '1星': 1, '2星': 2, '3星': 3, '4星': 4, '5星': 5 };
      return map[level] || 1;
    }

    _starToDifficulty(level) {
      const star = this._levelToStars(level);
      const map = {
        1: '入门',
        2: '简单',
        3: '普通',
        4: '困难',
        5: '专家'
      };
      return map[star] || '普通';
    }

    _starToScoreMin(star) {
      // 参考 tech-rater.js 的划分
      // 1星: < 250, 2星: 250-400, 3星: 400-525, 4星: 525-600, 5星: 600+
      const mins = { 1: 0, 2: 250, 3: 400, 4: 525, 5: 600 };
      return mins[star] || 400;
    }

    _starToScoreMax(star) {
      const maxs = { 1: 249, 2: 399, 3: 524, 4: 599, 5: 1000 };
      return maxs[star] || 524;
    }

    /**
     * 根据目标难度获取笼子大小权重
     * 难度越高，笼子越大（信息越少，越难）
     */
    _getCageSizeWeights() {
      const star = this.targetStar;

      // 按星级调整权重
      if (star <= 1) {
        // 1星：很多小笼子，信息充足
        return { 1: 0.20, 2: 0.35, 3: 0.25, 4: 0.15, 5: 0.05 };
      } else if (star === 2) {
        // 2星：偏中小笼子
        return { 1: 0.10, 2: 0.30, 3: 0.30, 4: 0.20, 5: 0.10 };
      } else if (star === 3) {
        // 3星：均衡分布
        return { 1: 0.05, 2: 0.20, 3: 0.30, 4: 0.25, 5: 0.20 };
      } else if (star === 4) {
        // 4星：偏中大型笼子
        return { 1: 0.02, 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 };
      } else {
        // 5星：大型笼子为主
        return { 1: 0.01, 2: 0.05, 3: 0.15, 4: 0.30, 5: 0.49 };
      }
    }
  }

  // ========================================================
  //  命令行接口
  // ========================================================

  function _parseArgs() {
    const args = process.argv.slice(2);
    const options = {
      difficulty: 'medium',
      count: 1,
      output: null,
      technique: null,
      gridSize: 9,
      seed: null,
      timeout: 30000,
      minCageSize: 1,
      maxCageSize: 5
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--difficulty':
        case '-d':
          options.difficulty = args[++i];
          break;
        case '--count':
        case '-n':
          options.count = parseInt(args[++i], 10);
          break;
        case '--output':
        case '-o':
          options.output = args[++i];
          break;
        case '--technique':
        case '-t':
          options.technique = args[++i];
          break;
        case '--size':
        case '-s':
          options.gridSize = parseInt(args[++i], 10);
          break;
        case '--seed':
          options.seed = parseInt(args[++i], 10);
          break;
        case '--timeout':
          options.timeout = parseInt(args[++i], 10);
          break;
        case '--min-cage':
          options.minCageSize = parseInt(args[++i], 10);
          break;
        case '--max-cage':
          options.maxCageSize = parseInt(args[++i], 10);
          break;
        case '--help':
        case '-h':
          _printHelp();
          process.exit(0);
          break;
      }
    }

    return options;
  }

  function _printHelp() {
    console.log(`
CageFixer v6 - 杀手数独关卡生成器

用法:
  node tools/cage-fixer-v6.js [选项]

选项:
  -d, --difficulty <level>    目标难度: easy/medium/hard/expert/master (默认: medium)
  -n, --count <number>        生成数量 (默认: 1)
  -o, --output <file>         输出文件路径 (JSON 格式)
  -t, --technique <name>      目标技巧（纯净关）
  -s, --size <number>         盘面大小: 4/6/9 (默认: 9)
  --seed <number>             随机种子
  --timeout <ms>              生成超时时间 (默认: 30000)
  --min-cage <number>         最小笼子大小 (默认: 1)
  --max-cage <number>         最大笼子大小 (默认: 5)
  -h, --help                  显示帮助

示例:
  # 生成 1 个中等难度关卡
  node tools/cage-fixer-v6.js --difficulty medium

  # 生成 5 个困难关卡并保存到文件
  node tools/cage-fixer-v6.js --difficulty hard --count 5 --output data/generated.json

  # 生成指定目标技巧的纯净关
  node tools/cage-fixer-v6.js --technique nakedPair --count 3
`);
  }

  function _difficultyToStar(difficulty) {
    const map = {
      'easy': 2,
      'medium': 3,
      'hard': 4,
      'expert': 5,
      'master': 5
    };
    return map[difficulty] || 3;
  }

  // ========================================================
  //  导出
  // ========================================================

  // 浏览器全局
  if (typeof window !== 'undefined') {
    window.CageFixer = CageFixer;
  }
  if (global) {
    global.CageFixer = CageFixer;
  }

  // CommonJS
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CageFixer };
  }

  // 命令行入口
  if (require.main === module) {
    const options = _parseArgs();

    console.log('=== CageFixer v6 - 杀手数独关卡生成器 ===\n');
    console.log(`配置: 难度=${options.difficulty}, 数量=${options.count}, 大小=${options.gridSize}x${options.gridSize}`);
    if (options.technique) console.log(`目标技巧: ${options.technique}`);
    console.log('');

    const generator = new CageFixer({
      gridSize: options.gridSize,
      targetDifficulty: options.difficulty,
      targetStar: _difficultyToStar(options.difficulty),
      targetTechnique: options.technique,
      minCageSize: options.minCageSize,
      maxCageSize: options.maxCageSize,
      seed: options.seed,
      timeoutMs: options.timeout
    });

    console.log('正在生成关卡...\n');
    const levels = generator.generateBatch(options.count, { prefix: 'GEN' });

    if (levels.length === 0) {
      console.error('生成失败，未产出任何关卡');
      process.exit(1);
    }

    console.log(`成功生成 ${levels.length} / ${options.count} 个关卡\n`);

    // 输出每个关卡的摘要
    levels.forEach((level, i) => {
      console.log(`[${i + 1}] ${level.levelId} - ${level.title}`);
      console.log(`    难度: ${level.difficultyInfo.level} (${level.difficultyInfo.score}分)`);
      console.log(`    笼子数: ${level.stats.totalCages}, 预填数: ${level.stats.preFilledCount}`);
      console.log(`    用时: ${level.stats.generationTime}ms, 尝试: ${level.stats.attempts}次`);
      console.log(`    技巧: ${level.difficultyInfo.techniquesUsed.join(', ') || '无'}`);
      console.log('');
    });

    // 保存到文件
    if (options.output) {
      const outputPath = path.resolve(options.output);
      const outputData = {
        generator: 'cage-fixer-v6',
        generatedAt: new Date().toISOString(),
        count: levels.length,
        levels: levels
      };
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
      console.log(`已保存到: ${outputPath}`);
    }
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
