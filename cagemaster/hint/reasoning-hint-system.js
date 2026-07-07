/**
 * ============================================================
 *  ReasoningAndHintSystem - 推理与提示联动系统（总控）
 * ============================================================
 *
 *  整合所有子模块，提供统一的对外接口。
 *
 *  子模块：
 *  - ReasoningMonitor: 笔记推理监控（L1-L4）
 *  - EurekaDetector: Eureka时刻检测
 *  - DynamicThresholdCalculator: 动态阈值计算
 *  - DialogueDatabase / DialogueRuntimeTracker: 台词数据库
 *  - CharacterErrorEngine: 角色说错引擎
 *  - HintDialogueDirector: 提示演出导演
 *  - NotePlayback: 笔记回放
 *  - DataCollector: 数据回收
 *
 *  使用方式：
 *    // 1. 引入所有依赖（顺序重要）
 *    // 在HTML中按顺序引入：
 *    // - reasoning-monitor.js
 *    // - eureka-detector.js
 *    // - dynamic-threshold.js
 *    // - dialogue-database.js
 *    // - character-error.js
 *    // - hint-director.js
 *    // - note-playback.js
 *    // - data-collector.js
 *    // - reasoning-hint-system.js（本文件）
 *
 *    // 2. 初始化
 *    ReasoningAndHintSystem.init({
 *      enabled: true,
 *      dataCollection: { enabled: false },
 *    });
 *
 *    // 3. 关卡开始
 *    ReasoningAndHintSystem.onLevelStart(levelId, chapterId, difficulty);
 *
 *    // 4. 记录事件（在游戏输入系统中调用）
 *    ReasoningAndHintSystem.onNote(row, col, value, action, source);
 *    ReasoningAndHintSystem.onFill(row, col, value, isError);
 *
 *    // 5. 定期检查是否触发提示（在游戏主循环中调用）
 *    const result = ReasoningAndHintSystem.checkAndTrigger(board);
 *    if (result.shouldTrigger) {
 *      showCharacterHint(result);
 *    }
 *
 *    // 6. 关卡结束
 *    ReasoningAndHintSystem.onLevelComplete();
 *
 * ============================================================
 */

// ============================================================
//  ReasoningAndHintSystem 总控类
// ============================================================

class ReasoningAndHintSystem {
  // ========================================================
  //  状态
  // ========================================================

  /** @type {boolean} 是否已初始化 */
  static _initialized = false;

  /** @type {boolean} 系统是否启用 */
  static _enabled = true;

  /** @type {Object} 配置 */
  static _config = {
    enabled: true,
    autoCheck: true,         // 是否自动检查（通过定时器）
    checkInterval: 1000,     // 自动检查间隔（毫秒）
    dataCollection: {
      enabled: false,        // 默认不开启数据收集
    },
    playback: {
      enabled: true,         // 是否启用回放录制
    },
    tutorialChapter: 1,      // 教学章节ID
  };

  /** @type {number|null} 自动检查定时器 */
  static _checkTimer = null;

  /** @type {Function|null} 提示触发回调 */
  static _onHintTriggered = null;

  /** @type {Object|null} 变体映射（坐标/数字转换用） */
  static _variantMapping = null;

  /** @type {string} 当前关卡ID */
  static _currentLevelId = '';

  /** @type {string} 当前章节ID */
  static _currentChapterId = '';

  /** @type {string} 当前难度 */
  static _currentDifficulty = '普通';

  // ========================================================
  //  初始化
  // ========================================================

  /**
   * 初始化系统
   * @param {Object} [config] - 配置
   * @param {boolean} [config.enabled=true] - 是否启用
   * @param {boolean} [config.autoCheck=true] - 是否自动检查
   * @param {number} [config.checkInterval=1000] - 自动检查间隔（毫秒）
   * @param {Object} [config.dataCollection] - 数据收集配置
   * @param {Object} [config.playback] - 回放配置
   * @param {Function} [config.onHintTriggered] - 提示触发回调
   */
  static init(config = {}) {
    if (this._initialized) return;

    // 合并配置
    this._config = {
      ...this._config,
      ...config,
      dataCollection: { ...this._config.dataCollection, ...config.dataCollection },
      playback: { ...this._config.playback, ...config.playback },
    };

    this._enabled = this._config.enabled;

    if (config.onHintTriggered) {
      this._onHintTriggered = config.onHintTriggered;
    }

    // 初始化数据收集
    if (typeof DataCollector !== 'undefined' && this._config.dataCollection.enabled) {
      DataCollector.init({ enabled: true });
    }

    // 启动自动检查
    if (this._config.autoCheck && this._enabled) {
      this._startAutoCheck();
    }

    this._initialized = true;

    console.log('[ReasoningAndHintSystem] 系统已初始化');
  }

