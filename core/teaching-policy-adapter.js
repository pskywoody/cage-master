// ============================================================
// core/teaching-policy-adapter.js — P1 Teaching Policy Adapter
// CM4 PRODUCT VALIDATION PHASE · 第一步（P1）
//
// 作用：把研究层资产（Phase 12.5 Learner-State-Boundary-Refiner +
//       Phase 14 UA-v2 Policy）包成运行时可消费的 TeachingDecisionProposal。
//
// 纪律（与 Phase 14 冻结一致）：
//   - 纯影子：只产出提案（proposal），绝不执行教学动作。
//   - 不接 HintSystem / LessonPlayer / TeachingSystem runtime。
//   - 不改 LearnerModel / HintSystem / TeachingSystem / Experiment Platform。
//   - 不自动触发教学、不改 mastery 定义。
//   - shadowOnly 硬编码为 true（提案永不等同于执行）。
//
// 依赖：仅读 core/learner-model.js（只读 observe/skillState）与
//      core/learner-state-boundary-refiner.js（只读 refineBoundary）。
//      不依赖其他 agent 的 WIP（如 teaching-policy-layer.js），
//      以保证 P1 可独立冻结、可独立验证。
// ============================================================

import { LearnerModel } from './learner-model.js';
import { refineBoundary, BOUNDARY_STATES } from './learner-state-boundary-refiner.js';

// ---- 版本常量 ----
// POLICY_VERSION 锁定到 Phase 14 冻结的 UA-v2 研究资产（anchor f763ff8）。
export const POLICY_VERSION = 'UA-v2@2026-08-16';
export const ADAPTER_VERSION = '1.0.0';
export const SHADOW_ONLY = true;

// ---- UA-v2 动作空间（Phase 14 schema §4）----
// 与 Phase 14 验收期望动作（§5）一致。
export const UA_V2_MAP = Object.freeze({
  novice_exploration: 'observe',
  temporary_error: 'question',
  persistent_struggle: 'partial_hint',
  guided: 'backoff',
  independent: 'backoff',
});

// 介入类动作（脚手架）：用于 false_backoff / false_intervention 判定。
const INTERVENE = new Set(['partial_hint', 'teach']);

// 低置信安全兜底阈值（与 Phase 14 UA-v2 一致）。
const LOW_CONF_THRESHOLD = 0.4;

/**
 * 从原始事件流推导 refiner 所需的 evidence（不修改 LearnerModel）。
 * @param {Array} events - [{ technique, type:'encounter'|'correct'|'hint'|'error', independent?, hintLevel? }]
 * @param {string} technique
 * @returns {{failures:number, hints:number, recoveryAttempts:number, previousSkillMastery:boolean}}
 */
export function deriveEvidence(events, technique) {
  const te = (events || []).filter((e) => e && e.technique === technique);
  const failures = te.filter((e) => e.type === 'error').length;
  const hints = te.filter((e) => e.type === 'hint').length;
  // recoveryAttempts：error → correct 的相邻转移次数
  let recoveryAttempts = 0;
  for (let i = 0; i + 1 < te.length; i++) {
    if (te[i].type === 'error' && te[i + 1].type === 'correct') recoveryAttempts++;
  }
  // previousSkillMastery：首个 error 之前是否已成功过（即"曾经会、现在卡"）
  const firstErrorIdx = te.findIndex((e) => e.type === 'error');
  const previousSkillMastery =
    firstErrorIdx > 0 && te.slice(0, firstErrorIdx).some((e) => e.type === 'correct');
  // independentCorrect：独立做对次数（independent:true），用于 unknown 态的兜底推断
  const independentCorrect = te.filter((e) => e.type === 'correct' && e.independent === true).length;
  return { failures, hints, recoveryAttempts, previousSkillMastery, independentCorrect };
}

/**
 * LearnerModel 粗状态 → refiner 期望的粗词汇。
 * 关键点：hint 多但失败也多的学习者会被 LearnerModel 标成 guided；
 * 若直接透传会丢失 persistent_struggle（重新引入 false_backoff 根因）。
 * 故 guided 且 failures>=2 视作 struggling（与 Phase 14 coarseState 映射一致），
 * 进入 refiner 精修分支。
 * @param {LearnerModel} model
 * @param {string} technique
 * @param {Array} events
 * @returns {'novice'|'struggling'|'guided'|'independent'}
 */
export function coarseForRefiner(model, technique, events) {
  const { state } = model.skillState(technique);
  if (state === 'independent' || state === 'mastered') return 'independent';
  if (state === 'guided') {
    return deriveEvidence(events, technique).failures >= 2 ? 'struggling' : 'guided';
  }
  // unknown / exposed：若证据显示已多次独立做对，则视为 independent（对抗 encounter 事件缺失的边界）；
  // 否则进入精修分支（novice）。
  return deriveEvidence(events, technique).independentCorrect >= 2 ? 'independent' : 'novice';
}

