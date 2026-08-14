// ==========================================
// CaseAnalyzerReport - Case Analytics (Step 2.5 v3, FROZEN)
// ==========================================
// 架构定位（用户确认，冻结）：
//   Cage State → Case Analyzer → Evidence Graph → Notes Binding → Narrative/Investigation UI
// 不是 Difficulty → Notes（那是普通 Sudoku 的老路）。
//
// 两个指标并存、各自独立：
//   difficultyScore = 解法复杂度（传统、非 Shemmo 核心）
//   caseScore       = 案件展开程度（调查结构复杂度，Shemmo 核心）
//
// 核心指标：
//   closurePoint    = 案件真正关闭的位置（不是最后一格填完，而是最后一个关键证据确认）
//   caseScore       = 0.40*investigationDepth + 0.25*dependencyDepth + 0.35*closurePoint
//   evidenceValue   = 单个 Cage 的调查价值（决定 Notes 是否值得绑定）
//   criticalEvidencePath = 关键证据依赖链
//   closureEvent    = 案件收束事件描述
//
// Evidence 不是记录答案，而是记录"为什么这个地方开始变得重要"。
// ==========================================

import { CageAnalyzer, CAGE_STATE } from './cage-analyzer.js';

function _getGlobal(name) {
  if (typeof window !== 'undefined' && window[name]) return window[name];
  if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
  return null;
}

function _clamp01(v) { return v <= 0 ? 0 : (v >= 1 ? 1 : v); }

