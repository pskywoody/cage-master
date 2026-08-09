/**
 * PlayerStateMonitor - Perception Layer
 * =======================================
 * 感知层核心模块：追踪玩家操作行为，从原始事件中推导出高阶状态
 *（如卡顿、焦虑、心流、节奏感等），为上层决策提供结构化输入。
 *
 * 职责：
 *  - 监听 onFillCorrect / onFillWrong / onNote / onHint 等事件
 *  - 维护内部计数器与维度状态（stuck / anxious / flow / rhythm）
 *  - 根据盘面尺寸动态调整阈值
 *  - 通过 getState() / snapshot() 对外暴露当前状态快照
 *
 * ES Module 迁移说明：
 *  - 从 IIFE 模式迁移为 ES Module，使用 `export class PlayerStateMonitor`
 *  - 所有 Public 方法添加 try-catch 保护，防止单点异常影响调用链
 *  - localStorage 依赖改为可选的注入方式（通过 config.dataStore 传递）
 *  - Private 方法调用在 Public 方法中通过 try-catch 兜底
 *
 * @module perception/player-state-monitor
 */

// ---------------------------------------------------------------------------
// 默认的 localStorage 适配器（仅在全局可用时生效）
// ---------------------------------------------------------------------------
const defaultStorage = (typeof localStorage !== 'undefined') ? localStorage : null;

