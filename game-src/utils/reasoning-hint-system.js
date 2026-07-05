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
   * @param {number} value - 候选数值
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
   * 使用提示按钮
   */
  static onHintButton() {
    if (!this._enabled) return;

    // 记录提示使用（影响Eureka的"盲解"判定）
    if (typeof EurekaDetector !== 'undefined') {
      EurekaDetector.recordHintTriggered();
    }

    // 更新活动时间
    if (typeof ReasoningMonitor !== 'undefined') {
      ReasoningMonitor.updateActivity();
    }
  }

  /**
   * 设置自动候选数状态
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

    const result = HintDialogueDirector.checkAndDispatch(board);

    if (result.shouldTrigger && this._onHintTriggered) {
      // 异步调用回调，避免阻塞
      setTimeout(() => {
        this._onHintTriggered(result);
      }, 0);
    }

    return result;
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
