/**
 * DecisionEngine - Decision Layer
 * ================================
 * 决策层核心模块：基于玩家状态（来自 Perception Layer）运行规则引擎，
 * 生成面向 Expression Layer 的指令（command）。
 *
 * 职责：
 *  - 维护一组带优先级的规则（_rules），每条规则包含 check / action / cooldownKey
 *  - 根据玩家状态与冷却时间决定是否触发
 *  - 集成学习系统（LearningSystem）进行基于熟练度的自适应调整
 *  - 根据盘面尺寸动态缩放冷却时间
 *
 * ES Module 迁移说明：
 *  - 从 IIFE 模式迁移为 ES Module，使用 `export class DecisionEngine`
 *  - 所有 Public 方法添加 try-catch 保护
 *  - 对 _learningSystem 引用添加 null 安全检查
 *
 * @module decision/decision-engine
 */

export class DecisionEngine {
  /**
   * @param {Object} [config={}]
   * @param {number}  [config.gridSize=9]
   * @param {number}  [config.stuckCooldown=30000]
   * @param {number}  [config.anxietyCooldown=15000]
   * @param {number}  [config.flowCooldown=10000]
   * @param {number}  [config.teachingCooldown=60000]
   * @param {number}  [config.eurekaCooldown=30000]
   * @param {number}  [config.progressCooldown=5000]
   * @param {boolean} [config.dynamicThresholds=true]
   * @param {number}  [config.levelsCompleted=0]
   */
  constructor(config = {}) {
    try {
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
    } catch (e) {
      console.error('DecisionEngine.constructor:', e);
    }
  }

  /**
   * 构建规则列表（按优先级降序）
   * @returns {Array<Object>}
   */
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

  // -----------------------------------------------------------------------
  // Public Methods
  // -----------------------------------------------------------------------

  /**
   * V4.3.27（P0-2）：事件驱动决策入口（感知层语义事件 → 干预强度）
   * 与 decide(state) 并行：decide 服务心跳轮询，decideEvent 服务即时事件（填数/错误/笔记）。
   * 强度计算复用 LearningSystem 熟练度，产出带 intensity/character 的指令。
   * @param {string} event - 感知层事件（STUCK/FLOW/EUREKA/FRUSTRATED/BLIND_GUESS/FILL/ERROR）
   * @param {Object} [profile] - 玩家画像（LearningSystem.getProfile()，缺省自动取）
   * @param {Object} [extra] - 补充信息（technique/state 等）
   * @returns {Object|null} { intensity, action, payload, character, technique, triggerNarrative } 或 null（无干预）
   */
  decideEvent(event, profile, extra) {
    try {
      if (!this._levelActive) return null;

      const intensity = this._calcIntensity(event, profile || this._getProfileFallback(), extra || {});
      if (intensity <= 0) return null;

      // 冷却检查（复用冷却表：事件干预统一用 teaching_nudge 槽位 + 个性化冷却）
      const cooldownKey = 'event_' + event;
      const now = Date.now();
      const lastTime = this._coolDownMap[cooldownKey] || 0;
      const cd = this.coolDowns.teaching_nudge || 60000;
      if (now - lastTime < cd) return null;
      this._coolDownMap[cooldownKey] = now;

      // 由强度决定动作与文案
      const action = intensity >= 3 ? 'SHOW_DIALOG' : (intensity >= 2 ? 'SHOW_TOAST' : 'SHOW_DIALOG');
      const character = this._selectCharForEvent(event, profile);

      return {
        intensity,
        action,
        character,
        technique: (extra && extra.technique) || null,
        triggerNarrative: intensity >= 2,
        payload: {
          dialogId: this._dialogIdForEvent(event, intensity),
          message: this._messageForEvent(event, intensity),
        },
      };
    } catch (e) {
      console.error('DecisionEngine.decideEvent:', e);
      return null;
    }
  }