  /**
   * 销毁系统
   */
  static destroy() {
    this._stopAutoCheck();
    this._initialized = false;
    this._enabled = false;
  }

  // ========================================================
  //  启用/禁用
  // ========================================================

  /**
   * 启用系统
   */
  static enable() {
    this._enabled = true;
    if (typeof HintDialogueDirector !== 'undefined') {
      HintDialogueDirector.setEnabled(true);
    }
    if (this._config.autoCheck) {
      this._startAutoCheck();
    }
  }

  /**
   * 禁用系统
   */
  static disable() {
    this._enabled = false;
    if (typeof HintDialogueDirector !== 'undefined') {
      HintDialogueDirector.setEnabled(false);
    }
    this._stopAutoCheck();
  }

  /**
   * 是否启用
   * @returns {boolean}
   */
  static isEnabled() {
    return this._enabled;
  }

  // ========================================================
  //  关卡生命周期
  // ========================================================

  /**
   * 关卡开始
   * @param {string} levelId - 关卡ID
   * @param {string} [chapterId] - 章节ID
   * @param {string} [difficulty] - 难度
   * @param {boolean} [isBoss=false] - 是否Boss战
   */
  static onLevelStart(levelId, chapterId = '', difficulty = '普通', isBoss = false) {
    if (!this._enabled) return;

    this._currentLevelId = levelId;
    this._currentChapterId = chapterId;
    this._currentDifficulty = difficulty;
    this._variantMapping = null; // 重置变体映射

    const isTutorial = this._isTutorialLevel(chapterId);

    // 重置各子模块
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.initNewLevel(levelId, chapterId, difficulty, false);
    }

    if (typeof EurekaDetector !== 'undefined') {
      EurekaDetector.initNewLevel();
    }

    if (typeof DialogueRuntimeTracker !== 'undefined') {
      DialogueRuntimeTracker.resetForNewLevel();
    }

    if (typeof CharacterErrorEngine !== 'undefined') {
      CharacterErrorEngine.initNewLevel({
        isTutorial,
        isBoss,
      });
    }

    if (typeof HintDialogueDirector !== 'undefined') {
      HintDialogueDirector.initNewLevel({
        levelId,
        isTutorial,
        isBoss,
      });
    }

