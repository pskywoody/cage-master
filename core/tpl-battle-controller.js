// ============================================================
//  tpl-battle-controller.js - 三点连线（ThreePointLine）Boss 战 UI 控制器
// ============================================================
//  封装 ThreePointLineManager（tpl 核心逻辑）+ AIPlayerCore（AI 决策），
//  供 game.html 直接使用，接口与旧 BattleManager 兼容：
//    - start({ board, solution, opponent, onEnd })
//    - stop() / setPaused(bool)
//    - onPlayerFill(r, c, num, correct) / onPlayerUndo(r, c)
//    - getScoreProgress() / getFocus() / getStats()
//    - onPlayerFocusCell(r, c)
//  事件通过 onEvent(event, data) 上报（复用 TPL_EVENTS 常量，UI 层映射）。
//
//  环境约束：纯 ES Module；core/ 不依赖 renderer/ui；无 DOM。
// ============================================================

import { ThreePointLineManager, TPL_EVENTS } from './three-point-line-manager.js';
import { AIPlayerCore } from './battle-manager.js';
import { createBattleContext, toGameState, computeHubHeat, detectAIPressure, computePollution } from './battle-context.js';
import { Director } from './director.js';
import { IntentObserver } from './intent-observer.js';
import { DramaEventManager, selectConflictCandidates, DRAMA_EVENTS, selectCandidatesForHub } from './drama-event-manager.js';
import { DramaPlanner } from './drama-planner.js';
import { PollutionGhostDriver } from './drama-pollution.js';
import { getBossPack } from '../content/boss-content.js';
import { selectBossLine, resolveLocale } from './boss-line-selector.js';

// 兼容旧事件别名（UI 层 handleBattleEvent 复用）
export const TPL_BATTLE_EVENTS = Object.assign({}, TPL_EVENTS, {
  BATTLE_START: 'tpl_battle_start',
  BATTLE_END: 'tpl_battle_end',
  BOSS_BUBBLE: 'tpl_boss_bubble',
  COMBO_FEEDBACK: 'tpl_combo_feedback',
  PARTICLES: 'tpl_particles',
  SCORE_FLOAT: 'tpl_score_float',
  WARNING_OVERLAY: 'tpl_warning_overlay',
  FOCUS_UPDATE: 'tpl_focus_update',
  STRATEGY_CHANGE: 'tpl_strategy_change', // v2.0：AI 策略切换（HUD 显示当前策略）
  POLLUTION_WARNING: 'tpl_pollution_warning', // CM4-R7：据点污染 → 幽灵（战场危险可视化）
});

/**
 * tpl Boss 战控制器
 */
export class TplBattleController {
  constructor(options = {}) {
    this._onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this._logger = typeof options.logger === 'function' ? options.logger : () => {};
    this.active = false;
    this.ended = false;
    this._paused = false;
    this._tpl = null;
    this._ai = null;
    this._board = null;
    this._solution = null;
    this._opponent = null;
    this._onEndCallback = null;
    this._aiTimer = null;
    this._aiThinking = false;
    this._totalEmpty = 0;
    this._aiMoves = 0; // V4.3.32：AI 已落子次数（首次行动加速用）
    this._aiConsecutiveCorrect = 0; // v2.0：AI 连续填对数（动态错误率用）
    this._lastStrategy = null;       // v2.0：上次策略（切换检测）
    this._context = null;            // CM4-R1：统一战斗上下文（BattleContext）
    this._director = null;           // CM4-R2：对抗戏剧导演（shadow 模式，只记录不控制）
    this._directorShadow = options.directorShadow !== false; // 默认开启 shadow
    this._intentObserver = null;    // CM4-R4：意图观察器（从 OpponentObserver 升级）
    this._drama = null;              // CM4-R5：戏剧事件管理器（幽灵等）
    this._aiFocusStreak = [];        // CM4-R6.5-B：最近 N 步 AI 落子所在据点（Threat Preview 输入）
    this._dramaPlanner = null;       // CM4-R7-A：戏剧节拍规划器（Pressure 节拍 → 目标据点偏好）
    this._dramaDirective = null;     // CM4-R7-A：最近一次戏剧指令（供 Director/AI 消费）
    this._pollutionDriver = null;    // CM4-R7：污染驱动的幽灵调度器（连续争夺 → 幽灵）
    this._dramaActive = options.dramaActive !== false; // CM4-R7：战斗内自动触发冲突幽灵（默认开）
    this._bossPack = null;         // CM4-R7：当前 Boss 内容包（台词/阶段/反馈）
    this._lineLocale = options.locale || 'zh-CN'; // CM4-R7：台词语言（R8 接入 t() loader）
    this._lineCursors = {};        // CM4-R7：各事件台词游标（round-robin 去重）
    this._lastPhase = null;        // CM4-R7：阶段切换检测
  }

