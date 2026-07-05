/**
 * ============================================================
 *  DynamicThresholdCalculator - 动态阈值计算器
 * ============================================================
 *
 *  根据玩家的推理状态动态调整角色提示的触发时间。
 *  核心思想：提示是对玩家推理状态的回应，不是固定时钟。
 *
 *  核心算法：
 *  - 基础阈值 60 秒
 *  - 高强度推理（高频率+高准确率）→ 延后 30 秒
 *  - 无笔记 → 提前 20 秒
 *  - 高错误率 → 提前 10 秒
 *  - 高难度 → 延后 10 秒
 *  - 边界控制：20 - 120 秒
 *
 *  三个补丁：
 *  - 【补丁2】自动候选数屏蔽：开启Auto-Candidates时，L1-L3失效，回退到沉默时长+错漏频率
 *  - 【补丁3】防涂鸦：高频低准 → 30秒强制触发
 *  - 【补丁5】封口计数器：笔记引导台词触发上限
 *
 *  角色阈值分配：
 *  - 阿岩：getDynamicThreshold(state)
 *  - 守笼人：getDynamicThreshold(state) * 1.3
 *  - 设局人：getDynamicThreshold(state) * 2.5
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {Object} PlayerReasoningState
 * @property {number} noteFrequency - 过去60秒笔记次数
 * @property {number} noteAccuracy - 笔记准确率 0-1
 * @property {number} errorRate - 填数错误率 0-1
 * @property {string} difficulty - 难度等级
 * @property {boolean} isEureka - 是否Eureka时刻
 * @property {boolean} autoCandidatesOn - 是否开启自动候选数
 */

// ============================================================
//  DynamicThresholdCalculator 类
// ============================================================

class DynamicThresholdCalculator {
  // ========================================================
  //  配置常量
  // ========================================================

  /** 基础阈值（秒） */
  static BASE_THRESHOLD = 60;

  /** 最小阈值（秒） */
  static MIN_THRESHOLD = 20;

  /** 最大阈值（秒） */
  static MAX_THRESHOLD = 120;

  /** 高强度推理延后时间（秒） */
  static HIGH_INTENSITY_DELAY = 30;

  /** 无笔记提前时间（秒） */
  static NO_NOTE_ADVANCE = 20;

  /** 高错误率提前时间（秒） */
  static HIGH_ERROR_ADVANCE = 10;

  /** 地狱难度延后时间（秒） */
  static HELL_DIFFICULTY_DELAY = 10;

  /** 高频低准强制阈值（秒）【补丁3】 */
  static GRAFFITI_FORCE_THRESHOLD = 30;

  /** 高频判定阈值（次/60秒） */
  static HIGH_FREQ_THRESHOLD = 5;

  /** 高准确率判定阈值 */
  static HIGH_ACC_THRESHOLD = 0.8;

  /** 低准确率判定阈值 */
  static LOW_ACC_THRESHOLD = 0.3;

  /** 无笔记判定阈值（次/60秒） */
  static LOW_FREQ_THRESHOLD = 1;

  /** 高错误率判定阈值 */
  static HIGH_ERROR_THRESHOLD = 0.3;

  // ========================================================
  //  角色阈值倍数
  // ========================================================

  static CHARACTER_MULTIPLIERS = {
    ray: 1.0,       // 阿岩：基础阈值
    keeper: 1.3,    // 守笼人：1.3倍
    plotter: 2.5,   // 设局人：2.5倍
  };

  // ========================================================
  //  核心计算
  // ========================================================

  /**
   * 计算动态阈值
   * @param {PlayerReasoningState} state - 玩家推理状态
   * @returns {number} 阈值（秒）
   */
  static calculate(state) {
    // 1. Eureka优先：立即触发
    if (state.isEureka) return 0;

    // 2. 基础阈值
    let base = this.BASE_THRESHOLD;

    // 3. 【补丁2】自动候选数屏蔽规则
    if (state.autoCandidatesOn) {
      // 开启Auto-Candidates时，笔记分析失效
      // 只使用错误率调整
      if (state.errorRate > this.HIGH_ERROR_THRESHOLD) {
        base -= 15; // 错误率高，提前更多
      }
      return this._clamp(base, this.MIN_THRESHOLD, this.MAX_THRESHOLD);
    }

    // 4. 笔记频率 + 准确率调整
    const freq = state.noteFrequency;
    const acc = state.noteAccuracy;

    if (freq >= this.HIGH_FREQ_THRESHOLD && acc > this.HIGH_ACC_THRESHOLD) {
      // 高强度推理（高频+高准）→ 延后提示
      base += this.HIGH_INTENSITY_DELAY;
    } else if (freq >= this.HIGH_FREQ_THRESHOLD && acc < this.LOW_ACC_THRESHOLD) {
      // 【补丁3】防涂鸦：高频低准 → 强制30秒触发
      return this.GRAFFITI_FORCE_THRESHOLD;
    } else if (freq < this.LOW_FREQ_THRESHOLD) {
      // 无笔记 → 缩短提示
      base -= this.NO_NOTE_ADVANCE;
    }

    // 5. 错误率调整
    if (state.errorRate > this.HIGH_ERROR_THRESHOLD) {
      base -= this.HIGH_ERROR_ADVANCE;
    }

    // 6. 难度调整
    if (state.difficulty === '地狱' || state.difficulty === 'hell') {
      base += this.HELL_DIFFICULTY_DELAY;
    }

    // 7. 边界控制
    return this._clamp(base, this.MIN_THRESHOLD, this.MAX_THRESHOLD);
  }

