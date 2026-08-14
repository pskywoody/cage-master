// ==========================================
// CageAnalyzer - Cage Resolution Layer (Step 1)
// ==========================================
// 把 Cage 从"谜题元素"提升为"可判定状态的调查单位"。
//
// 纯后台模块，不修改任何 level json，只在运行时计算。
//
// 输入：board（Board 实例）
// 输出：每个 Cage 的推理生命周期状态
//
// 三态定义（语义修正 v2，用户确定）：
//   OPEN      - 当前 Cage 没有产生新的约束信息：候选组合数 == 仅按"格子数和"枚举的理论组合数
//               （行/列/宫/位置约束尚未收窄它）
//   NARROWED  - 已被棋盘约束收窄，但尚未确定到唯一（候选存在，但未锁定）
//   RESOLVED  - Cage 内部关系已经完全确定：每个空格的值被强制（唯一指派），或已全部填满
//
// 重要区分（用户强调）：
//   SolverState（系统判定）≠ PlayerState（玩家调查状态）。
//   本模块只计算 SolverState（数学可解状态）。PlayerState 预留字段，709 终章可能需要
//   "所有 Cage 已 resolved，但玩家最后才确认 evidence" → Door was already closed.
//
// 另注意：候选组合唯一（SolverState 层面）≠ RESOLVED。
//   例：sum=3、两格 = 1+2，组合唯一但位置未知，仍是 NARROWED。
//   RESOLVED 必须由"空格指派唯一"（assignments.length === 1）判定。
// ==========================================

import { Rule45 } from './migrated/rule45.js';

export const CAGE_STATE = {
  OPEN: 'OPEN',              // 无有效约束变化（原 UNKNOWN）
  NARROWED: 'NARROWED',      // 已被约束收窄、未锁定（原 ACTIVE）
  RESOLVED: 'RESOLVED',      // 内部关系完全确定
};

class CageAnalyzer {
  /**
   * @param {Board} board - 已加载关卡的 Board 实例
   */
  constructor(board) {
    this.board = board;
    /** @private 变化追踪：cageId → 上一次 solverState（供 changed 判定） */
    this._lastStates = new Map();
  }

  // ---------- 底层读取（带降级） ----------

  /** 构建当前数字网格（0=空格） */
  _buildGrid() {
    if (this.board._buildGrid) return this.board._buildGrid();
    const size = this.board.size;
    const grid = [];
    for (let r = 0; r < size; r++) {
      grid[r] = [];
      for (let c = 0; c < size; c++) {
        const cell = this.board.cells[r][c];
        grid[r][c] = cell.fixedNum || cell.fillNum || 0;
      }
    }
    return grid;
  }

  /** 获取某空格在当前棋盘下的候选数（复用引擎的完整约束：行/列/宫/笼和） */
  _cellCandidates(grid, r, c) {
    if (this.board._getCellCandidates) return this.board._getCellCandidates(grid, r, c);
    if (this.board.getNotesArray) return this.board.getNotesArray(r, c);
    return [];
  }

  // ---------- 核心：枚举 Cage 空格的所有合法指派 ----------

  /**
   * 枚举一个 Cage 内所有空格的合法指派。
   * 约束：每个空格的数字 ∈ 其候选集；Cage 内数字不重复；剩余数字之和 = (sum - 已填和)。
   * @returns {{ assignments: number[][], filledSum: number, emptyCells: number[][], forced: boolean }}
   */
  _enumerateAssignments(cage, grid) {
    const emptyCells = [];
    let filledSum = 0;
    const usedInCage = new Set();

    for (const [r, c] of cage.cells) {
      const v = grid[r][c];
      if (v !== 0) {
        filledSum += v;
        usedInCage.add(v);
      } else {
        emptyCells.push([r, c]);
      }
    }

    if (emptyCells.length === 0) {
      return { assignments: [[]], filledSum, emptyCells, usedInCage };
    }

    const remain = cage.sum - filledSum;
    const opts = emptyCells.map(([r, c]) => this._cellCandidates(grid, r, c));

    const assignments = [];
    const cur = [];
    const used = new Set(usedInCage);

    const backtrack = (idx, sumLeft) => {
      if (idx === opts.length) {
        if (sumLeft === 0) assignments.push([...cur]);
        return;
      }
      for (const num of opts[idx]) {
        if (used.has(num)) continue;      // Cage 内不重复
        if (sumLeft - num < 0) continue;  // 和超了
        used.add(num);
        cur.push(num);
        backtrack(idx + 1, sumLeft - num);
        cur.pop();
        used.delete(num);
      }
    };
    backtrack(0, remain);

    return { assignments, filledSum, emptyCells, usedInCage };
  }

