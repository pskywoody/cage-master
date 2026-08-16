// ============================================================
// teaching-ai-state-transitioner.js — Teaching AI Phase 14.6
// Learner State Transition Refinement（新增 transition 层）
// 解决 Phase 14/Gate B 暴露的 prior mastery bias：
//   classifyFine 的 `indep>=2` 无条件提前返回，使"先独立成功≥2 再犯错"
//   的轨迹被误判为 independent，temporary_error / persistent_struggle 不可见。
// 本层不修改 classifyFine / LearnerModel / 任何生产模块；只在其上新增
// "current struggle signal × historical capability" 的 transition 判定。
// 核心原则：状态 = 当前轨迹信号 × 历史能力，而不是"最高能力状态获胜"。
// ============================================================

/**
 * StateTransitioner：滑动窗口当前信号 + 历史能力 的 transition 判定。
 * 输入：LearnerModel.observe 形状观察流（{type: correct|error|hint, independent, hintLevel}）。
 * 输出：{ state, capability, window, transition } — 当前细粒度状态。
 */
export class StateTransitioner {
  /**
   * @param {Object} opts
   * @param {number} [opts.windowSize=5] - 当前信号滑动窗口大小（多久内算"现在"）
   * @param {number} [opts.hintThenFailThreshold=1] - 窗口内 hint→fail 达此即 persistent
   * @param {number} [opts.recoveryThreshold=2] - 错误后连续正确达此数视为已恢复（recovery 过渡）
   */
  constructor({ windowSize = 5, hintThenFailThreshold = 1, recoveryThreshold = 2 } = {}) {
    this.windowSize = windowSize;
    this.hintThenFailThreshold = hintThenFailThreshold;
    this.recoveryThreshold = recoveryThreshold;
    this._window = [];             // 最近观察（当前信号）
    this._history = { indep: 0, guidedCorrect: 0, errors: 0, correct: 0 }; // 历史能力
    this._capability = 'none';     // none | guided | independent
    this._lastState = 'none';
    this._transitions = [];
  }

  /** 推入一条观察（{type, independent?, hintLevel?}） */
  push(obs) {
    if (!obs) return this;
    this._window.push(obs);
    if (this._window.length > this.windowSize) this._window.shift();
    // 历史能力（整段）
    if (obs.type === 'correct') {
      this._history.correct++;
      if (obs.independent === true) this._history.indep++;
      else this._history.guidedCorrect++;
    } else if (obs.type === 'error') {
      this._history.errors++;
    }
    if (this._history.indep >= 2) this._capability = 'independent';
    else if (this._history.guidedCorrect >= 1 || this._history.correct >= 1) this._capability = 'guided';
    return this;
  }

  /** 当前窗口内的 struggle 信号 */
  _windowSignal() {
    let errors = 0, consecErr = 0, maxConsecErr = 0, hintThenFail = 0, prevWasHint = false;
    for (const e of this._window) {
      if (e.type === 'hint') { prevWasHint = true; continue; }
      if (e.type === 'error') {
        errors++; consecErr++; maxConsecErr = Math.max(maxConsecErr, consecErr);
        if (prevWasHint) hintThenFail++;
      } else { consecErr = 0; }
      if (e.type === 'correct') prevWasHint = false;
    }
    return { errors, maxConsecErr, hintThenFail, hasError: errors > 0 };
  }

  /** 当前细粒度状态（transition 判定） */
  currentState() {
    const sig = this._windowSignal();
    // recovery 检测：窗口内最后一个 error 之后已连续正确达阈值且无新 error → 已恢复
    let lastErrIdx = -1;
    for (let i = 0; i < this._window.length; i++) if (this._window[i].type === 'error') lastErrIdx = i;
    const afterLastErr = lastErrIdx >= 0 ? this._window.slice(lastErrIdx + 1) : [];
    const recovered = lastErrIdx >= 0
      && !afterLastErr.some((o) => o.type === 'error')
      && afterLastErr.filter((o) => o.type === 'correct').length >= this.recoveryThreshold;

    let state;
    if (recovered && sig.errors < 3 && sig.hintThenFail < this.hintThenFailThreshold) {
      // 已恢复 → 反映历史能力（recovery 过渡）
      state = this._capability === 'independent' ? 'independent'
        : this._capability === 'guided' ? 'guided' : 'guided';
    } else if (sig.hintThenFail >= this.hintThenFailThreshold || sig.maxConsecErr >= 3 || sig.errors >= 3) {
      state = 'persistent_struggle';          // 当前反复失败 + hint 依赖
    } else if (sig.errors >= 1) {
      state = 'temporary_error';              // 单次/两次失败，recovery 未知
    } else {
      // 无当前错误 → 反映历史能力
      state = this._capability === 'independent' ? 'independent'
        : this._capability === 'guided' ? 'guided'
        : 'novice_exploration';
    }
    // transition 记录
    if (state !== this._lastState) {
      this._transitions.push({ from: this._lastState, to: state });
      this._lastState = state;
    }
    return { state, capability: this._capability, window: this._window.slice(), transition: state };
  }

  /** 整段观察的分类结果（供对比） */
  classifyAll(observations) {
    for (const o of observations) this.push(o);
    return this.currentState();
  }
}

/**
 * 便捷过渡规则表（供文档/测试引用）：
 * independent ──failure spike──▶ temporary_error ──recovery──▶ independent
 * temporary_error ──repeated failure + hint dependency──▶ persistent_struggle
 */
export const TRANSITION_RULES = {
  independent: { failure_spike: 'temporary_error', sustained: 'persistent_struggle' },
  temporary_error: { recovery: 'independent', repeated_failure_hint_dependency: 'persistent_struggle' },
  persistent_struggle: { recovery: 'temporary_error', mastery: 'guided' },
  guided: { mastery: 'independent' },
  novice_exploration: { learning: 'guided', failure: 'temporary_error' },
};