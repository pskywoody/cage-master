/**
 * ============================================================
 *  HintDialogueDirector - 提示演出导演
 * ============================================================
 *
 *  提示演出系统的核心调度器，根据玩家推理状态
 *  决定：谁出场、说什么、什么时候说。
 *
 *  状态 → 台词类型映射：
 *  - Eureka时刻 → eureka（强制最高优先级）
 *  - 卡关 + 有目标 + 有用笔记 → direction / strategy
 *  - 卡关 + 有目标 + 无笔记 → note_guide（受补丁5限制）
 *  - 卡关 + 无目标 → tease
 *  - 点击提示按钮 → answer
 *  - 阿岩/设局人说错 → error
 *
 *  三个补丁的优先级卡位：
 *  - 补丁2：自动候选数屏蔽 → 笔记引导台词封口
 *  - 补丁3：防涂鸦 → 高频低准时强制触发
 *  - 补丁5：封口计数器 → 笔记引导限2次，之后切纯空间指引
 *
 * ============================================================
 */

// ============================================================
//  依赖引入（浏览器环境下通过全局变量访问）
// ============================================================
// 运行时依赖：
//   - ReasoningMonitor (reasoning-monitor.js)
//   - EurekaDetector (eureka-detector.js)
//   - DynamicThresholdCalculator (dynamic-threshold.js)
//   - DialogueDatabase / DialogueRuntimeTracker (dialogue-database.js)
//   - CharacterErrorEngine (character-error.js)

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {Object} HintDispatchResult
 * @property {boolean} shouldTrigger - 是否应该触发提示
 * @property {string|null} character - 出场角色 ('ray'|'keeper'|'plotter'|null)
 * @property {Object|null} dialogue - 台词对象
 * @property {Object|null} target - 目标格 {row, col, value}
 * @property {boolean} isError - 是否说错
 * @property {string} errorType - 错误类型
 * @property {string} triggerReason - 触发原因
 */

// ============================================================
//  HintDialogueDirector 类
// ============================================================

class HintDialogueDirector {
  // ========================================================
  //  配置
  // ========================================================

  /** 角色出现概率权重 */
  static CHARACTER_WEIGHTS = {
    ray: 0.6,       // 阿岩 60%
    keeper: 0.3,    // 守笼人 30%
    plotter: 0.1,   // 设局人 10%
  };

  /** 各角色最大触发次数/关 */
  static MAX_TRIGGERS_PER_LEVEL = {
    ray: 5,
    keeper: 3,
    plotter: 2,
  };

  // ========================================================
  //  状态
  // ========================================================

  /** @type {Object} 各角色冷却结束时间 */
  static _cooldowns = {
    ray: 0,
    keeper: 0,
    plotter: 0,
  };

  /** @type {Object} 各角色本关触发次数 */
  static _triggerCounts = {
    ray: 0,
    keeper: 0,
    plotter: 0,
  };

  /** @type {number} 本关总触发次数 */
  static _totalTriggerCount = 0;

  /** @type {boolean} 是否启用系统 */
  static _enabled = true;

  /** @type {Object|null} 当前影响力最高的目标格 */
  static _currentTarget = null;

  /** @type {number} 上次检查时间 */
  static _lastCheckTime = 0;

  /** @type {number} 检查间隔（毫秒）- 避免频繁计算 */
  static CHECK_INTERVAL = 1000; // 1秒检查一次

  // ========================================================
  //  初始化
  // ========================================================

  /**
   * 初始化新关卡
   * @param {Object} options
   * @param {string} [options.levelId] - 关卡ID
   * @param {boolean} [options.isTutorial=false] - 是否教学关卡
   * @param {boolean} [options.isBoss=false] - 是否Boss战
   */
  static initNewLevel(options = {}) {
    this._cooldowns = { ray: 0, keeper: 0, plotter: 0 };
    this._triggerCounts = { ray: 0, keeper: 0, plotter: 0 };
    this._totalTriggerCount = 0;
    this._currentTarget = null;
    this._lastCheckTime = 0;
  }

  /**
   * 启用/禁用系统
   * @param {boolean} enabled
   */
  static setEnabled(enabled) {
    this._enabled = enabled;
  }

