/**
 * LessonPlayer - V4 教学播放器（纯逻辑状态机）
 *
 * 五段式教学引擎：intro → demo → guided → semiAuto → free
 * 新增 noteToFill 桥梁阶段：guided → noteToFill → semiAuto
 *
 * 设计原则：
 * - 纯逻辑层，无 DOM/Window 依赖
 * - 通过 HeadlessEngine 操作棋盘
 * - 通过回调输出动作指令（UI 层按需消费）
 * - 可在 Node.js 和浏览器中运行
 *
 * 使用方式（Node.js）：
 *   const lp = new LessonPlayer({ engine, levelData, callbacks: { onBubble, onAction, onPhaseChange } });
 *   lp.start();
 *
 * 使用方式（浏览器）：
 *   const lp = new LessonPlayer({ engine, levelData, callbacks: { ... } });
 *   lp.start();
 */

export class LessonPlayer {
  /**
   * @param {Object} options
   * @param {Object} options.engine - HeadlessEngine 实例
   * @param {Object} options.levelData - 关卡数据（含 lessonPlan）
   * @param {Object} [options.callbacks] - 回调函数
   * @param {Function} [options.callbacks.onPhaseChange] - (phase, prev) => void
   * @param {Function} [options.callbacks.onBubble] - (text, speaker, voiceId) => void
   * @param {Function} [options.callbacks.onAction] - (action) => void  渲染动作
   * @param {Function} [options.callbacks.onComplete] - () => void
   * @param {Function} [options.callbacks.onSkip] - () => void
   * @param {Function} [options.callbacks.onNeedInput] - (type, info) => void
   * @param {Function} [options.callbacks.onInputResult] - (result, info) => void
   * @param {Function} [options.callbacks.onError] - (phase, error) => void  回退通知
   * @param {number} [options.delay] - 动作间默认延迟(ms)，默认 0
   */
  constructor(options) {
    if (!options.engine) throw new Error('LessonPlayer: engine is required');
    if (!options.levelData) throw new Error('LessonPlayer: levelData is required');

    this._engine = options.engine;
    this._levelData = options.levelData;
    this._lessonPlan = options.levelData.lessonPlan || options.levelData.lesson || null;
    // 2026-08-04：区分「未设置」（生产模式，用各调用点设计时长）与「0」（Node 测试同步模式）
    this._delay = (options.delay === undefined || options.delay === null) ? null : options.delay;
    this._callbacks = options.callbacks || {};

    // 教学状态
    this._currentPhase = 'idle';   // idle | intro | demo | guided | noteToFill | semiAuto | free | done
    this._demoStepIndex = 0;
    this._stepTimer = null;
    this._isWaitingInput = false;
    this._guidedAttempts = 0;
    // 引导链（2026-08-03 五步教学）：当前引导格可随 successNext 动态切换
    this._activeGuidedCell = null;
    this._guidedNextIndex = 0;
    this._guidedExplaining = false;
    this._semiAutoFilled = 0;
    // V4.3.28：semiAuto 已计数的格子集合（去重，避免 UI 先落子导致 alreadyFilled 误判）
    this._semiAutoFilledCells = new Set();
    this._isActive = false;
    this._isSkipped = false;
    this._freezeEnabled = false;
    this._frozenCells = new Set();
    this._whatIfEntered = false;
    this._freeTimer = null;
    // 2026-08-05：guided 无操作超时（任务 B）
    this._guidedTimeoutTimer = null;
    // 2026-08-05：semiAuto 强引导冻结集合（任务 C）
    this._semiAutoFrozenCells = new Set();

    // 全局回退状态
    this._fallbackStack = [];  // 阶段回退栈
    this._maxFallbacks = 3;    // 最大回退次数

    // 雪崩补全防重复触发
    this._avalancheTriggered = false;

    // 2026-08-04：教学事件遥测（AI 调试：让 AI 能从 JSON 还原教学过程）
    this._lessonEvents = [];
    this._lessonEventSeq = 0;

    // 高亮缓存
    this._activeHighlights = {
      rows: new Set(),
      cols: new Set(),
      boxes: new Set(),
      cages: new Set(),
      cells: new Set(),
      focusCell: null,
    };

    // 绑定
    this._nextDemoStep = this._nextDemoStep.bind(this);
    this.handleCellFill = this.handleCellFill.bind(this);
    this.handleNoteToggle = this.handleNoteToggle.bind(this);
  }

  // ==================== 公共 API ====================

  /**
   * 启动教学
   * @returns {boolean} 是否启动了教学
   */
  start() {
    if (!this._lessonPlan || !this._lessonPlan.phases) {
      this._currentPhase = 'free';
      this._emit('onPhaseChange', 'free', 'idle');
      return false;
    }

    if (!this._validateLessonPlan()) {
      console.warn('[LessonPlayer] lessonPlan 校验失败，降级为自由模式');
      this._currentPhase = 'free';
      this._emit('onPhaseChange', 'free', 'idle');
      return false;
    }

    this._isActive = true;
    this._fallbackStack = [];
    this._avalancheTriggered = false;
    this._enterPhase('intro');
    return true;
  }

  /**
   * 检查并触发雪崩自动补全（手册 4.2.1）
   * UI 层应在每次玩家填数后调用此方法。
   * 当剩余空格全部为裸单（唯一候选数）时：
   *   1. 自动补全所有剩余格
   *   2. 触发 onAvalanche 回调（携带补全序列，供 UI 播放动画）
   *   3. 触发 onComplete
   * @returns {{triggered:boolean, filled:number, emptyBefore:number, emptyAfter:number}}
   */
  checkAvalanche() {
    if (!this._engine || typeof this._engine.getEmptyCellCandidates !== 'function') {
      return { triggered: false, filled: 0, emptyBefore: 0, emptyAfter: 0 };
    }

    // 防重复触发
    if (this._avalancheTriggered) {
      return { triggered: false, filled: 0, emptyBefore: 0, emptyAfter: 0 };
    }

    // V4.3.31：雪崩收尾仅在 free 阶段且剩余空格很少时触发——
    // 引导（guided/semiAuto）阶段绝不触发（避免抢填 watchCells）；
    // 剩余格较多时也不触发（教学需玩家亲手练习，而非自动补全）。
    // 玩家自己填到只剩少量格时，雪崩作为庆祝动画收尾。
    if (this._currentPhase !== 'free') {
      return { triggered: false, filled: 0, emptyBefore: 0, emptyAfter: 0 };
    }
    const emptiesBefore = this._engine.getEmptyCellCandidates();
    const emptyCount = (emptiesBefore && emptiesBefore.length) || 0;
    // 雪崩收尾阈值：剩余 1-5 格时触发（简单盘面引导后剩余多时不触发）
    const MAX_AVALANCHE_EMPTY = 5;
    if (emptyCount === 0 || emptyCount > MAX_AVALANCHE_EMPTY) {
      return { triggered: false, filled: 0, emptyBefore: emptyCount, emptyAfter: emptyCount };
    }

    // 部分雪崩：补全剩余裸单格（连锁）——剩余格数少，补全即收尾
    const sequence = [];
    let guard = 0;
    while (guard++ < 64) {
      const empties = this._engine.getEmptyCellCandidates();
      if (!empties || empties.length === 0) break;
      const singles = empties.filter((e) => e.candidates && e.candidates.length === 1);
      if (singles.length === 0) break;
      for (const e of singles) {
        const res = this._engine.fillCell(e.r, e.c, e.candidates[0]);
        if (res && res.success) sequence.push({ r: e.r, c: e.c, num: e.candidates[0] });
      }
    }
    if (sequence.length === 0) {
      return { triggered: false, filled: 0, emptyBefore: emptyCount, emptyAfter: emptyCount };
    }

    this._avalancheTriggered = true;

    // 通知 UI：雪崩补全发生（携带序列用于动画）
    this._emit('onAvalanche', {
      filled: sequence.length,
      sequence: sequence,
    });

    this._clearAllHighlights();
    this._emit('onAction', { type: 'avalanche', sequence: sequence });

    const after = this._engine.getEmptyCellCandidates();
    const emptyAfter = (after && after.length) || 0;
    if (emptyAfter === 0) {
      // 全部补满：完成教学
      this._currentPhase = 'done';
      this._emit('onPhaseChange', 'done', this._currentPhase);
      this._delayThen(() => {
        this._emit('onComplete');
      }, 300);
    }

    return {
      triggered: true,
      filled: sequence.length,
      emptyBefore: sequence.length + emptyAfter,
      emptyAfter: emptyAfter,
    };
  }

