// PlayerStateMonitor - Perception Layer
// Tracks player actions and derives high-level states

;(function(global) {
  'use strict';

  class PlayerStateMonitor {
    constructor(config = {}) {
      // 盘面尺寸（影响动态阈值）
      this.gridSize = config.gridSize || 9;

      // 基础阈值（9x9 标准值）
      this._baseThresholds = {
        stuckMs: config.stuckMs || 45000,
        anxiousWindowMs: config.anxiousWindowMs || 3000,
        anxiousErrorCount: config.anxiousErrorCount || 3,
        flowWindowMs: config.flowWindowMs || 8000,
        flowCount: config.flowCount || 3,
        eurekaCount: config.eurekaCount || 8,
      };

      // 当前生效阈值（根据 gridSize 动态计算）
      this.thresholds = this._calcThresholdsForSize(this.gridSize);

      this.dimensions = {
        stuck: { value: false, duration: 0, since: 0 },
        anxious: { value: false, duration: 0, since: 0 },
        flow: { value: false, depth: 0, since: 0 },
        rhythm: { value: 'neutral', fillRate: 0, avgInterval: 0 },
        technique: { failed: new Set(), successful: new Set() },
      };

      this.counters = {
        totalCorrect: 0,
        totalWrong: 0,
        totalHints: 0,
        consecutiveCorrect: 0,
        consecutiveWrong: 0,
        totalAttempts: 0,
      };

      this._fillHistory = [];
      this._lastFillTime = Date.now();
      this._lastActionTime = Date.now();
      this._levelActive = false;
    }

    onLevelStart() {
      this._levelActive = true;
      this._lastActionTime = Date.now();
      this._lastFillTime = Date.now();
      this._fillHistory = [];
      this.counters = {
        totalCorrect: 0, totalWrong: 0, totalHints: 0,
        consecutiveCorrect: 0, consecutiveWrong: 0, totalAttempts: 0,
      };
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
      this.dimensions.anxious = { value: false, duration: 0, since: 0 };
      this.dimensions.flow = { value: false, depth: 0, since: 0 };
    }

    onLevelEnd() {
      this._levelActive = false;
    }

    onFillCorrect(row, col, num) {
      const now = Date.now();
      const interval = now - this._lastFillTime;
      this._lastFillTime = now;
      this._lastActionTime = now;

      this.counters.totalCorrect++;
      this.counters.consecutiveCorrect++;
      this.counters.consecutiveWrong = 0;
      this.counters.totalAttempts++;

      this._fillHistory.push({ time: now, correct: true, interval });
      if (this._fillHistory.length > 50) this._fillHistory.shift();

      // Reset stuck
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };

      // Check anxious recovery
      if (this.dimensions.anxious.value) {
        this.dimensions.anxious = { value: false, duration: 0, since: 0 };
      }

      // Check flow state
      this._updateFlow(now, interval, true);
      this._updateRhythm();
    }

    onFillWrong(row, col, num) {
      const now = Date.now();
      const interval = now - this._lastFillTime;
      this._lastFillTime = now;
      this._lastActionTime = now;

      this.counters.totalWrong++;
      this.counters.consecutiveWrong++;
      this.counters.consecutiveCorrect = 0;
      this.counters.totalAttempts++;

      this._fillHistory.push({ time: now, correct: false, interval });
      if (this._fillHistory.length > 50) this._fillHistory.shift();

      // Check anxious state
      if (this.counters.consecutiveWrong >= this.thresholds.anxiousErrorCount) {
        this.dimensions.anxious = { value: true, duration: 0, since: now };
      }

      // Reset flow
      this.dimensions.flow = { value: false, depth: 0, since: 0 };
      this._updateRhythm();
    }

    onNote(row, col, num) {
      this._lastActionTime = Date.now();
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
    }

    onHint() {
      this.counters.totalHints++;
      this._lastActionTime = Date.now();
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
    }

    update(deltaTime) {
      if (!this._levelActive) return;

      const now = Date.now();
      const idleTime = now - this._lastActionTime;

      // Stuck detection
      if (idleTime > this.thresholds.stuckMs) {
        if (!this.dimensions.stuck.value) {
          this.dimensions.stuck = { value: true, duration: idleTime, since: this._lastActionTime };
        } else {
          this.dimensions.stuck.duration = idleTime;
        }
      } else {
        this.dimensions.stuck = { value: false, duration: 0, since: 0 };
      }

      // Anxious duration update
      if (this.dimensions.anxious.value && this.dimensions.anxious.since > 0) {
        this.dimensions.anxious.duration = now - this.dimensions.anxious.since;
        if (this.dimensions.anxious.duration > 10000) {
          this.dimensions.anxious = { value: false, duration: 0, since: 0 };
          this.counters.consecutiveWrong = 0;
        }
      }
    }

    _updateFlow(now, interval, correct) {
      if (correct && interval < this.thresholds.flowWindowMs) {
        this.dimensions.flow.depth++;
        if (this.dimensions.flow.depth >= this.thresholds.flowCount) {
          this.dimensions.flow.value = true;
          this.dimensions.flow.since = now;
        }
      } else {
        this.dimensions.flow.depth = 0;
        this.dimensions.flow.value = false;
      }
    }

    _updateRhythm() {
      const recent = this._fillHistory.slice(-10);
      if (recent.length < 3) {
        this.dimensions.rhythm = { value: 'neutral', fillRate: 0, avgInterval: 0 };
        return;
      }
      const avgInterval = recent.reduce((s, h) => s + h.interval, 0) / recent.length;
      const fillRate = recent.filter(h => h.correct).length / recent.length;
      let value = 'steady';
      if (avgInterval < 3000 && fillRate > 0.8) value = 'fast';
      else if (avgInterval > 15000) value = 'stalled';
      this.dimensions.rhythm = { value, fillRate, avgInterval };
    }

    /**
     * 设置盘面尺寸，动态调整所有阈值
     * 4x4 → 心流 2 连击，EUREKA 4 连击
     * 6x6 → 心流 3 连击，EUREKA 6 连击
     * 9x9 → 心流 4 连击，EUREKA 8 连击
     * @param {number} size
     */
    setGridSize(size) {
      this.gridSize = size;
      this.thresholds = this._calcThresholdsForSize(size);
    }

    /**
     * 根据盘面尺寸计算阈值
     * @param {number} size
     * @returns {Object} 调整后的阈值
     */
    _calcThresholdsForSize(size) {
      const base = this._baseThresholds;
      let flowRatio = 1.0;
      let eurekaRatio = 1.0;
      let stuckRatio = 1.0;

      if (size <= 4) {
        flowRatio = 2 / 3;   // 2 连击心流（基础是 3）
        eurekaRatio = 4 / 8; // 4 连击 EUREKA（基础是 8）
        stuckRatio = 0.6;    // 小盘面更快触发卡顿提示
      } else if (size === 6) {
        flowRatio = 3 / 3;   // 3 连击心流
        eurekaRatio = 6 / 8; // 6 连击 EUREKA
        stuckRatio = 0.8;
      } else {
        // 9x9：标准值
        flowRatio = 4 / 3;   // 4 连击心流
        eurekaRatio = 1.0;   // 8 连击 EUREKA
        stuckRatio = 1.0;
      }

      return {
        stuckMs: Math.round(base.stuckMs * stuckRatio),
        anxiousWindowMs: base.anxiousWindowMs,
        anxiousErrorCount: Math.max(2, Math.round(base.anxiousErrorCount * (size <= 4 ? 0.7 : 1))),
        flowWindowMs: base.flowWindowMs,
        flowCount: Math.max(2, Math.round(base.flowCount * flowRatio)),
        eurekaCount: Math.max(3, Math.round(base.eurekaCount * eurekaRatio)),
      };
    }

    getState() {
      this.update(0);
      return {
        isStuck: this.dimensions.stuck.value,
        isAnxious: this.dimensions.anxious.value,
        inFlowState: this.dimensions.flow.value,
        rhythm: this.dimensions.rhythm.value,
        consecutiveCorrect: this.counters.consecutiveCorrect,
        consecutiveWrong: this.counters.consecutiveWrong,
        totalCorrect: this.counters.totalCorrect,
        totalWrong: this.counters.totalWrong,
        totalAttempts: this.counters.totalAttempts,
        totalHints: this.counters.totalHints,
        gridSize: this.gridSize,
        eurekaCount: this.thresholds.eurekaCount,
      };
    }

    snapshot() {
      const state = this.getState();
      state.totalTime = (Date.now() - this._lastActionTime) / 1000;
      return state;
    }
  }

  global.PlayerStateMonitor = PlayerStateMonitor;
})(window);
