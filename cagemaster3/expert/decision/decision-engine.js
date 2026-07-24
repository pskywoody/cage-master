// DecisionEngine - Decision Layer
// Rules engine that generates commands from player state

;(function(global) {
  'use strict';

  class DecisionEngine {
    constructor(config = {}) {
      this._lastDecision = null;
      this._coolDownMap = {};
      this._levelActive = false;

      // 盘面尺寸（影响动态阈值）
      this.gridSize = config.gridSize || 9;

      // Default (base) thresholds
      this._baseCoolDowns = {
        stuck_guide: config.stuckCooldown || 30000,
        anxiety_cooldown: config.anxietyCooldown || 15000,
        flow_encouragement: config.flowCooldown || 10000,
        teaching_nudge: config.teachingCooldown || 60000,
        eureka_burst: config.eurekaCooldown || 30000,
        progress_milestone: config.progressCooldown || 5000,
      };

      // Current active cooldowns (may be adjusted dynamically)
      this.coolDowns = { ...this._baseCoolDowns };

      // Dynamic threshold state
      this._dynamicConfig = {
        enabled: config.dynamicThresholds !== false,
        playerLevel: 'intermediate', // novice / intermediate / advanced
        levelsCompleted: config.levelsCompleted || 0,
      };

      // Reference to learning system (optional, for proficiency-based adjustment)
      this._learningSystem = null;

      this._rules = this._buildRules();
    }

    _buildRules() {
      return [
        {
          id: 'teaching_trigger',
          priority: 100,
          check: (s) => s.isStuck && s.consecutiveWrong >= 2,
          action: 'SHOW_DIALOG',
          payload: { dialogId: 'stuck_guide' },
          cooldownKey: 'teaching_nudge',
        },
        {
          id: 'eureka_burst',
          priority: 90,
          check: (s) => s.consecutiveCorrect >= (s.eurekaCount || 8) && s.inFlowState,
          action: 'EUREKA',
          payload: { level: 3, message: '连击爆发！' },
          cooldownKey: 'eureka_burst',
        },
        {
          id: 'stuck_guide',
          priority: 80,
          check: (s) => s.isStuck,
          action: 'SHOW_TOAST',
          payload: { message: '需要提示吗？试试换个角度看盘面。' },
          cooldownKey: 'stuck_guide',
        },
        {
          id: 'anxiety_cooldown',
          priority: 70,
          check: (s) => s.isAnxious,
          action: 'SHOW_TOAST',
          payload: { message: '别急，慢慢来。错误是学习的一部分。' },
          cooldownKey: 'anxiety_cooldown',
        },
        {
          id: 'flow_encouragement',
          priority: 60,
          check: (s) => s.consecutiveCorrect >= Math.max(3, Math.floor((s.eurekaCount || 8) * 0.625)) && s.inFlowState,
          action: 'SHOW_TOAST',
          payload: { message: '心流状态！继续保持！' },
          cooldownKey: 'flow_encouragement',
        },
        {
          id: 'progress_milestone',
          priority: 30,
          check: (s) => s.totalCorrect > 0 && s.totalCorrect % 10 === 0,
          action: 'SHOW_TOAST',
          payload: { message: '已完成 10 个数字！' },
          cooldownKey: 'progress_milestone',
        },
      ];
    }

    /**
     * Set the learning system reference for proficiency-based adjustments.
     */
    setLearningSystem(learningSystem) {
      this._learningSystem = learningSystem;
    }

    /**
     * Adjust thresholds dynamically based on player state and learning data.
     * Called before each decision cycle to adapt cooldowns and thresholds.
     *
     * @param {Object} state - player state from PlayerStateMonitor
     * @returns {Object} adjusted thresholds that should be applied to perception layer
     */
    adjustThresholds(state) {
      if (!this._dynamicConfig.enabled) {
        return null;
      }

      // Start from base values
      const adjusted = { ...this._baseCoolDowns };

      // --- Factor 1: Player level (long-term adaptation)
      const levelFactor = this._getLevelFactor();

      // --- Factor 2: Real-time state (short-term adaptation)
      const stateMultipliers = this._getStateMultipliers(state);

      // --- Factor 3: Learning proficiency (when learning system available)
      const proficiencyFactor = this._getProficiencyFactor();

      // Apply combined adjustments to each cooldown
      for (const key of Object.keys(adjusted)) {
        let value = adjusted[key];

        // Apply level factor
        value = value * levelFactor.cooldownMultiplier;

        // Apply state-specific multipliers
        if (key === 'stuck_guide' || key === 'teaching_nudge') {
          value = value * stateMultipliers.stuckGuide;
        }
        if (key === 'anxiety_cooldown') {
          value = value * stateMultipliers.anxiety;
        }
        if (key === 'flow_encouragement' || key === 'eureka_burst') {
          value = value * stateMultipliers.encouragement;
        }

        // Apply proficiency adjustment
        value = value * proficiencyFactor.cooldownMultiplier;

        adjusted[key] = Math.round(value);
      }

      this.coolDowns = adjusted;

      // Return perception threshold adjustments for the caller to apply
      return {
        stuckMs: Math.round(
          (state.stuckMs || 45000) * levelFactor.stuckMultiplier * stateMultipliers.stuckTime,
        ),
        anxiousErrorCount: Math.max(
          2,
          Math.round((state.anxiousErrorCount || 3) * stateMultipliers.anxietyThreshold),
        ),
        flowCount: Math.max(
          2,
          Math.round((state.flowCount || 3) * proficiencyFactor.flowThreshold),
        ),
      };
    }

    /**
     * Get level-based adjustment factors.
     * 新手期 (novice, 0-3 levels): shorter cooldowns, faster stuck detection
     * 成长期 (intermediate, 4-10 levels): gradual increase
     * 熟练期 (advanced, 10+ levels): default thresholds
     */
    _getLevelFactor() {
      let cooldownMultiplier = 1.0;
      let stuckMultiplier = 1.0;
      const levels = this._dynamicConfig.levelsCompleted;
      const explicitLevel = this._dynamicConfig.playerLevel;

      if (levels === 0 && explicitLevel) {
        // Explicit level set by user, no levelsCompleted to infer from
        if (explicitLevel === 'novice') {
          cooldownMultiplier = 0.5;
          stuckMultiplier = 0.6;
        } else if (explicitLevel === 'intermediate') {
          cooldownMultiplier = 0.75;
          stuckMultiplier = 0.8;
        } else {
          cooldownMultiplier = 1.0;
          stuckMultiplier = 1.0;
        }
      } else {
        // Auto-detect from levelsCompleted
        if (levels <= 3) {
          cooldownMultiplier = 0.5;
          stuckMultiplier = 0.6;
          this._dynamicConfig.playerLevel = 'novice';
        } else if (levels <= 10) {
          // Gradual transition: 0.5 at level 4, 1.0 at level 10
          const t = (levels - 3) / 7;
          cooldownMultiplier = 0.5 + t * 0.5;
          stuckMultiplier = 0.6 + t * 0.4;
          this._dynamicConfig.playerLevel = 'intermediate';
        } else {
          cooldownMultiplier = 1.0;
          stuckMultiplier = 1.0;
          this._dynamicConfig.playerLevel = 'advanced';
        }
      }

      return { cooldownMultiplier, stuckMultiplier };
    }

    /**
     * Get real-time state-based multipliers.
     * - Flow state: reduce encouragement frequency, increase stuck time
     * - Anxious / consecutive wrong: shorter cooldowns, more encouragement
     * - Stuck / long idle: delayed hints but not intrusive
     */
    _getStateMultipliers(state) {
      let stuckGuide = 1.0;
      let anxiety = 1.0;
      let encouragement = 1.0;
      let stuckTime = 1.0;
      let anxietyThreshold = 1.0;

      // Flow state: player is doing well, less encouragement, more patience
      if (state.inFlowState) {
        encouragement = 1.5;      // less frequent encouragement
        stuckTime = 1.3;             // take longer to consider "stuck"
        stuckGuide = 1.3;            // less frequent stuck hints
      }

      // Consecutive wrong: player is struggling, more support
      if (state.consecutiveWrong >= 2) {
        anxiety = 0.5;             // more frequent anxiety support
        stuckGuide = 0.6;           // faster stuck hints come sooner
        encouragement = 0.7;               // more encouragement
        anxietyThreshold = 0.7;       // easier to trigger anxiety
      }

      // Heavy struggle
      // (state.is && state.consecutiveWrong >= 3: even more support
      if (state.consecutiveWrong >= 3) {
        anxiety = 0.4;
        stuckGuide = 0.5;
      }

      // High consecutive correct (but not yet flow): steady encouragement
      if (state.consecutiveCorrect >= 3 && !state.inFlowState) {
        encouragement = 0.8;
      }

      return {
        stuckGuide,
        anxiety,
        encouragement,
        stuckTime,
        anxietyThreshold,
      };
    }

    /**
     * Get proficiency-based factors from learning system.
     * Higher proficiency = higher starting hint levels (more含蓄).
     */
    _getProficiencyFactor() {
      let cooldownMultiplier = 1.0;
      let flowThreshold = 1.0;

      if (this._learningSystem) {
        const style = this._learningSystem.getStyle();
        const accuracy = this._learningSystem._data ?
          (this._learningSystem._data.totalFills > 0 ?
            this._learningSystem._data.correctFills / this._learningSystem._data.totalFills :
            0.5) :
          0.5;

        // Precise players need less hand-holding
        if (style.value === 'precise') {
          cooldownMultiplier = 1.2;
          flowThreshold = 0.8;
        } else if (style.value === 'experimental') {
          cooldownMultiplier = 0.8;
          flowThreshold = 1.2;
        } else if (style.value === 'cautious') {
          cooldownMultiplier = 0.9;
        }

        // Overall accuracy adjusts baseline
        if (accuracy > 0.9) {
          cooldownMultiplier *= 1.1;
        } else if (accuracy < 0.6) {
          cooldownMultiplier *= 0.8;
        }
      }

      return { cooldownMultiplier, flowThreshold };
    }

    /**
     * Update the number of completed levels for level-based adjustment.
     */
    setLevelsCompleted(count) {
      this._dynamicConfig.levelsCompleted = count;
    }

    /**
     * Set player level explicitly (novice' / 'intermediate' / 'advanced').
     */
    setPlayerLevel(level) {
      this._dynamicConfig.playerLevel = level;
      this._dynamicConfig.levelsCompleted = 0; // use explicit level instead
    }

    /**
     * 设置盘面尺寸，用于动态调整冷却时间和规则阈值
     * 小盘面冷却时间更短，因为游戏节奏更快
     * @param {number} size
     */
    setGridSize(size) {
      this.gridSize = size;

      // 首次调用时保存原始基础冷却时间
      if (!this._originalBaseCoolDowns) {
        this._originalBaseCoolDowns = { ...this._baseCoolDowns };
      }

      // 根据盘面尺寸计算比例
      let ratio = 1.0;
      if (size <= 4) {
        ratio = 0.6; // 4x4：冷却更短
      } else if (size === 6) {
        ratio = 0.8; // 6x6：适度缩短
      } else {
        ratio = 1.0; // 9x9：标准
      }

      // 应用比例到基础冷却
      for (const key of Object.keys(this._originalBaseCoolDowns)) {
        this._baseCoolDowns[key] = Math.round(this._originalBaseCoolDowns[key] * ratio);
      }
      this.coolDowns = { ...this._baseCoolDowns };
    }

    /**
     * Enable or disable dynamic threshold adjustment.
     */
    setDynamicThresholdsEnabled(enabled) {
      this._dynamicConfig.enabled = enabled;
      if (!enabled) {
        this.coolDowns = { ...this._baseCoolDowns };
      }
    }

    onLevelStart() {
      this._levelActive = true;
      this._coolDownMap = {};
      this._lastDecision = null;
    }

    onLevelEnd() {
      this._levelActive = false;
    }

    decide(state) {
      if (!this._levelActive) return [];

      const commands = [];
      const now = Date.now();

      for (const rule of this._rules) {
        if (!rule.check(state)) continue;

        const lastTime = this._coolDownMap[rule.id] || 0;
        const coolDown = this.coolDowns[rule.cooldownKey] || 10000;
        if (now - lastTime < coolDown) continue;

        this._coolDownMap[rule.id] = now;
        commands.push({
          target: 'ExpressionDirector',
          action: rule.action,
          priority: rule.priority,
          payload: { ...rule.payload },
        });

        // High priority rules stop processing
        if (rule.priority >= 80) break;
      }

      this._lastDecision = commands.length > 0 ? commands[0] : null;
      return commands;
    }
  }

  global.DecisionEngine = DecisionEngine;
})(window);