  /**
   * 跳过教学
   */
  skip() {
    if (!this._isActive || this._isSkipped) return;
    this._isSkipped = true;
    this._isActive = false;
    // 2026-08-05：跳过时清理超时与冻结
    this._clearGuidedTimeout();
    this._unlockSemiAuto();
    this._cleanup();
    this._currentPhase = 'free';
    this._emit('onPhaseChange', 'free', 'skipped');
    this._emit('onSkip');
  }

  /**
   * 快进/跳过当前动画步骤
   * @returns {boolean}
   */
  advance() {
    if (!this._isActive) return false;

    if (this._currentPhase === 'intro') {
      this._enterPhase('demo');
      return true;
    }

    if (this._currentPhase === 'demo') {
      if (this._stepTimer) {
        clearTimeout(this._stepTimer);
        this._stepTimer = null;
      }
      this._nextDemoStep();
      return true;
    }

    // guided 讲解中点击：跳过方法讲解，直接进入填数引导
    if (this._currentPhase === 'guided' && this._guidedExplaining) {
      if (this._stepTimer) {
        clearTimeout(this._stepTimer);
        this._stepTimer = null;
      }
      this._guidedExplaining = false;
      this._beginGuidedInput();
      return true;
    }

    return false;
  }

  /**
   * 销毁清理
   */
  destroy() {
    this._cleanup();
    this._isActive = false;
  }

  /** 是否处于活跃教学状态 */
  get isActive() { return this._isActive; }

  /** 当前阶段 */
  get currentPhase() { return this._currentPhase; }

  /** 是否在等待玩家输入 */
  get isWaitingInput() { return this._isWaitingInput; }

  /** 获取引导阶段的目标格信息 */
  getGuidedTarget() {
    if (this._currentPhase !== 'guided' && this._currentPhase !== 'noteToFill') return null;
    if (!this._activeGuidedCell) return null;
    const [r, c] = this._activeGuidedCell;
    const sol = this._levelData && this._levelData.solution;
    const value = (sol && sol[r]) ? sol[r][c] : null;
    return { cell: this._activeGuidedCell.slice(), value: value };
  }

  /** 获取当前交互类型 */
  getInteractionType() {
    if (this._currentPhase === 'noteToFill') return 'NOTE_ONLY';
    if (this._currentPhase === 'guided') {
      const guided = this._lessonPlan.phases.guided;
      return guided?.interactionType || 'NUMBER';
    }
    if (this._currentPhase === 'semiAuto') {
      const semiAuto = this._lessonPlan.phases.semiAuto;
      return semiAuto?.interactionType || 'NUMBER';
    }
    return 'NUMBER';
  }

  /**
   * 判断某格是否可交互
   */
  canInteractCell(r, c) {
    if (!this._isActive) return true;

    // 2026-08-05：任务 C——semiAuto 强引导：独立于 freezeEnabled，只允许操作 watchCells 格
    if (this._currentPhase === 'semiAuto' && this._semiAutoFrozenCells.size > 0) {
      return this._semiAutoFrozenCells.has(r + ',' + c);
    }

    if (!this._freezeEnabled) return true;

    if (this._currentPhase === 'guided' || this._currentPhase === 'noteToFill') {
      const guided = this._lessonPlan.phases.guided;
      const target = this._activeGuidedCell || (guided && guided.targetCell);
      if (target) {
        return r === target[0] && c === target[1];
      }
    }

    if (this._frozenCells && this._frozenCells.size > 0) {
      return !this._frozenCells.has(r + ',' + c);
    }

    return false;
  }

  /**
   * V4.3.27：判断某格是否可选中
   * 教学阶段（guided/noteToFill/semiAuto）中，非目标格不允许选中，
   * 避免玩家点击规定外的格子产生困惑。
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean}
   */
  canSelectCell(r, c) {
    if (!this._isActive) return true;

    // guided / noteToFill：只允许选中当前目标格
    if (this._currentPhase === 'guided' || this._currentPhase === 'noteToFill') {
      const guided = this._lessonPlan.phases.guided;
      const target = this._activeGuidedCell || (guided && guided.targetCell);
      if (target) {
        return r === target[0] && c === target[1];
      }
      return true;
    }

    // semiAuto 强引导：只允许选中 watchCells 格
    if (this._currentPhase === 'semiAuto' && this._semiAutoFrozenCells.size > 0) {
      return this._semiAutoFrozenCells.has(r + ',' + c);
    }

    return true;
  }

  // ==================== 输入处理 ====================

  /**
   * 判断格子是否已被玩家填出正确答案（已填的格不再作为引导目标）
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean}
   */
  _cellAlreadyFilled(r, c) {
    try {
      const sol = this._levelData && this._levelData.solution;
      if (!sol || !sol[r]) return false;
      const state = this._engine && typeof this._engine.getState === 'function' ? this._engine.getState() : null;
      const cell = state && state.cells && state.cells[r] ? state.cells[r][c] : null;
      if (!cell) return false;
      if (cell.fixedNum) return true; // 固定格跳过
      return cell.fillNum === sol[r][c];
    } catch (e) { return false; }
  }

  /**
   * 从 successNext 链中找下一个尚未填写的引导格
   * @param {Array} chain - successNext 链
   * @param {number} fromIndex - 起始索引
   * @returns {Array|null} [nextItem, index]
   */
  _findNextUnguidedCell(chain, fromIndex) {
    if (!Array.isArray(chain)) return null;
    for (let i = fromIndex; i < chain.length; i++) {
      const item = chain[i];
      if (!item || !Array.isArray(item.cell) || item.cell.length !== 2) continue;
      if (!this._cellAlreadyFilled(item.cell[0], item.cell[1])) {
        return [item, i];
      }
    }
    return null;
  }