  /**
   * V4.3.27：计算干预强度（纯本地规则）
   * NONE=0 / HINT=1 / DEMO=2 / GUIDE=3
   */
  _calcIntensity(event, profile, extra) {
    try {
      const masteryAvg = (profile && profile.masteryAvg) || 1;

      // 心流/EUREKA → 静默（不打扰）
      if (event === 'FLOW' || event === 'EUREKA') return 0;

      // 盲目试数 + 低熟练度 → 引导级
      if (event === 'BLIND_GUESS' && masteryAvg < 3) return 3;

      // 卡顿 + 高熟练度 → 轻度提示
      if (event === 'STUCK' && masteryAvg >= 3) return 1;

      // 挫败 → 演示级
      if (event === 'FRUSTRATED') return 2;

      // 卡顿 + 中熟练度 → 演示
      if (event === 'STUCK' && masteryAvg >= 2 && masteryAvg < 3) return 2;

      // 填错（非盲猜）→ 轻提示
      if (event === 'ERROR' && masteryAvg < 2) return 1;

      return 0;
    } catch (e) {
      return 0;
    }
  }

  /** 事件干预冷却后的事件角色选择 */
  _selectCharForEvent(event, profile) {
    try {
      if (event === 'FRUSTRATED' || event === 'STUCK') {
        // 挫败/卡顿时用温和角色（守笼人），除非玩家偏好
        return (profile && profile.preferredCharacter) || 'cagekeeper';
      }
      if (event === 'FLOW' || event === 'EUREKA') return 'ying';
      return (profile && profile.preferredCharacter) || 'cagekeeper';
    } catch (e) { return 'cagekeeper'; }
  }

  /** 事件 → 文案 id */
  _dialogIdForEvent(event, intensity) {
    if (event === 'FRUSTRATED') return 'frustrated_guide';
    if (event === 'BLIND_GUESS') return 'blind_guess_guide';
    return 'stuck_guide';
  }

  /** 事件 → 基础文案（本地） */
  _messageForEvent(event, intensity) {
    if (event === 'BLIND_GUESS') return '别急着猜，先找找确定的线索。';
    if (event === 'FRUSTRATED') return '休息一下，换个思路再看盘面。';
    if (event === 'STUCK') return '卡住了？试试笔记标记候选数。';
    if (event === 'ERROR') return '这个位置好像不对，再看一遍。';
    return '';
  }

  /** 无 profile 时的兜底画像 */
  _getProfileFallback() {
    try {
      if (this._learningSystem && typeof this._learningSystem.getProfile === 'function') {
        return this._learningSystem.getProfile();
      }
    } catch (e) {}
    return { masteryAvg: 1, preferredCharacter: 'cagekeeper' };
  }

  /**
   * Set the learning system reference for proficiency-based adjustments.
   * @param {Object} learningSystem
   */
  setLearningSystem(learningSystem) {
    try {
      this._learningSystem = learningSystem;
    } catch (e) {
      console.error('DecisionEngine.setLearningSystem:', e);
    }
  }

  /**
   * Adjust thresholds dynamically based on player state and learning data.
   * Called before each decision cycle to adapt cooldowns and thresholds.
   *
   * @param {Object} state - player state from PlayerStateMonitor
   * @returns {Object|null} adjusted thresholds that should be applied to perception layer
   */
  adjustThresholds(state) {
    try {
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
    } catch (e) {
      console.error('DecisionEngine.adjustThresholds:', e);
      return null;
    }
  }

  /**
   * Update the number of completed levels for level-based adjustment.
   * @param {number} count
   */
  setLevelsCompleted(count) {
    try {
      this._dynamicConfig.levelsCompleted = count;
    } catch (e) {
      console.error('DecisionEngine.setLevelsCompleted:', e);
    }
  }

  /**
   * Set player level explicitly ('novice' / 'intermediate' / 'advanced').
   * @param {string} level
   */
  setPlayerLevel(level) {
    try {
      this._dynamicConfig.playerLevel = level;
      this._dynamicConfig.levelsCompleted = 0; // use explicit level instead
    } catch (e) {
      console.error('DecisionEngine.setPlayerLevel:', e);
    }
  }

  /**
   * 设置盘面尺寸，用于动态调整冷却时间和规则阈值
   * 小盘面冷却时间更短，因为游戏节奏更快
   * @param {number} size
   */
  setGridSize(size) {
    try {
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
    } catch (e) {
      console.error('DecisionEngine.setGridSize:', e);
    }
  }

  /**
   * Enable or disable dynamic threshold adjustment.
   * @param {boolean} enabled
   */
  setDynamicThresholdsEnabled(enabled) {
    try {
      this._dynamicConfig.enabled = enabled;
      if (!enabled) {
        this.coolDowns = { ...this._baseCoolDowns };
      }
    } catch (e) {
      console.error('DecisionEngine.setDynamicThresholdsEnabled:', e);
    }
  }

