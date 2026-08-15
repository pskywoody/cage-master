// ============================================================
//  BattleManager - V4 章节Boss战系统（纯逻辑 ES Module）
// ============================================================
//  @deprecated
//
//  Legacy Combat Runtime Adapter（遗留战斗兼容层）。
//  不要在战斗大脑上新增能力。
//
//  Production path（新战斗世界）：
//    TplBattleController
//      ├── BattleContext
//      ├── Director
//      ├── StrategyPool / StrategySelector
//      ├── IntentObserver
//      └── DramaEventManager
//
//  本文件仅保留 AIPlayerCore（Solver）供双 AI 对战/测试驱动复用，
//  以及历史兼容调用。新能力一律走 TplBattleController + AI Pipeline。
// ============================================================
//  迁移自 cagemaster3/game/guide-battle.js（V3 GuideBattle 对象）
//
//  设计约束（对照迁移手册 sec2-4）：
//    - core/ 模块不依赖 renderer/ 或 ui/，纯逻辑
//    - 所有 DOM 操作（document.*、canvas、事件绑定、气泡/覆盖层 UI、
//      动画）一律移除，改为通过 onEvent(eventType, data) 回调消费
//    - 棋盘操作接口：HeadlessEngine 的 Board 实例（engine.getBoard()）
//    - AI 决策核心基于 TechRater（用 _findAllByTechnique 选格）
//    - 纯 ES Module 语法；Node.js 环境可 import 并构造
//      （对 window/document/localStorage 等使用 typeof 守卫）
//
//  公共 API：
//    - new BattleManager(options)
//    - bm.start(options)                   启动 Boss 战
//    - bm.stop()                           停止
//    - bm.onPlayerFill(r,c,value,isCorrect) 玩家填数回调
//    - bm.onPlayerUndo(r,c)                玩家撤销回调
//    - bm.onPlayerFocusCell(r,c)           凝视拦截回调
//    - bm.triggerSkill(skillType)          触发 Boss 必杀技
//    - bm.getScoreProgress() / getScoreBreakdown() 得分进度/明细
//    - bm.getSpeedMultiplier() / getLockStates() / getFakeCells() ...
//    - BattleManager.createFromConfig(chapterId, options) 便捷工厂
// ============================================================


import { HeadlessEngine } from './headless-engine.js';
import { Director } from './director.js';
import { StrategySelector } from './strategy-selector.js';

const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

// ---------------------------------------------------------------------------
// 1. TechRater 引导
//    V4 core/tech-rater.js 是 CJS 全局脚本（IIFE）。Node 环境无法直接
//    import 其命名导出，故仿照 headless-engine.js 的方式在模块加载时
//    通过 eval 执行，使其挂载到 global.TechRater。
//    浏览器环境：页面应已按 <script> 引入 tech-rater.js，globalThis.TechRater 可用。
//    注意：浏览器原生 ESM 无法解析静态 import 'fs'，此处改为动态 import，
//    仅 Node 环境执行，浏览器环境安全加载。
// ---------------------------------------------------------------------------
let TechRaterClass = (typeof globalThis.TechRater !== 'undefined') ? globalThis.TechRater : null;

if (!TechRaterClass && IS_NODE) {
  try {
    const [fsMod, pathMod, urlMod] = await Promise.all([
      import('fs'),
      import('path'),
      import('url'),
    ]);
    const __dirname = pathMod.dirname(urlMod.fileURLToPath(import.meta.url));
    const techRaterCode = fsMod.readFileSync(pathMod.join(__dirname, 'tech-rater.js'), 'utf8');
    // eslint-disable-next-line no-eval
    eval(techRaterCode);
    TechRaterClass = (typeof globalThis.TechRater !== 'undefined') ? globalThis.TechRater : null;
  } catch (e) {
    // 忽略：若 TechRater 已由外部注入则无需加载
    console.warn('[BattleManager] TechRater 加载失败（Node 环境）:', e);
  }
} else if (!TechRaterClass) {
  console.warn('[BattleManager] 浏览器环境未找到全局 TechRater：请先在页面以 <script> 引入 core/tech-rater.js。');
}

// V4.3.25：棋盘坐标转"a1"式标签（(0,0)→a1，(2,3)→c4）
// 行→字母（0=a），列→数字+1（0=1）
function cellTag(r, c) {
  return String.fromCharCode(97 + r) + (c + 1);
}

import { BATTLE_EVENTS, BOSS_CONFIGS } from './boss-configs.js';
import { AIPlayerCore, AI_PERSONALITIES } from './ai-player-core.js';

export { BATTLE_EVENTS, BOSS_CONFIGS } from './boss-configs.js';
export { AIPlayerCore } from './ai-player-core.js';


// ---------------------------------------------------------------------------
// 6. BattleManager - Boss 战主类（纯逻辑，无 DOM 依赖）
// ---------------------------------------------------------------------------
export class BattleManager {
  // 三色分值配置
  static SCORE_WEIGHTS = Object.freeze({ simple: 1, core: 1.5, gate: 2 });

  // 事件优先级（数字越大优先级越高）
  static EVENT_PRIORITY = Object.freeze({
    MISTAKE_LINE: 1,    // AI犯错台词（最低）
    SELF_CORRECT: 1,    // 自我修正台词
    INTERCEPT_LINE: 2,  // 拦截台词
    WARNING_LINE: 3,    // 预警台词
    COMBO: 3,           // 连击提示
    COMEBACK: 4,        // 翻盘提示
    SKILL_LINE: 5,      // 必杀技台词
    SKILL_EFFECT: 6,    // 必杀技特效
    WARNING_OVERLAY: 7, // 预警红光覆盖层（高）
    END_BATTLE: 99,     // 战斗结束（最高）
  });

  static STATS_KEY = 'cagemaster_battle_stats';
  static COMEDY_KEY = 'cagemaster_comedy_achievements';

  /**
   * @param {Object} [options]
   * @param {Function} [options.onEvent] - 事件回调 (eventType, data) => void
   * @param {Object}  [options.storage]  - 持久化存储（localStorage 兼容接口 getItem/setItem/removeItem）
   * @param {Class}   [options.techRaterAdapter] - 三色加权适配器类（可选）
   * @param {boolean} [options.enableDifficulty] - 动态难度开关（默认 true）
   * @param {boolean} [options.enableComedy] - 喜剧成就检测开关（默认 true）
   * @param {Function}[options.logger] - 日志函数（默认 console.log）
   */
  constructor(options = {}) {
    this.active = false;
    this.ended = false;
    this.result = null;
    this.opponent = null;
    this.solution = null;
    this.size = 9;
    this.aiOwned = null;
    this.playerOwned = null;
    this.aiCount = 0;
    this.playerCount = 0;
    this.totalEmpty = 0;
    this.winTarget = 0;

    this._options = options || {};
    this._onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
    this._logger = typeof options.logger === 'function' ? options.logger : console.log;
    this._storage = options.storage || this._defaultStorage();
    this._adapterClass = options.techRaterAdapter || null;
    this._difficultyEnabled = options.enableDifficulty !== false;
    this._comedyEnabled = options.enableComedy !== false;

    // 三色加权得分系统
    this._weightedScoreEnabled = false;
    this._cellCategories = null;
    this.playerScore = 0;
    this.aiScore = 0;
    this.maxScore = 0;
    this.winScore = 0;

    this._aiTimer = null;
    this._board = null;
    this._onEndCallback = null;
    this._aiPlayer = null;
    this._aiThinking = false;
    this._paused = false;   // V4.3.29：教学期间暂停 AI
    this._warningTriggered = false;
    this._warning60Triggered = false;
    this._warning70Triggered = false;
    this._correctCount = 0;
    this._startTime = 0;

    // 连击系统
    this._combo = { count: 0, bestCombo: 0, stunActive: false };
    this._comboHideTimer = null;

    // 演出/事件队列
    this._events = [];
    this._eventPlaying = false;
    this._eventTimer = null;

    // 拦截系统
    this._hoveredCell = null;
    this._hoverStartTime = 0;
    this._interceptCooldown = 0;

    // 三幕节奏引擎（V4.3.27）
    this._threeAct = 1;           // 1|2|3 当前幕
    this._threeActProgress = 0;   // 0-100 当前进度
    this._threeActParams = { aiSpeed: 0.7, hintCooldown: 0.8, comboMultiplier: 1.2 };

    // V4.3.24（Spec v1.3）：专注值（Posture）+ 忍杀 + 异步要塞防守
    this._focus = { player: 0, ai: 0 };          // 0-100，双方独立
    this._focusIdle = { player: 0, ai: 0 };      // 连续无专注事件的步数（衰减用）
    this._underSiege = null;                     // { r, c, side:'ai', duration, timer } AI 蓄力锁定关键格
    this._playerStunned = false;                 // 玩家被忍杀震慑中（禁止填数）
    this._deathblowAnimating = false;

    // 假动作系统（误导型人格专属）
    this._fakeMoves = [];
    this._fakeMoveTimer = null;

    // 动态难度调节系统
    this._difficulty = {
      enabled: this._difficultyEnabled,
      speedMultiplier: 1.3,
      playerMoveTimes: [],
      playerAvgTime: 0,
      targetRatio: 1.3,
      minMultiplier: 0.5,
      maxMultiplier: 2.5,
      smoothFactor: 0.15,
      lastAdjustTime: 0,
      adjustInterval: 8000,
    };

    // ===== Boss战特殊机制扩展字段（按需初始化） =====
    // 第1章：机关锁格
    this._lockStates = new Map();
    this._allLocksReleased = false;
    // 第2章：候选数脉冲
    this._pulseInterval = 45000;
    this._pulseDuration = 3000;
    this._pulseTimer = null;
    this._isPulsing = false;
    this._pulsePhase = 'idle';
    this._pulseStartTime = 0;
    this.forceRender = false;
    // 第3章：幻影格
    this._fakeCellsData = [];
    this._fakeCellExposed = [];
    // 第4章：联动锁
    this._regionLockStates = {};
    this._allRegionLocksReleased = false;
    // 第5章：坍缩
    this._collapseProgress = 0;
    this._isCollapsing = false;
    this._collapseStage = 0;
    this._collapsedCages = new Set();
    this._collapseConfig = null;
    this._outerCageIds = [];
    // 第6章：双解
    this._dualPathChosen = null;
    // 第7章：三阶段
    this._currentPhase = 1;

    // 难度保底系统
    this._stuckTimer = 0;
    this._stuckThreshold = 180000; // 3分钟
    this._aidUsed = false;

    // 战绩/成就计数
    this._aiMistakeCount = 0;
    this._playerMistakeCount = 0;
    this._stealCount = 0;
    this._counterCount = 0;       // V4.3.22：看破次数（纠正 AI 犯错格）
    this._maxStunTime = 0;        // V4.3.22：单局最大震慑时长
    this._maxDeficit = 0;

    // 翻盘机制
    this._comeback = {
      active: false,
      triggerDiff: 10,
      releaseDiff: 5,
      speedBonus: 1.4,
    };
  }

  /**
   * 便捷工厂：根据章节号从 BOSS_CONFIGS 加载 Boss 战
   * @param {number|string} chapterId - 章节号（1-8）
   * @param {Object} [options] - 构造参数（含 onEvent/onEnd/storage 等）
   * @returns {BattleManager|null}
   */
  static createFromConfig(chapterId, options = {}) {
    const config = BOSS_CONFIGS[chapterId];
    if (!config || !config.battleData) return null;
    const engine = new HeadlessEngine();
    engine.loadLevel(config.battleData);
    const manager = new BattleManager(options);
    manager.start({
      board: engine.getBoard(),
      solution: config.battleData.solution,
      opponent: config,
      onEnd: options.onEnd || null,
    });
    return manager;
  }

  // ============================================================
  //  持久化存储：优先注入，其次 localStorage，最后内存回退
  // ============================================================
  _defaultStorage() {
    if (typeof localStorage !== 'undefined' && localStorage) {
      return localStorage;
    }
    // Node/无 localStorage 环境：内存回退
    const mem = {};
    return {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
    };
  }

  // ============================================================
  //  事件发射：所有 UI/演出副作用统一走这里
  // ============================================================
  _emit(eventType, data) {
    if (this._onEvent) {
      try {
        this._onEvent(eventType, data || {});
      } catch (e) {
        this._log('[BattleManager] onEvent error:', e);
      }
    }
  }

  _log(...args) {
    try {
      this._logger('[BattleManager]', ...args);
    } catch (e) {
      // 忽略日志错误
    }
  }

  _warn(...args) {
    try {
      this._logger.warn ? this._logger.warn('[BattleManager]', ...args) : this._logger('[BattleManager] warn:', ...args);
    } catch (e) {
      // 忽略
    }
  }

  _error(...args) {
    try {
      this._logger.error ? this._logger.error('[BattleManager]', ...args) : this._logger('[BattleManager] error:', ...args);
    } catch (e) {
      // 忽略
    }
  }

  // ============================================================
  //  启动 Boss 战
  // ============================================================
  start(options) {
    if (!options || (!options.board && !options.boardData)) {
      this._error('Missing required options (board or boardData)');
      return;
    }

    // 兼容：直接传入关卡数据时自动构建 HeadlessEngine 棋盘
    let board = options.board;
    if (!board && options.boardData) {
      const engine = new HeadlessEngine();
      engine.loadLevel(options.boardData);
      board = engine.getBoard();
      if (!options.solution) options.solution = options.boardData.solution || null;
    }

    if (!board || !options.solution) {
      this._error('Missing required options (board / solution)');
      return;
    }

    this.active = true;
    this._startTime = Date.now();
    this.ended = false;
    this.result = null;
    this._board = board;
    this.solution = options.solution;
    this.opponent = options.opponent;
    // 使用 board.size（与 Board 类保持一致）
    this.size = board.size || 9;
    this._warningTriggered = false;
    this._warning60Triggered = false;
    this._warning70Triggered = false;
    this._correctCount = 0;
    this._interceptCooldown = 0;
    // 初始化假动作系统
    this._fakeMoves = [];
    if (this._fakeMoveTimer) {
      clearInterval(this._fakeMoveTimer);
      this._fakeMoveTimer = null;
    }
    // 初始化连击系统
    this._combo = { count: 0, bestCombo: 0, stunActive: false };
    // 喜剧/成就计数器
    this._aiMistakeCount = 0;
    this._playerMistakeCount = 0;
    this._stealCount = 0;
    this._counterCount = 0;      // V4.3.22：看破次数
    this._maxStunTime = 0;       // V4.3.22：单局最大震慑
    this._lastNewAchievements = []; // V4.3.22：本局新解锁成就
    this._maxDeficit = 0;

    // V4.3.23（Spec v1.2）：关键格（Hotspot）系统
    this._hotspots = [];          // [{r, c}] 当前关键格
    this._hotspotPhase = 1;       // 1=开局 2=中期
    this._hotspotInitialCount = 2;
    this._influenceScoring = true; // Boss 战启用影响力计分（得分飘字/暴击）
    // 记录最近一次填格得分（供 UI 飘字）
    this._lastFillPoints = { r: -1, c: -1, points: 0, text: '', color: '#e8dcc0' };

    // V4.3.24（Spec v1.3）：专注值 + 忍杀 + 蓄力 重置
    this._focus = { player: 0, ai: 0 };
    this._focusIdle = { player: 0, ai: 0 };
    if (this._underSiege && this._underSiege.timer) {
      clearTimeout(this._underSiege.timer);
    }
    this._underSiege = null;
    this._playerStunned = false;
    this._deathblowAnimating = false;

    // V4.3.25（Spec v1.4）：笔记心理战 重置
    this._noteClearedSet = new Set();     // 玩家清空过笔记的格（声东击西伏笔）
    this._fakeNoteCells = new Set();      // 含假笔记的格 'r,c'
    this._lastNoteEventTs = 0;
    // 初始化动态难度系统
    if (this._difficulty) {
      this._difficulty.speedMultiplier = 1.3;
      this._difficulty.playerMoveTimes = [];
      this._difficulty.playerAvgTime = 0;
      this._difficulty.lastAdjustTime = Date.now();
    }
    // 三幕节奏引擎重置
    this._threeAct = 1;
    this._threeActProgress = 0;
    this._threeActParams = { aiSpeed: 0.7, hintCooldown: 0.8, comboMultiplier: 1.2 };
    this._onEndCallback = options.onEnd || null;

    // ===== 初始化Boss战特殊机制 =====
    this._initBossMechanisms();

    // 初始化归属数组
    this.aiOwned = [];
    this.playerOwned = [];
    this.aiCount = 0;
    this.playerCount = 0;
    this.totalEmpty = 0;

    // 健壮性检查：确保cells是二维数组
    if (!board.cells || !Array.isArray(board.cells) || board.cells.length === 0) {
      this._error('Invalid board cells');
      this.size = 9;
      this.totalEmpty = 81;
    } else {
      for (let r = 0; r < this.size; r++) {
        this.aiOwned[r] = [];
        this.playerOwned[r] = [];
        for (let c = 0; c < this.size; c++) {
          this.aiOwned[r][c] = false;
          this.playerOwned[r][c] = false;
          const cell = board.cells[r]?.[c];
          if (cell) {
            const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
            const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
            if (!hasFixed && !hasFilled) {
              this.totalEmpty++;
            }
          } else {
            this.totalEmpty++;
          }
        }
      }
    }

    // 胜利条件：先填到总空格数的75%（最少3个，最多不超过总空格数）
    this.winTarget = Math.min(
      this.totalEmpty,
      Math.max(3, Math.ceil(this.totalEmpty * 0.75))
    );

    // ===== 初始化三色加权得分系统 =====
    this._initWeightedScoreSystem(board);

    this._log('Started vs', this.opponent ? this.opponent.name : 'unknown',
      'size:', this.size,
      'totalEmpty:', this.totalEmpty,
      'winTarget:', this.winTarget,
      'weightedScore:', this._weightedScoreEnabled,
      'maxScore:', this.maxScore,
      'winScore:', this.winScore);

    // 初始化AI玩家（基于TechRater的推理AI）
    this._initAiPlayer();

    // V4.3.23（Spec v1.2）：开局初始化关键格（Hotspot）
    this._initHotspots();

    // 通知UI层Boss战已启动
    this._emit(BATTLE_EVENTS.BOSS_BATTLE_STATE, { active: true });
    this._emit(BATTLE_EVENTS.BATTLE_START, {
      opponent: this.opponent,
      size: this.size,
      totalEmpty: this.totalEmpty,
      winTarget: this.winTarget,
      preDialog: this.opponent?.preDialog || [],
      winDialog: this.opponent?.winDialog || [],
      hotspots: this._hotspots.slice(),      // V4.3.23：开局关键格
    });

    // 延迟启动AI（给玩家一点准备时间）
    setTimeout(() => {
      if (this.active && !this.ended) {
        this._scheduleAiMove();
      }
    }, 2000);

    // 启动假动作系统（误导型人格专属）
    const bossId = this.opponent?.id;
    if (bossId === 'plotter' || bossId === 'plotterShadow' || bossId === 'setterSecret') {
      this._startFakeMoveSystem();
    }
  }

