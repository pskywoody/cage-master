// ============================================================
// teaching-policy-layer.js — Phase 16 Teaching Policy Layer
// 把 learner state 消费成教学动作决策（state → action decision）。
// 纯新增规则层：只推荐不执行（shadow policy），不改生产行为、不自动教学。
// 考研输入：StateTransitioner.currentState() 的 state 细粒度状态。
// 策略来源合成：
//   - Phase 11 介入边界（struggling≈0.25 / novice≈0.10 / guided=0 / independent=0）
//   - Phase 14 UA-v2（persistent→teach / temporary→observe /
//     novice_exploration→explore / guided+independent→backoff）
// 注：这是研究收敛后的"消费层"，不重新做 taxonomy。
// ============================================================

/**
 * 状态 → 动作决策 规则表。
 * intervention: observe|light|moderate|strong|backoff
 * hint_mode:    none|minimal|targeted|progressive|stepwise
 * challenge:    lower|keep|raise
 */
export const POLICY_TABLE = {
  persistent_struggle: {
    intervention: 'strong',
    hint_mode: 'stepwise',            // 强介入，拆步骤教学
    serve: 0.25,
    challenge: 'keep',
    rationale: '强介入，拆步骤教学，稳定失败螺旋',
  },
  temporary_error: {
    intervention: 'observe',
    hint_mode: 'targeted',            // 给恢复机会，不降级；必要时针对性提示
    serve: 0.10,
    challenge: 'keep',
    rationale: '给恢复机会，不降级；仅在确认 hint 依赖时给 targeted hint',
  },
  novice_exploration: {
    intervention: 'observe',
    hint_mode: 'minimal',             // 少干预，观察
    serve: 0.05,
    challenge: 'keep',
    rationale: '少干预，允许探索；保持挑战',
  },
  guided: {
    intervention: 'backoff_light',
    hint_mode: 'progressive',         // 渐进提示，等待玩家推进
    serve: 0.0,
    challenge: 'keep',
    rationale: '退后但保留渐进提示通道，等待玩家自主推进',
  },
  independent: {
    intervention: 'backoff',
    hint_mode: 'none',
    serve: 0.0,
    challenge: 'raise',
    rationale: '完全退后，提升挑战',
  },
};

export class TeachingPolicy {
  /**
   * @param {Object} opts
   * @param {Object} [opts.table=POLICY_TABLE] - 自定义策略表（测试注入）
   * @param {number} [opts.hintDependencyServeBoost=0.15] - hint 依赖时 targeted 介入加成
   */
  constructor({ table = POLICY_TABLE, hintDependencyServeBoost = 0.15 } = {}) {
    this.table = table;
    this.hintDependencyServeBoost = hintDependencyServeBoost;
    this._decisions = [];
  }

  /**
   * 状态 → 动作决策（纯函数，无副作用）。
   * @param {string|Object} state - 'novice_exploration' 等，或 currentState() 对象
   * @param {Object} [ctx]
   * @param {number} [ctx.hintDependency] - 0..1 越界型 hint 依赖
   * @returns {{state, action: *, serve: number}} 决策
   */
  decide(state, ctx = {}) {
    const s = typeof state === 'string' ? state : (state && state.state);
    const base = this.table[s] || {
      intervention: 'observe', hint_mode: 'minimal', serve: 0.0,
      challenge: 'keep', rationale: '未知状态，保守观察',
    };
    let serve = base.serve;
    let mode = base.hint_mode;
    // temporary_error + hint 依赖 → 提升 targeted 介入
    if (s === 'temporary_error' && ctx.hintDependency != null && ctx.hintDependency > 0.5) {
      serve = Math.min(1, serve + this.hintDependencyServeBoost);
      mode = 'targeted';
    }
    const decision = { state: s, action: { ...base, hint_mode: mode }, serve };
    this._decisions.push(decision);
    return decision;
  }

  /** 累积决策序列（供回放/验证） */
  log() { return this._decisions; }
}