  /**
   * 关卡开始，重置冷却状态
   */
  onLevelStart() {
    try {
      this._levelActive = true;
      this._coolDownMap = {};
      this._lastDecision = null;
    } catch (e) {
      console.error('DecisionEngine.onLevelStart:', e);
    }
  }

  /**
   * 关卡结束
   */
  onLevelEnd() {
    try {
      this._levelActive = false;
    } catch (e) {
      console.error('DecisionEngine.onLevelEnd:', e);
    }
  }

  /**
   * 主要决策入口：根据玩家状态生成指令列表
   * @param {Object} state - player state from PlayerStateMonitor
   * @returns {Array<Object>} commands
   */
  decide(state) {
    try {
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
    } catch (e) {
      console.error('DecisionEngine.decide:', e);
      return [];
    }
  }

  // -----------------------------------------------------------------------
  // Private Methods
  // -----------------------------------------------------------------------

  /**
   * Get level-based adjustment factors.
   * 新手期 (novice, 0-3 levels): shorter cooldowns, faster stuck detection
   * 成长期 (intermediate, 4-10 levels): gradual increase
   * 熟练期 (advanced, 10+ levels): default thresholds
   * @returns {{ cooldownMultiplier: number, stuckMultiplier: number }}
   */
  _getLevelFactor() {
    let cooldownMultiplier = 1.0;
    let stuckMultiplier = 1.0;
    const levels = this._dynamicConfig.levelsCompleted;
    const explicitLevel = this._dynamicConfig.playerLevel;

    if (levels === 0 && explicitLevel) {
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
      if (levels <= 3) {
        cooldownMultiplier = 0.5;
        stuckMultiplier = 0.6;
        this._dynamicConfig.playerLevel = 'novice';
      } else if (levels <= 10) {
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
   * @param {Object} state
   * @returns {Object}
   */
  _getStateMultipliers(state) {
    let stuckGuide = 1.0;
    let anxiety = 1.0;
    let encouragement = 1.0;
    let stuckTime = 1.0;
    let anxietyThreshold = 1.0;

    if (state.inFlowState) {
      encouragement = 1.5;
      stuckTime = 1.3;
      stuckGuide = 1.3;
    }

    if (state.consecutiveWrong >= 2) {
      anxiety = 0.5;
      stuckGuide = 0.6;
      encouragement = 0.7;
      anxietyThreshold = 0.7;
    }

    if (state.consecutiveWrong >= 3) {
      anxiety = 0.4;
      stuckGuide = 0.5;
    }

    if (state.consecutiveCorrect >= 3 && !state.inFlowState) {
      encouragement = 0.8;
    }

    return { stuckGuide, anxiety, encouragement, stuckTime, anxietyThreshold };
  }

  /**
   * Get proficiency-based factors from learning system.
   * Higher proficiency = higher starting hint levels (more含蓄).
   * @returns {{ cooldownMultiplier: number, flowThreshold: number }}
   */
  _getProficiencyFactor() {
    let cooldownMultiplier = 1.0;
    let flowThreshold = 1.0;

    // ---- null-safe check for learning system ----
    if (this._learningSystem) {
      try {
        const style = this._learningSystem.getStyle();
        const accuracy = this._learningSystem._data
          ? (this._learningSystem._data.totalFills > 0
              ? this._learningSystem._data.correctFills / this._learningSystem._data.totalFills
              : 0.5)
          : 0.5;

        if (style.value === 'precise') {
          cooldownMultiplier = 1.2;
          flowThreshold = 0.8;
        } else if (style.value === 'experimental') {
          cooldownMultiplier = 0.8;
          flowThreshold = 1.2;
        } else if (style.value === 'cautious') {
          cooldownMultiplier = 0.9;
        }

        if (accuracy > 0.9) {
          cooldownMultiplier *= 1.1;
        } else if (accuracy < 0.6) {
          cooldownMultiplier *= 0.8;
        }
      } catch (e) {
        console.warn('DecisionEngine._getProficiencyFactor: learning system error', e);
      }
    }

    return { cooldownMultiplier, flowThreshold };
  }
}
