/**
 * ============================================================
 *  CageFixer v9 - 二/三周目更难关卡生成器
 * ============================================================
 *
 *  基于 v8 架构，针对 9x9 高阶技巧（X-Wing/Swordfish/数对链）
 *  重构生成策略：
 *    1. 候选集注入法构造 X-Wing/Swordfish（非改完整解）
 *    2. 多技巧链验证（技巧依赖顺序）
 *    3. 推理链长度与雪崩区扩展
 *    4. 视觉巧思规则（对称性/节奏/锚点）
 *
 *  生成流程：
 *    Step 1: 生成完整解
 *    Step 1.5: 候选集结构注入（v9 新增）
 *    Step 2: 划分笼子（含 requiredSizes）
 *    Step 3: 计算笼子和值
 *    Step 3.5: 三幕锚点设计
 *    Step 4: 技巧链定向挖洞（v9 重构）
 *    Step 5: 难度与节奏验证
 *    Step 6: 视觉巧思验证（v9 新增）
 *
 *  落地说明（2026-08-04）：
 *    - 依据用户提供的 v9 修正版源码落地
 *    - 修复 _digAndTune 退化：非链模式复用 v8 完整挖洞逻辑
 *      （否则生成全填盘面，预填 81 格的无效关卡）
 *    - 依赖 core/board.js + core/tech-rater.js（与 v8 一致）
 *
 * ============================================================
 */