  /**
   * 处理玩家填数
   * @returns {Object} { handled, correct, ... }
   */
  handleCellFill(r, c, num) {
    if (!this._isActive) return { handled: false };

    const guided = this._lessonPlan.phases.guided;

    // === guided 阶段 ===
    if (this._currentPhase === 'guided' && guided) {
      if (!this._isWaitingInput) return { handled: false };
      const interactionType = guided.interactionType || 'NUMBER';
      if (interactionType === 'NOTE_ONLY' || interactionType === 'WHAT_IF_ENTRY') {
        return { handled: false };
      }

      const target = this._activeGuidedCell || guided.targetCell;
      const tr = target[0], tc = target[1];
      if (r !== tr || c !== tc) return { handled: false, isTarget: false };

      this._guidedAttempts++;

      // 2026-08-05：任务 B——玩家已操作，清除无操作超时定时器
      this._clearGuidedTimeout();

      const sol = this._levelData && this._levelData.solution;
      const correctValue = (sol && sol[tr]) ? sol[tr][tc] : guided.correctValue;

      if (num === correctValue) {
        // 填对：找下一个尚未填写的引导格（successNext 链，跳过已填格）
        const chain = guided.successNext || [];
        const found = this._findNextUnguidedCell(chain, this._guidedNextIndex);
        if (found) {
          const [next, idx] = found;
          this._guidedNextIndex = idx + 1;
          this._activeGuidedCell = next.cell.slice();
          // 2026-08-03 修复：链跳转后必须重新等待输入，否则下一引导格无法填数
          this._isWaitingInput = true;
          this._clearAllHighlights();
          this._emit('onAction', { type: 'highlightCell', r: next.cell[0], c: next.cell[1], mode: 'pulse' });
          this._emit('onNeedInput', 'guided', {
            cell: this._activeGuidedCell,
            value: (sol && sol[next.cell[0]]) ? sol[next.cell[0]][next.cell[1]] : null,
            interactionType: guided.interactionType || 'NUMBER',
            expectedNote: guided.expectedNote,
            hintText: next.hintText || guided.successText,
          });
          this._showBubble(next.hintText || guided.successText, '伊藤', guided.successVoiceId || null);
          // 2026-08-04：遥测——链跳转后的新引导格
          this._recordLessonEvent('guided', {
            cell: this._activeGuidedCell.slice(),
            value: (sol && sol[next.cell[0]]) ? sol[next.cell[0]][next.cell[1]] : null,
            hintText: next.hintText || guided.successText,
          });
          return { handled: true, correct: true, continueNext: true, next: next.cell };
        }

        // 全部填完：总结 + 进入半自动
        this._isWaitingInput = false;
        this._showBubble(guided.successText || '答对了！', '伊藤', guided.successVoiceId || null);
        this._emit('onInputResult', 'success', { phase: 'guided', attempts: this._guidedAttempts });
        this._clearAllHighlights();
        this._delayThen(() => this._enterSemiAutoOrFree(), 1600); // 手感审计：1800→1600ms，成功提示停留略紧凑
        return { handled: true, correct: true };
      } else {
        return this._handleGuidedError(num);
      }
    }

    // === noteToFill 阶段 ===
    if (this._currentPhase === 'noteToFill' && guided) {
      if (!this._isWaitingInput) return { handled: false };
      const [tr, tc] = guided.targetCell;
      if (r !== tr || c !== tc) return { handled: false, isTarget: false };

      // noteToFill 阶段不接受填数，只接受笔记
      return { handled: false, noteToFill: true, message: '请在目标格中记笔记' };
    }

    // === semiAuto 阶段 ===
    if (this._currentPhase === 'semiAuto') {
      const semiAuto = this._lessonPlan.phases.semiAuto;
      const targetCount = semiAuto?.targetCount || 3;

      let isCorrect = true;
      if (this._levelData?.solution) {
        isCorrect = this._levelData.solution[r][c] === num;
      }

      // 2026-08-04：与 guided 分支一致，真实落盘（否则驱动脚本无法通过棋盘状态
      // 判断"已填"，且重复填同一格可刷计数绕过教学）
      // V4.3.28：改为格子去重计数（UI 主链路先 fillCell 落子，before.fillNum 已被
      // 污染为刚填的值，无法再用 alreadyFilled 判断；改用 _semiAutoFilledCells Set）
      if (this._engine && typeof this._engine.fillCell === 'function') {
        try {
          this._engine.fillCell(r, c, num);
          const cellKey = r + ',' + c;
          if (isCorrect && !this._semiAutoFilledCells.has(cellKey)) {
            this._semiAutoFilledCells.add(cellKey);
            this._semiAutoFilled++;
            // V4.3.28：填对一格 → 移除该格脉冲（其余引导格保留）+ 进度提示
            this._emit('onAction', { type: 'highlightCell', r, c, enabled: false });
            const remaining = targetCount - this._semiAutoFilled;
            if (remaining > 0) {
              this._showBubble('填对了！还剩 ' + remaining + ' 个引导格。', '伊藤', null);
            }
          } else if (!isCorrect) {
            // V4.3.29：semiAuto 填错 → 鼓励，不惩罚不卡死
            this._emit('onAction', { type: 'shakeCell', r, c });
            this._showBubble('不对哦，再想想～每个引导格都能用学过的规则推出来。', '伊藤', null);
          }
        } catch (e) {
          if (isCorrect) this._semiAutoFilled++;
        }
      } else if (isCorrect) {
        this._semiAutoFilled++;
      }

      // 2026-08-04：遥测——watchCells 命中情况（教学路径是否被采纳）
      if (Array.isArray(semiAuto.watchCells) && semiAuto.watchCells.some(([wr, wc]) => wr === r && wc === c)) {
        this._recordLessonEvent('watch', { cell: [r, c], num: num, correct: isCorrect });
      }

      if (this._semiAutoFilled >= targetCount) {
        // 2026-08-05：任务 C——填满引导目标后解锁冻结格
        this._unlockSemiAuto();
        this._delayThen(() => this._enterPhase('free'), 800);
      }

      return { handled: true, correct: isCorrect, semiAuto: true, filled: this._semiAutoFilled, target: targetCount };
    }

    return { handled: false };
  }