  /** 玩家手动连线触发绝杀（v2.0 6.1） */
  triggerLineWin() {
    try {
      if (!this._tpl || this.ended) return { success: false, reason: 'ended' };
      const res = this._tpl.triggerLineWin('player');
      return res;
    } catch (e) { return { success: false }; }
  }

  /** 玩家放弃绝杀（v2.0 6.2） */
  declineLine() {
    try {
      if (!this._tpl) return { success: false };
      return this._tpl.declineLine();
    } catch (e) { return { success: false }; }
  }

  /** 是否可绝杀（玩家侧） */
  canLineWin() {
    try {
      return this._tpl ? this._tpl.canLineWin('player') : false;
    } catch (e) { return false; }
  }

  /**
   * 启动 tpl Boss 战
   * @param {Object} params
   * @param {Object} params.board - HeadlessEngine 的 Board 实例（与 GameApp 共享）
   * @param {number[][]} params.solution - 唯一解
   * @param {Object} params.opponent - { id, name, color, speedMin, speedMax, personality, ... }
   * @param {Function} params.onEnd - (result, opponent, stats) => void
   */
  start(params) {
    try {
      this.stop();
      this._board = params.board;
      this._solution = params.solution;
      this._opponent = params.opponent || {};
      this._onEndCallback = typeof params.onEnd === 'function' ? params.onEnd : null;

      const tpl = new ThreePointLineManager(this._board, this._solution, {
        onEvent: (event, data) => this._handleTplEvent(event, data),
        logger: this._logger,
        enableComboMomentum: true,
        enableHomeField: true,
      });
      this._tpl = tpl;

      // 计算总空格数
      let total = 0;
      for (let r = 0; r < this._board.size; r++) {
        for (let c = 0; c < this._board.size; c++) {
          const cell = this._board.cells?.[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum) total++;
        }
      }
      this._totalEmpty = total;

      // 创建 boss AI（人格映射：yingying→ying 等）
      const aiKey = this._personalityKeyForBoss(this._opponent.id);
      this._ai = new AIPlayerCore(this._board, aiKey, (r, c) => null, false, true);
      this._ai.syncFromBoard(this._board);
      if (typeof this._ai.setOwnershipGrids === 'function') {
        this._ai.setOwnershipGrids(tpl.getPlayerOwnedGrid(), tpl.getAIOwnedGrid());
      }

      // CM4-R2：注入 Director（默认 Shadow 模式，只记录建议不改行为）。
      // 由 AIPlayerCore._runDirector() 在 think() 内自动调用，此处只做装配。
      if (this._directorShadow) {
        const personalityKey = aiKey; // 与 AI 人格一致
        this._director = new Director({ personality: personalityKey });
        this._director.enableShadow();
        if (typeof this._ai.setDirector === 'function') {
          this._ai.setDirector(this._director, true);
        }
      }

      // CM4-R4：实例化意图观察器（消费 AI 内置 OpponentObserver 的输出，
      // 升级为高层意图：attackingHub/defendingHub/chasingLine/riskLevel）。
      // 当前阶段：仅挂在 controller 上供 BattleContext/Director 使用，不改 AI 行为。
      this._intentObserver = new IntentObserver({ intensity: 1.0 });

      // CM4-R7-A：实例化戏剧节拍规划器（Pressure 节拍检测）。
      // 消费 IntentObserver 的高层意图，产出 shift_pressure 指令 → 目标据点偏好。
      this._dramaPlanner = new DramaPlanner({ threshold: 3, historyCap: 8 });
      this._dramaDirective = null;

      // CM4-R7：加载当前 Boss 内容包（台词/阶段/反馈），按 opponent.id 匹配，未配置回退通用包。
      this._bossPack = getBossPack(this._opponent.id);
      this._lineLocale = resolveLocale(this._opponent.locale || this._lineLocale);
      this._lineCursors = {};
      this._lastPhase = null;

      // CM4-R5：戏剧事件管理器（GhostThreat 等）。
      // 第一版默认禁用（相当于 shadow）——不主动生成幽灵，
      // 仅提供 tryDramaGhost() 接口供 Director/调试调用。
      this._drama = new DramaEventManager({
        addGhost: (r, c, side) => {
          if (tpl && typeof tpl.addGhostCell === 'function') {
            tpl.addGhostCell(r, c, side);
          }
        },
        removeGhost: (r, c, side) => {
          if (tpl && typeof tpl.removeGhostCell === 'function') {
            tpl.removeGhostCell(r, c, side);
          }
        },
        onEvent: (event, data) => this._onEvent(event, data || {}),
        cooldown: 4000,
        maxGhosts: 2,
      });
      this._drama.setEnabled(false); // 默认 shadow：不自动生成
      // CM4-R7：DramaEvent Active——启用污染驱动的冲突幽灵。
      // 幽灵只在"连续争夺的污染据点"里生成（不是随机/AI 犯错），
      // 成为战场危险状态的可视化。dramaActive=false 可关闭。
      this._drama.setEnabled(this._dramaActive);
      this._pollutionDriver = new PollutionGhostDriver({ minStage: 2, minTurns: 3 });
      this._pollutionDriver.reset();

      this.active = true;
      this.ended = false;
      this._aiFocusStreak = []; // R6.5-B：开局清空聚焦轨迹

      // 上报战斗开始
      this._onEvent(TPL_BATTLE_EVENTS.BATTLE_START, {
        opponent: this._opponent,
        hubBlocks: tpl.getHubBlocks(),
        castleHubIdx: tpl.getCastleHubIdx(),
        preDialog: null,
      });

      // 启动 AI 行动循环
      this._scheduleAiMove();
      return true;
    } catch (e) {
      console.warn('[TplBattle] start error:', e);
      this.active = false;
      this.ended = true;
      return false;
    }
  }

