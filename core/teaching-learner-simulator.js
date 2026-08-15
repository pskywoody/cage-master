// ============================================================
// teaching-learner-simulator.js — Teaching AI Phase 2
// Learner Response Model（研究模拟器）。
//
// 注意：这是 simulator，不是生产 LearnerModel。规则刻意简单、可解释，
// 只用于回答「同一 learner 状态 + 不同教学策略 → 是否产生不同结果」。
// 不接真实用户数据，不宣称真实学习增益。
// ============================================================

export const SKILL_LEVELS = ['struggling', 'novice', 'guided', 'independent', 'fluent'];
const IDX = Object.fromEntries(SKILL_LEVELS.map((l, i) => [l, i]));

function clamp(x, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, x)); }
function round2(x) { return Math.round(x * 100) / 100; }

const ACTION_TYPES = {
  demo: ['demo', 'show_optimal', 'show_trajectory', 'reference'],
  reveal: ['reveal'],
  guided: ['guided_question', 'hint_step', 'ease_hint', 'surface_mistake'],
  challenge: ['challenge', 'pose_challenge', 'probe_weakness', 'edge_case'],
};

function actionType(action) {
  for (const [type, acts] of Object.entries(ACTION_TYPES)) {
    if (acts.includes(action)) return type;
  }
  return 'guided';
}

/**
 * Get skill mastery level name (default 'novice').
 */
export function skillLevel(learnerState, technique) {
  return (learnerState.mastery && learnerState.mastery[technique]) || 'novice';
}

/**
 * 一步 learner 反应。
 * @param {{ learnerState: object, teachingAction: string, technique?: string }} input
 */
export function stepLearner({ learnerState, teachingAction, technique = 'hiddenPair' }) {
  const ls = learnerState || { mastery: { [technique]: 'novice' }, frustration: 0.3, engagement: 0.6, consecutiveFailures: 0 };
  const mastery = ls.mastery || { [technique]: 'novice' };
  const cur = mastery[technique] || 'novice';
  const idx = IDX[cur] ?? IDX.novice;
  const type = actionType(teachingAction);
  const frustration = ls.frustration ?? 0.3;
  const engagement = ls.engagement ?? 0.6;
  const fails = ls.consecutiveFailures ?? 0;

  let delta = 0, success = 0, engDelta = 0, frustDelta = 0;

  switch (type) {
    case 'demo': // 示范/最优解/参照轨迹
      success = 0.75 + 0.05 * idx;
      if (idx <= 1) { delta = 1; engDelta = 0.10; frustDelta = -0.10; }
      else if (idx === 2) { delta = 0; engDelta = 0.05; frustDelta = -0.05; }
      else { delta = 0; engDelta = 0.0; frustDelta = 0.0; }
      break;
    case 'reveal': // 直接给答案
      success = 0.95;
      delta = 0; // 本步成功但几乎不促进掌握
      engDelta = -0.02; frustDelta = -0.05;
      break;
    case 'guided': // 引导式提示
      success = 0.60 + 0.06 * idx;
      if (idx === 0) { delta = 1; engDelta = 0.08; frustDelta = -0.15; } // recovery
      else if (idx === 1 || idx === 2) { delta = 1; engDelta = 0.06; frustDelta = -0.08; }
      else { delta = 0; engDelta = 0.02; frustDelta = -0.03; }
      break;
    case 'challenge': // 挑战/探边界
      if (idx >= 3) { success = 0.80; delta = (idx === 3 ? 1 : 0); engDelta = 0.08; frustDelta = 0; }
      else if (idx === 2) { success = 0.60; delta = 1; engDelta = 0.04; frustDelta = 0.10; }
      else { success = 0.30; delta = 0; engDelta = -0.08; frustDelta = 0.20; } // 高难度压低掌握者
      break;
    default: break;
  }

  if (fails >= 2) { frustDelta += 0.15; engDelta -= 0.05; }

  const newIdx = clamp(idx + delta, 0, SKILL_LEVELS.length - 1);
  const nextMastery = { ...mastery, [technique]: SKILL_LEVELS[newIdx] };

  return {
    nextSkillState: { [technique]: SKILL_LEVELS[newIdx] },
    successProbability: clamp(success),
    engagementSignal: round2(engDelta),
    frustrationRisk: round2(frustDelta),
    nextLearnerState: {
      mastery: nextMastery,
      frustration: round2(clamp(frustration + frustDelta)),
      engagement: round2(clamp(engagement + engDelta)),
    },
  };
}