  /**
   * 设置当前目标格（影响力最高的格子）
   * @param {Object|null} target - {row, col, value, technique}
   */
  static setCurrentTarget(target) {
    this._currentTarget = target;
  }

  // ========================================================
  //  核心调度：检查是否触发
  // ========================================================

  /**
   * 检查是否应该触发角色提示
   * @param {Object} [board] - 棋盘对象
   * @returns {HintDispatchResult}
   */
  static checkAndDispatch(board = null) {
    // 系统未启用
    if (!this._enabled) {
      return this._noTriggerResult('disabled');
    }

    const now = Date.now();

    // 节流：避免频繁计算
    if (now - this._lastCheckTime < this.CHECK_INTERVAL) {
      return this._noTriggerResult('throttled');
    }
    this._lastCheckTime = now;

    // 获取推理状态
    const state = this._getReasoningState();

    // Eureka 时刻：立即触发（最高优先级）
    if (state.isEureka) {
      return this._dispatchEureka(board);
    }

    // 计算各角色阈值
    const thresholds = DynamicThresholdCalculator.getAllThresholds(state);
    const silenceDuration = state.silenceDuration;

    // 检查各角色是否达到触发条件
    const availableCharacters = [];

    for (const char of ['ray', 'keeper', 'plotter']) {
      if (this._canTrigger(char, thresholds[char], silenceDuration)) {
        availableCharacters.push(char);
      }
    }

    if (availableCharacters.length === 0) {
      return this._noTriggerResult('no_threshold_met');
    }

    // 按权重选择角色
    const character = this._selectCharacter(availableCharacters);
    if (!character) {
      return this._noTriggerResult('no_character_selected');
    }

    // 选择台词
    const dialogue = this._selectDialogue(character, state);
    if (!dialogue) {
      return this._noTriggerResult('no_dialogue_found');
    }

    // 检查是否说错
    const target = this._currentTarget || { row: 4, col: 4, value: 5 };
    const errorResult = CharacterErrorEngine.checkError(character, target, board);

    // 记录触发
    this._recordTrigger(character, errorResult.isError);

    // 如果说错了，找对应的错误台词
    let finalDialogue = dialogue;
    if (errorResult.isError) {
      const errorDialogue = this._findErrorDialogue(character, errorResult.errorType);
      if (errorDialogue) {
        finalDialogue = errorDialogue;
      }
    }

    return {
      shouldTrigger: true,
      character,
      dialogue: finalDialogue,
      target: errorResult.isError
        ? { row: errorResult.wrongRow, col: errorResult.wrongCol, value: errorResult.wrongValue }
        : target,
      isError: errorResult.isError,
      errorType: errorResult.errorType,
      correctTarget: target, // 保存正确答案（内部使用，不展示给玩家）
      triggerReason: 'threshold_met',
    };
  }

  // ========================================================
  //  Eureka 调度
  // ========================================================

  /**
   * 处理Eureka时刻
   * @param {Object} board
   * @returns {HintDispatchResult}
   */
  static _dispatchEureka(board) {
    // Eureka 时阿岩优先（她最激动）
    const eurekaDialogue = DialogueDatabase.findLine({
      type: 'eureka',
      speaker: ['ray', 'keeper', 'plotter'],
      minPriority: 3,
      respectCooldown: false, // Eureka 不受冷却限制
      respectMaxPerLevel: false, // Eureka 不受次数限制
    });

    if (!eurekaDialogue) {
      return this._noTriggerResult('no_eureka_dialogue');
    }

    const character = eurekaDialogue.speaker;

    // 记录触发（Eureka不计入普通触发次数）
    CharacterErrorEngine.recordTrigger(character);

    return {
      shouldTrigger: true,
      character,
      dialogue: eurekaDialogue,
      target: this._currentTarget || { row: 4, col: 4, value: 5 },
      isError: false,
      errorType: null,
      triggerReason: 'eureka',
    };
  }

  // ========================================================
  //  触发条件检查
  // ========================================================

  /**
   * 检查角色是否可以触发
   * @param {string} character
   * @param {number} threshold - 阈值（秒）
   * @param {number} silenceDuration - 沉默时长（秒）
   * @returns {boolean}
   */
  static _canTrigger(character, threshold, silenceDuration) {
    const now = Date.now();

    // 沉默时长是否达到阈值
    if (silenceDuration < threshold) return false;

    // 是否在冷却中
    if (now < this._cooldowns[character]) return false;

    // 是否达到本关上限
    if (this._triggerCounts[character] >= this.MAX_TRIGGERS_PER_LEVEL[character]) {
      return false;
    }

    return true;
  }