  /** 从指派列表提取不同的"数字组合"（升序去重），这是推理空间 */
  _combosFromAssignments(assignments) {
    const seen = new Set();
    const combos = [];
    for (const a of assignments) {
      const sorted = [...a].sort((x, y) => x - y);
      const key = sorted.join(',');
      if (!seen.has(key)) {
        seen.add(key);
        combos.push(sorted);
      }
    }
    return combos;
  }

  // ---------- 公共 API ----------

  /**
   * 分析单个 Cage，返回运行时状态对象。
   * @param {Object} cage - { id, sum, cells: [[r,c],...] }
   * @param {number[][]} [grid] - 可选，调用方已构建的网格
   * @returns {Object}
   *   { cageId, solverState, state, playerState, solved, candidates, emptyCount, forced, narrowed?, conflict? }
   */
  analyze(cage, grid = null) {
    const g = grid || this._buildGrid();
    const { assignments, filledSum, emptyCells } = this._enumerateAssignments(cage, g);
    const remain = cage.sum - filledSum;
    const emptyCount = emptyCells.length;

    // 全部填满 → RESOLVED
    if (emptyCount === 0) {
      return this._mk(cage.id, CAGE_STATE.RESOLVED, true, [], 0, true, {});
    }

    const combos = this._combosFromAssignments(assignments);
    const forced = assignments.length === 1; // 唯一指派 → 每格值被强制

    // 唯一指派，即使候选组合早已唯一，也归为 RESOLVED（位置确定）
    if (forced) {
      return this._mk(cage.id, CAGE_STATE.RESOLVED, true, combos, emptyCount, true, {});
    }

    // 无解（当前棋盘让该 Cage 无法成立，玩家填错）——不应正常发生
    if (combos.length === 0) {
      return this._mk(cage.id, CAGE_STATE.NARROWED, false, [], emptyCount, false, { conflict: true });
    }

    // 理论组合数：仅按"空格数和"枚举（来自 Rule45），代表未收窄的推理广度
    const theoreticalMax = Rule45.findCombinations(emptyCount, remain).length;
    const narrowed = combos.length < theoreticalMax;
    const solverState = narrowed ? CAGE_STATE.NARROWED : CAGE_STATE.OPEN;

    return this._mk(cage.id, solverState, false, combos, emptyCount, false, { narrowed });
  }

  /** 统一构造返回对象（含 solverState / playerState 预留槽） */
  _mk(cageId, solverState, solved, candidates, emptyCount, forced, extra) {
    return {
      cageId,
      solverState,            // 系统判定（数学可解状态）
      state: solverState,     // 兼容别名（展示用，与 solverState 相同）
      playerState: null,      // 玩家调查状态（预留。UNSEEN/DISCOVERED... 709 终章需要，当前不计算）
      solved,
      candidates,
      emptyCount,
      forced,
      ...extra,
    };
  }

  /** 分析棋盘上所有 Cage（并做 changed 变化追踪） */
  analyzeAll() {
    const cages = this.board.cages || [];
    const grid = this._buildGrid();
    const results = cages.map(cage => this.analyze(cage, grid));
    for (const r of results) {
      const prev = this._lastStates.get(r.cageId);
      r.changed = prev !== undefined && prev !== r.solverState;
      this._lastStates.set(r.cageId, r.solverState);
    }
    return results;
  }

  /** 汇总三态统计（供 debug / 关卡设计分析） */
  getSummary() {
    const results = this.analyzeAll();
    const summary = {
      total: results.length,
      open: 0,
      narrowed: 0,
      resolved: 0,
      solved: 0,
      changed: 0,
    };
    for (const r of results) {
      if (r.solved) summary.solved++;
      if (r.changed) summary.changed++;
      if (r.solverState === CAGE_STATE.RESOLVED) summary.resolved++;
      else if (r.solverState === CAGE_STATE.NARROWED) summary.narrowed++;
      else summary.open++;
    }
    return summary;
  }
}

export { CageAnalyzer };
export default CageAnalyzer;