export class PlayerStateMonitor {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.gridSize=9]          盘面尺寸
   * @param {number} [config.stuckMs]             卡顿阈值（ms）
   * @param {number} [config.anxiousWindowMs]     焦虑检测窗口（ms）
   * @param {number} [config.anxiousErrorCount]   焦虑触发的连续错误次数
   * @param {number} [config.flowWindowMs]        心流窗口（ms）
   * @param {number} [config.flowCount]           心流触发连击数
   * @param {number} [config.eurekaCount]         EUREKA 触发连击数
   * @param {Object} [config.dataStore]           可选的外部存储注入（替代 localStorage）
   * @param {Object} [config.storage]             config.dataStore 的别名，两者取其一
   */
  constructor(config = {}) {
    try {
      // 可选存储注入：优先使用 config.dataStore 或 config.storage
      this._store = config.dataStore || config.storage || defaultStorage;

      // 盘面尺寸（影响动态阈值）
      this.gridSize = config.gridSize || 9;

      // 基础阈值（9x9 标准值）
      this._baseThresholds = {
        stuckMs: config.stuckMs || 30000,
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

      // V4.3.27（P0-2）：语义事件发射（决策层 subscribe）
      this._eventListeners = [];
      this._lastEmittedEvent = null;
      this._lastEmitTime = 0;
      // BLIND_GUESS 推断窗口：上一次填数后过快填错（无中间思考）视为盲猜
      this._lastFillInfo = null;

      this._fillHistory = [];
      this._lastFillTime = Date.now();
      this._lastActionTime = Date.now();
      this._levelActive = false;
    } catch (e) {
      console.error('PlayerStateMonitor.constructor:', e);
    }
  }

  // -----------------------------------------------------------------------
  // Public Methods
  // -----------------------------------------------------------------------

  /**
   * 关卡开始，重置所有状态
   */
  onLevelStart() {
    try {
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
    } catch (e) {
      console.error('PlayerStateMonitor.onLevelStart:', e);
    }
  }

  /**
   * 关卡结束
   */
  onLevelEnd() {
    try {
      this._levelActive = false;
    } catch (e) {
      console.error('PlayerStateMonitor.onLevelEnd:', e);
    }
  }

  /**
   * 记录一次正确填数
   * @param {number} row
   * @param {number} col
   * @param {number} num
   */
  onFillCorrect(row, col, num) {
    try {
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

      // V4.3.27（P0-2）：连续正确达到心流 → 发射 FLOW（静默，不打扰）
      if (this.dimensions.flow.value) {
        this._emitEvent('FLOW', { consecutive: this.counters.consecutiveCorrect });
      }
      this._lastFillInfo = { time: now, correct: true };
    } catch (e) {
      console.error('PlayerStateMonitor.onFillCorrect:', e);
    }
  }

  /**
   * 记录一次错误填数
   * @param {number} row
   * @param {number} col
   * @param {number} num
   */
  onFillWrong(row, col, num) {
    try {
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

      // V4.3.27（P0-2）：填错事件发射——连续 2+ 错 = FRUSTRATED；上次填后过短时间就填错 = BLIND_GUESS
      const errCount = this.counters.consecutiveWrong;
      if (errCount >= this.thresholds.anxiousErrorCount) {
        this._emitEvent('FRUSTRATED', { consecutiveWrong: errCount });
      } else if (errCount === 1) {
        // 单次填错：推断是否盲猜（距上一次填数 < 3s 且不是连续思考后的填错）
        const last = this._lastFillInfo;
        if (last && (now - last.time) < 3000 && !this.dimensions.anxious.value) {
          this._emitEvent('BLIND_GUESS', { intervalMs: now - last.time });
        }
      }
      this._emitEvent('ERROR', { consecutiveWrong: errCount });
      this._lastFillInfo = { time: now, correct: false };
    } catch (e) {
      console.error('PlayerStateMonitor.onFillWrong:', e);
    }
  }

  /**
   * 记录一次笔记操作
   * @param {number} row
   * @param {number} col
   * @param {number} num
   */
  onNote(row, col, num) {
    try {
      this._lastActionTime = Date.now();
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
    } catch (e) {
      console.error('PlayerStateMonitor.onNote:', e);
    }
  }

  /**
   * 记录一次提示使用
   */
  onHint() {
    try {
      this.counters.totalHints++;
      this._lastActionTime = Date.now();
      this.dimensions.stuck = { value: false, duration: 0, since: 0 };
    } catch (e) {
      console.error('PlayerStateMonitor.onHint:', e);
    }
  }

  /**
   * 每帧更新（检测卡顿、焦虑持续时间等）
   * @param {number} deltaTime  帧间隔（ms），当前未使用
   */
  update(deltaTime) {
    try {
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

      // V4.3.27（P0-2）：卡顿状态进入时发射 STUCK（保持心跳检测，事件驱动即时干预）
      if (this.dimensions.stuck.value && this.dimensions.stuck.since > 0 && this._lastEmittedEvent !== 'STUCK') {
        this._emitEvent('STUCK', { idleMs: this.dimensions.stuck.duration });
      }
    } catch (e) {
      console.error('PlayerStateMonitor.update:', e);
    }
  }

  // -----------------------------------------------------------------------
  // V4.3.27（P0-2）：语义事件发射
  // -----------------------------------------------------------------------

  /**
   * 订阅感知事件（决策层/主循环调用）
   * @param {Function} listener - (event, data) => void
   */
  onEvent(listener) {
    try {
      if (typeof listener === 'function') this._eventListeners.push(listener);
    } catch (e) {}
  }

  /**
   * 内部发射事件（去重：同一事件 800ms 内不重复发射）
   */
  _emitEvent(event, data) {
    try {
      const now = Date.now();
      if (this._lastEmittedEvent === event && (now - this._lastEmitTime) < 800) return;
      this._lastEmittedEvent = event;
      this._lastEmitTime = now;
      for (const fn of this._eventListeners) {
        try { fn(event, data || {}); } catch (e) { /* 单监听器失败不影响其他 */ }
      }
    } catch (e) {}
  }

  /**
   * 设置盘面尺寸，动态调整所有阈值
   * 4x4 -> 心流 2 连击，EUREKA 4 连击
   * 6x6 -> 心流 3 连击，EUREKA 6 连击
   * 9x9 -> 心流 4 连击，EUREKA 8 连击
   * @param {number} size
   */
  setGridSize(size) {
    try {
      this.gridSize = size;
      this.thresholds = this._calcThresholdsForSize(size);
    } catch (e) {
      console.error('PlayerStateMonitor.setGridSize:', e);
    }
  }

  /**
   * 获取当前状态快照
   * @returns {Object}
   */
  getState() {
    try {
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
    } catch (e) {
      console.error('PlayerStateMonitor.getState:', e);
      return null;
    }
  }

  /**
   * 获取完整快照（含总耗时）
   * @returns {Object|null}
   */
  snapshot() {
    try {
      const state = this.getState();
      if (!state) return null;
      state.totalTime = (Date.now() - this._lastActionTime) / 1000;
      return state;
    } catch (e) {
      console.error('PlayerStateMonitor.snapshot:', e);
      return null;
    }
  }

  // -----------------------------------------------------------------------
  // Private Methods
  // -----------------------------------------------------------------------

  /**
   * 更新心流状态
   * @param {number}  now
   * @param {number}  interval
   * @param {boolean} correct
   */
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

  /**
   * 更新节奏感状态
   */
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
      flowRatio = 2 / 3;
      eurekaRatio = 4 / 8;
      stuckRatio = 0.6;
    } else if (size === 6) {
      flowRatio = 3 / 3;
      eurekaRatio = 6 / 8;
      stuckRatio = 0.8;
    } else {
      flowRatio = 4 / 3;
      eurekaRatio = 1.0;
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
}
