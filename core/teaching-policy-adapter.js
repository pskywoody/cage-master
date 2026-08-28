// ============================================================
// teaching-policy-adapter.js — P1 Teaching Policy Adapter
// 把研究层输出（learner state + UA-v2 policy）包装成 runtime 可消费
// 的 TeachingDecisionProposal。纯 shadow：只提议，不执行。
//
// 边界（硬约束）：
//   - 不调用 HintSystem / LessonPlan / TeachingSystem / LearnerModel
//   - 不自动发 hint / 不自动展示 demo / 不改变玩家流程
//   - shadowOnly 恒为 true（硬编码，不可由外部关闭）
//
// suggestedAction 来自 UA-v2（core/teaching-ai-state-refiner.js 的 fineAction）。
// ============================================================

/** UA-v2 动作词汇表（研究层 action vocabulary） */
export const ACTION_VOCABULARY = ['partial_hint', 'question', 'free_attempt'];

/** 每状态的建议动作（= UA-v2 fineAction 的只读快照，避免重复 import 研究实现） */
const STATE_ACTION = {
  persistent_struggle: 'partial_hint',
  temporary_error: 'question',
  novice_exploration: 'free_attempt',
  guided: 'question',
  independent: 'free_attempt',
  unknown: 'free_attempt',
};

/** 每状态的可解释 reason（来自研究结论） */
const STATE_REASON = {
  persistent_struggle: '持续失败 + hint 依赖：强介入，拆步骤教学以打破失败螺旋（UA-v2: teach）',
  temporary_error: '短暂错误：给恢复机会不降级，必要时 targeted 提示（UA-v2: observe）',
  novice_exploration: '无能力证据的探索期：少干预，允许自由尝试（UA-v2: explore）',
  guided: '有引导成功记录：退后保留渐进提示通道，等待玩家自主推进（UA-v2: backoff）',
  independent: '已独立掌握：完全退后，提升挑战（UA-v2: backoff）',
  unknown: '状态不足：保守观察，不介入',
};

/** 每状态的动作风险等级（来自 Phase 10 挫败 tradeoff / Phase 13 过度介入分析） */
const STATE_RISK = {
  persistent_struggle: { level: 'medium', note: '强介入虽打破螺旋，但过度提示有挫败风险（Phase 10 hint 密集 tradeoff）' },
  temporary_error: { level: 'low', note: 'question 属低介入，不降级、不抢戏' },
  novice_exploration: { level: 'low', note: 'free_attempt 最少干预，探索期安全' },
  guided: { level: 'low', note: 'question 渐进提示，退后为主' },
  independent: { level: 'very-low', note: '完全退后，仅提升挑战' },
  unknown: { level: 'very-low', note: '置信不足，默认观察' },
};

/**
 * 由 StateTransitioner.currentState() 的对象（或 state 字符串）计算识别置信。
 * 启发式（研究层未直接提供 confidence；Phase 12 提示整体识别置信偏低 0.17–0.225，
 * 此处仅在窗口信号上给出"该判定强弱"的相对置信，不作为绝对概率）。
 */
function signalConfidence(st) {
  const w = (st && st.window) || [];
  const len = w.length || 1;
  let errors = 0, hints = 0, indep = 0;
  for (const o of w) {
    if (o.type === 'error') errors++;
    else if (o.type === 'hint') hints++;
    else if (o.type === 'correct' && o.independent === true) indep++;
  }
  const free = w.filter((o) => o.type === 'hint' || o.type === 'correct').length;
  if (st.state === 'independent') return clamp(0.6 + 0.25 * Math.min(1, indep / Math.max(1, Math.ceil(len / 2))), 0, 0.95);
  if (st.state === 'guided') return clamp(0.55 + 0.1 * (free / len), 0, 0.85);
  if (st.state === 'persistent_struggle') return clamp(0.5 + 0.2 * (errors / len), 0, 0.8);
  if (st.state === 'temporary_error') return clamp(0.45 + 0.1 * (errors / len), 0, 0.7);
  if (st.state === 'novice_exploration') return clamp(0.35 + 0.15 * (hints / len), 0, 0.6);
  return 0.3;
}
function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

export class TeachingPolicyAdapter {
  /**
   * @param {Object} opts
   * @param {string} [opts.policyVersion='ua-v2'] - 策略版本名（read-only 标识）
   * @param {string} [opts.sessionId='proposal-0'] - 默认 sessionId（可通过 decide 覆盖）
   */
  constructor({ policyVersion = 'ua-v2', sessionId = 'proposal-0' } = {}) {
    this.policyVersion = policyVersion;
    this.defaultSessionId = sessionId;
    this._made = [];
  }

  /**
   * 由当前 learner 状态产出 TeachingDecisionProposal（纯 shadow，无副作用）。
   * @param {Object|string} st - StateTransitioner.currentState() 对象，或 state 字符串
   * @param {Object} [ctx]
   * @param {string} [ctx.sessionId] - 覆盖 sessionId
   * @param {number} [ctx.confidenceOverride] - 覆盖置信（可选，测试/校准用）
   * @param {number} [ctx.counter] - proposal 序号（可选，便于审计）
   * @returns {Object} TeachingDecisionProposal
   */
  decide(st, ctx = {}) {
    const stateStr = typeof st === 'string' ? st : (st && st.state) || 'unknown';
    const stateObj = typeof st === 'string' ? { state: st, window: [] } : (st || { state: 'unknown', window: [] });
    const confidence = ctx.confidenceOverride != null ? ctx.confidenceOverride : signalConfidence(stateObj);
    const suggestedAction = STATE_ACTION[stateStr] || 'free_attempt';
    const proposal = {
      sessionId: ctx.sessionId || this.defaultSessionId,
      observedAt: ctx.counter != null ? ctx.counter : this._made.length,
      policyVersion: this.policyVersion,
      learnerState: stateStr,
      confidence: round2(confidence),
      suggestedAction,
      reason: STATE_REASON[stateStr] || STATE_REASON.unknown,
      risk: STATE_RISK[stateStr] || STATE_RISK.unknown,
      shadowOnly: true, // 硬编码：proposal ≠ execution，恒为 true
    };
    this._made.push(proposal);
    return proposal;
  }

  /** 已产出的 proposal 序列（审计/回放） */
  log() { return this._made; }
}

function round2(x) { return Math.round(x * 100) / 100; }