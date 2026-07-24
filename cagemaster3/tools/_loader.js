/**
 * ============================================================
 *  共享加载器 - 模拟浏览器环境并加载 TechRater / TechRaterAdapter
 * ============================================================
 *
 *  tech-rater.js 已经支持 CommonJS，可直接 require
 *  tech-rater-adapter.js 是 IIFE 格式，需要手动在模拟环境中执行
 */

const fs = require('fs');
const path = require('path');

// 项目根目录（tools/ 的上一级）
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 加载 TechRater（已有 CommonJS 支持）
const { TechRater, TECHNIQUES } = require(path.join(PROJECT_ROOT, 'game', 'tech-rater.js'));

// 加载 TechRaterAdapter（IIFE，需要模拟 window 环境）
let TechRaterAdapter;

(function loadAdapter() {
  const adapterPath = path.join(PROJECT_ROOT, 'game', 'tech-rater-adapter.js');
  const adapterCode = fs.readFileSync(adapterPath, 'utf-8');

  // 模拟全局对象
  const sandbox = {
    window: {},
    console: console,
  };
  sandbox.global = sandbox;

  // 将 TechRater 注入到模拟环境中
  sandbox.TechRater = TechRater;
  sandbox.window.TechRater = TechRater;

  // 使用 vm 模块执行
  const vm = require('vm');
  const script = new vm.Script(adapterCode, { filename: 'tech-rater-adapter.js' });
  const context = vm.createContext(sandbox);
  script.runInContext(context);

  TechRaterAdapter = sandbox.TechRaterAdapter || sandbox.window.TechRaterAdapter;

  if (!TechRaterAdapter) {
    throw new Error('[loader] Failed to load TechRaterAdapter!');
  }
})();

// ========================================================
//  Board 模拟对象工厂
// ========================================================

/**
 * 从关卡数据创建 TechRater 所需的 board 对象
 * @param {Object} level - 关卡数据（来自 all_levels.json）
 * @returns {Object} board 模拟对象
 */
function createBoardFromLevel(level) {
  const size = level.gridSize || 9;
  const cells = [];

  for (let r = 0; r < size; r++) {
    cells[r] = [];
    for (let c = 0; c < size; c++) {
      const val = level.cells[r][c] || 0;
      cells[r][c] = {
        fixedNum: val,
        fillNum: 0,
        cageId: 0,
        cageIds: [],
      };
    }
  }

  // 填充 cageIds
  if (level.cages && Array.isArray(level.cages)) {
    for (const cage of level.cages) {
      for (const [r, c] of cage.cells) {
        if (cells[r] && cells[r][c]) {
          cells[r][c].cageId = cage.id;
          cells[r][c].cageIds.push(cage.id);
        }
      }
    }
  }

  return {
    size: size,
    cells: cells,
    cages: level.cages ? level.cages.map(c => ({
      id: c.id,
      sum: c.sum,
      cells: c.cells.map(([r, cc]) => [r, cc]),
    })) : [],
  };
}

/**
 * 运行单个关卡的完整分析
 * @param {Object} level - 关卡数据
 * @returns {Object} 分析结果
 */
function analyzeLevel(level) {
  try {
    const board = createBoardFromLevel(level);
    const adapter = new TechRaterAdapter(board);
    const heatmap = adapter.generateHeatmap();

    const stats = heatmap.stats || { simple: 0, core: 0, gate: 0, totalEmpty: 0 };
    const solveResult = adapter.solveResult || { solvable: false, steps: [] };

    const simplePct = stats.totalEmpty > 0 ? (stats.simple / stats.totalEmpty * 100) : 0;
    const corePct = stats.totalEmpty > 0 ? (stats.core / stats.totalEmpty * 100) : 0;

    return {
      levelId: level.levelId,
      title: level.title,
      gridSize: level.gridSize,
      difficultyLevel: level.difficultyLevel,
      difficulty: level.difficulty,
      totalEmpty: stats.totalEmpty,
      simple: stats.simple,
      simplePct: +simplePct.toFixed(1),
      core: stats.core,
      corePct: +corePct.toFixed(1),
      gate: stats.gate,
      solveSteps: solveResult.steps ? solveResult.steps.length : 0,
      status: heatmap.status === 'valid' && solveResult.solvable ? 'valid' : 'invalid',
      solvable: solveResult.solvable,
      remainingCells: solveResult.remainingCells,
      // 附加数据（用于优化）
      _gridMeta: heatmap.gridMeta,
      _solveResult: solveResult,
      _board: board,
    };
  } catch (err) {
    return {
      levelId: level.levelId,
      title: level.title,
      gridSize: level.gridSize,
      difficultyLevel: level.difficultyLevel,
      difficulty: level.difficulty,
      totalEmpty: 0,
      simple: 0,
      simplePct: 0,
      core: 0,
      corePct: 0,
      gate: 0,
      solveSteps: 0,
      status: 'error',
      solvable: false,
      error: err.message,
      remainingCells: -1,
    };
  }
}

// ========================================================
//  导出
// ========================================================

module.exports = {
  TechRater,
  TechRaterAdapter,
  TECHNIQUES,
  createBoardFromLevel,
  analyzeLevel,
  PROJECT_ROOT,
};