/**
 * 对单一 technique 跑完整精修链路（refiner）。
 * @returns {{shadowState:string, confidence:number, alternatives:Array}}
 */
export function refineForTechnique(model, technique, events) {
  const inferredState = coarseForRefiner(model, technique, events);
  const { confidence } = model.skillState(technique);
  const evidence = deriveEvidence(events, technique);
  return refineBoundary({ inferredState, confidence, evidence });
}

/**
 * UA-v2 策略映射（Phase 14 schema §3 Policy C）。
 * @param {string} refinedState
 * @param {number} refinedConf
 * @returns {{action:string, reason:string, risk:Object}}
 */
export function applyUAv2(refinedState, refinedConf) {
  if (refinedConf < LOW_CONF_THRESHOLD) {
    return {
      action: 'question',
      reason: `low_confidence_safe_observe(conf=${refinedConf.toFixed(2)})`,
      risk: { false_backoff: false, dependency_risk: 'low' },
    };
  }
  const action = UA_V2_MAP[refinedState] || 'question';
  const confBand = refinedConf >= 0.85 ? 'high' : refinedConf >= 0.6 ? 'med' : 'low';
  const reason = `${refinedState}(conf=${confBand})→${action}`;
  const risk = {
    false_backoff: refinedState === 'persistent_struggle' && !INTERVENE.has(action),
    dependency_risk: action === 'teach' ? 'high' : 'low', // partial_hint 仅最低依赖（与 schema §2 示例一致）
  };
  return { action, reason, risk };
}

/**
 * 选择本 session 的关注 technique（提案以单 technique 的精修状态为代表）。
 * 默认取事件流中最后一条事件的 technique（最近活动）。
 * @param {Array} events
 * @returns {string|null}
 */
export function pickFocusTechnique(events) {
  if (!events || !events.length) return null;
  const last = events[events.length - 1];
  return (last && last.technique) || null;
}

/**
 * 核心入口：消费一个 session 的 learner 事件流，产出 TeachingDecisionProposal。
 *
 * @param {{sessionId:string, events:Array, technique?:string}} input
 * @returns {Object} TeachingDecisionProposal（含 shadowOnly:true）
 *
 * 提案契约（P1 验收字段）：
 *   sessionId, learnerState, confidence, suggestedAction, reason,
 *   risk, policyVersion, shadowOnly
 * 扩展字段（可解释性）：technique, alternatives, coarseState, evidence。
 */
export function propose({ sessionId, events, technique }) {
  const tech = technique || pickFocusTechnique(events);

  // 无事件 / 无 technique：保守观察，不介入。
  if (!tech) {
    return {
      sessionId,
      learnerState: 'unknown',
      confidence: 0,
      suggestedAction: 'observe',
      reason: 'no_events_or_technique:safe_observe',
      risk: { false_backoff: false, dependency_risk: 'low' },
      policyVersion: POLICY_VERSION,
      shadowOnly: SHADOW_ONLY,
    };
  }

  // 本地实例化 LearnerModel（影子实例，不触碰生产 singleton）
  const model = new LearnerModel();
  (events || []).forEach((e) => model.observe(e));

  const coarse = model.skillState(tech);
  const refinedOut = refineForTechnique(model, tech, events);
  const ua = applyUAv2(refinedOut.shadowState, refinedOut.confidence);
  const ev = deriveEvidence(events, tech);

  const reason =
    `${refinedOut.shadowState}(conf=${refinedOut.confidence.toFixed(2)}) ` +
    `via UA-v2 → ${ua.action}; ` +
    `evidence(f=${ev.failures},h=${ev.hints},r=${ev.recoveryAttempts},prev=${ev.previousSkillMastery}); ` +
    `coarse=${coarse.state}`;

  return {
    // —— P1 强制契约字段 ——
    sessionId,
    learnerState: refinedOut.shadowState,
    confidence: refinedOut.confidence,
    suggestedAction: ua.action,
    reason,
    risk: ua.risk,
    policyVersion: POLICY_VERSION,
    shadowOnly: SHADOW_ONLY,
    // —— 扩展（可解释性，非必须）——
    technique: tech,
    alternatives: refinedOut.alternatives,
    coarseState: coarse.state,
    evidence: ev,
  };
}

/**
 * 将 UA-v2 动作翻译为 teaching-policy-layer.js（Phase 16）的 hint_mode 词汇，
 * 供后续 P2/P3 接入真实 runtime 时对齐。纯函数，不影响本 adapter 行为。
 * @param {string} uaAction
 * @returns {string}
 */
export function toPolicyLayerHintMode(uaAction) {
  switch (uaAction) {
    case 'observe': return 'minimal';
    case 'question': return 'targeted';
    case 'partial_hint':
    case 'teach': return 'stepwise';
    case 'backoff':
    case 'free_attempt': return 'none';
    default: return 'minimal';
  }
}

export { BOUNDARY_STATES };
