// 纯结构拆分（Phase 1）：OpponentObserver，内容与原 battle-manager.js 一致，仅补 export。

// ---------------------------------------------------------------------------
// 4.5 OpponentObserver - 对手行为观察器（V4.3.40）
//    追踪对手的"区域热度/节奏/对抗性/策略模式"四维度，
//    让 AI 能"看懂对手"并动态调整决策。
//    注：笔记内容对对手不可见（私密），对手仅能观察到笔记范围扩张等外在行为。
// ---------------------------------------------------------------------------
export class OpponentObserver {
  constructor(size, options = {}) {
    this._size = size;
    this._history = [];
    this._maxHistory = options.window ?? 24;   // V4.3.44：窗口可调（默认 24，极端测试 48）
    this._regionHits = [0, 0, 0];  // 3个据点的命中计数
    this._ghostStealCount = 0;     // 对手抢自己幽灵格的数量
    this._ownFills = 0;            // 记录到的对手填数次数
    this._intervalWindow = [];
    this._strategyWindow = [];
    this._intensity = options.intensity ?? 1.0; // V4.3.44：响应强度系数（极端测试 2.0）
    this._disabled = false;
  }

  /**
   * V4.3.44：运行时可调窗口与强度
   */
  configure(window, intensity) {
    if (window !== undefined && window > 0) this._maxHistory = window;
    if (intensity !== undefined && intensity > 0) this._intensity = intensity;
  }

  /**
   * 记录对手的一步（由外部在对手填数后调用）
   */
  record(r, c, isGhostSteal, hubIdx) {
    const now = Date.now();
    const entry = {
      r, c,
      hubIdx: hubIdx !== undefined ? hubIdx : -1,
      isGhostSteal: !!isGhostSteal,
      timestamp: now,
    };
    this._history.push(entry);
    if (this._history.length > this._maxHistory) {
      this._history.shift();
    }

    // 更新区域热度（据点命中，衰减保持新鲜）
    if (hubIdx >= 0 && hubIdx < 3) {
      this._regionHits[hubIdx] = (this._regionHits[hubIdx] || 0) + 1;
      this._decayRegionHits();
    }

    // 更新对抗性统计
    if (isGhostSteal) {
      this._ghostStealCount++;
    }
    this._ownFills++;

    // 更新节奏窗口（最近6次间隔）
    this._intervalWindow.push(now);
    if (this._intervalWindow.length > 6) {
      this._intervalWindow.shift();
    }

    // 更新策略窗口（最近5步的hubIdx分布）
    this._strategyWindow.push(hubIdx >= 0 ? hubIdx : -1);
    if (this._strategyWindow.length > 5) {
      this._strategyWindow.shift();
    }
  }

  _decayRegionHits() {
    // 每3次记录衰减一次，保持热度新鲜
    if (this._history.length % 3 === 0) {
      this._regionHits = this._regionHits.map(v => Math.max(0, v * 0.85));
    }
  }

  /**
   * 获取分析结果
   */
  getAnalysis() {
    const targetHub = this._getHottestHub();
    const tempo = this._getTempoTrend();
    const aggression = this._getAggressionLevel();
    const strategy = this._getStrategyType();

    return {
      targetHub,           // 对手最可能正在冲的据点 (-1表示无)
      tempo,               // 'accelerating' | 'steady' | 'decelerating'
      aggression,          // 0-1, 对手抢格比例
      strategy,            // 'aggressive' | 'defensive' | 'balanced'
      isBeingTargeted: aggression > 0.35, // 对手是否在针对自己
      intensity: this._intensity,         // V4.3.44：响应强度系数（供决策放大）
    };
  }

  _getHottestHub() {
    if (this._history.length < 2) return -1;
    const maxHits = Math.max(...this._regionHits);
    if (maxHits < 2) return -1;
    const idx = this._regionHits.indexOf(maxHits);
    // 需要至少比第二高多1.5倍才认定
    const sorted = [...this._regionHits].sort((a, b) => b - a);
    if (sorted.length > 1 && sorted[0] > sorted[1] * 1.5) {
      return idx;
    }
    return -1;
  }

  _getTempoTrend() {
    if (this._intervalWindow.length < 3) return 'steady';
    const intervals = [];
    for (let i = 1; i < this._intervalWindow.length; i++) {
      intervals.push(this._intervalWindow[i] - this._intervalWindow[i-1]);
    }
    const avgRecent = intervals.slice(-2).reduce((a,b) => a+b, 0) / Math.min(2, intervals.length);
    const avgAll = intervals.reduce((a,b) => a+b, 0) / intervals.length;
    if (avgAll === 0) return 'steady';
    const ratio = avgRecent / avgAll;
    if (ratio < 0.7) return 'accelerating';
    if (ratio > 1.3) return 'decelerating';
    return 'steady';
  }

  _getAggressionLevel() {
    if (this._ownFills === 0) return 0;
    return Math.min(1, this._ghostStealCount / Math.max(1, this._ownFills * 0.3));
  }

  _getStrategyType() {
    const recent = this._strategyWindow.filter(h => h >= 0);
    if (recent.length < 3) return 'balanced';
    const hubCount = recent.filter(h => h >= 0).length;
    const ratio = hubCount / recent.length;
    if (ratio > 0.6) return 'aggressive';
    if (ratio < 0.25) return 'defensive';
    return 'balanced';
  }
}