  /**
   * 处理玩家切换笔记
   * @returns {Object} { handled, correct, ... }
   */
  handleNoteToggle(r, c, num, added) {
    if (!this._isActive) return { handled: false };

    // === noteToFill 阶段 ===
    if (this._currentPhase === 'noteToFill') {
      return this._handleNoteToFillInput(r, c, num, added);
    }

    // === guided 阶段 NOTE_ONLY 模式 ===
    if (this._currentPhase === 'guided') {
      if (!this._isWaitingInput) return { handled: false };
      const guided = this._lessonPlan.phases.guided;
      if (!guided) return { handled: false };
      const interactionType = guided.interactionType || 'NUMBER';
      if (interactionType !== 'NOTE_ONLY') return { handled: false };

      const [tr, tc] = guided.targetCell;
      if (r !== tr || c !== tc) return { handled: false };

      const expected = guided.expectedNote || [];
      const cell = this._getEngineCell(r, c);
      if (!cell) return { handled: false };

      const currentNotes = cell.candidates ? Array.from(cell.candidates) : [];
      const allPresent = expected.every(n => currentNotes.includes(n));

      if (allPresent) {
        this._isWaitingInput = false;
        this._showBubble(guided.successText || '笔记记好了！', '伊藤', guided.successVoiceId || null);
        this._emit('onInputResult', 'success', { phase: 'guided', noteComplete: true });
        this._clearAllHighlights();
        this._delayThen(() => this._enterSemiAutoOrFree(), 1500);
        return { handled: true, correct: true, noteComplete: true };
      }

      return { handled: true, correct: false, noteComplete: false, currentCount: currentNotes.length, targetCount: expected.length };
    }

    // === semiAuto 阶段 ===
    if (this._currentPhase === 'semiAuto') {
      const semiAuto = this._lessonPlan.phases.semiAuto;
      if (!semiAuto) return { handled: false };
      const interactionType = semiAuto.interactionType || 'NUMBER';
      if (interactionType !== 'NOTE_ONLY') return { handled: false };

      const watchCells = semiAuto.watchCells || [];
      const isWatched = watchCells.length === 0 || watchCells.some(([wr, wc]) => wr === r && wc === c);
      if (!isWatched) return { handled: false };

      // 2026-08-04：遥测——watchCells 笔记命中（NOTE_ONLY 模式的引导格采纳情况）
      this._recordLessonEvent('watch', { cell: [r, c], num: num, correct: true, note: true, added: !!added });

      if (added) {
        this._semiAutoFilled++;
        // V4.3.28：记对一格 → 移除该格脉冲（其余引导格保留）+ 进度提示
        this._emit('onAction', { type: 'highlightCell', r, c, enabled: false });
        const remaining = targetCount - this._semiAutoFilled;
        if (remaining > 0) {
          this._showBubble('记对了！还剩 ' + remaining + ' 个引导格。', '伊藤', null);
        }
      }

      const targetCount = semiAuto.targetCount || 3;
      if (this._semiAutoFilled >= targetCount) {
        this._delayThen(() => this._enterPhase('free'), 800);
      }

      return { handled: true, semiAuto: true, filled: this._semiAutoFilled, target: targetCount };
    }

    return { handled: false };
  }

  /**
   * 处理玩家进入 What If 模式
   */
  handleWhatIfEnter() {
    if (!this._isActive) return { handled: false };
    const guided = this._lessonPlan.phases.guided;

    if (this._currentPhase === 'guided' && guided) {
      if (!this._isWaitingInput) return { handled: false };
      const interactionType = guided.interactionType || 'NUMBER';
      if (interactionType !== 'WHAT_IF_ENTRY') return { handled: false };

      this._whatIfEntered = true;
      this._isWaitingInput = false;
      this._showBubble(guided.successText || '进入假设模式试试吧。', '伊藤', guided.successVoiceId || null);
      this._emit('onInputResult', 'success', { phase: 'guided', whatIfEntered: true });
      this._clearAllHighlights();
      this._delayThen(() => this._enterSemiAutoOrFree(), 1500);
      return { handled: true, correct: true, whatIfEntered: true };
    }

    return { handled: false };
  }

  /**
   * 处理 What If 模式下的填数
   */
  handleWhatIfCellFill(r, c, num) {
    if (!this._isActive) return { handled: false };

    if (this._currentPhase === 'semiAuto') {
      const semiAuto = this._lessonPlan.phases.semiAuto;
      if (!semiAuto) return { handled: false };
      const interactionType = semiAuto.interactionType || 'NUMBER';
      if (interactionType !== 'WHAT_IF_FILL') return { handled: false };

      const watchCells = semiAuto.watchCells || [];
      const isWatched = watchCells.length === 0 || watchCells.some(([wr, wc]) => wr === r && wc === c);
      if (!isWatched) return { handled: false };

      let isCorrect = true;
      if (this._levelData?.solution) {
        isCorrect = this._levelData.solution[r][c] === num;
      }
      // V4.3.28：格子去重计数（与 handleCellFill 一致，UI 先落子会污染 fillNum 判断）
      const cellKey = r + ',' + c;
      if (isCorrect && !this._semiAutoFilledCells.has(cellKey)) {
        this._semiAutoFilledCells.add(cellKey);
        this._semiAutoFilled++;
        // V4.3.28：填对一格 → 移除该格脉冲（其余引导格保留）+ 进度提示
        this._emit('onAction', { type: 'highlightCell', r, c, enabled: false });
        const targetCount2 = semiAuto.targetCount || 3;
        const remaining = targetCount2 - this._semiAutoFilled;
        if (remaining > 0) {
          this._showBubble('填对了！还剩 ' + remaining + ' 个引导格。', '伊藤', null);
        }
      } else if (!isCorrect) {
        // V4.3.29：semiAuto 填错 → 鼓励
        this._emit('onAction', { type: 'shakeCell', r, c });
        this._showBubble('不对哦，再想想～每个引导格都能用学过的规则推出来。', '伊藤', null);
      }

      const targetCount = semiAuto.targetCount || 3;
      if (this._semiAutoFilled >= targetCount) {
        this._delayThen(() => this._enterPhase('free'), 800);
      }

      return { handled: true, semiAuto: true, whatIf: true, filled: this._semiAutoFilled, target: targetCount, correct: isCorrect };
    }

    return { handled: false };
  }

  // ==================== 阶段流转 ====================

  _enterPhase(phase) {
    // 2026-08-05：离开任何阶段时清理 guided 超时定时器
    this._clearGuidedTimeout();

    try {
      const prev = this._currentPhase;
      this._currentPhase = phase;
      this._emit('onPhaseChange', phase, prev);
      this._recordLessonEvent('phase', { from: prev, to: phase });

      // 记录回退栈（用于错误恢复）
      if (phase !== 'idle' && phase !== 'done' && phase !== prev) {
        this._fallbackStack.push(prev);
        if (this._fallbackStack.length > 10) this._fallbackStack.shift();
      }

      switch (phase) {
        case 'intro': this._playIntro(); break;
        case 'demo':
          this._demoStepIndex = 0;
          if (this._stepTimer) { clearTimeout(this._stepTimer); this._stepTimer = null; }
          // keepState：清高亮但保留聚光灯/冻结（intro 已开灯，避免闪断）
          this._clearAllHighlights(true);
          this._emit('onAction', { type: 'spotlight', enabled: true, intensity: 0.35 });
          this._setFreezeEnabled(true);
          this._nextDemoStep();
          break;
        case 'guided': this._startGuided(); break;
        case 'noteToFill': this._startNoteToFill(); break;
        case 'semiAuto': this._startSemiAuto(); break;
        case 'free': this._startFree(); break;
      }
    } catch (err) {
      console.error('[LessonPlayer] _enterPhase 出错 (phase:', phase, '):', err);
      this._emit('onError', phase, err);
      // 全局回退：尝试回退到上一阶段，否则降级到 free
      this._fallbackRecover(err);
    }
  }

