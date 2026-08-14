/**
 * ============================================================
 *  solver-aware-acceptance.js — Solver-aware Acceptance Layer（Step B1）
 * ============================================================
 *
 *  职责：不修改生成算法，只提供「什么生成结果可以被接受」的判定门。
 *
 *  流程：
 *    candidate → solver validation（唯一解 + 可演绎推完）
 *             → metric gate（笼推理率 / 难度区间 / 逻辑命中）
 *             → accepted / rejected
 *
 *  用途：
 *    用现有 generator 的产出跑过这道门，回答：
 *    「是 acceptance 层缺失（生产链路问题），还是 generator 本身不足？」
 *
 *  本模块为纯函数，不依赖 generator，可对任意 candidate（level JSON）判定。
 *
 *  用法：
 *    const { evaluateAcceptance, DEFAULT_GATES } = require('./solver-aware-acceptance');
 *    const res = evaluateAcceptance(level, { deps: { Board, TechRater }, gates: DEFAULT_GATES });
 *    // res.accepted / res.acceptedTier / res.metrics / res.gates
 *
 * ============================================================
 */

// Killer Sudoku 专属技巧：笼和唯一组合 / 45法则（星衡）。
// 它们出现才代表「玩家真的在用 cage」，而不是 Sudoku 排他。
const CAGE_REASONING_TECHS = ['cageUnique', 'rule45'];

// 星档分数区间（与 TechRater getRating().level 的划分一致）
// 1星<250 / 2星250-400 / 3星400-525 / 4星525-600 / 5星>=600
const STAR_BANDS = [
  { star: 1, min: -Infinity, max: 250, label: '1星' },
  { star: 2, min: 250, max: 400, label: '2星' },
  { star: 3, min: 400, max: 525, label: '3星' },
  { star: 4, min: 525, max: 600, label: '4星' },
  { star: 5, min: 600, max: Infinity, label: '5星' },
];

function starForScore(score) {
  for (const b of STAR_BANDS) {
    if (score >= b.min && score < b.max) return b.label;
  }
  return '5星';
}

/**
 * 求解并计算 cage 推理指标。
 * @param {Object} level - { boardData, cages, gridSize }
 * @param {Object} deps - { Board, TechRater }
 * @param {Object} options - { maxSteps }
 * @returns {{ ok:boolean, metrics?:Object, error?:string }}
 */
function computeMetrics(level, deps, options = {}) {
  const grid = level.boardData;
  const cages = level.cages;
  const size = level.gridSize || 9;
  try {
    const board = new deps.Board(size);
    board.loadLevel({ cells: grid, cages });
    const solver = new deps.TechRater(board);
    solver.solve(options.maxSteps || 2000);
    const r = solver.getRating();
    const techCount = r.techCount || {};
    const totalSteps = r.totalSteps || 0;
    const cageSteps = CAGE_REASONING_TECHS.reduce((s, t) => s + (techCount[t] || 0), 0);
    const logicRequired = Object.keys(techCount).filter((t) => t !== 'nakedSingle');
    const metrics = {
      solvable: !!r.solvable,
      score: r.score,
      level: r.level,
      totalSteps,
      remainingCells: r.remainingCells,
      nonTrivialRatio: r.nonTrivialRatio,
      techCount,
      logic_required: logicRequired,
      cage_reasoning_used: cageSteps > 0,
      cage_reasoning_ratio: totalSteps > 0 ? cageSteps / totalSteps : 0,
      cage_reasoning_steps: cageSteps,
    };
    return { ok: true, metrics };
  } catch (e) {
    return { ok: false, error: e && e.message };
  }
}

/**
 * 判定单个 gate 是否通过。
 * @param {Object} metrics
 * @param {Object} gate - 见 DEFAULT_GATES
 * @returns {{ passed:boolean, failed:string[] }}
 */
function checkGate(metrics, gate) {
  const failed = [];
  if (gate.uniqueRequired && !metrics.solvable) failed.push('non_solvable(需试错/非唯一)');
  if (gate.minCageReasoningUsed > 0 && !metrics.cage_reasoning_used) failed.push('no_cage_reasoning');
  if (gate.minCageReasoningRatio > 0 && metrics.cage_reasoning_ratio < gate.minCageReasoningRatio) {
    failed.push(`cage_reasoning_ratio_low(${(metrics.cage_reasoning_ratio * 100).toFixed(1)}%<${(gate.minCageReasoningRatio * 100).toFixed(0)}%)`);
  }
  if (gate.scoreRange) {
    const [lo, hi] = gate.scoreRange;
    if (metrics.score < lo || metrics.score > hi) {
      failed.push(`score_out_of_range(${metrics.score}∉[${lo},${hi}])`);
    }
  }
  if (gate.requiredLogic) {
    for (const t of gate.requiredLogic) {
      if (!(metrics.techCount && metrics.techCount[t] > 0)) failed.push(`missing_logic(${t})`);
    }
  }
  return { passed: failed.length === 0, failed };
}

// 三档 gate（从松到严）。G3 对应 4 星完整规格。
const DEFAULT_GATES = [
  {
    name: 'G1_基础门槛（出现 cage 推理）',
    uniqueRequired: true,
    minCageReasoningUsed: 1,   // cageUnique 或 rule45 至少命中 1 步
    minCageReasoningRatio: 0,
    requiredLogic: [],
  },
  {
    name: 'G2_推理率门槛（ratio≥20%）',
    uniqueRequired: true,
    minCageReasoningRatio: 0.20,
    requiredLogic: [],
  },
  {
    name: 'G3_四星完整规格（400-600 + 三技巧 + ratio>40%）',
    uniqueRequired: true,
    minCageReasoningRatio: 0.40,
    scoreRange: [400, 600],
    requiredLogic: ['hiddenSingle', 'cageUnique', 'rule45'],
  },
];

/**
 * 对单个 candidate 做完整 acceptance 判定。
 * @param {Object} level
 * @param {Object} options - { deps, gates=DEFAULT_GATES, maxSteps }
 * @returns {Object} { accepted, tierIndex, acceptedTier, metrics, gates }
 */
function evaluateAcceptance(level, options) {
  const deps = options.deps;
  const gates = options.gates || DEFAULT_GATES;
  const { ok, metrics, error } = computeMetrics(level, deps, { maxSteps: options.maxSteps });
  if (!ok) {
    return {
      accepted: false,
      tierIndex: -1,
      acceptedTier: null,
      metrics: null,
      error,
      gates: gates.map((g) => ({ name: g.name, passed: false, failed: ['solve_error'] })),
    };
  }
  const gateResults = gates.map((g) => ({ name: g.name, ...checkGate(metrics, g) }));
  const firstPassed = gateResults.findIndex((g) => g.passed);
  return {
    accepted: firstPassed >= 0,
    tierIndex: firstPassed,
    acceptedTier: firstPassed >= 0 ? gateResults[firstPassed].name : null,
    metrics,
    gates: gateResults,
  };
}

// 导出（hybrid：兼容 CommonJS / ESM / 浏览器全局）
const API = {
  computeMetrics,
  checkGate,
  evaluateAcceptance,
  DEFAULT_GATES,
  CAGE_REASONING_TECHS,
  STAR_BANDS,
  starForScore,
};
if (typeof module !== 'undefined' && module.exports) {
  module.exports = API;
}
if (typeof window !== 'undefined') {
  window.SolverAwareAcceptance = API;
}
if (typeof globalThis !== 'undefined') {
  globalThis.SolverAwareAcceptance = API;
}