  // ========================================================
  //  角色阈值
  // ========================================================

  /**
   * 获取指定角色的动态阈值
   * @param {string} character - 角色ID ('ray'|'keeper'|'plotter')
   * @param {PlayerReasoningState} state - 玩家推理状态
   * @returns {number} 阈值（秒）
   */
  static getCharacterThreshold(character, state) {
    const baseThreshold = this.calculate(state);

    // Eureka时所有角色都立即触发
    if (baseThreshold === 0) return 0;

    const multiplier = this.CHARACTER_MULTIPLIERS[character] || 1.0;
    const result = baseThreshold * multiplier;

    // 设局人有额外上限（不能太夸张）
    if (character === 'plotter') {
      return Math.min(result, 300); // 最多5分钟
    }

    return Math.round(result);
  }

  /**
   * 获取所有角色的阈值
   * @param {PlayerReasoningState} state
   * @returns {{ray: number, keeper: number, plotter: number}}
   */
  static getAllThresholds(state) {
    return {
      ray: this.getCharacterThreshold('ray', state),
      keeper: this.getCharacterThreshold('keeper', state),
      plotter: this.getCharacterThreshold('plotter', state),
    };
  }

  // ========================================================
  //  阈值状态检查
  // ========================================================

  /**
   * 检查沉默时长是否达到某个角色的触发阈值
   * @param {string} character - 角色ID
   * @param {PlayerReasoningState} state - 推理状态
   * @param {number} silenceDuration - 沉默时长（秒）
   * @returns {boolean}
   */
  static shouldTrigger(character, state, silenceDuration) {
    const threshold = this.getCharacterThreshold(character, state);
    return silenceDuration >= threshold;
  }

  /**
   * 检查哪个角色应该被触发
   * @param {PlayerReasoningState} state - 推理状态
   * @param {number} silenceDuration - 沉默时长（秒）
   * @param {Object} cooldowns - 各角色冷却状态 {ray: true/false, ...}
   * @returns {string|null} 应该触发的角色ID，null表示都不触发
   */
  static whichCharacterShouldTrigger(state, silenceDuration, cooldowns = {}) {
    const thresholds = this.getAllThresholds(state);

    // 按优先级从低到高检查（阿岩→守笼人→设局人）
    // 优先级低的先检查，如果满足且不在冷却中，就触发
    const order = ['ray', 'keeper', 'plotter'];

    for (const char of order) {
      if (silenceDuration >= thresholds[char] && !cooldowns[char]) {
        return char;
      }
    }

    return null;
  }

  // ========================================================
  //  工具方法
  // ========================================================

  /**
   * 限制值在范围内
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   */
  static _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * 获取阈值调整的详细分解（调试用）
   * @param {PlayerReasoningState} state
   * @returns {Object}
   */
  static debugBreakdown(state) {
    const breakdown = {
      base: this.BASE_THRESHOLD,
      adjustments: [],
      final: this.calculate(state),
    };

    if (state.isEureka) {
      breakdown.adjustments.push({ reason: 'Eureka时刻', value: -this.BASE_THRESHOLD });
      return breakdown;
    }

    if (state.autoCandidatesOn) {
      breakdown.adjustments.push({ reason: '自动候选数屏蔽', value: 0 });
      if (state.errorRate > this.HIGH_ERROR_THRESHOLD) {
        breakdown.adjustments.push({ reason: '高错误率', value: -15 });
      }
      return breakdown;
    }

    const freq = state.noteFrequency;
    const acc = state.noteAccuracy;

    if (freq >= this.HIGH_FREQ_THRESHOLD && acc > this.HIGH_ACC_THRESHOLD) {
      breakdown.adjustments.push({ reason: '高强度推理', value: this.HIGH_INTENSITY_DELAY });
    } else if (freq >= this.HIGH_FREQ_THRESHOLD && acc < this.LOW_ACC_THRESHOLD) {
      breakdown.adjustments.push({ reason: '防涂鸦-高频低准', value: '强制30秒' });
    } else if (freq < this.LOW_FREQ_THRESHOLD) {
      breakdown.adjustments.push({ reason: '无笔记', value: -this.NO_NOTE_ADVANCE });
    }

    if (state.errorRate > this.HIGH_ERROR_THRESHOLD) {
      breakdown.adjustments.push({ reason: '高错误率', value: -this.HIGH_ERROR_ADVANCE });
    }

    if (state.difficulty === '地狱' || state.difficulty === 'hell') {
      breakdown.adjustments.push({ reason: '地狱难度', value: this.HELL_DIFFICULTY_DELAY });
    }

    return breakdown;
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DynamicThresholdCalculator };
}

if (typeof window !== 'undefined') {
  window.DynamicThresholdCalculator = DynamicThresholdCalculator;
}
