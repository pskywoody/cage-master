// ExpertSystem - Facade for the 5-layer expert system (ES Module)
// V4: ES Module format with dependency injection, degradation, and SafeTimer

import { PlayerStateMonitor } from './perception/player-state-monitor.js';
import { DecisionEngine } from './decision/decision-engine.js';
import { ExpressionDirector } from './expression/expression-director.js';
import { LearningSystem } from './learning/learning-system.js';
import { BeatQuantizer } from './timing/beat-quantizer.js';

export class ExpertSystem {
  /**
   * @param {Object} [config={}] - Configuration object
   * @param {PlayerStateMonitor} [config.perception] - Injected perception instance (optional)
   * @param {DecisionEngine} [config.decision] - Injected decision instance (optional)
   * @param {ExpressionDirector} [config.expression] - Injected expression instance (optional)
   * @param {LearningSystem} [config.learning] - Injected learning instance (optional)
   * @param {BeatQuantizer} [config.beat] - Injected beat quantizer instance (optional)
   * @param {Object} [config.perception={}] - Perception config (used when auto-initializing)
   * @param {Object} [config.decision={}] - Decision config (used when auto-initializing)
   * @param {Object} [config.expression={}] - Expression config (used when auto-initializing)
   * @param {Object} [config.learning={}] - Learning config (used when auto-initializing)
   * @param {Object} [config.beat={interval:2000}] - Beat config (used when auto-initializing)
   */
  constructor(config = {}) {
    // Allow injection of sub-module instances (optional)
    this.perception = config.perception || null;
    this.decision = config.decision || null;
    this.expression = config.expression || null;
    this.learning = config.learning || null;
    this.beat = config.beat || null;

    // Auto-initialize sub-modules if not injected (with degradation)
    this._initSubModules(config);

    this._feedbackCallback = null;
    this._heartbeatTimers = new Set();

    // Replay system (optional, initialized on demand)
    this._replaySystem = null;
    this._board = null;

    // Dynamic thresholds flag
    this._dynamicThresholdsEnabled = false;

    // Register action handlers (with null/window safety)
    this._registerActionHandlers();

    // Wire up learning system to decision engine for proficiency-based thresholds
    if (this.decision && this.learning) {
      try {
        this.decision.setLearningSystem(this.learning);
      } catch (e) {
        console.warn('[ExpertSystem] Failed to wire learning system to decision engine:', e);
      }
    }

    // V4.3.27（P0-2）：感知事件 → 决策层 decideEvent → 表达层（事件驱动闭环）
    if (this.perception && this.decision) {
      try {
        this.perception.onEvent((event, data) => {
          try {
            this._handlePerceptionEvent(event, data);
          } catch (e) {
            console.warn('[ExpertSystem] perception event handling failed:', e);
          }
        });
      } catch (e) {
        console.warn('[ExpertSystem] Failed to subscribe perception events:', e);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Sub-module initialization with degradation
  // ---------------------------------------------------------------------------

  _initSubModules(config) {
    if (!this.perception) {
      try {
        this.perception = new PlayerStateMonitor(config.perception || {});
      } catch (e) {
        console.warn('[ExpertSystem] Failed to initialize PlayerStateMonitor:', e);
        this.perception = null;
      }
    }
    if (!this.decision || typeof this.decision.setLearningSystem !== 'function') {
      // 2026-08-03 修复：config.decision 传配置对象而非实例时，用配置构造 DecisionEngine
      const dcfg = (config.decision && typeof config.decision === 'object'
        && typeof config.decision.setLearningSystem !== 'function')
        ? config.decision : {};
      try {
        this.decision = new DecisionEngine(dcfg);
      } catch (e) {
        console.warn('[ExpertSystem] Failed to initialize DecisionEngine:', e);
        this.decision = null;
      }
    }
    if (!this.expression) {
      try {
        this.expression = new ExpressionDirector(config.expression || {});
      } catch (e) {
        console.warn('[ExpertSystem] Failed to initialize ExpressionDirector:', e);
        this.expression = null;
      }
    }
    if (!this.learning) {
      try {
        this.learning = new LearningSystem(config.learning || {});
      } catch (e) {
        console.warn('[ExpertSystem] Failed to initialize LearningSystem:', e);
        this.learning = null;
      }
    }
    if (!this.beat) {
      try {
        const beatConfig = config.beat || { interval: 2000 };
        this.beat = new BeatQuantizer(beatConfig);
      } catch (e) {
        console.warn('[ExpertSystem] Failed to initialize BeatQuantizer:', e);
        this.beat = null;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Action handler registration with window safety
  // ---------------------------------------------------------------------------

  _registerActionHandlers() {
    // Safety check: resolve global object (browser window or Node globalThis)
    const globalObj = (typeof window !== 'undefined' && window !== null) ? window : globalThis;

    if (!this.expression) {
      console.warn('[ExpertSystem] ExpressionDirector not available, skipping action handler registration');
      return;
    }

    try {
      this.expression.registerActionHandler('SHOW_TOAST', (params) => {
        const msg = params.message || '';
        if (typeof globalObj.showToast === 'function') {
          globalObj.showToast(msg, params.duration || 2500);
        }
        if (this._feedbackCallback) {
          try { this._feedbackCallback(msg, params.level || 'info'); } catch (e) { /* ignore */ }
        }
      });

      this.expression.registerActionHandler('SHOW_DIALOG', (params) => {
        const dialogId = params.dialogId || 'default';
        const text = params.text || this._getDialogText(dialogId);
        if (typeof globalObj.showToast === 'function') {
          globalObj.showToast(text, 3500);
        }
        if (this._feedbackCallback) {
          try { this._feedbackCallback(text, 'dialog'); } catch (e) { /* ignore */ }
        }
      });

      this.expression.registerActionHandler('EUREKA', (params) => {
        const msg = params.message || '\u7206\u53d1\uff01';
        if (typeof globalObj.showToast === 'function') {
          globalObj.showToast(msg, 3000);
        }
        if (typeof globalObj.Effects !== 'undefined' && typeof globalObj.Effects.triggerLevel === 'function') {
          globalObj.Effects.triggerLevel(params.level || 3);
        }
        if (typeof globalObj.AudioManager !== 'undefined' && typeof globalObj.AudioManager.playEureka === 'function') {
          globalObj.AudioManager.playEureka();
        }
        if (this._feedbackCallback) {
          try { this._feedbackCallback(msg, 'success'); } catch (e) { /* ignore */ }
        }
      });
    } catch (e) {
      console.warn('[ExpertSystem] Failed to register action handlers:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Dialog text lookup
  // ---------------------------------------------------------------------------

  _getDialogText(id) {
    const dialogs = {
      stuck_guide: '\u8bd5\u8bd5\u6362\u4e2a\u89d2\u5ea6\u770b\u76d8\u9762\uff0c\u6216\u8005\u7528\u7b14\u8bb0\u6807\u8bb0\u5019\u9009\u6570\u3002',
      ambient_encouragement: '\u7ee7\u7eed\u4fdd\u6301\uff0c\u4f60\u505a\u5f97\u5f88\u597d\u3002',
    };
    return dialogs[id] || '';
  }

  // ---------------------------------------------------------------------------
  // Public: Initialization
  // ---------------------------------------------------------------------------

  /**
   * Initialize the expert system with runtime configuration.
   * @param {Object} [config={}]
   * @param {Object} [config.thresholds] - Threshold overrides for perception layer
   * @param {Function} [config.onFeedback] - Feedback callback (msg, level)
   * @param {Object} [config.board] - Board instance for replay system
   * @param {Function} [config.onReplayStepChange] - Replay step change callback
   * @param {Function} [config.onReplayKeyStep] - Replay key step callback
   * @param {number} [config.replaySpeed=2] - Replay playback speed
   * @param {boolean} [config.dynamicThresholds] - Enable dynamic threshold adjustment
   * @param {number} [config.levelsCompleted] - Number of levels completed
   * @param {string} [config.playerLevel] - Player level identifier
   */
  init(config = {}) {
    try {
      // Apply threshold overrides
      if (config.thresholds && this.perception) {
        this.perception.thresholds = { ...this.perception.thresholds, ...config.thresholds };
      }
      if (config.onFeedback) {
        this._feedbackCallback = config.onFeedback;
      }

      // Replay system initialization (optional)
      const globalObj = (typeof window !== 'undefined' && window !== null) ? window : globalThis;
      if (config.board && typeof globalObj.ReplaySystem !== 'undefined') {
        this._board = config.board;
        try {
          this._replaySystem = new globalObj.ReplaySystem(config.board, {
            onStepChange: config.onReplayStepChange || null,
            onKeyStep: config.onReplayKeyStep || null,
            speed: config.replaySpeed || 2,
          });
        } catch (e) {
          console.warn('[ExpertSystem] Failed to initialize ReplaySystem:', e);
          this._replaySystem = null;
        }
      }

      // Dynamic thresholds (optional, enabled by config)
      if (config.dynamicThresholds && this.decision) {
        this._dynamicThresholdsEnabled = true;
        try {
          this.decision.setDynamicThresholdsEnabled(true);
        } catch (e) {
          console.warn('[ExpertSystem] Failed to enable dynamic thresholds:', e);
        }
        if (config.levelsCompleted !== undefined) {
          try {
            this.decision.setLevelsCompleted(config.levelsCompleted);
          } catch (e) {
            console.warn('[ExpertSystem] Failed to set levelsCompleted:', e);
          }
        }
        if (config.playerLevel) {
          try {
            this.decision.setPlayerLevel(config.playerLevel);
          } catch (e) {
            console.warn('[ExpertSystem] Failed to set playerLevel:', e);
          }
        }
      }
    } catch (e) {
      console.warn('[ExpertSystem] init() failed:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Public: Level lifecycle
  // ---------------------------------------------------------------------------

  onLevelStart() {
    try {
      if (this.perception) {
        this.perception.onLevelStart();
      }
      if (this.decision) {
        this.decision.onLevelStart();
      }

      // Start replay recording if available
      if (this._replaySystem) {
        try {
          this._replaySystem.record();
        } catch (e) {
          console.warn('[ExpertSystem] Replay record failed:', e);
        }
      }

      this._startHeartbeat();
    } catch (e) {
      console.warn('[ExpertSystem] onLevelStart() failed:', e);
    }
  }

  onLevelEnd(stats) {
    try {
      this._stopHeartbeat();

      if (this.perception) {
        this.perception.onLevelEnd();
      }
      if (this.decision) {
        this.decision.onLevelEnd();
      }

      // Stop replay recording and save data to learning system
      if (this._replaySystem) {
        try {
          this._replaySystem.stopRecording();
          if (this.learning && typeof this.learning.recordReplay === 'function') {
            try {
              const replayData = this._replaySystem.exportReplay();
              this.learning.recordReplay(replayData);
            } catch (e) { /* ignore replay data save errors */ }
          }
          this._lastReplayData = this._replaySystem.exportReplay();
        } catch (e) {
          console.warn('[ExpertSystem] Replay save failed:', e);
        }
      }

      // Update levels completed count for dynamic thresholds
      if (this._dynamicThresholdsEnabled && this.decision) {
        try {
          const currentLevels = (this.learning && this.learning._data && this.learning._data.totalFills)
            ? Math.floor(this.learning._data.totalFills / 30) : 0;
          this.decision.setLevelsCompleted(currentLevels);
        } catch (e) {
          console.warn('[ExpertSystem] Dynamic threshold update failed:', e);
        }
      }

      return this.perception ? this.perception.snapshot() : null;
    } catch (e) {
      console.warn('[ExpertSystem] onLevelEnd() failed:', e);
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Public: Player action handlers
  // ---------------------------------------------------------------------------

  onFillCorrect(row, col, num) {
    try {
      if (this.perception) {
        this.perception.onFillCorrect(row, col, num);
      }
      if (this.learning) {
        this.learning.recordFill(row, col, num, true);
      }
      this._decideAndExecute();
    } catch (e) {
      console.warn('[ExpertSystem] onFillCorrect() failed:', e);
    }
  }

  onFillWrong(row, col, num) {
    try {
      if (this.perception) {
        this.perception.onFillWrong(row, col, num);
      }
      if (this.learning) {
        this.learning.recordFill(row, col, num, false);
      }
      this._decideAndExecute();
    } catch (e) {
      console.warn('[ExpertSystem] onFillWrong() failed:', e);
    }
  }

  onNote(row, col, num) {
    try {
      if (this.perception) {
        this.perception.onNote(row, col, num);
      }
    } catch (e) {
      console.warn('[ExpertSystem] onNote() failed:', e);
    }
  }

  onHint() {
    try {
      if (this.perception) {
        this.perception.onHint();
      }
      if (this.learning) {
        this.learning.recordHint();
      }
      this._decideAndExecute();
    } catch (e) {
      console.warn('[ExpertSystem] onHint() failed:', e);
    }
  }

  onPause() {
    try {
      this._stopHeartbeat();
    } catch (e) {
      console.warn('[ExpertSystem] onPause() failed:', e);
    }
  }

  onResume() {
    try {
      this._startHeartbeat();
    } catch (e) {
      console.warn('[ExpertSystem] onResume() failed:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Decision loop
  // ---------------------------------------------------------------------------

  _decideAndExecute() {
    // Guard: perception and decision must be available
    if (!this.perception || !this.decision) {
      return;
    }

    try {
      const state = this.perception.getState();

      // Apply dynamic thresholds if enabled
      if (this._dynamicThresholdsEnabled && this.decision.adjustThresholds) {
        try {
          const perceptionAdjustments = this.decision.adjustThresholds(state);
          if (perceptionAdjustments) {
            if (perceptionAdjustments.stuckMs !== undefined) {
              this.perception.thresholds.stuckMs = perceptionAdjustments.stuckMs;
            }
            if (perceptionAdjustments.anxiousErrorCount !== undefined) {
              this.perception.thresholds.anxiousErrorCount = perceptionAdjustments.anxiousErrorCount;
            }
            if (perceptionAdjustments.flowCount !== undefined) {
              this.perception.thresholds.flowCount = perceptionAdjustments.flowCount;
            }
          }
        } catch (e) {
          console.warn('[ExpertSystem] Threshold adjustment failed:', e);
        }
      }

      const commands = this.decision.decide(state);

      if (commands && this.beat && this.expression) {
        commands.forEach(cmd => {
          this.beat.enqueue(cmd, (item) => {
            this.expression.enqueue(item);
          });
        });
      }
    } catch (e) {
      console.warn('[ExpertSystem] _decideAndExecute() failed:', e);
    }
  }

  /**
   * V4.3.27（P0-2）：感知层语义事件 → 决策层 decideEvent → 表达层
   * 即时事件（填数/错误/笔记/卡顿）走事件驱动，心跳轮询仍在 _decideAndExecute 保留（stuck 兜底）
   */
  _handlePerceptionEvent(event, data) {
    try {
      if (!this.decision || !this.expression) return;

      const profile = this.learning && typeof this.learning.getProfile === 'function'
        ? this.learning.getProfile() : null;
      const intervention = this.decision.decideEvent(event, profile, data || {});

      if (!intervention || intervention.intensity <= 0) return;

      // 组装成表达层指令并推入时序队列（复用 beat 队列，享受节拍/冷却调度）
      const cmd = {
        target: 'ExpressionDirector',
        action: intervention.action,
        priority: intervention.intensity >= 3 ? 80 : 50,
        payload: {
          dialogId: intervention.payload.dialogId,
          message: intervention.payload.message,
          character: intervention.character,
          technique: intervention.technique,
        },
      };

      if (this.beat) {
        this.beat.enqueue(cmd, (item) => {
          this.expression.enqueue(item);
        });
      } else {
        this.expression.enqueue(cmd);
      }
    } catch (e) {
      console.warn('[ExpertSystem] _handlePerceptionEvent failed:', e);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: Heartbeat (SafeTimer pattern)
  // ---------------------------------------------------------------------------

  _startHeartbeat() {
    // SafeTimer: save timer ID to Set for cleanup on exception
    this._stopHeartbeat();

    const timerId = setInterval(() => {
      try {
        if (this.perception) {
          this.perception.update(1000);
        }
        this._decideAndExecute();
      } catch (e) {
        // SafeTimer: clean up ALL timers and re-throw to prevent silent timer leaks
        console.warn('[ExpertSystem] Heartbeat cycle failed, cleaning up timers:', e);
        this._heartbeatTimers.forEach((id) => {
          clearInterval(id);
        });
        this._heartbeatTimers.clear();
        throw e;
      }
    }, 1000);

    this._heartbeatTimers.add(timerId);
  }

  _stopHeartbeat() {
    this._heartbeatTimers.forEach((id) => {
      clearInterval(id);
    });
    this._heartbeatTimers.clear();
  }

  // ---------------------------------------------------------------------------
  // Public: State queries
  // ---------------------------------------------------------------------------

  getFeedback() {
    try {
      return this.perception ? this.perception.getState() : null;
    } catch (e) {
      console.warn('[ExpertSystem] getFeedback() failed:', e);
      return null;
    }
  }

  getReport() {
    try {
      return this.perception ? this.perception.snapshot() : null;
    } catch (e) {
      console.warn('[ExpertSystem] getReport() failed:', e);
      return null;
    }
  }

  getLearning() {
    return this.learning;
  }

  /**
   * Get the replay system instance, if initialized.
   * @returns {Object|null}
   */
  getReplaySystem() {
    return this._replaySystem;
  }

  /**
   * Get the last replay data from the most recently completed level.
   * @returns {Object|null}
   */
  getLastReplay() {
    return this._lastReplayData || null;
  }

  /**
   * Set the grid size, dynamically adjusting expert system layer thresholds.
   * Called when loading a level.
   * @param {number} size - Grid size (4/6/9)
   */
  setGridSize(size) {
    try {
      if (this.perception && typeof this.perception.setGridSize === 'function') {
        this.perception.setGridSize(size);
      }
      if (this.decision && typeof this.decision.setGridSize === 'function') {
        this.decision.setGridSize(size);
      }
    } catch (e) {
      console.warn('[ExpertSystem] setGridSize() failed:', e);
    }
  }

  /**
   * Enable or disable dynamic threshold adjustment.
   * @param {boolean} enabled
   */
  setDynamicThresholdsEnabled(enabled) {
    try {
      this._dynamicThresholdsEnabled = enabled;
      if (this.decision && typeof this.decision.setDynamicThresholdsEnabled === 'function') {
        this.decision.setDynamicThresholdsEnabled(enabled);
      }
    } catch (e) {
      console.warn('[ExpertSystem] setDynamicThresholdsEnabled() failed:', e);
    }
  }

  /**
   * Check if dynamic thresholds are enabled.
   * @returns {boolean}
   */
  isDynamicThresholdsEnabled() {
    return this._dynamicThresholdsEnabled;
  }
}