    // 启动回放录制
    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      NotePlayback.startRecording({ levelId, chapterId });
    }

    // 数据收集
    if (typeof DataCollector !== 'undefined' && DataCollector.isEnabled()) {
      DataCollector.onLevelStart(levelId, chapterId);
    }
  }

  /**
   * 设置变体映射（供提示系统坐标转换使用）
   * @param {Object|null} mapping - 变体映射对象
   */
  static setVariantMapping(mapping) {
    this._variantMapping = mapping;

    // 传递给子模块
    if (typeof HintDialogueDirector !== 'undefined' && typeof HintDialogueDirector.setVariantMapping === 'function') {
      HintDialogueDirector.setVariantMapping(mapping);
    }
    if (typeof CharacterizedHintRouter !== 'undefined' && typeof CharacterizedHintRouter.setVariantMapping === 'function') {
      CharacterizedHintRouter.setVariantMapping(mapping);
    }
  }

  /**
   * 关卡结束
   * @param {boolean} [won=true] - 是否通关
   * @returns {Object|null} 收集的数据
   */
  static onLevelComplete(won = true) {
    if (!this._enabled) return null;

    // 停止回放录制
    let playbackData = null;
    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      playbackData = NotePlayback.stopRecording();
    }

    // 数据收集
    let summary = null;
    if (typeof DataCollector !== 'undefined' && DataCollector.isEnabled()) {
      summary = DataCollector.onLevelComplete({
        won,
      });
    }

    // 停止自动检查
    this._stopAutoCheck();

    return {
      summary,
      playbackData,
    };
  }

  // ========================================================
  //  事件钩子（游戏输入系统调用）
  // ========================================================

  /**
   * 笔记操作
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {number} value - 笔记值
   * @param {'add'|'remove'|'toggle'} [action='toggle'] - 操作类型
   * @param {'manual'|'auto'} [source='manual'] - 来源
   * @param {Object} [board] - 棋盘对象（用于Eureka检测）
   */
  static onNote(row, col, value, action = 'toggle', source = 'manual', board = null) {
    if (!this._enabled) return;

    // 记录到推理监控
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.recordNote(row, col, value, action, source);
    }

    // 记录回放到
    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      NotePlayback.recordEvent({
        type: 'note',
        row,
        col,
        value,
        action,
        source,
      });
    }

    // 删除笔记时检查Eureka
    if (action === 'remove' && source === 'manual' && board) {
      this._checkEurekaOnNoteRemove(row, col, value, board);
    }

    // 【补丁5】检查笔记引导封口
    if (source === 'manual' && typeof DialogueRuntimeTracker !== 'undefined') {
      // 玩家手动做了笔记，说明不是反笔记用户
      // （但一旦封口了就不解除，保持设计）
    }
  }

  /**
   * 填数操作
   * @param {number} row - 行号
   * @param {number} col - 列号
   * @param {number} value - 填入的数字
   * @param {boolean} [isError=false] - 是否填错
   * @param {Object} [board] - 棋盘对象
   */
  static onFill(row, col, value, isError = false, board = null) {
    if (!this._enabled) return;

    // 记录到推理监控
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.recordFill(row, col, value, isError);
    }

    // 记录回放到
    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      NotePlayback.recordEvent({
        type: 'fill',
        row,
        col,
        value,
        isError,
      });
    }

    // 检查Eureka
    if (board && !isError) {
      this._checkEurekaOnFill(row, col, value, board);
    }
  }

  /**
   * 擦除操作
   * @param {number} row
   * @param {number} col
   */
  static onErase(row, col) {
    if (!this._enabled) return;

    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.updateActivity();
    }

    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      NotePlayback.recordEvent({
        type: 'erase',
        row,
        col,
      });
    }
  }

  /**
   * 选中格子
   * @param {number} row
   * @param {number} col
   */
  static onSelect(row, col) {
    if (!this._enabled) return;

    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.updateActivity();
    }

    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      NotePlayback.recordEvent({
        type: 'select',
        row,
        col,
      });
    }
  }

  /**
   * [v5.0 重构] 玩家主动按下提示按钮（主动绝杀模式）
   * 由总控统一调度上帝视角 Solver，计算并引爆骨牌级联坍塌
   * @param {Object} [board] - 当前前端的棋盘/盘面对象
   * @returns {Object} 级联爆破演出剧本
   */
  static onHintButton(board = null) {
    if (!this._enabled) return { shouldAnimate: false };

    // A. 基础记录与防刷
    if (typeof EurekaDetector !== 'undefined') {
      EurekaDetector.recordHintTriggered();
    }
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.updateActivity();
    }

    // B. 检查当前是否处于"精准挖空残局"状态
    if (this._currentSkill && this._coreMove) {
      const core = this._coreMove;

      // 级联序列直接从 coreMove 中提取（残局初始化时已计算好）
      const cascadeSequence = core.cascadeSequence || [];
      const cascadeCount = core.cascadeCount || cascadeSequence.length;

      // 级联太少，不走绝杀模式，降级
      if (cascadeCount < 4) {
        return {
          shouldAnimate: false,
          type: 'traditional',
          hintLevel: 1,
        };
      }

      // 记录到笔记回放（便于复盘看玩家在哪里破防点击了提示）
      if (this._config.playback && this._config.playback.enabled
          && typeof NotePlayback !== 'undefined') {
        NotePlayback.recordEvent({
          type: 'active_hint_explosion',
          row: core.row,
          col: core.col,
          technique: this._currentSkill,
        });
      }

      // 获取角色爆破台词（优先从 DialogueDatabase 取技巧专属台词）
      let characterDialogue = null;
      const charKey = (typeof window !== 'undefined' && window._currentCharacter)
        ? window._currentCharacter
        : 'ayan';
      const speakerKey = charKey === 'ayan' ? 'ray'
        : (charKey === 'cagekeeper' ? 'keeper' : 'plotter');

      if (typeof DialogueDatabase !== 'undefined') {
        characterDialogue = DialogueDatabase.getActiveExplosionText(
          speakerKey, this._currentSkill
        );
      }

      // 返回给前端 Canvas 的完整剧本
      return {
        shouldAnimate: true,
        type: 'cascade_explosion',
        technique: this._currentSkill,
        targetCell: { row: core.row, col: core.col, value: core.value },
        cascadeSequence: cascadeSequence,
        cascadeCount: cascadeCount,
        characterDialogue: characterDialogue,
      };
    }

    // C. 降级兜底：如果不是定向技巧残局，走传统三层提示逻辑
    return {
      shouldAnimate: false,
      type: 'traditional',
      hintLevel: typeof HintDialogueDirector !== 'undefined'
        ? HintDialogueDirector.getTraditionalHintLevel()
        : 1,
    };
  }

  /**
   * 设置自动笔记状态
   * @param {boolean} on
   */
  static setAutoCandidates(on) {
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.setAutoCandidates(on);
    }
  }

  /**
   * 更新当前目标格（影响力最高的格子）
   * @param {Object|null} target - {row, col, value, technique}
   */
  static setCurrentTarget(target) {
    if (typeof HintDialogueDirector !== 'undefined') {
      HintDialogueDirector.setCurrentTarget(target);
    }
  }

  /**
   * [v5.0] 设置当前关卡的目标技巧（纯净度残局专用）
   * 当玩家进入技巧专项关卡时调用，用于被动模式下吐出针对性教学台词
   * @param {string} skill - 技巧标签（如 'rule45', 'nakedPair'）
   * @param {Object|null} coreMove - 核心破局格 {row, col, value, cascadeCount, cascadeSequence}
   */
  static setCurrentSkill(skill, coreMove = null) {
    this._currentSkill = skill;
    this._coreMove = coreMove;

    // 传递给 CharacterizedHintRouter
    if (typeof CharacterizedHintRouter !== 'undefined') {
      CharacterizedHintRouter.setPuzzle({
        targetSkill: skill,
        coreMove: coreMove,
      });
    }

    // 传递给 HintDialogueDirector
    if (typeof HintDialogueDirector !== 'undefined') {
      HintDialogueDirector.setCurrentSkill(skill, coreMove);
    }
  }

  /**
   * [v5.0] 获取当前关卡的目标技巧
   */
  static getCurrentSkill() {
    return this._currentSkill || null;
  }

  // ========================================================
  //  Eureka 检测
  // ========================================================

  static _checkEurekaOnFill(row, col, value, board) {
    if (typeof EurekaDetector === 'undefined') return;

    const result = EurekaDetector.checkOnFill(row, col, value, board);

    if (result.isEureka) {
      this._onEureka(result);
    }
  }

  static _checkEurekaOnNoteRemove(row, col, value, board) {
    if (typeof EurekaDetector === 'undefined') return;

    const result = EurekaDetector.checkOnNoteRemove(row, col, value, board);

    if (result.isEureka) {
      this._onEureka(result);
    }
  }

  static _onEureka(eurekaResult) {
    // 标记到推理监控
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.setEureka(true);
    }

    // 记录回放到
    if (this._config.playback.enabled && typeof NotePlayback !== 'undefined') {
      NotePlayback.recordEvent({
        type: 'eureka',
        row: eurekaResult.target.row,
        col: eurekaResult.target.col,
        value: eurekaResult.target.value,
        metadata: {
          cascadeCount: eurekaResult.cascadeCount,
          technique: eurekaResult.technique,
        },
      });
    }

    // 立即触发Eureka提示
    this._triggerEurekaHint(eurekaResult);
  }

  static _triggerEurekaHint(eurekaResult) {
    if (typeof HintDialogueDirector === 'undefined') return;

    const result = HintDialogueDirector.checkAndDispatch(null);

    if (result.shouldTrigger && this._onHintTriggered) {
      this._onHintTriggered({
        ...result,
        eurekaData: eurekaResult,
      });
    }
  }

  // ========================================================
  //  自动检查
  // ========================================================

  static _startAutoCheck() {
    if (this._checkTimer) return;

    this._checkTimer = setInterval(() => {
      if (!this._enabled) return;
      this._doCheck();
    }, this._config.checkInterval);
  }

  static _stopAutoCheck() {
    if (this._checkTimer) {
      clearInterval(this._checkTimer);
      this._checkTimer = null;
    }
  }

  /**
   * 执行一次检查（供外部手动调用或定时器调用）
   * @param {Object} [board] - 棋盘对象
   * @returns {Object}
   */
  static checkAndTrigger(board = null) {
    if (!this._enabled) {
      return { shouldTrigger: false, reason: 'disabled' };
    }

    return this._doCheck(board);
  }

  static _doCheck(board = null) {
    if (typeof HintDialogueDirector === 'undefined') {
      return { shouldTrigger: false, reason: 'no_director' };
    }

    // [v5.0 拦截] 如果是精准挖空的定向技巧残局，且当前已经进入"技术断点"
    if (this._currentSkill && this._coreMove) {
      // 问一下推理监控：玩家是不是在断点处疯狂做笔记且技术撞墙（静默时长 > 阈值）
      const state = typeof ReasoningMonitor !== 'undefined'
        ? ReasoningMonitor.getReasoningState()
        : null;

      const threshold = typeof DynamicThresholdCalculator !== 'undefined' && state
        ? DynamicThresholdCalculator.getCharacterThreshold(
            (typeof window !== 'undefined' && window._currentCharacter)
              ? window._currentCharacter
              : 'ayan',
            state
          )
        : 45; // 默认 45 秒兜底

      if (state && state.silenceDuration >= threshold) {
        // 动态生成角色针对该技巧的局部框选高亮指令，不给答案，只理思路
        const char = (typeof window !== 'undefined' && window._currentCharacter)
          ? window._currentCharacter
          : 'cagekeeper';

        let dialogue = null;
        let highlight = null;

        if (typeof CharacterizedHintRouter !== 'undefined') {
          const charKey = this._characterToRouterKey(char);
          const passiveResult = CharacterizedHintRouter.triggerPassiveHint(
            charKey,
            this._currentSkill,
            this._coreMove
          );
          if (passiveResult) {
            dialogue = passiveResult.dialogue;
            highlight = passiveResult.highlight;
          }
        }

        const result = {
          shouldTrigger: true,
          mode: 'passive_teaching',
          type: 'passive_teaching',
          character: char,
          dialogue: dialogue,
          technique: this._currentSkill,
          highlight: highlight,
          highlightAxes: this._calculateHighlightAxes(this._currentSkill, this._coreMove),
          clearAfter: 4000,
        };

        if (this._onHintTriggered) {
          this._onHintTriggered(result);
        }

        // 唤醒提示后重置活动监控，防止台词每秒疯狂刷屏
        if (typeof ReasoningMonitor !== 'undefined') {
          ReasoningMonitor.updateActivity();
        }
        return result;
      }
      return { shouldTrigger: false, reason: 'user_is_thinking' };
    }

    // 传统自由模式或故事模式的被动调度逻辑
    const result = HintDialogueDirector.checkAndDispatch(board);
    if (result.shouldTrigger && this._onHintTriggered) {
      setTimeout(() => { this._onHintTriggered(result); }, 0);
    }
    return result;
  }

  /**
   * [v5.0] 角色标识到 Router key 的转换
   */
  static _characterToRouterKey(char) {
    const map = {
      'ayan': 'ayan',
      'cagekeeper': 'cagekeeper',
      'puzzlemaster': 'puzzlemaster',
      '守笼人': 'cagekeeper',
      '设局人': 'puzzlemaster',
      '阿岩': 'ayan',
    };
    return map[char] || 'ayan';
  }

  /**
   * [v5.0] 计算技巧关联的高亮轴线/区域
   * 用于被动教学模式下框选提示范围，不给答案只给思路
   */
  static _calculateHighlightAxes(skill, coreMove) {
    if (!coreMove) return null;
    const { row, col } = coreMove;
    const axes = { rows: [], cols: [], cages: [] };
    const s = skill.toLowerCase();

    switch (s) {
      case 'rule45':
        // 星衡法则：高亮核心格所在的行+列+笼子（形成"丁"字区域）
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'hiddensingle':
        // 隐曜：高亮该行/列/宫中所有同数字候选
        axes.rows.push(row);
        break;
      case 'nakedpair':
        // 并蒂锁：高亮所在行或列的两个数对格
        axes.rows.push(row);
        axes.cols.push(col);
        break;
      case 'cageuniquecombo':
        // 笼子唯一组合：高亮整个笼子
        axes.cages.push('current');
        break;
      case '二连纵横阵':
        // 二连纵横阵：高亮两行+两列形成的矩形
        axes.rows = [row, (row + 3) % 9];
        axes.cols = [col, (col + 4) % 9];
        break;
      default:
        axes.rows.push(row);
        axes.cols.push(col);
    }
    return axes;
  }

  // ========================================================
  //  回调设置
  // ========================================================

  /**
   * 设置提示触发回调
   * @param {Function} callback
   */
  static setOnHintTriggered(callback) {
    this._onHintTriggered = callback;
  }

  // ========================================================
  //  辅助方法
  // ========================================================

  /**
   * 判断是否为教学关卡
   * @param {string} chapterId
   * @returns {boolean}
   */
  static _isTutorialLevel(chapterId) {
    // 第1章为教学章节
    return chapterId === '1' || chapterId === 1 || chapterId === 'hell_1';
  }

  /**
   * 获取系统状态（调试用）
   * @returns {Object}
   */
  static getState() {
    const reasoningState = typeof ReasoningMonitor !== 'undefined'
      ? ReasoningMonitor.getReasoningState()
      : null;

    const directorStats = typeof HintDialogueDirector !== 'undefined'
      ? HintDialogueDirector.getStats()
      : null;

    return {
      enabled: this._enabled,
      initialized: this._initialized,
      currentLevel: this._currentLevelId,
      currentChapter: this._currentChapterId,
      reasoningState,
      directorStats,
    };
  }

  /**
   * 调试打印
   */
  static debugPrint() {
    console.log('=== ReasoningAndHintSystem ===');
    console.log(`  启用: ${this._enabled}`);
    console.log(`  关卡: ${this._currentLevelId} (${this._currentChapterId})`);

    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.debugPrint();
    }

    if (typeof HintDialogueDirector !== 'undefined') {
      HintDialogueDirector.debugPrint();
    }

    console.log('==============================');
  }

  // ========================================================
  //  子模块访问（便捷引用）
  // ========================================================

  /**
   * 获取推理监控
   */
  static get Monitor() { return typeof ReasoningMonitor !== 'undefined' ? ReasoningMonitor : null; }

  /**
   * 获取Eureka检测器
   */
  static get Eureka() { return typeof EurekaDetector !== 'undefined' ? EurekaDetector : null; }

  /**
   * 获取动态阈值计算器
   */
  static get Threshold() { return typeof DynamicThresholdCalculator !== 'undefined' ? DynamicThresholdCalculator : null; }

  /**
   * 获取台词数据库
   */
  static get Dialogue() { return typeof DialogueDatabase !== 'undefined' ? DialogueDatabase : null; }

  /**
   * 获取提示导演
   */
  static get Director() { return typeof HintDialogueDirector !== 'undefined' ? HintDialogueDirector : null; }

  /**
   * 获取回放系统
   */
  static get Playback() { return typeof NotePlayback !== 'undefined' ? NotePlayback : null; }

  /**
   * 获取数据收集器
   */
  static get DataCollector() { return typeof DataCollector !== 'undefined' ? DataCollector : null; }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReasoningAndHintSystem };
}

if (typeof window !== 'undefined') {
  window.ReasoningAndHintSystem = ReasoningAndHintSystem;
  // 简称
  window.RAHS = ReasoningAndHintSystem;
}
