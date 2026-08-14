// ============================================================
//  strategy-selector.js - CM4-R6 Strategy Activation Layer
// ============================================================
//  职责：把 Director 的叙事意图（"这一幕演什么"）安全地映射为
//        Solver 的候选空间旋钮（权重调制），绝不直接指定落子。
//
//  设计原则（对齐 CM4-D1 "AI 是导演"）：
//    - Director 不是老板，是导演。导演只选剧本，不替演员迈步。
//    - Director 输出的是意图（targetSource/hubWeight/stealLevel），
//      本层把它钳制到与人格系统同源的边界内。
//    - 若决策无效或越界超出容忍 → 返回 null，回退到人格基线，
//      防止 Director 错/Solver 崩相互污染（拆问题闭环）。
// ============================================================

// 声明式映射：targetSource → AI 现有策略方向
export const TARGET_SOURCE_TO_STRATEGY = {
  owned: 'defend',     // 巩固己方据点
  contested: 'attack', // 争夺中立/冲突据点
  weakest: 'attack',   // 攻击最弱据点
  none: 'global',      // 无明确目标 → 全局解题
};

// 旋钮边界（与 AIPlayerCore 人格系统同源，防止越界破坏 Solver 稳定性）
export const KNOB_BOUNDS = {
  hubWeightMult: [0.85, 1.45],
  stealLevel: [0.15, 0.9],
  noteRate: [0, 1],
  fakeRate: [0, 1],
};

// 越界容忍比例：超出边界×该倍数仍接受（钳制），超过则视为异常回退
const BOUNDS_TOLERANCE = 1.5;

function clamp(v, lo, hi) {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  return Math.max(lo, Math.min(hi, v));
}

export class StrategySelector {
  /**
   * @param {Object} [options]
   * @param {Object} [options.bounds] - 覆盖默认旋钮边界 { knob: [lo, hi] }
   * @param {boolean} [options.enabled] - 默认 true（是否参与激活）
   */
  constructor(options = {}) {
    this._bounds = Object.assign({}, KNOB_BOUNDS, (options && options.bounds) || {});
    this._enabled = !options || options.enabled !== false;
    this._activations = 0;   // 成功激活次数
    this._fallbacks = 0;     // 回退次数（无效/越界）
    this._lastProfile = null;
    this._lastReason = null;
  }

  get enabled() { return this._enabled; }
  setEnabled(v) { this._enabled = !!v; }

  /** 运行统计（供校准/调试） */
  getStats() {
    return { activations: this._activations, fallbacks: this._fallbacks };
  }

  /** 最近一次解析结果（调试用） */
  getLastProfile() { return this._lastProfile; }
  getLastReason() { return this._lastReason; }

  /**
   * 把 Director 决策解析为安全的旋钮剖面（纯函数，无副作用）。
   * @param {Object} decision - Director.decide() 返回 { targetSource, params }
   * @returns {Object|null} 调制剖面；null 表示应回退人格基线
   */
  resolve(decision) {
    this._lastProfile = null;
    this._lastReason = null;

    if (!this._enabled) { this._fallbacks++; this._lastReason = 'disabled'; return null; }
    if (!decision || !decision.params) { this._fallbacks++; this._lastReason = 'no_params'; return null; }

    const p = decision.params;
    const profile = {};

    // ---- targetSource → 策略方向 ----
    if (p.targetSource && TARGET_SOURCE_TO_STRATEGY[p.targetSource]) {
      profile.targetStrategy = TARGET_SOURCE_TO_STRATEGY[p.targetSource];
    }

    // ---- hubWeightMult ----
    if (typeof p.hubWeightMult === 'number') {
      const out = this._safe(p.hubWeightMult, 'hubWeightMult');
      if (out === null) { this._fallbacks++; this._lastReason = 'hub_out_of_bounds'; return null; }
      profile.hubWeightMult = out;
    }

    // ---- stealLevel（映射到防守权重代理 0.5 + stealLevel）----
    if (typeof p.stealLevel === 'number') {
      const out = this._safe(p.stealLevel, 'stealLevel');
      if (out === null) { this._fallbacks++; this._lastReason = 'steal_out_of_bounds'; return null; }
      profile.stealLevel = out;
    }

    // ---- noteCadence（决定性三态基调）----
    if (p.noteCadence && typeof p.noteCadence === 'object') {
      const nc = {};
      if (typeof p.noteCadence.noteRate === 'number') {
        const out = this._safe(p.noteCadence.noteRate, 'noteRate');
        if (out === null) { this._fallbacks++; this._lastReason = 'noteRate_out_of_bounds'; return null; }
        nc.noteRate = out;
      }
      if (typeof p.noteCadence.fakeRate === 'number') {
        const out = this._safe(p.noteCadence.fakeRate, 'fakeRate');
        if (out === null) { this._fallbacks++; this._lastReason = 'fakeRate_out_of_bounds'; return null; }
        nc.fakeRate = out;
      }
      if (Object.keys(nc).length > 0) profile.noteCadence = nc;
    }

    // 至少要有一种可作用旋钮，否则视为空决策
    const hasEffect = profile.targetStrategy || profile.hubWeightMult != null
      || profile.stealLevel != null || profile.noteCadence;
    if (!hasEffect) { this._fallbacks++; this._lastReason = 'no_effect'; return null; }

    this._activations++;
    this._lastProfile = profile;
    return profile;
  }

  /**
   * 钳制到边界；若原值超出边界×容忍，返回 null（视为异常，回退基线）。
   */
  _safe(value, knob) {
    const [lo, hi] = this._bounds[knob] || [0, 1];
    if (value < lo || value > hi) {
      // 超出容忍 → 异常回退
      if (value < lo * BOUNDS_TOLERANCE || value > hi * BOUNDS_TOLERANCE) return null;
    }
    return clamp(value, lo, hi);
  }
}