  /**
   * 初始化 AI 玩家（内部 AIPlayerCore + 性格/难度调整）
   */
  _initAiPlayer() {
    if (!TechRaterClass) {
      this._warn('TechRater not found, falling back to legacy AI');
      this._aiPlayer = null;
      return;
    }

    // 根据Boss ID选择性格
    const personalityName = this._getPersonalityForBoss(this.opponent?.id);
    let personality = AI_PERSONALITIES[personalityName] || AI_PERSONALITIES.steady;

    // 如果有AI难度调整配置，应用到性格上
    if (this.opponent?.aiDifficulty) {
      const diff = this.opponent.aiDifficulty;
      const adjusted = Object.assign({}, personality);

      if (diff.maxTechLevel !== undefined) {
        adjusted.maxTechLevel = Math.min(adjusted.maxTechLevel, diff.maxTechLevel);
      }
      if (diff.discoveryMultiplier !== undefined) {
        adjusted.discoveryRate = {};
        const baseRate = personality.discoveryRate;
        for (const level in baseRate) {
          adjusted.discoveryRate[level] = Math.max(0.2, baseRate[level] * diff.discoveryMultiplier);
        }
      }
      if (diff.speedMultiplier !== undefined) {
        adjusted.speedMultiplier = {
          min: (personality.speedMultiplier?.min ?? 0.8) * diff.speedMultiplier,
          max: (personality.speedMultiplier?.max ?? 1.2) * diff.speedMultiplier,
        };
      }
      if (diff.mistakeMultiplier !== undefined) {
        adjusted.baseErrorRate = (personality.baseErrorRate ?? 0.05) * diff.mistakeMultiplier;
      }
      if (diff.interceptMultiplier !== undefined) {
        adjusted.interceptProbability = (personality.interceptProbability ?? 0.4) * diff.interceptMultiplier;
      }

      personality = adjusted;
    }

    this._aiPlayer = new AIPlayerCore(this._board, personality,
      (r, c) => this.getCellCategory(r, c),
      this._weightedScoreEnabled);

    // V4.3.23（Spec v1.2）：人格抢关键格概率——expert 0.8 / mentor 0.5 / 其余 0
    const hp = (personality.name === 'expert') ? 0.8 : (personality.name === 'mentor' ? 0.5 : 0);
    if (typeof this._aiPlayer.setHotspotPriority === 'function') {
      this._aiPlayer.setHotspotPriority(hp, () => this._hotspots);
    }

    // V4.3.34：AI睁眼——注入 ownership 网格引用（数组引用，后续改动自动可见）
    if (typeof this._aiPlayer.setOwnershipGrids === 'function') {
      this._aiPlayer.setOwnershipGrids(this.playerOwned, this.aiOwned);
    }

    this._log('AIPlayer initialized, personality:', personality.name || personality);
  }

  /**
   * 停止 Boss 战
   */
  stop() {
    this.active = false;
    this._aiThinking = false;
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
    // V4.3.24：清理蓄力/震慑状态
    if (this._underSiege && this._underSiege.timer) {
      clearTimeout(this._underSiege.timer);
    }
    this._underSiege = null;
    this._playerStunned = false;
    // 清理AI玩家
    this._aiPlayer = null;
    // 清理假动作系统
    if (this._fakeMoveTimer) {
      clearInterval(this._fakeMoveTimer);
      this._fakeMoveTimer = null;
    }
    this._fakeMoves = [];
    // 清理脉冲定时器
    if (this._pulseTimer) {
      clearInterval(this._pulseTimer);
      this._pulseTimer = null;
    }
    this._isPulsing = false;
    // 清理事件队列
    this._clearEventQueue();
    this._emit(BATTLE_EVENTS.BOSS_BATTLE_STATE, { active: false });
    this._log('Stopped');
  }

  // ============================================================
  //  玩家填数回调
  // ============================================================
  onPlayerFill(r, c, value, isCorrect) {
    if (!this.active || this.ended) return;

    // V4.3.24（Spec v1.3）：玩家被忍杀震慑中，禁止填数
    if (this._playerStunned) {
      this._emit(BATTLE_EVENTS.SFX, { name: 'block' });
      return;
    }

    // V4.3.24（Spec v1.3）：AI 蓄力锁定该格时，玩家填入 → 招架
    if (this._onParry(r, c)) {
      // 招架成功后继续正常填数（下方走抢关键格 +20 专注逻辑）
    }

    if (isCorrect && !this.playerOwned[r][c]) {
      // 如果之前是AI的格子，玩家抢过来
      const wasStolen = this.aiOwned[r][c];
      if (wasStolen) {
        // V4.3.22：看破判定——抢回 AI 填错的格子（在清除标记前读取）
        const wasAiMistake = !!(this._board.cells[r]?.[c]?._aiMistake);
        this.aiOwned[r][c] = false;
        this.aiCount--;
        // 加权得分：AI减去该格分数
        if (this._weightedScoreEnabled) {
          this.aiScore -= this._getCellWeight(r, c);
        }
        // 清除AI标记
        const cell = this._board.cells[r]?.[c];
        if (cell) {
          cell.isAiFilled = false;
          cell._aiNum = null;
          cell._aiMistake = false;
        }
        // 抢格粒子特效
        this._emit(BATTLE_EVENTS.PARTICLES, { col: c, row: r, type: 'steal', count: 15 });
        this._stealCount++;
        // V4.3.22：看破（COUNTER）——玩家纠正了 AI 的犯错格
        if (wasAiMistake) {
          this._counterCount++;
          this._emit(BATTLE_EVENTS.COUNTER, { r: r, c: c });
        }
        // V4.3.24：记录本次是否为看破（专注评估用，标记已被清除）
        this._lastWasCounter = !!wasAiMistake;
      } else {
        // 普通填对粒子特效
        this._emit(BATTLE_EVENTS.PARTICLES, { col: c, row: r, type: 'correct', count: 8 });
      }
      this.playerOwned[r][c] = true;
      this.playerCount++;
      this._correctCount++;
      // 加权得分：玩家增加该格分数
      if (this._weightedScoreEnabled) {
        this.playerScore += this._getCellWeight(r, c);
      }

      // V4.3.23（Spec v1.2）：影响力暴击计分 + 飘字 + 关键格
      const isHot = this._isHotspot(r, c);
      const pts = this._calcFillPoints(r, c, null);
      this.playerScore += pts;
      this._emitScoreFloat(r, c, pts, isHot);
      this._maybeRefreshHotspots();
      // V4.3.24（Spec v1.3）：玩家专注值评估（Counter +25 / 抢关键格 +20 / 暴击 +15 / 普通 +3）
      const wasCounter = !!this._lastWasCounter;
      this._lastWasCounter = false;
      this._onFillFocusEval('player', r, c, isHot, pts, wasCounter);
      // V4.3.25（Spec v1.4）：声东击西——清空笔记的格被填对
      const noteKey = r + ',' + c;
      if (this._noteClearedSet.has(noteKey)) {
        this._noteClearedSet.delete(noteKey);
        this._emit(BATTLE_EVENTS.NOTE_DISTRACT, { r, c });
      }
      // V4.3.23（P2）：玩家暴击台词（限频 3s）
      if (pts >= 3) {
        const now2 = Date.now();
        if (!this._lastQuipTs || now2 - this._lastQuipTs > 3000) {
          this._lastQuipTs = now2;
          this._emit(BATTLE_EVENTS.BOSS_QUIP, { key: 'crit' });
        }
      }

      // ========================================
      // 连击系统：连续正确触发AI震慑
      // ========================================
      this._combo.count++;
      if (this._combo.count > this._combo.bestCombo) {
        this._combo.bestCombo = this._combo.count;
      }

      // 连击阈值配置（杀手数独关卡阈值更低，更容易触发反击）
      const tuning = this.opponent?.battleTuning || {};
      const isKiller = tuning.isKiller || false;
      const comboThreshold = isKiller ? 2 : 3;  // 杀手数独2连击就触发
      const baseStunTime = isKiller ? 2000 : 1500; // 震慑基础时长
      const stunPerCombo = isKiller ? 800 : 500;  // 每多一连击增加的震慑时间

      if (this._combo.count >= comboThreshold && !this._combo.stunActive) {
        const extraCombos = this._combo.count - comboThreshold;
        // V4.3.20：震慑时长设上限（杀手 4s / 标准 3s），防止 combo 不清零导致
        // 震慑无限叠加到 5.5s+，AI 整局被定住、对局失衡
        const maxStun = isKiller ? 4000 : 3000;
        const stunTime = Math.min(baseStunTime + extraCombos * stunPerCombo, maxStun);
        this._triggerComboStun(stunTime);
        // V4.3.20：震慑触发后重置连击计数——保证"震慑"是奖励而非持续罚站，
        // 也让后续连击重新累积（公平对局：AI 每被震慑一次只有一次喘息窗口）
        this._combo.count = 0;
      }

      // 连击视觉反馈
      this._showComboFeedback(this._combo.count, wasStolen);

      // 记录玩家填数时间（用于动态难度调节）
      if (this._difficulty && this._difficulty.enabled) {
        const now = Date.now();
        this._difficulty.playerMoveTimes.push({ time: now, correct: true });
        // 只保留最近20次记录
        if (this._difficulty.playerMoveTimes.length > 20) {
          this._difficulty.playerMoveTimes.shift();
        }
        // 尝试调整难度
        this._adjustDifficulty();
      }

      // 同步AI的推理状态（AI看到玩家填了这个数）
      if (this._aiPlayer) {
        // I1（CM4-A2）：单机路径注入游戏状态 + 观察器。
        // 此前 setGameState 仅定义从不被主类调用 → _gameState 恒默认，
        // 动态错误率/领先落后调节/策略状态机在单机 Boss 战全部失效。
        if (typeof this._aiPlayer.updateObserver === 'function') {
          this._aiPlayer.updateObserver({ r, c });
        }
        if (typeof this._aiPlayer.setGameState === 'function') {
          const filled = this.playerCount + this.aiCount;
          const total = this.totalEmpty || filled || 1;
          this._aiPlayer.setGameState({
            isLeading: this.aiCount > this.playerCount ? true : (this.aiCount < this.playerCount ? false : null),
            selfHubCount: this.aiCount,
            opponentHubCount: this.playerCount,
            progress: total > 0 ? filled / total : 0,
            consecutiveErrors: this._playerMistakeCount || 0,
            consecutiveCorrect: this._correctCount || 0,
            isBurst: false,
            hubBlocks: [],          // 单机无据点概念，保持空数组（策略退化为"进攻"）
            castleHubIdx: -1,
            hubOwnership: [],
            playerDefense: {},
          });
        }
        this._aiPlayer.syncFromBoard(this._board);
      }

      // 音效
      this._emit(BATTLE_EVENTS.SFX, { name: wasStolen ? 'eureka' : 'click' });

      // 检查机关锁（第1章机制）
      this._checkLockCells(r, c);

      // 检查联动锁（第4章机制）
      this._checkRegionLocks(r, c);

      // 更新笼坍缩进度（第5章机制）
      const collapseProgress = this._weightedScoreEnabled
        ? (this.playerScore / this.winScore)
        : (this.playerCount / this.winTarget);
      this._updateCollapseProgress(collapseProgress);

      // 通知UI棋盘已变化
      this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });

