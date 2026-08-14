// ==========================================
// main.js - V4 UI 层：GameApp 主应用类
// ==========================================
// 说明（参照 CageMasterV4-refactoring-manual sec2 与附录 B）：
//   ui/main.js 是 UI 交互层的编排入口，负责初始化：
//     - core/headless-engine.js   无头引擎（唯一数据源）
//     - core/lesson-player.js     教学状态机（五段式）
//     - core/level-manager.js     关卡加载与进度管理
//     - renderer/board-renderer.js 基础渲染层
//     - renderer/effect-renderer.js 特效渲染层
//     - renderer/animation-controller.js 动画控制器
//     - renderer/performance-monitor.js 性能监控
//   并提供 startLevel / handleCellClick / handleNumberInput /
//   handleNoteToggle / handleErase / render 等编排方法，
//   以及 onEvent 回调接口供页面绑定 UI 事件。
//
// 依赖规则（手册 sec2-4）：core/ 不依赖 renderer/ 与 ui/；
//   UI 层通过统一接口访问引擎，渲染层仅由 UI 层驱动。
//
// 环境约束：
//   - 纯 ES Module 语法，浏览器环境可用（可引用 document/fetch）。
//   - 无模块顶层 DOM 访问，Node 环境 import 不报错。
//   - 注意：core/headless-engine.js 在 Node 下通过 fs+eval 加载 board.js；
//     浏览器端若直接引用该模块需由打包器处理（或以全局 Board 模式替代）。
// ==========================================

import { HeadlessEngine } from '../core/headless-engine.js?v=51';
import { LessonPlayer } from '../core/lesson-player.js?v=51';
import { LevelManager } from '../core/level-manager.js?v=51';
import { BoardRenderer } from '../renderer/board-renderer.js?v=51';
import { EffectRenderer } from '../renderer/effect-renderer.js?v=51';
import { AnimationController } from '../renderer/animation-controller.js?v=51';
import { PerformanceMonitor } from '../renderer/performance-monitor.js?v=51';

import { rowToIndex, indexToRow, colToIndex, indexToCol } from '../core/utils.js?v=51';
// 2026-08-04：AI 记录快照共用模块（浏览器与 Node 测试脚本同构）
import { buildRecordSnapshot, buildLessonPlanSummary } from '../core/ai-record.js?v=51';

import I18n from '../i18n/i18n.js';

class GameApp {
  /**
   * @param {Object} options
   * @param {HTMLCanvasElement} [options.boardCanvas] - 棋盘渲染 canvas
   * @param {HTMLCanvasElement} [options.effectCanvas] - 特效渲染 canvas
   * @param {LevelManager}     [options.levelManager] - 可注入的 LevelManager
   * @param {PerformanceMonitor} [options.performanceMonitor] - 可注入的 PerformanceMonitor
   * @param {Object}         [options.whatIfManager] - 可注入的 WhatIfManager（假设模式，P1#6）
   * @param {Function}         [options.onEvent] - 事件回调 (type, payload) => void
   * @param {Function}         [options.loadLevel] - 自定义关卡加载器 (levelId) => Promise<levelData>（Node/测试环境）
   * @param {string}           [options.baseUrl] - 关卡数据基础路径，默认 ''（相对 data/levels/）
   * @param {number}           [options.lessonDelay] - 教学动作延迟(ms)，默认 0（同步，便于测试）
   * @param {number}           [options.gridSize] - 初始棋盘尺寸，默认 9
   * @param {boolean}          [options.autoLoop=true] - 是否自动启动动画循环（浏览器）
   */
  constructor(options) {
    options = options || {};

    /** @type {Function|null} 页面绑定的事件回调 */
    this.onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

    /** @type {string} 关卡数据基础路径 */
    this._baseUrl = options.baseUrl || '';

    /** @type {number} 教学动作延迟 */
    // 2026-08-04：lessonDelay 未传时透传 null（生产模式走各调用点设计时长）；
    // 显式传 0 才表示 Node 测试同步模式
    this._lessonDelay = (options.lessonDelay === undefined || options.lessonDelay === null) ? null : options.lessonDelay;

    /** @type {Function|null} 自定义关卡加载器 */
    this._loadLevelOverride = typeof options.loadLevel === 'function' ? options.loadLevel : null;

    // ---------------- 性能监控 ----------------
    this._performanceMonitor = options.performanceMonitor || new PerformanceMonitor({
      level: options.quality || 'high',
      autoAdjust: options.autoAdjust !== false,
    });

    // ---------------- 渲染器 ----------------
    this._boardRenderer = new BoardRenderer({
      canvas: options.boardCanvas || null,
      performanceMonitor: this._performanceMonitor,
      gridSize: options.gridSize || 9,
    });
    this._effectRenderer = new EffectRenderer({
      canvas: options.effectCanvas || null,
      performanceMonitor: this._performanceMonitor,
    });
    this._animationController = new AnimationController({
      boardRenderer: this._boardRenderer,
      effectRenderer: this._effectRenderer,
      performanceMonitor: this._performanceMonitor,
    });
    // 由 GameApp 自己的循环驱动 update/render，避免双循环
    this._animationController.stopLoop();

    // ---------------- 核心 ----------------
    this._engine = new HeadlessEngine(options.gridSize || 9);
    // Loop②：笔记收敛到唯一候选 → 抛出 nakedSingle 事件（轻量提示，等待玩家点击确认填入）
    // 注意：关卡加载可能重建 Board（gridSize 变化），startLevelFromData 里会重新挂接。
    if (this._engine.board) {
      this._engine.board.onNakedSingleReached = (r, c, value) => {
        this.emitEvent('nakedSingle', { r, c, value });
      };
    }
    this._levelManager = options.levelManager || new LevelManager({
      useStorage: typeof localStorage !== 'undefined',
    });

    // ---------------- 运行状态 ----------------
    /** @type {number|null} 当前关卡 ID */
    this._currentLevelId = null;
    /** @type {Object|null} 当前关卡原始数据 */
    this._levelData = null;
    /** @type {{r:number,c:number}|null} 当前选中格 */
    this._selectedCell = null;
    /** @type {LessonPlayer|null} 教学播放器实例 */
    this._lessonPlayer = null;
    /** @type {boolean} 关卡是否完成 */
    this._completed = false;

    // ---------------- 教学视觉状态 ----------------
    this._lessonFocusCell = null;
    this._lessonRows = new Set();
    this._lessonCols = new Set();
    this._lessonBoxes = new Set();
    this._lessonCage = null;
    this._lessonFrozen = false;
    this._lessonSpotlight = 0;

    // ---------------- Investigation Interaction (Step 8) ----------------
    // 玩家从 45 Panel 调查层点选证据/节点时，临时高亮对应笼（不粘滞）：
    // 玩家随后点棋盘任意格即清除。与教学 _lessonCage 互斥，教学优先。
    this._ivCage = null;

    // ---------------- 微型教学提示模式（2026-08-03） ----------------
    /** @type {boolean} 提示锁定模式是否激活 */
    this._hintActive = false;
    /** @type {Array<number>|null} 提示目标格 [row, col] */
    this._hintTarget = null;
    /** @type {number} 提示模式聚光灯强度（0 = 关闭） */
    this._hintSpotlight = 0;
    /** @type {Function|null} 提示填错时的重播回调（game.html 注入） */
    this._hintRetryCallback = null;

    // ---------------- AI 调试上下文（2026-08-03） ----------------
    /** @type {Object} AI 调试补充上下文（mode/bubbleText/bgmId/elapsedSeconds 等由页面注入） */
    this._aiCtx = {};
    /** @type {string|null} 最近一次教学气泡文字 */
    this._lastBubbleText = null;

    // ---------------- 页面自定义特效提供者 ----------------
    this._effectsProvider = null;

    // ---------------- WhatIfManager（假设模式插槽，P1#6） ----------------
    /** @type {Object|null} 假设模式管理器（注入式） */
    this._whatIfManager = options.whatIfManager || null;

    // ---------------- 动画循环 ----------------
    this._rafId = null;
    this._loopRunning = false;
    this._lastFrameTime = 0;

    if (options.autoLoop !== false) {
      this.startLoop();
    }
  }

  // ============================================================
  //  事件接口
  // ============================================================

  /**
   * 派发事件给页面（this.onEvent(type, payload)）
   * @param {string} type - 事件类型
   * @param {*} payload - 事件负载
   */
  emitEvent(type, payload) {
    // AI 调试：记录教学气泡文本
    if (type === 'bubble' && payload && payload.text) {
      this._lastBubbleText = payload.text;
    }
    if (type === 'hintModeEnd') { this._lastBubbleText = null; }
    if (typeof this.onEvent === 'function') {
      try { this.onEvent(type, payload); } catch (e) { console.warn('[GameApp] onEvent error:', e); }
    }
  }

  /**
   * 绑定事件回调（与构造参数 onEvent 等价）
   * @param {Function} cb
   */
  setOnEvent(cb) {
    try {
      this.onEvent = typeof cb === 'function' ? cb : null;
    } catch (e) {
      console.warn('[GameApp] setOnEvent error:', e);
    }
  }

  // ============================================================
  //  生命周期 / 关卡加载
  // ============================================================

  /**
   * 初始化章节数据（委托 LevelManager）
   * @param {Array} chaptersData - data/chapters.json 的 chapters 数组
   */
  initChapters(chaptersData) {
    try {
      if (!this._levelManager) return false;
      return this._levelManager.loadChapters(chaptersData);
    } catch (e) {
      console.warn('[GameApp] initChapters error:', e);
      return false;
    }
  }

  /**
   * 开始一关
   * @param {number} levelId - 关卡 ID（如 101）
   * @returns {Promise<{success:boolean, levelId:number, lessonStarted:boolean}>}
   */
  async startLevel(levelId) {
    let levelData;
    try {
      levelData = await this._fetchLevel(levelId);
    } catch (e) {
      console.error('[GameApp] Failed to load level ' + levelId + ':', e);
      this.emitEvent('loadError', { levelId: levelId, error: e });
      return { success: false, levelId: levelId, lessonStarted: false };
    }
    return this.startLevelFromData(levelId, levelData);
  }

