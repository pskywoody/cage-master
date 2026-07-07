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
 *  - 补丁2：自动笔记屏蔽 → 笔记引导台词封口
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
 * @property {string|null} character - 出场角色 ('yan'|'keeper'|'plotter'|null)
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

  /** @type {Object|null} 变体映射（坐标/数字转换用） */
  static _variantMapping = null;

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
    this._currentSkill = null;
    this._coreMove = null;
    this._lastCheckTime = 0;
    this._variantMapping = null;
  }

  /**
   * 设置变体映射（供提示系统坐标转换使用）
   * @param {Object|null} mapping - 变体映射对象
   */
  static setVariantMapping(mapping) {
    this._variantMapping = mapping;
  }

  /**
   * 将原始坐标转换为变体坐标（如果有映射）
   * @param {number} row - 原始行
   * @param {number} col - 原始列
   * @returns {[number, number]} [变体行, 变体列]
   */
  static _mapCoord(row, col) {
    if (!this._variantMapping || typeof VariantEngine === 'undefined') {
      return [row, col];
    }
    return VariantEngine.mapCell(row, col, this._variantMapping);
  }

  /**
   * 将变体坐标转换为原始坐标（如果有映射）
   * @param {number} row - 变体行
   * @param {number} col - 变体列
   * @returns {[number, number]} [原始行, 原始列]
   */
  static _unmapCoord(row, col) {
    if (!this._variantMapping || typeof VariantEngine === 'undefined') {
      return [row, col];
    }
    return VariantEngine.unmapCell(row, col, this._variantMapping);
  }

  /**
   * 将原始数字转换为变体数字（如果有映射）
   * @param {number} digit - 原始数字
   * @returns {number} 变体数字
   */
  static _mapDigit(digit) {
    if (!this._variantMapping || typeof VariantEngine === 'undefined') {
      return digit;
    }
    return VariantEngine.mapDigit(digit, this._variantMapping);
  }

  /**
   * 将目标格的坐标和数字转换为变体坐标（如果有映射）
   * 提示系统内部存储的是原始坐标，输出给游戏时需要转换
   * @param {Object} target - {row, col, value}
   * @returns {Object} 转换后的目标
   */
  static _mapTarget(target) {
    if (!target || !this._variantMapping) return target;
    const [newRow, newCol] = this._mapCoord(target.row, target.col);
    const newValue = this._mapDigit(target.value);
    return {
      ...target,
      row: newRow,
      col: newCol,
      value: newValue,
    };
  }

  /**
   * 将高亮轴坐标转换为变体坐标
   * @param {Object} axes - { rows: [], cols: [], cages: [] }
   * @returns {Object} 转换后的高亮轴
   */
  static _mapHighlightAxes(axes) {
    if (!axes || !this._variantMapping) return axes;
    const result = { rows: [], cols: [], cages: [] };
    // 注意：行/列号在旋转后可能互换，这里做简化处理
    // 对于 highlightAxes，实际使用时由渲染层根据坐标计算
    // 这里只做简单映射
    if (axes.rows) {
      for (const r of axes.rows) {
        const [nr] = this._mapCoord(r, 0);
        result.rows.push(nr);
      }
    }
    if (axes.cols) {
      for (const c of axes.cols) {
        const [, nc] = this._mapCoord(0, c);
        result.cols.push(nc);
      }
    }
    if (axes.cages) {
      result.cages = [...axes.cages];
    }
    return result;
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

  /**
   * [v5.0] 设置当前关卡的目标技巧（纯净度残局专用）
   * @param {string} skill - 技巧标签
   * @param {Object|null} coreMove - 核心破局格
   */
  static setCurrentSkill(skill, coreMove = null) {
    this._currentSkill = skill;
    this._coreMove = coreMove;
  }

  /**
   * [v5.0] 获取当前目标技巧
   */
  static getCurrentSkill() {
    return this._currentSkill || null;
  }

  // ========================================================
  //  核心调度：检查是否触发
  // ========================================================

  /**
   * 检查是否应该触发角色提示
   * [v5.0 重构] 精准挖空残局模式下，顶层拦截并切换为高级技巧局部教学模式
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

    // =====================================================
    // [v5.0 顶层拦截] 精准挖空残局：走高级技巧教学模式
    // =====================================================
    if (this._currentSkill && this._coreMove
        && typeof CharacterizedHintRouter !== 'undefined') {
      return this._dispatchSkillTeachingMode(board);
    }

    // =====================================================
    // 传统模式：走原有的角色阈值判定
    // =====================================================

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

    for (const char of ['yan', 'keeper', 'plotter']) {
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

    // 选择台词（传统模式）
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

    // 应用变体坐标转换（如果有）
    const mappedTarget = errorResult.isError
      ? { row: errorResult.wrongRow, col: errorResult.wrongCol, value: errorResult.wrongValue }
      : target;
    const finalTarget = this._mapTarget(mappedTarget);
    const finalCorrectTarget = this._mapTarget(target);

    return {
      shouldTrigger: true,
      character,
      dialogue: finalDialogue,
      target: finalTarget,
      isError: errorResult.isError,
      errorType: errorResult.errorType,
      correctTarget: finalCorrectTarget,
      triggerReason: 'threshold_met',
    };
  }

  /**
   * [v5.0] 技巧残局教学模式：被动推理教学
   * 玩家卡死时，给思路不给答案——高亮技巧关联区域，配角色教学台词
   */
  static _dispatchSkillTeachingMode(board = null) {
    const state = this._getReasoningState();
    const silenceDuration = state.silenceDuration;

    // 技巧残局用"全局静默阈值"（不区分角色，谁激活谁说话）
    const activeChar = this._currentCharacter || 'keeper';
    const threshold = typeof DynamicThresholdCalculator !== 'undefined'
      ? DynamicThresholdCalculator.getCharacterThreshold(activeChar, state)
      : 45;

    // 没到阈值，玩家还在思考
    if (silenceDuration < threshold) {
      return this._noTriggerResult('skill_teaching_still_thinking');
    }

    // 到阈值了，触发技巧教学
    const charKey = this._characterToRouterKey(activeChar);
    const passiveResult = CharacterizedHintRouter.triggerPassiveHint(
      charKey,
      this._currentSkill,
      this._coreMove
    );

    if (!passiveResult) {
      return this._noTriggerResult('no_skill_dialogue');
    }

    // 计算技巧关联高亮轴线
    const highlightAxes = this._calculateSkillAxes(this._currentSkill, this._coreMove);

    const dialogue = {
      id: 'cgs_passive_' + activeChar + '_' + this._currentSkill,
      speaker: activeChar,
      text: passiveResult.dialogue,
      type: 'passive_teaching',
      tags: ['cgs_v5', 'skill_teaching', 'passive'],
      priority: 100,
      highlight: passiveResult.highlight,
      skill: this._currentSkill,
    };

    // 记录触发
    this._recordTrigger(activeChar, false);

    // 应用变体坐标转换
    const coreTarget = { row: this._coreMove.row, col: this._coreMove.col, value: this._coreMove.value };
    const mappedCoreTarget = this._mapTarget(coreTarget);
    const mappedHighlightAxes = this._mapHighlightAxes(highlightAxes);

    return {
      shouldTrigger: true,
      mode: 'passive_teaching',
      type: 'passive_teaching',
      character: activeChar,
      dialogue: dialogue,
      technique: this._currentSkill,
      target: mappedCoreTarget,
      highlight: passiveResult.highlight,
      highlightAxes: mappedHighlightAxes,
      clearAfter: 4000,
      triggerReason: 'skill_teaching_threshold',
      correctTarget: mappedCoreTarget,
    };
  }

  /**
   * [v5.0] 生成主动绝杀模式下的爆破演出剧本
   * 玩家点击提示按钮时调用，返回完整的多米诺级联坍塌剧本
   * @param {Object} coreMove - 核心破局格 {row, col, value, cascadeSequence}
   * @param {string} targetSkill - 目标技巧
   * @returns {Object} 爆破演出剧本
   */
  static getExplosionScript(coreMove, targetSkill) {
    const charKey = this._characterToRouterKey(this._currentCharacter || 'keeper');

    // 获取角色爆破台词
    let explosionDialogue = null;
    if (typeof CharacterizedHintRouter !== 'undefined') {
      const activeResult = CharacterizedHintRouter.getActiveDialogue(targetSkill, charKey);
      if (activeResult) {
        explosionDialogue = activeResult.dialogue;
      }
    }

    // 应用变体坐标转换
    const mappedTargetCell = this._mapTarget({ row: coreMove.row, col: coreMove.col, value: coreMove.value });
    const mappedCascadeSequence = (coreMove.cascadeSequence || []).map(step => {
      if (step.row !== undefined && step.col !== undefined) {
        const [nr, nc] = this._mapCoord(step.row, step.col);
        return { ...step, row: nr, col: nc, value: this._mapDigit(step.value) };
      }
      return step;
    });
    const mappedCoreMove = {
      ...coreMove,
      row: mappedTargetCell.row,
      col: mappedTargetCell.col,
      value: mappedTargetCell.value,
      cascadeSequence: mappedCascadeSequence,
    };

    return {
      shouldTrigger: true,
      type: 'cascade_explosion',
      character: this._currentCharacter || 'keeper',
      dialogue: explosionDialogue,
      technique: targetSkill,
      targetCell: mappedTargetCell,
      cascadeSequence: mappedCascadeSequence,
      cascadeCount: coreMove.cascadeCount || (coreMove.cascadeSequence?.length || 0),
      coreMove: mappedCoreMove,
    };
  }

  /**
   * [v5.0] 计算技巧关联的高亮轴线/区域
   * 用于被动教学模式下框选提示范围
   */
  static _calculateSkillAxes(skill, coreMove) {
    if (!coreMove) return null;
    const { row, col } = coreMove;
    const axes = { rows: [], cols: [], cages: [] };
    const s = skill.toLowerCase();

    switch (s) {
      case 'rule45':
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'hiddensingle':
        axes.rows.push(row);
        break;
      case 'nakedpair':
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'cageuniquecombo':
        axes.cages.push('current');
        break;
      case '二连纵横阵':
        axes.rows = [row, (row + 3) % 9];
        axes.cols = [col, (col + 4) % 9];
        break;
      default:
        axes.rows.push(row);
        axes.cols.push(col);
    }
    return axes;
  }

  /**
   * [v5.0] 获取传统提示层级（降级兜底用）
   */
  static getTraditionalHintLevel() {
    return this._hintLevel || 1;
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
      speaker: ['yan', 'keeper', 'plotter'],
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
      target: this._mapTarget(this._currentTarget || { row: 4, col: 4, value: 5 }),
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

    // 【补丁2】自动笔记屏蔽笔记引导
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
   * [v5.0] 角色名转换：hint-director 内部名 → CharacterizedHintRouter 名
   * ray → ayan, keeper → cagekeeper, plotter → plotter
   */
  static _characterToRouterKey(char) {
    const map = { ray: 'yan', keeper: 'cagekeeper', plotter: 'plotter' };
    return map[char] || 'yan';
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
      target: this._mapTarget(target),
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
    console.log(`  自动笔记: ${state.autoCandidatesOn ? '是' : '否'}`);
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