  _playIntro() {
    try {
      const intro = this._lessonPlan.phases.intro;
      if (!intro) {
        this._enterPhase('demo');
        return;
      }

      this._setFreezeEnabled(true);
      this._emit('onAction', { type: 'spotlight', enabled: true, intensity: 0.3 });

      // 自动聚焦引导目标格
      if (this._lessonPlan.phases.guided && this._lessonPlan.phases.guided.targetCell) {
        const [r, c] = this._lessonPlan.phases.guided.targetCell;
        this._emit('onAction', { type: 'focusCell', r, c });
      }

      this._showBubble(intro.text, intro.speaker || '伊藤', intro.voiceId || null);
      // 2026-08-03：intro 改为点击任意位置继续（不再自动消失）
    } catch (err) {
      console.error('[LessonPlayer] _playIntro 出错:', err);
      this._setFreezeEnabled(false);
      this._emit('onAction', { type: 'spotlight', enabled: false });
      this._enterPhase('demo');
    }
  }

  _nextDemoStep() {
    const steps = this._lessonPlan.phases.demo?.steps || [];

    if (this._demoStepIndex >= steps.length) {
      this._clearAllHighlights();
      this._setFreezeEnabled(false);
      this._enterPhase('guided');
      return;
    }

    const step = steps[this._demoStepIndex];
    this._executeAction(step);
    this._demoStepIndex++;
    // 2026-08-03：有讲解文案的步骤等待玩家点击任意位置继续（不自动消失）；
    // 纯动画步骤（无 text）仍按 duration 自动推进
    if (step.text) {
      return;
    }
    const stepDuration = step.duration || 900;
    this._stepTimer = setTimeout(() => {
      this._stepTimer = null;
      if (this._currentPhase === 'demo' && this._isActive) {
        this._nextDemoStep();
      }
    }, stepDuration);
  }

  _startGuided() {
    const guided = this._lessonPlan.phases.guided;
    if (!guided) {
      this._enterSemiAutoOrFree();
      return;
    }

    this._guidedAttempts = 0;
    this._guidedNextIndex = 0;
    this._activeGuidedCell = guided.targetCell ? guided.targetCell.slice() : null;
    const interactionType = guided.interactionType || 'NUMBER';

    // WHAT_IF_ENTRY 模式：不冻结，高亮按钮，等待玩家点击「假设」按钮
    if (interactionType === 'WHAT_IF_ENTRY') {
      this._whatIfEntered = false;
      this._isWaitingInput = true;
      this._emit('onAction', { type: 'highlightButton', button: 'whatif', highlight: true });
      this._emit('onAction', { type: 'spotlight', enabled: true, intensity: 0.4 });
      this._setFreezeEnabled(false);
      // V4.3.27：修复引导缺失——fallback 提示文案 + 气泡 + 无操作超时
      const hintText = guided.hintText || guided.autoRevealText ||
        '点击右上角「假设」按钮（或按 W 键）进入假设模式，再尝试填入答案。';
      this._emit('onNeedInput', 'guided', { interactionType, hintText: hintText });
      this._showBubble(hintText, '伊藤', guided.voiceId || null);
      this._recordLessonEvent('guided', { interactionType, hintText: hintText });
      if (guided.autoRevealAfter > 0 && guided.targetCell) {
        this._startGuidedTimeout(guided.targetCell, null, hintText);
      }
      return;
    }

    if (interactionType === 'NOTE_ONLY') {
      this._emit('onAction', { type: 'highlightButton', button: 'note', highlight: true });
    }

    // 冻结 + 聚光灯（只让目标格可见可操作）
    this._emit('onAction', { type: 'spotlight', enabled: true, intensity: 0.4 });
    this._setFreezeEnabled(true);

    // 五步教学第一步：先讲判断方法，再放玩家填
    if (guided.methodText) {
      this._guidedExplaining = true;
      this._isWaitingInput = false;
      this._showBubble(guided.methodText, '伊藤', guided.voiceId || null);
      // 2026-08-03：方法讲解等待玩家点击任意位置继续（advance() 处理跳转）
    } else {
      this._beginGuidedInput();
    }
  }

  /**
   * 引导填数阶段：目标格脉冲 + 提示条 + 引导气泡
   * @private
   */
  _beginGuidedInput() {
    const guided = this._lessonPlan.phases.guided;
    if (!guided) return;
    // 若当前目标格已被玩家提前填出答案（如探索时误填），自动跳到下一个未填引导格
    let target = this._activeGuidedCell || guided.targetCell;
    let guard = 0;
    while (target && this._cellAlreadyFilled(target[0], target[1]) && guard++ < 20) {
      const found = this._findNextUnguidedCell(guided.successNext || [], this._guidedNextIndex);
      if (found) {
        const [next, idx] = found;
        this._guidedNextIndex = idx + 1;
        target = next.cell.slice();
      } else {
        target = null;
      }
    }
    if (!target) {
      // 链上全部已填：直接总结进入下一阶段
      this._isWaitingInput = false;
      this._showBubble(guided.successText || '答对了！', '伊藤', guided.successVoiceId || null);
      this._emit('onInputResult', 'success', { phase: 'guided', attempts: this._guidedAttempts });
      this._clearAllHighlights();
      this._delayThen(() => this._enterSemiAutoOrFree(), 1600); // 手感审计：1800→1600ms（与 458 行一致）
      return;
    }
    this._activeGuidedCell = target.slice();
    const r = target[0], c = target[1];
    const sol = this._levelData && this._levelData.solution;
    const value = (sol && sol[r]) ? sol[r][c] : guided.correctValue;

    this._isWaitingInput = true;
    this._emit('onAction', { type: 'highlightCell', r, c, mode: 'pulse' });
    this._emit('onAction', { type: 'spotlight', enabled: true, intensity: 0.4 });
    this._setFreezeEnabled(true);

    this._emit('onNeedInput', 'guided', {
      cell: target,
      value: value,
      interactionType: guided.interactionType || 'NUMBER',
      expectedNote: guided.expectedNote,
      hintText: guided.hintText,
    });

    const hintText = guided.hintText || (guided.interactionType === 'NOTE_ONLY'
      ? '在目标格中记下候选数吧。'
      : '试试在这里填入正确的数字。');
    this._showBubble(hintText, '伊藤', guided.voiceId || null);
    // 2026-08-04：遥测——引导提示（目标格 + 期望值）
    this._recordLessonEvent('guided', { cell: target.slice(), value: value, hintText: hintText });

    // 2026-08-05：任务 B——无操作超时提示（autoRevealAfter 真实生效）
    this._startGuidedTimeout(target, value);
  }