  /**
   * 从内存关卡数据开始一关（2026-08-04：LevelPoolManager 池子关卡用，
   * 跳过 _fetchLevel 文件拉取，直接加载传入的 levelData）
   * @param {number|string} levelId - 关卡 ID（池关卡为 'pool-XXXX'）
   * @param {Object} levelData - 完整关卡数据（boardData/cages/solution/gridSize）
   * @returns {Promise<{success:boolean, levelId:number, lessonStarted:boolean}>}
   */
  async startLevelFromData(levelId, levelData) {
    try {
      this._currentLevelId = levelId;
      this._selectedCell = null;
      this._completed = false;
      // v2.0：关卡切换强制退出提示锁定模式（避免 _hintActive 跨关残留卡死填数）
      if (this._hintActive) {
        try { this.exitHintMode(); } catch (e) {}
      }
      // V4.3.26：关卡切换必须销毁旧 LessonPlayer，否则上一关教学状态残留（lessonEvents 泄漏 + 定时器干扰）
      if (this._lessonPlayer) {
        try {
          if (typeof this._lessonPlayer.destroy === 'function') this._lessonPlayer.destroy();
          else if (typeof this._lessonPlayer.stop === 'function') this._lessonPlayer.stop();
        } catch (e) { console.warn('[GameApp] 旧 LessonPlayer 销毁失败:', e); }
        this._lessonPlayer = null;
      }
      // V4.3.26：清除上一关残留气泡文本（AI 调试上下文）
      this._lastBubbleText = null;
      this._resetLessonVisuals();
      // 2026-08-04：关卡级 AI 记录器（记录预填/笼子/玩家填数历史/对话/互动）
      this._aiRecord = {
        levelId: levelId,
        startedAt: Date.now(),
        initialBoard: null,   // 关卡初始盘面（预填格）
        cages: null,          // 笼子结构（和值 + 格子）
        moves: [],            // 玩家操作历史（填数/笔记/擦除）
        pathMoves: [],        // 2026-08-04：用户最优路径对比用（有序 fill：{r,c,num,correct}）
        interactions: [],     // 玩家与角色互动时间线（提示/跳过/对话播放/通关）
        completedAt: null,
      };

      this._levelData = levelData;

      // 2026-08-04：直接从 boardData 生成准确初始盘面快照（固定格含数字）
      // 快照构建复用 core/ai-record.js（与 Node 测试驱动脚本同构）
      if (this._aiRecord) {
        const snap = buildRecordSnapshot(levelData);
        this._aiRecord.gridSize = snap.gridSize;
        this._aiRecord.meta = snap.meta;
        this._aiRecord.preDialog = snap.preDialog;
        this._aiRecord.clearDialog = snap.clearDialog;
        this._aiRecord.lessonPlan = snap.lessonPlan;
        this._aiRecord.initialBoard = snap.initialBoard;
        this._aiRecord.cages = snap.cages;
      }

      // 引擎加载（兼容 boardData / lessonPlan 字段）
      if (this._engine) {
        this._engine.loadLevel(levelData);
        // Loop②：关卡加载可能重建 Board，重新挂接推导回调并建立基线（首次不抛出）
        if (this._engine.board) {
          this._engine.board.onNakedSingleReached = (r, c, value) => {
            this.emitEvent('nakedSingle', { r, c, value });
          };
        }
        if (typeof this._engine.refreshDeductions === 'function') {
          try { this._engine.refreshDeductions(); } catch (e) {}
        }
      }
      // Q13：恢复本关进度（重进继续填）——恢复过则页面层自动跳过教学
      this._progressRestored = false;
      try { this._progressRestored = this._restoreLevelProgress(); } catch (e) {}
      const gridSize = levelData.gridSize || 9;
      if (this._boardRenderer) {
        this._boardRenderer._gridSize = gridSize;
        // v2.0：关卡切换兜底清除 Boss 幽灵格渲染（防 _bossGhostColor 残留导致普通关显示小点）
        if (typeof this._boardRenderer.clearBossGhost === 'function') {
          this._boardRenderer.clearBossGhost();
        }
        if (typeof this._boardRenderer.stopBossGhostLoop === 'function') {
          this._boardRenderer.stopBossGhostLoop();
        }
      }

      // V4.3.33：残卷改错——按 plantedErrors 预填错误数字（非 fixed，玩家发现并改正；
      // 预填错误会使 validation.errorCount>0，全部改正后才能通关，天然构成"找错改错"目标）
      this._plantedErrors = new Set();
      const pe = levelData.plantedErrors || [];
      if (pe.length && this._engine) {
        const sol = levelData.solution;
        const gs = gridSize;
        pe.forEach((pos) => {
          if (!Array.isArray(pos) || pos.length < 2) return;
          const [r, c] = pos;
          if (!sol || !sol[r] || !sol[r][c]) return;
          const correct = sol[r][c];
          const errVal = (correct % gs) + 1; // 必然 ≠ correct（模 4 循环）
          try { this._engine.fillCell(r, c, errVal); } catch (e) {}
          this._plantedErrors.add(r + ',' + c);
        });
      }
      // V4.3.33：模式字段缓存（墨迹将尽 / 静默电台 / 密文抽取）
      this._levelLimits = (levelData.limits && levelData.limits.maxErrors > 0) ? levelData.limits.maxErrors : 0;
      this._levelSilent = !!levelData.silentMode;
      this._extractPlan = levelData.extract || null;

      this.emitEvent('levelLoaded', { levelId: levelId, levelData: levelData });

      // 初始化教学播放器
      let lessonStarted = false;
      if (levelData.lessonPlan || levelData.lesson) {
        lessonStarted = this._startLesson();
      }

      this.render();
      this.emitEvent('levelStart', { levelId: levelId, lessonStarted: lessonStarted });
      return { success: true, levelId: levelId, lessonStarted: lessonStarted };
    } catch (e) {
      console.error('[GameApp] startLevel error:', e);
      this.emitEvent('loadError', { levelId: levelId, error: e });
      return { success: false, levelId: levelId, lessonStarted: false };
    }
  }

  /**
   * 内部：拉取关卡 JSON（浏览器 fetch data/levels/level-{id}.json）
   * @private
   */
  async _fetchLevel(levelId) {
    if (typeof this._loadLevelOverride === 'function') {
      return this._loadLevelOverride(levelId);
    }
    if (typeof fetch === 'undefined') {
      throw new Error('fetch 不可用：请通过 options.loadLevel 提供自定义加载器');
    }
    const url = this._baseUrl + 'data/levels/level-' + levelId + '.json';
    // 2026-08-04：禁用浏览器缓存，保证关卡数据（含教学引导格）始终为服务器最新
    const resp = await fetch(url, { cache: 'no-store' });
    if (!resp.ok) {
      throw new Error('HTTP ' + resp.status + ' for ' + url);
    }
    return resp.json();
  }

  /**
   * 重新加载当前关卡（重置盘面与教学）
   * @returns {Promise}
   */
  async restartLevel() {
    try {
      if (this._currentLevelId === null) return null;
      return this.startLevel(this._currentLevelId);
    } catch (e) {
      console.warn('[GameApp] restartLevel error:', e);
      return null;
    }
  }

  // ============================================================
  //  教学系统
  // ============================================================

  /**
   * 构建并启动 LessonPlayer
   * @private
   * @returns {boolean} 是否启动
   */
  _startLesson() {
    try {
      const callbacks = {
        onPhaseChange: (phase, prev) => this.emitEvent('lessonPhase', { phase: phase, prev: prev }),
        onBubble: (text, speaker, voiceId) => this.emitEvent('bubble', { text: text, speaker: speaker, voiceId: voiceId }),
        onAction: (action) => this._applyLessonAction(action),
        onComplete: () => this._handleLessonComplete(),
        onSkip: () => this.emitEvent('lessonSkip'),
        onNeedInput: (type, info) => this.emitEvent('lessonNeedInput', { type: type, info: info }),
        onInputResult: (result, info) => this.emitEvent('lessonInputResult', { result: result, info: info }),
        onError: (phase, error) => this.emitEvent('lessonError', { phase: phase, error: error }),
        onAvalanche: (payload) => this.emitEvent('avalanche', payload),
      };

      try {
        this._lessonPlayer = new LessonPlayer({
          engine: this._engine,
          levelData: this._levelData,
          callbacks: callbacks,
          delay: this._lessonDelay,
        });
      } catch (e) {
        console.warn('[GameApp] LessonPlayer 构造失败，进入自由模式:', e);
        this._lessonPlayer = null;
        this.emitEvent('lessonError', { phase: 'init', error: e });
        return false;
      }

      if (!this._lessonPlayer) return false;
      const started = this._lessonPlayer.start();
      this.emitEvent('lessonStarted', { levelId: this._currentLevelId, started: started });
      return started;
    } catch (e) {
      console.warn('[GameApp] _startLesson error:', e);
      return false;
    }
  }