  /**
   * 按权重选择角色
   * @param {string[]} available - 可用角色列表
   * @returns {string|null}
   */
  static _selectCharacter(available) {
    if (available.length === 0) return null;
    if (available.length === 1) return available[0];

    // 计算可用角色的总权重
    let totalWeight = 0;
    for (const char of available) {
      totalWeight += this.CHARACTER_WEIGHTS[char] || 0;
    }

    if (totalWeight === 0) return available[0];

    // 加权随机
    let rand = Math.random() * totalWeight;
    for (const char of available) {
      rand -= this.CHARACTER_WEIGHTS[char] || 0;
      if (rand <= 0) return char;
    }

    return available[available.length - 1];
  }

  // ========================================================
  //  台词选择（状态映射）
  // ========================================================

  /**
   * 根据状态选择台词类型
   * @param {string} character
   * @param {Object} state - 推理状态
   * @returns {Object|null}
   */
  static _selectDialogue(character, state) {
    // 【补丁5】反笔记用户封口检查
    if (DialogueRuntimeTracker.isAntiNoteUser()) {
      // 只能用纯空间指引
      return DialogueDatabase.findLine({
        speaker: character,
        type: 'direction',
        tags: ['spatial_only'],
        excludeUsed: true,
      });
    }

    // 【补丁2】自动候选数屏蔽笔记引导
    if (state.autoCandidatesOn) {
      // 排除笔记引导类台词
      return DialogueDatabase.findLine({
        speaker: character,
        type: ['direction', 'strategy', 'tease'],
        excludeTags: ['note_guided'],
        excludeUsed: true,
      });
    }

    // 正常状态：根据是否有目标和笔记情况选择
    const hasTarget = !!this._currentTarget;
    const hasNotes = state.noteFrequency >= 1;
    const goodAccuracy = state.noteAccuracy > 0.5;

    let targetType;

    if (hasTarget) {
      if (hasNotes && goodAccuracy) {
        // 有目标 + 有有用笔记 → 方向性/策略性引导
        targetType = Math.random() > 0.5 ? 'direction' : 'strategy';
      } else {
        // 有目标 + 无笔记/低准确率 → 笔记引导
        // 【补丁5】受笔记引导次数限制
        const noteGuideCount = DialogueRuntimeTracker.getNoteGuideCount();
        if (noteGuideCount < 2) {
          targetType = 'note_guide';
        } else {
          targetType = 'direction'; // 超过2次，切纯方向指引
        }
      }
    } else {
      // 无目标 → 吐槽/激将
      targetType = 'tease';
    }

    return DialogueDatabase.findLine({
      speaker: character,
      type: targetType,
      excludeUsed: true,
    });
  }

  /**
   * 查找错误台词
   * @param {string} character
   * @param {string} errorType
   * @returns {Object|null}
   */
  static _findErrorDialogue(character, errorType) {
    const tags = [];
    if (errorType === 'position') tags.push('error_position');
    if (errorType === 'value') tags.push('error_value');
    if (errorType === 'random') tags.push('error_value', 'give_up');

    return DialogueDatabase.findLine({
      speaker: character,
      type: 'error',
      tags: tags.length > 0 ? tags : undefined,
      excludeUsed: true,
      respectMaxPerLevel: true,
    });
  }

  // ========================================================
  //  触发记录
  // ========================================================

  /**
   * 记录角色触发
   * @param {string} character
   * @param {boolean} hadError - 是否说错
   */
  static _recordTrigger(character, hadError = false) {
    const now = Date.now();

    this._triggerCounts[character]++;
    this._totalTriggerCount++;

    // 计算冷却时间
    const cooldownSeconds = CharacterErrorEngine.getCooldown(character, hadError);
    this._cooldowns[character] = now + cooldownSeconds * 1000;

    // 通知说错引擎
    CharacterErrorEngine.recordTrigger(character);

    // 通知Eureka检测器（有提示了，不算"盲解"）
    if (typeof EurekaDetector !== 'undefined') {
      EurekaDetector.recordHintTriggered();
    }
  }

