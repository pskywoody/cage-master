// ============================================================
// teaching-ai-shadow-adapter.js — Teaching AI Phase 8
// Shadow Teaching AI Adapter：只预测、不执行教学动作。
// 输入 learnerState/technique/difficulty/history → 输出
// { recommendedAction, confidence, reason }（可解释、不落地）。
// 研究影子组件，不改 LessonPlan/HintSystem/TeachingSystem。
// ============================================================

const LEVEL_IDX = { struggling: 0, novice: 1, exposed: 1, guided: 2, independent: 3, near_mastery: 3, fluent: 4 };

/**
 * 影子推荐：根据 learner state 选择教学动作（不执行）。
 */
export function shadowRecommend({ learnerState, technique = 'hiddenPair', difficulty = 1, history = [] }) {
  const mastery = (learnerState && learnerState.mastery) || {};
  const level = mastery[technique] || 'novice';
  const idx = LEVEL_IDX[level] ?? 1;
  const errorPattern = (learnerState && learnerState.errorPattern) || 'omission';
  const frustration = (learnerState && learnerState.frustration) ?? 0.3;
  const hintDep = (learnerState && learnerState.hintDependency) ?? 0;

  let action, reason, confidence = 0.85;
  if (idx <= 0) {
    action = 'partial_hint'; reason = 'struggling: scaffold before independent attempt'; confidence = 0.9;
  } else if (idx <= 1) {
    if (errorPattern === 'guess' || errorPattern === 'weak') {
      action = 'partial_hint'; reason = 'novice with weak/guess pattern: reduce difficulty first'; confidence = 0.85;
    } else {
      action = 'question'; reason = 'novice: Socratic prompt to build independence'; confidence = 0.85;
    }
  } else if (idx <= 2) {
    action = 'question'; reason = 'guided: escalate to independent reasoning'; confidence = 0.80;
  } else {
    action = 'free_attempt'; reason = 'independent: free practice for transfer'; confidence = 0.90;
  }
  if (frustration > 0.7) {
    action = 'partial_hint'; reason = 'high frustration: de-escalate pressure'; confidence = 0.95;
  }
  if (hintDep > 0.7) {
    confidence = Math.max(0.5, confidence - 0.15);
    reason += ' (high hint dependency: prefer independence push)';
  }
  return {
    recommendedAction: action,
    confidence: Math.round(confidence * 100) / 100,
    reason,
  };
}

/**
 * 由事件流投影 learner snapshot（复用 learner-event-taxonomy 的映射）。
 */
export function projectLearnerState(events) {
  const mastery = {};
  let hintCount = 0, okCount = 0, errCount = 0, fails = 0;
  const idxOf = (lv) => LEVEL_IDX[lv] ?? 1;
  const set = (t, lv) => { if (idxOf(mastery[t] || 'novice') < idxOf(lv)) mastery[t] = lv; };
  for (const e of events) {
    const t = e.technique || 'hiddenPair';
    if (!mastery[t]) mastery[t] = 'novice';
    switch (e.action) {
      case 'skill_encounter': case 'technique_taught': set(t, 'exposed'); break;
      case 'hint_requested': case 'hint_level': case 'reveal': hintCount++; set(t, 'guided'); break;
      case 'guided_success': okCount++; set(t, 'guided'); break;
      case 'skill_used_correctly': okCount++; set(t, 'independent'); break;
      case 'skill_mastery': okCount++; set(t, 'fluent'); break;
      case 'fail': case 'mistake': errCount++; fails++; if (idxOf(mastery[t]) > 0) set(t, 'struggling'); break;
      default: break;
    }
  }
  const total = okCount + errCount + hintCount;
  return {
    mastery,
    hintDependency: total ? +(hintCount / total).toFixed(3) : 0,
    frustration: errCount > okCount ? 0.6 : 0.3,
    errorPattern: errCount > okCount ? 'misread' : 'omission',
    consecutiveFailures: fails,
  };
}