  /**
   * 跳过当前教学
   */
  skipLesson() {
    try {
      // v2.0：跳过教学时强制退出提示锁定模式（避免 _hintActive 残留卡死填数）
      if (this._hintActive) this.exitHintMode();
      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        this._lessonPlayer.skip();
        this._recordInteraction('lesson_skip', {});
        return true;
      }
      return false;
    } catch (e) {
      console.warn('[GameApp] skipLesson error:', e);
      return false;
    }
  }

  /**
   * 推进教学（intro/demo 阶段点击继续）
   * @returns {boolean}
   */
  advanceLesson() {
    try {
      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        return this._lessonPlayer.advance();
      }
      return false;
    } catch (e) {
      console.warn('[GameApp] advanceLesson error:', e);
      return false;
    }
  }

  /**
   * 获取当前教学状态
   * @returns {Object}
   */
  getLessonState() {
    try {
      if (!this._lessonPlayer) {
        return { active: false, phase: 'free', isWaitingInput: false };
      }
      return {
        active: this._lessonPlayer.isActive,
        phase: this._lessonPlayer.currentPhase,
        isWaitingInput: this._lessonPlayer.isWaitingInput,
        guidedTarget: this._lessonPlayer.getGuidedTarget ? this._lessonPlayer.getGuidedTarget() : null,
        interactionType: this._lessonPlayer.getInteractionType ? this._lessonPlayer.getInteractionType() : 'NUMBER',
      };
    } catch (e) {
      console.warn('[GameApp] getLessonState error:', e);
      return { active: false, phase: 'free', isWaitingInput: false };
    }
  }

  /**
   * 教学动作 -> 渲染/事件映射
   * @private
   */
  _applyLessonAction(action) {
    try {
      if (!action || !action.type) return;
      // Q12：记录当前动画步骤文案（AI 诊断实时显示）
      try { if (action.text) window.CM.hintLastStepText = action.text; } catch (eS) {}
      switch (action.type) {
        case 'highlightCell':
        case 'focusCell':
          if (action.enabled === false) {
            if (this._lessonFocusCell && this._lessonFocusCell.r === action.r && this._lessonFocusCell.c === action.c) {
              this._lessonFocusCell = null;
            }
            // V4.3.28：semiAuto 填对一格后移除该格脉冲（多格高亮支持）
            this.emitEvent('lessonPulseRemove', { r: action.r, c: action.c });
            break;
          }
          // 手感修复（P0）：聚光灯圆孔只跟随"目标格"——focusCell 或 pulse 模式
          // 的 highlightCell（guided/semiAuto 目标格）；普通 highlightCell（demo
          // 阶段的参考格/排除格）不再移动聚光灯——原实现每高亮一个参考格就移动
          // 圆孔，玩家看到聚光灯"追着参考格跑"偏离讲解目标格。
          if (action.type === 'focusCell' || action.mode === 'pulse') {
            this._lessonFocusCell = { r: action.r, c: action.c };
          }
          if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
            this._boardRenderer.setHighlight(action.r, action.c, 'selected');
          }
          // 讲解动画的逐格高亮（无 mode）与 guided 目标格（pulse）都做橙闪强调
          if (action.mode === 'conflict') {
            // 填错时的冲突格：红闪（game.html 处理）
            this.emitEvent('lessonAction', action);
          } else if (action.mode === 'pulse' || action.mode === undefined) {
            // sustained: guided 目标格持续粒子脉冲；demo 讲解格一次性橙闪
            this.emitEvent('lessonFocusPulse', { r: action.r, c: action.c, sustained: action.mode === 'pulse' });
          }
          break;
        case 'highlightRow':
          if (typeof action.row === 'number') this._lessonRows.add(action.row);
          break;
        case 'highlightCol':
          if (typeof action.col === 'number') this._lessonCols.add(action.col);
          break;
        case 'highlightBox':
          if (typeof action.box === 'number') this._lessonBoxes.add(action.box);
          break;
        case 'highlightCage':
          if (action.cageId !== undefined) {
            // 2026-08-04：解析完整笼数据（含 cells），让渲染层能填充笼范围
            this._lessonCage = { id: action.cageId };
            if (this._levelData && Array.isArray(this._levelData.cages)) {
              const found = this._levelData.cages.find((cg) => String(cg.id) === String(action.cageId));
              if (found) this._lessonCage = found;
            }
          }
          break;
        case 'clearAllHighlights':
          this._resetLessonVisuals();
          if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
            this._boardRenderer.setHighlight(null, null);
          }
          this.emitEvent('lessonClearHighlights', {});
          break;
        case 'freeze':
          this._lessonFrozen = action.enabled === true;
          break;
        case 'spotlight':
          this._lessonSpotlight = action.enabled ? (action.intensity || 0.4) : 0;
          this.emitEvent('lessonSpotlight', { enabled: action.enabled === true, intensity: action.intensity || 0.4 });
          break;
        case 'shakeCell':
        case 'highlightButton':
        case 'avalanche':
        default:
          this.emitEvent('lessonAction', action);
          break;
      }
    } catch (e) {
      console.warn('[GameApp] _applyLessonAction error:', e);
    }
  }

  /**
   * 教学完成回调
   * @private
   */
  _handleLessonComplete() {
    try {
      this.emitEvent('lessonComplete', { levelId: this._currentLevelId });
      // V4.3.32：教学完成时若盘面已被雪崩补满，立即触发盘面完成检测
      //（雪崩路径直接走 engine.fillCell，不经过 handleNumberInput，故需在此补检，
      //   否则雪崩补满后不弹结算画面）
      this._checkBoardComplete();
      if (!this._completed) {
        // 教学完成但盘面未完成：仅标记教学完成（不解除关卡锁定链）
        if (this._levelManager && typeof this._levelManager.markTeachingCompleted === 'function') {
          this._levelManager.markTeachingCompleted(this._currentLevelId);
        }
      }
    } catch (e) {
      console.warn('[GameApp] _handleLessonComplete error:', e);
    }
  }

  /**
   * 重置教学视觉状态
   * @private
   */
  _resetLessonVisuals() {
    this._lessonFocusCell = null;
    if (this._lessonRows) this._lessonRows.clear();
    if (this._lessonCols) this._lessonCols.clear();
    if (this._lessonBoxes) this._lessonBoxes.clear();
    this._lessonCage = null;
    this._lessonFrozen = false;
    this._lessonSpotlight = 0;
  }

  // ============================================================
  //  玩家操作编排
  // ============================================================

  /**
   * 点击格子：选中/取消选中
   * @param {number} r - 行（0-based）
   * @param {number} c - 列（0-based）
   * @returns {{success:boolean, selected:boolean, r:number, c:number}|null}
   */
  handleCellClick(r, c) {
    try {
      // Q17：提示动画播放中点棋盘 = 跳过演示（走 finishHintPlayback 完整清理：
      // 恢复热力图、hintPlaying=false、进入锁定模式）——原实现无此路径，
      // 点击后动画停在等待点击状态永久卡死，账本/热力图/后续提示全部失效
      if (window.CM && window.CM.hintPlaying) {
        try {
          const ac = this.getAnimationController();
          if (ac && typeof ac.skipHintSteps === 'function') {
            ac.skipHintSteps(); // 非静默 → 触发 onComplete（finishHintPlayback）
          }
        } catch (eAnim) {}
        // 兜底：若控制器没有完成回调（动画未真正播放/回调已消费），
        // 手动复位全部状态——否则 hintPlaying 卡 true、热力图卡 false、提示永久失效
        if (window.CM.hintPlaying) {
          window.CM.hintPlaying = false;
          this._hintSpotlight = 0;
          try { window.heatmapVisible = true; } catch (eH) {}
          try { if (window.CM.__savedHeatmapVisible !== undefined) window.CM.__savedHeatmapVisible = undefined; } catch (eS) {}
          this.render();
        }
      }

      const size = this._getGridSize();
      if (r < 0 || r >= size || c < 0 || c >= size) return null;

      // Step 8：玩家点棋盘任意格 → 清除调查高亮（不让笼高亮粘滞在棋盘上）
      if (this._ivCage) { this._ivCage = null; }

      // 微型教学锁定：只有目标格可选中
      if (this._hintActive && this._hintTarget) {
        if (r !== this._hintTarget[0] || c !== this._hintTarget[1]) {
          // v2.0：点非目标格 = 主动放弃提示——退出锁定并正常选中，
          // 由 exitHintMode 清理动画残留（黄/绿高亮 + 红叉），不再锁死玩家
          this.exitHintMode();
          // 继续走正常选中流程
        } else {
          return { success: true, selected: true, r: r, c: c };
        }
      }

      // V4.3.27：教学选中锁定——guided/noteToFill 只允许选中目标格，semiAuto 只允许选中 watchCells
      if (this._lessonPlayer && this._lessonPlayer.isActive
        && typeof this._lessonPlayer.canSelectCell === 'function') {
        const canSelect = this._lessonPlayer.canSelectCell(r, c);
        if (!canSelect) {
          this.emitEvent('blockedInput', { reason: 'lesson-locked', r: r, c: c });
          return { success: false, reason: 'lesson-locked' };
        }
      }

      if (!this._engine) return null;
      const state = this._engine.getState();
      if (!state || !state.cells) return null;
      const cell = state.cells[r] && state.cells[r][c];
      if (!cell) return null;

      if (this._selectedCell && this._selectedCell.r === r && this._selectedCell.c === c) {
        this._selectedCell = null;
        this._sameNumberCells = null;
        if (this._boardRenderer) this._boardRenderer.setHighlight(null, null);
        this.emitEvent('cellSelect', { r: r, c: c, selected: false });
        this.render();
        return { success: true, selected: false, r: r, c: c };
      }

      this._selectedCell = { r: r, c: c };

      // V4.3.19：点击已填数字格 → 高亮所有同数字格（含候选数含该数字的格）
      this._sameNumberCells = null;
      const cellValue = cell.fillNum || cell.fixedNum;
      if (cellValue) {
        const grid = state.cells;
        const matched = [];
        for (let rr = 0; rr < grid.length; rr++) {
          for (let cc = 0; cc < grid[rr].length; cc++) {
            const gcell = grid[rr] && grid[rr][cc];
            if (!gcell) continue;
            if ((gcell.fillNum || gcell.fixedNum) === cellValue) {
              matched.push([rr, cc]);
            }
          }
        }
        if (matched.length > 1) this._sameNumberCells = matched;
      }

      if (this._boardRenderer) this._boardRenderer.setHighlight(r, c, 'selected');
      this.emitEvent('cellSelect', { r: r, c: c, selected: true, cell: cell });
      this.render();
      return { success: true, selected: true, r: r, c: c };
    } catch (e) {
      console.warn('[GameApp] handleCellClick error:', e);
      return null;
    }
  }

  /**
   * Step 8：从 45 Panel 调查层高亮指定笼（临时不粘滞）。
   * 后续玩家点棋盘任意格即清除（见 handleCellClick）。
   * @param {number|string|null} cageId - 笼 id；null/undefined 清除高亮
   */
  focusInvestigationCage(cageId) {
    try {
      if (cageId == null) { this._ivCage = null; this.render(); return; }
      if (this._levelData && Array.isArray(this._levelData.cages)) {
        const found = this._levelData.cages.find((cg) => String(cg.id) === String(cageId));
        this._ivCage = found || { id: cageId };
      } else {
        this._ivCage = { id: cageId };
      }
      this.render();
    } catch (e) {
      console.warn('[GameApp] focusInvestigationCage error:', e);
    }
  }

  /**
   * Step 8：清除调查高亮。
   */
  clearInvestigationFocus() {
    this._ivCage = null;
    this.render();
  }

  /**
   * V4.3.19：长按数字键 → 高亮棋盘上所有同数字格
   * @param {number} num - 1~gridSize
   */
  setSameNumberHighlight(num) {
    try {
      const size = this._getGridSize();
      if (num < 1 || num > size) return;
      const state = this._engine ? this._engine.getState() : null;
      if (!state || !state.cells) return;
      const grid = state.cells;
      const matched = [];
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[r].length; c++) {
          const cell = grid[r] && grid[r][c];
          if (!cell) continue;
          if ((cell.fillNum || cell.fixedNum) === num) {
            matched.push([r, c]);
          }
        }
      }
      this._sameNumberCells = matched.length > 0 ? matched : null;
      this.render();
    } catch (e) {
      console.warn('[GameApp] setSameNumberHighlight error:', e);
    }
  }

  /**
   * 数字键输入：在当前选中格填数，并接入教学状态机 + 雪崩检查
   * @param {number} num - 1~9（或 1~gridSize）
   * @returns {Object}
   */
  handleNumberInput(num) {
    try {
      if (!this._selectedCell) {
        return { success: false, reason: 'no-selection' };
      }
      const { r, c } = this._selectedCell;

      if (!this._engine) return { success: false, reason: 'engine-unavailable' };
      const state = this._engine.getState();
      if (!state || !state.cells) return { success: false, reason: 'invalid-state' };
      const cell = state.cells[r] && state.cells[r][c];
      if (!cell) return { success: false, reason: 'invalid-cell' };
      if (cell.fixedNum) return { success: false, reason: 'fixed-cell' };
      const erasedNum = cell.fillNum || null;   // 4.7.3 书写动画：记录被擦除的数字供逆序动画

      // 微型教学提示模式：填数走 handleHintFill（正确退出 / 错误重播）
      if (this._hintActive) {
        return this.handleHintFill(r, c, num);
      }

      // 教学冻结检查
      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        const can = typeof this._lessonPlayer.canInteractCell === 'function'
          ? this._lessonPlayer.canInteractCell(r, c)
          : true;
        if (!can) {
          this.emitEvent('blockedInput', { reason: 'lesson-locked', r: r, c: c, num: num });
          return { success: false, reason: 'lesson-locked' };
        }
        // V4.3.27：WHAT_IF_ENTRY 引导阶段必须先进入假设模式才能填数
        const it = this._lessonPlayer.getInteractionType();
        const phase = this._lessonPlayer.currentPhase;
        if (phase === 'guided' && it === 'WHAT_IF_ENTRY') {
          const inWhatIf = this._whatIfManager && this._whatIfManager.isActive;
          if (!inWhatIf) {
            this.emitEvent('blockedInput', { reason: 'whatif-entry-required', r: r, c: c, num: num });
            this.emitEvent('toast', { text: I18n.t('ui.main.whatIfEntryRequired'), duration: 2200 });
            return { success: false, reason: 'whatif-entry-required' };
          }
        }
        // V4.3.27：NOTE_ONLY 引导阶段不允许直接填数，提示切换到笔记模式
        // （笔记模式下的数字键走 handleNoteToggle，不经过本方法）
        if (phase === 'guided' && it === 'NOTE_ONLY') {
          this.emitEvent('blockedInput', { reason: 'note-mode-required', r: r, c: c, num: num });
          this.emitEvent('toast', { text: I18n.t('ui.main.noteModeRequired'), duration: 2200 });
          return { success: false, reason: 'note-mode-required' };
        }
      }

      // 1. 引擎落子
      const res = this._engine.fillCell(r, c, num);
      if (!res.success) {
        this.emitEvent('blockedInput', { reason: res.error, r: r, c: c, num: num });
        return { success: false, reason: res.error };
      }

      // 1.1 判断填数正确性（combo / 专家系统依赖；solution 缺失时宽容降级为 true）
      const solCell = this._levelData && this._levelData.solution
        && this._levelData.solution[r] && this._levelData.solution[r][c];
      const isCorrect = (solCell === undefined || solCell === null) ? true : (solCell === num);

      // V4.3.33：410 任务压力——正常模式不允许犯错（只许 WhatIf 试错）。
      // 填错立即回滚不落盘，并引导玩家进入假设模式验证；WhatIf 激活时豁免。
      if (!isCorrect && this._currentLevelId === 410
          && !(this._whatIfManager && this._whatIfManager.isActive)) {
        try { this._engine.eraseCell(r, c); } catch (eE) {}
        this.emitEvent('toast', {
          text: I18n.t('ui.main.noErrorOutsideWhatIf'),
          duration: 2600
        });
        this.render();
        return { success: false, reason: '410-no-error-outside-whatif' };
      }

      // 2. 教学状态机（若活跃）
      let lesson = null;
      let lessonPhaseBefore = null;
      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        // 2026-08-04：先捕获填数前的教学阶段，再应用填数到状态机
        // （否则同步阶段过渡会读成后一阶段，导致 guided 完成被记成 semiAuto）
        lessonPhaseBefore = this._lessonPlayer.currentPhase || null;

        // 2026-08-05：WhatIf 模式下 semiAuto 阶段走 handleWhatIfCellFill
        // （在 WhatIf 中的填数应先确认再落盘，与正常填数区分）
        const isSemiAutoWhatIf = this._whatIfManager && this._whatIfManager.isActive
          && lessonPhaseBefore === 'semiAuto'
          && this._lessonPlayer.getInteractionType() === 'WHAT_IF_FILL';
        if (isSemiAutoWhatIf) {
          lesson = this._lessonPlayer.handleWhatIfCellFill(r, c, num);
        } else {
          lesson = this._lessonPlayer.handleCellFill(r, c, num);
        }
        // 3. 雪崩补全检查（手册 4.2.1）
        if (typeof this._lessonPlayer.checkAvalanche === 'function') {
          this._lessonPlayer.checkAvalanche();
        }
      }

      // 2026-08-04：记录玩家填数（AI 调试用）
      // lessonPhase 为填数前的教学阶段；lessonPhaseAfter 为状态机应用后的阶段
      this._recordMove('fill', r, c, num, {
        correct: isCorrect,
        lessonPhase: lessonPhaseBefore,
        lessonPhaseAfter: (this._lessonPlayer && this._lessonPlayer.currentPhase) || null,
      });
      // 2026-08-04：最优路径对比轨迹（无论正确与否都记，correct 标志用于对比）
      if (this._aiRecord) {
        this._aiRecord.pathMoves.push({ r, c, num, correct: isCorrect });
      }

      // 2026-08-04：WhatIf 模式下填数——新交互：快照由玩家点抽屉「＋」手动创建，
      // 填数只为最新快照打标签（if a1=9，每层只记第一个数字）；不再自动建快照
      if (this._whatIfManager && this._whatIfManager.isActive) {
        try {
          const labeled = this._whatIfManager.setLatestSnapshotLabel('if ' + String.fromCharCode(97 + r) + (c + 1) + '=' + num);
          // 动画规格：填数打标签成功 → 通知页面播放"数字飞入抽屉"动画
          if (labeled) {
            this.emitEvent('whatIfLabeled', { r: r, c: c, num: num, label: 'if ' + String.fromCharCode(97 + r) + (c + 1) + '=' + num });
          }
        } catch (e) { /* 打标签失败不影响填数 */ }
      }

      // Q6：热力图实时推算——盘面变化后清缓存，下次 render 立即重算当前可推格
      this._diffHeatCache = null;
      this.emitEvent('cellFill', { r: r, c: c, num: num, success: true, correct: isCorrect, lesson: lesson });
      // Loop②：填数后检测收敛（关联格笔记可能被清除/收敛）
      this._checkDeductions();
      this.render();
      this._checkBoardComplete();
      return { success: true, r: r, c: c, num: num, correct: isCorrect, lesson: lesson };
    } catch (e) {
      console.warn('[GameApp] handleNumberInput error:', e);
      return { success: false, reason: 'internal-error' };
    }
  }

  /**
   * 笔记切换：在指定格切换候选数，并接入教学状态机 + 雪崩检查
   * @param {number} r - 行（0-based）
   * @param {number} c - 列（0-based）
   * @param {number} num - 候选数字
   * @returns {Object}
   */
  handleNoteToggle(r, c, num) {
    try {
      const size = this._getGridSize();
      if (r < 0 || r >= size || c < 0 || c >= size || num < 1 || num > size) {
        return { success: false, reason: 'out-of-range' };
      }

      if (!this._engine) return { success: false, reason: 'engine-unavailable' };
      const state = this._engine.getState();
      if (!state || !state.cells) return { success: false, reason: 'invalid-state' };
      const cell = state.cells[r] && state.cells[r][c];
      if (!cell) return { success: false, reason: 'invalid-cell' };
      if (cell.fixedNum) return { success: false, reason: 'fixed-cell' };
      if (cell.fillNum) return { success: false, reason: 'has-fill' };

      // 微型教学提示模式：笔记被锁定
      if (this._hintActive) {
        this.emitEvent('blockedInput', { reason: 'hint-locked', r: r, c: c, num: num });
        return { success: false, reason: 'hint-locked' };
      }

      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        const can = typeof this._lessonPlayer.canInteractCell === 'function'
          ? this._lessonPlayer.canInteractCell(r, c)
          : true;
        if (!can) {
          this.emitEvent('blockedInput', { reason: 'lesson-locked', r: r, c: c, num: num });
          return { success: false, reason: 'lesson-locked' };
        }
      }

      // V4.3.25：hadNote 兼容 Set（board.candidates 为 Set，旧 Array 判断恒为 false）
      const hadNote = (cell.candidates instanceof Set)
        ? cell.candidates.has(num)
        : (Array.isArray(cell.candidates) && cell.candidates.indexOf(num) >= 0);

      const res = this._engine.toggleNote(r, c, num);
      if (!res.success) {
        this.emitEvent('blockedInput', { reason: res.error, r: r, c: c, num: num });
        return { success: false, reason: res.error };
      }

      let lesson = null;
      let lessonPhaseBefore = null;
      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        lessonPhaseBefore = this._lessonPlayer.currentPhase || null;
        lesson = this._lessonPlayer.handleNoteToggle(r, c, num, !hadNote);
        if (typeof this._lessonPlayer.checkAvalanche === 'function') {
          this._lessonPlayer.checkAvalanche();
        }
      }

      // 2026-08-04：笔记不建快照不打标签（快照仅由玩家点「＋」创建，填数打标签）
      this._recordMove('note', r, c, num, {
        added: !hadNote,
        lessonPhase: lessonPhaseBefore,
        lessonPhaseAfter: (this._lessonPlayer && this._lessonPlayer.currentPhase) || null,
      });

      this.emitEvent('noteToggle', { r: r, c: c, num: num, added: !hadNote, lesson: lesson });
      // V4.3.25（Spec v1.4）：笔记心理战——通知 AI 笔记变化
      try {
        const bm = window.battleManager;
        if (bm && bm.active && typeof bm.onNoteChanged === 'function') {
          bm.onNoteChanged(r, c, num, !hadNote);
        }
      } catch (e) {}
      // Loop②：笔记切换后检测收敛
      this._checkDeductions();
      this.render();
      return { success: true, added: !hadNote, r: r, c: c, num: num, lesson: lesson };
    } catch (e) {
      console.warn('[GameApp] handleNoteToggle error:', e);
      return { success: false, reason: 'internal-error' };
    }
  }

  /**
   * 擦除当前选中格（数字 + 笔记）
   * @returns {Object}
   */
  handleErase() {
    try {
      if (!this._selectedCell) {
        return { success: false, reason: 'no-selection' };
      }
      const { r, c } = this._selectedCell;

      if (!this._engine) return { success: false, reason: 'engine-unavailable' };
      const state = this._engine.getState();
      if (!state || !state.cells) return { success: false, reason: 'invalid-state' };
      const cell = state.cells[r] && state.cells[r][c];
      if (!cell) return { success: false, reason: 'invalid-cell' };
      if (cell.fixedNum) return { success: false, reason: 'fixed-cell' };

      // 微型教学提示模式：擦除被锁定
      if (this._hintActive) {
        this.emitEvent('blockedInput', { reason: 'hint-locked', r: r, c: c });
        return { success: false, reason: 'hint-locked' };
      }

      if (this._lessonPlayer && this._lessonPlayer.isActive) {
        const can = typeof this._lessonPlayer.canInteractCell === 'function'
          ? this._lessonPlayer.canInteractCell(r, c)
          : true;
        if (!can) return { success: false, reason: 'lesson-locked' };
      }

      // Q8：擦除前先取原值（eraseCell 会清空 fillNum；原代码引用未定义变量 → ReferenceError）
      const erasedNum = (cell && (cell.fillNum || 0)) || 0;

      const res = this._engine.eraseCell(r, c);
      if (!res.success) {
        this.emitEvent('blockedInput', { reason: res.error, r: r, c: c });
        return { success: false, reason: res.error };
      }

      // 2026-08-04：记录擦除操作（成功后才记录）
      this._recordMove('erase', r, c, null, {});

      // V4.3.25（Spec v1.4）：擦除后若清空笔记 → 通知 AI（声东击西伏笔）
      try {
        const bm = window.battleManager;
        if (bm && bm.active && typeof bm.onNoteChanged === 'function') {
          bm.onNoteChanged(r, c, null, false);
        }
      } catch (e) {}

      // Q6：热力图实时推算——擦除后清缓存，下次 render 立即重算
      this._diffHeatCache = null;
      this.emitEvent('cellErase', { r: r, c: c, num: erasedNum });
      // Loop②：擦除后检测收敛
      this._checkDeductions();
      this.render();
      return { success: true, r: r, c: c };
    } catch (e) {
      console.warn('[GameApp] handleErase error:', e);
      return { success: false, reason: 'internal-error' };
    }
  }

  /**
   * 注入 AI 调试补充上下文（页面层状态：mode/bubbleText/bgmId/elapsedSeconds 等）
   * @param {Object} ctx
   */
  setAiDebugContext(ctx) {
    if (ctx && typeof ctx === 'object') {
      this._aiCtx = Object.assign({}, this._aiCtx, ctx);
    }
  }

  /**
   * AI 调试：记录玩家操作（2026-08-04）
   * @private
   */
  _recordMove(type, r, c, num, extra) {
    try {
      if (!this._aiRecord) this._aiRecord = { levelId: this._currentLevelId, startedAt: Date.now(), initialBoard: null, cages: null, moves: [], completedAt: null };
      const size = this._getGridSize();
      this._aiRecord.moves.push(Object.assign({
        type: type,
        cell: { row: indexToRow(r), col: indexToCol(c) },
        num: num || null,
        ts: Date.now(),
        elapsedMs: this._aiRecord.startedAt ? (Date.now() - this._aiRecord.startedAt) : 0,
      }, extra || {}));
      // 上限保护（防止超长会话撑爆内存）
      if (this._aiRecord.moves.length > 5000) this._aiRecord.moves.splice(0, this._aiRecord.moves.length - 5000);
      // Q13：关卡进度自动保存——玩家跳出/刷新后重进可继续填
      try { this._saveLevelProgress(); } catch (e) {}
    } catch (e) { console.warn('[GameApp] _recordMove error:', e); }
  }

  /**
   * Q13：保存当前关卡进度（已填数字 + 笔记）到 localStorage
   * 玩家中途退出（返回目录/刷新）后重进，恢复盘面继续填。
   * @private
   */
  _saveLevelProgress() {
    try {
      if (!this._currentLevelId || !this._engine) return;
      const state = this._engine.getState();
      if (!state || !state.cells) return;
      const size = state.cells.length;
      if (!size || size > 12) return;
      const saved = { levelId: this._currentLevelId, ts: Date.now(), fills: [], notes: [] };
      for (let r = 0; r < size; r++) {
        const row = state.cells[r];
        if (!row) continue;
        for (let c = 0; c < size; c++) {
          const cell = row[c];
          if (!cell) continue;
          if (cell.fixedNum) continue; // 固定数无需保存
          if (cell.fillNum) saved.fills.push([r, c, cell.fillNum]);
          if (cell.notes && cell.notes.length) saved.notes.push([r, c, cell.notes.slice()]);
        }
      }
      try {
        localStorage.setItem('cagemaster4_level_progress_' + this._currentLevelId, JSON.stringify(saved));
      } catch (eS) {}
    } catch (e) { /* 静默 */ }
  }

  /**
   * Q13：恢复关卡进度（进入关卡时调用，重进继续填）
   * @returns {boolean} 是否恢复过
   * @private
   */
  _restoreLevelProgress() {
    try {
      if (!this._currentLevelId || !this._engine) return false;
      let raw = null;
      try { raw = localStorage.getItem('cagemaster4_level_progress_' + this._currentLevelId); } catch (eL) {}
      if (!raw) return false;
      const saved = JSON.parse(raw);
      if (!saved || saved.levelId !== this._currentLevelId) return false;
      let restored = false;
      (saved.fills || []).forEach(function (f) {
        try { this._engine.fillCell(f[0], f[1], f[2]); restored = true; } catch (e) {}
      }, this);
      (saved.notes || []).forEach(function (n) {
        try {
          if (this._engine.setNotes) this._engine.setNotes(n[0], n[1], n[2]);
          else if (this._engine.setCellNotes) this._engine.setCellNotes(n[0], n[1], n[2]);
        } catch (e) {}
      }, this);
      if (restored) {
        try { this.render(); } catch (eR) {}
      }
      return restored;
    } catch (e) { return false; }
  }

  /**
   * AI 调试：记录玩家与角色的互动（2026-08-04）
   * type: hint（提示）/ lesson_skip / pre_dialog / clear_dialog / level_complete 等
   * @private
   */
  _recordInteraction(type, data) {
    try {
      if (!this._aiRecord) return;
      this._aiRecord.interactions.push(Object.assign({
        ts: Date.now(),
        elapsedMs: this._aiRecord.startedAt ? (Date.now() - this._aiRecord.startedAt) : 0,
        type: type,
      }, data || {}));
      // 上限保护
      if (this._aiRecord.interactions.length > 2000) {
        this._aiRecord.interactions.splice(0, this._aiRecord.interactions.length - 2000);
      }
    } catch (e) { console.warn('[GameApp] _recordInteraction error:', e); }
  }

  /**
   * AI 调试：公共互动记录接口（页面层调用）
   * @param {string} type
   * @param {Object} [data]
   */
  recordInteraction(type, data) {
    try { this._recordInteraction(type, data); } catch (e) {}
  }

  /**
   * AI 调试：标记关卡完成（2026-08-04）
   * @private
   */
  _markLevelComplete() {
    try {
      if (this._aiRecord) this._aiRecord.completedAt = Date.now();
      // 2026-08-04：通关时计算最优路径对比（最优路径在页面回放时用 TechRater 求解，
      // 这里仅存用户轨迹，页面通过 getReplayData() 取回放所需数据）
      this._recordInteraction('level_complete', {});
      // Q13：过关后清除本关进度存档（新一局从头开始）
      try {
        if (this._currentLevelId) localStorage.removeItem('cagemaster4_level_progress_' + this._currentLevelId);
      } catch (e) {}
    } catch (e) {}
  }

  /**
   * 最优路径回放所需数据（2026-08-04）
   * 返回用户路径 + 关卡数据（求解器在回放时实例化）
   * @returns {{pathMoves: Array, levelData: Object|null}}
   */
  getReplayData() {
    try {
      return {
        pathMoves: (this._aiRecord && this._aiRecord.pathMoves) ? this._aiRecord.pathMoves.slice() : [],
        levelData: this._levelData || null,
        engine: this._engine || null,
      };
    } catch (e) {
      console.warn('[GameApp] getReplayData error:', e);
      return { pathMoves: [], levelData: null, engine: null };
    }
  }

  /**
   * 获取 AI 可读状态（纯函数，无副作用；JSON 可序列化）
   * 坐标统一 { row: 'a', col: 3 } 格式（行字母 a-i，列数字 1-9）
   * @returns {Object}
   */
  getAIReadableState() {
    try {
      const size = this._getGridSize();
      const state = this._engine ? this._engine.getState() : null;
      const cellsRaw = state && state.cells ? state.cells : null;
      const ctx = this._aiCtx || {};

      // ---- 1. 盘面 ----
      const cells = [];
      for (let r = 0; r < size; r++) {
        const row = [];
        for (let c = 0; c < size; c++) {
          const cell = (cellsRaw && cellsRaw[r] && cellsRaw[r][c]) || {};
          row.push({
            // 2026-08-04：固定格数字读 fixedNum（fillNum 只是玩家填数），否则面板棋盘固定格显示 0
            value: cell.fillNum || cell.fixedNum || 0,
            fixed: !!cell.fixedNum,
            notes: Array.isArray(cell.candidates) ? cell.candidates.slice() : [],
          });
        }
        cells.push(row);
      }

      // ---- 笼子 ----
      const cages = [];
      if (this._levelData && Array.isArray(this._levelData.cages)) {
        this._levelData.cages.forEach((cg, i) => {
          const cellsArr = (cg.cells || []).map((p) => {
            const pr = Array.isArray(p) ? p[0] : (p && p.row);
            const pc = Array.isArray(p) ? p[1] : (p && p.col);
            return { row: indexToRow(pr), col: indexToCol(pc) };
          });
          cages.push({
            id: (cg.id !== undefined && cg.id !== null) ? cg.id : i,
            sum: cg.sum || cg.target || cg.value || 0,
            cells: cellsArr,
          });
        });
      }

      // ---- 1.5 AI 关卡记录（2026-08-04）----
      const rec = this._aiRecord || { levelId: this._currentLevelId, startedAt: null, initialBoard: null, cages: null, moves: [], completedAt: null };
      // 初始盘面（预填格）——关卡开始时快照
      if (!rec.initialBoard) {
        const initCells = [];
        for (let r = 0; r < size; r++) {
          const row = [];
          for (let c = 0; c < size; c++) {
            const cell = (cellsRaw && cellsRaw[r] && cellsRaw[r][c]) || {};
            // 2026-08-04：固定格数字读 fixedNum（fillNum 只是玩家填数）
            const val = (cell.fixedNum != null) ? cell.fixedNum : 0;
            row.push({ value: val, fixed: !!cell.fixedNum });
          }
          initCells.push(row);
        }
        rec.initialBoard = initCells;
      }
      // 笼子结构（和值 + 格子）——关卡开始时快照
      if (!rec.cages) {
        rec.cages = cages.slice();
      }

      // 2026-08-04：教学计划摘要（AI 对照「引导目标 vs 实际完成」用）
      // 复用 core/ai-record.js（与 Node 测试驱动脚本同构）
      const lessonPlan = buildLessonPlanSummary((this._levelData && this._levelData.lessonPlan) || null);

      const record = {
        levelId: rec.levelId,
        gridSize: size,
        startedAt: rec.startedAt,
        completedAt: rec.completedAt,
        // 2026-08-04：关卡元信息 + 前置/通关对话全文 + 互动时间线 + 教学计划摘要（AI 可读）
        meta: rec.meta || null,
        preDialog: (rec.preDialog || []).slice(),
        clearDialog: (rec.clearDialog || []).slice(),
        lessonPlan: lessonPlan,
        initialBoard: rec.initialBoard,
        cages: rec.cages,
        moves: rec.moves.slice(),
        interactions: (rec.interactions || []).slice(),
        // 2026-08-04：教学事件遥测（phase 切换/气泡/guided 提示/填错/自动揭示/watchCells）
        lessonEvents: (this._lessonPlayer && typeof this._lessonPlayer.getLessonEvents === 'function')
          ? this._lessonPlayer.getLessonEvents()
          : [],
      };

      // ---- 2. 教学状态 ----
      const lp = this._lessonPlayer;
      const phase = (lp && lp.isActive) ? (lp.currentPhase || 'idle') : 'idle';
      let gt = null;
      if (lp && typeof lp.getGuidedTarget === 'function') {
        try { gt = lp.getGuidedTarget(); } catch (e) { gt = null; }
      }
      const guidedPlan = (this._levelData && this._levelData.lessonPlan &&
        this._levelData.lessonPlan.phases && this._levelData.lessonPlan.phases.guided) || null;
      const teaching = {
        phase: phase,
        isWaitingInput: !!(lp && lp.isWaitingInput),
        targetCell: (gt && gt.cell && gt.cell.length >= 2)
          ? { row: indexToRow(gt.cell[0]), col: indexToCol(gt.cell[1]) } : null,
        expectedValue: (gt && gt.value != null) ? gt.value : null,
        expectedNotes: (guidedPlan && Array.isArray(guidedPlan.expectedNote)) ? guidedPlan.expectedNote.slice() : [],
        attempts: (lp && typeof lp._guidedAttempts === 'number') ? lp._guidedAttempts : 0,
        maxAttempts: (guidedPlan && guidedPlan.maxAttempts) || 0,
      };

      // ---- 3. UI 状态 ----
      let focus = null;
      if (this._lessonFocusCell) focus = this._lessonFocusCell;
      else if (this._hintActive && this._hintTarget && this._hintTarget.length >= 2) {
        focus = { r: this._hintTarget[0], c: this._hintTarget[1] };
      } else if (this._selectedCell) focus = this._selectedCell;
      const ui = {
        selectedCell: this._selectedCell
          ? { row: indexToRow(this._selectedCell.r), col: indexToCol(this._selectedCell.c) } : null,
        highlights: {
          rows: this._lessonRows ? Array.from(this._lessonRows).map((r) => indexToRow(r)) : [],
          cols: this._lessonCols ? Array.from(this._lessonCols).map((c) => indexToCol(c)) : [],
          boxes: this._lessonBoxes ? Array.from(this._lessonBoxes) : [],
          cages: [],
          cells: focus ? [{ row: indexToRow(focus.r), col: indexToCol(focus.c) }] : [],
        },
        bubbleText: this._lastBubbleText || null,
        mode: ctx.mode || 'number',
      };

      // ---- 4. 音频状态 ----
      const audio = {
        bgmId: ctx.bgmId || null,
        volume: (typeof ctx.volume === 'number') ? ctx.volume : 1,
        isMuted: !!ctx.isMuted,
      };

      // ---- 5. 最后交互 ----
      const li = ctx.lastInteraction || null;
      const lastInteraction = {
        type: (li && li.type) || null,
        cell: (li && li.cell) || null,
        buttonId: (li && li.buttonId) || null,
        result: (li && li.result) || null,
        message: (li && li.message) || null,
        timestamp: (li && li.timestamp) || null,
      };

      // ---- 6. 统计 ----
      const v = (state && state.validation) || {};
      const stats = {
        filledCount: v.filledCount || 0,
        errorCount: v.errorCount || 0,
        elapsedSeconds: (typeof ctx.elapsedSeconds === 'number') ? ctx.elapsedSeconds : 0,
        levelId: this._currentLevelId,
        chapterId: ctx.chapterId || null,
      };

      return {
        gridSize: size,
        cells: cells,
        cages: cages,
        record: record,
        teaching: teaching,
        ui: ui,
        audio: audio,
        lastInteraction: lastInteraction,
        stats: stats,
        // Q16：当前激活的视觉元素清单（编号+名称+来源+参数）——AI 调试/诊断直接查看
        activeVisuals: Array.isArray(this._vizActive) ? this._vizActive : [],
      };
    } catch (e) {
      console.warn('[GameApp] getAIReadableState error:', e);
      return { gridSize: this._getGridSize(), cells: [], cages: [], teaching: {}, ui: {}, audio: {}, lastInteraction: {}, stats: {}, activeVisuals: [] };
    }
  }

  /**
   * 微型教学：判断格子是否可交互（提示锁定模式下只有目标格可操作）
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean}
   */
  canInteractCell(r, c) {
    if (!this._hintActive || !this._hintTarget) return true;
    return r === this._hintTarget[0] && c === this._hintTarget[1];
  }

  /**
   * 微型教学：进入提示锁定模式
   * @param {Array<number>} targetCell - [row, col]
   */
  startHintMode(targetCell) {
    try {
      this._hintActive = true;
      this._hintTarget = (Array.isArray(targetCell) && targetCell.length >= 2)
        ? [targetCell[0], targetCell[1]] : null;
      this._hintSpotlight = 0.35; // 保持轻微暗化（视觉提示锁定）
      this.emitEvent('hintModeStart', { target: this._hintTarget });
      this.render();
    } catch (e) {
      console.warn('[GameApp] startHintMode error:', e);
    }
  }

  /**
   * 微型教学：退出提示锁定模式
   */
  exitHintMode() {
    try {
      this._hintActive = false;
      this._hintTarget = null;
      this._hintSpotlight = 0;
      this._hintRetryCallback = null;
      // v2.0：清理教学/提示残留高亮（行/列/宫/笼/同数字）——否则色块残留覆盖棋盘
      this._resetLessonVisuals();
      // 清理 eliminate 标记与高亮
      if (this._boardRenderer) {
        if (typeof this._boardRenderer.clearEliminateMarks === 'function') {
          this._boardRenderer.clearEliminateMarks();
        }
        if (typeof this._boardRenderer.setHighlight === 'function') {
          this._boardRenderer.setHighlight(null, null);
        }
      }
      this.emitEvent('hintModeEnd');
      this.render();
    } catch (e) {
      console.warn('[GameApp] exitHintMode error:', e);
    }
  }

  /**
   * 微型教学：提示模式下的填数处理
   * 正确 -> 落子 + 退出锁定；错误 -> 不记录、不落子、触发重播回调
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 数字
   * @returns {Object}
   */
  handleHintFill(r, c, num) {
    try {
      // 目标格校验：仅允许填目标格
      if (this._hintTarget) {
        if (r !== this._hintTarget[0] || c !== this._hintTarget[1]) {
          // v2.0：点非目标格时退出提示锁定，转为普通自由填数——
          // 原逻辑持续锁死（只能填目标格），手机上填数被卡死；
          // 提示已完成演示，玩家有自由操作权
          this.exitHintMode();
          return this.handleNumberInput(num);
        }
      }

      const state = this._engine ? this._engine.getState() : null;
      const cell = state && state.cells && state.cells[r] && state.cells[r][c];
      if (!cell) return { success: false, reason: 'invalid-cell' };
      if (cell.fixedNum) return { success: false, reason: 'fixed-cell' };

      // 正确性判定
      const solCell = this._levelData && this._levelData.solution
        && this._levelData.solution[r] && this._levelData.solution[r][c];
      const isCorrect = (solCell === undefined || solCell === null) ? true : (solCell === num);

      if (isCorrect) {
        // 正确：落子（教学安全区，不触发连击/错误记录）
        const res = this._engine.fillCell(r, c, num);
        if (!res.success) {
          this.emitEvent('blockedInput', { reason: res.error, r: r, c: c, num: num });
          return { success: false, reason: res.error };
        }
        this.emitEvent('hintFillResult', { correct: true, r: r, c: c, num: num });
        // 清除 eliminate 标记后再退出，保持盘面干净
        if (this._boardRenderer && typeof this._boardRenderer.clearEliminateMarks === 'function') {
          this._boardRenderer.clearEliminateMarks();
        }
        this.exitHintMode();
        this._checkBoardComplete();
        this.render();
        return { success: true, correct: true, r: r, c: c, num: num };
      }

      // 错误：不落子、不记录、触发重播
      this.emitEvent('hintFillResult', { correct: false, r: r, c: c, num: num });
      if (typeof this._hintRetryCallback === 'function') {
        try { this._hintRetryCallback(r, c, num); } catch (e) { console.warn('[GameApp] hint retry error:', e); }
      }
      this.render();
      return { success: false, reason: 'hint-wrong', correct: false };
    } catch (e) {
      console.warn('[GameApp] handleHintFill error:', e);
      return { success: false, reason: 'internal-error' };
    }
  }

  /**
   * 微型教学：应用提示动作（渲染管道，兼容 LessonPlayer onAction 格式）
   * 支持 mode: 'pulse' | 'eliminate' | 'success'；区域/聚光灯复用教学视觉
   * @param {Object} action - hint-adapter 输出动作
   */
  applyHintAction(action) {
    try {
      if (!action || !action.type) return;
      // Q12：记录当前动画步骤文案（AI 诊断实时显示，提示动画走 applyHintAction）
      try { if (action.text) window.CM.hintLastStepText = action.text; } catch (eS) {}
      switch (action.type) {
        case 'highlightCell':
        case 'focusCell':
          this._lessonFocusCell = { r: action.r, c: action.c };
          // Q5：hint 动画逐步讲解——highlight 动作带的 text 也显示气泡
          // （原只有 narration 类型显示，而 HintAdapter 的动作全是 highlight 型，
          //   导致讲解气泡只在开头闪一下就被锁定模式顶掉）
          if (action.text) {
            this.emitEvent('lessonAction', {
              type: 'narration',
              text: action.text,
              speaker: action.speaker || I18n.t('ui.main.speakerIto'),
            });
          }
          if (action.mode === 'eliminate') {
            // 排除标记：红叉（累积显示所有被排除格）
            if (this._boardRenderer && typeof this._boardRenderer.setEliminateMark === 'function') {
              this._boardRenderer.setEliminateMark(action.r, action.c, true);
            }
          } else if (action.mode === 'success') {
            // Q18：reveal 用 'success' 类型（青墨绿）——原存 'highlighted' 与 pulse 混淆
            if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
              this._boardRenderer.setHighlight(action.r, action.c, 'success');
            }
          } else {
            // Q20：pulse 来源格高亮累积保持——讲解中所有已讲的证据格持续高亮，
            // 玩家可边听边对照全部证据（不再每步替换）；动画结束/退出提示时
            // 由 exitHintMode 统一清除（setHighlight(null,null) 清全部）
            if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
              this._boardRenderer.setHighlight(action.r, action.c, 'highlighted');
            }
          }
          break;
        case 'highlightRow':
          if (typeof action.row === 'number') this._lessonRows.add(action.row);
          break;
        case 'highlightCol':
          if (typeof action.col === 'number') this._lessonCols.add(action.col);
          break;
        case 'highlightBox':
          if (typeof action.box === 'number') this._lessonBoxes.add(action.box);
          break;
        case 'highlightCage':
          if (action.cageId !== undefined) this._lessonCage = { id: action.cageId };
          break;
        case 'spotlight':
          this._hintSpotlight = action.enabled ? (action.intensity || 0.4) : 0;
          // Q5：spotlight 的 intro 文案也走气泡（hint 第一步"看好了"）
          if (action.text) {
            this.emitEvent('lessonAction', {
              type: 'narration',
              text: action.text,
              speaker: action.speaker || I18n.t('ui.main.speakerIto'),
            });
          }
          break;
        case 'narration':
          // 逐格叙事：转发到页面层显示气泡（2026-08-03）
          this.emitEvent('lessonAction', action);
          break;
        case 'clearAllHighlights':
          this._resetLessonVisuals();
          if (this._boardRenderer && typeof this._boardRenderer.setHighlight === 'function') {
            this._boardRenderer.setHighlight(null, null);
          }
          this.emitEvent('lessonClearHighlights', {});
          break;
        default:
          break;
      }
      // v2.0：逐步人话讲解——HintAdapter 每步动作带 text（如"这格只剩一个数——填 5！"），
      // 原实现丢弃了 text，用户看不到动画讲解。有 text 时转发为叙事气泡。
      if (action.text) {
        this.emitEvent('lessonAction', { type: 'narration', text: action.text });
      }
      this.render();
    } catch (e) {
      console.warn('[GameApp] applyHintAction error:', e);
    }
  }

  /**
   * 微型教学：设置填错重播回调
   * @param {Function|null} cb - (r, c, num) => void
   */
  setHintRetryCallback(cb) {
    this._hintRetryCallback = (typeof cb === 'function') ? cb : null;
  }

  /**
   * 检查盘面是否完成，完成则标记进度
   * @private
   */
  _checkBoardComplete() {
    try {
      if (!this._engine) return;
      const state = this._engine.getState();
      if (!state || !state.validation || !state.validation.isComplete) return;
      if (this._completed) return;
      this._completed = true;

      if (this._levelManager && typeof this._levelManager.markLevelCompleted === 'function') {
        this._levelManager.markLevelCompleted(this._currentLevelId, { teachingCompleted: true });
      }
      this.emitEvent('levelComplete', { levelId: this._currentLevelId, state: state });
      this._markLevelComplete();
    } catch (e) {
      console.warn('[GameApp] _checkBoardComplete error:', e);
    }
  }

  // ============================================================
  //  渲染编排
  // ============================================================

  /**
   * 设置自定义特效提供者（页面按需提供 state.effects）
   * @param {Function|Object|null} provider - 函数 (app) => effectsState 或对象
   */
  setEffectsProvider(provider) {
    try {
      this._effectsProvider = provider;
    } catch (e) {
      console.warn('[GameApp] setEffectsProvider error:', e);
    }
  }

  /**
   * 设置 WhatIfManager（假设模式管理器，P1#6）
   * 注入后，玩家填数/擦除直接作用于 WhatIf 共享棋盘；
   * 页面通过 W 键切换模式、Enter 采纳、Backspace 回退。
   * @param {Object|null} manager - WhatIfManager 实例
   */
  setWhatIfManager(manager) {
    try {
      this._whatIfManager = manager;
      // 统一渲染回调：快照应用后重绘
      if (manager && typeof manager.setBoard === 'function' && this._engine) {
        manager.setBoard(this._engine.getBoard());
      }
      if (manager && typeof manager.setOnRender === 'function') {
        manager.setOnRender(() => this.render());
      }
    } catch (e) {
      console.warn('[GameApp] setWhatIfManager error:', e);
    }
  }

  /**
   * 获取 WhatIfManager
   * @returns {Object|null}
   */
  getWhatIfManager() {
    return this._whatIfManager;
  }

  /**
   * 全量渲染：棋盘 + 特效
   */
  // Q16：统一视觉输出登记表——所有棋盘视觉元素（高亮/色块/覆盖层）统一编号，
  // render() 时登记当前激活项，供 AI 调试/诊断直接查看"屏幕上有什么"，不再靠猜。
  // id: 编号；name: 名称；src: 来源（用户交互/教学/提示动画/boss战/常驻）
  static get VIZ_REGISTRY() {
    return {
      selectedCell:   { id: 'V01', name: '选中格',     src: '用户交互' },
      selectedRow:    { id: 'V02', name: '选中行',     src: '用户交互' },
      selectedCol:    { id: 'V03', name: '选中列',     src: '用户交互' },
      selectedBox:    { id: 'V04', name: '选中宫',     src: '用户交互' },
      selectedCage:   { id: 'V05', name: '选中笼',     src: '用户交互' },
      lessonRows:     { id: 'V06', name: '教学行',     src: '教学/提示' },
      lessonCols:     { id: 'V07', name: '教学列',     src: '教学/提示' },
      lessonBoxes:    { id: 'V08', name: '教学宫',     src: '教学/提示' },
      lessonCage:     { id: 'V09', name: '教学笼',     src: '教学/提示' },
      lessonFocus:    { id: 'V10', name: '教学焦点格', src: '教学/提示' },
      spotlight:      { id: 'V11', name: '聚光灯',     src: '教学/提示' },
      sameNumber:     { id: 'V12', name: '同数字高亮', src: '用户交互' },
      multiSelect:    { id: 'V13', name: '多选高亮',   src: '用户交互' },
      heatmap:        { id: 'V14', name: '难度热区',   src: '常驻' },
      ledger:         { id: 'V15', name: '45账本卡',   src: '常驻' },
      eliminateMarks: { id: 'V16', name: '排除标记',   src: '教学/提示' },
      whatIf:         { id: 'V17', name: '假设模式标记', src: '用户交互' },
      hintLock:       { id: 'V18', name: '提示锁定',   src: '教学/提示' },
      bossHotspots:   { id: 'V19', name: 'Boss关键格', src: 'boss战' },
      aiAttention:    { id: 'V20', name: 'AI注意力',   src: 'boss战' },
      tplHubs:        { id: 'V21', name: '据点',       src: 'boss战' },
      heatmapInf:     { id: 'V22', name: '影响力热图', src: 'boss战' },
    };
  }

  /**
   * Q16：收集当前激活的视觉元素（render 前调用）
   * @returns {Array<{id,name,detail,src,active}>}
   * @private
   */
  _collectActiveVisuals(renderState) {
    const out = [];
    const R = GameApp.VIZ_REGISTRY;
    const add = (key, detail, active) => {
      const meta = R[key];
      if (!meta) return;
      out.push({ id: meta.id, name: meta.name, src: meta.src, detail: detail || '', active: active !== false });
    };
    try {
      const H = (renderState.highlights || {});
      const anim = !!(window.CM && window.CM.hintPlaying);
      if (H.selectedCell) add('selectedCell', H.selectedCell.r + ',' + H.selectedCell.c);
      if (H.selectedRow !== undefined) add('selectedRow', String(H.selectedRow));
      if (H.selectedCol !== undefined) add('selectedCol', String(H.selectedCol));
      if (H.selectedBox !== undefined) add('selectedBox', String(H.selectedBox));
      if (H.selectedCage) add('selectedCage', '笼#' + (H.selectedCage.id !== undefined ? H.selectedCage.id : '?'));
      if (Array.isArray(H.rows) && H.rows.length) add('lessonRows', H.rows.join(','));
      if (Array.isArray(H.cols) && H.cols.length) add('lessonCols', H.cols.join(','));
      if (Array.isArray(H.boxes) && H.boxes.length) add('lessonBoxes', H.boxes.join(','));
      if (this._lessonFocusCell) add('lessonFocus', String.fromCharCode(97 + this._lessonFocusCell.r) + (this._lessonFocusCell.c + 1));
      if (this._hintSpotlight > 0) add('spotlight', String(this._hintSpotlight));
      if (Array.isArray(H.sameNumberCells) && H.sameNumberCells.length) add('sameNumber', H.sameNumberCells.length + '格');
      if (Array.isArray(H.multiSelectCells) && H.multiSelectCells.length > 1) add('multiSelect', H.multiSelectCells.length + '格');
      if (renderState.heatmapVisible !== false && renderState.difficultyHeatmap && renderState.difficultyHeatmap.length) add('heatmap', renderState.difficultyHeatmap.length + '格');
      // 常驻：45 账本卡
      try {
        const ffh = document.getElementById('fortyFiveHint');
        if (ffh && ffh.style.display !== 'none') add('ledger', ffh.offsetHeight + 'px高');
      } catch (eL) {}
      // 排除标记（渲染器内部状态，经 highlightCell eliminate 动作）
      if (this._hintActive) add('hintLock', '目标格' + (this._hintTarget ? this._hintTarget[0] + ',' + this._hintTarget[1] : ''));
      if (renderState.whatIf && renderState.whatIf.active) add('whatIf', '快照' + (renderState.whatIf.rootFilled ? renderState.whatIf.rootFilled.size : 0) + '格');
      // Boss 战
      if (renderState.hotspots && renderState.hotspots.length) add('bossHotspots', renderState.hotspots.length + '个');
      if (Array.isArray(renderState.aiAttention) && renderState.aiAttention.length) add('aiAttention', renderState.aiAttention.length + '格');
      if (Array.isArray(H.tplHubs) && H.tplHubs.length) add('tplHubs', H.tplHubs.length + '个');
      if (renderState.heatmap && (renderState.heatmap.cells || renderState.heatmap.length)) {
        const n = Array.isArray(renderState.heatmap) ? renderState.heatmap.length : (renderState.heatmap.cells ? renderState.heatmap.cells.length : 0);
        if (n) add('heatmapInf', n + '格');
      }
      // 动画中标记
      if (anim) out.push({ id: 'A1', name: '提示动画播放中', src: '教学/提示', detail: '', active: true });
    } catch (e) { /* 视觉收集容错 */ }
    return out;
  }

  /**
   * Loop② 推导响应：更新推导检测（触发 board 的 onNakedSingleReached → nakedSingle 事件）
   * 由填数/擦除/笔记切换等改变盘面的操作后调用。
   */
  _checkDeductions() {
    try {
      if (this._engine && typeof this._engine.refreshDeductions === 'function') {
        this._engine.refreshDeductions();
      }
    } catch (e) {
      console.warn('[GameApp] _checkDeductions error:', e);
    }
  }

  render() {
    try {
      if (!this._boardRenderer) return;
      if (!this._engine) return;

      const state = this._engine.getState();
      if (!state) return;
      const gridSize = this._getGridSize();
      const boxSize = Math.round(Math.sqrt(gridSize));

      const renderState = {
        size: gridSize,
        gridSize: gridSize,
        cells: state.cells,
        cages: (this._levelData && Array.isArray(this._levelData.cages)) ? this._levelData.cages : [],
        highlights: {},
      };

      // v2.0：WhatIf 假设模式——激活时传根快照已填数字位置集合（渲染器据此将
      // 假设中填入的数字画成紫罗兰斜体发光，与正常数字区分）
      try {
        const wm = this._whatIfManager;
        if (wm && wm.isActive && typeof wm.getRootSnapshot === 'function') {
          const root = wm.getRootSnapshot();
          if (root && root.cells) {
            const rootFilled = new Set();
            for (let r = 0; r < root.cells.length; r++) {
              const row = root.cells[r];
              for (let c = 0; c < row.length; c++) {
                if (row[c] && (row[c].fillNum || row[c].fixedNum)) rootFilled.add(r + ',' + c);
              }
            }
            renderState.whatIf = { active: true, rootFilled: rootFilled };
          }
        }
      } catch (e) { /* WhatIf 数据可选 */ }

      // 高亮行/列/宫（教学高亮优先）
      const focus = this._lessonFocusCell || this._selectedCell;
      if (focus) {
        renderState.highlights.selectedCell = { r: focus.r, c: focus.c };
        // Q10/Q13：提示动画/锁定模式中不叠加"选中格默认行列宫"高亮——
        // 整行整列整宫全填色会与教学高亮叠加成"一坨"，看不清重点。
        // 注意：动画播放期间 _hintActive 仍为 false（startHintMode 在播放结束后才置位），
        // 必须同时用全局 CM.hintPlaying 判断（否则修复失效，动画期间照样叠色）
        const animPlaying = !!(window.CM && window.CM.hintPlaying);
        if (!this._lessonFocusCell && !this._hintActive && !animPlaying) {
          renderState.highlights.selectedRow = focus.r;
          renderState.highlights.selectedCol = focus.c;
          renderState.highlights.selectedBox =
            Math.floor(focus.r / boxSize) * boxSize + Math.floor(focus.c / boxSize);
        }
        // 选中格所在笼子整体高亮（2026-08-03；提示动画/锁定模式下由教学笼高亮接管，避免叠色）
        if (!this._lessonFocusCell && !this._hintActive && !animPlaying) {
          const selCage = this._findCageAt(focus.r, focus.c);
          if (selCage) renderState.highlights.selectedCage = selCage;
        }
      }
      // 教学行/列/宫高亮（可叠加）
      if (this._lessonRows && this._lessonRows.size > 0) renderState.highlights.rows = Array.from(this._lessonRows);
      if (this._lessonCols && this._lessonCols.size > 0) renderState.highlights.cols = Array.from(this._lessonCols);
      if (this._lessonBoxes && this._lessonBoxes.size > 0) renderState.highlights.boxes = Array.from(this._lessonBoxes);
      // 教学笼高亮（优先于选中格所在笼）
      if (this._lessonCage) renderState.highlights.selectedCage = this._lessonCage;
      // Step 8：调查交互高亮（玩家从 45 Panel 点选证据/节点）——教学高亮优先，无教学时生效
      if (!this._lessonCage && this._ivCage) renderState.highlights.selectedCage = this._ivCage;
      // V4.3.19：同数字格高亮（点击数字格 / 长按数字键）
      // Q15：提示动画中不叠加——残留的同数字高亮（黄铜 0.20）在聚光灯下也是一坨
      if (this._sameNumberCells && this._sameNumberCells.length > 0 &&
          !(window.CM && window.CM.hintPlaying)) {
        renderState.highlights.sameNumberCells = this._sameNumberCells;
      }
      // V4.3.32：拖拽多选高亮（board.selectedCells > 1 时显示多选框；无焦点时仅第一格）
      try {
        const board = this._engine && this._engine.getBoard ? this._engine.getBoard() : null;
        if (board && board.selectedCells && board.selectedCells.length > 1) {
          renderState.highlights.multiSelectCells = board.selectedCells.map(s => [s.r, s.c]);
        }
      } catch (e) { /* 忽略 */ }

      // V4.3.23（Spec v1.2）：Boss 战关键格 + 影响力热力图
      try {
        const bm = window.battleManager;
        if (bm && bm.active) {
          if (bm._hotspots && bm._hotspots.length > 0) {
            renderState.hotspots = bm._hotspots;
          }
          const heatVisible = window.heatmapVisible !== false;
          renderState.heatmapVisible = heatVisible;
          if (heatVisible) {
            renderState.heatmap = this._getCachedHeatmap(bm);
          }
          // V4.3.24（Spec v1.3）：AI 蓄力锁定关键格（异步要塞防守视觉）
          if (bm._underSiege) {
            renderState.underSiege = bm._underSiege;
          }
          // V4.3.25（Spec v1.4）：AI 注意力图（淡红外发光）
          if (typeof bm.getAiAttention === 'function') {
            const att = bm.getAiAttention();
            if (att.length > 0) renderState.aiAttention = att;
          }
          // V4.3.32：tpl 据点渲染（v2.0：核心格定位 + 四维，隐藏据点未显现不显示）
          if (typeof bm.getTpl === 'function') {
            try {
              const tpl = bm.getTpl();
              if (tpl && typeof tpl.getHubState === 'function') {
                const hubs = tpl.getHubState();
                const castleIdx = tpl.getCastleHubIdx();
                if (Array.isArray(hubs) && hubs.length > 0) {
                  renderState.highlights.tplHubs = hubs.map((h, i) => ({
                    coreCell: h.coreCell || null,
                    visible: !!h.visible,
                    occupiedBy: h.occupiedBy || null,
                    playerCount: h.playerCount || 0,
                    aiCount: h.aiCount || 0,
                    castle: i === castleIdx,
                    dims: h.dims || null,
                  }));
                }
              }
            } catch (e) { /* tpl 数据可选 */ }
          }
          // CM4-R6.5B-1：据点污染层（冲突热度 → 闪烁/扭曲，Ghost 前置预警）
          // 手感修复：getPresentation() 单次计算、双处消费（污染层 + 战场视觉），消除每帧重复推理
          let presCache = null;
          if (typeof bm.getPresentation === 'function') {
            try {
              presCache = bm.getPresentation();
              if (presCache && presCache.pollution && presCache.pollution.cells) {
                renderState.pollution = presCache.pollution;
              }
            } catch (e) { /* 污染层可选 */ }
          }
          // CM4-Battlefield：战场表观视觉状态 → renderer 绘制（归属角标/落子轨迹/争夺残影/连线/压力/据点状态/爆发）
          try {
            const viz = window.CM && window.CM.battleViz;
            const tpl = typeof bm.getTpl === 'function' ? bm.getTpl() : null;
            if (viz && tpl && typeof tpl.getHubState === 'function') {
              const hubs = tpl.getHubState();
              const vizData = viz.build(hubs, presCache && presCache.heat ? presCache.heat : null);
              if (vizData) renderState.battlefield = vizData;
            }
          } catch (e) { /* 战场视觉可选 */ }
        }
      } catch (e) { /* Boss 战数据可选 */ }

      // v2.0：热区整合——一个开关（heatmapVisible）控制两种信息同时显示：
      // 难度热区（state.difficultyHeatmap 红黄绿色块=解题难度）+ 影响力（state.heatmap 蓝框=AI 目标）
      try {
        const heatVisible = window.heatmapVisible !== false;
        renderState.heatmapVisible = heatVisible;
        if (heatVisible) {
          renderState.difficultyHeatmap = this._getDifficultyHeatmap();
          const bm = window.battleManager;
          if (bm && bm.active && typeof this._getCachedHeatmap === 'function') {
            renderState.heatmap = this._getCachedHeatmap(bm);
          }
        }
      } catch (e) { /* 热区可选 */ }

      // Q16：登记当前激活视觉元素（AI 调试/诊断查看）
      try { this._vizActive = this._collectActiveVisuals(renderState); } catch (eV) { this._vizActive = []; }

      this._boardRenderer.render(renderState);

      // Cage Resolution Layer (Step 2)：调试浮层节流刷新（内部按 ~400ms 限频，仅可见时计算）
      try { if (window.CM && window.CM.cageDebug && window.CM.cageDebug.refresh) window.CM.cageDebug.refresh(); } catch (eC) {}

      // 特效层
      if (this._effectRenderer) {
        const fxState = this._buildEffectsState(state);
        if (fxState) this._effectRenderer.renderEffects(fxState);
      }
    } catch (e) {
      console.warn('[GameApp] render error:', e);
    }
  }

  /**
   * V4.3.23（Spec v1.2）：获取影响力热力图（500ms 节流缓存，避免每帧重算）
   * @private
   */
  _getCachedHeatmap(bm) {
    const now = Date.now();
    if (this._heatmapCache && this._heatmapCacheTs && now - this._heatmapCacheTs < 500) {
      return this._heatmapCache;
    }
    let map = null;
    try {
      const rater = bm._aiPlayer && bm._aiPlayer._rater;
      if (rater && typeof rater.getInfluenceMap === 'function') {
        map = rater.getInfluenceMap();
      }
    } catch (e) { map = null; }
    this._heatmapCache = map;
    this._heatmapCacheTs = now;
    return map;
  }

  /**
   * v2.0：难度热区（Heatmap）——绿/黄/红三色难度覆盖层数据
   * 用 TechRater 求解当前盘面：每格难度 = 解出该格的技巧级别（L1裸单→绿，
   * L10剑鱼→红）× 0.8 + 求解顺序归一化 × 0.4，再经三条心理学加权规则修正：
   *   1. 行/列/宫已填 ≥ size-2 → 该维度空格降为绿色（空间聚集加权）
   *   2. 候选数密度：候选 ≥7 红、≤2 绿（候选数密度兜底：≤2 且原红 → 黄）
   * 800ms 节流缓存（render 频繁调用时避免每帧重算）
   * @returns {Array} [{row, col, difficulty}] difficulty ∈ [0,1]
   * @private
   */
  _getDifficultyHeatmap() {
    const now = Date.now();
    if (this._diffHeatCache && this._diffHeatTs && now - this._diffHeatTs < 800) {
      return this._diffHeatCache;
    }
    let map = [];
    try {
      if (typeof window === 'undefined' || !window.TechRater) { this._diffHeatCache = map; this._diffHeatTs = now; return map; }
      const board = this._engine && this._engine.getBoard ? this._engine.getBoard() : null;
      if (!board || !board.cells) { this._diffHeatCache = map; this._diffHeatTs = now; return map; }
      const size = this._getGridSize();
      const rater = new window.TechRater(board);
      // Q6：热力图实时推算——当前盘面所有可推格（与提示系统同源，口径一致）。
      // 绿色 = 现在真的能推出的格（含公式/技巧信息）；影响力 ≥0.7 的高影响格更深绿。
      // 不再按"整盘求解链顺序"标色（那是静态难度，误导：绿格当前根本推不出）。
      let steps = [];
      try {
        if (typeof rater.findAllCurrentSteps === 'function') {
          steps = rater.findAllCurrentSteps();
        } else {
          const st = rater.findNextStep();
          if (st) steps = [st];
        }
      } catch (eSolve) { steps = []; }

      // 可推格 → 绿（difficulty 低）；影响力高 → 更深绿（difficulty 更低）
      const seen = new Set();
      map = [];
      for (const s of steps) {
        if (!s || typeof s.row !== 'number' || typeof s.col !== 'number') continue;
        if (seen.has(s.row + ',' + s.col)) continue;
        seen.add(s.row + ',' + s.col);
        const infl = (typeof s.influence === 'number') ? s.influence : 0;
        // 基础绿 0.2；高影响（≥0.7）→ 0.1 深绿；普通可推 0.3 亮绿
        const diff = infl >= 0.7 ? 0.12 : 0.3;
        map.push({ row: s.row, col: s.col, difficulty: diff, technique: s.technique || null, num: s.num || null });
      }
    } catch (e) {
      map = [];
    }
    this._diffHeatCache = map;
    this._diffHeatTs = now;
    return map;
  }

  /**
   * 构建特效状态
   * @private
   */
  _buildEffectsState(state) {
    try {
      let effects = null;
      if (typeof this._effectsProvider === 'function') {
        effects = this._effectsProvider(this);
      } else if (this._effectsProvider && typeof this._effectsProvider === 'object') {
        effects = this._effectsProvider;
      }

      // 聚光灯暗化（教学 + 微型教学提示）通过特效状态传递
      const spotlightIntensity = Math.max(this._lessonSpotlight, this._hintSpotlight || 0);
      if (spotlightIntensity > 0) {
        effects = effects || {};
        effects = Object.assign({}, effects, {
          spotlight: { intensity: spotlightIntensity },
        });
      }
      if (!effects) return null;

      return Object.assign({
        size: this._getGridSize(),
        cellSize: this._effectRenderer && this._effectRenderer._cellSize ? this._effectRenderer._cellSize : 60,
      }, { effects: effects });
    } catch (e) {
      console.warn('[GameApp] _buildEffectsState error:', e);
      return null;
    }
  }

  /**
   * 调整渲染尺寸
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {
    try {
      if (this._boardRenderer) this._boardRenderer.resize(width, height);
      if (this._effectRenderer) {
        this._effectRenderer.resize(width, height);
        // 特效层与棋盘行列标留白对齐
        if (this._boardRenderer && typeof this._boardRenderer.getPadding === 'function') {
          const pad = this._boardRenderer.getPadding();
          if (typeof this._effectRenderer.setBoardPadding === 'function') {
            this._effectRenderer.setBoardPadding(pad);
          }
        }
      }
    } catch (e) {
      console.warn('[GameApp] resize error:', e);
    }
  }

  // ============================================================
  //  动画循环
  // ============================================================

  /**
   * 启动渲染循环（浏览器 rAF；Node 环境自动跳过）
   */
  startLoop() {
    try {
      if (this._loopRunning || this._rafId !== null) return;
      if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
        return; // Node 环境：不启动循环
      }
      this._loopRunning = true;
      this._lastFrameTime = 0;

      const tick = (timestamp) => {
        if (!this._loopRunning) return;
        if (this._lastFrameTime === 0) this._lastFrameTime = timestamp;
        const deltaMs = Math.min(timestamp - this._lastFrameTime, 50);
        this._lastFrameTime = timestamp;

        if (this._animationController) {
          this._animationController.update(deltaMs / 1000);
        }
        this.render();
        this._rafId = window.requestAnimationFrame(tick);
      };

      this._rafId = window.requestAnimationFrame(tick);
    } catch (e) {
      console.warn('[GameApp] startLoop error:', e);
    }
  }

  /**
   * 停止渲染循环
   */
  stopLoop() {
    try {
      this._loopRunning = false;
      if (this._rafId !== null && typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(this._rafId);
      }
      this._rafId = null;
    } catch (e) {
      console.warn('[GameApp] stopLoop error:', e);
    }
  }

  // ============================================================
  //  状态查询
  // ============================================================

  /**
   * 获取引擎标准状态（getState()）
   * @returns {Object}
   */
  getState() {
    try {
      if (!this._engine) return { cells: null, validation: {} };
      return this._engine.getState();
    } catch (e) {
      console.warn('[GameApp] getState error:', e);
      return { cells: null, validation: {} };
    }
  }

  /**
   * 获取当前选中格
   * @returns {{r:number,c:number}|null}
   */
  getSelectedCell() {
    try {
      return this._selectedCell ? { r: this._selectedCell.r, c: this._selectedCell.c } : null;
    } catch (e) {
      console.warn('[GameApp] getSelectedCell error:', e);
      return null;
    }
  }

  /** 当前关卡 ID */
  getLevelId() {
    try {
      return this._currentLevelId;
    } catch (e) {
      return null;
    }
  }

  /** 当前关卡数据 */
  getLevelData() {
    try {
      return this._levelData;
    } catch (e) {
      return null;
    }
  }

  /** 是否已加载关卡 */
  isLevelLoaded() {
    try {
      return this._currentLevelId !== null && !!this._levelData;
    } catch (e) {
      return false;
    }
  }

  /** 关卡是否完成 */
  isLevelComplete() {
    try {
      return this._completed;
    } catch (e) {
      return false;
    }
  }

  // ---------------- 组件引用 ----------------
  getEngine() {
    try {
      return this._engine;
    } catch (e) {
      return null;
    }
  }

  getBoardRenderer() {
    try {
      return this._boardRenderer;
    } catch (e) {
      return null;
    }
  }

  getEffectRenderer() {
    try {
      return this._effectRenderer;
    } catch (e) {
      return null;
    }
  }

  getAnimationController() {
    try {
      return this._animationController;
    } catch (e) {
      return null;
    }
  }

  getPerformanceMonitor() {
    try {
      return this._performanceMonitor;
    } catch (e) {
      return null;
    }
  }

  getLevelManager() {
    try {
      return this._levelManager;
    } catch (e) {
      return null;
    }
  }

  getLessonPlayer() {
    try {
      return this._lessonPlayer;
    } catch (e) {
      return null;
    }
  }

  /**
   * 当前棋盘尺寸
   * @private
   */
  /**
   * 查找包含指定格子的笼子（点击格子时整体高亮用）
   * @param {number} r - 行索引
   * @param {number} c - 列索引
   * @returns {{id:*, cells:Array}|null}
   */
  _findCageAt(r, c) {
    try {
      if (!this._levelData || !Array.isArray(this._levelData.cages)) return null;
      for (let i = 0; i < this._levelData.cages.length; i++) {
        const cage = this._levelData.cages[i];
        if (!cage || !Array.isArray(cage.cells)) continue;
        for (let j = 0; j < cage.cells.length; j++) {
          const coord = cage.cells[j];
          const cr = Array.isArray(coord) ? coord[0] : (coord && coord.row);
          const cc = Array.isArray(coord) ? coord[1] : (coord && coord.col);
          if (cr === r && cc === c) {
            return { id: (cage.id !== undefined && cage.id !== null) ? cage.id : i, cells: cage.cells };
          }
        }
      }
    } catch (e) { console.warn('[GameApp] _findCageAt error:', e); }
    return null;
  }

  _getGridSize() {
    try {
      if (this._levelData && this._levelData.gridSize) return this._levelData.gridSize;
      if (this._engine && this._engine.board) return this._engine.board.size;
      return 9;
    } catch (e) {
      return 9;
    }
  }

  /**
   * 销毁：停止循环与教学，释放引用
   */
  destroy() {
    try {
      this.stopLoop();
      if (this._lessonPlayer && typeof this._lessonPlayer.destroy === 'function') {
        this._lessonPlayer.destroy();
      }
      if (this._animationController && typeof this._animationController.destroy === 'function') {
        this._animationController.destroy();
      }
      this._lessonPlayer = null;
      this._levelData = null;
      this._selectedCell = null;
    } catch (e) {
      console.warn('[GameApp] destroy error:', e);
    }
  }
}

export { GameApp };
export default GameApp;