  /**
   * guided 无操作超时：玩家长时间未填目标格时弹一次 hintText 提示，
   * 但绝不自动揭示/代填——所有引导格必须玩家亲手填写（V4.3.29 产品要求）。
   * 玩家任何有效操作（填对/填错）都会在 handleCellFill 中清除该定时器。
   * V4.3.30：只提示一次，不再循环弹气泡（避免反复覆盖气泡导致玩家看不全）。
   * @private
   */
  _startGuidedTimeout(target, value, hintTextOverride) {
    this._clearGuidedTimeout();
    const guided = this._lessonPlan.phases.guided;
    if (!guided) return;
    const timeoutMs = (typeof guided.autoRevealAfter === 'number' && guided.autoRevealAfter > 0)
      ? guided.autoRevealAfter * 1000 : 5000;
    const r = target[0], c = target[1];
    const hintText = hintTextOverride || guided.hintText || guided.autoRevealText ||
      '试试在这里填入正确的数字。';

    this._guidedTimeoutTimer = setTimeout(() => {
      this._guidedTimeoutTimer = null;
      if (!this._isActive || this._currentPhase !== 'guided' || !this._isWaitingInput) return;
      // 超时：仅弹一次提示鼓励玩家继续尝试（V4.3.29：不自动揭示，必须玩家亲手填）
      this._showBubble(hintText, '伊藤', guided.voiceId || null);
      this._recordLessonEvent('timeout_hint', { cell: [r, c], text: hintText });
    }, timeoutMs);
  }

  /**
   * 清除 guided 超时定时器（玩家操作后调用）
   * @private
   */
  _clearGuidedTimeout() {
    if (this._guidedTimeoutTimer) {
      clearTimeout(this._guidedTimeoutTimer);
      this._guidedTimeoutTimer = null;
    }
  }

  /**
   * noteToFill 桥梁阶段
   * guided 和 semiAuto 之间的过渡，让玩家在锁定格子中练习候选数笔记
   */
  _startNoteToFill() {
    const noteToFill = this._lessonPlan.phases.noteToFill;
    const guided = this._lessonPlan.phases.guided;
    // 优先使用 noteToFill 阶段的独立配置，否则回退到 guided
    const ntf = noteToFill || guided;
    if (!ntf || !ntf.targetCell || !ntf.expectedNote) {
      this._enterSemiAutoOrFree();
      return;
    }

    this._isWaitingInput = true;
    const [r, c] = ntf.targetCell;

    this._emit('onAction', { type: 'highlightCell', r, c, mode: 'pulse' });
    this._emit('onAction', { type: 'highlightButton', button: 'note', highlight: true });
    this._emit('onAction', { type: 'spotlight', enabled: true, intensity: 0.4 });
    this._setFreezeEnabled(true);

    this._emit('onNeedInput', 'noteToFill', {
      cell: ntf.targetCell,
      interactionType: 'NOTE_ONLY',
      expectedNote: ntf.expectedNote,
    });

    const hintText = (ntf.hintText || guided?.hintText || '先在目标格中记下候选数，再填入正确答案。');
    this._showBubble(hintText, '伊藤', ntf.voiceId || guided?.voiceId || null);
  }

  /**
   * 处理 noteToFill 阶段的笔记输入
   */
  _handleNoteToFillInput(r, c, num, added) {
    const noteToFill = this._lessonPlan.phases.noteToFill;
    const guided = this._lessonPlan.phases.guided;
    const ntf = noteToFill || guided;
    if (!ntf || !this._isWaitingInput) return { handled: false };

    const [tr, tc] = ntf.targetCell;
    if (r !== tr || c !== tc) return { handled: false, isTarget: false };

    const expected = ntf.expectedNote || [];
    const cell = this._getEngineCell(r, c);
    if (!cell) return { handled: false };

    const currentNotes = cell.candidates ? Array.from(cell.candidates) : [];

    // 检查是否已写完预期笔记
    const allPresent = expected.every(n => currentNotes.includes(n));

    if (allPresent) {
      // 笔记完成后，自动进入 semiAuto 阶段
      this._isWaitingInput = false;
      this._showBubble(guided.successText || '笔记记好了！现在试试填入正确答案吧。', '伊藤', guided.successVoiceId || null);
      this._emit('onInputResult', 'success', { phase: 'noteToFill', noteComplete: true });
      this._emit('onAction', { type: 'highlightButton', button: 'note', highlight: false });
      this._clearAllHighlights();

      // 延迟后进入 semiAuto 或 free
      this._delayThen(() => {
        this._enterSemiAutoOrFree();
      }, 1500);

      return { handled: true, correct: true, noteComplete: true };
    }

    // 还没写完，继续等待
    return { handled: true, correct: false, noteComplete: false, currentCount: currentNotes.length, targetCount: expected.length };
  }

  _handleGuidedError(wrongNum) {
    const guided = this._lessonPlan.phases.guided;
    const maxAttempts = guided.maxAttempts || 2;
    const target = this._activeGuidedCell || guided.targetCell;

    // V4.3.29：填错一律鼓励，绝不自动揭示/代填——引导格必须玩家亲手填对
    // 达 maxAttempts 后不再走 autoReveal，而是重置尝试次数继续鼓励
    const attemptExceeded = this._guidedAttempts >= maxAttempts;
    if (attemptExceeded) {
      this._guidedAttempts = 0;
    }

    this._emit('onAction', { type: 'shakeCell', r: target[0], c: target[1] });
    // 冲突格高亮：让玩家自己看到矛盾（如行内已有的数字）
    if (guided.failConflictCell && Array.isArray(guided.failConflictCell) && guided.failConflictCell.length === 2) {
      this._emit('onAction', {
        type: 'highlightCell', r: guided.failConflictCell[0], c: guided.failConflictCell[1], mode: 'conflict',
      });
    }
    // 鼓励文案：首次错用 failHint，之后用鼓励语（填错不惩罚，继续尝试）
    const encourage = attemptExceeded
      ? '差一点！别灰心，再想想——' + (guided.failHint || '再试一次，你能行的。')
      : (guided.failHint || '不对哦，再看看。');
    this._showBubble(encourage, '伊藤', null);
    // 2026-08-04：遥测——填错提示（failHint 触发）
    this._recordLessonEvent('fail', {
      cell: (Array.isArray(target) && target.length === 2) ? target.slice() : null,
      wrongNum: wrongNum,
      attempts: this._guidedAttempts,
      maxAttempts: maxAttempts,
      autoReveal: false,
    });

    this._delayThen(() => {
      this._emit('onAction', { type: 'highlightCell', r: target[0], c: target[1], mode: 'pulse' });
    }, 800);

    return { handled: true, correct: false, attempt: this._guidedAttempts, maxAttempts, autoRevealed: false };
  }

