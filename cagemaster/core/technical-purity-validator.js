/**
 * ============================================================
 *  TechnicalPurityValidator - 技巧纯净度残局验证器
 * ============================================================
 * 
 * 验证一个残局是否为"高纯度定向技巧关"：
 * 1. 基础技巧（L1~Ltarget-1）完全解不动（技术断点）
 * 2. 唯一能推进的解法就是目标技巧（技巧纯净）
 * 3. 核心破局格填入后，引发 >= 4 格级联坍塌（骨牌效应）
 * 
 * 基于 TechRaterSolverV2 构建
 */

(function(global) {
  'use strict';

  // 技巧等级映射（从低到高）
  const TECH_PRIORITY = [
    'nakedSingle',
    'cageUnique',
    'hiddenSingle',
    'rule45',
    'nakedPair',
    'hiddenPair',
    'pointingClaiming',
    'nakedTriplet',
    'xWing',
  ];

  const SKILL_LEVELS = {
    nakedSingle: 1,
    cageUnique: 2,
    hiddenSingle: 3,
    rule45: 4,
    nakedPair: 5,
    hiddenPair: 6,
    pointingClaiming: 7,
    nakedTriplet: 8,
    xWing: 9,
  };

  const SKILL_NAMES_CN = {
    nakedSingle: '孤星',
    cageUnique: '笼子唯一组合',
    hiddenSingle: '隐曜',
    rule45: '星衡法则',
    nakedPair: '并蒂锁',
    hiddenPair: '双曜',
    pointingClaiming: '区块排除',
    nakedTriplet: '三子法',
    xWing: '二连纵横阵',
  };

  class TechnicalPurityValidator {

    /**
     * 验证一个残局是否为高纯度定向技巧关
     * 
     * [v5.0 重构] 顺水推舟策略：
     * 不再手动追踪级联序列，而是让 Solver 完整解题后，
     * 直接从 steps 数组里切片——最高级 elimination 之后的所有 fill，
     * 就是天然的多米诺雪崩序列。
     * 
     * @param {number[][]} board - 9x9棋盘（0为空格）
     * @param {object[]} cages - 笼子数组
     * @param {string} targetSkill - 目标技巧ID
     * @returns {{isPure: boolean, coreMove: object|null, bottleneckGrid: number[][]}}
     */
    static verifyPurity(board, cages, targetSkill) {
      const targetLevel = SKILL_LEVELS[targetSkill];
      if (!targetLevel) {
        return { isPure: false, coreMove: null, bottleneckGrid: null };
      }

      // 1. 用低于目标等级的技巧解到卡壳（模拟"技术断点"）
      const lowerSolver = this._createSolver(board, cages);
      lowerSolver.solveWithMaxLevel(targetLevel - 1);
      const bottleneckGrid = lowerSolver.getBoard();

      // 如果用低级技巧就解完了，说明不需要目标技巧 → 不纯
      if (lowerSolver.isSolved()) {
        return { isPure: false, coreMove: null, bottleneckGrid };
      }

      // 2. 检查：再用一轮低级技巧，确认真的卡住了
      const lowerMoves = lowerSolver.findMovesBelowLevel(targetLevel - 1);
      if (lowerMoves.length > 0) {
        return { isPure: false, coreMove: null, bottleneckGrid };
      }

      // 3. [顺水推舟] 从断点状态开始完整解题，记录全部 steps
      //    Solver 会按技巧优先级从低到高推进，steps 里天然包含 elimination 和 fill
      const fullSolver = this._createSolver(bottleneckGrid, cages);
      fullSolver.solve(500); // 完整解题（含所有技巧）

      // 4. 从完整 steps 中提取三阶段剧本
      const script = fullSolver.getTriPhaseScript();
      if (!script) {
        return { isPure: false, coreMove: null, bottleneckGrid };
      }

      // 5. 纯净度校验：最高级技巧必须就是目标技巧
      if (script.targetSkill !== targetSkill) {
        return { isPure: false, coreMove: null, bottleneckGrid };
      }

      // 6. 纯净度条件：级联坍塌 >= 4 格
      if (script.coreMove.cascadeCount < 4) {
        return { isPure: false, coreMove: null, bottleneckGrid };
      }

      return {
        isPure: true,
        coreMove: {
          row: script.coreMove.row,
          col: script.coreMove.col,
          value: script.coreMove.value,
          skill: targetSkill,
          skillName: SKILL_NAMES_CN[targetSkill],
          cascadeCount: script.coreMove.cascadeCount,
          cascadeSequence: script.coreMove.cascadeSequence,
        },
        bottleneckGrid,
      };
    }

    /**
     * 从完整终盘逆向生成纯净度残局
     * @param {number[][]} solution - 完整正解
     * @param {object[]} cages - 笼子
     * @param {string} targetSkill - 目标技巧
     * @param {object} options - { maxAttempts, minRemaining, maxRemaining }
     * @returns {{success: boolean, puzzle: object|null}}
     */
    static generateFromSolution(solution, cages, targetSkill, options = {}) {
      const maxAttempts = options.maxAttempts || 300;
      const minRemaining = options.minRemaining || 15;
      const maxRemaining = options.maxRemaining || 55;

      const targetLevel = SKILL_LEVELS[targetSkill];
      if (!targetLevel) return { success: false, puzzle: null };

      let bestPuzzle = null;
      let bestRemaining = 81; // 越少越好（越难）

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // 从完整盘开始，随机挖空
        const board = solution.map(row => [...row]);
        const positions = [];
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            positions.push([r, c]);
          }
        }
        this._shuffle(positions);

        let remaining = 81;
        
        for (let i = 0; i < positions.length; i++) {
          const [r, c] = positions[i];
          board[r][c] = 0;
          remaining--;

          if (remaining < minRemaining) break;
          if (remaining > maxRemaining) continue;

          // 验证纯净度
          const result = this.verifyPurity(board, cages, targetSkill);
          if (result.isPure) {
            // 找剩余格数最少的（最有"残局感"的）
            if (remaining < bestRemaining) {
              bestPuzzle = {
                boardData: result.bottleneckGrid.map(row => [...row]),
                cages: cages,
                solution: solution,
                targetSkill: targetSkill,
                targetSkillName: SKILL_NAMES_CN[targetSkill],
                coreMove: result.coreMove,
                remainingCells: result.bottleneckGrid.flat().filter(v => v === 0).length,
              };
              bestRemaining = remaining;
            }
          }
        }

        if (bestPuzzle) {
          // 找到了就 early return
          return { success: true, puzzle: bestPuzzle };
        }
      }

      if (bestPuzzle) {
        return { success: true, puzzle: bestPuzzle };
      }
      return { success: false, puzzle: null };
    }

    /**
     * 批量生成纯净度残局
     */
    static batchGenerate(solutions, cages, targetSkill, count = 20, options = {}) {
      const results = [];
      const seen = new Set(); // 去重

      for (let i = 0; i < solutions.length && results.length < count; i++) {
        const result = this.generateFromSolution(
          solutions[i].solution || solutions[i].boardData,
          cages || solutions[i].cages,
          targetSkill,
          options
        );
        if (result.success) {
          const key = result.puzzle.boardData.flat().join(',');
          if (!seen.has(key)) {
            seen.add(key);
            results.push(result.puzzle);
          }
        }
      }

      return results;
    }

    /**
     * 创建求解器包装
     */
    static _createSolver(board, cages) {
      let SolverClass = null;
      
      // 浏览器环境
      if (typeof window !== 'undefined' && window.TechRaterSolverV2) {
        SolverClass = window.TechRaterSolverV2;
      }
      // Node.js 环境
      if (typeof require !== 'undefined' && typeof module !== 'undefined') {
        try {
          // 从 game-src/utils 出发，../../crawlers/
          const path = require('path');
          const fs = require('fs');
          
          // 尝试几个可能的路径
          const possiblePaths = [
            path.join(__dirname, '..', '..', 'crawlers', 'tech-rater-v2.js'),
            path.join(__dirname, '..', 'crawlers', 'tech-rater-v2.js'),
          ];
          
          for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
              const mod = require(p);
              if (mod.TechRaterSolverV2) {
                SolverClass = mod.TechRaterSolverV2;
                break;
              }
            }
          }
        } catch (e) {
          // 忽略
        }
      }
      // 全局变量（浏览器中也可能挂在 global）
      if (!SolverClass && typeof global !== 'undefined' && global.TechRaterSolverV2) {
        SolverClass = global.TechRaterSolverV2;
      }

      if (!SolverClass) {
        throw new Error('TechRaterSolverV2 not found. Please load tech-rater-v2.js first.');
      }

      return new SolverWrapper(new SolverClass(board, cages));
    }

    static _shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  }

  /**
   * SolverWrapper - 包装 TechRaterSolverV2
   */
  class SolverWrapper {
    constructor(solver) {
      this._solver = solver;
    }

    /**
     * 用指定等级以下的技巧解题，直到卡壳
     */
    solveWithMaxLevel(maxLevel) {
      const skills = TECH_PRIORITY.filter(s => SKILL_LEVELS[s] <= maxLevel);
      let safety = 0;
      
      while (safety++ < 500) {
        let progressed = false;
        for (const skill of skills) {
          const result = this._solver['_find' + this._capitalize(skill)]();
          if (result) {
            this._solver._fillCell(result.row, result.col, result.num);
            progressed = true;
            break;
          }
        }
        if (!progressed) break;
      }
    }

    /**
     * 找一个指定技巧的落子
     */
    findOneMove(skill) {
      const methodName = '_find' + this._capitalize(skill);
      if (typeof this._solver[methodName] !== 'function') return null;
      const result = this._solver[methodName]();
      if (!result) return null;
      return {
        row: result.row,
        col: result.col,
        num: result.num,
        technique: skill,
      };
    }

    /**
     * 找所有低于指定等级的技巧的可落子
     */
    findMovesBelowLevel(maxLevel) {
      const moves = [];
      const skills = TECH_PRIORITY.filter(s => SKILL_LEVELS[s] <= maxLevel);
      
      for (const skill of skills) {
        // 注意：find 可能有副作用，所以我们只用孤星/隐曜等无副作用的来检查
        // 实际上孤星的 find 是没有副作用的
        if (skill === 'nakedSingle') {
          const result = this._solver._findNakedSingle();
          if (result) moves.push({ ...result, technique: skill });
        }
      }
      
      // 对于有副作用的技巧，我们不在这里调用
      // 只检查孤星就够了——如果连孤星都没有，说明真的卡住了
      return moves;
    }

    /**
     * 找下一个低于指定等级的落子（按技巧从低到高）
     */
    findNextMoveBelowLevel(maxLevel) {
      const skills = TECH_PRIORITY.filter(s => SKILL_LEVELS[s] <= maxLevel);
      for (const skill of skills) {
        const result = this._solver['_find' + this._capitalize(skill)]();
        if (result) {
          return {
            row: result.row,
            col: result.col,
            num: result.num,
            technique: skill,
          };
        }
      }
      return null;
    }

    fillCell(row, col, value) {
      this._solver._fillCell(row, col, value);
    }

    /**
     * 完整解题（按技巧优先级从低到高）
     */
    solve(maxSteps = 500) {
      if (typeof this._solver.solve === 'function') {
        this._solver.solve(maxSteps);
      }
    }

    /**
     * 获取三阶段剧本（卡点+级联序列）
     */
    getTriPhaseScript() {
      if (typeof this._solver.getTriPhaseScript === 'function') {
        return this._solver.getTriPhaseScript();
      }
      return null;
    }

    getBoard() {
      return this._solver.grid.map(row => [...row]);
    }

    isSolved() {
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (this._solver.grid[r][c] === 0) return false;
        }
      }
      return true;
    }

    _capitalize(s) {
      return s.charAt(0).toUpperCase() + s.slice(1);
    }
  }

  // 导出
  global.TechnicalPurityValidator = TechnicalPurityValidator;
  global.SKILL_LEVELS = SKILL_LEVELS;
  global.SKILL_NAMES_CN = SKILL_NAMES_CN;

})(typeof window !== 'undefined' ? window : global);
