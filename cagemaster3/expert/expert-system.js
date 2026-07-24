// ExpertSystem - Facade for the 5-layer expert system
// Clean implementation following the architecture spec

;(function(global) {
  'use strict';

  class ExpertSystem {
    constructor() {
      this.perception = new global.PlayerStateMonitor();
      this.decision = new global.DecisionEngine();
      this.expression = new global.ExpressionDirector();
      this.learning = new global.LearningSystem();
      this.beat = new global.BeatQuantizer({ interval: 2000 });

      this._feedbackCallback = null;
      this._heartbeatTimer = null;

      // Replay system (optional, initialized on demand)
      this._replaySystem = null;
      this._board = null;

      // Dynamic thresholds flag
      this._dynamicThresholdsEnabled = false;

      this._registerActionHandlers();

      // Wire up learning system to decision engine for proficiency-based thresholds
      this.decision.setLearningSystem(this.learning);
    }

    _registerActionHandlers() {
      this.expression.registerActionHandler('SHOW_TOAST', (params) => {
        const msg = params.message || '';
        if (typeof global.showToast === 'function') {
          global.showToast(msg, params.duration || 2500);
        }
        if (this._feedbackCallback) {
          try { this._feedbackCallback(msg, params.level || 'info'); } catch(e) {}
        }
      });

      this.expression.registerActionHandler('SHOW_DIALOG', (params) => {
        const dialogId = params.dialogId || 'default';
        const text = params.text || this._getDialogText(dialogId);
        if (typeof global.showToast === 'function') {
          global.showToast(text, 3500);
        }
        if (this._feedbackCallback) {
          try { this._feedbackCallback(text, 'dialog'); } catch(e) {}
        }
      });

      this.expression.registerActionHandler('EUREKA', (params) => {
        const msg = params.message || '爆发！';
        if (typeof global.showToast === 'function') {
          global.showToast(msg, 3000);
        }
        if (typeof global.Effects !== 'undefined' && typeof global.Effects.triggerLevel === 'function') {
          global.Effects.triggerLevel(params.level || 3);
        }
        if (typeof global.AudioManager !== 'undefined' && typeof global.AudioManager.playEureka === 'function') {
          global.AudioManager.playEureka();
        }
        if (this._feedbackCallback) {
          try { this._feedbackCallback(msg, 'success'); } catch(e) {}
        }
      });
    }

    _getDialogText(id) {
      const dialogs = {
        stuck_guide: '试试换个角度看盘面，或者用笔记标记候选数。',
        ambient_encouragement: '继续保持，你做得很好。',
      };
      return dialogs[id] || '';
    }

    init(config = {}) {
      if (config.thresholds) {
        this.perception.thresholds = { ...this.perception.thresholds, ...config.thresholds };
      }
      if (config.onFeedback) {
        this._feedbackCallback = config.onFeedback;
      }

      // Replay system initialization (optional)
      if (config.board && global.ReplaySystem) {
        this._board = config.board;
        this._replaySystem = new global.ReplaySystem(config.board, {
          onStepChange: config.onReplayStepChange || null,
          onKeyStep: config.onReplayKeyStep || null,
          speed: config.replaySpeed || 2,
        });
      }

      // Dynamic thresholds (optional, enabled by config)
      if (config.dynamicThresholds) {
        this._dynamicThresholdsEnabled = true;
        this.decision.setDynamicThresholdsEnabled(true);
        if (config.levelsCompleted !== undefined) {
          this.decision.setLevelsCompleted(config.levelsCompleted);
        }
        if (config.playerLevel) {
          this.decision.setPlayerLevel(config.playerLevel);
        }
      }
    }

    onLevelStart() {
      this.perception.onLevelStart();
      this.decision.onLevelStart();

      // Start replay recording if available
      if (this._replaySystem) {
        this._replaySystem.record();
      }

      this._startHeartbeat();
    }

    onLevelEnd(stats) {
      this._stopHeartbeat();
      this.perception.onLevelEnd();
      this.decision.onLevelEnd();

      // Stop replay recording and save data to learning system
      if (this._replaySystem) {
        const stepCount = this._replaySystem.stopRecording();
        // Save replay data to learning system if possible
        if (this.learning && typeof this.learning.recordReplay === 'function') {
          try {
            const replayData = this._replaySystem.exportReplay();
            this.learning.recordReplay(replayData);
          } catch(e) {}
        }
        // Store last replay for access via getLastReplay
        this._lastReplayData = this._replaySystem.exportReplay();
      }

      // Update levels completed count for dynamic thresholds
      if (this._dynamicThresholdsEnabled) {
        const currentLevels = (this.learning._data && this.learning._data.totalFills) ?
          Math.floor(this.learning._data.totalFills / 30) : 0;
        this.decision.setLevelsCompleted(currentLevels);
      }

      return this.perception.snapshot();
    }

    onFillCorrect(row, col, num) {
      this.perception.onFillCorrect(row, col, num);
      this.learning.recordFill(row, col, num, true);
      this._decideAndExecute();
    }

    onFillWrong(row, col, num) {
      this.perception.onFillWrong(row, col, num);
      this.learning.recordFill(row, col, num, false);
      this._decideAndExecute();
    }

    onNote(row, col, num) {
      this.perception.onNote(row, col, num);
    }

    onHint() {
      this.perception.onHint();
      this.learning.recordHint();
      this._decideAndExecute();
    }

    onPause() {
      this._stopHeartbeat();
    }

    onResume() {
      this._startHeartbeat();
    }

    _decideAndExecute() {
      const state = this.perception.getState();

      // Apply dynamic thresholds if enabled
      if (this._dynamicThresholdsEnabled && this.decision.adjustThresholds) {
        const perceptionAdjustments = this.decision.adjustThresholds(state);
        if (perceptionAdjustments) {
          // Apply adjusted thresholds to perception layer
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
      }

      const commands = this.decision.decide(state);

      commands.forEach(cmd => {
        this.beat.enqueue(cmd, (item) => {
          this.expression.enqueue(item);
        });
      });
    }

    _startHeartbeat() {
      this._stopHeartbeat();
      this._heartbeatTimer = setInterval(() => {
        this.perception.update(1000);
        this._decideAndExecute();
      }, 1000);
    }

    _stopHeartbeat() {
      if (this._heartbeatTimer) {
        clearInterval(this._heartbeatTimer);
        this._heartbeatTimer = null;
      }
    }

    getFeedback() {
      return this.perception.getState();
    }

    getReport() {
      return this.perception.snapshot();
    }

    getLearning() {
      return this.learning;
    }

    /**
     * Get the replay system instance, if initialized.
     * @returns {ReplaySystem|null}
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
     * 设置盘面尺寸，动态调整专家系统各层阈值
     * 在加载关卡时调用
     * @param {number} size - 盘面尺寸（4/6/9）
     */
    setGridSize(size) {
      if (this.perception && typeof this.perception.setGridSize === 'function') {
        this.perception.setGridSize(size);
      }
      if (this.decision && typeof this.decision.setGridSize === 'function') {
        this.decision.setGridSize(size);
      }
    }

    /**
     * Enable or disable dynamic threshold adjustment.
     */
    setDynamicThresholdsEnabled(enabled) {
      this._dynamicThresholdsEnabled = enabled;
      this.decision.setDynamicThresholdsEnabled(enabled);
    }

    /**
     * Check if dynamic thresholds are enabled.
     */
    isDynamicThresholdsEnabled() {
      return this._dynamicThresholdsEnabled;
    }
  }

  global.ExpertSystem = ExpertSystem;
})(window);
