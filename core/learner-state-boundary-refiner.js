// core/learner-state-boundary-refiner.js
// Shadow State Boundary Refiner（Phase 12.5）。
// 在 LearnerModel 粗状态之上，用可观测证据区分 novice/temporary/persistent 边界。
// 只读；不改 LearnerModel；不接 Policy；不进入生产。

export const BOUNDARY_STATES = ['novice_exploration', 'temporary_error', 'persistent_struggle', 'guided', 'independent'];

function clamp(x, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, x)); }
function round3(x) { return Math.round(x * 1000) / 1000; }

function sig(c, d) { return clamp(c + d); }

/**
 * 关键：只精修 novice / struggling 边界。guided / independent 透传。
 * @param {{inferredState:string, confidence:number, evidence:Object}} input
 * @returns {{shadowState:string, confidence:number, alternatives:Array}}
 */
export function refineBoundary({ inferredState, confidence, evidence } = {}) {
  evidence = evidence || {};
  const f = evidence.failures || 0;
  const h = evidence.hints || 0;
  const r = evidence.recoveryAttempts || 0;
  const prev = !!evidence.previousSkillMastery;

  // guided / independent / mastered 透传：保持 Phase 12 已证可靠性
  if (inferredState === 'guided' || inferredState === 'independent' || inferredState === 'mastered') {
    return { shadowState: inferredState === 'mastered' ? 'independent' : inferredState, confidence: Math.max(confidence || 0, 0.85), alternatives: [] };
  }

  // 三条区分信号打分（recovery / hint elasticity / technique transfer）
  const sNovice = sig(0.55,
    (!prev ? 0.15 : -0.15) + (f <= 1 ? 0.12 : -0.12) + (h <= 1 ? 0.08 : -0.08) + (r >= 1 ? 0.10 : -0.05));
  const sTemp = sig(0.55,
    (prev ? 0.15 : -0.15) + (f <= 1 ? 0.12 : -0.10) + (r >= 1 ? 0.15 : -0.15) + (h <= 1 ? 0.05 : -0.05));
  const sStruggle = sig(0.55,
    (f >= 2 ? 0.15 : -0.15) + (h >= 1 ? 0.12 : -0.10) + (r === 0 ? 0.12 : -0.12) + (f >= 3 ? 0.06 : 0));

  const scores = [
    { state: 'novice_exploration', score: sNovice },
    { state: 'temporary_error', score: sTemp },
    { state: 'persistent_struggle', score: sStruggle },
  ].sort((a, b) => b.score - a.score);

  const top = scores[0];
  const sum = scores.reduce((a, b) => a + b.score, 0);
  const alternatives = scores.slice(1).filter((s) => s.score > 0.25).map((s) => ({
    state: s.state,
    probability: round3(s.score / (sum || 1)),
  }));

  return {
    shadowState: top.state,
    confidence: round3(top.score),
    alternatives,
  };
}