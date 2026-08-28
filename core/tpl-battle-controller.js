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

import { ThreePointLineManager, TPL_EVENTS } from './three-point-line-manager.js?v=92';
import { AIPlayerCore } from './battle-manager.js';
import { AI_PERSONALITIES } from './ai-player-core.js';
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

// ------------------------------------------------------------
// CM4-R8：DifficultyProfile——Boss 战难度档位（AI 执行层 + 戏剧干预层）。
// 设计准则：不降低 Solver/Director 的"聪明感"，而是给 AI 叠加人类化失误
// 并减少戏剧性压迫；难度越低，AI 越像"会犯错的高手"，而非"慢动作陪你练"。
//   solver      求解能力保留度 0~1（决定看穿局面的洞察力/拦截率）
//   maxTech     解析/搜索深度上限（candidateDepth；越大越能看深看全）
//   mistakeRate 人类化失误率（越大越常miss明显机会）
//   perceptionNoise 认知偏差：偶尔误判哪个据点更危险
//   fixationRate 贪心固化：偶尔晚一回合才切换进攻路线
//   reactionDelay 响应延迟：玩家换路后 AI 观察 N 步才调整
//   speed       节奏系数（1=自然节奏，不再人为拖慢；>1 偏慢 <1 偏快）
//   director    戏剧干预强度 0~1（Director 施压/切策略的频率，高难度才有"导演感"）
//   dramaStage/dramaTurns 污染/幽灵触发门槛（越大越晚触发，视觉压力越小）
//   talkRate    AI 意图/失误对白频率 0~1（有什么用"会犯错的对手"自己说出来）
//
//  ---- Human Rhythm Layer（CM4-R9：战斗节奏层，改动"跨度"而非"强弱"）----
//   rhythm       玩家动作数/1 次 AI 行动（数字驱动玩家的思考窗口；越大 AI 越少打扰）
//   telegraphRate 普通落子的预告概率（蓄力→警告→玩家回应→落子）
//   intentLockRate 命中玩家当前聚焦格时预告/留窗口的概率（不精准狙击玩家）
//   telegraphDelay 读秒窗口毫秒（越长玩家越来得及抢先抢回或被预告）
// ------------------------------------------------------------
const TPL_DIFFICULTY_PROFILES = {
  easy: {
    solver: 0.55, maxTech: 4, mistakeRate: 0.22,
    perceptionNoise: 0.45, fixationRate: 0.45, reactionDelay: 2,
    speed: 1.0, director: 0.2, dramaStage: 3, dramaTurns: 4, talkRate: 0.22,
    rhythm: 3, telegraphRate: 0.35, intentLockRate: 0.7, telegraphDelay: 1600,
  },
  normal: {
    solver: 0.78, maxTech: 6, mistakeRate: 0.10,
    perceptionNoise: 0.22, fixationRate: 0.2, reactionDelay: 1,
    speed: 0.95, director: 0.5, dramaStage: 2, dramaTurns: 3, talkRate: 0.35,
    rhythm: 2, telegraphRate: 0.3, intentLockRate: 0.5, telegraphDelay: 1200,
  },
  hard: {
    solver: 1.0, maxTech: 8, mistakeRate: 0.03,
    perceptionNoise: 0.0, fixationRate: 0.0, reactionDelay: 0,
    speed: 0.9, director: 0.9, dramaStage: 2, dramaTurns: 3, talkRate: 0.55,
    rhythm: 1, telegraphRate: 0.2, intentLockRate: 0.25, telegraphDelay: 800,
  },
};
const TPL_DIFFICULTY_DEFAULT = 'easy';

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
    // CM4-R8：难度档——不再用"整体放慢节奏"造难度（那会显得"放水等你赢"）。
    // _tplAISlow 保留为纯节奏系数，默认取自难度档 speed（≈1 自然节奏）。
    this._difficulty = options.difficulty || TPL_DIFFICULTY_DEFAULT;
    this._profileOverrides = options.profile || null;
    this._profile = this._resolveProfile();
    this._tplAISlow = this._profile.speed || 1.0;
    this._totalEmpty = 0;
    this._aiMoves = 0; // V4.3.32：AI 已落子次数（首次行动加速用）
    // CM4-R9：Human Rhythm Layer——战斗节奏（玩家思考窗口）状态
    this._playerMovesSinceAi = 0;    // 距上次 AI 行动的玩家填数次数（rhythm 门槛用）
    this._lastAiMoveAt = 0;          // 上次 AI 实际行动时间戳（节奏兜底防死锁）
    this._playerIntentCell = null;   // {r,c} 玩家最近聚焦格（意图锁/预告用）
    this._deferTimer = null;         // 预告读秒窗口计时器（蓄力→玩家回应→落子）
    this._lastBubbleAt = 0;          // CM4-R9：Boss 台词冷却（防对话遮挡棋盘）
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
    this._playerPollutionThrottleTs = null; // 手感修复：玩家路径污染计算节流时间戳
    this._battleLog = [];          // V4.4：对战记录（玩家 vs AI 全过程，供 ai-debug 复盘）
    this._aiFallbackCount = 0;     // V4.4：兜底填子计数（每局封顶，防止 AI 霸版）
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
      this._ai = new AIPlayerCore(this._board, this._buildWeakenedAI(aiKey, this._profile), (r, c) => null, false, true);
      // CM4-R8：把难度档喂给 AI 执行层（人类化失误模型：认知偏差/贪心固化/反应延迟 + maxTech/mistakeRate）
      if (typeof this._ai.setDifficultyProfile === 'function') {
        this._ai.setDifficultyProfile(this._profile);
      }
      this._ai.syncFromBoard(this._board);
      if (typeof this._ai.setOwnershipGrids === 'function') {
        this._ai.setOwnershipGrids(tpl.getPlayerOwnedGrid(), tpl.getAIOwnedGrid());
      }

      // CM4-R2：注入 Director。shadow 仅决定"是否只记录建议"：
      //   shadow=true  → enableShadow()，setDirector(director, true)，不改 AI 行为（默认，安全校准）
      //   shadow=false → 不 enableShadow，setDirector(director, false)，Director 决策经
      //                  StrategySelector 钳制后真正下发旋钮（戏剧导演激活，R6 完整链路）
      // 由 AIPlayerCore._runDirector() 在 think() 内自动调用，此处只做装配。
      {
        const personalityKey = aiKey; // 与 AI 人格一致
        // CM4-R8：Director 的施压强度由难度档 director 决定（低难度少强行施压/切策略）。
        // eps 反映允许的激进上浮量：强度越高越允许高激进策略通过 ε Gate。
        const dir = this._profile.director != null ? this._profile.director : 0.2;
        this._director = new Director({
          personality: personalityKey,
          epsStrategy: 0.05 + dir * 0.25,
          // 低难度更频繁锁定短策略、高难度允许更长策略锁（连续叙事施压）
          lockMin: Math.round(2 + dir * 2),
          lockMax: Math.round(3 + dir * 5),
        });
        if (this._directorShadow) this._director.enableShadow();
        if (typeof this._ai.setDirector === 'function') {
          this._ai.setDirector(this._director, this._directorShadow);
        }
      }

      // CM4-R4：实例化意图观察器（消费 AI 内置 OpponentObserver 的输出，
      // 升级为高层意图：attackingHub/defendingHub/chasingLine/riskLevel）。
      // CM4-R8：intensity 由难度档 solver 决定——低难度"读心"更弱（不总知道你在冲哪）。
      this._intentObserver = new IntentObserver({ intensity: 0.5 + 0.5 * (this._profile.solver || 0.55) });

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
      this._pollutionDriver = new PollutionGhostDriver({
        minStage: this._profile.dramaStage != null ? this._profile.dramaStage : 3,
        minTurns: this._profile.dramaTurns != null ? this._profile.dramaTurns : 4,
      });
      this._pollutionDriver.reset();

      this.active = true;
      this.ended = false;
      this._aiFocusStreak = []; // R6.5-B：开局清空聚焦轨迹
      // V4.3.35：boss 战报统计——结算统计（战报卡用）。此前 tpl 模式无连击/看破/
      // 失误统计，导致战报卡四项全 0；这里在控制器层轻量累积，不动 tpl 核心。
      this._startTime = Date.now();
      this._playerCombo = 0;          // 玩家当前连击
      this._bestCombo = 0;            // 玩家最高连击
      this._counterCount = 0;         // 看破：纠正 AI 犯错格
      this._aiMistakeCount = 0;       // AI 失误次数
      this._playerMistakeCount = 0;   // 玩家失误次数
      this._stealCount = 0;           // 反抢（抢回 AI 填的格）

      // V4.4：对战记录——清空上局日志，记录本局开始
      this._battleLog = [];
      this._aiFallbackCount = 0;
      this._logBattle('start', {
        opponentId: this._opponent.id || null,
        opponentName: this._opponent.name || 'Boss',
        personality: aiKey,
        totalEmpty: this._totalEmpty,
        boardSize: this._board.size,
      });

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

  // CM4-R8：解析当前难度档 profile（支持构造 options.profile 按旋钮覆写）
  _resolveProfile() {
    const base = TPL_DIFFICULTY_PROFILES[this._difficulty] || TPL_DIFFICULTY_PROFILES[TPL_DIFFICULTY_DEFAULT];
    const p = Object.assign({}, base);
    if (this._profileOverrides && typeof this._profileOverrides === 'object') {
      for (const k in this._profileOverrides) {
        if (this._profileOverrides[k] != null) p[k] = this._profileOverrides[k];
      }
    }
    return p;
  }

  /** 当前难度档名 */
  getDifficulty() { return this._difficulty; }

  /** 当前难度 profile（调试/存档用） */
  getProfile() { return Object.assign({}, this._profile); }

  /** 切换难度档（支持战中实时生效——重新注入 AI 人类化失误层，无需重开） */
  setDifficulty(diff, overrides) {
    if (TPL_DIFFICULTY_PROFILES[diff]) this._difficulty = diff;
    if (overrides) this._profileOverrides = Object.assign((this._profileOverrides || {}), overrides);
    this._profile = this._resolveProfile();
    if (this._tplAISlow != null) this._tplAISlow = this._profile.speed || 1.0;
    // 战中切换：把新难度的人类化失误模型立刻同步给已运行的 AI
    if (this._ai && typeof this._ai.setDifficultyProfile === 'function') {
      try { this._ai.setDifficultyProfile(this._profile); } catch (e) {}
    }
    this._logBattle && this._logBattle('difficulty', { difficulty: this._difficulty });
  }

  // CM4-R8：Boss 战 AI 合成——Solver 保留度由难度档 solver 决定（洞察力/拦截），
  // 人类化失误（认知偏差/贪心固化/反应延迟 + maxTech/mistakeRate）交给
  // AIPlayerCore.setDifficultyProfile 执行层叠加。不再人为缩放速度造难度。
  _buildWeakenedAI(aiKey, profile) {
    const base = (AI_PERSONALITIES && AI_PERSONALITIES[aiKey])
      ? AI_PERSONALITIES[aiKey]
      : (AI_PERSONALITIES ? AI_PERSONALITIES.steady : null);
    if (!base) return aiKey; // 极端兜底
    const P = profile || this._profile;
    const W = (typeof P.solver === 'number') ? P.solver : 0.55;
    const p = Object.assign({}, base);
    // 洞察力合并（看穿局面 + 拦截）——solver 越低成本越高（越容易错过/漏防）
    if (base.discoveryRate) {
      p.discoveryRate = {};
      for (const lv in base.discoveryRate) {
        p.discoveryRate[lv] = Math.max(0.12, (base.discoveryRate[lv] ?? 1) * (0.35 + 0.65 * W));
      }
    }
    p.interceptProbability = (base.interceptProbability ?? 0.3) * (0.35 + 0.65 * W);
    // 速度不在此缩放（节奏由 profile.speed 控制，避免"慢动作陪练"观感）
    return p;
  }

  /** 玩家填数（由 GameApp 落子后调用——UI 先落盘，tpl 后仲裁归属） */
  onPlayerFill(r, c, num, correct) {
    if (!this._tpl || this.ended) return;
    // CM4-R9：节奏层——计一次"玩家动作"（AI 需攒够 rhythm 次才行动）
    this._playerMovesSinceAi = (this._playerMovesSinceAi || 0) + 1;
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
      // V4.3.35：boss 战报统计——玩家路径统计累积（连击/看破/反抢/失误）
      try {
        const wasCorrect = !!correct && res && res.success !== false;
        const isCounter = wasCorrect && cell && cell._aiMistake === true;   // 纠正 AI 犯错格 = 看破
        if (wasCorrect) {
          this._playerCombo++;
          if (this._playerCombo > this._bestCombo) this._bestCombo = this._playerCombo;
          if (isCounter) this._counterCount++;
        } else {
          this._playerCombo = 0;
          this._playerMistakeCount++;
        }
        // 反抢：AI 已占的格被玩家重新填对（isAiFilled 且正确）
        if (wasCorrect && cell && cell.isAiFilled && !isCounter) this._stealCount++;
        // V4.4 调试：确认控制器统计是否累积（战报卡数据源）
        if (wasCorrect) {
          console.log('[TplBattle] stats: combo=' + this._playerCombo + ' best=' + this._bestCombo + ' counter=' + this._counterCount);
        }
        // V4.4：对战记录——玩家落子（含看破/反抢/连击上下文）
        this._logBattle('player_fill', {
          r: r, c: c, num: num,
          correct: wasCorrect,
          isCounter: !!isCounter,
          isSteal: !!(wasCorrect && cell && cell.isAiFilled && !isCounter),
          combo: this._playerCombo,
          bestCombo: this._bestCombo,
          mistakeCount: this._playerMistakeCount,
          stealCount: this._stealCount,
        });
      } catch (e) { /* 统计失败不阻断战斗 */ }
      // CM4-R7：污染驱动的冲突幽灵调度（玩家落子也可能抬升争夺 → 幽灵）
      // 手感修复：玩家高频填数时对污染计算做 450ms 节流——computeHubHeat/
      // computePollution 为同步全量计算，节流把玩家路径的同步负担降到 ~2次/秒；
      // AI 落子路径（_aiMove 内）不受节流，保持节奏判定完整。
      const _now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
      if (!this._playerPollutionThrottleTs || (_now - this._playerPollutionThrottleTs) >= 450) {
        this._playerPollutionThrottleTs = _now;
        this._drivePollutionGhost();
      }
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

  /** 玩家凝视（AI 抢格前的焦点提示）——节奏层记录意图锁输入 */
  onPlayerFocusCell(r, c) {
    // CM4-R9：记录玩家当前聚焦格（意图锁）；无效/无选中时清空
    this._playerIntentCell = (typeof r === 'number' && r >= 0 && typeof c === 'number' && c >= 0)
      ? { r, c } : null;
  }

  /** 暂停/恢复 AI（教学期间暂停） */
  setPaused(paused) {
    this._paused = !!paused;
    // V4.4：暂停/恢复留痕（诊断 AI 哑火是否因暂停卡死）
    this._logBattle(paused ? 'ai_paused' : 'ai_resumed', {});
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
    if (this._deferTimer) { clearTimeout(this._deferTimer); this._deferTimer = null; } // CM4-R9
    this._clearTelegraph(); // CM4-R10：清理预告脉冲定时器与格标
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
      playerErrors: stats.playerErrors || 0,
      aiErrors: stats.aiErrors || 0,
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

  // ============ V4.4：对战记录（玩家 vs AI 全过程） ============
  /** 追加一条对战记录，自动附带当前盘面归属快照（供复盘任意时刻局势） */
  _logBattle(type, detail) {
    try {
      const entry = Object.assign({ t: Date.now(), type: type }, detail || {});
      if (this._tpl && typeof this._tpl.getStats === 'function') {
        try {
          const st = this._tpl.getStats();
          entry.playerCount = st.playerOwned;
          entry.aiCount = st.aiOwned;
          entry.playerHubs = st.playerHubs;
          entry.aiHubs = st.aiHubs;
        } catch (e) {}
      }
      this._battleLog.push(entry);
      if (this._battleLog.length > 3000) this._battleLog.splice(0, this._battleLog.length - 3000);
    } catch (e) { /* 记录失败不阻断战斗 */ }
  }

  /** 获取完整对战记录（供 pushAIState / ai-debug 面板使用） */
  getBattleLog() {
    return (this._battleLog || []).slice();
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

  /** CM4-R9：Boss 台词冷却——防止对话气泡过密遮挡棋盘。预告类（telegraph）不在此限制。 */
  _canBubble() {
    const p = this._profile || {};
    // CM4-R10：大幅拉长话痨冷却——普通对白（策略/阶段/失误/污染）最少间隔 ~3.2s，
    // 难度越高稍有松动但仍封顶。预告类走独立通道，不占此席位。
    const coolMs = (p.talkRate != null)
      ? 4400 - Math.round(p.talkRate * 2000) // talkRate 0.2→4000ms，0.55→3300ms，0.8→2800ms
      : 3600;
    const now = Date.now();
    if (now - this._lastBubbleAt < coolMs) return false;
    this._lastBubbleAt = now;
    return true;
  }

  /**
   * CM4-R10：受冷却约束的普通对白（不抢预告位）。
   * 未通过冷却则静默丢弃，保证"预告"是棋盘的唯一主角、话痨不兜底。
   */
  _bossChatter(text, name) {
    if (!this._canBubble()) return;
    this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
      text,
      name: name || (this._opponent && this._opponent.name) || 'Boss',
    });
  }

  /** CM4-R7：发 Boss 台词气泡 */
  _bossSay(text, name) {
    if (!this._canBubble()) return; // CM4-R9：冷却过滤
    this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
      text,
      name: name || (this._opponent && this._opponent.name) || 'Boss',
    });
  }

  /**
   * CM4-R8：AI 意图/失误对白——把"会犯错的对手"具象化给玩家。
   * 只在 AI 真的人类化失误（填错）或认知偏差导致走偏时，按 talkRate 频率发声。
   * 这样玩家感知到的是"对手看走眼了"，而非"系统偷偷放水"。
   */
  _maybeHumanErrorLine(isCorrect, step) {
    try {
      const rate = this._profile.talkRate != null ? this._profile.talkRate : 0.4;
      const analysis = (this._ai && typeof this._ai.getOpponentAnalysis === 'function')
        ? this._ai.getOpponentAnalysis() : null;
      const misjudged = !!(analysis && analysis._misjudged);
      if (this._aiMistakeCount <= 0) return; // 尚未建立失误上下文，避免开场噪声
      if (misjudged) {
        if (Math.random() < rate) {
          this._bossSay(this._pick([
            '…等等，那边似乎更麻烦？',
            '我看错方向了，先守这边！',
            '这条路好像不太对…',
          ]));
        }
        return;
      }
      if (!isCorrect) {
        if (Math.random() < rate * 0.7) {
          this._bossSay(this._pick([
            '啧，这格我下急了。',
            '大意了，我盯着远处漏了这里。',
            '先这样吧，你看得比我准。',
          ]));
        }
      }
    } catch (e) { /* 对白失败不影响对战 */ }
  }

  /** 简单随机取一条（避免拼原文时重复造轮子） */
  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
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

  /**
   * V4.4：AI 步骤无效统一处理——记录原因 → 兜底扫盘填子 → 保证 AI 始终能动。
   * 修复"AI 两子后哑火"：think() 返回 null / 目标格被占 / tpl 拒绝时不再静默重试。
   */
  _aiInvalidStep(step, reason) {
    this._logBattle('ai_skip', {
      reason: reason,
      r: step ? step.row : null,
      c: step ? step.col : null,
      num: step ? step.num : null,
      technique: step ? step.techniqueName : null,
      empty: this._countEmpty(),
    });
    this._aiThinking = false;
    if (this._aiFallbackFill()) {
      if (this._tpl && this._tpl.isEnded && this._tpl.isEnded()) { this._finish(); return; }
      this._scheduleAiMove();
      return;
    }
    this._scheduleAiMove();
  }

  /**
   * V4.4：兜底填子——仅作安全网（think() 极端异常时防止 AI 彻底哑火）。
   * 每局封顶 _AI_FALLBACK_CAP 次，且按人格失误率填子（不保证正确），
   * 让玩家能"看破"回抢，避免"必对霸版、玩家不可能赢"。
   * @returns {boolean} 是否成功落子
   */
  _aiFallbackFill() {
    const CAP = 6;
    if (this._aiFallbackCount >= CAP) return false;
    try {
      if (!this._board || !this._solution || !this._tpl) return false;
      const empties = [];
      for (let r = 0; r < this._board.size; r++) {
        for (let c = 0; c < this._board.size; c++) {
          const cell = this._board.cells?.[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum && !cell.isAiFilled) empties.push([r, c]);
        }
      }
      if (!empties.length) return false;
      const pick = empties[Math.floor(Math.random() * empties.length)];
      const r = pick[0], c = pick[1];
      const correct = this._solution[r]?.[c];
      if (correct == null) return false;
      let num = correct;
      let mistake = false;
      try {
        if (this._ai && typeof this._ai._calcDynamicErrorRate === 'function') {
          mistake = Math.random() < this._ai._calcDynamicErrorRate();
        }
      } catch (e) { mistake = false; }
      if (mistake) {
        let guard = 0;
        do { num = 1 + Math.floor(Math.random() * 9); guard++; } while (num === correct && guard < 20);
      }
      const tplRes = this._tpl.onAIFill(r, c, num);
      if (!tplRes.success) return false;
      const cell = this._board.cells[r][c];
      cell.isAiFilled = true;
      cell._aiNum = correct;
      cell._aiMistake = num !== correct;
      this._aiMoves++;
      this._aiFallbackCount++;
      this._logBattle('ai_fallback', { r: r, c: c, num: num, correct: !mistake });
      this._onEvent('board_changed', { board: this._board, aiFill: true, r: r, c: c });
      this._syncAiState();
      return true;
    } catch (e) {
      console.warn('[TplBattle] fallback fill:', e);
      return false;
    }
  }

  _scheduleAiMove(forceMs) {
    if (!this.active || this.ended || this._paused) return;
    if (typeof forceMs === 'number' && forceMs > 0) {
      // CM4-R9：节奏层短轮询/预告重调——用指定的短延迟重查，不重算人格曲线
      this._aiTimer = setTimeout(() => {
        this._aiTimer = null;
        this._aiMove();
      }, forceMs);
      return;
    }
    const opp = this._opponent || {};
    const min = opp.speedMin != null ? opp.speedMin : 3500;
    const max = opp.speedMax != null ? opp.speedMax : 7000;
    // V4.3.32：首次行动加速——AI 还没落子时用短延迟（~0.6-1.3s）快速入场，
    // 否则教学结束玩家自由阶段快速填完（几秒内），3.5s+ 冷却的 AI 一次都没动
    // 就被玩家收工，观感是"boss 战对手从不填数"。
    let delay;
    // CM4-R8：全局节奏系数（来自难度档 speed，约 1=自然节奏）。夹到 [0.8, 1.5]
    // 避免极端参数导致 AI 过慢（"放水等你"）或过快（"闪电能能"）。
    const slow = Math.min(1.5, Math.max(0.8, this._tplAISlow || 1));
    if (this._aiMoves === 0) {
      delay = Math.min(min, 600 + Math.random() * 700) * slow;
    } else {
      // 手感修复（P0）：Boss 战节奏动态化——消费 AIPlayerCore._calcDynamicInterval()，
      // 让人格的速度曲线生效（爆发期提速 / 连错后提速 / 落后提速 / 节奏感知），
      // 替代"固定区间随机"。以 BOSS_CONFIGS.speedMin/Max 为边界钳制动态值，
      // 防止人格参数异常导致过慢/过快。
      let dynMs = null;
      try {
        if (this._ai && typeof this._ai._calcDynamicInterval === 'function') {
          const sec = this._ai._calcDynamicInterval();
          if (typeof sec === 'number' && isFinite(sec)) dynMs = sec * 1000;
        }
      } catch (e) { dynMs = null; }
      if (dynMs != null) {
        delay = Math.max(min * 0.6, Math.min(dynMs, max * 1.4)) * slow;
      } else {
        delay = (min + Math.random() * (max - min)) * slow;
      }
    }
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      this._aiMove();
    }, delay);
  }

  _aiMove() {
    if (!this.active || this.ended) return;
    if (this._paused) { this._aiTimer = null; return; }
    if (this._deferTimer) { this._aiTimer = null; return; } // CM4-R9：预告窗口进行中不并发
    if (this._aiThinking) return;
    this._aiThinking = true;
    // V4.4：思考留痕（诊断 AI 是否"活着但被挡"——每轮定时器触发都会留一条）
    try { this._logBattle('ai_tick', { empty: this._countEmpty() }); } catch (e) {}

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
          this._bossChatter('不连线了，我继续填！');
          this._tpl.declineLine();
          this._aiThinking = false;
          return;
        }
      }

      let step = null;
      try {
        step = this._ai.think();
      } catch (e) {
        this._logBattle('ai_error', { where: 'think', msg: (e && e.message) || String(e) });
      }
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
        // V4.4：think 无解/异常 → 记录 + 兜底填子（不再静默重试导致 AI 哑火）
        this._aiInvalidStep(null, 'null_step');
        return;
      }

      // 笔记操作：不落盘，直接继续
      if (step.isNote || step.type === 'note') {
        this._logBattle('ai_note', { r: step.row, c: step.col, num: step.num || null });
        this._bossChatter('笔记…');
        this._aiThinking = false;
        this._scheduleAiMove();
        return;
      }

      // CM4-R9：Human Rhythm Layer——节奏门槛：AI 需等到玩家攒够 rhythm 次动作才落子
      if (this._rhythmBlocked()) {
        this._aiThinking = false;
        this._scheduleAiMove(900); // 短轮询，等下个节奏点再判定
        return;
      }

      // CM4-R9：Human Rhythm Layer——预告/意图锁：蓄力→警告→玩家回应窗口→落子
      if (this._decideTelegraph(step)) {
        this._deferAiStep(step);
        this._aiThinking = false;
        return;
      }

      // 直接落子（无预告，或预告概率未命中）
      this._executeAiStep(step);
    } catch (e) {
      console.warn('[TplBattle] aiMove:', e);
      this._aiThinking = false;
      this._scheduleAiMove();
    }
  }

  /**
   * CM4-R9：节奏门槛——AI 每 "rhythm" 次玩家动作才行动一次，给数字驱动玩家思考窗口。
   * 兜底：太久没攒够（玩家停手）也会放行，避免 AI 永久哑火。
   */
  _rhythmBlocked() {
    const need = (this._profile && this._profile.rhythm != null) ? this._profile.rhythm : 1;
    if (need <= 1) return false;
    if ((this._playerMovesSinceAi || 0) >= need) return false;
    if (this._lastAiMoveAt > 0) {
      const elapsed = Date.now() - this._lastAiMoveAt;
      if (elapsed > 12000) return false; // 12s 兜底（玩家一直不填也放火）
    } else if (Date.now() - (this._startTime || Date.now()) > 12000) {
      return false; // 首步兜底：开局 12s 后 AI 必须动，避免"挂机"
    }
    return true;
  }

  /**
   * CM4-R9：预告决策——是否对本次落子做"蓄力预告"。
   * 命中玩家当前聚焦格（意图锁）→ 高概率预告 + 留窗口；否则按 telegraphRate 普通预告。
   */
  _decideTelegraph(step) {
    if (!step || step.row == null || step.col == null) return false;
    if (this._deferTimer) return false; // 已在预告窗口中
    const p = this._profile || {};
    const lockRate = (p.intentLockRate != null) ? p.intentLockRate : 0.4;
    const teleRate = (p.telegraphRate != null) ? p.telegraphRate : 0.3;
    // 意图锁：AI 目标正是玩家正在聚焦的格 → 不精准狙击，先预告
    const fc = this._playerIntentCell;
    const focused = !!(fc && fc.r === step.row && fc.c === step.col);
    if (focused) {
      if (Math.random() < lockRate) { this._telegraphLine('intent', step); return true; }
      return false;
    }
    if (Math.random() < teleRate) { this._telegraphLine('region', step); return true; }
    return false;
  }

  /** CM4-R9：预告台词（区域施压 / 锁定玩家聚焦格） */
  _telegraphLine(kind, step) {
    const name = (this._opponent && this._opponent.name) || 'Boss';
    if (kind === 'intent') {
      this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
        text: this._pick([
          '我盯上你这格了…还来得及哦。',
          '这格我要了，你先想好别的。',
          '你还没填上吧？那我下手了。',
        ]),
        name,
      });
      return;
    }
    // region：用目标格所在据点给玩家方位感（左翼/中央/右翼，i18n 无关）
    let zone = '这一带';
    try {
      const hi = (typeof this._tpl.getHubBlockIndex === 'function') ? this._tpl.getHubBlockIndex(step.row, step.col) : -1;
      zone = (hi === 0) ? '左翼' : (hi === 1) ? '中央' : (hi === 2) ? '右翼' : '这一带';
    } catch (e) {}
    this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, {
      text: this._pick([
        '我准备封锁' + zone + '区域…',
        zone + '的压力要上来了，你快想想。',
        '看好了，' + zone + '我要动手了。',
      ]),
      name,
    });
  }

  /** CM4-R9：蓄力→读秒窗口→落子。玩家在窗口内抢先填上则 AI 放弃。 */
  _deferAiStep(step) {
    const ms = (this._profile && this._profile.telegraphDelay != null) ? this._profile.telegraphDelay : 1200;
    clearTimeout(this._deferTimer);
    // CM4-R10：预告窗口——目标格蓄力警示 + 周期重绘驱动脉冲动画
    this._startTelegraph(step, ms);
    this._deferTimer = setTimeout(() => {
      this._deferTimer = null;
      this._clearTelegraph();
      this._executeDeferred(step);
    }, ms);
  }

  /**
   * CM4-R10：开始一次目标格"即将落子"的视觉预告。
   * 给目标格打 _telegraphUntil 时间戳，渲染器据此画呼吸红框 + 读秒圈；
   * 窗口内经 setInterval 周期触发 board_changed，让脉冲随 Date.now 动起来。
   * 同时记录 _lastBubbleAt，预告之后会冷却普通对白，杜绝"预告+话痨"叠屏。
   */
  _startTelegraph(step, ms) {
    try {
      this._clearTelegraph();
      const cell = this._board.cells?.[step.row]?.[step.col];
      if (!cell || cell.fixedNum) return;
      const until = Date.now() + ms;
      cell._telegraphUntil = until;
      this._telegraphCellRef = cell;
      this._lastBubbleAt = Date.now();
      this._telegraphTick = setInterval(() => {
        try {
          const c = this._board.cells?.[step.row]?.[step.col];
          if (!c || !c._telegraphUntil || Date.now() >= c._telegraphUntil) {
            if (this._telegraphTick) { clearInterval(this._telegraphTick); this._telegraphTick = null; }
            return;
          }
          this._onEvent('board_changed', { board: this._board, telegraph: true });
        } catch (e) {}
      }, 120);
      this._onEvent('board_changed', { board: this._board, telegraph: true });
    } catch (e) {}
  }

  /** CM4-R10：清除当前预告标记与刷新定时器 */
  _clearTelegraph() {
    try {
      if (this._telegraphCellRef && this._telegraphCellRef._telegraphUntil) {
        this._telegraphCellRef._telegraphUntil = 0;
        this._telegraphCellRef = null;
      }
      if (this._telegraphTick) { clearInterval(this._telegraphTick); this._telegraphTick = null; }
    } catch (e) {}
  }

  /** CM4-R9：预告窗口结束——若玩家抢先抢回目标格则放弃（"我慢了一步"），否则落子 */
  _executeDeferred(step) {
    if (!this.active || this.ended || this._paused) return;
    const cell = this._board.cells?.[step.row]?.[step.col];
    if (cell && (cell.fillNum || cell.isAiFilled)) {
      this._aiThinking = false;
      try { this._logBattle('ai_wait_lost', { r: step.row, c: step.col }); } catch (e) {}
      this._bossChatter(this._pick(['啧，你抢得真快…', '这一格你赢了。', '慢了一步。']));
      this._scheduleAiMove();
      return;
    }
    this._executeAiStep(step);
  }

  /**
   * CM4-R9：真正执行一次 AI 落子（重校验 + tpl 仲裁 + 落盘 + 节奏重置）。
   * 供直接落子与预告窗口结束两条路径共用，避免逻辑分叉。
   */
  _executeAiStep(step) {
    try {
      const { row, col, num } = step;
      const cell = this._board.cells?.[row]?.[col];
      if (!cell || cell.fixedNum) { this._aiInvalidStep(step, 'fixed_cell'); return; }
      const isGhostSteal = step.techniqueName === 'ghost_steal';
      if (cell.fillNum && !isGhostSteal) { this._aiInvalidStep(step, 'filled_cell'); return; }
      const tplRes = this._tpl.onAIFill(row, col, num);
      if (!tplRes.success) { this._aiInvalidStep(step, 'tpl_reject'); return; }

      // 落盘（幽灵抢占先清除 fillNum）
      // V4.3.32：AI 填数对玩家不可见（防作弊）——不写 fillNum，仅标记
      // isAiFilled/_aiNum/_aiMistake，渲染器据此画 Boss 色幽灵格（对=小点/错=问号）。
      if (isGhostSteal && cell.fillNum) delete cell.fillNum;
      cell.isAiFilled = true;
      cell._aiNum = this._solution?.[row]?.[col] ?? null;
      cell._aiMistake = cell._aiNum !== null && num !== cell._aiNum;
      this._aiMoves++; // V4.3.32：落子成功计数（首次行动加速判定）
      // CM4-R9：节奏层重置——AI 落下后重新累计玩家动作
      this._playerMovesSinceAi = 0;
      this._lastAiMoveAt = Date.now();
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
      // V4.3.35：AI 失误统计（战报卡）
      if (!isCorrect) this._aiMistakeCount++;
      // CM4-R8：AI 意图对白——人类化失误让 Boss 自己说出来
      this._maybeHumanErrorLine(isCorrect, step);
      // V4.4：对战记录——AI 落子（含是否失误/技巧/策略上下文）
      this._logBattle('ai_fill', {
        r: row, c: col, num: num,
        correct: isCorrect,
        mistake: !isCorrect,
        aiMistakeCount: this._aiMistakeCount,
        technique: step.techniqueName || null,
        strategyId: step.strategyId || null,
      });
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
      console.warn('[TplBattle] executeAiStep:', e);
      this._aiThinking = false;
      this._scheduleAiMove();
    }
  }

  // ==================== 内部：tpl 事件转发 + 结算 ====================

  _handleTplEvent(event, data) {
    // V4.4 调试：观察所有 tpl 事件流（结算链路诊断）
    console.log('[TplBattle] tplEvent:', event, data ? (data.winner ? 'winner=' + data.winner : '') : '');
    // V4.4：对战记录——tpl 事件全部入日志（三点连线/结束/强制结算等）
    try {
      this._logBattle('tpl_event', {
        event: event,
        winner: data && data.winner ? data.winner : null,
        side: data && data.side ? data.side : null,
        path: data && data.path ? data.path : null,
      });
    } catch (e) {}
    // V4.3.32：玩家路径结束（填满盘面 / 三点连线 / 强制结算）——tpl 内部
    // _endGame 只发 GAME_END，控制器的 _finish() 之前仅在 AI 落子路径检查 isEnded，
    // 玩家填最后一格时结算从不触发（无结算动画/无 onEnd）。统一在此捕获。
    if (event === TPL_BATTLE_EVENTS.GAME_END) {
      console.log('[TplBattle] 收到 GAME_END，触发 _finish:', data && data.winner ? data.winner : '', 'path=', data && data.path ? data.path : '');
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

    // V4.4：对战记录——结算（胜负/路径/最终盘面/全部战报统计）
    this._logBattle('end', {
      result: result,
      winner: winner,
      winPath: path,
      playerOwned: stats.playerOwned,
      aiOwned: stats.aiOwned,
      playerHubs: stats.playerHubs,
      aiHubs: stats.aiHubs,
      bestCombo: this._bestCombo || 0,
      counterCount: this._counterCount || 0,
      aiMistakeCount: this._aiMistakeCount || 0,
      playerMistakeCount: this._playerMistakeCount || 0,
      stealCount: this._stealCount || 0,
      duration: Date.now() - (this._startTime || Date.now()),
    });

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
      // V4.4：boss 战报统计（战报卡用，V4.3.35 累积）
      bestCombo: this._bestCombo || 0,
      counterCount: this._counterCount || 0,
      aiMistakeCount: this._aiMistakeCount || 0,
      playerMistakeCount: this._playerMistakeCount || 0,
      stealCount: this._stealCount || 0,
      duration: Date.now() - (this._startTime || Date.now()),
      // CM4-R2：Director Shadow 校准汇总（shadow 模式下仅记录，不改行为）
      directorShadow: this.getDirectorShadowSummary(),
    });

    if (this._onEndCallback) {
      // onEnd 回调的 stats 需携带完整战报统计（bestCombo/看破/失误/时长）。
      // 注意：tpl.getStats() 只含据点归属，曝光级统计由控制器累积在顶层，
      // 此处 merge 进回调，供 game.html 的 onBattleEnd 写入 CM.lastBattleStats。
      this._onEndCallback(result, this._opponent, {
        stats: { ...stats,
          bestCombo: this._bestCombo || 0,
          counterCount: this._counterCount || 0,
          aiMistakeCount: this._aiMistakeCount || 0,
          playerMistakeCount: this._playerMistakeCount || 0,
          stealCount: this._stealCount || 0,
          duration: Date.now() - (this._startTime || Date.now()),
        },
        winPath: path,
      });
    }
  }
}

export default TplBattleController;
