/**
 * ============================================================
 *  TechnicalPurityValidator - 技巧纯净度验证器
 * ============================================================
 *
 *  验证「高纯度定向技巧关」的三重标准：
 *
 *  1. 技术断点（Technical Breakpoint）
 *     先用低于目标等级的所有技巧解题，直到完全卡住。
 *     - 验证：低级技巧确实解不动
 *     - 再检查一轮，确认不是循环问题
 *     - 如果低级技巧就解完了 → 不纯
 *
 *  2. 技巧纯净（Skill Purity）
 *     从断点状态开始完整解题，最高级 elimination 必须就是目标技巧。
 *     - 验证：唯一能推进的解法就是目标技巧
 *     - 如果中间混入了其他高级技巧 → 不纯
 *
 *  3. 级联坍塌（Cascade Collapse）
 *     核心破局格填入后，引发 ≥ 4 格连锁填充（多米诺骨牌效应）。
 *     - 采用「顺水推舟」策略：破局点之后的所有 fill 步骤都是级联
 *     - 级联长度 < 4 → 不纯
 *
 *  公共 API:
 *    - new TechnicalPurityValidator()
 *    - validator.verifyPurity(levelData, targetTechnique)  验证单关纯净度
 *    - validator.verifyChapter(chapterData, targetTechnique)  批量验证整章
 *
 *  依赖：
 *    - Board (board.js)
 *    - TechRater (tech-rater.js)
 *
 * ============================================================
 */