class CaseAnalyzerReport {
  analyze(levelData) {
    const Board = _getGlobal('Board');
    if (!Board) throw new Error('[CaseAnalyzerReport] 未找到全局 Board');
    const TechRater = _getGlobal('TechRater');

    const gridSize = levelData.gridSize || (levelData.boardData || levelData.cells || []).length || 9;
    const board = new Board(gridSize);
    board.loadLevel({ cells: levelData.boardData || levelData.cells, cages: levelData.cages, gridSize });
    const cageIds = (levelData.cages || []).map(c => c.id);

    const analyzer = new CageAnalyzer(board);
    const init = analyzer.getSummary();
    const total = init.total || 1;

    // ---- 求解 ----
    let steps = [];
    if (TechRater) {
      try {
        const rater = new TechRater(board);
        const sol = rater.solve(200);
        steps = (sol && sol.steps) || [];
      } catch (e) {
        console.warn('[CaseAnalyzerReport] 求解失败:', e && e.message);
      }
    }
    const fillSteps = steps.filter(s => s && s.type === 'fill' && typeof s.row === 'number');
    const totalMoves = fillSteps.length;

    // ---- 回放：逐 Cage 追踪迁移 ----
    const startResolved = new Set(analyzer.analyzeAll().filter(r => r.solved).map(r => r.cageId));
    const ev = {}; // cageId -> { states:Set, narrowedAt, resolvedAt }
    for (const cid of cageIds) {
      ev[cid] = { states: new Set([CAGE_STATE.RESOLVED]), narrowedAt: null, resolvedAt: null };
      if (!startResolved.has(cid)) ev[cid] = { states: new Set(), narrowedAt: null, resolvedAt: null };
    }

    let maxNarrowed = init.narrowed;
    let move = 0;
    for (const s of fillSteps) {
      move++;
      try { board.setNumberAt(s.row, s.col, s.num, { recordHistory: false }); } catch (e) { continue; }
      const cur = analyzer.analyzeAll();
      let nNa = 0;
      for (const r of cur) {
        if (r.solverState === CAGE_STATE.NARROWED) nNa++;
        const e = ev[r.cageId];
        if (!e) continue;
        e.states.add(r.solverState);
        if (r.solverState === CAGE_STATE.NARROWED && e.narrowedAt === null) e.narrowedAt = move;
        if (r.solverState === CAGE_STATE.RESOLVED && e.resolvedAt === null) e.resolvedAt = move;
      }
      if (nNa > maxNarrowed) maxNarrowed = nNa;
    }

    // ---- 动态收束笼（非开局已解决、求解中才 RESOLVED）按收束时间排序 ----
    const dynamic = cageIds
      .filter(cid => ev[cid].resolvedAt !== null)
      .map(cid => ({
        cage: cid,
        states: [...ev[cid].states],
        narrowedAt: ev[cid].narrowedAt,
        resolvedAt: ev[cid].resolvedAt,
        preResolved: startResolved.has(cid),
      }))
      .sort((a, b) => (a.resolvedAt ?? 0) - (b.resolvedAt ?? 0));

    const dynamicResolves = dynamic.length;
    const firstResolve = dynamicResolves ? dynamic.filter(d => !d.preResolved)[0]?.resolvedAt ?? null : null;
    const allResolve = dynamic.filter(d => !d.preResolved);
    const lastResolve = allResolve.length ? allResolve[allResolve.length - 1].resolvedAt : null;

    // ---- 1. Investigation Depth ----
    const activeCages = init.open + init.narrowed;
    const openRatio = activeCages / total;
    const narrowingGrowth = Math.max(0, maxNarrowed - init.narrowed);
    const investigationDepth = _clamp01(openRatio + (total > 0 ? narrowingGrowth / total : 0));

    // ---- 2. Evidence Dependency ----
    const dynamicNonPre = allResolve;
    const dynamicResolveRatio = total > 0 ? dynamicResolves / total : 0;
    const temporalSpread = totalMoves > 0 && firstResolve !== null && lastResolve !== null
      ? Math.max(0, (lastResolve - firstResolve)) / totalMoves
      : 0;
    const dependencyDepth = _clamp01(dynamicResolveRatio + temporalSpread);

    // ---- 3. Closure Timing ----
    const earlyResolvedRatio = init.resolved / total;
    const delayedClosure = totalMoves > 0 && lastResolve !== null ? lastResolve / totalMoves : 0;
    const closurePoint = _clamp01(delayedClosure - earlyResolvedRatio);

    // ---- caseScore ----
    const caseScore = Math.round(10 * (0.40 * investigationDepth + 0.25 * dependencyDepth + 0.35 * closurePoint) * 10) / 10;

    // ---- evidenceValue：逐 Cage 调查价值 ----
    //   组件（均 0-1）：
    //     transitionWeight  状态迁移完整度（OPEN→NARROWED→RESOLVED 最高）
    //     dependencyCount   依赖该笼的下游收束笼数占比（排在它后面收束的笼）
    //     delayWeight       收束时刻延迟度（越晚越支撑案件展开）
    //     uniquenessWeight  同一步收束的笼越少越独特（关键节点）
    //   evidenceValue = 10 * clamp01(0.35*transition + 0.25*dependency + 0.20*delay + 0.20*uniqueness)
    const byMove = {};
    for (const d of dynamic) { if (d.resolvedAt !== null) byMove[d.resolvedAt] = (byMove[d.resolvedAt] || 0) + 1; }
    const evidenceNodes = dynamic.map((d, idx) => {
      const hasOpen = d.states.includes(CAGE_STATE.OPEN);
      const hasNarrow = d.states.includes(CAGE_STATE.NARROWED);
      const hasResolved = d.states.includes(CAGE_STATE.RESOLVED);
      let transitionWeight;
      if (hasOpen && hasNarrow && hasResolved) transitionWeight = 1.0;
      else if ((hasOpen || hasNarrow) && hasResolved) transitionWeight = 0.6;
      else transitionWeight = 0.3; // 开局已解决或其他

      const downstream = dynamic.length - 1 - idx; // 排在它之后收束的笼（含已预解决? 用动态总链）
      const dependencyCount = dynamic.length > 0 ? downstream / dynamic.length : 0;

      const delayWeight = d.resolvedAt !== null && totalMoves > 0 ? d.resolvedAt / totalMoves : 0;

      const sameMove = d.resolvedAt !== null ? (byMove[d.resolvedAt] || 1) : 1;
      const uniquenessWeight = sameMove > 0 ? _clamp01(1 / sameMove) : 0;

      const evidenceValue = Math.round(
        10 * _clamp01(0.35 * transitionWeight + 0.25 * dependencyCount + 0.20 * delayWeight + 0.20 * uniquenessWeight) * 10
      ) / 10;

      return {
        cage: d.cage,
        states: d.states,
        preResolved: d.preResolved,
        focusedAtMove: d.narrowedAt,
        resolvedAtMove: d.resolvedAt,
        weights: {
          transition: +transitionWeight.toFixed(2),
          dependency: +dependencyCount.toFixed(2),
          delay: +delayWeight.toFixed(2),
          uniqueness: +uniquenessWeight.toFixed(2),
        },
        evidenceValue,
      };
    });

    // ---- criticalEvidencePath：关键证据依赖链 ----
    // 取动态收束笼中 evidenceValue 较高者，按收束顺序连成链
    const pathThreshold = 0.5;
    const criticalEvidencePath = evidenceNodes
      .filter(n => n.evidenceValue >= 5 && !n.preResolved)
      .sort((a, b) => (a.resolvedAtMove ?? 0) - (b.resolvedAtMove ?? 0))
      .map(n => n.cage);

    // ---- closureEvent：案件收束事件 ----
    const lastEvidence = allResolve.length ? allResolve[allResolve.length - 1] : null;
    const closureEvent = {
      move: lastEvidence ? lastEvidence.resolvedAt : null,
      totalMoves,
      cage: lastEvidence ? lastEvidence.cage : null,
      closurePoint,
      description: lastEvidence
        ? (closurePoint >= 0.7 ? '案件持续到终局才收束' :
           closurePoint >= 0.3 ? '案件有调查但证据链较短' :
           '案件在开局即已基本归档，玩家主要执行收尾')
        : '案件自始即归档',
    };

    // ---- 案件分级 ----
    let caseGrade;
    if (caseScore >= 6.0) caseGrade = 'A_case';
    else if (caseScore >= 3.0) caseGrade = 'B_partial';
    else caseGrade = 'C_dead';

    return {
      level: levelData.levelId ?? board.levelId ?? null,
      gridSize,
      cages: total,
      initial: { open: init.open, narrowed: init.narrowed, resolved: init.resolved },
      investigation: {
        initialOpen: init.open,
        initialNarrowed: init.narrowed,
        initialResolved: init.resolved,
        peakNarrowed: maxNarrowed,
        narrowingGrowth,
        timeToFirstResolution: firstResolve,
        timeToLastResolution: lastResolve,
        investigationDepth: +investigationDepth.toFixed(3),
      },
      dependency: {
        dynamicResolves,
        dynamicResolveRatio: +dynamicResolveRatio.toFixed(3),
        temporalSpread: +temporalSpread.toFixed(3),
        dependencyDepth: +dependencyDepth.toFixed(3),
      },
      closure: {
        earlyResolvedRatio: +earlyResolvedRatio.toFixed(3),
        delayedClosure: +delayedClosure.toFixed(3),
        closurePoint: +closurePoint.toFixed(3),
        totalMoves,
      },
      caseScore,
      caseGrade,
      // ---- 新增（v3）----
      evidence: {
        nodeCount: evidenceNodes.length,
        avgEvidenceValue: evidenceNodes.length ? +(evidenceNodes.reduce((s, n) => s + n.evidenceValue, 0) / evidenceNodes.length).toFixed(2) : 0,
        totalEvidenceValue: +(evidenceNodes.reduce((s, n) => s + n.evidenceValue, 0)).toFixed(1),
        nodes: evidenceNodes,
      },
      criticalEvidencePath,
      closureEvent,
    };
  }
}

export { CaseAnalyzerReport };
export default CaseAnalyzerReport;