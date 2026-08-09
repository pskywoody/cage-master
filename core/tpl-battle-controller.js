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

      this.active = true;
      this.ended = false;

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
      'yingying': 'blind',       // 莹莹 → blind（AI_PERSONALITIES 无 'ying'，旧映射导致回退 steady 无 noteRate）
      'yan': 'expert',           // 阿妍 → expert
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
      this._syncAiState();
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
      const progress = this._tpl.getHubProgress();
      const hubOwnership = progress.map(p => p.occupiedBy || null);
      const selfHubs = hubOwnership.filter(o => o === 'boss').length;
      const oppHubs = hubOwnership.filter(o => o !== null && o !== 'boss').length;
      // v2.0：玩家防守强度（各据点玩家维度占比）
      const playerDefense = {};
      for (let i = 0; i < progress.length; i++) {
        const p = progress[i];
        playerDefense[i] = p.playerDims / Math.max(p.playerDims + p.bossDims, 1);
      }
      if (typeof this._ai.setGameState === 'function') {
        this._ai.setGameState({
          isLeading: selfHubs > oppHubs ? true : (selfHubs < oppHubs ? false : null),
          selfHubCount: selfHubs,
          opponentHubCount: oppHubs,
          progress: this._totalEmpty > 0 ? (this._countFilled() / this._totalEmpty) : 0,
          consecutiveErrors: 0,
          consecutiveCorrect: this._aiConsecutiveCorrect, // v2.0：动态错误率（连对3次×0.8）
          isBurst: false,
          hubBlocks: this._tpl.getHubBlocks(),
          castleHubIdx: this._tpl.getCastleHubIdx(),
          hubOwnership,
          playerDefense,
          // v2.0：策略状态机输入
          hubCounts: typeof this._tpl.getHubCounts === 'function' ? this._tpl.getHubCounts() : progress,
          migrationFailed: typeof this._tpl.isMigrationFailed === 'function' ? this._tpl.isMigrationFailed() : false,
        });
      }
      this._ai.syncFromBoard(this._board);
      // v2.0：策略切换检测——变化时发 BOSS_BUBBLE（AI 意图可视化）
      this._checkStrategyChange();
    } catch (e) {}
  }

  /**
   * v2.0：AI 策略切换 → 台词气泡（Boss 意图让玩家可感知）
   */
  _checkStrategyChange() {
    try {
      if (!this._ai || typeof this._ai.getStrategy !== 'function') return;
      const s = this._ai.getStrategy();
      if (s.strategy === this._lastStrategy) return;
      this._lastStrategy = s.strategy;
      const name = this._opponent && this._opponent.name ? this._opponent.name : 'Boss';
      const lines = {
        attack: '这个据点我要定了！',
        defend: '先守住我的地盘！',
        global: '不管据点了，我先填满！',
        counter: '敢动我的据点？反击！',
      };
      const text = lines[s.strategy] || '计划有变！';
      this._onEvent(TPL_BATTLE_EVENTS.BOSS_BUBBLE, { text, name });
      // 策略状态变化事件（HUD 显示当前策略）
      this._onEvent(TPL_BATTLE_EVENTS.STRATEGY_CHANGE, {
        strategy: s.strategy,
        label: s.label,
        targetHub: s.targetHub,
      });
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
      // 通知 UI 重绘（值对齐旧 BATTLE_EVENTS.BOARD_CHANGED='board_changed'）
      this._onEvent('board_changed', { board: this._board, aiFill: true, r: row, c: col });

      // v2.0 5.2：AI 连续填对数跟踪（连对3次动态错误率×0.8）
      const isCorrect = this._solution?.[row]?.[col] === num;
      this._aiConsecutiveCorrect = isCorrect ? (this._aiConsecutiveCorrect + 1) : 0;
      this._syncAiState();
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

    this._onEvent(TPL_BATTLE_EVENTS.BATTLE_END, {
      winner,
      winPath: path,
      playerCount: stats.playerOwned,
      aiCount: stats.aiOwned,
      playerHubs: stats.playerHubs,
      aiHubs: stats.aiHubs,
      result,
    });

    if (this._onEndCallback) {
      this._onEndCallback(result, this._opponent, { stats, winPath: path });
    }
  }
}

export default TplBattleController;