      // 检查胜利
      this._checkWin();
    } else if (!isCorrect) {
      // V4.3.26：玩家填错时，若格子是 AI 幽灵格，同样清除 AI 标记（否则黄点残留 + 重复填提示"已填过"）
      // 概率性触发根因：AI 填对格显示黄点，玩家点格填了错误数字 → isCorrect=false 不进上方抢回分支
      if (this.aiOwned[r][c]) {
        this.aiOwned[r][c] = false;
        this.aiCount = Math.max(0, this.aiCount - 1);
        // 加权得分：AI减去该格分数
        if (this._weightedScoreEnabled) {
          this.aiScore -= this._getCellWeight(r, c);
        }
        const c2 = this._board.cells[r]?.[c];
        if (c2) {
          c2.isAiFilled = false;
          c2._aiNum = null;
          c2._aiMistake = false;
        }
        this._emit(BATTLE_EVENTS.PARTICLES, { col: c, row: r, type: 'steal', count: 8 });
      }
      // 填错了，重置连击
      this._combo.count = 0;
      this._playerMistakeCount++;
    }
  }

  /**
   * 玩家撤销回调
   */
  onPlayerUndo(r, c) {
    if (!this.active || this.ended) return;

    if (this.playerOwned[r][c]) {
      this.playerOwned[r][c] = false;
      this.playerCount--;
      // 加权得分：玩家减去该格分数
      if (this._weightedScoreEnabled) {
        this.playerScore -= this._getCellWeight(r, c);
      }
      this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });
    }
  }

  // ======================================================
  //  凝视拦截系统 v2.0
  // ======================================================

  /**
   * 玩家选中/凝视某个格子时调用，AI有概率拦截抢占
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean} 是否触发了拦截
   */
  onPlayerFocusCell(r, c) {
    if (!this.active || this.ended || !this._aiPlayer) return false;
    if (this._aiThinking) return false; // AI思考中不额外触发
    if (this.aiOwned[r][c] || this.playerOwned[r][c]) return false; // 已被占的格子

    // 冷却中
    if (this._interceptCooldown > 0) return false;

    // 固定格子跳过
    const cell = this._board.cells[r]?.[c];
    if (!cell || cell.fixedNum) return false;

    // 红格预警：如果是 gate 分类格子，触发闪烁警示
    if (this._weightedScoreEnabled && this._cellCategories) {
      const cat = this._cellCategories[r]?.[c];
      if (cat === 'gate') {
        this._emit(BATTLE_EVENTS.GATE_ALERT, { r, c, duration: 1500 });
        this._emit(BATTLE_EVENTS.SFX, { name: 'breakthrough', volume: 0.5 });
      }
    }

    // 尝试拦截
    const interceptStep = this._aiPlayer.tryIntercept(r, c);
    if (interceptStep) {
      // 设置冷却（杀手数独关卡冷却更长，给玩家留足心算空间）
      const tuning = this.opponent?.battleTuning;
      this._interceptCooldown = tuning?.interceptCooldown || 3000; // 默认3秒

      // 延迟执行拦截，给玩家一点"被抢"的反应时间
      const thinkTime = interceptStep.thinkTime || 300;
      this._aiThinking = true;

      setTimeout(() => {
        if (!this.active || this.ended) {
          this._aiThinking = false;
          return;
        }
        this._applyAiMove(interceptStep);
        this._aiThinking = false;
        // 继续正常AI循环
        this._scheduleAiMove();
      }, thinkTime);

      // 显示拦截提示
      this._showInterceptFeedback(r, c);
      return true;
    }

    return false;
  }

  // ======================================================
  //  连击震慑系统 v1.0
  // ======================================================

  /**
   * 触发连击震慑：让AI暂停思考，给玩家反击爽感
   * @param {number} stunTime - 震慑时长（毫秒）
   */
  _triggerComboStun(stunTime) {
    if (!this.active || this.ended) return;
    if (this._combo.stunActive) return;

    this._combo.stunActive = true;
    this._log('连击震慑! AI被震慑', stunTime + 'ms');
    // V4.3.22：记录单局最大震慑时长（战报卡用）
    if (stunTime > this._maxStunTime) this._maxStunTime = stunTime;
    // V4.3.23（P2）：被连击震慑台词
    this._emit(BATTLE_EVENTS.BOSS_QUIP, { key: 'stunned' });

    // 如果AI正在思考中，延迟后延下一步
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }

    // 震慑结束后恢复AI
    setTimeout(() => {
      if (!this.active || this.ended) return;
      this._combo.stunActive = false;
      // 重新调度AI下一步
      if (!this._aiThinking) {
        this._scheduleAiMove();
      }
    }, stunTime);

    // 触发音效
    this._emit(BATTLE_EVENTS.SFX, { name: 'eureka' });
  }

  /**
   * 显示连击视觉反馈（纯逻辑：转发给 UI 层）
   * @param {number} comboCount - 当前连击数
   * @param {boolean} wasStolen - 是否是抢夺的格子
   */
  _showComboFeedback(comboCount, wasStolen) {
    // 低连击不显示
    if (comboCount < 2) return;

    // 确定连击文案（P3：纸墨色阶——黄铜→橙墨→朱砂→淡紫墨→绛紫）
    let comboText = '';
    let comboColor = '#d4a853';
    if (comboCount >= 2) { comboText = '2 连击!'; comboColor = '#d4a853'; }
    if (comboCount >= 3) { comboText = '3 连击!'; comboColor = '#c0842b'; }
    if (comboCount >= 5) { comboText = '5 连击!!'; comboColor = '#a3352a'; }
    if (comboCount >= 7) { comboText = '7 连击!!!'; comboColor = '#7d6a9e'; }
    if (comboCount >= 10) { comboText = '10 连击!!!!'; comboColor = '#6b4a5e'; }

    if (wasStolen && comboCount >= 2) {
      comboText += ' 反抢!';
    }

    clearTimeout(this._comboHideTimer);
    this._comboHideTimer = setTimeout(() => {
      this._emit(BATTLE_EVENTS.COMBO_FEEDBACK, { count: comboCount, text: comboText, color: comboColor, wasStolen, visible: false });
    }, 1800); // 手感审计：2000→1800ms，连击浮字更跟手不抢视线

    this._emit(BATTLE_EVENTS.COMBO_FEEDBACK, { count: comboCount, text: comboText, color: comboColor, wasStolen, visible: true });
  }

  /**
   * 显示拦截视觉反馈（红光闪烁 + 气泡）
   */
  _showInterceptFeedback(r, c) {
    // 红光闪烁
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(239,68,68,0.3)', duration: 400 });

    // 显示拦截台词气泡
    const interceptLines = this._getInterceptLines();
    if (interceptLines.length > 0) {
      const line = interceptLines[Math.floor(Math.random() * interceptLines.length)];
      this._showBossBubble(line, 'smirk', 1500);
    }
  }

  /**
   * 获取拦截台词（不同Boss不同风格）
   */
  _getInterceptLines() {
    const bossId = this.opponent?.id;
    const linesMap = {
      yingying: ['想快我一步？', '这格，我先落了。', '手快，未必赢。'],
      cagekeeper: ['此格已有定数。', '先一步。', '稳。'],
      plotterShadow: ['门后还有门。', '你走不完的。', '被看穿了。'],
      remnant: ['这一格，我补完了。', '对齐，不是那么容易。', '你慢了。'],
      weaver: ['信号已锁定。', '你发不出去的。', '拦截成功。'],
      plotter: ['你的名字，在这份档案里。', '第三页。', '你逃不掉。'],
      setterSecret: ['你留了短横，我留了竖线。', '下一站，我下船。', '你走到了最后。'],
      shenmo: ['...', '你的思路，我很熟悉。'],
    };
    return linesMap[bossId] || ['被抢先了！'];
  }

  // ======================================================
  //  必杀技系统 v2.0
  // ======================================================

  /**
   * 触发Boss必杀技
   * @param {string} skillType - 技能类型：'guanju' | 'dingshi' | 'quantao' | 'zhuixu' | 'shijian' | 'tiandao'
   */
  triggerSkill(skillType) {
    if (!this.active || this.ended || !this._aiPlayer) return;

    const bossId = this.opponent?.id;

    if (skillType === 'guanju' && bossId === 'yan') {
      this._skillGuanJu();
    } else if (skillType === 'dingshi' && bossId === 'cagekeeper') {
      this._skillDingShi();
    } else if (skillType === 'quantao' && (bossId === 'plotter' || bossId === 'setterSecret' || bossId === 'plotterShadow')) {
      this._skillQuanTao();
    } else if (skillType === 'zhuixu' && bossId === 'remnant') {
      this._skillZhuiXu();
    } else if (skillType === 'shijian' && bossId === 'weaver') {
      this._skillShiJianHuanLiu();
    } else if (skillType === 'tiandao' && bossId === 'shenmo') {
      this._skillTianDao();
    }
  }

  /**
   * 观局必杀：找出全盘所有唯一可填格，显示提示但不填数
   */
  _skillGuanJu() {
    if (!this._aiPlayer || typeof this._aiPlayer.useGuanJu !== 'function') return;

    const targets = this._aiPlayer.useGuanJu();
    this._log('观局 发现', targets.length, '个可填格');

    // 显示台词
    this._showBossBubble('让我看看全盘的局势…', 'thinking', 2000);

    // 高亮提示（UI层消费后 3 秒自行清除，逻辑层不再依赖 DOM）
    this._emit(BATTLE_EVENTS.GUANJU_HIGHLIGHT, { targets });
    setTimeout(() => {
      this._emit(BATTLE_EVENTS.GUANJU_HIGHLIGHT_CLEAR, {});
    }, 3000);

    // 触发音效
    this._emit(BATTLE_EVENTS.SFX, { name: 'hint' });
  }

  /**
   * 定式必杀：直接推导并填入当前玩家凝视格子的答案
   */
  _skillDingShi() {
    if (!this._aiPlayer || typeof this._aiPlayer.useDingShi !== 'function') return;

    // 找一个玩家可能在思考的格子（随机选一个空格子，或者选影响力最大的）
    let targetR = -1, targetC = -1;
    const emptyCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.aiOwned[r][c] && !this.playerOwned[r][c]) {
          const cell = this._board.cells[r]?.[c];
          if (cell && !cell.fixedNum) {
            emptyCells.push({ r, c });
          }
        }
      }
    }

    if (emptyCells.length === 0) return;

    // 选中间的格子作为"定式"目标（更有视觉冲击力）
    const centerIdx = Math.floor(emptyCells.length / 2);
    const target = emptyCells[centerIdx];

    const result = this._aiPlayer.useDingShi(target.r, target.c);
    if (result) {
      // 直接应用到棋盘
      this._applyAiMove(result);

      // 显示台词
      this._showBossBubble('此格，已有定数。', 'confident', 2000);

      // 红光效果
      this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(239,68,68,0.3)', duration: 600 });

      this._checkWin();
    }
  }

  /**
   * 圈套必杀：瞬间抢占3个边缘格子，形成包围圈
   */
  _skillQuanTao() {
    if (!this._aiPlayer || typeof this._aiPlayer.useQuanTao !== 'function') return;

    // 暂停正常AI移动
    this._aiThinking = true;

    const results = this._aiPlayer.useQuanTao(3);
    this._log('圈套 抢占', results.length, '格');

    // 逐个应用，制造连续抢占的视觉冲击
    let delay = 0;
    results.forEach((step, idx) => {
      setTimeout(() => {
        if (!this.active || this.ended) return;
        this._applyAiMove(step);
        if (idx === results.length - 1) {
          this._aiThinking = false;
          this._checkWin();
          this._scheduleAiMove();
        }
      }, delay);
      delay += 200; // 每个间隔200ms
    });

    // 显示台词
    this._showBossBubble('这一局，你走不出去。', 'smirk', 2500);

    // 红光效果
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(239,68,68,0.3)', duration: 800 });
  }

  /**
   * 追忆必杀：随机"回滚"玩家已占领的2个格子，让它们变回未占领状态
   */
  _skillZhuiXu() {
    if (!this._aiPlayer) return;

    // 找出玩家占领的格子
    const playerCells = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.playerOwned[r][c]) {
          playerCells.push({ r, c });
        }
      }
    }

    if (playerCells.length < 2) return; // 玩家格子太少就不触发了

    // 随机选2个回滚
    const shuffled = playerCells.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, 2);

    this._showBossBubble('……这一笔，先收回。', 'stern', 2500);

    // 紫光效果（哀伤的感觉）
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(168,85,247,0.3)', duration: 1000 });

    // 逐个回滚，制造"记忆消散"的视觉效果
    let delay = 0;
    targets.forEach((target) => {
      setTimeout(() => {
        if (!this.active || this.ended) return;
        const cell = this._board.cells[target.r]?.[target.c];
        if (!cell) return;

        // 清除玩家占领
        this.playerOwned[target.r][target.c] = false;
        this.playerCount--;
        // 加权得分：玩家减去该格分数
        if (this._weightedScoreEnabled) {
          this.playerScore -= this._getCellWeight(target.r, target.c);
        }

        // 清除玩家填入的数字
        cell.fillNum = null;
        cell.isError = false;

        this._log(`追忆·回滚玩家格子(${target.r},${target.c})`);

        // 触发渲染
        this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });
      }, delay);
      delay += 600;
    });
  }

  /**
   * 时间回流必杀：8秒内AI速度翻倍，连续快速填数，制造"测向车锁定"的压迫感
   */
  _skillShiJianHuanLiu() {
    if (!this._aiPlayer) return;

    this._showBossBubble('测向车已锁定。时间不多了。', 'default', 2000);

    // 蓝光效果（冰冷的科技感）
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(59,130,246,0.35)', duration: 1500 });

    // 保存原始速度倍率
    const originalMultiplier = this._difficulty.speedMultiplier;
    // 速度翻倍（倍率减半）
    this._difficulty.speedMultiplier = Math.max(0.3, originalMultiplier * 0.5);

    // 如果AI正在思考中，打断并立即执行
    if (this._aiThinking && this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
      this._aiThinking = false;
    }

    // 立即走一步
    this._scheduleAiMove();

    // 8秒后恢复
    setTimeout(() => {
      if (!this.active || this.ended) return;
      this._difficulty.speedMultiplier = originalMultiplier;
      this._log('时间缓流结束，恢复正常速度');
    }, 8000);
  }

  /**
   * 沈墨必杀：天道推演
   * 终极技能：直接推演并填入4个关键格子，同时清除玩家连击
   * 主题：沉静如水的最终对手，深不可测
   */
  _skillTianDao() {
    if (!this._aiPlayer || typeof this._aiPlayer.useQuanTao !== 'function') return;

    this._showBossBubble('……天道。', 'serious', 2000);

    // 金光效果（沈墨的金色主题）
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(251,191,36,0.35)', duration: 1500 });

    // 清除玩家连击
    if (this._combo) {
      this._combo.count = 0;
    }

    // 暂停正常AI移动
    this._aiThinking = true;

    // 用圈套的方法找4个格子（普通圈套是3个，沈墨是4个）
    const results = this._aiPlayer.useQuanTao(4);
    this._log('天道推演 抢占', results.length, '格');

    // 逐个应用，慢速但有力（每步400ms，体现"沉稳"）
    let delay = 0;
    results.forEach((step, idx) => {
      setTimeout(() => {
        if (!this.active || this.ended) return;
        this._applyAiMove(step);
        if (idx === results.length - 1) {
          this._aiThinking = false;
          this._checkWin();
          this._scheduleAiMove();
        }
      }, delay);
      delay += 400;
    });
  }

  // ======================================================
  //  动态难度调节系统 v2.0
  // ======================================================

  /**
   * 根据玩家填数速度动态调整AI速度
   * 玩家快 → AI也加快（更有挑战）
   * 玩家慢 → AI变慢（给玩家喘息）
   */
  _adjustDifficulty() {
    if (!this._difficulty || !this._difficulty.enabled) return;

    const diff = this._difficulty;
    const now = Date.now();

    // 调整间隔限制
    if (now - diff.lastAdjustTime < diff.adjustInterval) return;

    // 需要至少5个样本才能统计
    if (diff.playerMoveTimes.length < 5) return;

    // 计算玩家平均每格耗时
    const times = diff.playerMoveTimes;
    let totalInterval = 0;
    let intervalCount = 0;
    for (let i = 1; i < times.length; i++) {
      totalInterval += times[i].time - times[i - 1].time;
      intervalCount++;
    }
    if (intervalCount === 0) return;

    diff.playerAvgTime = totalInterval / intervalCount;

    // 估算AI的平均每格时间
    // 基于Boss的speedMin/speedMax和棋盘大小修正
    const baseAiTime = (this.opponent.speedMin + this.opponent.speedMax) / 2;
    const currentAiTime = baseAiTime * diff.speedMultiplier;

    // 目标：AI速度 = 玩家速度 * targetRatio
    // targetRatio > 1 表示AI比玩家慢（玩家有优势）
    const targetAiTime = diff.playerAvgTime * diff.targetRatio;

    // 计算需要的倍率
    const targetMultiplier = targetAiTime / baseAiTime;

    // 平滑过渡（每次只调整一部分）
    const delta = (targetMultiplier - diff.speedMultiplier) * diff.smoothFactor;
    diff.speedMultiplier += delta;

    // 限制在合理范围内
    diff.speedMultiplier = Math.max(
      diff.minMultiplier,
      Math.min(diff.maxMultiplier, diff.speedMultiplier)
    );

    diff.lastAdjustTime = now;

    this._log('动态难度调整:',
      '玩家平均:', Math.round(diff.playerAvgTime) + 'ms',
      'AI基准:', Math.round(baseAiTime) + 'ms',
      'AI当前:', Math.round(currentAiTime) + 'ms',
      '倍率:', diff.speedMultiplier.toFixed(2));
  }

  /**
   * 获取当前动态难度下的AI速度倍率
   * @returns {number} 速度倍率
   */
  getSpeedMultiplier() {
    return this._difficulty ? this._difficulty.speedMultiplier : 1.0;
  }

  // ======================================================
  //  多阶段预警系统 v2.0
  // ======================================================

  /**
   * 检查是否触发预警线
   */
  _checkWarningTriggers() {
    if (!this.opponent || !this.opponent.warningLines) return;

    // AI进度：加权得分模式用得分比，否则用格数比
    const aiProgress = this._weightedScoreEnabled
      ? (this.aiScore / this.winScore)
      : (this.aiCount / this.winTarget);
    const tuning = this.opponent?.battleTuning || {};

    // 第一阶段预警（默认60%，杀手数独延后）
    const phase1Threshold = tuning.warningPhase1At || 0.6;
    if (aiProgress >= phase1Threshold && !this._warning60Triggered) {
      this._warning60Triggered = true;
      this._triggerWarningPhase(1);
    }

    // 第二阶段预警 + 必杀技（默认70%，杀手数独延后）
    const phase2Threshold = tuning.warningPhase2At || 0.7;
    if (aiProgress >= phase2Threshold && !this._warning70Triggered) {
      this._warning70Triggered = true;
      this._triggerWarningPhase(2);
    }
  }

  _triggerWarningPhase(phase) {
    const lines = this.opponent.warningLines || [];
    if (lines.length === 0) return;

    // 选对应阶段的台词
    const lineIdx = Math.min(phase - 1, lines.length - 1);
    const line = lines[lineIdx];

    // 红光预警
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(239,68,68,0.3)', duration: 800 + phase * 400 });

    // 显示台词
    this._showBossBubble(line.text, line.emotion || 'stern', 2500);

    // 第2阶段（70%）触发必杀技
    if (phase === 2) {
      const bossId = this.opponent?.id;
      setTimeout(() => {
        if (bossId === 'yan') {
          this._skillGuanJu();
        } else if (bossId === 'cagekeeper') {
          this._skillDingShi();
        } else if (bossId === 'plotter' || bossId === 'setterSecret' || bossId === 'plotterShadow') {
          this._skillQuanTao();
        } else if (bossId === 'remnant') {
          this._skillZhuiXu();
        } else if (bossId === 'weaver') {
          this._skillShiJianHuanLiu();
        } else if (bossId === 'shenmo') {
          this._skillTianDao();
        }
      }, 1500);
    }
  }

  /**
   * 根据Boss ID返回对应的AI性格
   * V4.3.21：四角色人格体系——
   *   薇拉=盲盒莽撞（blind）、山田=资深专家（expert）、伊藤=平衡教学（mentor）、沈墨=沉稳试探（prober）
   */
  _getPersonalityForBoss(bossId) {
    const map = {
      'yingying': 'blind',         // 薇拉：盲盒莽撞（第1章试炼石 Boss）
      'yan': 'expert',             // 山田：资深专家（压迫感强）
      'cagekeeper': 'mentor',      // 伊藤：平衡教学，给玩家留空间
      'plotterShadow': 'surround', // 伊藤·残影：包围型
      'remnant': 'steady',         // 伊藤·补题人：稳健型
      'weaver': 'steady',          // 山田·搜查官：稳健型
      'plotter': 'surround',       // 山田：包围型
      'setterSecret': 'surround',  // 伊藤·终局：包围型
      'shenmo': 'prober',          // 沈墨：沉稳试探，前期慢后期爆发
    };
    return map[bossId] || 'steady';
  }

  // ======================================================
  //  AI 走棋（TechRater 推理驱动）
  // ======================================================

  /**
   * AI走一步（使用AIPlayerCore推理驱动）
   */
  _aiMove() {
    if (!this.active || this.ended) return;
    // V4.3.29：教学暂停期间 AI 不行动
    if (this._paused) {
      this._aiTimer = null;
      return;
    }
    if (this._aiThinking) return;

    this._aiThinking = true;

    // 使用AIPlayerCore推理（如果可用）
    if (this._aiPlayer) {
      this._aiMoveWithRater();
    } else {
      // 降级方案：旧的随机AI
      this._aiMoveLegacy();
    }
  }

  /**
   * 基于TechRater的AI走棋
   */
  _aiMoveWithRater() {
    // 先思考
    const step = this._aiPlayer.think();

    if (!step) {
      // AI找不到可填的了（可能卡住了），用降级方案找一个
      this._warn('AI think returned null, using fallback');
      this._aiThinking = false;
      this._aiMoveLegacy();
      return;
    }

    // 模拟思考时间后再执行
    setTimeout(() => {
      if (!this.active || this.ended) {
        this._aiThinking = false;
        return;
      }

      const applied = this._applyAiMove(step);
      this._aiThinking = false;

      // 安排下一步
      if (this.active && !this.ended) {
        this._scheduleAiMove();
      }
      void applied;
    }, step.thinkTime);
  }

  /**
   * 应用AI走棋到棋盘（公共方法，供走棋/拦截/必杀技共用）
   * @param {Object} step - AI走棋步骤
   * @returns {boolean} 是否成功应用
   */
  _applyAiMove(step) {
    if (!step || !this.active || this.ended) return false;

    // I3（CM4-A2）：笔记步骤——单机路径不再静默丢弃。
    // think() 返回 { type:'note', r, c, nums, isFake, isNote }，无 row/col/num，
    // 原解构会使 row=undefined 而 cells[undefined] 为 undefined 直接 return false。
    if (step.isNote || step.type === 'note') {
      const r = step.r;
      const c = step.c;
      const cell = this._board.cells?.[r]?.[c];
      if (cell && !cell.fixedNum && !cell.fillNum && !cell.isAiFilled) {
        if (step.nums && step.nums.length > 0) {
          if (cell.candidates instanceof Set) {
            cell.candidates = new Set(step.nums);
          } else {
            cell.candidates = step.nums.slice();
          }
          cell._aiNote = true;
        }
      }
      // 回显 AI 笔记动作（可读性：玩家看到 Boss 在"写笔记/骗人"）
      this._emit(BATTLE_EVENTS.BOSS_BUBBLE, {
        text: step.isFake ? '（假笔记）' : '（写笔记）',
        name: this.opponent?.name || 'Boss',
      });
      this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });
      return true;
    }

    const { row, col, num, isMistake, techniqueName } = step;

    // 检查这个格子是否还空着（或可抢夺）
    const cell = this._board.cells[row]?.[col];
    if (!cell) return false;

    const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
    const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
    const isPlayerCell = this.playerOwned[row] && this.playerOwned[row][col];

    // V4.3.34：AI睁眼——允许抢夺玩家已占领的格子（isSteal=true）
    // 固定格不可抢，AI 已占格不可重复占
    if (hasFixed || this.aiOwned[row][col]) {
      return false;
    }
    // 已实填且不是玩家格 → 跳过（非玩家填的实格）
    if (hasFilled && !isPlayerCell) {
      return false;
    }
    const isSteal = isPlayerCell;

    // V4.3.24（Spec v1.3）：AI 锁定关键格 → 异步要塞防守（蓄力，不立即填）
    // 玩家在蓄力期间填入触发招架；不处理则蓄力结束 AI 自动填
    if (this._isHotspot(row, col) && !step.isIntercept && !this._underSiege) {
      this._beginSiege(row, col);
      return false;
    }

    // 红格预警：如果 AI 选的是 gate 分类格子，在填入前触发预警（营造紧张感）
    if (this._weightedScoreEnabled && this._cellCategories) {
      const cat = this._cellCategories[row]?.[col];
      if (cat === 'gate') {
        this._emit(BATTLE_EVENTS.GATE_ALERT, { r: row, c: col, duration: 1500 });
        this._emit(BATTLE_EVENTS.SFX, { name: 'breakthrough', volume: 0.5 });
      }
    }

    // 执行填数
    const correctValue = this.solution[row][col];
    // V4.3.21：对错判定——
    //   盲猜（isGuess）：蒙对了就算对（num===correctValue）
    //   看错行（isMisread）：isMistake=true 时填正确数字在错位格（玩家可捡漏）
    //   普通：isMistake 决定对错
    const isGuess = !!step.isGuess;
    const actuallyCorrect = isGuess ? (num === correctValue) : !isMistake;

    if (actuallyCorrect) {
      // AI填对了：只标记aiOwned，不显示数字（幽灵格效果）
      // V4.3.34：AI睁眼——抢夺玩家格处理
      if (isSteal) {
        cell.fillNum = 0;
        this.playerOwned[row][col] = false;
        this.playerCount--;
        this._compensatePlayerSteal(row, col, true);
      }
      cell.isAiFilled = true;
      cell._aiNum = correctValue;
      this.aiOwned[row][col] = true;
      this.aiCount++;
      // 加权得分：AI增加该格分数
      if (this._weightedScoreEnabled) {
        this.aiScore += this._getCellWeight(row, col);
      }

      // V4.3.23（Spec v1.2）：AI 暴击计分 + 飘字 + 关键格（用 AI 精确技巧等级）
      const isHot = this._isHotspot(row, col);
      const pts = this._calcFillPoints(row, col, step.techLevel != null ? step.techLevel : 1);
      this.aiScore += pts;
      // V4.3.24（Spec v1.3）：AI 专注值评估（抢关键格 +20 / 暴击 +15 / 普通 +3）
      this._onFillFocusEval('ai', row, col, isHot, step.techLevel || 1, false);
      // V4.3.25（Spec v1.4）：AI 走棋后检查假笔记格 → 误导成功
      this._checkMislead(row, col);
      // AI 填关键格时给玩家"被抢占"警示飘字
      if (isHot) {
        this._emit(BATTLE_EVENTS.SCORE_FLOAT, { r: row, c: col, text: '被抢占!', color: '#9ca3af', points: pts });
        // V4.3.23（P2）：AI 抢关键格台词
        this._emit(BATTLE_EVENTS.BOSS_QUIP, { key: 'hotspot_taken' });
      }
      this._maybeRefreshHotspots();

      // 同步AI的推理状态
      if (this._aiPlayer) {
        this._aiPlayer.execute(step);
      }

      this._log(`AI填对${cellTag(row, col)}=${correctValue} 技巧:${techniqueName}`);
    } else {
      // AI填错了：也标记为AI占领（但数字是错的，玩家可以"捡漏"）
      // V4.3.34：AI睁眼——抢夺玩家格处理
      if (isSteal) {
        cell.fillNum = 0;
        this.playerOwned[row][col] = false;
        this.playerCount--;
        this._compensatePlayerSteal(row, col, false);
      }
      // V4.3.20：此前 isMistake 只改标记不改数字（_aiNum 仍是正确值），
      // 导致"AI填错"的格子内容其实是对的，捡漏机制名存实亡——现在真正填错数
      // V4.3.21：看错行（isMisread）用正确数字填错位格；盲猜（isGuess）用猜的数字
      let wrongNum;
      if (step.isMisread || step.isGuess) {
        wrongNum = num;
      } else {
        wrongNum = this._pickWrongNum(row, col, correctValue);
      }
      cell.isAiFilled = true;
      cell._aiNum = wrongNum;
      cell._aiMistake = true;    // 标记：AI填错了
      this.aiOwned[row][col] = true;
      this.aiCount++;
      // 加权得分：AI增加该格分数（填错也算AI占领，后续玩家抢走会扣回）
      if (this._weightedScoreEnabled) {
        this.aiScore += this._getCellWeight(row, col);
      }

      // AI自己以为是对的，同步它的状态
      if (this._aiPlayer) {
        this._aiPlayer.execute(step);
      }

      this._log(`AI填错${cellTag(row, col)}=猜的${wrongNum},正确${correctValue}`);

      // 增加AI失误计数
      this._aiMistakeCount++;

      // AI犯错视觉/台词反馈（偶尔触发，避免太频繁）
      this._onAiMistake(row, col);
    }

    // 触发渲染更新
    this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });

    // 多阶段预警检查
    this._checkWarningTriggers();

    // 检查胜负
    this._checkWin();

    return true;
  }

  /**
   * V4.3.20：AI 填错时选一个错误数字（≠ 正确值，且不与同行/列/宫冲突的固定数字重合）
   * 让"AI 犯错 → 玩家捡漏"机制真实成立
   * @param {number} row
   * @param {number} col
   * @param {number} correctValue - 正确值
   * @returns {number} 错误数字
   * @private
   */
  _pickWrongNum(row, col, correctValue) {
    const size = this.size || 6;
    const candidates = [];
    for (let n = 1; n <= size; n++) {
      if (n === correctValue) continue;
      // 避免选到明显不可能的"离谱"数字：跳过同行/列/宫已有固定数字（可选，增强可信度）
      candidates.push(n);
    }
    if (candidates.length === 0) return correctValue; // 防御：不可能发生
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ======================================================
  //  AI犯错系统 v1.0
  // ======================================================

  /**
   * AI填错时的反馈（台词 + 偶尔自我修正）
   */
  _onAiMistake(row, col) {
    // 30%概率显示犯错台词（避免太频繁）
    if (Math.random() < 0.3) {
      const lines = this._getMistakeLines();
      if (lines.length > 0) {
        const line = lines[Math.floor(Math.random() * lines.length)];
        this._showBossBubble(line, 'thinking', 1800);
      }
    }

    // AI有概率发现自己填错了，过一会儿擦掉重填
    // 不同Boss发现错误的概率不同
    const mistakeChance = this.opponent?.mistakeChance ?? 0.05;
    const selfCorrectChance = Math.min(0.6, mistakeChance * 3); // 最多60%概率自我修正
    if (Math.random() < selfCorrectChance) {
      const correctDelay = 4000 + Math.random() * 5000; // 4~9秒后发现并修正
      setTimeout(() => {
        if (!this.active || this.ended) return;
        const cell = this._board.cells[row]?.[col];
        if (!cell || !cell._aiMistake) return; // 已经被抢或修正了
        if (this.playerOwned[row][col]) return; // 被玩家抢了
        this._selfCorrectMistake(row, col);
      }, correctDelay);
    }
  }

  /**
   * AI自我修正：擦掉错误的，重新填对的
   */
  _selfCorrectMistake(row, col) {
    const cell = this._board.cells[row]?.[col];
    if (!cell || !cell._aiMistake) return;

    this._log(`AI自我修正${cellTag(row, col)}`);

    // 清除旧的错误标记
    cell._aiMistake = false;
    cell._aiNum = this.solution[row][col]; // 改成正确的

    // 触发渲染更新
    this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });

    // 显示修正台词
    const lines = this._getSelfCorrectLines();
    if (lines.length > 0) {
      const line = lines[Math.floor(Math.random() * lines.length)];
      this._showBossBubble(line, 'serious', 1500);
    }
  }

  /**
   * 获取AI犯错台词（不同Boss不同风格）
   */
  _getMistakeLines() {
    const bossId = this.opponent?.id;
    const linesMap = {
      yingying: ['……算岔了。', '这格，我看错了。', '再来。'],
      cagekeeper: ['嗯？似有不妥。', '这一格…再算。', '差矣。'],
      plotter: ['哼，小失误罢了。', '档案里记下这一笔。', '你逃不掉的。'],
      plotterShadow: ['失误…是不可能的。', '哼。'],
      weaver: ['信号偏差。', '重新校准。'],
      remnant: ['……记错了吗。', '……岁月太久了。'],
      setterSecret: ['……', '下一站，我下船。'],
      shenmo: ['……', '失手了。'],
    };
    return linesMap[bossId] || ['……'];
  }

  /**
   * 获取AI自我修正台词
   */
  _getSelfCorrectLines() {
    const bossId = this.opponent?.id;
    const linesMap = {
      yingying: ['……改过来。', '看错了，重来。', '果然是这里。'],
      cagekeeper: ['修正。', '果然如此。', '改之。'],
      plotter: ['档案里，划掉这一笔。', '你看，我又改回来了。', '记错了。'],
      weaver: ['修正完成。', '偏差已补偿。'],
      remnant: ['……想起来了。'],
      setterSecret: ['……嗯。'],
      shenmo: ['……嗯。'],
    };
    return linesMap[bossId] || ['……'];
  }

  // ======================================================
  //  假动作/误导系统（误导型人格专属）
  // ======================================================

  /**
   * 启动假动作系统：每隔一段时间在随机空格子上显示假幽灵格
   * 误导玩家以为AI占领了那些格子
   */
  _startFakeMoveSystem() {
    if (this._fakeMoveTimer) return;

    // 每 6~10 秒来一波假动作
    const scheduleNext = () => {
      if (!this.active || this.ended) return;
      const delay = 6000 + Math.random() * 4000;
      this._fakeMoveTimer = setTimeout(() => {
        if (!this.active || this.ended) return;
        this._doFakeMoves();
        scheduleNext();
      }, delay);
    };

    // 开局5秒后第一次
    this._fakeMoveTimer = setTimeout(() => {
      if (!this.active || this.ended) return;
      this._doFakeMoves();
      scheduleNext();
    }, 5000);
  }

  /**
   * 执行一波假动作：在1~2个格子上显示假幽灵格
   */
  _doFakeMoves() {
    // 找未被占领的空格子
    const candidates = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.aiOwned[r][c] && !this.playerOwned[r][c]) {
          const cell = this._board.cells[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum) {
            candidates.push({ r, c });
          }
        }
      }
    }

    if (candidates.length < 3) return;

    // 随机选1~2个
    const count = Math.random() < 0.6 ? 1 : 2;
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const targets = shuffled.slice(0, count);

    const now = Date.now();
    const duration = 4000 + Math.random() * 3000; // 假格持续4~7秒

    targets.forEach(t => {
      // 检查是否已经有假动作在这格
      const existing = this._fakeMoves.find(f => f.r === t.r && f.c === t.c);
      if (!existing) {
        this._fakeMoves.push({
          r: t.r,
          c: t.c,
          expireTime: now + duration,
          phase: 'in', // 'in' 渐入 / 'out' 渐出
        });
      }
    });

    this._log('假动作', count, '格');

    // 触发渲染
    this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });

    // 设置过期清理
    setTimeout(() => {
      this._cleanupExpiredFakeMoves();
    }, duration + 500);
  }

  /**
   * 清理过期的假动作
   */
  _cleanupExpiredFakeMoves() {
    const now = Date.now();
    const before = this._fakeMoves.length;
    this._fakeMoves = this._fakeMoves.filter(f => f.expireTime > now);
    if (this._fakeMoves.length !== before) {
      this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });
    }
  }

  /**
   * 获取当前活跃的假动作列表（供渲染器使用）
   */
  getFakeMoves() {
    this._cleanupExpiredFakeMoves();
    return this._fakeMoves;
  }

  /**
   * 旧版AI走棋（降级方案：随机选空格）
   */
  _aiMoveLegacy() {
    // 找一个空格（优先找玩家附近的格子制造压迫感）
    const candidates = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;
        const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
        const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
        if (!hasFixed && !hasFilled && !this.aiOwned[r][c] && !this.playerOwned[r][c]) {
          let dist = 999;
          for (let pr = 0; pr < this.size; pr++) {
            for (let pc = 0; pc < this.size; pc++) {
              if (this.playerOwned[pr][pc]) {
                const d = Math.abs(r - pr) + Math.abs(c - pc);
                if (d < dist) dist = d;
              }
            }
          }
          candidates.push({ r, c, dist });
        }
      }
    }

    if (candidates.length === 0) {
      this._endBattle('draw');
      return;
    }

    // 按距离排序，选最近的（60%概率）或随机（40%概率）
    let chosen;
    if (Math.random() < 0.6) {
      candidates.sort((a, b) => a.dist - b.dist);
      const topN = Math.min(5, candidates.length);
      chosen = candidates[Math.floor(Math.random() * topN)];
    } else {
      chosen = candidates[Math.floor(Math.random() * candidates.length)];
    }

    // 检查是否出错
    const isMistake = Math.random() < this.opponent.mistakeChance;
    const correctValue = this.solution[chosen.r][chosen.c];

    // V4.3.20：降级路径也真正填错数（此前 isMistake 时直接跳步，既不真实也无捡漏机会）
    const fillNum = isMistake ? this._pickWrongNum(chosen.r, chosen.c, correctValue) : correctValue;
    {
      const cell = this._board.cells[chosen.r][chosen.c];
      if (cell) {
        cell.isAiFilled = true;
        cell._aiNum = fillNum;
        if (isMistake) cell._aiMistake = true;
      }
      this.aiOwned[chosen.r][chosen.c] = true;
      this.aiCount++;
      // 加权得分：AI增加该格分数
      if (this._weightedScoreEnabled) {
        this.aiScore += this._getCellWeight(chosen.r, chosen.c);
      }

      this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });

      const aiProgress = this._weightedScoreEnabled
        ? (this.aiScore / this.winScore)
        : (this.aiCount / this.winTarget);
      if (aiProgress >= 0.6 && !this._warningTriggered) {
        this._warningTriggered = true;
        this._triggerWarning();
      }

      this._checkWin();
    }

    this._aiThinking = false;
    this._scheduleAiMove();
  }

  /**
   * 更新三幕节奏参数
   * 根据进度百分比调整 AI 速度、提示冷却、连击倍率
   * @param {number} progress - 进度百分比 0-100
   */
  _updateThreeAct(progress) {
    const p = Math.max(0, Math.min(100, progress));
    this._threeActProgress = p;
    
    let newAct;
    if (p < 30) newAct = 1;
    else if (p < 70) newAct = 2;
    else newAct = 3;
    
    if (newAct === this._threeAct) return;
    
    this._threeAct = newAct;
    const ACT_PARAMS = {
      1: { aiSpeed: 0.7, hintCooldown: 0.8, comboMultiplier: 1.2 },
      2: { aiSpeed: 1.0, hintCooldown: 1.0, comboMultiplier: 1.0 },
      3: { aiSpeed: 1.4, hintCooldown: 1.5, comboMultiplier: 1.5 },
    };
    this._threeActParams = Object.assign({}, ACT_PARAMS[newAct]);
    
    this._log('三幕切换:', 'Act', this._threeAct, '进度', p.toFixed(0) + '%',
      '参数:', JSON.stringify(this._threeActParams));
  }

  /**
   * 暂停/恢复 AI（V4.3.29：教学期间暂停 boss，教学结束后恢复）
   * @param {boolean} paused
   */
  setPaused(paused) {
    this._paused = !!paused;
    if (this._paused) {
      if (this._aiTimer) {
        clearTimeout(this._aiTimer);
        this._aiTimer = null;
      }
      if (this._aiThinking && this._aiTimer) {
        clearTimeout(this._aiTimer);
        this._aiTimer = null;
      }
    } else if (this.active && !this.ended && this._aiTimer === null && !this._aiThinking) {
      // 恢复：重新安排 AI 行动
      this._scheduleAiMove();
    }
  }

  /**
   * 是否暂停中
   * @returns {boolean}
   */
  isPaused() {
    return !!this._paused;
  }

  /**
   * 安排AI下一步
   */
  _scheduleAiMove() {
    if (!this.active || this.ended) return;
    // V4.3.29：教学暂停期间不排程 AI
    if (this._paused) return;

    const { speedMin, speedMax } = this.opponent;
    const baseDelay = speedMin + Math.random() * (speedMax - speedMin);

    // 三幕节奏引擎：三幕进度驱动的 AI 速度曲线
    const progress = this.aiCount / this.totalEmpty;
    this._updateThreeAct(progress * 100);
    // 三幕节奏：aiSpeed 是速度，delay = 1/aiSpeed
    // Act 1: aiSpeed=0.7 → delay 1.43× (慢)
    // Act 2: aiSpeed=1.0 → delay 1.0×  (正常)
    // Act 3: aiSpeed=1.4 → delay 0.71× (快)
    const speedMul = 1 / this._threeActParams.aiSpeed;

    // 棋盘大小自适应：小棋盘格子少，AI需要更快才能形成竞速压力
    // 4x4: 0.38x（约2.3-4.2秒/格），6x6: 0.65x（约3.9-7.2秒/格），9x9: 1x
    const sizeMul = this.size <= 4 ? 0.38 : (this.size <= 6 ? 0.65 : 1.0);

    // 动态难度倍率：根据玩家速度实时调整
    const dynMul = this.getSpeedMultiplier();

    const delay = baseDelay * speedMul * sizeMul * dynMul;

    // 拦截冷却递减
    if (this._interceptCooldown > 0) {
      this._interceptCooldown = Math.max(0, this._interceptCooldown - delay);
    }

    this._aiTimer = setTimeout(() => {
      this._aiMove();
    }, delay);
  }

  /**
   * 获取当前三幕参数
   * @returns {{ act: number, progress: number, params: { aiSpeed: number, hintCooldown: number, comboMultiplier: number } }}
   */
  getThreeActState() {
    return {
      act: this._threeAct,
      progress: this._threeActProgress,
      params: Object.assign({}, this._threeActParams),
    };
  }

  /**
   * 触发预警
   */
  _triggerWarning() {
    // 显示预警边缘红光效果
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, { color: 'rgba(239,68,68,0.3)', duration: 2000 });

    // 播放Boss台词
    if (this.opponent.warningLines && this.opponent.warningLines.length > 0) {
      const line = this.opponent.warningLines[Math.floor(Math.random() * this.opponent.warningLines.length)];
      this._showBossBubble(line.text, line.emotion);
    }

    // 音效
    this._emit(BATTLE_EVENTS.SFX, { name: 'eureka' });
  }

  // ======================================================
  //  事件队列系统（气泡/覆盖层/连击 串行播放）
  //  DOM 操作已移除：每个事件在播放时通过 onEvent 转发给 UI 层
  // ======================================================

  /**
   * 显示Boss对话气泡
   */
  _showBossBubble(text, emotion) {
    // 使用事件队列播放气泡台词（默认优先级：普通台词=2）
    this._queueEvent({
      type: 'bubble',
      priority: this.constructor.EVENT_PRIORITY.INTERCEPT_LINE,
      duration: 3000,
      data: { text, emotion },
    });
  }

  /**
   * 播放高优先级台词（预警/必杀等）
   */
  _showBossBubbleHigh(text, emotion, priorityLevel) {
    this._queueEvent({
      type: 'bubble',
      priority: priorityLevel || this.constructor.EVENT_PRIORITY.WARNING_LINE,
      duration: 2500,
      data: { text, emotion },
    });
  }

  /**
   * 事件队列：入队
   */
  _queueEvent(event) {
    if (!this.active && event.priority < this.constructor.EVENT_PRIORITY.END_BATTLE) return;

    this._events.push(event);
    // 按优先级排序（高优先级在前）
    this._events.sort((a, b) => b.priority - a.priority);

    // 如果没在播放，立即开始
    if (!this._eventPlaying) {
      this._playNextEvent();
    }
  }

  /**
   * 事件队列：播放下一个
   */
  _playNextEvent() {
    if (this._events.length === 0) {
      this._eventPlaying = false;
      return;
    }

    this._eventPlaying = true;
    const event = this._events.shift();

    switch (event.type) {
      case 'bubble':
        this._playBubbleEvent(event);
        break;
      case 'overlay':
        this._playOverlayEvent(event);
        break;
      case 'combo':
        this._playComboEvent(event);
        break;
      default:
        // 未知事件，直接跳过
        setTimeout(() => this._playNextEvent(), 100);
        break;
    }
  }

  /**
   * 播放气泡台词事件（转发给 UI 层）
   */
  _playBubbleEvent(event) {
    const { text, emotion } = event.data;
    this._emit(BATTLE_EVENTS.BOSS_BUBBLE, {
      text,
      emotion,
      name: this.opponent?.name || '',
      color: this.opponent?.color || '#ffffff',
    });

    const duration = event.duration || 3000;
    this._eventTimer = setTimeout(() => {
      this._playNextEvent();
    }, duration);
  }

  /**
   * 播放覆盖层事件（预警红光等，转发给 UI 层）
   */
  _playOverlayEvent(event) {
    const color = event.data?.color || 'rgba(239,68,68,0.3)';
    this._emit(BATTLE_EVENTS.WARNING_OVERLAY, {
      color,
      duration: event.duration || 1000,
    });

    const duration = event.duration || 1000;
    this._eventTimer = setTimeout(() => {
      this._playNextEvent();
    }, duration);
  }

  /**
   * 播放连击事件（独立浮动显示，不阻塞其他事件）
   */
  _playComboEvent(event) {
    this._emit(BATTLE_EVENTS.COMBO_FLOATING, event.data);
    setTimeout(() => this._playNextEvent(), 200);
  }

  /**
   * 清空事件队列（战斗结束时调用）
   */
  _clearEventQueue() {
    this._events = [];
    this._eventPlaying = false;
    if (this._eventTimer) {
      clearTimeout(this._eventTimer);
      this._eventTimer = null;
    }
  }

  // ======================================================
  //  三色加权得分系统
  // ======================================================

  /**
   * 初始化三色加权得分系统
   * 使用 TechRaterAdapter 生成初始 heatmap，保存每个空格的分类
   * 如果 TechRaterAdapter 不可用，回退到原始格子数计数方式
   * @param {Board} board - 棋盘实例
   */
  _initWeightedScoreSystem(board) {
    // 重置状态
    this._weightedScoreEnabled = false;
    this._cellCategories = null;
    this.playerScore = 0;
    this.aiScore = 0;
    this.maxScore = 0;
    this.winScore = 0;

    // 检查 TechRaterAdapter 是否可用（注入优先，其次全局）
    const AdapterClass = this._adapterClass
      || (typeof globalThis.TechRaterAdapter !== 'undefined' ? globalThis.TechRaterAdapter : null);

    if (!AdapterClass) {
      this._log('TechRaterAdapter 不可用，使用原始格子数计数');
      return;
    }

    try {
      // 创建适配器并生成 heatmap
      const adapter = new AdapterClass(board);
      const heatmap = adapter.generateHeatmap();

      if (!heatmap || !heatmap.gridMeta || heatmap.status === 'invalid') {
        this._log('Heatmap 生成失败，回退到原始计数');
        return;
      }

      // 构建 _cellCategories：只存初始空白格的分类
      this._cellCategories = [];
      let totalScore = 0;

      for (let r = 0; r < this.size; r++) {
        this._cellCategories[r] = [];
        for (let c = 0; c < this.size; c++) {
          const meta = heatmap.gridMeta[r]?.[c];
          if (meta && meta.category && meta.category !== 'filled') {
            // 空格子：保存分类
            const cat = meta.category; // 'simple' | 'core' | 'gate'
            this._cellCategories[r][c] = cat;
            // 累加满分
            const weight = this.constructor.SCORE_WEIGHTS[cat] || 1;
            totalScore += weight;
          } else {
            // 已填格或无数据：不存分类（null 表示非初始空格）
            this._cellCategories[r][c] = null;
          }
        }
      }

      // 设置满分和胜利分数
      this.maxScore = totalScore;
      this.winScore = totalScore * 0.75;

      // 启用加权得分
      this._weightedScoreEnabled = true;

      // 统计各类格子数量
      let simpleCount = 0, coreCount = 0, gateCount = 0;
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const cat = this._cellCategories[r][c];
          if (cat === 'simple') simpleCount++;
          else if (cat === 'core') coreCount++;
          else if (cat === 'gate') gateCount++;
        }
      }

      this._log('三色加权得分系统已启用',
        'simple:', simpleCount,
        'core:', coreCount,
        'gate:', gateCount,
        'maxScore:', this.maxScore,
        'winScore:', this.winScore.toFixed(2));

    } catch (e) {
      this._error('初始化加权得分系统失败:', e);
      this._weightedScoreEnabled = false;
      this._cellCategories = null;
    }
  }

  /**
   * 获取指定格子的分类权重分
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {number} 权重分数（simple=1, core=1.5, gate=2，未知默认为1）
   */
  _getCellWeight(r, c) {
    if (!this._weightedScoreEnabled || !this._cellCategories) return 1;
    const cat = this._cellCategories[r]?.[c];
    return this.constructor.SCORE_WEIGHTS[cat] || 1;
  }

  // ======================================================
  //  关键格（Hotspot）+ 暴击计分（V4.3.23 / Spec v1.2）
  // ======================================================

  /**
   * 开局初始化关键格：取影响力 Top5 随机选 2 个
   */
  _initHotspots() {
    this._hotspots = [];
    this._hotspotPhase = 1;
    const picks = this._pickHotspotCandidates();
    const count = Math.min(this._hotspotInitialCount, picks.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * picks.length);
      this._hotspots.push(picks.splice(idx, 1)[0]);
    }
  }

  /**
   * 中期刷新关键格（初始关键格全填完 或 进度≥50%）
   */
  _refreshHotspots() {
    const picks = this._pickHotspotCandidates();
    this._hotspots = [];
    const count = Math.min(2, picks.length);
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * picks.length);
      this._hotspots.push(picks.splice(idx, 1)[0]);
    }
    this._hotspotPhase++;
    if (this._hotspots.length > 0) {
      this._emit(BATTLE_EVENTS.HOTSPOT_REFRESH, {
        hotspots: this._hotspots.slice(),
        phase: this._hotspotPhase,
      });
    }
  }

  /**
   * 从 TechRater 影响力 Top5 中取候选（空格）
   */
  _pickHotspotCandidates() {
    const rater = this._aiPlayer && this._aiPlayer.getRater();
    if (!rater || typeof rater.getInfluenceMap !== 'function') return [];
    const map = rater.getInfluenceMap();
    const top5 = map.slice(0, 5);
    // 只保留仍为空的格
    return top5.filter((h) => {
      const cell = this._board.cells[h.row]?.[h.col];
      if (!cell) return false;
      const hasFixed = typeof cell.fixedNum === 'number' && cell.fixedNum > 0;
      const hasFilled = typeof cell.fillNum === 'number' && cell.fillNum > 0;
      return !hasFixed && !hasFilled;
    }).map((h) => ({ r: h.row, c: h.col }));
  }

  _isHotspot(r, c) {
    return this._hotspots.some((h) => h.r === r && h.c === c);
  }

  /**
   * 每次填数后检查是否需要刷新关键格
   */
  _maybeRefreshHotspots() {
    if (this._hotspotPhase >= 2) return; // 最多刷新一次（两阶段）
    const allFilled = this._hotspots.every((h) => {
      const cell = this._board.cells[h.r]?.[h.col];
      return cell && (cell.fillNum > 0 || this.playerOwned[h.r][h.col] || this.aiOwned[h.r][h.col]);
    });
    const progress = (this.playerCount + this.aiCount) / Math.max(this.totalEmpty, 1);
    if (allFilled || progress >= 0.5) {
      this._refreshHotspots();
    }
  }

  /**
   * 计算填某格的得分（暴击计分，上限 4 分）
   * 普通格：基础 1 + 高阶技巧(≥4 级 +1 / ≥7 级 +2)
   * 关键格：基础 3（普通格的 3 倍）+ 高阶技巧(≥7 级 +1，叠到上限 4)
   * @param {number} r
   * @param {number} c
   * @param {number|null} techLevel - AI 侧精确技巧等级；玩家侧传 null 用代理
   */
  _calcFillPoints(r, c, techLevel) {
    const isHot = this._isHotspot(r, c);
    let pts = isHot ? 3 : 1; // 关键格 3 倍基础分
    const lv = (techLevel != null) ? techLevel : this._estimatePlayerTechLevel(r, c);
    if (lv >= 7) pts += 1;
    else if (lv >= 4 && !isHot) pts += 1; // 关键格已达 3 分，高阶技巧仅在普通格再加
    return Math.min(pts, 4);
  }

  /**
   * 玩家侧技巧等级代理：用填格后保留的 eliminations（排除数）估算该格经历了多少推导
   */
  _estimatePlayerTechLevel(r, c) {
    const cell = this._board.cells[r]?.[c];
    const elim = cell && cell.eliminations ? cell.eliminations.size : 0;
    if (elim >= 10) return 7;
    if (elim >= 6) return 5;
    if (elim >= 3) return 3;
    return 1;
  }

  /**
   * 填格得分飘字（转发给 UI）
   */
  _emitScoreFloat(r, c, points, hotspot) {
    let text = '+' + points;
    let color = '#7f96b5'; // 普通：浅蓝墨（P3）
    if (points >= 4) { text = '+' + points + ' 暴击!'; color = '#7d6a9e'; }
    else if (points >= 3 && hotspot) { text = '+3 抢占要塞!'; color = '#d4a853'; }
    else if (points >= 3) { text = '+' + points + ' 暴击!'; color = '#8e2c21'; }
    this._lastFillPoints = { r, c, points, text, color };
    this._emit(BATTLE_EVENTS.SCORE_FLOAT, { r, c, text, color, points });
  }

  // ======================================================
  //  专注值（Posture）+ 忍杀 + 异步要塞防守（V4.3.24 / Spec v1.3）
  // ======================================================

  /**
   * 增加专注值（0-100），满 100 触发忍杀
   * @param {'player'|'ai'} side
   * @param {number} amount
   * @param {string} source - 事件来源（debug/日志）
   */
  _addFocus(side, amount, source) {
    if (!this.active || this.ended) return;
    if (this._deathblowAnimating) return; // 忍杀演出中不累积
    const before = this._focus[side];
    this._focus[side] = Math.max(0, Math.min(100, before + amount));
    // 注：idle 计数由 _onFillFocusEval 管理（衰减判定），此处不重置
    this._emit(BATTLE_EVENTS.FOCUS_UPDATE, {
      player: this._focus.player,
      ai: this._focus.ai,
      side: side,
      delta: this._focus[side] - before,
      source: source || '',
    });
    if (this._focus[side] >= 100) {
      this._triggerDeathblow(side);
    }
  }

  /**
   * 填数后的专注值统一评估（双方对称规则）
   * 普通填数 +3（基础收益，始终给）；抢关键格 +20 / Counter +25 / 暴击(≥4级) +15 叠加
   * 连续 3 步无专注事件后，每步额外 -5（衰减）
   * @param {'player'|'ai'} side
   * @param {number} r
   * @param {number} c
   * @param {boolean} isHot - 是否关键格
   * @param {number} techLevel - AI 精确等级 / 玩家代理等级
   * @param {boolean} wasCounter - 是否看破（仅玩家触发）
   */
  _onFillFocusEval(side, r, c, isHot, techLevel, wasCounter) {
    if (!this.active || this.ended) return;
    let bonus = 0;        // 事件额外加分（基础 3 之上叠加）
    let source = 'normal';
    if (wasCounter) { bonus = 22; source = 'counter'; }   // 3+22=25
    else if (isHot) { bonus = 17; source = 'hotspot'; }   // 3+17=20
    else if (techLevel >= 4) { bonus = 12; source = 'crit'; } // 3+12=15

    // 基础收益：普通填数也累积，避免"只有高手才能忍杀"
    // V4.3.32：专注基础收益可配置（扫参用），默认 3，经 options.focusGain 覆盖
    const baseGain = (typeof this._options.focusGain === 'number') ? this._options.focusGain : (this.opponent?.battleTuning?.focusGain ?? 3);
    this._addFocus(side, baseGain, source);
    if (bonus > 0) {
      this._focusIdle[side] = 0;
      this._addFocus(side, bonus, source);
    } else {
      // 无专注事件：闲置步数累加，超过 3 步开始衰减 -5/步
      this._focusIdle[side]++;
      if (this._focusIdle[side] > 3 && this._focus[side] > 0) {
        this._addFocus(side, -5, 'decay');
      }
    }
  }

  // ---- V4.3.34：AI睁眼——玩家被抢格补偿 ----

  /**
   * AI 抢夺玩家格后给予补偿
   * @param {number} r
   * @param {number} c
   * @param {boolean} aiCorrect - AI 是否填对（抢夺成功）
   */
  _compensatePlayerSteal(r, c, aiCorrect) {
    if (!this.active || this.ended) return;
    // 补偿专注值：AI正确抢 +10、AI填错 +5（玩家捡漏机会）
    const focusBonus = aiCorrect ? 10 : 5;
    this._addFocus('player', focusBonus, 'steal_compensation');
    // 重置玩家闲置计数（防止衰减）
    this._focusIdle.player = 0;
    this._log(`玩家补偿: 被抢格(${cellTag(r, c)}) 专注+${focusBonus}`);
    // 广播补偿事件（UI 飘字）
    this._emit(BATTLE_EVENTS.SCORE_FLOAT, {
      r: -1, c: -1,
      text: `被抢补偿 +${focusBonus}专注`,
      color: '#d4a853',   // P3：黄铜
      points: focusBonus,
    });
  }

  /**
   * 触发忍杀：专注值满 100 的爆发
   * @param {'player'|'ai'} side
   */
  _triggerDeathblow(side) {
    if (!this.active || this.ended || this._deathblowAnimating) return;
    this._deathblowAnimating = true;

    const isPlayer = side === 'player';
    const duration = isPlayer ? 3500 + Math.floor(Math.random() * 1500) : 2500; // 玩家忍杀：AI 瘫痪 3.5-5s；AI 忍杀：玩家 2.5s
    this._log('忍杀触发!', side, duration + 'ms');

    // 触发方专注归零
    this._focus[side] = 0;
    this._focusIdle[side] = 0;

    // 广播忍杀事件（UI 全屏特效 + 台词）
    this._emit(BATTLE_EVENTS.DEATHBLOW, { side: side, duration: duration });
    this._emit(BATTLE_EVENTS.BOSS_QUIP, { key: 'deathblow' });

    if (isPlayer) {
      // 玩家忍杀：AI 瘫痪（复用震慑通道，阻止 AI 走棋）
      this._stunAI(duration);
    } else {
      // AI 忍杀：玩家被震慑（禁止填数），AI 抢回玩家错格
      this._stunPlayer(duration);
      this._cleanupPlayerMistakes();
    }

    // 忍杀演出结束后恢复累积
    setTimeout(() => {
      this._deathblowAnimating = false;
    }, 800);
  }

  /**
   * 震慑 AI（复用连击震慑通道：暂停 AI 走棋计时器）
   * @param {number} duration ms
   */
  _stunAI(duration) {
    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }
    if (!this._combo.stunActive) {
      this._combo.stunActive = true;
      this._log('忍杀震慑AI', duration + 'ms');
      if (duration > this._maxStunTime) this._maxStunTime = duration;
      setTimeout(() => {
        if (!this.active || this.ended) return;
        this._combo.stunActive = false;
        if (!this._aiThinking) this._scheduleAiMove();
      }, duration);
    }
  }

  /**
   * 震慑玩家：忍杀期间禁止玩家填数
   * @param {number} duration ms
   */
  _stunPlayer(duration) {
    this._playerStunned = true;
    setTimeout(() => {
      this._playerStunned = false;
      // 玩家震慑结束提示
      this._emit(BATTLE_EVENTS.SFX, { name: 'click' });
    }, duration);
  }

  /**
   * AI 忍杀玩家时：抢回玩家填错的格子（等价于 AI 的看破，规则对称）
   */
  _cleanupPlayerMistakes() {
    if (!this._board || !this.solution) return;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (!this.playerOwned[r][c]) continue;
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;
        const correct = this.solution[r]?.[c];
        if (cell.fillNum && correct && cell.fillNum !== correct) {
          // AI 抢回：清除玩家错误填数
          cell.fillNum = null;
          cell.isAiFilled = true;
          cell._aiNum = correct;
          cell._aiMistake = true;
          this.playerOwned[r][c] = false;
          this.playerCount = Math.max(0, this.playerCount - 1);
          this.aiOwned[r][c] = true;
          this.aiCount++;
        }
      }
    }
  }

  /**
   * AI 锁定关键格：异步要塞防守（蓄力 5-8s）
   * 蓄力期间玩家填入该格 → 招架（AI 专注 -20）；不处理 → 蓄力结束 AI 自动填
   * @param {number} r
   * @param {number} c
   */
  _beginSiege(r, c) {
    if (!this.active || this.ended) return;
    if (this._underSiege) return; // 已有蓄力进行中
    if (this.playerOwned[r][c] || this.aiOwned[r][c]) return;

    const pers = this._aiPlayer && this._aiPlayer.getPersonality();
    const duration = (pers && pers.siegeTime) || 6000;
    this._underSiege = { r: r, c: c, side: 'ai', duration: duration, timer: null };
    this._emit(BATTLE_EVENTS.SIEGE_START, { r: r, c: c, duration: duration });

    // 蓄力结束：AI 自动填入该格（视为 AI 抢到关键格）
    this._underSiege.timer = setTimeout(() => {
      const siege = this._underSiege;
      if (!siege || siege.r !== r || siege.c !== c) return;
      this._underSiege = null;
      this._completeSiege(r, c);
    }, duration);
  }

  /**
   * 蓄力结束：AI 自动填关键格
   */
  _completeSiege(r, c) {
    if (this.playerOwned[r][c] || this.aiOwned[r][c]) {
      this._emit(BATTLE_EVENTS.SIEGE_END, { r: r, c: c, result: 'cancelled' });
      return;
    }
    // AI 填该关键格
    const cell = this._board.cells[r]?.[c];
    const correct = this.solution?.[r]?.[c];
    if (!cell || !correct) {
      this._emit(BATTLE_EVENTS.SIEGE_END, { r: r, c: c, result: 'cancelled' });
      return;
    }
    cell.isAiFilled = true;
    cell._aiNum = correct;
    this.aiOwned[r][c] = true;
    this.aiCount++;
    this._addFocus('ai', 20, 'siege_auto'); // AI 抢到关键格
    this._emit(BATTLE_EVENTS.SCORE_FLOAT, { r: r, c: c, text: '被抢占!', color: '#9ca3af', points: 3 });
    this._emit(BATTLE_EVENTS.SIEGE_END, { r: r, c: c, result: 'auto' });
    this._emit(BATTLE_EVENTS.BOSS_QUIP, { key: 'siege_auto' });
    // AI 推理状态同步（保持 rater 与盘面一致）
    if (this._aiPlayer && typeof this._aiPlayer.execute === 'function') {
      try { this._aiPlayer.execute({ row: r, col: c, num: correct }); } catch (e) {}
    }
    this._maybeRefreshHotspots();
    // V4.3.26：修复方法名——原本误调用不存在的 _checkWinCondition，导致蓄力完成时抛 TypeError
    this._checkWin();
  }

  /**
   * 玩家在蓄力期间填入该格 → 招架
   * @param {number} r
   * @param {number} c
   * @returns {boolean} 是否招架成功
   */
  _onParry(r, c) {
    if (!this._underSiege) return false;
    if (this._underSiege.r !== r || this._underSiege.c !== c) return false;
    if (this._underSiege.timer) clearTimeout(this._underSiege.timer);
    this._underSiege = null;
    // AI 专注 -20
    this._addFocus('ai', -20, 'parry');
    this._emit(BATTLE_EVENTS.PARRY, { r: r, c: c });
    this._emit(BATTLE_EVENTS.SIEGE_END, { r: r, c: c, result: 'parried' });
    this._emit(BATTLE_EVENTS.BOSS_QUIP, { key: 'parry' });
    return true;
  }

  /**
   * 供 UI 轮询：双方专注值
   * @returns {{player:number, ai:number, playerStunned:boolean}}
   */
  getFocus() {
    return {
      player: this._focus.player || 0,
      ai: this._focus.ai || 0,
      playerStunned: !!this._playerStunned,
    };
  }

  // ======================================================
  //  笔记心理战（V4.3.25 / Spec v1.4）
  // ======================================================

  /**
   * 玩家笔记变化回调（由 UI 层 handleNoteToggle / handleErase 调用）
   * @param {number} r
   * @param {number} c
   * @param {number|null} num - 操作的数字（清除时可为 null）
   * @param {boolean} isAdd - true=写入笔记 false=删除笔记
   */
  onNoteChanged(r, c, num, isAdd) {
    if (!this.active || this.ended) return;
    const cell = this._board.cells?.[r]?.[c];
    if (!cell) return;
    let notes;
    if (cell.candidates instanceof Set) notes = Array.from(cell.candidates);
    else if (Array.isArray(cell.candidates)) notes = cell.candidates.slice();
    else notes = [];
    const key = r + ',' + c;

    if (isAdd && typeof num === 'number') {
      // 写假笔记（不可能候选）→ 触发 AI 台词（限频）
      if (this._isCellNoteImpossible(r, c, num)) {
        this._fakeNoteCells.add(key);
        const now = Date.now();
        if (now - this._lastNoteEventTs > 2500) {
          this._lastNoteEventTs = now;
          this._emit(BATTLE_EVENTS.NOTE_FAKE, { r, c, num });
        }
      }
    } else {
      // 删除笔记：若该格笔记已清空 → 记入"声东击西"伏笔
      if (notes.length === 0) {
        this._noteClearedSet.add(key);
        this._fakeNoteCells.delete(key);
      }
    }
  }

  /**
   * 该格某数字是否为"不可能候选"（盘面行/列/宫已有 → 假笔记信号）
   */
  _isCellNoteImpossible(r, c, num) {
    const board = this._board;
    if (!board) return false;
    const hasNum = (rr, cc) => {
      const cell = board.cells?.[rr]?.[cc];
      if (!cell) return false;
      return (cell.fillNum === num) || (cell.fixedNum === num);
    };
    for (let i = 0; i < this.size; i++) {
      if (hasNum(r, i) || hasNum(i, c)) return true;
    }
    const bs = Math.round(Math.sqrt(this.size));
    const br = Math.floor(r / bs) * bs;
    const bc = Math.floor(c / bs) * bs;
    for (let dr = 0; dr < bs; dr++) {
      for (let dc = 0; dc < bs; dc++) {
        if (hasNum(br + dr, bc + dc)) return true;
      }
    }
    return false;
  }

  /**
   * AI 走棋后检查：存在空着的假笔记格且 AI 填了别处 → 误导成功
   * @param {number} aiRow - AI 实际填的行
   * @param {number} aiCol - AI 实际填的列
   */
  _checkMislead(aiRow, aiCol) {
    if (this._fakeNoteCells.size === 0) return;
    const now = Date.now();
    if (now - this._lastNoteEventTs < 3000) return;
    // 找一个仍为空的假笔记格（AI 没去抢它，说明被误导）
    let misled = null;
    for (const key of this._fakeNoteCells) {
      const [rr, cc] = key.split(',').map(Number);
      const cell = this._board.cells?.[rr]?.[cc];
      const hasFill = cell && (cell.fillNum || cell.isAiFilled);
      const owned = this.playerOwned[rr][cc] || this.aiOwned[rr][cc];
      if (!hasFill && !owned) { misled = { r: rr, c: cc }; break; }
    }
    if (misled && (misled.r !== aiRow || misled.c !== aiCol)) {
      this._lastNoteEventTs = now;
      this._emit(BATTLE_EVENTS.NOTE_MISLEAD, misled);
    }
  }

  /**
   * 供 UI 渲染：AI 注意力图（'r,c' -> 1/2）
   * @returns {Array<{r:number,c:number,level:number}>}
   */
  getAiAttention() {
    const map = this._aiPlayer && this._aiPlayer.getNoteAttentionMap();
    if (!map || map.size === 0) return [];
    const list = [];
    for (const [key, level] of map) {
      const [r, c] = key.split(',').map(Number);
      list.push({ r, c, level });
    }
    return list;
  }

  // ======================================================
  //  三色加权得分 - 公共API
  // ======================================================

  /**
   * 获取玩家加权得分
   * @returns {number} 玩家当前加权得分
   */
  getPlayerScore() {
    if (this._weightedScoreEnabled) {
      return this.playerScore;
    }
    // 向后兼容：未启用时返回格子数
    return this.playerCount;
  }

  /**
   * 获取AI加权得分
   * @returns {number} AI当前加权得分
   */
  getAiScore() {
    if (this._weightedScoreEnabled) {
      return this.aiScore;
    }
    // 向后兼容：未启用时返回格子数
    return this.aiCount;
  }

  /**
   * 获取满分（所有空格加权分总和）
   * @returns {number} 满分
   */
  getMaxScore() {
    if (this._weightedScoreEnabled) {
      return this.maxScore;
    }
    // 向后兼容：未启用时返回总空格数
    return this.totalEmpty;
  }

  /**
   * 获取胜利所需分数
   * @returns {number} 胜利分数
   */
  getWinScore() {
    if (this._weightedScoreEnabled) {
      return this.winScore;
    }
    // 向后兼容：未启用时返回胜利目标格数
    return this.winTarget;
  }

  /**
   * 获取完整的得分进度信息
   * @returns {Object} 进度对象
   *   - playerScore: 玩家加权得分
   *   - aiScore: AI加权得分
   *   - maxScore: 满分
   *   - winScore: 胜利分数
   *   - playerPercent: 玩家进度百分比（0~1）
   *   - aiPercent: AI进度百分比（0~1）
   */
  getScoreProgress() {
    if (this._weightedScoreEnabled && this.maxScore > 0) {
      return {
        playerScore: this.playerScore,
        aiScore: this.aiScore,
        maxScore: this.maxScore,
        winScore: this.winScore,
        playerPercent: this.playerScore / this.maxScore,
        aiPercent: this.aiScore / this.maxScore,
      };
    }
    // 向后兼容：未启用时按格子数计算
    const max = this.totalEmpty || 1;
    return {
      playerScore: this.playerCount,
      aiScore: this.aiCount,
      maxScore: this.totalEmpty,
      winScore: this.winTarget,
      playerPercent: this.playerCount / max,
      aiPercent: this.aiCount / max,
    };
  }

  /**
   * V4.3.23（Spec v1.2）：斩杀线检测——任何一方距胜利 ≤2 格
   * @returns {boolean}
   */
  isKillLine() {
    if (!this.active || this.ended) return false;
    return (this.winTarget - this.playerCount <= 2) || (this.winTarget - this.aiCount <= 2);
  }

  /**
   * 获取指定格子的分类
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {string|null} 'simple'|'core'|'gate'|null（已填格或无数据）
   */
  getCellCategory(r, c) {
    if (!this._weightedScoreEnabled || !this._cellCategories) return null;
    return this._cellCategories[r]?.[c] || null;
  }

  /**
   * 加权得分系统是否已启用
   * @returns {boolean}
   */
  isWeightedScoreEnabled() {
    return this._weightedScoreEnabled;
  }

  /**
   * 获取双方三色得分明细（用于结算面板）
   * @returns {Object} 得分明细对象
   */
  getScoreBreakdown() {
    if (!this._weightedScoreEnabled || !this._cellCategories) {
      // 向后兼容：未启用加权得分时，按格子数返回
      return {
        isWeighted: false,
        weightedEnabled: false,
        player: { simple: this.playerCount, core: 0, gate: 0, total: this.playerCount },
        ai:     { simple: this.aiCount,     core: 0, gate: 0, total: this.aiCount },
        playerCount: { simple: this.playerCount, core: 0, gate: 0, total: this.playerCount },
        aiCount:     { simple: this.aiCount,     core: 0, gate: 0, total: this.aiCount },
        totalCells: this.totalEmpty,
        maxScore: this.totalEmpty,
        winScore: this.winTarget || Math.ceil(this.totalEmpty / 2) + 1,
      };
    }

    const pCount = { simple: 0, core: 0, gate: 0, total: 0 };
    const aCount = { simple: 0, core: 0, gate: 0, total: 0 };
    const pScore = { simple: 0, core: 0, gate: 0, total: 0 };
    const aScore = { simple: 0, core: 0, gate: 0, total: 0 };

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cat = this._cellCategories[r]?.[c];
        if (!cat) continue; // 非初始空格跳过
        const weight = this.constructor.SCORE_WEIGHTS[cat] || 1;

        if (this.playerOwned[r]?.[c]) {
          pCount[cat]++;
          pCount.total++;
          pScore[cat] += weight;
          pScore.total += weight;
        } else if (this.aiOwned[r]?.[c]) {
          aCount[cat]++;
          aCount.total++;
          aScore[cat] += weight;
          aScore.total += weight;
        }
      }
    }

    return {
      isWeighted: true,
      weightedEnabled: true,
      player: pScore,
      ai:     aScore,
      playerCount: pCount,
      aiCount:     aCount,
      totalCells: this.totalEmpty,
      maxScore: this.maxScore,
      winScore: this.winScore,
    };
  }

  // ======================================================
  //  第1章：机关锁格机制
  // ======================================================

  /**
   * 初始化所有Boss战特殊机制
   * 从 board 中读取关卡配置的机制数据
   */
  _initBossMechanisms() {
    const board = this._board;
    if (!board) return;

    // ---- 第1章：机关锁格 ----
    this._lockStates.clear();
    this._allLocksReleased = false;
    if (board._lockCells && Array.isArray(board._lockCells)) {
      for (const lc of board._lockCells) {
        this._lockStates.set(lc.cageId, {
          released: false,
          releaseTime: 0,
          releaseEvent: lc.releaseEvent || 'gear_default',
        });
      }
    }

    // ---- 第2章：候选数脉冲 ----
    if (this._pulseTimer) {
      clearInterval(this._pulseTimer);
      this._pulseTimer = null;
    }
    this._isPulsing = false;
    this._pulsePhase = 'idle';  // idle | fading_out | hidden | fading_in
    this._pulseStartTime = 0;
    // 如果Boss配置启用了脉冲机制，启动定时器
    if (this.opponent?.battleTuning?.pulseEnabled) {
      this._startPulseTimer();
    }

    // ---- 第3章：幻影格 ----
    // 优先从 board 读取，其次从 opponent.battleTuning 读取
    let fakeCellsSource = board._fakeCells;
    if ((!fakeCellsSource || fakeCellsSource.length === 0) &&
        this.opponent?.battleTuning?.fakeCells) {
      fakeCellsSource = this.opponent.battleTuning.fakeCells;
    }
    if (fakeCellsSource && fakeCellsSource.length > 0) {
      this._fakeCellsData = fakeCellsSource.map(fc => ({
        r: fc.r,
        c: fc.c,
        fakeNum: fc.fakeNum,
        realNum: fc.realNum,
        exposed: false,
      }));
      // 把幻影格的数字替换成假数字
      for (const fc of this._fakeCellsData) {
        const cell = board.cells[fc.r]?.[fc.c];
        if (cell) {
          // 保存真实数字（从 solution 或 realNum 字段）
          if (!fc.realNum && cell.fixedNum) {
            fc.realNum = cell.fixedNum;
          }
          // 替换成假数字
          if (cell.fixedNum) {
            cell._originalFixedNum = cell.fixedNum;
            cell.fixedNum = fc.fakeNum;
          } else if (cell.fillNum) {
            cell._originalFillNum = cell.fillNum;
            cell.fillNum = fc.fakeNum;
          } else {
            // 空格子，直接填入假数字（模拟 AI 填的）
            cell.fillNum = fc.fakeNum;
            cell._isFake = true;
          }
        }
      }
      board._fakeCells = this._fakeCellsData;
    } else {
      this._fakeCellsData = [];
    }
    this._fakeCellExposed = [];

    // ---- 第4章：联动锁 ----
    this._regionLockStates = {};
    this._allRegionLocksReleased = false;
    // 优先从 board 读取，其次从 opponent.battleTuning 读取
    let regionLocksSource = null;
    if (board._regionLocks && Array.isArray(board._regionLocks) && board._regionLocks.length > 0) {
      regionLocksSource = board._regionLocks;
      this._log('第4章联动锁：从 board 读取配置，共', board._regionLocks.length, '个锁');
    } else if (this.opponent?.battleTuning?.regionLocks &&
               Array.isArray(this.opponent.battleTuning.regionLocks) &&
               this.opponent.battleTuning.regionLocks.length > 0) {
      regionLocksSource = this.opponent.battleTuning.regionLocks;
      this._log('第4章联动锁：从 opponent.battleTuning 读取配置，共',
        this.opponent.battleTuning.regionLocks.length, '个锁');
    }
    if (regionLocksSource) {
      for (const rl of regionLocksSource) {
        this._regionLockStates[rl.id] = {
          locked: true,
          primed: false,
          released: false,
          releaseTime: 0,
          region: rl.region,
          cells: rl.cells || [],
          condition: rl.condition || 'all_filled',
          revealNotes: rl.revealNotes || [],
        };
      }
      // V4 Board._regionLocks 会丢失 revealNotes/condition，若来源是 board
      // 则用 opponent.battleTuning 中的完整配置补全
      if (board._regionLocks && this.opponent?.battleTuning?.regionLocks) {
        const fullMap = {};
        for (const rl of this.opponent.battleTuning.regionLocks) fullMap[rl.id] = rl;
        for (const lockId of Object.keys(this._regionLockStates)) {
          const full = fullMap[lockId];
          if (full) {
            if (full.revealNotes) this._regionLockStates[lockId].revealNotes = full.revealNotes;
            if (full.condition) this._regionLockStates[lockId].condition = full.condition;
          }
        }
      }
      this._log('第4章联动锁初始化完成，锁数量:', Object.keys(this._regionLockStates).length);
    }

    // ---- 第5章：坍缩 ----
    this._collapseProgress = 0;
    this._isCollapsing = false;
    this._collapseStage = 0;
    this._collapsedCages = new Set();
    // 优先取完整配置（opponent.battleTuning.collapseConfig 含 stages/outerCageIds），
    // 其次从 board 读取（V4 Board._cageCollapse 为简化结构）
    let collapseConfigSource = null;
    if (this.opponent?.battleTuning?.collapseConfig &&
        typeof this.opponent.battleTuning.collapseConfig === 'object') {
      collapseConfigSource = this.opponent.battleTuning.collapseConfig;
      this._log('第5章笼坍缩：从 opponent.battleTuning 读取配置');
    } else if (board._cageCollapse && typeof board._cageCollapse === 'object') {
      collapseConfigSource = board._cageCollapse;
      this._log('第5章笼坍缩：从 board 读取配置');
    }
    if (collapseConfigSource) {
      this._collapseConfig = collapseConfigSource;
      // 预先标记外层笼
      if (collapseConfigSource.outerCageIds) {
        this._outerCageIds = [...collapseConfigSource.outerCageIds];
        this._log('第5章外层笼ID:', this._outerCageIds);
      }
      this._isCollapsing = true;
      this._log('第5章笼坍缩初始化完成，阶段数:',
        collapseConfigSource.stages ? collapseConfigSource.stages.length : 0);
    } else {
      this._collapseConfig = null;
      this._outerCageIds = [];
    }

    // ---- 第6章：双解 ----
    this._dualPathChosen = null;

    // ---- 第7章：三阶段 ----
    this._currentPhase = board._phase || 1;

    // ---- 难度保底 ----
    this._aidUsed = false;
  }

  /**
   * 检查机关锁状态：当某个笼子被完全填满且和值正确时解锁
   * 在玩家每次填对数字后调用
   */
  _checkLockCells(r, c) {
    if (!this._board || !this._board._lockCells) return;
    if (this._allLocksReleased) return;

    const cell = this._board.cells[r]?.[c];
    if (!cell) return;

    // 检查当前格所属的所有笼子是否有机关锁
    const cageIds = cell.cageIds || [cell.cageId];
    for (const cageId of cageIds) {
      if (!cageId) continue;
      const lockState = this._lockStates.get(cageId);
      if (!lockState || lockState.released) continue;

      // 检查这个笼子是否全部填满且和值正确
      const cage = this._board.cages.find(cg => cg.id === cageId);
      if (!cage) continue;

      let allFilled = true;
      let sum = 0;
      for (const [cr, cc] of cage.cells) {
        const cageCell = this._board.cells[cr]?.[cc];
        if (!cageCell) { allFilled = false; break; }
        const num = cageCell.fillNum || cageCell.fixedNum;
        if (!num) { allFilled = false; break; }
        sum += num;
      }

      if (allFilled && sum === cage.sum) {
        // 解锁！
        lockState.released = true;
        lockState.releaseTime = Date.now();
        this._log(`机关锁 ${cageId} 已解锁`);

        // 播放解锁特效和音效
        this._onLockReleased(cageId, lockState);

        // 检查是否所有锁都打开了
        let allReleased = true;
        for (const [, state] of this._lockStates) {
          if (!state.released) { allReleased = false; break; }
        }
        if (allReleased && this._lockStates.size > 0) {
          this._allLocksReleased = true;
          this._onAllLocksReleased();
        }
      }
    }
  }

  /**
   * 单个机关锁解锁时的反馈
   */
  _onLockReleased(cageId, lockState) {
    // 音效
    const eventToSfx = {
      'gear_1': 'click',
      'gear_2': 'click',
      'gear_3': 'click',
    };
    const sfx = eventToSfx[lockState.releaseEvent] || 'click';
    this._emit(BATTLE_EVENTS.SFX, { name: sfx });

    // 通知 UI 层播放齿轮动画
    this._emit(BATTLE_EVENTS.LOCK_RELEASED, { cageId, releaseEvent: lockState.releaseEvent });

    // Boss 气泡台词
    const lines = {
      'gear_1': '第一道锁…开了。',
      'gear_2': '继续。机关在转动。',
      'gear_3': '最后一道锁了。',
    };
    const line = lines[lockState.releaseEvent] || '机关转动了。';
    this._showBossBubble(line, 'focus');
  }

  /**
   * 所有机关锁全部打开时的反馈（石门打开）
   */
  _onAllLocksReleased() {
    this._log('全部机关锁已打开！石门开启');

    // 音效
    this._emit(BATTLE_EVENTS.SFX, { name: 'eureka' });

    // 通知 UI 层
    this._emit(BATTLE_EVENTS.ALL_LOCKS_OPEN, {});

    // Boss 气泡
    this._showBossBubbleHigh('石门开了。你的试炼，才刚开始。', 'determined', 5);
  }

  /**
   * 获取机关锁状态（供 UI 层使用）
   */
  getLockStates() {
    return this._lockStates;
  }

  // ======================================================
  //  第2章：候选数脉冲机制
  // ======================================================

  /**
   * 启动脉冲定时器
   * 每隔 _pulseInterval 毫秒触发一次脉冲
   */
  _startPulseTimer() {
    if (this._pulseTimer) return;
    this._pulseTimer = setInterval(() => {
      if (!this.active || this.ended) return;
      this._triggerPulse();
    }, this._pulseInterval);
    this._log('候选数脉冲定时器启动，间隔=' + (this._pulseInterval / 1000) + 's');
  }

  /**
   * 停止脉冲定时器
   */
  _stopPulseTimer() {
    if (this._pulseTimer) {
      clearInterval(this._pulseTimer);
      this._pulseTimer = null;
    }
    this._isPulsing = false;
    this._pulsePhase = 'idle';
  }

  /**
   * 触发一次脉冲：候选数隐去 → 持续 _pulseDuration 毫秒 → 恢复
   * 整个过程：淡出(0.3s) → 隐藏(_pulseDuration) → 淡入(0.3s)
   */
  _triggerPulse() {
    if (!this.active || this.ended) return;
    if (this._isPulsing) return;

    this._isPulsing = true;
    this._pulsePhase = 'fading_out';
    this._pulseStartTime = Date.now();
    this.forceRender = true;

    this._log('候选数脉冲触发！');

    // Boss 气泡提示
    this._showBossBubble('凝神静气，方能看清。', 'focus');

    // 音效
    this._emit(BATTLE_EVENTS.SFX, { name: 'hint' });

    // 淡出完成 → 进入隐藏阶段
    setTimeout(() => {
      if (!this.active || !this._isPulsing) return;
      this._pulsePhase = 'hidden';
      this.forceRender = true;

      // 隐藏阶段结束 → 开始淡入
      setTimeout(() => {
        if (!this.active || !this._isPulsing) return;
        this._pulsePhase = 'fading_in';
        this._pulseStartTime = Date.now(); // 重置时间用于淡入计算
        this.forceRender = true;

        // 淡入完成 → 恢复正常
        setTimeout(() => {
          this._isPulsing = false;
          this._pulsePhase = 'idle';
          this.forceRender = true;
        }, 300);
      }, this._pulseDuration);
    }, 300);
  }

  /**
   * 获取脉冲透明度（供 UI 层使用）
   * @returns {number} 0~1 之间的透明度倍率
   */
  getPulseOpacity() {
    if (!this._isPulsing || this._pulsePhase === 'idle') return 1;

    const elapsed = Date.now() - this._pulseStartTime;

    switch (this._pulsePhase) {
      case 'fading_out':
        // 300ms 内从 1 降到 0
        return Math.max(0, 1 - elapsed / 300);
      case 'hidden':
        return 0;
      case 'fading_in':
        // 300ms 内从 0 升到 1
        return Math.min(1, elapsed / 300);
      default:
        return 1;
    }
  }

  /**
   * 是否正在脉冲中（供外部判断）
   */
  isPulsing() {
    return this._isPulsing;
  }

  // ======================================================
  //  第3章：幻影格证伪机制
  // ======================================================

  /**
   * 是否有幻影格机制
   */
  hasFakeCells() {
    return this._fakeCellsData && this._fakeCellsData.length > 0;
  }

  /**
   * 尝试质疑一个格子（玩家长按后调用）
   * @param {number} r
   * @param {number} c
   * @returns {{success: boolean, isFake: boolean, fakeData?: object, reason?: string}}
   */
  tryAccuseFakeCell(r, c) {
    if (!this.active || this.ended) {
      return { success: false, reason: 'battle_not_active' };
    }
    if (!this.hasFakeCells()) {
      return { success: false, reason: 'no_fake_cells' };
    }

    const cell = this._board.cells[r]?.[c];
    if (!cell) return { success: false, reason: 'invalid_cell' };

    const num = cell.fillNum || cell.fixedNum;
    if (!num) return { success: false, reason: 'empty_cell' };

    // 查找是否是幻影格
    const fakeData = this._fakeCellsData.find(fc => fc.r === r && fc.c === c);

    if (fakeData) {
      // 是幻影格
      if (fakeData.exposed) {
        return { success: false, reason: 'already_exposed' };
      }

      // 证伪成功
      fakeData.exposed = true;
      this._fakeCellExposed.push({ r, c });

      // 更新棋盘：显示真实数字
      if (this._board.cells[r][c]) {
        this._board.cells[r][c].fillNum = fakeData.realNum;
        this._board.cells[r][c]._isFakeExposed = true;
      }

      // 通知 UI 层
      this._emit(BATTLE_EVENTS.FAKE_CELL_EXPOSED, { r, c });

      // 音效
      this._emit(BATTLE_EVENTS.SFX, { name: 'eureka' });

      // Boss 气泡
      this._showBossBubble('……被你发现了。', 'surprise');

      this._log('幻影格证伪成功:', r, c, fakeData.fakeNum, '→', fakeData.realNum);
      return { success: true, isFake: true, fakeData };
    } else {
      // 不是幻影格，证伪失败
      // 惩罚：短暂的视觉干扰
      this._emit(BATTLE_EVENTS.FAKE_CELL_FAIL, { r, c });

      // 音效
      this._emit(BATTLE_EVENTS.SFX, { name: 'error' });

      // Boss 气泡
      this._showBossBubble('看走眼了。', 'taunt');

      this._log('幻影格证伪失败:', r, c);
      return { success: true, isFake: false };
    }
  }

  /**
   * 获取幻影格数据（供 UI 层使用）
   */
  getFakeCells() {
    return this._fakeCellsData || [];
  }

  /**
   * 获取已暴露的幻影格
   */
  getExposedFakeCells() {
    return this._fakeCellExposed || [];
  }

  // ======================================================
  //  第4章：三人联动锁机制
  // ======================================================

  /**
   * 检查联动锁状态：玩家每次填对数字后调用
   * 当某个锁的所有格子都填满且正确 -> 进入"待激活"(primed)状态
   * 当3个锁全部进入primed状态 -> 同步解锁（同时释放）
   * 解锁后：将每个锁的 revealNotes 添加到棋盘对应格子的候选数中
   */
  _checkRegionLocks(r, c) {
    if (!this.hasRegionLocks()) return;
    if (this._allRegionLocksReleased) return;

    const lockIds = Object.keys(this._regionLockStates);
    if (lockIds.length === 0) return;

    // 遍历所有联动锁，检查每个锁的格子是否全部填满且正确
    for (const lockId of lockIds) {
      const lockState = this._regionLockStates[lockId];
      if (!lockState || lockState.released) continue;
      if (lockState.primed) continue; // 已经是待激活状态就跳过

      // 检查这个锁的所有格子是否都已填满且正确
      let allFilled = true;
      let allCorrect = true;
      for (const [cr, cc] of lockState.cells) {
        const cell = this._board.cells[cr]?.[cc];
        if (!cell) { allFilled = false; break; }
        const num = cell.fillNum || cell.fixedNum;
        if (!num) { allFilled = false; break; }
        // 检查数字是否正确（与 solution 对比）
        if (this.solution && this.solution[cr] && this.solution[cr][cc] !== undefined) {
          if (num !== this.solution[cr][cc]) {
            allCorrect = false;
          }
        }
      }

      if (allFilled && allCorrect) {
        // 该锁进入"待激活"(primed)状态
        lockState.primed = true;
        lockState.locked = false;
        this._log('联动锁', lockId, '进入待激活(primed)状态');

        // 通知 UI 层：锁闪烁提示
        this._emit(BATTLE_EVENTS.REGION_LOCK_PRIMED, { lockId });

        // 音效
        this._emit(BATTLE_EVENTS.SFX, { name: 'hint' });

        // Boss 气泡
        const regionLines = {
          'left': '左区……锁松动了。',
          'center': '中区……在回应。',
          'right': '右区……也在动。',
        };
        const line = regionLines[lockState.region] || '一道锁……亮起了。';
        this._showBossBubble(line, 'focus');
      }
    }

    // 检查是否所有锁都进入了 primed 状态
    let allPrimed = true;
    let primedCount = 0;
    for (const lockId of lockIds) {
      const lockState = this._regionLockStates[lockId];
      if (lockState.primed) {
        primedCount++;
      } else {
        allPrimed = false;
      }
    }

    if (allPrimed && lockIds.length > 0) {
      // 所有锁都处于 primed 状态 -> 同步解锁
      this._log('全部联动锁待激活完毕，开始同步解锁！');
      this._onRegionLocksReleased();
    }
  }

  /**
   * 同步解锁反馈：所有联动锁同时释放
   */
  _onRegionLocksReleased() {
    this._allRegionLocksReleased = true;
    const releaseTime = Date.now();

    // 标记所有锁为已释放
    for (const lockId of Object.keys(this._regionLockStates)) {
      const lockState = this._regionLockStates[lockId];
      lockState.released = true;
      lockState.primed = false;
      lockState.locked = false;
      lockState.releaseTime = releaseTime;
    }

    this._log('三人联动锁同步解锁！三区并蒂，笔记浮现');

    // 浮现笔记：将每个锁的 revealNotes 添加到棋盘对应格子的候选数中
    for (const lockId of Object.keys(this._regionLockStates)) {
      const lockState = this._regionLockStates[lockId];
      if (!lockState.revealNotes || lockState.revealNotes.length === 0) continue;

      for (const noteInfo of lockState.revealNotes) {
        const { r, c, notes } = noteInfo;
        const cell = this._board.cells[r]?.[c];
        if (!cell) continue;

        // 确保 cell.notes 存在
        if (!cell.notes) {
          cell.notes = new Set();
        }
        // 将笔记数字添加到候选数中
        for (const n of notes) {
          cell.notes.add(n);
        }
        // 标记为联动锁浮现的笔记（供 UI 层特殊显示）
        if (!cell._revealedNotes) {
          cell._revealedNotes = new Set();
        }
        for (const n of notes) {
          cell._revealedNotes.add(n);
        }
        this._log('笔记浮现: 格(', r, ',', c, ') 添加候选数', notes);
      }
    }

    // 音效
    this._emit(BATTLE_EVENTS.SFX, { name: 'eureka' });

    // 通知 UI 层触发联动锁解锁动画
    this._emit(BATTLE_EVENTS.REGION_LOCKS_RELEASED, {});

    // Boss 气泡台词（高优先级）
    this._showBossBubbleHigh('三区同鸣……封印尽解。这些笔记……终于可以安息了。', 'surprised', 5);
  }

  /**
   * 返回联动锁状态供 UI 层使用
   */
  getRegionLockStates() {
    return this._regionLockStates;
  }

  /**
   * 返回是否有联动锁机制
   */
  hasRegionLocks() {
    return this._regionLockStates && Object.keys(this._regionLockStates).length > 0;
  }

  /**
   * 返回已浮现的笔记供渲染
   * @returns {Array<{r: number, c: number, notes: Array<number>}>}
   */
  getRevealedNotes() {
    const result = [];
    if (!this._board || !this._board.cells) return result;
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this._board.cells[r]?.[c];
        if (cell && cell._revealedNotes && cell._revealedNotes.size > 0) {
          result.push({ r, c, notes: [...cell._revealedNotes] });
        }
      }
    }
    return result;
  }

  // ======================================================
  //  第5章：嵌套笼坍缩机制
  // ======================================================

  /**
   * 更新坍缩进度：在每次玩家得分后调用
   * @param {number} progress - 进度比率（0~1），或兼容旧版的 playerCount
   * @param {number} [winTarget] - 兼容旧版的胜利目标数
   * 如果进度跨过新阶段阈值 -> 触发阶段变化
   */
  _updateCollapseProgress(progress, winTarget) {
    if (!this._collapseConfig) return;

    // 兼容旧版调用方式：_updateCollapseProgress(playerCount, winTarget)
    let newProgress;
    if (winTarget !== undefined) {
      if (!winTarget || winTarget <= 0) return;
      newProgress = progress / winTarget;
    } else {
      newProgress = progress;
    }
    const oldProgress = this._collapseProgress;

    // 更新进度
    this._collapseProgress = Math.min(1, newProgress);

    const stages = this._collapseConfig.stages;
    if (!stages || stages.length === 0) return;

    // 检查是否跨过新阶段阈值
    for (let i = this._collapseStage; i < stages.length; i++) {
      if (newProgress >= stages[i].progress && oldProgress < stages[i].progress) {
        const newStage = i + 1; // 阶段索引从 0 开始，触发后进入下一阶段
        this._log('笼坍缩阶段变化:', this._collapseStage, '->', newStage,
          '进度:', oldProgress.toFixed(2), '->', newProgress.toFixed(2));
        this._collapseStage = newStage;
        this._onCollapseStageChange(i);
      }
    }
  }

  /**
   * 阶段变化反馈
   * @param {number} stageIndex - 刚触发的阶段索引（0-based）
   */
  _onCollapseStageChange(stageIndex) {
    const stage = this._collapseConfig.stages[stageIndex];
    if (!stage) return;

    this._log('第5章笼坍缩进入阶段', stageIndex + 1, ':', stage.description);

    // 阶段 0（progress 0.3）：外层笼开始收缩动画，和值显示"？？"
    // 阶段 1（progress 0.6）：外层笼和值完全显现
    // 阶段 2（progress 0.9）：外层笼完全坍缩，露出内层笼
    if (stage.fullyCollapsed) {
      // 完全坍缩：将外层笼加入已坍缩集合
      if (this._outerCageIds) {
        for (const cageId of this._outerCageIds) {
          this._collapsedCages.add(cageId);
        }
      }
      this._log('外层笼完全坍缩，已坍缩笼子:', [...this._collapsedCages]);
    }

    // 音效
    const sfxMap = {
      0: 'hint',
      1: 'click',
      2: 'eureka',
    };
    const sfx = sfxMap[stageIndex] || 'click';
    this._emit(BATTLE_EVENTS.SFX, { name: sfx });

    // 通知 UI 层
    this._emit(BATTLE_EVENTS.CAGE_COLLAPSE_STAGE, { stageIndex, stage });

    // Boss 气泡台词
    const stageLines = [
      '包围圈收拢 30%。外层开始收缩。',
      '包围圈收拢 60%。外层和值：显现。',
      '包围圈收拢 90%。外层坍缩。内层暴露。',
    ];
    const line = stageLines[stageIndex] || '结构变化中。';
    this._showBossBubble(line, 'default');
  }

  /**
   * 返回坍缩进度（0~1）供 UI 层使用
   */
  getCollapseProgress() {
    return this._collapseProgress;
  }

  /**
   * 返回当前坍缩阶段
   */
  getCollapseStage() {
    return this._collapseStage;
  }

  /**
   * 返回已完全坍缩的笼子集合
   */
  getCollapsedCages() {
    return this._collapsedCages || new Set();
  }

  // ======================================================
  //  胜负判定
  // ======================================================
  _checkWin() {
    // 翻盘机制检测
    this._checkComeback();

    if (this._weightedScoreEnabled) {
      // 加权得分模式：按三色加权分判定胜负
      if (this.playerScore >= this.winScore) {
        this._endBattle('win');
      } else if (this.aiScore >= this.winScore) {
        this._endBattle('lose');
      }
    } else {
      // 原始模式：按格子数判定胜负（向后兼容）
      if (this.playerCount >= this.winTarget) {
        this._endBattle('win');
      } else if (this.aiCount >= this.winTarget) {
        this._endBattle('lose');
      }
    }
  }

  // ======================================================
  //  破局翻盘机制
  // ======================================================

  /**
   * 检测翻盘状态
   * 玩家落后较多时触发"破局模式"，给玩家喘息和反击的机会
   */
  _checkComeback() {
    const diff = this.aiCount - this.playerCount;

    // 记录最大落后格数
    if (diff > (this._maxDeficit || 0)) {
      this._maxDeficit = diff;
    }

    if (!this._comeback.active && diff >= this._comeback.triggerDiff) {
      // 触发破局模式
      this._comeback.active = true;
      this._log('破局模式激活！玩家落后', diff, '格');

      // 显示提示
      this._showComebackIndicator(true);

      // AI变慢
      if (this._difficulty) {
        this._difficulty.speedMultiplier *= this._comeback.speedBonus;
      }
    } else if (this._comeback.active && diff <= this._comeback.releaseDiff) {
      // 解除破局模式
      this._comeback.active = false;
      this._log('破局模式解除，差距缩小到', diff, '格');

      this._showComebackIndicator(false);

      // 恢复AI速度
      if (this._difficulty) {
        this._difficulty.speedMultiplier /= this._comeback.speedBonus;
      }
    }
  }

  /**
   * 显示/隐藏翻盘指示器（转发给 UI 层）
   */
  _showComebackIndicator(show) {
    this._emit(BATTLE_EVENTS.COMEBACK_INDICATOR, { show });
  }

  /**
   * 结束战斗
   */
  _endBattle(result) {
    if (this.ended) return;

    this.ended = true;
    this.result = result;
    this.active = false;

    if (this._aiTimer) {
      clearTimeout(this._aiTimer);
      this._aiTimer = null;
    }

    this._log('Ended, result:', result,
      'playerCount:', this.playerCount,
      'aiCount:', this.aiCount,
      'winTarget:', this.winTarget,
      'weightedScore:', this._weightedScoreEnabled,
      'playerScore:', this.playerScore?.toFixed?.(1) ?? this.playerScore,
      'aiScore:', this.aiScore?.toFixed?.(1) ?? this.aiScore,
      'winScore:', this.winScore?.toFixed?.(2) ?? this.winScore);

    // 通知 UI 层更新（显示最终状态）
    this._emit(BATTLE_EVENTS.BOARD_CHANGED, { board: this._board });

    // 清理翻盘指示器
    this._emit(BATTLE_EVENTS.COMEBACK_INDICATOR, { show: false });

    // 记录战绩
    this._recordBattleStats(result);

    // 喜剧系统：特殊成就检测
    this._checkComedyAchievements(result);

    // 广播战斗结束事件（V4.3.22：补全战报卡统计字段）
    this._emit(BATTLE_EVENTS.BATTLE_END, {
      result,
      opponent: this.opponent,
      playerCount: this.playerCount,
      aiCount: this.aiCount,
      winTarget: this.winTarget,
      bestCombo: this._combo?.bestCombo || 0,
      stealCount: this._stealCount || 0,
      counterCount: this._counterCount || 0,
      aiMistakeCount: this._aiMistakeCount || 0,
      playerMistakeCount: this._playerMistakeCount || 0,
      maxStunTime: this._maxStunTime || 0,
      duration: Date.now() - (this._startTime || Date.now()),
      newAchievements: (this._lastNewAchievements || []).slice(),
    });

    if (this._onEndCallback) {
      try {
        this._onEndCallback(result, this.opponent);
      } catch (e) {
        this._error('onEnd callback error:', e);
        // 即使回调出错，也要确保清理
        this.stop();
      }
    }
  }

  // ======================================================
  //  战绩统计系统
  // ======================================================

  /**
   * 记录本次战斗数据
   */
  _recordBattleStats(result) {
    try {
      const stats = this._loadStats();
      const bossId = this.opponent?.id || 'unknown';
      const now = Date.now();

      const record = {
        bossId: bossId,
        bossName: this.opponent?.name || '',
        result: result, // 'win' | 'lose' | 'draw'
        playerCount: this.playerCount,
        aiCount: this.aiCount,
        totalEmpty: this.totalEmpty,
        winTarget: this.winTarget,
        bestCombo: this._combo?.bestCombo || 0,
        size: this.size,
        timestamp: now,
        duration: now - (this._startTime || now),
        difficulty: this._currentDifficulty || 'normal',
        // 三色加权得分
        weightedScore: this._weightedScoreEnabled,
        playerScore: this.playerScore,
        aiScore: this.aiScore,
        maxScore: this.maxScore,
        winScore: this.winScore,
      };

      // 初始化Boss数据
      if (!stats.bosses[bossId]) {
        stats.bosses[bossId] = {
          wins: 0,
          losses: 0,
          draws: 0,
          bestCombo: 0,
          fastestWin: null,
          totalPlayed: 0,
        };
      }

      const bossStat = stats.bosses[bossId];
      bossStat.totalPlayed++;
      if (result === 'win') {
        bossStat.wins++;
        if (!bossStat.fastestWin || record.duration < bossStat.fastestWin) {
          bossStat.fastestWin = record.duration;
        }
      } else if (result === 'lose') {
        bossStat.losses++;
      } else {
        bossStat.draws++;
      }
      if (record.bestCombo > bossStat.bestCombo) {
        bossStat.bestCombo = record.bestCombo;
      }

      // 全局统计
      stats.total.battles++;
      if (result === 'win') stats.total.wins++;
      else if (result === 'lose') stats.total.losses++;
      if (record.bestCombo > stats.total.bestCombo) {
        stats.total.bestCombo = record.bestCombo;
      }

      // 最近记录（最多保留20条）
      stats.recent.unshift(record);
      if (stats.recent.length > 20) stats.recent = stats.recent.slice(0, 20);

      this._saveStats(stats);
      this._log('战绩已记录:', result, 'vs', bossId);
      this._emit(BATTLE_EVENTS.BOSS_STATS_UPDATED, { bossId, stats: bossStat });
    } catch (e) {
      this._warn('战绩记录失败:', e);
    }
  }

  /**
   * 加载战绩数据
   */
  _loadStats() {
    try {
      const data = this._storage.getItem(this.constructor.STATS_KEY);
      if (data) return JSON.parse(data);
    } catch (e) {
      // 解析失败则返回默认
    }
    return {
      total: { battles: 0, wins: 0, losses: 0, bestCombo: 0 },
      bosses: {},
      recent: [],
    };
  }

  /**
   * 保存战绩数据
   */
  _saveStats(stats) {
    try {
      this._storage.setItem(this.constructor.STATS_KEY, JSON.stringify(stats));
    } catch (e) {
      this._warn('战绩保存失败:', e);
    }
  }

  /**
   * 获取指定Boss的战绩
   */
  getBossStats(bossId) {
    const stats = this._loadStats();
    return stats.bosses[bossId] || null;
  }

  /**
   * 获取全局战绩
   */
  getTotalStats() {
    return this._loadStats().total;
  }

  /**
   * 重置所有战绩
   */
  resetStats() {
    try {
      this._storage.removeItem(this.constructor.STATS_KEY);
      this._log('战绩已重置');
    } catch (e) {
      // 忽略
    }
  }

  // ======================================================
  //  喜剧系统（彩蛋/成就）
  // ======================================================

  /**
   * 检测喜剧成就（战斗结束时触发）
   */
  _checkComedyAchievements(result) {
    if (!this._comedyEnabled) return;
    try {
      const achievements = this._loadComedyAchievements();
      const bossId = this.opponent?.id || 'unknown';
      const newAchievements = [];

      // 1. 【手滑了】AI单局失误5次以上
      if (this._aiMistakeCount && this._aiMistakeCount >= 5) {
        if (!achievements['hand_slippery']) {
          achievements['hand_slippery'] = {
            name: '手滑了',
            desc: '在一局中目睹AI失误5次以上',
            unlockedAt: Date.now(),
          };
          newAchievements.push('手滑了');
        }
      }

      // 2. 【盗圣】单局抢格10次以上
      if (this._stealCount && this._stealCount >= 10) {
        if (!achievements['thief_king']) {
          achievements['thief_king'] = {
            name: '盗圣',
            desc: '单局从AI手中抢走10个格子',
            unlockedAt: Date.now(),
          };
          newAchievements.push('盗圣');
        }
      }

      // 3. 【史诗翻盘】落后10格以上反败为胜
      if (result === 'win' && this._maxDeficit && this._maxDeficit >= 10) {
        if (!achievements['epic_comeback']) {
          achievements['epic_comeback'] = {
            name: '史诗翻盘',
            desc: '落后10格以上反败为胜',
            unlockedAt: Date.now(),
          };
          newAchievements.push('史诗翻盘');
        }
      }

      // 4. 【闪电战】60秒内击败Boss
      const duration = Date.now() - (this._startTime || Date.now());
      if (result === 'win' && duration < 60000) {
        if (!achievements['blitzkrieg']) {
          achievements['blitzkrieg'] = {
            name: '闪电战',
            desc: '60秒内击败Boss',
            unlockedAt: Date.now(),
          };
          newAchievements.push('闪电战');
        }
      }

      // 5. 【菜鸡互啄】双方失误加起来超过10次
      const playerMistakes = this._playerMistakeCount || 0;
      const aiMistakes = this._aiMistakeCount || 0;
      if (playerMistakes + aiMistakes >= 10) {
        if (!achievements['noob_battle']) {
          achievements['noob_battle'] = {
            name: '菜鸡互啄',
            desc: '双方加起来失误10次以上',
            unlockedAt: Date.now(),
          };
          newAchievements.push('菜鸡互啄');
        }
      }

      // 6. 【完美胜利】0失误击败Boss
      if (result === 'win' && playerMistakes === 0) {
        if (!achievements['perfect_win']) {
          achievements['perfect_win'] = {
            name: '完美胜利',
            desc: '零失误击败Boss',
            unlockedAt: Date.now(),
          };
          newAchievements.push('完美胜利');
        }
      }

      // 保存并弹出通知
      if (newAchievements.length > 0) {
        this._saveComedyAchievements(achievements);
        this._lastNewAchievements = newAchievements.slice(); // V4.3.22：供战报卡展示
        newAchievements.forEach((name, idx) => {
          setTimeout(() => {
            this._showAchievementPopup(name);
          }, idx * 2000);
        });
        this._log('解锁喜剧成就:', newAchievements);
      }
    } catch (e) {
      this._warn('喜剧成就检测失败:', e);
    }
  }

  /**
   * 显示成就解锁弹窗（转发给 UI 层）
   */
  _showAchievementPopup(name) {
    this._emit(BATTLE_EVENTS.ACHIEVEMENT, { name });
  }

  _loadComedyAchievements() {
    // V4.3.27：优先使用 DataStore.ACHIEVEMENT 分类，回退原始 localStorage
    try {
      if (typeof window !== 'undefined' && window.DataStore) {
        const data = window.DataStore.get('comedy', window.DataStore.ACHIEVEMENT, null);
        if (data) return data;
      }
    } catch (e) {
      // 忽略
    }
    // 回退：从旧 key 读取并迁移
    try {
      const data = this._storage.getItem(this.constructor.COMEDY_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        // 自动迁移到 DataStore
        this._saveComedyAchievements(parsed);
        return parsed;
      }
    } catch (e) {
      // 忽略
    }
    return {};
  }

  _saveComedyAchievements(achievements) {
    // V4.3.27：写入 DataStore.ACHIEVEMENT 分类 + 旧 key 同步
    try {
      if (typeof window !== 'undefined' && window.DataStore) {
        window.DataStore.set('comedy', achievements, window.DataStore.ACHIEVEMENT);
      }
    } catch (e) {
      // 忽略
    }
    try {
      this._storage.setItem(this.constructor.COMEDY_KEY, JSON.stringify(achievements));
    } catch (e) {
      // 忽略
    }
  }

  /**
   * 获取所有已解锁喜剧成就
   */
  getComedyAchievements() {
    return this._loadComedyAchievements();
  }

  // ======================================================
  //  配置查询
  // ======================================================

  /**
   * 获取Boss配置
   */
  getBossConfig(chapterId) {
    return BOSS_CONFIGS[chapterId] || null;
  }

  /**
   * 判断是否为Boss关卡
   */
  isBossLevel(chapterId, levelId, chapterData) {
    if (!chapterData || !chapterData.levels) return false;
    const normalLevels = chapterData.levels.filter(l => !l.isHidden);
    if (normalLevels.length === 0) return false;
    const lastLevel = normalLevels[normalLevels.length - 1];
    return parseInt(lastLevel.levelId) === parseInt(levelId);
  }
}

// ---------------------------------------------------------------------------
// 7. 导出
// ---------------------------------------------------------------------------
export default BattleManager;