  _autoRevealGuided() {
    const guided = this._lessonPlan.phases.guided;
    const interactionType = guided.interactionType || 'NUMBER';

    if (interactionType === 'WHAT_IF_ENTRY') {
      // V4.3.27：修复卡死——揭示后保持等待玩家点击「假设」按钮，并重启超时提示
      this._isWaitingInput = true;
      this._guidedAttempts = 0;
      this._showBubble(guided.autoRevealText || '看到右上角的"假设"按钮了吗？点击它进入假设模式试试吧。', '伊藤', null);
      this._emit('onAction', { type: 'highlightButton', button: 'whatif', highlight: true });
      this._emit('onInputResult', 'auto_reveal_whatif', {});
      this._recordLessonEvent('reveal', { interactionType: 'WHAT_IF_ENTRY', autoReveal: true });
      if (guided.targetCell) {
        this._startGuidedTimeout(guided.targetCell, null, guided.hintText || guided.autoRevealText);
      }
      return;
    }

    const target = this._activeGuidedCell || guided.targetCell;
    const r = target[0], c = target[1];

    if (interactionType === 'NOTE_ONLY') {
      const expectedNote = guided.expectedNote || [];
      // 通过引擎填入笔记
      for (const n of expectedNote) {
        this._engine.toggleNote(r, c, n);
      }
      this._emit('onAction', { type: 'highlightCell', r, c, mode: 'success' });
      const noteList = expectedNote.join('、');
      this._showBubble('这里应该先记笔记：' + noteList + '。没关系，继续加油！', '伊藤', null);
      this._emit('onInputResult', 'auto_reveal_note', { cell: [r, c], notes: expectedNote });
    } else {
      // NUMBER 模式：自动填入正确答案
      this._engine.fillCell(r, c, guided.correctValue);
      this._emit('onAction', { type: 'highlightCell', r, c, mode: 'success' });
      this._showBubble('这里应该填 ' + guided.correctValue + '。没关系，继续加油！', '伊藤', null);
      this._emit('onInputResult', 'auto_reveal', { cell: [r, c], value: guided.correctValue });
    }

    if (interactionType === 'NOTE_ONLY') {
      this._emit('onAction', { type: 'highlightButton', button: 'note', highlight: false });
    }

    // 2026-08-04：遥测——自动揭示（提示玩家正确答案）
    this._recordLessonEvent('reveal', {
      cell: [r, c],
      value: interactionType === 'NOTE_ONLY' ? null : guided.correctValue,
    });

    this._delayThen(() => {
      this._clearAllHighlights();
      this._enterSemiAutoOrFree();
    }, 2000);
  }

  _startSemiAuto() {
    const semiAuto = this._lessonPlan.phases.semiAuto;
    if (!semiAuto || !semiAuto.enabled) {
      this._enterPhase('free');
      return;
    }

    this._semiAutoFilled = 0;
    this._semiAutoFilledCells = new Set();
    this._isWaitingInput = false;

    this._emit('onAction', { type: 'spotlight', enabled: false });
    this._setFreezeEnabled(false);

    // 2026-08-05：任务 C——semiAuto 强引导：非 watchCells 格冻结，只允许填引导格
    // （仅当 watchCells 非空且关卡配置 lockDuringSemiAuto !== false 时启用）
    this._semiAutoFrozenCells = new Set();
    const lockEnabled = semiAuto.lockDuringSemiAuto !== false;
    if (lockEnabled && Array.isArray(semiAuto.watchCells) && semiAuto.watchCells.length > 0) {
      for (const [wr, wc] of semiAuto.watchCells) {
        this._semiAutoFrozenCells.add(wr + ',' + wc);
      }
      this._emit('onAction', { type: 'freeze', enabled: true });
    }

    const hintText = semiAuto.hintText || '试试用同样的思路，再找几个可以确定的数字。';
    this._showBubble(hintText, '伊藤', semiAuto.voiceId || null);

    if (semiAuto.watchCells && semiAuto.watchCells.length > 0) {
      this._clearAllHighlights();
      for (const [wr, wc] of semiAuto.watchCells) {
        this._emit('onAction', { type: 'highlightCell', r: wr, c: wc, mode: 'pulse' });
      }
    }
  }

  /**
   * semiAuto 解锁（填满 targetCount 后调用）：清空冻结集合，解除锁定
   * @private
   */
  _unlockSemiAuto() {
    this._semiAutoFrozenCells = new Set();
    this._emit('onAction', { type: 'freeze', enabled: false });
  }

  _startFree() {
    const free = this._lessonPlan.phases.free;
    this._isActive = false;
    this._isWaitingInput = false;
    this._clearAllHighlights();

    this._emit('onAction', { type: 'spotlight', enabled: false });
    this._setFreezeEnabled(false);

    if (free?.unlockText) {
      this._showBubble(free.unlockText, '伊藤', null);
    }

    // V4.3.31：进入自由模式后检查一次雪崩收尾（仅在剩余空格 ≤5 时触发，
    // 由 checkAvalanche 内部阈值控制；剩余多时不自动补全，留给玩家练习）。
    this._delayThen(() => {
      this.checkAvalanche();
    }, 1400);

    this._freeTimer = this._delayThen(() => {
      this._freeTimer = null;
      // 雪崩已全部补满时 currentPhase 为 done，不再重复 onComplete
      if (this._currentPhase !== 'done') {
        this._emit('onComplete');
      }
    }, 2000);
  }

  _enterSemiAutoOrFree() {
    const phases = this._lessonPlan.phases;
    // noteToFill 桥梁阶段：仅当从 guided 等前置阶段进入、且当前尚未在 noteToFill 时插入。
    // V4.3.32：修复 401 死循环——noteToFill 完成后再次调用本方法时，
    // 若不加当前阶段判断会重新进入 noteToFill，玩家永远卡在这一阶段。
    if (this._currentPhase !== 'noteToFill' && phases.noteToFill && phases.noteToFill.targetCell && phases.noteToFill.expectedNote) {
      this._enterPhase('noteToFill');
    } else if (phases.semiAuto && phases.semiAuto.enabled) {
      this._enterPhase('semiAuto');
    } else {
      this._enterPhase('free');
    }
  }

  /**
   * 全局回退策略
   * 出错时尝试回退到上一阶段，否则降级到 free
   */
  _fallbackRecover(originalError) {
    console.warn('[LessonPlayer] 执行全局回退，当前阶段:', this._currentPhase);

    this._setFreezeEnabled(false);
    this._emit('onAction', { type: 'spotlight', enabled: false });
    this._clearAllHighlights();

    // 尝试回退到栈中上一个阶段
    while (this._fallbackStack.length > 0) {
      const prevPhase = this._fallbackStack.pop();
      if (prevPhase !== 'idle' && prevPhase !== 'done' && prevPhase !== this._currentPhase) {
        console.warn('[LessonPlayer] 回退到阶段:', prevPhase);
        this._currentPhase = prevPhase;

        // 清除计时器
        if (this._stepTimer) {
          clearTimeout(this._stepTimer);
          this._stepTimer = null;
        }

        // 显示回退气泡
        this._showBubble('教学出现了一点小问题，我们回到上一步重试。', '伊藤', null);
        return;
      }
    }

    // 无有效回退阶段，降级到 free
    console.warn('[LessonPlayer] 回退栈为空，降级到自由模式');
    this._currentPhase = 'free';
    this._isActive = false;
    this._isWaitingInput = false;
    this._showBubble('教学出现异常，已切换到自由模式，你可以继续游戏。', '伊藤', null);
    this._delayThen(() => {
      this._emit('onComplete');
    }, 1000);
  }

  // ==================== Action 执行 ====================