  /** bossId → AIPlayerCore 人格 key */
  _personalityKeyForBoss(bossId) {
    const map = {
      'yingying': 'blind',       // 薇拉 → blind
      'yan': 'expert',           // 山田 → expert
      'cagekeeper': 'mentor',
      'shenmo': 'prober',
      'plotter': 'average',
      'plotterShadow': 'average',
      'remnant': 'steady',
      'weaver': 'steady',
      'setterSecret': 'average',
      'boss': 'blind',
    };
    return map[bossId] || 'steady';
  }

  /** 玩家填数（由 GameApp 落子后调用——UI 先落盘，tpl 后仲裁归属） */
  onPlayerFill(r, c, num, correct) {
    if (!this._tpl || this.ended) return;
    try {
      const cell = this._board?.cells?.[r]?.[c];
      // UI 主链路已先 engine.fillCell 落子；tpl 的 _processFill 会因
      // cell.fillNum 已存在而返回 already_filled。故先临时清除 fillNum
      // 让 tpl 完成归属仲裁（tpl 正常路径不写盘），仲裁后还原 fillNum。
      const hadFill = !!(cell && cell.fillNum);
      const savedFill = hadFill ? cell.fillNum : null;
      if (cell && cell.fillNum) delete cell.fillNum;
      const res = this._tpl.onPlayerFill(r, c, num);
      // 还原 fillNum（tpl 只标记归属，不写盘；数字由 GameApp 侧持有）
      if (cell && savedFill != null && !cell.fillNum) {
        cell.fillNum = savedFill;
      }
      // I1/O1（CM4-A2）：tpl 路径补充观察器输入——玩家落子喂给 AI 对手分析
      if (this._ai && typeof this._ai.updateObserver === 'function') {
        const hubIdx = this._tpl.getHubBlockIndex ? this._tpl.getHubBlockIndex(r, c) : undefined;
        this._ai.updateObserver({ r, c, hubIdx });
      }
      this._syncAiState();
      // CM4-R7：污染驱动的冲突幽灵调度（玩家落子也可能抬升争夺 → 幽灵）
      this._drivePollutionGhost();
      return res;
    } catch (e) {
      console.warn('[TplBattle] onPlayerFill:', e);
      return { success: false };
    }
  }

  /** 玩家撤销 */
  onPlayerUndo(r, c) {
    // tpl 无撤销接口（所有权实时归属），占位兼容
    try { this._syncAiState(); } catch (e) {}
  }

  /** 玩家凝视（AI 抢格前的焦点提示）——tpl 无需拦截，占位 */
  onPlayerFocusCell(r, c) {}