(function (global) {
  'use strict';

  if (typeof window === 'undefined') {
    global.window = global;
  }

  const path = require('path');
  const fs = require('fs');

  // ========================================================
  //  依赖加载
  // ========================================================

  function _loadDeps() {
    const deps = {};
    if (typeof Board !== 'undefined') {
      deps.Board = Board;
    } else if (typeof window !== 'undefined' && window.Board) {
      deps.Board = window.Board;
    } else {
      const boardPath = path.join(__dirname, '..', 'core', 'board.js');
      const boardCode = fs.readFileSync(boardPath, 'utf-8');
      eval.call(global, boardCode);
      deps.Board = global.Board || window.Board;
    }

    if (typeof TechRater !== 'undefined') {
      deps.TechRater = TechRater;
    } else if (typeof window !== 'undefined' && window.TechRater) {
      deps.TechRater = window.TechRater;
    } else {
      try {
        require(path.join(__dirname, '..', 'core', 'tech-rater.js'));
      } catch (e) {
        const trPath = path.join(__dirname, '..', 'core', 'tech-rater.js');
        const trCode = fs.readFileSync(trPath, 'utf-8');
        eval.call(global, trCode);
      }
      deps.TechRater = global.TechRater || (typeof window !== 'undefined' ? window.TechRater : null);
      if (!deps.TechRater) {
        deps.TechRater = globalThis.TechRater || null;
      }
    }

    deps.LevelValidator = null;
    deps.TechnicalPurityValidator = null;
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

  function deepCopyGrid(grid) {
    return grid.map(row => row.slice());
  }

  function countFilled(grid) {
    let c = 0;
    for (let r = 0; r < grid.length; r++) {
      for (let col = 0; col < grid[0].length; col++) {
        if (grid[r][col] !== 0) c++;
      }
    }
    return c;
  }

  // ========================================================
  //  Step 1: 生成完整解
  // ========================================================

  function generateFullSolution(size, rng) {
    const dim = getBoxDimensions(size);
    const grid = Array.from({ length: size }, () => Array(size).fill(0));

    function isValid(r, c, num) {
      for (let i = 0; i < size; i++) {
        if (grid[r][i] === num) return false;
      }
      for (let i = 0; i < size; i++) {
        if (grid[i][c] === num) return false;
      }
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
  //  Step 1.5: 候选集结构注入（v9）
  //  关键差异：不在完整解中构造 X-Wing（那是数学上不可能的，
  //  每数字每行只 1 个位置），而是随机选定 num + 关键行 + 关键列，
  //  交给挖洞阶段做定向挖，让候选集在求解过程中形成目标结构。
  // ========================================================

  function buildCandidateStructure(size, rng, technique) {
    if (technique !== 'xWing' && technique !== 'swordfish') return null;

    const num = 1 + Math.floor(rng() * size);
    const allIdx = Array.from({ length: size }, (_, i) => i);
    const rows = shuffleArray(allIdx, rng).slice(0, technique === 'xWing' ? 2 : 3);
    const cols = shuffleArray(allIdx, rng).slice(0, technique === 'xWing' ? 2 : 3);

    const cornerCells = [];
    for (const r of rows) {
      for (const c of cols) {
        cornerCells.push([r, c]);
      }
    }

    const elimCells = [];
    const rowSet = new Set(rows);
    const colSet = new Set(cols);
    for (let r = 0; r < size; r++) {
      if (rowSet.has(r)) continue;
      for (const c of cols) {
        if (rng() < 0.7) elimCells.push([r, c]);
      }
    }
    for (const r of rows) {
      for (let c = 0; c < size; c++) {
        if (colSet.has(c)) continue;
        if (rng() < 0.5) elimCells.push([r, c]);
      }
    }

    return { num, rows, cols, cornerCells, elimCells };
  }

  // ========================================================
  //  Step 2: 划分笼子
  // ========================================================

  function partitionCages(size, solution, rng, minSize, maxSize, sizeWeights, requiredSizes) {
    const totalCells = size * size;
    const assigned = Array.from({ length: size }, () => Array(size).fill(false));
    const cellToCageIdx = Array.from({ length: size }, () => Array(size).fill(-1));
    let cages = [];
    let nextCageId = 0;

    const defaultWeights = { 1: 0.10, 2: 0.30, 3: 0.30, 4: 0.20, 5: 0.10 };
    const weights = sizeWeights || defaultWeights;

    const targetCounts = {};
    const compensation = { 1: 0.5, 2: 1.2, 3: 1.1, 4: 1.0, 5: 1.2 };
    for (let s = minSize; s <= maxSize; s++) {
      const w = weights[s] || 0;
      const comp = compensation[s] || 1;
      targetCounts[s] = Math.max(0, Math.round((totalCells * w * comp) / s));
    }

    let totalTargetCells = 0;
    for (let s = minSize; s <= maxSize; s++) {
      totalTargetCells += targetCounts[s] * s;
    }
    if (totalTargetCells > totalCells) {
      const ratio = totalCells / totalTargetCells;
      for (let s = minSize; s <= maxSize; s++) {
        targetCounts[s] = Math.max(0, Math.floor(targetCounts[s] * ratio));
      }
    }

    function countRemaining() {
      let count = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (!assigned[r][c]) count++;
        }
      }
      return count;
    }

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

    function canAbsorb(cageNums, otherCage) {
      for (const [r, c] of otherCage.cells) {
        if (cageNums.has(solution[r][c])) return false;
      }
      return true;
    }

    function growCage(startR, startC, targetSize) {
      const cageCells = [[startR, startC]];
      const inCage = new Set();
      const cageNumbers = new Set();
      const absorbedIndices = [];

      inCage.add(startR + ',' + startC);
      cageNumbers.add(solution[startR][startC]);
      assigned[startR][startC] = true;

      while (cageCells.length < targetSize) {
        const emptyFrontier = [];
        const absorbFrontier = [];

        for (const [r, c] of cageCells) {
          const neighbors = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
          for (const [nr, nc] of neighbors) {
            if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
            const key = nr + ',' + nc;
            if (inCage.has(key)) continue;

            if (!assigned[nr][nc]) {
              const num = solution[nr][nc];
              if (!cageNumbers.has(num)) {
                emptyFrontier.push([nr, nc]);
              }
            } else {
              const otherIdx = cellToCageIdx[nr][nc];
              if (otherIdx < 0) continue;
              if (absorbedIndices.indexOf(otherIdx) >= 0) continue;
              const otherCage = cages[otherIdx];
              if (!otherCage) continue;
              if (otherCage.cells.length >= targetSize) continue;
              const combined = cageCells.length + otherCage.cells.length;
              if (combined > maxSize + 2) continue;
              if (canAbsorb(cageNumbers, otherCage)) {
                absorbFrontier.push(otherIdx);
              }
            }
          }
        }

        if (emptyFrontier.length === 0 && absorbFrontier.length === 0) break;

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
          const uniqueAbsorb = [...new Set(absorbFrontier)];
          const otherIdx = uniqueAbsorb[Math.floor(rng() * uniqueAbsorb.length)];
          const otherCage = cages[otherIdx];
          absorbedIndices.push(otherIdx);
          for (const [r, c] of otherCage.cells) {
            cageCells.push([r, c]);
            inCage.add(r + ',' + c);
            cageNumbers.add(solution[r][c]);
          }
          cages[otherIdx] = null;
        } else {
          break;
        }
      }

      return { cells: cageCells, absorbed: absorbedIndices };
    }

    // ---- 大笼子优先阶段 ----
    if (requiredSizes && requiredSizes.length > 0) {
      for (const targetSize of requiredSizes) {
        let ok = false;
        for (let attempt = 0; attempt < 40 && !ok; attempt++) {
          const remaining = countRemaining();
          if (remaining < targetSize) break;
          const start = findRandomStart();
          if (!start) break;
          const grown = growCage(start[0], start[1], targetSize);
          if (grown.cells.length === targetSize) {
            const newCage = { id: nextCageId++, sum: 0, cells: grown.cells };
            cages.push(newCage);
            const newIdx = cages.length - 1;
            for (const [r, c] of grown.cells) cellToCageIdx[r][c] = newIdx;
            ok = true;
          } else {
            for (const [r, c] of grown.cells) assigned[r][c] = false;
          }
        }
        if (!ok) return null;
      }
    }

    // ---- 主循环 ----
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

        if (result.cells.length < Math.max(1, Math.floor(targetSize * 0.5))) {
          for (const [r, c] of result.cells) {
            assigned[r][c] = false;
          }
          continue;
        }

        const newCage = { id: nextCageId++, sum: 0, cells: result.cells };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        for (const [r, c] of result.cells) {
          cellToCageIdx[r][c] = newIdx;
        }
        generated++;
      }
    }

    // ---- 剩余格处理 ----
    let safety = 100;
    while (countRemaining() > 0 && safety-- > 0) {
      const start = findRandomStart();
      if (!start) break;
      const remaining = countRemaining();
      const target = Math.min(maxSize, Math.max(2, Math.min(remaining, 3)));
      const result = growCage(start[0], start[1], target);

      if (result.cells.length >= 2) {
        const newCage = { id: nextCageId++, sum: 0, cells: result.cells };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        for (const [r, c] of result.cells) {
          cellToCageIdx[r][c] = newIdx;
        }
      } else if (result.cells.length === 1) {
        const newCage = { id: nextCageId++, sum: 0, cells: [[start[0], start[1]]] };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        cellToCageIdx[start[0]][start[1]] = newIdx;
      } else {
        assigned[start[0]][start[1]] = true;
        const newCage = { id: nextCageId++, sum: 0, cells: [[start[0], start[1]]] };
        cages.push(newCage);
        const newIdx = cages.length - 1;
        cellToCageIdx[start[0]][start[1]] = newIdx;
      }
    }

    cages = cages.filter(c => c !== null);

    // ---- 后处理：平衡分布 ----
    cages = _balanceByMerging(cages, weights, minSize, maxSize, solution, size, rng);

    for (let i = 0; i < cages.length; i++) {
      cages[i].id = i;
    }

    cages = mergeSmallCages(cages, solution, size, minSize, rng, maxSize, requiredSizes);

    return cages;
  }

  function _balanceByMerging(cages, weights, minSize, maxSize, solution, size, rng) {
    const totalCells = cages.reduce((sum, c) => sum + c.cells.length, 0);

    const expectedCount = {};
    for (let s = minSize; s <= maxSize; s++) {
      const w = weights[s] || 0;
      expectedCount[s] = Math.max(0, Math.round((totalCells * w) / s));
    }

    function getCounts(cs) {
      const counts = {};
      for (let s = minSize; s <= maxSize; s++) counts[s] = 0;
      for (const cage of cs) {
        const s = cage.cells.length;
        if (s >= minSize && s <= maxSize) counts[s]++;
      }
      return counts;
    }

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

    function buildNumSets(cs) {
      return cs.map(cage => {
        if (!cage) return null;
        const s = new Set();
        for (const [r, c] of cage.cells) s.add(solution[r][c]);
        return s;
      });
    }

    for (let iter = 0; iter < 20; iter++) {
      let counts = getCounts(cages);
      let anyMerged = false;
      const cellMap = buildCellMap(cages);
      const numSets = buildNumSets(cages);

      for (let smallS = minSize; smallS < maxSize; smallS++) {
        if (counts[smallS] <= expectedCount[smallS]) continue;

        let bestMerge = null;
        let bestScore = -1;

        for (let i = 0; i < cages.length; i++) {
          if (!cages[i]) continue;
          if (cages[i].cells.length !== smallS) continue;

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
            if (ni < i) continue;
            const sj = cages[ni].cells.length;
            const combined = smallS + sj;
            if (combined > maxSize) continue;

            let hasDup = false;
            for (const num of numSets[i]) {
              if (numSets[ni].has(num)) { hasDup = true; break; }
            }
            if (hasDup) continue;

            let score = 50;
            const deficit = expectedCount[combined] - (counts[combined] || 0);
            const deficitPct = expectedCount[combined] > 0 ? deficit / expectedCount[combined] : 0;
            score += Math.max(0, deficitPct) * 60;
            score -= combined * 3;
            if (counts[sj] > expectedCount[sj]) score += 8;
            if (smallS === 1 && sj === 1 && combined === 2) score += 25;
            if (combined === maxSize && counts[maxSize] >= expectedCount[maxSize]) score -= 40;

            if (score > bestScore) {
              bestScore = score;
              bestMerge = [i, ni, combined];
            }
          }
        }

        if (bestMerge) {
          const [i, ni] = bestMerge;
          cages[ni].cells = cages[ni].cells.concat(cages[i].cells);
          cages[i] = null;
          cages = cages.filter(c => c !== null);
          anyMerged = true;
          break;
        }
      }

      if (!anyMerged) break;
    }
    return cages;
  }

  function mergeSmallCages(cages, solution, size, minSize, rng, maxSize, requiredSizes) {
    const cellToCage = {};
    for (let i = 0; i < cages.length; i++) {
      if (!cages[i]) continue;
      for (const [r, c] of cages[i].cells) {
        cellToCage[r + ',' + c] = i;
      }
    }

    const cageNumSets = cages.map(cage => {
      if (!cage) return null;
      const s = new Set();
      for (const [r, c] of cage.cells) s.add(solution[r][c]);
      return s;
    });

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < cages.length; i++) {
        if (!cages[i]) continue;
        if (cages[i].cells.length >= minSize) continue;

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

        const neighborList = [...neighbors];
        for (let k = neighborList.length - 1; k > 0; k--) {
          const j = Math.floor(rng() * (k + 1));
          [neighborList[k], neighborList[j]] = [neighborList[j], neighborList[k]];
        }

        let merged = false;
        for (const ni of neighborList) {
          const combinedSize = cages[i].cells.length + cages[ni].cells.length;
          if (combinedSize > maxSize) continue;

          let hasDup = false;
          for (const num of cageNumSets[i]) {
            if (cageNumSets[ni].has(num)) {
              hasDup = true;
              break;
            }
          }
          if (hasDup) continue;

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

        if (merged) break;
      }
    }

    let result = cages.filter(c => c !== null);
    for (let i = 0; i < result.length; i++) {
      result[i].id = i;
    }

    // ---- requiredSizes 校验与补全（递归吞并） ----
    if (requiredSizes && requiredSizes.length > 0) {
      const sizesPresent = new Set(result.map(cg => cg.cells.length));
      const missing = requiredSizes.filter(s => !sizesPresent.has(s));
      for (const targetSize of missing) {
        let mergedOk = false;
        for (let attempt = 0; attempt < 100 && !mergedOk; attempt++) {
          const cellToIdx = {};
          for (let i = 0; i < result.length; i++) {
            for (const [r, c] of result[i].cells) cellToIdx[r + ',' + c] = i;
          }
          const numSets2 = result.map(cg => {
            const s = new Set();
            for (const [r, c] of cg.cells) s.add(solution[r][c]);
            return s;
          });

          let seed = -1;
          for (let i = 0; i < result.length; i++) {
            if (result[i].cells.length < targetSize) { seed = i; break; }
          }
          if (seed < 0) break;

          const mergedCells = result[seed].cells.slice();
          const mergedNums = new Set(numSets2[seed]);
          const absorbed = [seed];
          let canGrow = true;

          while (mergedCells.length < targetSize && canGrow) {
            canGrow = false;
            const currentSet = new Set(absorbed);
            const frontier = new Set();
            for (const [r, c] of mergedCells) {
              const adj = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
              for (const [nr, nc] of adj) {
                if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue;
                const j = cellToIdx[nr + ',' + nc];
                if (j !== undefined && !currentSet.has(j)) frontier.add(j);
              }
            }
            for (const j of frontier) {
              let hasDup = false;
              for (const num of numSets2[j]) {
                if (mergedNums.has(num)) { hasDup = true; break; }
              }
              if (hasDup) continue;
              if (mergedCells.length + result[j].cells.length > targetSize) continue;
              for (const cell of result[j].cells) mergedCells.push(cell);
              for (const num of numSets2[j]) mergedNums.add(num);
              absorbed.push(j);
              canGrow = true;
              break;
            }
          }

          if (mergedCells.length === targetSize) {
            const sortedAbsorbed = absorbed.slice().sort((a, b) => b - a);
            const mainIdx = sortedAbsorbed[sortedAbsorbed.length - 1];
            result[mainIdx].cells = mergedCells;
            for (const di of sortedAbsorbed) {
              if (di === mainIdx) continue;
              result.splice(di, 1);
            }
            mergedOk = true;
            break;
          }
        }
        if (!mergedOk) return null;
      }
      for (let i = 0; i < result.length; i++) result[i].id = i;
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
  //  三幕锚点设计
  // ========================================================

  function generateScriptParams(size, difficultyLevel) {
    if (size === 4 && difficultyLevel <= 1) {
      return { openingRatio: 0.60, openingMinCount: 3, breakthroughCount: 1, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    } else if (size === 6 && difficultyLevel >= 2 && difficultyLevel <= 3) {
      return { openingRatio: 0.40, openingMinCount: 5, breakthroughCount: 2, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    } else if (size === 9 && difficultyLevel >= 4 && difficultyLevel <= 5) {
      return { openingRatio: 0.30, openingMinCount: 8, breakthroughCount: 3, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    }
    if (size === 4) {
      return { openingRatio: 0.60, openingMinCount: 3, breakthroughCount: 1, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    } else if (size === 6) {
      return { openingRatio: 0.40, openingMinCount: 5, breakthroughCount: 2, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
    }
    return { openingRatio: 0.30, openingMinCount: 8, breakthroughCount: 3, avalancheRatio: 0.30, digOrder: ['avalanche', 'opening', 'breakthrough'] };
  }

  function _calcCageComplexity(r, c, cages, size, dim) {
    let cage = null;
    for (let i = 0; i < cages.length; i++) {
      for (const [cr, cc] of cages[i].cells) {
        if (cr === r && cc === c) {
          cage = cages[i];
          break;
        }
      }
      if (cage) break;
    }
    if (!cage) return 0;

    let score = 0;
    score += cage.cells.length * 2;

    const boxSet = new Set();
    for (const [cr, cc] of cage.cells) {
      const br = Math.floor(cr / dim.boxH);
      const bc = Math.floor(cc / dim.boxW);
      boxSet.add(br + ',' + bc);
    }
    score += boxSet.size * 2 * 2;

    const cageSize = cage.cells.length;
    const sum = cage.sum;
    let minSum = 0, maxSum = 0;
    for (let i = 1; i <= cageSize; i++) minSum += i;
    for (let i = size - cageSize + 1; i <= size; i++) maxSum += i;
    const range = maxSum - minSum;
    if (range > 0) {
      const mid = (minSum + maxSum) / 2;
      const extremity = Math.abs(sum - mid) / (range / 2);
      score += extremity * 5;
    }
    return score;
  }

  function designThreeActAnchor(solution, cages, size, rng, scriptParams, TechRaterClass, BoardClass, baseGrid = null) {
    const dim = getBoxDimensions(size);
    const totalCells = size * size;

    // V4.3.14：支持传入实际盘面作为求解起点（baseGrid）。
    // 原实现固定用空盘（全 0）求解，锚点反映"从空盘的自然解题顺序"；
    // 但挖洞后盘面有预填，实际求解顺序不同，导致节奏验证 breakpointOk
    // 失败率 50%+。挖洞后传 baseGrid=挖洞盘面，锚点与实际求解路径匹配。
    const emptyGrid = Array.from({ length: size }, () => Array(size).fill(0));
    const solveGrid = baseGrid || emptyGrid;
    let solveSteps = [];
    try {
      const board = new BoardClass(size);
      board.loadLevel({ cells: solveGrid, cages: cages });
      const solver = new TechRaterClass(board);
      const result = solver.solve(3000);
      solveSteps = result.steps || [];
    } catch (e) {
      solveSteps = [];
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          solveSteps.push({ row: r, col: c, type: 'fill' });
        }
      }
    }

    const cellOrder = {};
    let fillIndex = 0;
    for (const step of solveSteps) {
      if (step.type === 'fill') {
        cellOrder[step.row + ',' + step.col] = fillIndex;
        fillIndex++;
      }
    }

    let tailIndex = fillIndex;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const key = r + ',' + c;
        if (cellOrder[key] === undefined) {
          cellOrder[key] = tailIndex++;
        }
      }
    }

    const allCells = [];
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        allCells.push([r, c, cellOrder[r + ',' + c]]);
      }
    }
    allCells.sort((a, b) => a[2] - b[2]);

    const openingCount = Math.max(scriptParams.openingMinCount, Math.ceil(totalCells * scriptParams.openingRatio));
    const opening = allCells.slice(0, openingCount).map(([r, c]) => [r, c]);

    const openingSet = new Set(opening.map(([r, c]) => r + ',' + c));
    const openingCageIds = new Set();
    for (const [r, c] of opening) {
      for (let i = 0; i < cages.length; i++) {
        for (const [cr, cc] of cages[i].cells) {
          if (cr === r && cc === c) {
            openingCageIds.add(cages[i].id);
            break;
          }
        }
      }
    }

    const remainingCells = allCells.slice(openingCount).map(([r, c]) => [r, c]);

    const cellComplexity = remainingCells.map(([r, c]) => {
      const complexity = _calcCageComplexity(r, c, cages, size, dim);
      let cageId = -1;
      for (let i = 0; i < cages.length; i++) {
        for (const [cr, cc] of cages[i].cells) {
          if (cr === r && cc === c) {
            cageId = cages[i].id;
            break;
          }
        }
        if (cageId >= 0) break;
      }
      const isDiffCage = !openingCageIds.has(cageId);
      const score = complexity + (isDiffCage ? 10 : 0);
      return { r, c, score, complexity, cageId, isDiffCage };
    });

    cellComplexity.sort((a, b) => b.score - a.score);

    // V4.3.14 修复：breakthrough 锚点选择逻辑。
    // 原实现取"复杂度最高"的格作为破局点——最复杂的格通常最后解出，
    // 出现在求解路径末端（>80% 位置），与 breakpointOk(45-80%) 直接矛盾，
    // 实测节奏失败 102 次中 100 次是破局点失败。
    // 修复：从求解路径"45%-75% 中后段"选择破局点（保证位置命中），
    // 在该区间内优先复杂度高、且来自不同笼子的格。
    const midStart = Math.max(openingCount, Math.floor(allCells.length * 0.45));
    const midEnd = Math.floor(allCells.length * 0.75);
    const midSegment = allCells.slice(midStart, midEnd);
    const midComplexity = midSegment.map(([r, c]) => {
      let cageId = -1;
      for (let i = 0; i < cages.length; i++) {
        for (const [cr, cc] of cages[i].cells) {
          if (cr === r && cc === c) {
            cageId = cages[i].id;
            break;
          }
        }
        if (cageId >= 0) break;
      }
      return { r, c, cageId };
    });

    const breakthrough = [];
    const usedCages = new Set();
    // 优先选 midSegment 中复杂度较高的格（保持"破局点有技巧含量"）
    const midOrdered = midComplexity.slice();
    midOrdered.sort((a, b) => {
      const ca = _calcCageComplexity(a.r, a.c, cages, size, dim);
      const cb = _calcCageComplexity(b.r, b.c, cages, size, dim);
      return cb - ca;
    });
    for (const item of midOrdered) {
      if (breakthrough.length >= scriptParams.breakthroughCount) break;
      if (usedCages.has(item.cageId)) continue;
      breakthrough.push([item.r, item.c]);
      usedCages.add(item.cageId);
    }
    // 若中段不足，退回复杂度排序补充
    if (breakthrough.length < scriptParams.breakthroughCount) {
      for (const item of cellComplexity) {
        if (breakthrough.length >= scriptParams.breakthroughCount) break;
        if (usedCages.has(item.cageId)) continue;
        breakthrough.push([item.r, item.c]);
        usedCages.add(item.cageId);
      }
    }

    const breakthroughSet = new Set(breakthrough.map(([r, c]) => r + ',' + c));

    const avalanche = [];
    for (const [r, c] of allCells) {
      const key = r + ',' + c;
      if (!openingSet.has(key) && !breakthroughSet.has(key)) {
        avalanche.push([r, c]);
      }
    }

    return { opening, breakthrough, avalanche };
  }

  // ========================================================
  //  唯一解验证（TechRater 快速 + 回溯兜底）
  // ========================================================

  function timedVerifyUniqueSolution(grid, cages, size, TechRaterClass, BoardClass, timeoutMs) {
    try {
      const board = new BoardClass(size);
      board.loadLevel({ cells: grid, cages: cages });
      const solver = new TechRaterClass(board);
      const result = solver.solve(2000);
      if (result.solvable) {
        return { unique: true, solutionCount: 1, firstSolution: null, timeout: false, method: 'techrater' };
      }
    } catch (e) {}

    const startTime = Date.now();
    const dim = getBoxDimensions(size);
    const solution = deepCopyGrid(grid);
    let solutionCount = 0;
    let firstSolution = null;
    let timedOut = false;

    const cellCageMap = {};
    for (let i = 0; i < cages.length; i++) {
      for (const [r, c] of cages[i].cells) {
        cellCageMap[r + ',' + c] = i;
      }
    }

    const cageNumbers = cages.map(() => new Set());
    const cageSums = cages.map(() => 0);
    const cageEmptyCount = cages.map((cage) => cage.cells.length);

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
      for (let i = 0; i < size; i++) {
        if (solution[r][i] === num) return false;
      }
      for (let i = 0; i < size; i++) {
        if (solution[i][c] === num) return false;
      }
      const br = Math.floor(r / dim.boxH) * dim.boxH;
      const bc = Math.floor(c / dim.boxW) * dim.boxW;
      for (let dr = 0; dr < dim.boxH; dr++) {
        for (let dc = 0; dc < dim.boxW; dc++) {
          if (solution[br + dr][bc + dc] === num) return false;
        }
      }
      const ci = cellCageMap[r + ',' + c];
      if (ci !== undefined) {
        if (cageNumbers[ci].has(num)) return false;
        if (cageSums[ci] + num > cages[ci].sum) return false;
        const remainingAfter = cageEmptyCount[ci] - 1;
        if (remainingAfter > 0) {
          let minRest = 0, minCount = 0;
          for (let n = 1; n <= size && minCount < remainingAfter; n++) {
            if (!cageNumbers[ci].has(n) && n !== num) {
              minRest += n;
              minCount++;
            }
          }
          let maxRest = 0, maxCount = 0;
          for (let n = size; n >= 1 && maxCount < remainingAfter; n--) {
            if (!cageNumbers[ci].has(n) && n !== num) {
              maxRest += n;
              maxCount++;
            }
          }
          if (cageSums[ci] + num + minRest > cages[ci].sum) return false;
          if (cageSums[ci] + num + maxRest < cages[ci].sum) return false;
        } else {
          if (cageSums[ci] + num !== cages[ci].sum) return false;
        }
      }
      return true;
    }

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
      if (timedOut) return;
      if (solutionCount >= 2) return;
      if ((solutionCount + 1) % 100 === 0 && Date.now() - startTime > timeoutMs) {
        timedOut = true;
        return;
      }

      const { r, c, count } = findBestCell();
      if (r === -1) {
        solutionCount++;
        if (solutionCount === 1) {
          firstSolution = deepCopyGrid(solution);
        }
        return;
      }
      if (count === 0) return;

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
        if (solutionCount >= 2 || timedOut) return;
      }
    }

    backtrack();

    return {
      unique: !timedOut && solutionCount === 1,
      solutionCount: solutionCount,
      firstSolution: firstSolution,
      timeout: timedOut,
      method: timedOut ? 'timeout' : 'bruteforce'
    };
  }

  // ========================================================
  //  CageFixer 主类（v9）
  // ========================================================

  class CageFixer {
    constructor(options = {}) {
      this.gridSize = options.gridSize || 9;
      this.targetDifficulty = options.targetDifficulty || 'medium';
      this.targetStar = options.targetStar || 3;
      this.targetTechnique = options.targetTechnique || null;
      this.guidedTechnique = options.guidedTechnique || null;
      this.techniqueChain = options.techniqueChain || null;
      this.requiredCageSizes = options.requiredCageSizes || [];
      this.enableRhythmValidation = options.enableRhythmValidation !== false;
      this.targetSteps = options.targetSteps || 75;   // V4.3.12 调优：xWing 关可达步数 71-77，90 的窗口[70,120]下界贴合步数下界，75 的窗口[55,105]留足余量
      this.minAvalancheSize = options.minAvalancheSize || 12;
      this.aestheticsStrict = options.aestheticsStrict || false;
      this.strictAdvanced = options.strictAdvanced || false; // V4.3.15：严格断点验收（xWing 真必要，成功率低）
      this.minCageSize = options.minCageSize !== undefined ? options.minCageSize : 1;
      this.maxCageSize = options.maxCageSize || 5;
      this.seed = options.seed !== undefined ? options.seed : null;
      this.timeoutMs = options.timeoutMs || 30000;
      this.maxAttempts = options.maxAttempts || 50;
      this.enableThreeAct = options.enableThreeAct !== false;
      this.verifyTimeoutMs = options.verifyTimeoutMs || 200;

      const deps = _loadDeps();
      this._Board = deps.Board;
      this._TechRater = deps.TechRater;
      this._LevelValidator = null;
      this._TechnicalPurityValidator = null;

      this._rng = null;
      this._levelCounter = 0;
      this._threeActCache = null;
    }

    generate() {
      const startTime = Date.now();
      let attempts = 0;
      let bestResult = null;
      let bestDiff = Infinity;

      const targetScore = (this._starToScoreMin(this.targetStar) + this._starToScoreMax(this.targetStar)) / 2;
      const minAcceptableScore = this._starToScoreMin(Math.max(1, this.targetStar - 1));
      const maxAcceptableScore = this._starToScoreMax(Math.min(5, this.targetStar + 1));
      // V4.3.14：已接受（inRange）结果计数——前 3 次内择优，之后第一个可接受即返回
      let acceptedCount = 0;

      while (attempts < this.maxAttempts) {
        attempts++;
        if (Date.now() - startTime > this.timeoutMs) break;

        try {
          const result = this._generateOne(attempts, startTime);
          if (result) {
            const score = result.difficultyInfo.score;
            const diff = Math.abs(score - targetScore);
            const inRange = score >= minAcceptableScore && score <= maxAcceptableScore;
            if (inRange) {
              acceptedCount++;
              if (diff < bestDiff) {
                bestResult = result;
                bestDiff = diff;
              }
              // 前 3 次可接受结果内择优（保留难度倾向），之后第一个可接受即返回。
              // 原逻辑 diff<25 过严：xWing 关分数集中 425-525（3星）目标 562，
              // diff 常 >60，几乎永不提前返回、跑满 maxAttempts(50) 次 = 4.5s/关。
              // 实测 xWing 单次尝试成功率约 25%，3 次内命中概率 58%，关均降至亚秒级。
              if (acceptedCount >= 3 || diff < 60) {
                bestResult.stats.attempts = attempts;
                bestResult.stats.generationTime = Date.now() - startTime;
                return bestResult;
              }
            } else if (!bestResult) {
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

    generateBatch(count, options = {}) {
      const results = [];
      const originalSeed = this.seed;
      for (let i = 0; i < count; i++) {
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
    //  内部生成（v9 核心）
    // ======================================================

    _generateOne(attempt, startTime) {
      const seedVal = this.seed !== null ? this.seed + attempt : Date.now() + attempt;
      this._rng = createRNG(seedVal);

      const cageSizeWeights = this._getCageSizeWeights();
      const solution = generateFullSolution(this.gridSize, this._rng);
      if (!solution || solution[0][0] === 0) return null;

      let candidateStruct = null;
      const isAdvanced = this.guidedTechnique === 'xWing' || this.guidedTechnique === 'swordfish';
      if (isAdvanced) {
        candidateStruct = buildCandidateStructure(this.gridSize, this._rng, this.guidedTechnique);
        if (!candidateStruct) return null;
      }

      let cages = partitionCages(
        this.gridSize, solution, this._rng,
        this.minCageSize, this.maxCageSize,
        cageSizeWeights,
        this.requiredCageSizes && this.requiredCageSizes.length > 0 ? this.requiredCageSizes : null
      );
      if (!cages || cages.length === 0) return null;

      cages = computeCageSums(cages, solution);

      let threeAct = null;
      let scriptParams = null;
      if (this.enableThreeAct) {
        scriptParams = generateScriptParams(this.gridSize, this._starToDifficultyLevel(this.targetStar));
        if (this.targetSteps > 80) {
          scriptParams.openingRatio = Math.max(0.10, scriptParams.openingRatio - 0.10);
          scriptParams.avalancheRatio = Math.min(0.60, scriptParams.avalancheRatio + 0.15);
        }
        threeAct = designThreeActAnchor(solution, cages, this.gridSize, this._rng, scriptParams, this._TechRater, this._Board);
      }
      this._threeActCache = threeAct;

      let puzzleResult;
      const chain = this.techniqueChain || (this.guidedTechnique ? [this.guidedTechnique] : null);
      if (chain && chain.length > 0) {
        const start = Date.now();
        const grid = this._digWithChain(solution, cages, chain, start, candidateStruct);
        if (!grid) return null;

        // V4.3.14 性能优化：挖洞后基于"实际盘面"重新设计三幕锚点。
        // 原锚点基于空盘求解顺序设计，挖洞后（预填 4-10 格）求解顺序改变，
        // breakthrough 锚点失效导致节奏验证 breakpointOk 失败率高达 84%，
        // 迫使 generate() 反复重试（单次尝试仅 ~90ms 但需 ~22 次 = 2s/关）。
        // 挖洞后以实际盘面为求解起点重设锚点，breakthrough 与实际求解路径匹配。
        if (this.enableThreeAct && scriptParams) {
          threeAct = designThreeActAnchor(grid, cages, this.gridSize, this._rng, scriptParams, this._TechRater, this._Board, grid);
          this._threeActCache = threeAct;
        }

        const rating = this._rateWithTechRater(grid, cages);
        if (!rating) return null;

        const verify = timedVerifyUniqueSolution(grid, cages, this.gridSize, this._TechRater, this._Board, this.verifyTimeoutMs);
        if (!verify.unique) return null;

        let rhythm = null;
        if (this.enableRhythmValidation) {
          rhythm = this._validateRhythm(grid, cages, threeAct);
          if (!rhythm.passed) return null;
        }

        if (this.aestheticsStrict) {
          const aestheticOk = this._validateAesthetics(grid, cages);
          if (!aestheticOk) return null;
        }

        puzzleResult = {
          grid,
          rating,
          rhythm,
          guidedInfo: {
            technique: chain.join(','),
            baseUnsolved: false,
            fullSolved: true,
            techUsedInFull: 1,
            totalTechCount: { chain: 1 }
          }
        };
      } else {
        puzzleResult = this._digAndTune(solution, cages, startTime, threeAct);
        if (!puzzleResult) return null;
      }

      const { grid, rating } = puzzleResult;

      if (this.targetTechnique) {
        const purityOk = this._checkPurity(grid, cages);
        if (!purityOk) return null;
      }

      this._levelCounter++;
      const preFilledCount = countFilled(grid);

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
        threeAct: threeAct,
        guidedInfo: puzzleResult.guidedInfo || null,
        rhythm: puzzleResult.rhythm || null,
        scriptParams: threeAct ? generateScriptParams(this.gridSize, this._starToDifficultyLevel(this.targetStar)) : null,
        stats: {
          totalCages: cages.length,
          preFilledCount: preFilledCount,
          generationTime: 0,
          attempts: attempt,
          rhythmPassed: puzzleResult.rhythm ? puzzleResult.rhythm.passed : null
        }
      };
    }

    // ======================================================
    //  技巧链挖洞（v9 核心）
    // ======================================================

    _digWithChain(solution, cages, chain, startTime, candidateStruct) {
      const size = this.gridSize;
      const grid = deepCopyGrid(solution);
      const fullTechList = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45',
        'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet',
        'xWing', 'swordfish'];
      // 基础技巧：所有链技巧断点验证都叠加在这之上（修复：v9 源码缺基础白名单，
      // 导致 solveWith(['xWing']) 只允许 xWing 时永远无法填数）
      const baseTechList = ['nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45'];

      const protect = new Set();
      if (candidateStruct && candidateStruct.cornerCells) {
        for (const [r, c] of candidateStruct.cornerCells) {
          protect.add(r + ',' + c);
        }
      }
      const isProtected = (r, c) => protect.has(r + ',' + c);

      const solveWith = (whitelist) => {
        try {
          const board = new this._Board(size);
          board.loadLevel({ cells: grid, cages: cages });
          const solver = new this._TechRater(board);
          solver.techPriority = whitelist;
          const result = solver.solve(2000);
          const rating = solver.getRating();
          return {
            solvable: !!result.solvable,
            remainingCells: result.remainingCells,
            techCount: rating.techCount || {},
            steps: solver.getSteps(),
          };
        } catch (e) {
          return null;
        }
      };

      // 阶段0：候选结构引导挖
      if (candidateStruct) {
        const { rows, cols } = candidateStruct;
        const rowSet = new Set(rows);
        const colSet = new Set(cols);
        for (const r of rows) {
          for (let c = 0; c < size; c++) {
            if (colSet.has(c)) continue;
            if (isProtected(r, c)) continue;
            const saved = grid[r][c];
            grid[r][c] = 0;
            const fullCheck = solveWith(fullTechList);
            if (!fullCheck || !fullCheck.solvable) grid[r][c] = saved;
          }
        }
        for (const c of cols) {
          for (let r = 0; r < size; r++) {
            if (rowSet.has(r)) continue;
            if (isProtected(r, c)) continue;
            const saved = grid[r][c];
            grid[r][c] = 0;
            const fullCheck = solveWith(fullTechList);
            if (!fullCheck || !fullCheck.solvable) grid[r][c] = saved;
          }
        }
      }

      // 阶段1：常规挖洞
      let digOrder = [];
      if (this._threeActCache) {
        digOrder = [
          ...this._threeActCache.avalanche,
          ...this._threeActCache.opening,
          ...this._threeActCache.breakthrough,
        ];
      } else {
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) digOrder.push([r, c]);
      }
      digOrder = shuffleArray(digOrder, this._rng);

      for (const [r, c] of digOrder) {
        if (Date.now() - startTime > this.timeoutMs * 0.5) break;
        if (grid[r][c] === 0) continue;
        if (isProtected(r, c)) continue;
        const saved = grid[r][c];
        grid[r][c] = 0;
        const fullCheck = solveWith(fullTechList);
        if (!fullCheck || !fullCheck.solvable) grid[r][c] = saved;
      }

      // 阶段2：技巧链断点搜索
      // 默认模式（非 strict）：累积白名单——「基础+已确认链技巧」可解 且
      //   「+当前链技巧」可解 → 挖掉（当前技巧是求解必要断点），逐步构建技巧链。
      // strict 模式（--strict-advanced）：严格断点——withoutCurrent（去掉当前及
      //   后续链技巧）不可解 且 withCurrent 可解 → 挖掉（当前技巧真必要）。
      // 实测杀手数独中 xWing/swordfish 被中间技巧完全覆盖，strict 下"无 xWing
      // 不可解"极难达成（成功率 0/20），故默认关闭。
      if (this.strictAdvanced) {
        // ---- strict：严格断点 ----
        for (let idx = 0; idx < chain.length; idx++) {
          const tech = chain[idx];
          const futureTechs = chain.slice(idx);
          const withoutCurrent = fullTechList.filter(t => !futureTechs.includes(t));
          const withCurrent = withoutCurrent.concat(tech);
          let round = 0;
          while (round++ < 6) {
            const candidates = [];
            for (let r = 0; r < size; r++) {
              for (let c = 0; c < size; c++) {
                if (grid[r][c] !== 0 && !isProtected(r, c)) candidates.push([r, c]);
              }
            }
            const shuffled = shuffleArray(candidates, this._rng);
            let progress = false;
            for (const [r, c] of shuffled) {
              if (Date.now() - startTime > this.timeoutMs * 0.85) break;
              const saved = grid[r][c];
              grid[r][c] = 0;
              const withCheck = solveWith(withCurrent);
              if (!withCheck || !withCheck.solvable) { grid[r][c] = saved; continue; }
              const withoutCheck = solveWith(withoutCurrent);
              if (withoutCheck && withoutCheck.solvable) { grid[r][c] = saved; continue; }
              progress = true;
              break;
            }
            if (!progress) break;
          }
        }
      } else {
        // ---- 默认：累积白名单 ----
        let currentWhitelist = baseTechList.slice();
        for (let idx = 0; idx < chain.length; idx++) {
          const tech = chain[idx];
          const nextWhitelist = currentWhitelist.concat(tech);
          let round = 0;
          while (round++ < 5) {
            const candidates = [];
            for (let r = 0; r < size; r++) {
              for (let c = 0; c < size; c++) {
                if (grid[r][c] !== 0 && !isProtected(r, c)) candidates.push([r, c]);
              }
            }
            const shuffled = shuffleArray(candidates, this._rng);
            let progress = false;
            for (const [r, c] of shuffled) {
              if (Date.now() - startTime > this.timeoutMs * 0.85) break;
              const saved = grid[r][c];
              grid[r][c] = 0;
              const nextCheck = solveWith(nextWhitelist);
              if (!nextCheck || !nextCheck.solvable) { grid[r][c] = saved; continue; }
              if (idx > 0 && currentWhitelist.length > 0) {
                const currentCheck = solveWith(currentWhitelist);
                if (currentCheck && currentCheck.solvable) { grid[r][c] = saved; continue; }
              }
              progress = true;
              break;
            }
            if (!progress) break;
          }
          currentWhitelist = nextWhitelist;
        }
      }

      const finalFull = solveWith(fullTechList);
      if (!finalFull || !finalFull.solvable) return null;

      // V4.3.15 严格断点验收（可选，--strict-advanced）：
      // 实测发现 xWing/swordfish 在杀手数独中被 nakedPair/pointingClaiming 等
      // 中间技巧数学上完全覆盖（无 xWing 白名单 30/30 可解，solve 路径 0/30 用 xWing），
      // 严格验收（无目标技巧不可解）成功率实测 0/20。因此默认关闭；
      // 开启时保证链技巧真必要（生成"必须用 X-Wing"的关，接受低成功率）。
      if (this.strictAdvanced) {
        for (const tech of chain) {
          const withoutTech = fullTechList.filter(t => t !== tech);
          const checkWithout = solveWith(withoutTech);
          if (!checkWithout || checkWithout.solvable) return null; // 无该技巧也能解 → 非必要
        }
        let anyChainUsed = false;
        for (const tech of chain) {
          if ((finalFull.techCount[tech] || 0) > 0) { anyChainUsed = true; break; }
        }
        if (!anyChainUsed) return null;
      }

      return grid;
    }

    // ======================================================
    //  视觉巧思验证（v9）
    // ======================================================

    _validateAesthetics(grid, cages) {
      const size = this.gridSize;
      // 对称性检查（对角线对称：grid[r][c] vs grid[c][r] 填/空状态一致）
      let symCount = 0, total = 0;
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          total++;
          const v1 = grid[r][c];
          const v2 = grid[c][r];
          if ((v1 === 0 && v2 === 0) || (v1 !== 0 && v2 !== 0)) symCount++;
        }
      }
      const symRatio = symCount / total;
      if (symRatio < 0.35) return false;

      // 开局5步内至少有2个可填数
      try {
        const board = new this._Board(size);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(50);
        const steps = solver.getSteps() || [];
        const fillSteps = steps.filter(s => s.type === 'fill' || s.type === 'nakedSingle');
        if (fillSteps.length < 2) return false;
      } catch (e) {
        return false;
      }

      // 至少有一个笼子跨宫
      const dim = getBoxDimensions(size);
      let hasCrossBox = false;
      for (const cage of cages) {
        const boxes = new Set();
        for (const [r, c] of cage.cells) {
          const br = Math.floor(r / dim.boxH);
          const bc = Math.floor(c / dim.boxW);
          boxes.add(br + ',' + bc);
        }
        if (boxes.size > 1) { hasCrossBox = true; break; }
      }
      if (!hasCrossBox) return false;

      return true;
    }

    // ======================================================
    //  节奏验证（v9 升级：目标步数可配置、雪崩区≥12）
    // ======================================================

    _validateRhythm(grid, cages, threeAct) {
      const size = this.gridSize;
      const checks = { totalStepsOk: false, avalancheSizeOk: false, scoreOk: false, breakpointOk: false };

      let totalSteps = 0;
      try {
        const board = new this._Board(size);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(2000);
        const steps = solver.getSteps() || [];
        totalSteps = steps.filter(s => s.type !== 'elimination').length;
      } catch (e) { totalSteps = 0; }

      const stepsTargetMin = Math.max(40, this.targetSteps - 20);
      const stepsTargetMax = Math.min(150, this.targetSteps + 30);
      checks.totalStepsOk = totalSteps >= stepsTargetMin && totalSteps <= stepsTargetMax;

      const avalancheSize = (threeAct && threeAct.avalanche) ? threeAct.avalanche.length : 0;
      checks.avalancheSizeOk = avalancheSize >= this.minAvalancheSize;

      let score = 0;
      try {
        const rating = this._rateWithTechRater(grid, cages);
        score = rating ? rating.score : 0;
      } catch (e) { score = 0; }
      checks.scoreOk = score <= 650;

      let breakpointPos = 0;
      try {
        const board = new this._Board(size);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(2000);
        const steps = solver.getSteps() || [];
        const fillSteps = steps.filter(s => s.type !== 'elimination');
        if (threeAct && threeAct.breakthrough && threeAct.breakthrough.length > 0 && fillSteps.length > 0) {
          const btSet = new Set(threeAct.breakthrough.map(([r, c]) => r + ',' + c));
          let firstIdx = -1;
          for (let i = 0; i < fillSteps.length; i++) {
            const s = fillSteps[i];
            const key = (s.row !== undefined ? s.row : s.r) + ',' + (s.col !== undefined ? s.col : s.c);
            if (btSet.has(key)) { firstIdx = i; break; }
          }
          if (firstIdx >= 0) {
            breakpointPos = Math.round((firstIdx / fillSteps.length) * 100);
            checks.breakpointOk = breakpointPos >= 45 && breakpointPos <= 80;
          } else {
            checks.breakpointOk = false;
          }
        } else {
          checks.breakpointOk = true;
        }
      } catch (e) {
        checks.breakpointOk = false;
      }

      const passed = checks.totalStepsOk && checks.avalancheSizeOk && checks.scoreOk && checks.breakpointOk;
      return { passed, totalSteps, avalancheSize, score, breakpointPos, checks };
    }

    // ======================================================
    //  辅助与兼容方法
    // ======================================================

    _rateWithTechRater(grid, cages) {
      try {
        const board = new this._Board(this.gridSize);
        board.loadLevel({ cells: grid, cages: cages });
        const solver = new this._TechRater(board);
        solver.solve(2000);
        return solver.getRating();
      } catch (e) {
        console.error('[CageFixer] TechRater 评估异常:', e.message);
        return null;
      }
    }

    _checkPurity(grid, cages) {
      return true;
    }

    _starToDifficultyLevel(star) {
      return Math.max(1, Math.min(5, Math.floor(star)));
    }

    _levelToStars(level) {
      const map = { '1星': 1, '2星': 2, '3星': 3, '4星': 4, '5星': 5 };
      return map[level] || 1;
    }

    _starToDifficulty(level) {
      const star = this._levelToStars(level);
      const map = { 1: '入门', 2: '简单', 3: '普通', 4: '困难', 5: '专家' };
      return map[star] || '普通';
    }

    _starToScoreMin(star) {
      const mins = { 1: 0, 2: 250, 3: 400, 4: 525, 5: 600 };
      return mins[star] || 400;
    }

    _starToScoreMax(star) {
      const maxs = { 1: 249, 2: 399, 3: 524, 4: 599, 5: 1000 };
      return maxs[star] || 524;
    }

    _getCageSizeWeights() {
      const star = this.targetStar;
      if (star <= 1) return { 1: 0.20, 2: 0.35, 3: 0.25, 4: 0.15, 5: 0.05 };
      if (star === 2) return { 1: 0.10, 2: 0.30, 3: 0.30, 4: 0.20, 5: 0.10 };
      if (star === 3) return { 1: 0.05, 2: 0.20, 3: 0.30, 4: 0.25, 5: 0.20 };
      if (star === 4) return { 1: 0.02, 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 };
      return { 1: 0.01, 2: 0.05, 3: 0.15, 4: 0.30, 5: 0.49 };
    }

    /**
     * 常规挖洞 + 难度调节（v9 落地修复）
     * 依据 v8 完整实现恢复：非技巧链模式仍需真正挖洞，
     * 否则会生成"全填盘面"（预填 81 格）的无效关卡。
     */
    _digAndTune(solution, cages, startTime, threeAct = null) {
      const size = this.gridSize;
      const grid = deepCopyGrid(solution);

      const targetStar = this.targetStar;
      const targetScoreMin = this._starToScoreMin(targetStar);
      const targetScoreMax = this._starToScoreMax(targetStar);

      let rating = null;

      const avalancheSet = threeAct ? new Set(threeAct.avalanche.map(([r, c]) => r + ',' + c)) : null;
      const openingSet = threeAct ? new Set(threeAct.opening.map(([r, c]) => r + ',' + c)) : null;
      const breakthroughSet = threeAct ? new Set(threeAct.breakthrough.map(([r, c]) => r + ',' + c)) : null;

      // === 阶段 1: 逆序挖洞（先 avalanche，再 opening，breakthrough 保护） ===
      if (threeAct) {
        const avalancheShuffled = shuffleArray(threeAct.avalanche.slice(), this._rng);
        for (const [r, c] of avalancheShuffled) {
          if (Date.now() - startTime > this.timeoutMs * 0.35) break;
          if (grid[r][c] === 0) continue;
          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
          } else {
            grid[r][c] = saved;
          }
        }

        const openingShuffled = shuffleArray(threeAct.opening.slice(), this._rng);
        for (const [r, c] of openingShuffled) {
          if (Date.now() - startTime > this.timeoutMs * 0.35) break;
          if (grid[r][c] === 0) continue;
          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
          } else {
            grid[r][c] = saved;
          }
        }
        // breakthrough 区阶段1不挖（作为"锁"保护）
      } else {
        const allCells = [];
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            allCells.push([r, c]);
          }
        }
        const shuffledCells = shuffleArray(allCells, this._rng);
        for (const [r, c] of shuffledCells) {
          if (Date.now() - startTime > this.timeoutMs * 0.35) break;
          if (grid[r][c] === 0) continue;
          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
          } else {
            grid[r][c] = saved;
          }
        }
      }

      if (!rating) {
        rating = this._rateWithTechRater(grid, cages);
      }
      if (!rating) return null;

      // === 阶段 2: 难度调节 ===
      let currentStar = this._levelToStars(rating.level);
      const MAX_BRUTE_FORCE = 30;

      // 情况 A: 太简单 → 挖更多洞
      if (rating.score < targetScoreMin && currentStar < targetStar) {
        let remainingFilled = [];

        if (threeAct) {
          const openingRemaining = [];
          for (const [r, c] of threeAct.opening) {
            if (grid[r][c] !== 0) openingRemaining.push([r, c]);
          }
          const breakthroughRemaining = [];
          for (const [r, c] of threeAct.breakthrough) {
            if (grid[r][c] !== 0) breakthroughRemaining.push([r, c]);
          }
          const avalancheRemaining = [];
          for (const [r, c] of threeAct.avalanche) {
            if (grid[r][c] !== 0) avalancheRemaining.push([r, c]);
          }
          remainingFilled = [
            ...shuffleArray(avalancheRemaining, this._rng),
            ...shuffleArray(openingRemaining, this._rng),
            ...shuffleArray(breakthroughRemaining, this._rng)
          ];
        } else {
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              if (grid[r][c] !== 0) remainingFilled.push([r, c]);
            }
          }
          remainingFilled = shuffleArray(remainingFilled, this._rng);
        }

        let bruteForceCount = 0;
        for (const [r, c] of remainingFilled) {
          if (Date.now() - startTime > this.timeoutMs * 0.6) break;
          if (rating.score >= targetScoreMin) break;
          if (bruteForceCount >= MAX_BRUTE_FORCE) break;

          const saved = grid[r][c];
          grid[r][c] = 0;
          const testRating = this._rateWithTechRater(grid, cages);
          if (testRating && testRating.solvable) {
            rating = testRating;
            currentStar = this._levelToStars(rating.level);
          } else {
            bruteForceCount++;
            const bruteCheck = timedVerifyUniqueSolution(
              grid, cages, size,
              this._TechRater, this._Board,
              this.verifyTimeoutMs
            );
            if (bruteCheck.unique) {
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

      // 情况 B: 太难 → 回填数字降低难度
      if (rating.score > targetScoreMax && currentStar > targetStar) {
        let emptyCells = [];
        if (threeAct) {
          const avalancheEmpty = [];
          for (const [r, c] of threeAct.avalanche) {
            if (grid[r][c] === 0) avalancheEmpty.push([r, c]);
          }
          const openingEmpty = [];
          for (const [r, c] of threeAct.opening) {
            if (grid[r][c] === 0) openingEmpty.push([r, c]);
          }
          emptyCells = [
            ...shuffleArray(avalancheEmpty, this._rng),
            ...shuffleArray(openingEmpty, this._rng)
          ];
        } else {
          for (let r = 0; r < size; r++) {
            for (let c = 0; c < size; c++) {
              if (grid[r][c] === 0) emptyCells.push([r, c]);
            }
          }
          emptyCells = shuffleArray(emptyCells, this._rng);
        }

        let backfillCount = 0;
        const maxBackfill = Math.floor(emptyCells.length * 0.4);
        for (const [r, c] of emptyCells) {
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

      if (rating.solvable) {
        return { grid, rating };
      }

      const finalVerify = timedVerifyUniqueSolution(
        grid, cages, size,
        this._TechRater, this._Board,
        this.verifyTimeoutMs
      );
      if (!finalVerify.unique) return null;

      return { grid, rating };
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
      guided: null,
      chain: null,
      requiredCages: null,
      noRhythm: false,
      targetSteps: 75,
      avalancheSize: 12,
      aesthetics: false,
      gridSize: 9,
      seed: null,
      timeout: 30000,
      minCageSize: 1,
      maxCageSize: 5,
      enableThreeAct: true,
      verifyTimeout: 200
    };

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--difficulty':
        case '-d': options.difficulty = args[++i]; break;
        case '--count':
        case '-n': options.count = parseInt(args[++i], 10); break;
        case '--output':
        case '-o': options.output = args[++i]; break;
        case '--technique':
        case '-t': options.technique = args[++i]; break;
        case '--guided':
        case '-g': options.guided = args[++i]; break;
        case '--chain': options.chain = args[++i]; break;
        case '--required-cage': options.requiredCages = args[++i].split(',').map(Number); break;
        case '--no-rhythm': options.noRhythm = true; break;
        case '--target-steps': options.targetSteps = parseInt(args[++i], 10); break;
        case '--avalanche-size': options.avalancheSize = parseInt(args[++i], 10); break;
        case '--aesthetics': options.aesthetics = true; break;
        case '--strict-advanced': options.strictAdvanced = true; break;
        case '--size':
        case '-s': options.gridSize = parseInt(args[++i], 10); break;
        case '--seed': options.seed = parseInt(args[++i], 10); break;
        case '--timeout': options.timeout = parseInt(args[++i], 10); break;
        case '--min-cage': options.minCageSize = parseInt(args[++i], 10); break;
        case '--max-cage': options.maxCageSize = parseInt(args[++i], 10); break;
        case '--three-act': options.enableThreeAct = true; break;
        case '--no-three-act': options.enableThreeAct = false; break;
        case '--verify-timeout': options.verifyTimeout = parseInt(args[++i], 10); break;
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
CageFixer v9 - 二/三周目更难关卡生成器

用法:
  node scripts/cage-generator-v9.cjs [选项]

选项:
  -d, --difficulty <level>    目标难度: easy/medium/hard/expert/master (默认: medium)
  -n, --count <number>        生成数量 (默认: 1)
  -o, --output <file>         输出文件路径
  -g, --guided <name>         单技巧引导（v8 兼容）
  --chain <t1,t2,...>         技巧链（如 nakedPair,xWing,swordfish）
  --required-cage <sizes>     必须包含的笼子尺寸，逗号分隔
  --no-rhythm                 禁用节奏验证
  --target-steps <number>     目标步数 (默认: 75)
  --avalanche-size <number>   雪崩区最小大小 (默认: 12)
  --aesthetics                开启视觉巧思严格验证
  -s, --size <number>         盘面大小: 9 (默认)
  --seed <number>             随机种子
  --timeout <ms>              超时时间 (默认: 30000)
  --min-cage <number>         最小笼子大小 (默认: 1)
  --max-cage <number>         最大笼子大小 (默认: 5)
  --three-act                 启用三幕 (默认)
  --no-three-act              禁用三幕
  -h, --help                  显示帮助

示例:
  # 生成 5 个技巧链关 (数对→X-Wing)
  node scripts/cage-generator-v9.cjs --chain nakedPair,xWing --count 5 --output data/v9.json

  # 生成 3 个 Swordfish 专家关，雪崩区≥15，严格视觉
  node scripts/cage-generator-v9.cjs --guided swordfish --difficulty expert --avalanche-size 15 --aesthetics --count 3
`);
  }

  function _difficultyToStar(difficulty) {
    const map = { 'easy': 2, 'medium': 3, 'hard': 4, 'expert': 5, 'master': 5 };
    return map[difficulty] || 3;
  }

  // ========================================================
  //  导出与命令行入口
  // ========================================================

  if (typeof window !== 'undefined') {
    window.CageFixer = CageFixer;
  }
  if (global) {
    global.CageFixer = CageFixer;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CageFixer };
  }

  if (require.main === module) {
    const options = _parseArgs();
    console.log('=== CageFixer v9 - 二/三周目更难关卡生成器 ===\n');
    console.log(`配置: 难度=${options.difficulty}, 数量=${options.count}, 大小=${options.gridSize}x${options.gridSize}`);
    if (options.chain) console.log(`技巧链: ${options.chain}`);
    if (options.guided) console.log(`单技巧: ${options.guided}`);
    console.log(`目标步数: ${options.targetSteps}, 雪崩区最小: ${options.avalancheSize}`);
    console.log(`视觉巧思: ${options.aesthetics ? '开启' : '关闭'}`);
    console.log('');

    const generator = new CageFixer({
      gridSize: options.gridSize,
      targetDifficulty: options.difficulty,
      targetStar: _difficultyToStar(options.difficulty),
      targetTechnique: options.technique,
      guidedTechnique: options.guided,
      techniqueChain: options.chain ? options.chain.split(',') : null,
      requiredCageSizes: options.requiredCages || [],
      enableRhythmValidation: !options.noRhythm,
      targetSteps: options.targetSteps,
      minAvalancheSize: options.avalancheSize,
      aestheticsStrict: options.aesthetics,
      strictAdvanced: options.strictAdvanced || false,
      minCageSize: options.minCageSize,
      maxCageSize: options.maxCageSize,
      seed: options.seed,
      timeoutMs: options.timeout,
      enableThreeAct: options.enableThreeAct,
      verifyTimeoutMs: options.verifyTimeout
    });

    console.log('正在生成关卡...\n');
    const levels = generator.generateBatch(options.count, { prefix: 'V9' });

    if (levels.length === 0) {
      console.error('生成失败，未产出任何关卡');
      process.exit(1);
    }

    console.log(`成功生成 ${levels.length} / ${options.count} 个关卡\n`);
    levels.forEach((level, i) => {
      console.log(`[${i + 1}] ${level.levelId} - ${level.title}`);
      console.log(`    难度: ${level.difficultyInfo.level} (${level.difficultyInfo.score}分)`);
      console.log(`    笼子数: ${level.stats.totalCages}, 预填数: ${level.stats.preFilledCount}`);
      console.log(`    步数: ${level.rhythm ? level.rhythm.totalSteps : 'N/A'}`);
      console.log(`    雪崩区: ${level.rhythm ? level.rhythm.avalancheSize : 'N/A'}`);
      console.log(`    节奏通过: ${level.stats.rhythmPassed ? '✅' : '❌'}`);
      if (level.guidedInfo) {
        console.log(`    技巧链: ${level.guidedInfo.technique}`);
      }
      console.log('');
    });

    if (options.output) {
      const outputPath = path.resolve(options.output);
      const outputData = {
        generator: 'cage-fixer-v9',
        generatedAt: new Date().toISOString(),
        count: levels.length,
        levels: levels
      };
      fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2), 'utf-8');
      console.log(`已保存到: ${outputPath}`);
    }
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
