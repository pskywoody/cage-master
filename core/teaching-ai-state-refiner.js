// ============================================================
// teaching-ai-state-refiner.js — Teaching AI Phase 14.5
// 可复用 shadow 状态细化层（Phase 14 的 classifyFine 抽出为模块，供 Phase 15 复用）。
// 不改 LearnerModel 定义；只在其上叠加细粒度分类。
// 输入：LearnerModel.observe 形状的事件数组（{type, independent, hintLevel}）。
// ============================================================

/**
 * 细粒度状态分类：把 coarse 的 struggling 拆为
 * novice_exploration / temporary_error / persistent_struggle。
 */
export function classifyFine(events) {
  let errors = 0, indep = 0, guidedCorrect = 0, hintThenFail = 0, prevWasHint = false, consecErr = 0, maxConsecErr = 0;
  for (const e of events || []) {
    if (e.type === 'hint') { prevWasHint = true; continue; }
    if (e.type === 'error') {
      errors++; consecErr++; maxConsecErr = Math.max(maxConsecErr, consecErr);
      if (prevWasHint) hintThenFail++;
    } else { consecErr = 0; }
    if (e.type === 'correct') {
      consecErr = 0;
      if (e.independent === true) indep++;
      else guidedCorrect++;
    }
    prevWasHint = e.type === 'hint';
  }
  if (indep >= 2) return 'independent';
  if (guidedCorrect >= 1 && errors <= 1) return 'guided';
  if ((hintThenFail >= 1 && errors >= 2) || errors >= 3 || maxConsecErr >= 3) return 'persistent_struggle';
  if (indep + guidedCorrect >= 1 && errors >= 1) return 'temporary_error';
  if (errors === 1 && indep === 0 && guidedCorrect === 0) return 'novice_exploration';
  if (errors === 0) return 'guided';
  return 'temporary_error';
}

/** coarse 状态（用于 naive/UA-v1 对照） */
export function coarseState(events) {
  const fine = classifyFine(events);
  if (fine === 'independent') return 'independent';
  if (fine === 'guided') return 'guided';
  return 'struggling';
}

/** UA-v2 细粒度边界动作（Pareto 目标） */
export function fineAction(fine) {
  if (fine === 'persistent_struggle') return 'partial_hint';
  if (fine === 'temporary_error') return 'question';
  if (fine === 'novice_exploration') return 'free_attempt';
  if (fine === 'guided') return 'question';
  return 'free_attempt';
}

/** coarse 边界动作（Phase 11 映射） */
export function boundaryAction(coarse) {
  if (coarse === 'struggling') return 'partial_hint';
  if (coarse === 'novice') return 'question';
  if (coarse === 'guided') return 'question';
  return 'free_attempt';
}