  /** 暂停/恢复 AI（教学期间暂停） */
  setPaused(paused) {
    this._paused = !!paused;
    if (this._paused) {
      if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    } else if (this.active && !this.ended && this._aiTimer === null && !this._aiThinking) {
      this._scheduleAiMove();
    }
  }

  /** 是否暂停中 */
  isPaused() {
    return !!this._paused;
  }

  /** 停止战斗 */
  stop() {
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    // CM4-R5：清理戏剧事件定时器
    if (this._drama) { try { this._drama.clearAll(); } catch (e) {} }
    this.active = false;
    this.ended = true;
    this._ai = null;
  }

  /** HUD 进度（兼容旧 getScoreProgress） */
  getScoreProgress() {
    if (!this._tpl) return null;
    const stats = this._tpl.getStats();
    const total = this._totalEmpty || 1;
    const filled = stats.playerOwned + stats.aiOwned;
    return {
      playerPercent: total > 0 ? stats.playerOwned / total : 0,
      aiPercent: total > 0 ? stats.aiOwned / total : 0,
      playerScore: stats.playerOwned,
      aiScore: stats.aiOwned,
      winScore: total,
      maxScore: total,
    };
  }

  /** 专注值（兼容旧接口，tpl 无专注返回 0） */
  getFocus() {
    return { player: 0, ai: 0 };
  }

  /** 统计 */
  getStats() {
    return this._tpl ? this._tpl.getStats() : null;
  }

  getTpl() {
    return this._tpl;
  }

  /**
   * CM4-R2：获取最近一次 Director 决策（HUD / 调试）。
   * shadow 模式下仍返回建议值（不代表实际行为）。
   * @returns {Object|null} { phase, strategyId, strategyName, params, lock, released }
   */
  getDirectorDecision() {
    if (this._ai && typeof this._ai.getDirectorDecision === 'function') {
      return this._ai.getDirectorDecision();
    }
    return null;
  }

  /**
   * CM4-R2：获取 Director Shadow 校准汇总（建议 vs 实际策略分布）。
   * 战斗结束后调用，输出 ε 校准所需的统计。
   * @returns {Object|null} { total, recommendVsActual, gatedCount, phaseDist, perStrategy }
   */
  getDirectorShadowSummary() {
    if (this._director && typeof this._director.summarizeShadow === 'function') {
      return this._director.summarizeShadow();
    }
    return null;
  }

  /**
   * CM4-R4：获取玩家意图推断（由 IntentObserver 基于对手观察器输出升级）。
   * @returns {Object|null} { attackingHub, defendingHub, chasingLine, riskLevel, confidence, strategy }
   */
  getPlayerIntent() {
    if (this._intentObserver) {
      return this._intentObserver.getIntent();
    }
    return null;
  }

  /**
   * CM4-R5：尝试触发一次戏剧幽灵事件（GhostThreat）。
   * 从冲突最激烈的据点里选空格生成，不侵占玩家格。
   * 默认禁用（shadow 模式），需先 setDramaEnabled(true) 开启。
   *
   * @param {Object} [params]
   * @param {string} [params.side='boss'] - 'player' | 'boss' 幽灵归属于哪一方
   * @param {string} [params.phase] - 阶段（默认从 context 读取）
   * @param {number} [params.topKHubs=1] - 选冲突度前 K 的据点
   * @returns {Object|null} 成功返回 { r, c, side, durationMs }
   */
  tryDramaGhost(params = {}) {
    if (!this._drama || !this._tpl || !this._board) return null;
    try {
      const ctx = this.getContext();
      const phase = params.phase || (ctx && ctx.drama && ctx.drama.phase) || 'development';
      const side = params.side || 'boss';
      const topKHubs = params.topKHubs || 1;
      const candidates = selectConflictCandidates(this._tpl, this._board, topKHubs, 6);
      return this._drama.trySpawnGhost({
        side,
        phase,
        candidateCells: candidates,
        durationMs: params.durationMs, // 透传自定义时长
      });
    } catch (e) {
      console.warn('[TplBattle] tryDramaGhost:', e);
      return null;
    }
  }

  /** CM4-R5：启用/禁用戏剧事件生成（默认禁用） */
  setDramaEnabled(enabled) {
    if (this._drama) this._drama.setEnabled(enabled);
  }

  /** CM4-R5：获取戏剧事件管理器实例（调试/扩展用） */
  getDramaManager() {
    return this._drama || null;
  }