(function(global) {

  // ========================================================
  //  工具函数
  // ========================================================

  function getBoxDimensions(size) {
    if (size === 4) return { boxW: 2, boxH: 2, boxRows: 2, boxCols: 2 };
    if (size === 6) return { boxW: 3, boxH: 2, boxRows: 2, boxCols: 3 };
    return { boxW: 3, boxH: 3, boxRows: 3, boxCols: 3 };
  }

  // ========================================================
  //  TechnicalPurityValidator 主类
  // ========================================================

  class TechnicalPurityValidator {

    constructor() {
      // 可注入依赖（测试用）
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
    //  公共 API：单关纯净度验证
    // ======================================================

    /**
     * 验证关卡的技巧纯净度
     * @param {Object} levelData - 关卡数据
     * @param {string} targetTechnique - 目标技巧 ID
     * @returns {Object} 纯净度验证结果
     */
    verifyPurity(levelData, targetTechnique) {
      const result = {
        levelId: levelData.levelId,
        title: levelData.title || '',
        targetTechnique: targetTechnique,
        targetLevel: 0,
        isPure: false,
        breakpointReached: false,
        skillIsPure: false,
        cascadeCount: 0,
        cascadeSufficient: false,
        breakStep: null,
        cascadeSequence: [],
        errors: [],
        score: 0
      };

      // 依赖检查
      if (!this._Board || !this._TechRater) {
        result.errors.push('缺少依赖：Board 或 TechRater 未加载');
        return result;
      }

      // 获取目标技巧等级
      const TECHNIQUES = this._TechRater.TECHNIQUES;
      const targetTech = TECHNIQUES[targetTechnique];
      if (!targetTech) {
        result.errors.push('未知的目标技巧：' + targetTechnique);
        return result;
      }
      result.targetLevel = targetTech.level;

      try {
        // --- 第 1 步：技术断点检测 ---
        const breakpointResult = this._findBreakpoint(levelData, targetTech.level);
        result.breakpointReached = breakpointResult.reached;

        if (!breakpointResult.reached) {
          result.errors.push('未达到技术断点：低级技巧就能解完或数据异常');
          if (breakpointResult.reason) {
            result.errors.push('原因：' + breakpointResult.reason);
          }
        }

        // --- 第 2 步：技巧纯净度检测 ---
        const purityResult = this._checkSkillPurity(
          breakpointResult.solver,
          targetTechnique,
          targetTech.level
        );
        result.skillIsPure = purityResult.isPure;
        result.breakStep = purityResult.breakStep;

        if (!purityResult.isPure) {
          result.errors.push('技巧不纯净：' + (purityResult.reason || '未知原因'));
        }

        // --- 第 3 步：级联坍塌检测 ---
        const cascadeResult = this._checkCascade(
          breakpointResult.solver,
          targetTechnique,
          targetTech.level
        );
        result.cascadeCount = cascadeResult.count;
        result.cascadeSufficient = cascadeResult.sufficient;
        result.cascadeSequence = cascadeResult.sequence;

        if (!cascadeResult.sufficient) {
          result.errors.push(
            '级联不足：级联长度为 ' + cascadeResult.count + '，要求 ≥ 4'
          );
        }

        // --- 综合评分 ---
        result.score = this._calculateScore(result);

        // --- 最终判定 ---
        result.isPure =
          result.breakpointReached &&
          result.skillIsPure &&
          result.cascadeSufficient;

      } catch (e) {
        result.errors.push('验证异常：' + e.message);
      }

      return result;
    }

    // ======================================================
    //  公共 API：整章批量验证
    // ======================================================

    /**
     * 验证一整章的关卡纯净度
     * @param {Object} chapterData - 章节数据（含 levels 数组）
     * @param {string} targetTechnique - 目标技巧 ID
     * @returns {Object} 章节验证报告
     */
    verifyChapter(chapterData, targetTechnique) {
      const levels = chapterData.levels || [];
      const levelResults = [];

      for (const level of levels) {
        // 跳过隐藏关（可选，视需求而定）
        levelResults.push(this.verifyPurity(level, targetTechnique));
      }

      const total = levelResults.length;
      const pureCount = levelResults.filter(r => r.isPure).length;
      const avgScore = total > 0
        ? Math.round(levelResults.reduce((s, r) => s + r.score, 0) / total)
        : 0;

      const breakpointPass = levelResults.filter(r => r.breakpointReached).length;
      const purityPass = levelResults.filter(r => r.skillIsPure).length;
      const cascadePass = levelResults.filter(r => r.cascadeSufficient).length;

      // 找出最纯的关卡
      let bestLevel = null;
      let bestScore = -1;
      for (const r of levelResults) {
        if (r.score > bestScore) {
          bestScore = r.score;
          bestLevel = r;
        }
      }

      return {
        chapterId: chapterData.chapterId,
        title: chapterData.title || '',
        targetTechnique: targetTechnique,
        total,
        pureCount,
        purityRate: total > 0 ? Math.round(pureCount / total * 1000) / 10 : 0,
        avgScore,
        bestLevel: bestLevel ? {
          levelId: bestLevel.levelId,
          title: bestLevel.title,
          score: bestLevel.score,
          cascadeCount: bestLevel.cascadeCount
        } : null,
        stats: {
          breakpointPass,
          purityPass,
          cascadePass
        },
        levelResults
      };
    }

    // ======================================================
    //  第 1 步：技术断点检测
    // ======================================================

    /**
     * 找到技术断点：用低于 targetLevel 的技巧解到卡住
     * 返回 { reached, solver, reason, remainingCells }
     */
    _findBreakpoint(levelData, targetLevel) {
      const size = levelData.gridSize;

      // 创建 Board
      const board = new this._Board(size);
      board.loadLevel({
        levelId: levelData.levelId,
        cells: levelData.boardData,
        cages: levelData.cages
      });

      // 创建 TechRater
      const solver = new this._TechRater(board);

      // 构建受限技巧列表（只使用 < targetLevel 的技巧）
      const allPriority = solver.techPriority.slice();
      const restrictedPriority = allPriority.filter(techId => {
        const tech = this._TechRater.TECHNIQUES[techId];
        return tech && tech.level < targetLevel;
      });

      // 如果没有低于目标等级的技巧，断点就是初始状态
      if (restrictedPriority.length === 0) {
        return {
          reached: true,
          solver: solver,
          reason: '目标技巧为最低级技巧',
          remainingCells: solver._countEmptyCells()
        };
      }

      // 替换 techPriority 为受限列表
      solver.techPriority = restrictedPriority;

      // 用低级技巧解题，设置较大的步数上限
      const maxSteps = size * size * 10;
      const solveResult = solver.solve(maxSteps);

      // 检查是否真的卡住了（再跑一轮确认，防止循环）
      const beforeEmpty = solver._countEmptyCells();
      const beforeCandidates = solver._countTotalCandidates();

      // 再尝试一步（如果还能推进说明没卡住）
      solver.solve(1);

      const afterEmpty = solver._countEmptyCells();
      const afterCandidates = solver._countTotalCandidates();

      const stuck = (beforeEmpty === afterEmpty) && (beforeCandidates === afterCandidates);

      // 恢复原始 techPriority（以备后续使用）
      solver.techPriority = allPriority;

      if (solveResult.solvable) {
        // 低级技巧就解完了，没有断点
        return {
          reached: false,
          solver: solver,
          reason: '低级技巧即可完全解题',
          remainingCells: 0
        };
      }

      if (!stuck) {
        // 理论上 solve 应该跑到卡住为止，这里作为安全检查
        return {
          reached: false,
          solver: solver,
          reason: '求解器未达到稳定状态',
          remainingCells: afterEmpty
        };
      }

      // 确认达到断点
      return {
        reached: true,
        solver: solver,
        remainingCells: afterEmpty
      };
    }

    // ======================================================
    //  第 2 步：技巧纯净度检测
    // ======================================================

    /**
     * 从断点状态开始，检查第一步高级 elimination / fill 是否就是目标技巧
     * @param {TechRater} breakpointSolver - 处于断点状态的求解器
     * @param {string} targetTechnique - 目标技巧 ID
     * @param {number} targetLevel - 目标技巧等级
     */
    _checkSkillPurity(breakpointSolver, targetTechnique, targetLevel) {
      // 克隆求解器状态（不破坏原始断点状态）
      const solver = this._cloneSolver(breakpointSolver);

      // 用全部技巧继续解题
      const allPriority = this._getFullTechPriority(solver.size);
      solver.techPriority = allPriority;

      // 找下一步（这就是从断点推进的第一步）
      const nextStep = solver.findNextStep();

      if (!nextStep) {
        return {
          isPure: false,
          breakStep: null,
          reason: '从断点状态无法继续推进（整题不可解）'
        };
      }

      // 检查第一步高级技巧是不是目标技巧
      if (nextStep.technique === targetTechnique) {
        return {
          isPure: true,
          breakStep: {
            technique: nextStep.technique,
            techniqueName: nextStep.techniqueName,
            row: nextStep.row,
            col: nextStep.col,
            num: nextStep.num,
            type: nextStep.type || 'fill'
          },
          reason: null
        };
      }

      // 检查：如果第一步用的技巧等级 < targetLevel，
      // 说明断点检测有问题（低级技巧还能继续推）
      const stepTech = this._TechRater.TECHNIQUES[nextStep.technique];
      if (stepTech && stepTech.level < targetLevel) {
        return {
          isPure: false,
          breakStep: {
            technique: nextStep.technique,
            techniqueName: nextStep.techniqueName,
            row: nextStep.row,
            col: nextStep.col,
            num: nextStep.num,
          },
          reason: '断点检测不严格：低级技巧「' + nextStep.techniqueName +
            '」仍可推进（等级 ' + stepTech.level + ' < ' + targetLevel + '）'
        };
      }

      // 第一步就是另一个高级技巧 → 不纯净
      return {
        isPure: false,
        breakStep: {
          technique: nextStep.technique,
          techniqueName: nextStep.techniqueName,
          row: nextStep.row,
          col: nextStep.col,
          num: nextStep.num,
        },
        reason: '破局技巧为「' + nextStep.techniqueName +
          '」，而非目标技巧「' + this._TechRater.TECHNIQUES[targetTechnique].name + '」'
      };
    }

    // ======================================================
    //  第 3 步：级联坍塌检测
    // ======================================================

    /**
     * 检测破局点之后的级联长度
     * 采用「顺水推舟」策略：破局点之后的所有 fill 步骤都是级联
     * @param {TechRater} breakpointSolver - 处于断点状态的求解器
     * @param {string} targetTechnique - 目标技巧 ID
     * @param {number} targetLevel - 目标技巧等级
     */
    _checkCascade(breakpointSolver, targetTechnique, targetLevel) {
      // 克隆求解器状态
      const solver = this._cloneSolver(breakpointSolver);

      // 用全部技巧解题
      const allPriority = this._getFullTechPriority(solver.size);
      solver.techPriority = allPriority;

      // 完整求解
      const maxSteps = solver.size * solver.size * 10;
      solver.solve(maxSteps);

      const steps = solver.steps;
      if (!steps || steps.length === 0) {
        return { count: 0, sufficient: false, sequence: [] };
      }

      // 找到第一个目标技巧步骤（破局点）
      let breakPointIndex = -1;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].technique === targetTechnique) {
          breakPointIndex = i;
          break;
        }
      }

      if (breakPointIndex === -1) {
        // 没找到目标技巧（可能用了其他高级技巧绕过）
        return { count: 0, sufficient: false, sequence: [] };
      }

      // 确定级联起点
      // 如果破局点本身是 fill -> 从下一步开始计数
      // 如果破局点是 elimination -> 从之后第一个 fill 开始
      let cascadeStartIndex;
      if (steps[breakPointIndex].type === 'fill') {
        cascadeStartIndex = breakPointIndex + 1;
      } else {
        // elimination 步骤：找之后第一个 fill
        let firstFillAfter = -1;
        for (let i = breakPointIndex + 1; i < steps.length; i++) {
          if (steps[i].type === 'fill') {
            firstFillAfter = i;
            break;
          }
        }
        if (firstFillAfter === -1) {
          return { count: 0, sufficient: false, sequence: [] };
        }
        cascadeStartIndex = firstFillAfter + 1;
      }

      // 提取破局点之后的所有 fill 步骤（级联序列）
      const cascadeSteps = steps.slice(cascadeStartIndex).filter(s => s.type === 'fill');
      const cascadeSequence = cascadeSteps.map(s => ({
        row: s.row,
        col: s.col,
        num: s.num,
        technique: s.technique,
        techniqueName: s.techniqueName,
        cellId: s.row * solver.size + s.col,
      }));

      const count = cascadeSequence.length;

      return {
        count: count,
        sufficient: count >= 4,
        sequence: cascadeSequence
      };
    }

    // ======================================================
    //  评分计算
    // ======================================================

    _calculateScore(result) {
      let score = 0;

      // 1. 技术断点（30分）
      if (result.breakpointReached) {
        score += 30;
      }

      // 2. 技巧纯净（40分）
      if (result.skillIsPure) {
        score += 40;
      }

      // 3. 级联长度（30分，线性）
      // 级联长度 0 → 0分
      // 级联长度 4 → 30分（满分）
      // 级联长度 > 4 → 仍然 30分
      const cascadeScore = Math.min(result.cascadeCount, 4) / 4 * 30;
      score += Math.round(cascadeScore);

      // 额外加分：级联远超 4 格，给额外奖励（最多 +10 分）
      if (result.cascadeCount > 4) {
        const bonus = Math.min(result.cascadeCount - 4, 10);
        score = Math.min(score + bonus, 100);
      }

      return score;
    }

    // ======================================================
    //  辅助方法：求解器克隆
    // ======================================================

    /**
     * 深拷贝一个 TechRater 实例的状态
     * 由于 TechRater 没有内置 clone 方法，
     * 我们通过创建新 Board + 同步 grid 和 candidates 来实现
     */
    _cloneSolver(sourceSolver) {
      const size = sourceSolver.size;

      // 创建空 Board
      const board = new this._Board(size);

      // 复制 grid 数据到 board
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const val = sourceSolver.grid[r][c];
          if (val !== 0) {
            board.cells[r][c].fillNum = val;
          }
        }
      }

      // 复制笼子数据
      board.cages = sourceSolver.cages.map(cage => ({
        id: cage.id,
        sum: cage.sum,
        cells: cage.cells.map(([r, c]) => [r, c])
      }));

      // 创建新的 TechRater
      const newSolver = new this._TechRater(board);

      // 同步候选集（因为原始求解器可能已经做了很多排除）
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          newSolver.candidates[r][c] = new Set(sourceSolver.candidates[r][c]);
        }
      }

      // 同步 steps 记录
      newSolver.steps = sourceSolver.steps.map(s => Object.assign({}, s));
      newSolver.cellTech = Object.assign({}, sourceSolver.cellTech);

      return newSolver;
    }

    /**
     * 获取完整的技巧优先级列表
     */
    _getFullTechPriority(size) {
      const TECH_PRIORITY_9 = [
        'nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45',
        'nakedPair', 'hiddenPair', 'pointingClaiming',
        'nakedTriplet', 'xWing', 'swordfish'
      ];
      const TECH_PRIORITY_6 = [
        'nakedSingle', 'cageUnique', 'hiddenSingle', 'rule45',
        'nakedPair', 'hiddenPair', 'pointingClaiming', 'nakedTriplet'
      ];
      const TECH_PRIORITY_4 = [
        'nakedSingle', 'hiddenSingle', 'nakedPair'
      ];

      if (size <= 4) return TECH_PRIORITY_4;
      if (size <= 6) return TECH_PRIORITY_6;
      return TECH_PRIORITY_9;
    }
  }

  // ========================================================
  //  暴露到全局
  // ========================================================

  if (typeof window !== 'undefined') {
    window.TechnicalPurityValidator = TechnicalPurityValidator;
  }

  if (global) {
    global.TechnicalPurityValidator = TechnicalPurityValidator;
  }

  // CommonJS 导出（Node 环境）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TechnicalPurityValidator;
  }

})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : this));
