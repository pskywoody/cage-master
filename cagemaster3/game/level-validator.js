/**
 * ============================================================
 *  LevelValidator - 杀手数独关卡验证器
 * ============================================================
 *
 *  功能：
 *    1. 基础数据验证（笼子覆盖率、预填数字冲突、数据格式）
 *    2. 可解性验证（调用 TechRater 求解）
 *    3. 难度评级（调用 TechRater.getRating()）
 *    4. 笼子完整性验证（连通性、和值匹配、无重复）
 *
 *  公共 API:
 *    - new LevelValidator()
 *    - validator.validateLevel(levelData)    验证单个关卡
 *    - validator.validateChapter(chapterData)  验证整章
 *    - validator.validateAll(chaptersData)    验证全部章节
 *
 *  依赖：
 *    - Board (board.js)
 *    - TechRater (tech-rater.js)
 *
 * ============================================================
 */

(function(global) {

  // ========================================================
  //  难度标签映射
  // ========================================================

  const DIFFICULTY_LABELS = {
    '入门': 1,
    '简单': 2,
    '普通': 3,
    '进阶': 3,
    '困难': 4,
    '挑战': 4,
    '专家': 5,
    '大师': 5
  };

  // ========================================================
  //  工具函数
  // ========================================================

  function getBoxDimensions(size) {
    if (size === 4) return { boxW: 2, boxH: 2, boxRows: 2, boxCols: 2 };
    if (size === 6) return { boxW: 3, boxH: 2, boxRows: 3, boxCols: 2 };
    return { boxW: 3, boxH: 3, boxRows: 3, boxCols: 3 };
  }

  function getBoxIndex(r, c, boxH, boxW) {
    return Math.floor(r / boxH) * (9 / boxW) + Math.floor(c / boxW);
  }

  /**
   * 检查两个格子是否相邻（上下左右，不含对角）
   */
  function isAdjacent(r1, c1, r2, c2) {
    return (Math.abs(r1 - r2) + Math.abs(c1 - c2)) === 1;
  }

  /**
   * 检查一组格子是否全部连通
   * 使用 BFS 从第一个格子出发，看能否到达所有格子
   */
  function isConnected(cells) {
    if (cells.length <= 1) return true;

    const cellSet = new Set(cells.map(([r, c]) => r + ',' + c));
    const visited = new Set();
    const queue = [cells[0]];
    visited.add(cells[0][0] + ',' + cells[0][1]);

    while (queue.length > 0) {
      const [r, c] = queue.shift();
      const neighbors = [
        [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
      ];
      for (const [nr, nc] of neighbors) {
        const key = nr + ',' + nc;
        if (cellSet.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push([nr, nc]);
        }
      }
    }

    return visited.size === cells.length;
  }

  /**
   * 获取 n 格笼子的合理和值范围（1~size 不重复数字）
   */
  function getCageSumRange(cellCount, size) {
    let min = 0, max = 0;
    for (let i = 1; i <= cellCount; i++) min += i;
    for (let i = 0; i < cellCount; i++) max += (size - i);
    return { min, max };
  }

  // ========================================================
  //  LevelValidator 主类
  // ========================================================

  class LevelValidator {

    constructor() {
      // 可注入 Board / TechRater（测试用）
      this._Board = (typeof Board !== 'undefined') ? Board : null;
      this._TechRater = (typeof TechRater !== 'undefined') ? TechRater : null;
    }

    /**
     * 注入依赖（用于 Node 环境手动 require）
     */
    setDependencies({ Board, TechRater }) {
      if (Board) this._Board = Board;
      if (TechRater) this._TechRater = TechRater;
    }

    // ======================================================
    //  公共 API：单关验证
    // ======================================================

    /**
     * 验证单个关卡
     * @param {Object} levelData - 关卡数据对象
     * @returns {Object} 验证结果
     */
    validateLevel(levelData) {
      const result = {
        levelId: levelData.levelId,
        title: levelData.title || '',
        gridSize: levelData.gridSize || 0,
        difficulty: levelData.difficulty || '',
        valid: true,
        dataValid: true,
        solvable: false,
        rating: null,
        errors: [],
        warnings: []
      };

      // --- 1. 基础数据验证 ---
      this._validateBasicData(levelData, result);

      // 如果数据都不合法，后续验证无意义
      if (!result.dataValid) {
        result.valid = false;
        return result;
      }

      // --- 2. 笼子完整性验证 ---
      this._validateCageIntegrity(levelData, result);

      // --- 3. 预填数字验证 ---
      this._validateGivens(levelData, result);

      // --- 4. 可解性 + 难度评级（用 TechRater）---
      if (this._TechRater && this._Board) {
        try {
          this._validateSolvability(levelData, result);
        } catch (e) {
          result.errors.push('求解器异常: ' + e.message);
          result.valid = false;
        }
      } else {
        result.warnings.push('未找到 TechRater 或 Board，跳过可解性验证');
      }

      // --- 5. 难度标签一致性检查 ---
      this._validateDifficultyLabel(levelData, result);

      // 综合判定
      result.valid = result.errors.length === 0;

      return result;
    }

    // ======================================================
    //  公共 API：整章验证
    // ======================================================

    /**
     * 验证一整章的所有关卡
     * @param {Object} chapterData - 章节数据（含 levels 数组）
     * @returns {Object} 章节验证结果
     */
    validateChapter(chapterData) {
      const levels = chapterData.levels || [];
      const levelResults = [];

      for (const level of levels) {
        levelResults.push(this.validateLevel(level));
      }

      // 章节统计
      const total = levelResults.length;
      const passed = levelResults.filter(r => r.valid).length;
      const errors = levelResults.filter(r => r.errors.length > 0).length;
      const warnings = levelResults.filter(r => r.warnings.length > 0).length;
      const solvables = levelResults.filter(r => r.solvable).length;

      const avgScore = total > 0
        ? Math.round(levelResults.reduce((s, r) => s + (r.rating ? r.rating.score : 0), 0) / total)
        : 0;

      const maxTechLevel = levelResults.reduce((m, r) => {
        if (r.rating && r.rating.maxTechLevel > m) return r.rating.maxTechLevel;
        return m;
      }, 0);

      // 难度分布
      const levelDist = { '1星': 0, '2星': 0, '3星': 0, '4星': 0, '5星': 0 };
      for (const r of levelResults) {
        if (r.rating && r.rating.level) {
          levelDist[r.rating.level] = (levelDist[r.rating.level] || 0) + 1;
        }
      }

      return {
        chapterId: chapterData.chapterId,
        title: chapterData.title || '',
        total,
        passed,
        errors,
        warnings,
        solvables,
        avgScore,
        maxTechLevel,
        levelDistribution: levelDist,
        levelResults
      };
    }

    // ======================================================
    //  公共 API：全部验证
    // ======================================================

    /**
     * 验证全部章节
     * @param {Object|Array} chaptersData - 章节数据（可以是 {chapters:[...]} 或直接数组）
     * @returns {Object} 完整验证报告
     */
    validateAll(chaptersData) {
      const chapters = Array.isArray(chaptersData)
        ? chaptersData
        : (chaptersData.chapters || []);

      const chapterResults = [];
      for (const ch of chapters) {
        chapterResults.push(this.validateChapter(ch));
      }

      // 全局统计
      const totalLevels = chapterResults.reduce((s, c) => s + c.total, 0);
      const totalPassed = chapterResults.reduce((s, c) => s + c.passed, 0);
      const totalErrors = chapterResults.reduce((s, c) => s + c.errors, 0);
      const totalWarnings = chapterResults.reduce((s, c) => s + c.warnings, 0);
      const totalSolvable = chapterResults.reduce((s, c) => s + c.solvables, 0);

      // 全局难度分布
      const globalLevelDist = { '1星': 0, '2星': 0, '3星': 0, '4星': 0, '5星': 0 };
      for (const ch of chapterResults) {
        for (const k of Object.keys(globalLevelDist)) {
          globalLevelDist[k] += ch.levelDistribution[k] || 0;
        }
      }

      // 全局技巧使用统计
      const globalTechCount = {};
      const unsolvableLevels = [];
      const errorLevels = [];
      const warningLevels = [];

      for (const ch of chapterResults) {
        for (const lr of ch.levelResults) {
          if (lr.rating && lr.rating.techCount) {
            for (const [tech, count] of Object.entries(lr.rating.techCount)) {
              globalTechCount[tech] = (globalTechCount[tech] || 0) + count;
            }
          }
          if (!lr.solvable && lr.gridSize > 0) {
            unsolvableLevels.push({
              chapterId: ch.chapterId,
              chapterTitle: ch.title,
              levelId: lr.levelId,
              title: lr.title,
              gridSize: lr.gridSize,
              remainingCells: lr.rating ? lr.rating.remainingCells : 'unknown'
            });
          }
          if (lr.errors.length > 0) {
            errorLevels.push({
              chapterId: ch.chapterId,
              chapterTitle: ch.title,
              levelId: lr.levelId,
              title: lr.title,
              errors: lr.errors
            });
          }
          if (lr.warnings.length > 0) {
            warningLevels.push({
              chapterId: ch.chapterId,
              chapterTitle: ch.title,
              levelId: lr.levelId,
              title: lr.title,
              warnings: lr.warnings
            });
          }
        }
      }

      return {
        totalLevels,
        totalPassed,
        passRate: totalLevels > 0 ? Math.round(totalPassed / totalLevels * 1000) / 10 : 0,
        totalErrors,
        totalWarnings,
        totalSolvable,
        solvableRate: totalLevels > 0 ? Math.round(totalSolvable / totalLevels * 1000) / 10 : 0,
        levelDistribution: globalLevelDist,
        techCount: globalTechCount,
        unsolvableLevels,
        errorLevels,
        warningLevels,
        chapterResults
      };
    }

    // ======================================================
    //  1. 基础数据验证
    // ======================================================

    _validateBasicData(levelData, result) {
      const size = levelData.gridSize;

      // gridSize 必须是合法值
      if (!size || ![4, 6, 9].includes(size)) {
        result.errors.push('不支持的盘面尺寸: ' + size);
        result.dataValid = false;
        return;
      }

      // boardData 必须存在且是二维数组
      if (!levelData.boardData || !Array.isArray(levelData.boardData)) {
        result.errors.push('缺少 boardData 或格式错误');
        result.dataValid = false;
        return;
      }

      if (levelData.boardData.length !== size) {
        result.errors.push('boardData 行数应为 ' + size + '，实际为 ' + levelData.boardData.length);
        result.dataValid = false;
        return;
      }

      for (let r = 0; r < size; r++) {
        const row = levelData.boardData[r];
        if (!Array.isArray(row) || row.length !== size) {
          result.errors.push('boardData 第 ' + r + ' 行长度应为 ' + size);
          result.dataValid = false;
          return;
        }
        for (let c = 0; c < size; c++) {
          const v = row[c];
          if (typeof v !== 'number' || v < 0 || v > size) {
            result.errors.push('boardData[' + r + '][' + c + '] 值非法: ' + v);
            result.dataValid = false;
            return;
          }
        }
      }

      // cages 必须存在（可以为空数组，表示经典数独）
      if (!levelData.cages || !Array.isArray(levelData.cages)) {
        result.errors.push('缺少 cages 或格式错误');
        result.dataValid = false;
        return;
      }

      // 检查每个笼子的格式
      for (let i = 0; i < levelData.cages.length; i++) {
        const cage = levelData.cages[i];
        if (!cage || !Array.isArray(cage.cells)) {
          result.errors.push('笼子 ' + i + ' 格式错误：缺少 cells');
          result.dataValid = false;
          continue;
        }
        if (typeof cage.sum !== 'number' || cage.sum <= 0) {
          result.errors.push('笼子 ' + i + ' sum 非法: ' + cage.sum);
          result.dataValid = false;
        }
        for (let j = 0; j < cage.cells.length; j++) {
          const cell = cage.cells[j];
          if (!Array.isArray(cell) || cell.length < 2) {
            result.errors.push('笼子 ' + i + ' 第 ' + j + ' 格坐标格式错误');
            result.dataValid = false;
            break;
          }
          const [r, c] = cell;
          if (r < 0 || r >= size || c < 0 || c >= size) {
            result.errors.push('笼子 ' + i + ' 第 ' + j + ' 格坐标越界: [' + r + ',' + c + ']');
            result.dataValid = false;
            break;
          }
        }
      }

      if (!result.dataValid) return;

      // 笼子覆盖率：所有格子恰好属于一个笼子（仅当有笼子时检查）
      if (levelData.cages.length > 0) {
        const coverage = {};
        for (const cage of levelData.cages) {
          for (const [r, c] of cage.cells) {
            const key = r + ',' + c;
            if (coverage[key]) {
              result.errors.push('格子 [' + r + ',' + c + '] 属于多个笼子');
              result.dataValid = false;
            }
            coverage[key] = true;
          }
        }
        const coveredCount = Object.keys(coverage).length;
        const totalCells = size * size;
        if (coveredCount < totalCells) {
          result.errors.push('笼子未覆盖全部格子：已覆盖 ' + coveredCount + '/' + totalCells);
          result.dataValid = false;
        }
      }
    }

    // ======================================================
    //  2. 笼子完整性验证
    // ======================================================

    _validateCageIntegrity(levelData, result) {
      const size = levelData.gridSize;
      const cages = levelData.cages;

      if (!cages || cages.length === 0) return;

      for (let i = 0; i < cages.length; i++) {
        const cage = cages[i];
        const cellCount = cage.cells.length;
        const cageId = cage.id !== undefined ? cage.id : i;

        // 2.1 连通性检查
        if (!isConnected(cage.cells)) {
          result.errors.push('笼子 ' + cageId + ' 不连通');
        }

        // 2.2 和值合理性（范围检查）
        const { min, max } = getCageSumRange(cellCount, size);
        if (cage.sum < min || cage.sum > max) {
          result.errors.push('笼子 ' + cageId + ' 和值 ' + cage.sum + ' 不在合理范围 [' + min + ', ' + max + '] 内（' + cellCount + '格）');
        }

        // 2.3 单格笼子：和值必须等于预填数字（如果有预填）
        if (cellCount === 1) {
          const [r, c] = cage.cells[0];
          const given = levelData.boardData[r][c];
          if (given !== 0 && given !== cage.sum) {
            result.errors.push('单格笼子 ' + cageId + ' 和值 ' + cage.sum + ' 与预填数字 ' + given + ' 不一致');
          }
        }

        // 2.4 笼子内预填数字是否重复
        const seen = new Set();
        for (const [r, c] of cage.cells) {
          const v = levelData.boardData[r][c];
          if (v !== 0) {
            if (seen.has(v)) {
              result.errors.push('笼子 ' + cageId + ' 内预填数字 ' + v + ' 重复');
              break;
            }
            seen.add(v);
          }
        }

        // 2.5 和值与 solution 匹配（如果有 solution）
        if (levelData.solution && Array.isArray(levelData.solution)) {
          let sum = 0;
          const solSeen = new Set();
          let solValid = true;
          for (const [r, c] of cage.cells) {
            const v = levelData.solution[r][c];
            if (typeof v !== 'number' || v < 1 || v > size) {
              solValid = false;
              break;
            }
            sum += v;
            if (solSeen.has(v)) {
              result.warnings.push('笼子 ' + cageId + ' 在 solution 中有重复数字 ' + v);
              solValid = false;
              break;
            }
            solSeen.add(v);
          }
          if (solValid && sum !== cage.sum) {
            result.errors.push('笼子 ' + cageId + ' 和值 ' + cage.sum + ' 与 solution 的和 ' + sum + ' 不匹配');
          }
        }
      }
    }

    // ======================================================
    //  3. 预填数字验证
    // ======================================================

    _validateGivens(levelData, result) {
      const size = levelData.gridSize;
      const board = levelData.boardData;
      const dim = getBoxDimensions(size);

      // 行重复检查
      for (let r = 0; r < size; r++) {
        const seen = new Set();
        for (let c = 0; c < size; c++) {
          const v = board[r][c];
          if (v === 0) continue;
          if (seen.has(v)) {
            result.errors.push('第 ' + r + ' 行预填数字 ' + v + ' 重复');
            break;
          }
          seen.add(v);
        }
      }

      // 列重复检查
      for (let c = 0; c < size; c++) {
        const seen = new Set();
        for (let r = 0; r < size; r++) {
          const v = board[r][c];
          if (v === 0) continue;
          if (seen.has(v)) {
            result.errors.push('第 ' + c + ' 列预填数字 ' + v + ' 重复');
            break;
          }
          seen.add(v);
        }
      }

      // 宫重复检查
      for (let br = 0; br < dim.boxRows; br++) {
        for (let bc = 0; bc < dim.boxCols; bc++) {
          const seen = new Set();
          for (let dr = 0; dr < dim.boxH; dr++) {
            for (let dc = 0; dc < dim.boxW; dc++) {
              const r = br * dim.boxH + dr;
              const c = bc * dim.boxW + dc;
              const v = board[r][c];
              if (v === 0) continue;
              if (seen.has(v)) {
                result.errors.push('宫 (' + br + ',' + bc + ') 预填数字 ' + v + ' 重复');
                break;
              }
              seen.add(v);
            }
          }
        }
      }

      // 预填数字与 solution 一致性
      if (levelData.solution && Array.isArray(levelData.solution)) {
        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            const given = board[r][c];
            if (given === 0) continue;
            const sol = levelData.solution[r][c];
            if (given !== sol) {
              result.errors.push('预填数字 [' + r + ',' + c + ']=' + given + ' 与 solution=' + sol + ' 不一致');
            }
          }
        }
      }
    }

    // ======================================================
    //  4. 可解性 + 难度评级
    // ======================================================

    _validateSolvability(levelData, result) {
      const size = levelData.gridSize;

      // 创建 Board
      const board = new this._Board(size);
      board.loadLevel({
        levelId: levelData.levelId,
        cells: levelData.boardData,
        cages: levelData.cages
      });

      // 创建 TechRater 并求解
      const solver = new this._TechRater(board);
      const solveResult = solver.solve(1000);
      const rating = solver.getRating();

      result.solvable = rating.solvable;

      result.rating = {
        level: rating.level,
        score: rating.score,
        maxTechLevel: rating.maxTechLevel,
        totalSteps: rating.totalSteps,
        remainingCells: rating.remainingCells,
        nonTrivialRatio: rating.nonTrivialRatio,
        techCount: rating.techCount || {}
      };

      // 不可解视为严重错误
      if (!rating.solvable) {
        result.errors.push('使用现有技巧无法完全解出，剩余 ' + rating.remainingCells + ' 格');
      }

      // 总步数异常检查
      if (rating.totalSteps === 0 && levelData.cages && levelData.cages.length > 0) {
        result.warnings.push('求解步数为 0，可能是盘面已填满或数据异常');
      }

      // 技巧分布异常：只用了孤星但笼子很多
      const techCount = rating.techCount || {};
      const totalTechUses = Object.values(techCount).reduce((s, n) => s + n, 0);
      const nakedSingleUses = techCount.nakedSingle || 0;
      if (totalTechUses > 10 && nakedSingleUses === totalTechUses && levelData.cages.length > 0) {
        result.warnings.push('所有步骤均为孤星，但有笼子存在，技巧分布可能异常');
      }
    }

    // ======================================================
    //  5. 难度标签一致性
    // ======================================================

    _validateDifficultyLabel(levelData, result) {
      if (!result.rating || !result.rating.level) return;
      if (!levelData.difficulty) return;

      const labelLevel = DIFFICULTY_LABELS[levelData.difficulty];
      if (labelLevel === undefined) return; // 未知标签跳过

      const starMap = { '1星': 1, '2星': 2, '3星': 3, '4星': 4, '5星': 5 };
      const actualLevel = starMap[result.rating.level] || 0;

      if (actualLevel === 0) return;

      // 相差 2 级以上视为错误
      if (Math.abs(labelLevel - actualLevel) >= 2) {
        result.warnings.push(
          '难度标签「' + levelData.difficulty + '」(' + labelLevel + '★) 与实际评级 ' +
          result.rating.level + ' 相差较大'
        );
      }
    }
  }

  // ========================================================
  //  暴露到全局
  // ========================================================

  if (typeof window !== 'undefined') {
    window.LevelValidator = LevelValidator;
  }

  if (global) {
    global.LevelValidator = LevelValidator;
  }

  // CommonJS 导出（Node 环境）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LevelValidator;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