  /**
   * CM4-R7：污染驱动的冲突幽灵调度（战场危险可视化）。
   * 每步计算据点污染，由 PollutionGhostDriver 判定"连续争夺达到阈值"，
   * 在污染据点内生成幽灵。幽灵只来自冲突、只占空格、不覆盖玩家。
   * 从 getDramaManager 之外也可通过本方法单独驱动。
   * @returns {Object|null} 成功生成返回 { r, c, hubIndex, stage, turns }；否则 null
   */
  _drivePollutionGhost() {
    if (!this._drama || !this._drama.isEnabled()) return null;
    if (!this._pollutionDriver || !this._tpl || !this._board) return null;
    const ctx = this.getContext();
    if (!ctx) return null;
    const heat = computeHubHeat(ctx);
    const pollution = computePollution(ctx, heat);
    const target = this._pollutionDriver.tick(pollution);
    if (!target) return null;
    const phase = (ctx.drama && ctx.drama.phase) || 'development';
    const cells = selectCandidatesForHub(this._tpl, this._board, target.hubIndex, 4);
    const spawned = this._drama.trySpawnGhost({
      side: 'boss',
      phase,
      candidateCells: cells,
    });
    if (spawned) {
      this._onEvent(TPL_BATTLE_EVENTS.POLLUTION_WARNING, {
        hubIndex: target.hubIndex,
        stage: target.stage,
        turns: target.turns,
        r: spawned.r,
        c: spawned.c,
      });
      // CM4-R7：污染事件台词（Boss 把"这里正在失控"说出来）
      const pLine = this._bossEventLine('pollution');
      if (pLine) this._bossSay(pLine.text);
      return { r: spawned.r, c: spawned.c, hubIndex: target.hubIndex, stage: target.stage, turns: target.turns };
    }
    return null;
  }

  /** V5 4.4：玩家是否可填此格（AI 占领格仅红叉窗口可抢占） */
  canPlayerFillCell(r, c) {
    try {
      if (!this._tpl || this.ended) return true;
      return this._tpl.canPlayerFillCell(r, c);
    } catch (e) { return true; }
  }

  // ==================== 内部：AI 驱动 ====================

  _syncAiState() {
    if (!this._tpl || !this._ai) return;
    try {
      if (typeof this._ai.setOwnershipGrids === 'function') {
        this._ai.setOwnershipGrids(this._tpl.getPlayerOwnedGrid(), this._tpl.getAIOwnedGrid());
      }
      // CM4-R1：经 BattleContext 统一构建状态（单一数据面），再投影为
      // AIPlayerCore.setGameState 兼容的扁平对象。行为与原手拼一致。
      this._context = createBattleContext({
        tpl: this._tpl,
        board: this._board,
        solution: this._solution,
        totalEmpty: this._totalEmpty,
        aiConsecutiveCorrect: this._aiConsecutiveCorrect,
        opponent: this._opponent,
        step: this._aiMoves,
      });
      // CM4-R4：用 IntentObserver 推断玩家意图，写入 BattleContext.player.intent
      // （当前阶段：只读，不改 AI 内部分析；供 Director/StrategyPool 消费）
      if (this._intentObserver) {
        const rawAnalysis = (typeof this._ai.getOpponentAnalysis === 'function')
          ? this._ai.getOpponentAnalysis()
          : null;
        if (rawAnalysis) {
          const intent = this._intentObserver.infer(rawAnalysis, this._context);
          this._context.player.intent = intent;

          // CM4-R7-A：Drama Planner 消费玩家意图 → 产出戏剧指令（Pressure 节拍）。
          // 检测到玩家单翼胶着时产出 shift_pressure，给出目标据点偏好。
          // 经 setDramaDirective 注入 AI，Director 在 decide() 内消费（shadow 或调制）。
          if (this._dramaPlanner) {
            const directive = this._dramaPlanner.plan(intent, this._context);
            this._dramaDirective = directive;
            if (directive && typeof this._ai.setDramaDirective === 'function') {
              this._ai.setDramaDirective(directive);
            }
          }
        }
      }
      if (typeof this._ai.setGameState === 'function') {
        this._ai.setGameState(toGameState(this._context));
      }
      this._ai.syncFromBoard(this._board);
      // v2.0：策略切换检测——变化时发 BOSS_BUBBLE（AI 意图可视化）
      this._checkStrategyChange();
      // CM4-R7：阶段切换检测——变化时发阶段台词（Boss 描述战局走向）
      this._checkPhaseChange();
    } catch (e) {}
  }

