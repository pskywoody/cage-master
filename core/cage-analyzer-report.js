// ==========================================
// CageAnalyzerReport - Level Analytics (Step 2.5)
// ==========================================
// 利用 Cage Resolution Layer 回答以前无法回答的问题：
//   "一个 Level 到底怎么样？"
//
// 对给定关卡输出结构化报告：
//   {
//     level, gridSize, cages,
//     initial: { open, narrowed, resolved },   // 开局三态分布
//     milestones: [{ cage, resolvedAtMove }],  // 求解过程中各 Cage 何时 RESOLVED
//     criticalPath: [cageId,...],              // 关键化解顺序
//     difficultyScore: 0-10,                   // 归一化难度
//     rating: {...},                            // TechRater 原始评级
//   }
//
// 依赖（双环境）：
//   - Board     全局（Node 需先加载 core/board.js；浏览器由 game.html 提供）
//   - TechRater 全局（Node 需先加载 core/tech-rater.js；浏览器由 game.html 提供）
//   - CageAnalyzer（本模块 import）
//
// TechRater.solve() 维护内部 grid，不污染传入的 Board，因此可直接复用 Board 做回放。
// ==========================================

import { CageAnalyzer } from './cage-analyzer.js';

function _getGlobal(name) {
  if (typeof window !== 'undefined' && window[name]) return window[name];
  if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
  return null;
}

class CageAnalyzerReport {
  /**
   * 分析一个关卡并返回报告。
   * @param {Object} levelData - 关卡 JSON（含 boardData/cells、cages、gridSize、levelId）
   * @returns {Object} 分析报告
   */
  analyze(levelData) {
    const Board = _getGlobal('Board');
    if (!Board) throw new Error('[CageAnalyzerReport] 未找到全局 Board（Node 需先加载 core/board.js）');

    const gridSize = levelData.gridSize || (levelData.boardData || levelData.cells || []).length || 9;
    const board = new Board(gridSize);
    board.loadLevel({
      cells: levelData.boardData || levelData.cells,
      cages: levelData.cages,
      gridSize,
    });

    const report = {
      level: levelData.levelId ?? board.levelId ?? null,
      gridSize,
      cages: (levelData.cages || []).length,
      initial: this._initialDistribution(board),
      milestones: [],
      criticalPath: [],
      difficultyScore: null,
      rating: null,
      solveSteps: null,
      techniqueStats: null,
    };

    // 求解（可选，缺 TechRater 时仅返回初始分布）
    const TechRater = _getGlobal('TechRater');
    if (TechRater) {
      try {
        const rater = new TechRater(board);
        const sol = rater.solve(200);
        const steps = sol.steps || [];
        report.solveSteps = steps.length;
        report.techniqueStats = this._countTechniques(steps);
        report.milestones = this._replayMilestones(board, steps);
        report.criticalPath = report.milestones.map(m => m.cage);
        const rating = rater.getRating();
        if (rating) {
          report.rating = {
            level: rating.level || null,
            score: rating.score ?? null,
            maxTechLevel: rating.maxTechLevel ?? null,
            totalSteps: rating.totalSteps ?? steps.length,
            nonTrivialRatio: rating.nonTrivialRatio ?? null,
          };
          // 归一化到 0-10。TechRater 原始分为 0-1000，但"全孤星"关卡在
          // remainingFactor=-1.0 + densityFactor=-1.0 的双重惩罚下可能为负，
          // 对"难度"语义无意义，故下钳到 0。
          report.difficultyScore =
            typeof rating.score === 'number'
              ? Math.round(Math.max(0, Math.min(10, rating.score / 100)) * 10) / 10
              : null;
        }
      } catch (e) {
        console.warn('[CageAnalyzerReport] 求解失败:', e && e.message);
      }
    }

    return report;
  }

  /** 开局三态分布 */
  _initialDistribution(board) {
    const analyzer = new CageAnalyzer(board);
    const s = analyzer.getSummary();
    return { open: s.open, narrowed: s.narrowed, resolved: s.resolved };
  }

  /** 回放求解步骤，记录每个从一开始非 RESOLVED 的 Cage 首次 RESOLVED 的步数（1-based fill 步） */
  _replayMilestones(board, steps) {
    const analyzer = new CageAnalyzer(board);
    const startSolved = new Set(analyzer.analyzeAll().filter(r => r.solved).map(r => r.cageId));

    const fillSteps = steps.filter(s => s && s.type === 'fill' && typeof s.row === 'number');
    const milestones = [];
    let move = 0;
    for (const s of fillSteps) {
      move++;
      try { board.setNumberAt(s.row, s.col, s.num, { recordHistory: false }); } catch (e) { continue; }
      const cur = analyzer.analyzeAll();
      for (const r of cur) {
        if (r.solved && !startSolved.has(r.cageId) && !milestones.some(m => m.cage === r.cageId)) {
          milestones.push({ cage: r.cageId, resolvedAtMove: move });
        }
      }
    }
    milestones.sort((a, b) => a.resolvedAtMove - b.resolvedAtMove);
    return milestones;
  }

  /** 统计求解步骤中的技巧使用次数 */
  _countTechniques(steps) {
    const stats = {};
    for (const s of steps) {
      if (!s || !s.technique) continue;
      stats[s.technique] = (stats[s.technique] || 0) + 1;
    }
    return stats;
  }
}

export { CageAnalyzerReport };
export default CageAnalyzerReport;