  // ========================================================
  //  状态获取
  // ========================================================

  /**
   * 获取推理状态
   * @returns {Object}
   */
  static _getReasoningState() {
    if (typeof ReasoningMonitor !== 'undefined') {
      return ReasoningMonitor.getReasoningState();
    }

    // 降级：返回默认状态
    return {
      noteFrequency: 0,
      noteAccuracy: 0.5,
      errorRate: 0,
      difficulty: '普通',
      isEureka: false,
      autoCandidatesOn: false,
      silenceDuration: 0,
    };
  }

  // ========================================================
  //  辅助方法
  // ========================================================

  /**
   * 构造不触发结果
   * @param {string} reason
   * @returns {HintDispatchResult}
   */
  static _noTriggerResult(reason) {
    return {
      shouldTrigger: false,
      character: null,
      dialogue: null,
      target: null,
      isError: false,
      errorType: null,
      triggerReason: reason,
    };
  }

  /**
   * 手动触发角色提示（用于调试或特殊事件）
   * @param {string} character
   * @param {string} type
   * @param {Object} [board]
   * @returns {HintDispatchResult}
   */
  static manualTrigger(character, type = 'direction', board = null) {
    const dialogue = DialogueDatabase.findLine({
      speaker: character,
      type,
      excludeUsed: false,
    });

    if (!dialogue) {
      return this._noTriggerResult('no_dialogue');
    }

    const target = this._currentTarget || { row: 4, col: 4, value: 5 };
    this._recordTrigger(character, false);

    return {
      shouldTrigger: true,
      character,
      dialogue,
      target,
      isError: false,
      errorType: null,
      triggerReason: 'manual',
    };
  }

  // ========================================================
  //  统计查询
  // ========================================================

  /**
   * 获取本关触发统计
   * @returns {Object}
   */
  static getStats() {
    return {
      total: this._totalTriggerCount,
      byCharacter: { ...this._triggerCounts },
      cooldowns: {
        ray: Math.max(0, Math.ceil((this._cooldowns.ray - Date.now()) / 1000)),
        keeper: Math.max(0, Math.ceil((this._cooldowns.keeper - Date.now()) / 1000)),
        plotter: Math.max(0, Math.ceil((this._cooldowns.plotter - Date.now()) / 1000)),
      },
    };
  }

  /**
   * 调试打印
   */
  static debugPrint() {
    const state = this._getReasoningState();
    const thresholds = DynamicThresholdCalculator.getAllThresholds(state);
    const stats = this.getStats();

    console.log('=== HintDialogueDirector State ===');
    console.log(`  沉默时长: ${state.silenceDuration.toFixed(1)}s`);
    console.log(`  笔记频率: ${state.noteFrequency} 次/60s`);
    console.log(`  笔记准确率: ${(state.noteAccuracy * 100).toFixed(0)}%`);
    console.log(`  错误率: ${(state.errorRate * 100).toFixed(0)}%`);
    console.log(`  自动候选数: ${state.autoCandidatesOn ? '是' : '否'}`);
    console.log(`  Eureka: ${state.isEureka ? '是' : '否'}`);
    console.log('  阈值:');
    console.log(`    阿岩: ${thresholds.ray}s`);
    console.log(`    守笼人: ${thresholds.keeper}s`);
    console.log(`    设局人: ${thresholds.plotter}s`);
    console.log('  触发次数:');
    console.log(`    阿岩: ${stats.byCharacter.ray}/${this.MAX_TRIGGERS_PER_LEVEL.ray}`);
    console.log(`    守笼人: ${stats.byCharacter.keeper}/${this.MAX_TRIGGERS_PER_LEVEL.keeper}`);
    console.log(`    设局人: ${stats.byCharacter.plotter}/${this.MAX_TRIGGERS_PER_LEVEL.plotter}`);
    console.log('  冷却剩余:');
    console.log(`    阿岩: ${stats.cooldowns.ray}s`);
    console.log(`    守笼人: ${stats.cooldowns.keeper}s`);
    console.log(`    设局人: ${stats.cooldowns.plotter}s`);
    console.log('=================================');
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { HintDialogueDirector };
}

if (typeof window !== 'undefined') {
  window.HintDialogueDirector = HintDialogueDirector;
}