  /**
   * CM4-R1：获取当前统一战斗上下文（供 Director/StrategyPool/Observer 消费）。
   * 若尚未构建（战斗未开始/同步前），返回创建一个基于当前 tpl 的实时上下文。
   * @returns {Object} BattleContext
   */
  getContext() {
    if (!this._context) {
      this._syncAiState();
    }
    return this._context || null;
  }

  /**
   * CM4-R6.5：把 AI 内部状态翻译成 UI 可直接渲染的呈现视图。
   * 不泄露具体落子，只暴露战场方向语言：
   *   - heat     : 每个据点冲突热度分级（0-3，○/🔥/🔥🔥/🔥🔥🔥）
   *   - threat   : AI 是否持续施压某据点（只提示战场方向，不提示格子）
   *   - pollution: 据点污染分级（冲突热度 → 闪烁/扭曲，Ghost 前置预警层）
   * @returns {Object|null} { heat, threat, pollution }
   */
  getPresentation() {
    try {
      const ctx = this.getContext();
      if (!ctx) return null;
      const heat = computeHubHeat(ctx);
      const threat = detectAIPressure(ctx, this._aiFocusStreak);
      const pollution = computePollution(ctx, heat);
      return { heat, threat, pollution };
    } catch (e) {
      console.warn('[TplBattle] getPresentation:', e);
      return null;
    }
  }

  /**
   * CM4-R7：从当前 Boss 内容包挑一句台词（事件驱动，round-robin 去重）。
   * @param {string} event - 'phase'|'strategy'|'pollution'|'pressure'|'line_win'|'line_steal'|'playerWin'|'playerLose'|'draw'
   * @param {Object} [extra] - { phase, strategy }
   * @returns {{key:string, text:string}|null}
   */
  _bossEventLine(event, extra = {}) {
    if (!this._bossPack) return null;
    const sel = selectBossLine({
      pack: this._bossPack,
      event,
      phase: extra.phase,
      strategy: extra.strategy,
      locale: this._lineLocale,
      cursors: this._lineCursors,
    });
    if (!sel) return null;
    this._lineCursors[event] = sel.nextCursor;
    return { key: sel.key, text: sel.text };
  }