  _executeAction(step) {
    const { action, target, text, voiceId } = step;

    if (text) {
      this._showBubble(text, step.speaker || '伊藤', voiceId);
    }

    switch (action) {
      case 'highlightRow':
        if (typeof target === 'number') {
          this._activeHighlights.rows.add(target);
          this._emit('onAction', { type: 'highlightRow', row: target, enabled: true });
        }
        break;
      case 'highlightCol':
        if (typeof target === 'number') {
          this._activeHighlights.cols.add(target);
          this._emit('onAction', { type: 'highlightCol', col: target, enabled: true });
        }
        break;
      case 'highlightBox':
      case 'highlightPalace':
        if (typeof target === 'number') {
          this._activeHighlights.boxes.add(target);
          this._emit('onAction', { type: 'highlightBox', box: target, enabled: true });
        }
        break;
      case 'highlightCage':
        if (typeof target === 'number' || typeof target === 'string') {
          this._activeHighlights.cages.add(String(target));
          this._emit('onAction', { type: 'highlightCage', cageId: String(target), enabled: true });
        }
        break;
      case 'highlightCell':
        if (Array.isArray(target) && target.length === 2) {
          const key = target[0] + ',' + target[1];
          this._activeHighlights.cells.add(key);
          this._emit('onAction', { type: 'highlightCell', r: target[0], c: target[1], enabled: true });
        }
        break;
      case 'focusCell':
        if (Array.isArray(target) && target.length === 2) {
          // keepState：讲解演示中保持聚光灯与冻结状态（不闪断）
          this._clearAllHighlights(true);
          this._activeHighlights.focusCell = [target[0], target[1]];
          this._emit('onAction', { type: 'highlightCell', r: target[0], c: target[1], mode: 'pulse' });
        }
        break;
      case 'showSumBadge':
        this._emit('onAction', { type: 'pulseCageSum', cageId: target });
        break;
      case 'wait':
        break;
      case 'spotlightOn':
        this._emit('onAction', { type: 'spotlight', enabled: true, intensity: typeof target === 'number' ? target : 0.45 });
        break;
      case 'spotlightOff':
        this._emit('onAction', { type: 'spotlight', enabled: false });
        break;
      case 'freezeOn':
        this._setFreezeEnabled(true);
        break;
      case 'freezeOff':
        this._setFreezeEnabled(false);
        break;
      case 'clearHighlights':
        this._clearAllHighlights();
        break;
      case 'highlightButton':
        this._emit('onAction', { type: 'highlightButton', button: target, highlight: true });
        break;
      case 'unhighlightButton':
        this._emit('onAction', { type: 'highlightButton', button: target, highlight: false });
        break;
    }
  }

  // ==================== 辅助方法 ====================

  _setFreezeEnabled(enabled) {
    this._freezeEnabled = enabled;
    this._emit('onAction', { type: 'freeze', enabled });
  }

  _showBubble(text, speaker, voiceId) {
    this._emit('onBubble', text, speaker, voiceId);
    this._recordLessonEvent('bubble', { text: text, speaker: speaker || null, voiceId: voiceId || null });
  }

  /**
   * 记录教学事件（AI 调试遥测，2026-08-04）
   * 事件流让 AI 能从 JSON 还原「教学讲了什么、玩家是否跟上」
   * @private
   * @param {string} type - phase|bubble|guided|fail|reveal|watch
   * @param {Object} data - { cell, text, value, ... }（a3 之外用 [r,c] 数组）
   */
  _recordLessonEvent(type, data) {
    try {
      this._lessonEvents.push(Object.assign({
        seq: ++this._lessonEventSeq,
        ts: Date.now(),
        type: type,
        phase: this._currentPhase,
      }, data || {}));
      // 上限保护
      if (this._lessonEvents.length > 2000) {
        this._lessonEvents.splice(0, this._lessonEvents.length - 2000);
      }
    } catch (e) {
      console.warn('[LessonPlayer] _recordLessonEvent error:', e);
    }
  }

  /**
   * 获取教学事件列表（AI 调试用，浅拷贝）
   * @returns {Array}
   */
  getLessonEvents() {
    return this._lessonEvents.slice();
  }

  _clearAllHighlights(keepState) {
    this._activeHighlights = {
      rows: new Set(),
      cols: new Set(),
      boxes: new Set(),
      cages: new Set(),
      cells: new Set(),
      focusCell: null,
    };
    this._emit('onAction', { type: 'clearAllHighlights' });
    if (!keepState) {
      this._setFreezeEnabled(false);
      this._emit('onAction', { type: 'spotlight', enabled: false });
    }
  }

  _getEngineCell(r, c) {
    try {
      const state = this._engine.getState();
      return state.cells?.[r]?.[c] || null;
    } catch {
      return null;
    }
  }

  _delayThen(fn, ms) {
    // 2026-08-04：修复双分支缺陷（原实现 delay>0 时用固定值覆盖、忽略 ms，
    // 导致 1800/1500/800/2000ms 的各阶段过渡被统一成一个值）
    // 0    = Node 测试同步模式（保持测试契约）
    if (this._delay === 0) {
      fn();
      return null;
    }
    // null = 生产模式：使用各调用点的设计时长 ms
    // 正数 = 显式覆盖模式：统一使用该值
    const useMs = (this._delay === null || this._delay === undefined)
      ? (typeof ms === 'number' ? ms : 0)
      : this._delay;
    if (useMs > 0) {
      return setTimeout(fn, useMs);
    }
    fn();
    return null;
  }

  _emit(name, ...args) {
    const cb = this._callbacks[name];
    if (typeof cb === 'function') {
      try {
        cb(...args);
      } catch (err) {
        console.error('[LessonPlayer] 回调 ' + name + ' 执行出错:', err);
      }
    }
  }

  // ==================== 数据校验 ====================

  _validateLessonPlan() {
    const lp = this._lessonPlan;
    if (!lp || !lp.phases) return false;

    const size = 9; // 从 HeadlessEngine 获取
    const phases = lp.phases;
    const solution = this._levelData?.solution;

    if (phases.guided) {
      const interactionType = phases.guided.interactionType || 'NUMBER';
      if (interactionType === 'WHAT_IF_ENTRY') {
        // WHAT_IF_ENTRY 不需要 targetCell
      } else if (phases.guided.targetCell) {
        const [r, c] = phases.guided.targetCell;
        if (r < 0 || r >= size || c < 0 || c >= size) {
          console.error('[LessonPlayer] guided.targetCell 超出范围:', r, c);
          return false;
        }
        if (interactionType === 'NUMBER' && solution) {
          if (phases.guided.correctValue !== solution[r][c]) {
            console.error('[LessonPlayer] guided.correctValue 错误:', phases.guided.correctValue, '!=', solution[r][c]);
            return false;
          }
        }
        if (interactionType === 'NOTE_ONLY') {
          if (!Array.isArray(phases.guided.expectedNote) || phases.guided.expectedNote.length === 0) {
            console.error('[LessonPlayer] guided.expectedNote 无效');
            return false;
          }
        }
      }
    }

    return true;
  }

  // ==================== 清理 ====================

  _cleanup() {
    if (this._stepTimer) {
      clearTimeout(this._stepTimer);
      this._stepTimer = null;
    }
    if (this._freeTimer) {
      clearTimeout(this._freeTimer);
      this._freeTimer = null;
    }
    this._clearAllHighlights();
    this._isWaitingInput = false;
  }
}