  /** CM4-R7：发 Boss 台词气泡 */
  _bossSay(text, name) {
    this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
      text,
      name: name || (this._opponent && this._opponent.name) || 'Boss',
    });
  }

  /**
   * v2.0 / CM4-R7：AI 策略切换 → 台词气泡（Boss 意图让玩家可感知）。
   * 文案来自 Boss 内容包；未覆盖时回退内置缺省。
   */
  _checkStrategyChange() {
    try {
      if (!this._ai || typeof this._ai.getStrategy !== 'function') return;
      const s = this._ai.getStrategy();
      if (s.strategy === this._lastStrategy) return;
      this._lastStrategy = s.strategy;
      const line = this._bossEventLine('strategy', { strategy: s.strategy });
      const fallback = {
        attack: '这个据点我要定了！',
        defend: '先守住我的地盘！',
        global: '不管据点了，我先填满！',
        counter: '敢动我的据点？反击！',
      };
      this._bossSay(line ? line.text : (fallback[s.strategy] || '计划有变！'));
      // 策略状态变化事件（HUD 显示当前策略）
      this._onEvent(TPL_BATTLE_EVENTS.STRATEGY_CHANGE, {
        strategy: s.strategy,
        label: s.label,
        targetHub: s.targetHub,
      });
    } catch (e) {}
  }

  /**
   * CM4-R7：阶段切换 → 台词（opening/development/crisis/climax）。
   * 让"这场仗走到哪一步"第一次被 Boss 说出来。
   */
  _checkPhaseChange() {
    try {
      if (!this._context || !this._context.drama) return;
      const phase = this._context.drama.phase;
      if (!phase || phase === this._lastPhase) return;
      this._lastPhase = phase;
      const line = this._bossEventLine('phase', { phase });
      if (line) this._bossSay(line.text);
    } catch (e) {}
  }

  _countFilled() {
    let n = 0;
    for (let r = 0; r < this._board.size; r++) {
      for (let c = 0; c < this._board.size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (cell && (cell.fillNum || cell.isAiFilled)) n++;
      }
    }
    return n;
  }

  _countEmpty() {
    let n = 0;
    for (let r = 0; r < this._board.size; r++) {
      for (let c = 0; c < this._board.size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (cell && !cell.fixedNum && !cell.fillNum) n++;
      }
    }
    return n;
  }

  _scheduleAiMove() {
    if (!this.active || this.ended || this._paused) return;
    const opp = this._opponent || {};
    const min = opp.speedMin != null ? opp.speedMin : 3500;
    const max = opp.speedMax != null ? opp.speedMax : 7000;
    // V4.3.32：首次行动加速——AI 还没落子时用短延迟（~0.6-1.3s）快速入场，
    // 否则教学结束玩家自由阶段快速填完（几秒内），3.5s+ 冷却的 AI 一次都没动
    // 就被玩家收工，观感是"boss 战对手从不填数"。
    let delay;
    if (this._aiMoves === 0) {
      delay = Math.min(min, 600 + Math.random() * 700);
    } else {
      delay = min + Math.random() * (max - min);
    }
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      this._aiMove();
    }, delay);
  }

  _aiMove() {
    if (!this.active || this.ended) return;
    if (this._paused) { this._aiTimer = null; return; }
    if (this._aiThinking) return;
    this._aiThinking = true;

    try {
      if (!this._ai || !this._tpl) { this._aiThinking = false; return; }
      this._syncAiState();

      // v2.0 6.1：AI 绝杀决策——已占领全部 3 据点且棋盘满
      // 领先 → 立即连线；落后 → 放弃连线继续填；持平 → 50% 连线
      if (this._tpl.canLineWin('boss')) {
        const stats = this._tpl.getStats();
        const decide = (() => {
          if (stats.aiOwned > stats.playerOwned) return true;
          if (stats.aiOwned < stats.playerOwned) return false;
          return Math.random() < 0.5;
        })();
        if (decide) {
          const res = this._tpl.triggerLineWin('boss');
          this._aiThinking = false;
          if (res && res.success) {
            this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
              text: '三点连线！绝杀！',
              name: this._opponent.name || 'Boss',
            });
          }
          return;
        } else {
          // 落后/放弃连线 → 全局解题判定
          this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
            text: '不连线了，我继续填！',
            name: this._opponent.name || 'Boss',
          });
          this._tpl.declineLine();
          this._aiThinking = false;
          return;
        }
      }

      const step = this._ai.think();
      if (!step) {
        // v2.0：AI 无可填格（棋盘满）——若处于可绝杀等待且非己方绝杀权，
        // 放弃连线走全局解题，避免 _lineReady 悬空不结束
        try {
          if (this._tpl && this._tpl.isLineReady && this._tpl.isLineReady()) {
            const side = this._tpl.getLineReadySide && this._tpl.getLineReadySide();
            if (side !== 'boss') {
              this._tpl.declineLine();
              this._aiThinking = false;
              return;
            }
          }
        } catch (e) {}
        this._aiThinking = false;
        this._scheduleAiMove();
        return;
      }

      // 笔记操作：不落盘，直接继续
      if (step.isNote || step.type === 'note') {
        this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
          text: (step.isFake ? '假' : '') + '笔记…',
          name: this._opponent.name || 'Boss',
        });
        this._aiThinking = false;
        this._scheduleAiMove();
        return;
      }

      const { row, col, num } = step;
      const cell = this._board.cells?.[row]?.[col];
      if (!cell || cell.fixedNum) {
        this._aiThinking = false;
        this._scheduleAiMove();
        return;
      }

      // 幽灵格抢占：允许对已填格填数
      const isGhostSteal = step.techniqueName === 'ghost_steal';
      if (cell.fillNum && !isGhostSteal) {
        this._aiThinking = false;
        this._scheduleAiMove();
        return;
      }

      // tpl 仲裁
      const tplRes = this._tpl.onAIFill(row, col, num);
      if (!tplRes.success) {
        this._aiThinking = false;
        this._scheduleAiMove();
        return;
      }

      // 落盘（幽灵抢占先清除 fillNum）
      // V4.3.32：AI 填数对玩家不可见（防作弊）——不写 fillNum，仅标记
      // isAiFilled/_aiNum/_aiMistake，渲染器据此画 Boss 色幽灵格（对=小点/错=问号）。
      if (isGhostSteal && cell.fillNum) delete cell.fillNum;
      cell.isAiFilled = true;
      cell._aiNum = this._solution?.[row]?.[col] ?? null;
      cell._aiMistake = cell._aiNum !== null && num !== cell._aiNum;
      this._aiMoves++; // V4.3.32：落子成功计数（首次行动加速判定）
      // CM4-R6.5-B：记录本次 AI 落子所在据点（推进 Threat Preview 聚焦轨迹）
      try {
        const focusHub = (typeof this._tpl.getHubBlockIndex === 'function')
          ? this._tpl.getHubBlockIndex(row, col) : -1;
        this._aiFocusStreak.push({ hubIndex: focusHub });
        if (this._aiFocusStreak.length > 8) this._aiFocusStreak.shift();
      } catch (e) {}
      // 通知 UI 重绘（值对齐旧 BATTLE_EVENTS.BOARD_CHANGED='board_changed'）
      this._onEvent('board_changed', { board: this._board, aiFill: true, r: row, c: col });

      // v2.0 5.2：AI 连续填对数跟踪（连对3次动态错误率×0.8）
      const isCorrect = this._solution?.[row]?.[col] === num;
      this._aiConsecutiveCorrect = isCorrect ? (this._aiConsecutiveCorrect + 1) : 0;
      this._syncAiState();
      // CM4-R7：污染驱动的冲突幽灵调度（连续争夺 → 幽灵）
      this._drivePollutionGhost();
      this._aiThinking = false;

      // 检查结束
      if (this._tpl.isEnded()) {
        this._finish();
        return;
      }
      this._scheduleAiMove();
    } catch (e) {
      console.warn('[TplBattle] aiMove:', e);
      this._aiThinking = false;
      this._scheduleAiMove();
    }
  }

  // ==================== 内部：tpl 事件转发 + 结算 ====================

  _handleTplEvent(event, data) {
    // V4.3.32：玩家路径结束（填满盘面 / 三点连线 / 强制结算）——tpl 内部
    // _endGame 只发 GAME_END，控制器的 _finish() 之前仅在 AI 落子路径检查 isEnded，
    // 玩家填最后一格时结算从不触发（无结算动画/无 onEnd）。统一在此捕获。
    if (event === TPL_BATTLE_EVENTS.GAME_END) {
      this._finish();
      return;
    }
    // v2.0：可绝杀等待且绝杀权在 AI——立即连线（不等 AI 定时器，
    // 否则教学暂停/定时器未调度时玩家填满后会无限等待不结束）
    if (event === TPL_BATTLE_EVENTS.LINE_READY && data && data.side === 'boss') {
      try {
        if (this._tpl && typeof this._tpl.triggerLineWin === 'function') {
          const res = this._tpl.triggerLineWin('boss');
          if (res && res.success) {
            this._onEvent(TPL_BATTLE_EVENTS.THREE_POINT_LINE, { side: 'boss' });
            this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
              text: '三点连线！绝杀！',
              name: this._opponent && this._opponent.name ? this._opponent.name : 'Boss',
            });
            return;
          }
        }
      } catch (e) {}
      // 连线失败（异常兜底）→ 走全局解题，避免悬空
      try { if (this._tpl && typeof this._tpl.declineLine === 'function') this._tpl.declineLine(); } catch (e2) {}
      return;
    }
    // 透传给 UI 层（handleBattleEvent）
    this._onEvent(event, data || {});
  }

  _finish() {
    if (this.ended) return;
    this.ended = true;
    this.active = false;
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }

    const winner = this._tpl.getWinner();
    const path = this._tpl.getWinPath();
    const stats = this._tpl.getStats();
    const result = winner === 'player' ? 'win' : (winner === 'boss' ? 'lose' : 'draw');

    // CM4-R7：胜负反馈台词（Boss 内容包）
    const fb = this._bossEventLine(result === 'win' ? 'playerWin' : (result === 'lose' ? 'playerLose' : 'draw'));
    if (fb) this._bossSay(fb.text);

    this._onEvent(TPL_BATTLE_EVENTS.BATTLE_END, {
      winner,
      winPath: path,
      playerCount: stats.playerOwned,
      aiCount: stats.aiOwned,
      playerHubs: stats.playerHubs,
      aiHubs: stats.aiHubs,
      result,
      // CM4-R2：Director Shadow 校准汇总（shadow 模式下仅记录，不改行为）
      directorShadow: this.getDirectorShadowSummary(),
    });

    if (this._onEndCallback) {
      this._onEndCallback(result, this._opponent, { stats, winPath: path });
    }
  }
}

export default TplBattleController;
