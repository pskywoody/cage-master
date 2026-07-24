/**
 * LessonPlayer - 教学引导播放器
 *
 * 五段式教学引擎：intro → demo → guided → semiAuto → free
 * 基于关卡数据中的 lessonPlan 字段驱动
 *
 * 设计原则：
 * - 纯逻辑层（LessonPlayer）只管状态机调度 + 动作分发
 * - 渲染层（Renderer）只管画
 * - 交互层（guide.js）只管输入转发
 *
 * 使用方式：
 *   const lp = new LessonPlayer({ board, renderer, levelData });
 *   lp.start();  // 启动教学
 *   lp.onComplete(callback);  // 教学完成回调
 *   lp.onSkip(callback);  // 跳过回调
 */

class LessonPlayer {
  constructor(options) {
    this._board = options.board;
    this._renderer = options.renderer;
    this._levelData = options.levelData;
    this._lessonPlan = options.levelData?.lessonPlan || null;

    // 状态
    this._currentPhase = 'idle';  // idle | intro | demo | guided | semiAuto | free | done
    this._demoStepIndex = 0;
    this._stepTimer = null;
    this._isWaitingInput = false;
    this._guidedAttempts = 0;
    this._semiAutoFilled = 0;
    this._isActive = false;
    this._isSkipped = false;
    this._freezeEnabled = false;  // 冻结遮罩开关
    this._frozenCells = new Set(); // 自定义冻结格子

    // 回调
    this._onComplete = null;
    this._onSkip = null;
    this._onNeedInput = null;     // 进入等待输入状态时触发
    this._onInputResult = null;  // 玩家输入结果回调（成功/失败）

    // 高亮缓存（用于清除）
    this._activeHighlights = {
      rows: new Set(),
      cols: new Set(),
      boxes: new Set(),
      cages: new Set(),
      cells: new Set(),
      focusCell: null,
    };

    // 绑定 this
    this._nextDemoStep = this._nextDemoStep.bind(this);
    this.handleCellFill = this.handleCellFill.bind(this);
  }

  // ==================== 公共 API ====================

  /**
   * 启动教学
   * @returns {boolean} 是否启动了教学（如果没有 lessonPlan 则返回 false）
   */
  start() {
    if (!this._lessonPlan || !this._lessonPlan.phases) {
      this._currentPhase = 'free';
      return false;
    }

    // 数据校验
    if (!this._validateLessonPlan()) {
      console.warn('[LessonPlayer] lessonPlan 校验失败，降级为自由模式');
      this._currentPhase = 'free';
      return false;
    }

    this._isActive = true;
    console.log('[LessonPlayer] 启动教学:', this._lessonPlan.newSkill);

    // 从 intro 阶段开始
    this._enterPhase('intro');

    return true;
  }

  /**
   * 跳过教学，直接进入自由模式
   */
  skip() {
    if (!this._isActive || this._isSkipped) return;

    this._isSkipped = true;
    this._isActive = false;
    this._cleanup();
    this._currentPhase = 'free';

    console.log('[LessonPlayer] 玩家跳过教学');

    if (this._onSkip) {
      this._onSkip();
    }
  }

  /** 当前阶段 */
  get currentPhase() {
    return this._currentPhase;
  }

  /** 是否处于活跃教学状态 */
  get isActive() {
    return this._isActive;
  }

  /** 是否在等待玩家输入 */
  get isWaitingInput() {
    return this._isWaitingInput;
  }

  /** 获取引导阶段的目标格 */
  getGuidedTarget() {
    if (this._currentPhase !== 'guided') return null;
    const guided = this._lessonPlan.phases.guided;
    return guided ? { cell: guided.targetCell, value: guided.correctValue } : null;
  }

  /** 获取当前交互类型（NUMBER 或 NOTE_ONLY） */
  getInteractionType() {
    if (this._currentPhase !== 'guided') return 'NUMBER';
    const guided = this._lessonPlan.phases.guided;
    return guided?.interactionType || 'NUMBER';
  }

  /**
   * 判断某格是否可交互（freezeMask 拦截）
   * @param {number} r
   * @param {number} c
   * @returns {boolean}
   */
  canInteractCell(r, c) {
    if (!this._isActive) return true;
    if (!this._freezeEnabled) return true;

    // guided 阶段：只有目标格可交互
    if (this._currentPhase === 'guided') {
      const guided = this._lessonPlan.phases.guided;
      if (guided && guided.targetCell) {
        const [tr, tc] = guided.targetCell;
        return r === tr && c === tc;
      }
    }

    // 有自定义冻结列表时
    if (this._frozenCells && this._frozenCells.size > 0) {
      return !this._frozenCells.has(r + ',' + c);
    }

    return true;
  }

  /**
   * 设置是否启用冻结遮罩
   * @param {boolean} enabled
   */
  setFreezeEnabled(enabled) {
    this._freezeEnabled = enabled;
    if (this._renderer && typeof this._renderer.setFreezeAll === 'function') {
      this._renderer.setFreezeAll(enabled);
    }
  }

  /**
   * 注册回调
   */
  onComplete(cb) { this._onComplete = cb; return this; }
  onSkip(cb) { this._onSkip = cb; return this; }
  onNeedInput(cb) { this._onNeedInput = cb; return this; }
  onInputResult(cb) { this._onInputResult = cb; return this; }
  onPhaseChange(cb) { this._onPhaseChange = cb; return this; }

  /**
   * 处理玩家填数（由 guide.js 调用）
   * @param {number} r 行
   * @param {number} c 列
   * @param {number} num 填入的数字
   * @returns {object} { handled: 是否由教学处理, correct: 是否正确（如果 handled=true 时有效 }
   */
  handleCellFill(r, c, num) {
    if (!this._isActive) {
      return { handled: false };
    }

    const guided = this._lessonPlan.phases.guided;

    if (this._currentPhase === 'guided' && guided) {
      // guided 阶段需要等待输入
      if (!this._isWaitingInput) {
        return { handled: false };
      }
      // NOTE_ONLY 模式：填数不由这里处理，由 handleNoteToggle 处理
      const interactionType = guided.interactionType || 'NUMBER';
      if (interactionType === 'NOTE_ONLY') {
        return { handled: false };
      }

      // guided阶段：检查是否是目标格
      const [tr, tc] = guided.targetCell;
      if (r !== tr || c !== tc) {
        // 不是目标格，不处理（引导阶段玩家也不阻止，让 guide.js 决定是否拦截
        return { handled: false, isTarget: false };
      }

      this._guidedAttempts++;

      if (num === guided.correctValue) {
        // 答对了
        this._isWaitingInput = false;
        this._showSuccess(guided.successText, guided.successVoice);
        this._clearAllHighlights();

        // 短暂延迟后进入下一阶段
        setTimeout(() => {
          this._enterSemiAutoOrFree();
        }, 1500);

        return { handled: true, correct: true };
      } else {
        // 答错了
        // 陷阱检测：如果填的是 trapValue，触发特殊陷阱揭示
        if (guided.isTrap && guided.trapValue && num === guided.trapValue) {
          return this._handleTrap(num);
        }
        // 普通错误 → 三级容错
        return this._handleGuidedError(num);
      }
    }

    if (this._currentPhase === 'semiAuto') {
      const semiAuto = this._lessonPlan.phases.semiAuto;
      const targetCount = semiAuto?.targetCount || 3;

      // 只统计正确填入
      let isCorrect = true;
      if (this._levelData?.solution) {
        isCorrect = this._levelData.solution[r][c] === num;
      }
      if (isCorrect) {
        this._semiAutoFilled++;
      }

      // 达到目标数 → 进入 free 阶段
      if (this._semiAutoFilled >= targetCount) {
        setTimeout(() => {
          this._enterPhase('free');
        }, 800);
      }

      return { handled: true, correct: isCorrect, semiAuto: true, filled: this._semiAutoFilled, target: targetCount };
    }

    return { handled: false };
  }

  /**
   * 处理玩家切换笔记（由 guide.js 调用）
   * @param {number} r 行
   * @param {number} c 列
   * @param {number} num 切换的数字
   * @param {boolean} added true=添加笔记, false=移除笔记
   * @returns {object} { handled: 是否由教学处理 }
   */
  handleNoteToggle(r, c, num, added) {
    if (!this._isActive) {
      return { handled: false };
    }

    // === guided 阶段 ===
    if (this._currentPhase === 'guided') {
      if (!this._isWaitingInput) {
        return { handled: false };
      }

      const guided = this._lessonPlan.phases.guided;
      if (!guided) {
        return { handled: false };
      }

      // 只有 NOTE_ONLY 模式才处理笔记
      const interactionType = guided.interactionType || 'NUMBER';
      if (interactionType !== 'NOTE_ONLY') {
        return { handled: false };
      }

      const [tr, tc] = guided.targetCell;
      if (r !== tr || c !== tc) {
        return { handled: false }; // 不是目标格，不处理
      }

      const expected = guided.expectedNote || [];
      const cell = this._board?.cells?.[r]?.[c];
      if (!cell) return { handled: false };

      // 检查当前笔记是否包含所有 expectedNote
      const currentNotes = cell.candidates ? Array.from(cell.candidates) : [];
      const allPresent = expected.every(n => currentNotes.includes(n));

      if (allPresent) {
        // 所有预期笔记都写了 → 成功
        this._isWaitingInput = false;
        this._showSuccess(guided.successText || '笔记记好了！', guided.successVoiceId || null);
        this._clearAllHighlights();
        // 取消笔记按钮高亮
        this._dispatchEvent('lesson-highlight-button', { button: 'note', highlight: false });

        setTimeout(() => {
          this._enterSemiAutoOrFree();
        }, 1500);

        return { handled: true, correct: true, noteComplete: true };
      }

      // 还没写完，继续等（不计算错误次数，笔记是渐进式的）
      return { handled: true, correct: false, noteComplete: false, currentCount: currentNotes.length, targetCount: expected.length };
    }

    // === semiAuto 阶段 ===
    if (this._currentPhase === 'semiAuto') {
      const semiAuto = this._lessonPlan.phases.semiAuto;
      if (!semiAuto) return { handled: false };

      // 只有 NOTE_ONLY 交互类型才统计笔记
      const interactionType = semiAuto.interactionType || 'NUMBER';
      if (interactionType !== 'NOTE_ONLY') {
        return { handled: false };
      }

      // 检查是否是 watchCells 中的格子
      const watchCells = semiAuto.watchCells || [];
      const isWatched = watchCells.some(([wr, wc]) => wr === r && wc === c);
      if (!isWatched) {
        return { handled: false };
      }

      // 只统计添加笔记的操作（且该笔记是正确的候选数）
      if (added) {
        // 简单统计：只要在 watchCells 中添加了笔记就算一次
        // （更精确的话可以检查是否是正确答案的数字，这里简化处理）
        this._semiAutoFilled++;
      }

      const targetCount = semiAuto.targetCount || 3;

      // 达到目标数 → 进入 free 阶段
      if (this._semiAutoFilled >= targetCount) {
        setTimeout(() => {
          this._enterPhase('free');
        }, 800);
      }

      return { handled: true, semiAuto: true, filled: this._semiAutoFilled, target: targetCount };
    }

    return { handled: false };
  }

  /**
   * 快进/跳过当前动画步骤（玩家点击屏幕时调用）
   */
  advance() {
    if (!this._isActive) return false;

    if (this._currentPhase === 'intro') {
      // intro 阶段点击 → 直接进入 demo
      this._enterPhase('demo');
      return true;
    }

    if (this._currentPhase === 'demo') {
      // demo 阶段点击 → 跳过当前步，进入下一步
      if (this._stepTimer) {
        clearTimeout(this._stepTimer);
        this._stepTimer = null;
      }
      this._nextDemoStep();
      return true;
    }

    return false;
  }

  /** 销毁 */
  destroy() {
    this._cleanup();
    this._isActive = false;
  }

  // ==================== 阶段流转 ====================

  _enterPhase(phase) {
    const prev = this._currentPhase;
    this._currentPhase = phase;
    console.log('[LessonPlayer] 阶段:', prev, '→', phase);

    if (this._onPhaseChange) {
      this._onPhaseChange(phase, prev);
    }

    switch (phase) {
      case 'intro':
        this._playIntro();
        break;
      case 'demo':
        this._demoStepIndex = 0;
        this._clearAllHighlights();
        // demo 阶段开启聚光灯（配合演示高亮，让玩家知道正在教学）
        if (this._renderer && typeof this._renderer.setSpotlight === 'function') {
          this._renderer.setSpotlight(true, 0.35);
        }
        this._nextDemoStep();
        break;
      case 'guided':
        this._startGuided();
        break;
      case 'semiAuto':
        this._startSemiAuto();
        break;
      case 'free':
        this._startFree();
        break;
    }
  }

  _playIntro() {
    const intro = this._lessonPlan.phases.intro;
    if (!intro) {
      this._enterPhase('demo');
      return;
    }

    // intro 阶段就开启聚光灯，让玩家知道正在教学
    if (this._renderer && typeof this._renderer.setSpotlight === 'function') {
      this._renderer.setSpotlight(true, 0.3);
    }

    // 触发气泡显示 intro 文字
    this._showBubble(intro.text, intro.speaker, intro.voiceId);

    // duration 后自动进入 demo 阶段
    const duration = intro.duration || 3000;
    this._stepTimer = setTimeout(() => {
      this._enterPhase('demo');
    }, duration);
  }

  _nextDemoStep() {
    const steps = this._lessonPlan.phases.demo?.steps || [];

    if (this._demoStepIndex >= steps.length) {
      // demo 结束 → 进入 guided 阶段
      this._clearAllHighlights();
      this._enterPhase('guided');
      return;
    }

    const step = steps[this._demoStepIndex];
    this._executeAction(step);
    this._demoStepIndex++;

    // 等待 duration 后进入下一步
    const duration = step.duration || 1500;
    this._stepTimer = setTimeout(() => {
      this._nextDemoStep();
    }, duration);
  }

  _startGuided() {
    const guided = this._lessonPlan.phases.guided;
    if (!guided) {
      this._enterSemiAutoOrFree();
      return;
    }

    this._guidedAttempts = 0;
    this._isWaitingInput = true;

    const interactionType = guided.interactionType || 'NUMBER';
    const [r, c] = guided.targetCell;

    // 高亮目标格
    this._highlightCell(r, c, 'pulse');

    // NOTE_ONLY 模式：高亮笔记按钮
    if (interactionType === 'NOTE_ONLY') {
      this._dispatchEvent('lesson-highlight-button', { button: 'note', highlight: true });
    }

    // 自动开启聚光灯 + 冻结（只让目标格可交互）
    if (this._renderer && typeof this._renderer.setSpotlight === 'function') {
      this._renderer.setSpotlight(true, 0.4);
    }
    this.setFreezeEnabled(true);

    if (this._onNeedInput) {
      this._onNeedInput('guided', {
        cell: guided.targetCell,
        value: guided.correctValue,
        interactionType: interactionType,
        expectedNote: guided.expectedNote,
      });
    }

    console.log('[LessonPlayer] 引导阶段：等待玩家', interactionType, r, c,
      interactionType === 'NOTE_ONLY' ? guided.expectedNote : guided.correctValue);
  }

  _handleGuidedError(wrongNum) {
    const guided = this._lessonPlan.phases.guided;
    const maxAttempts = guided.maxAttempts || 2;
    const interactionType = guided.interactionType || 'NUMBER';

    if (this._guidedAttempts < maxAttempts) {
      // 第1次错误：摇晃 + 提示文字 + 重新高亮
      this._shakeCell(guided.targetCell[0], guided.targetCell[1]);
      this._showBubble(guided.failHint || '不对哦，再看看。', '守笼人', null);

      // 重新播放最后几步演示（简化：重新高亮目标格）
      setTimeout(() => {
        this._highlightCell(guided.targetCell[0], guided.targetCell[1], 'pulse');
      }, 800);

      console.log('[LessonPlayer] 引导错误 (第', this._guidedAttempts, '次):', wrongNum);

      return { handled: true, correct: false, attempt: this._guidedAttempts, maxAttempts };
    } else {
      // 达到最大尝试次数 → 自动揭示
      this._isWaitingInput = false;
      this._autoRevealGuided();
      return { handled: true, correct: false, autoRevealed: true };
    }
  }

  _handleTrap(trapValue) {
    const guided = this._lessonPlan.phases.guided;
    const [r, c] = guided.targetCell;

    // 陷阱揭示：摇晃 + 特殊提示文字（不消耗尝试次数）
    this._shakeCell(r, c);
    this._showBubble(guided.trapText || '表面上对了，但还有哪里不对……再仔细看看。', '守笼人', guided.trapVoiceId || null);

    // 陷阱不算错误次数，给玩家重新思考的机会
    console.log('[LessonPlayer] 陷阱触发:', trapValue, '→ 不消耗尝试次数');

    return { handled: true, correct: false, isTrap: true, attempt: this._guidedAttempts };
  }

  _autoRevealGuided() {
    const guided = this._lessonPlan.phases.guided;
    const [r, c] = guided.targetCell;
    const interactionType = guided.interactionType || 'NUMBER';

    if (interactionType === 'NOTE_ONLY') {
      // NOTE_ONLY 模式：自动填入预期笔记
      const expectedNote = guided.expectedNote || [];
      if (this._board && this._board.cells[r][c]) {
        const cell = this._board.cells[r][c];
        if (!cell.candidates) cell.candidates = new Set();
        expectedNote.forEach(n => cell.candidates.add(n));
      }

      // 视觉反馈
      this._highlightCell(r, c, 'success');

      const noteList = expectedNote.join('、');
      const revealText = '这里应该先记笔记：' + noteList + '。没关系，继续加油！';
      this._showBubble(revealText, '守笼人', null);

      console.log('[LessonPlayer] 自动揭示笔记:', r, c, '=', expectedNote);

      if (this._onInputResult) {
        this._onInputResult('auto_reveal_note', { cell: [r, c], notes: expectedNote });
      }
    } else {
      // NUMBER 模式：自动填入正确答案
      if (this._board && this._board.cells[r][c]) {
        this._board.cells[r][c].fillNum = guided.correctValue;
      }

      // 视觉反馈
      this._highlightCell(r, c, 'success');

      const revealText = '这里应该填 ' + guided.correctValue + '。没关系，继续加油！';
      this._showBubble(revealText, '守笼人', null);

      console.log('[LessonPlayer] 自动揭示:', r, c, '=', guided.correctValue);

      if (this._onInputResult) {
        this._onInputResult('auto_reveal', { cell: [r, c], value: guided.correctValue });
      }
    }

    // 取消笔记按钮高亮
    if (interactionType === 'NOTE_ONLY') {
      this._dispatchEvent('lesson-highlight-button', { button: 'note', highlight: false });
    }

    // 延迟后进入下一阶段
    setTimeout(() => {
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
    this._isWaitingInput = false;  // semiAuto 不锁输入，但统计填写

    // 显示提示
    if (semiAuto.hintText) {
      this._showBubble(semiAuto.hintText, '守笼人', semiAuto.voiceId);
    }

    console.log('[LessonPlayer] 半自主阶段：目标填', semiAuto.targetCount, '格');

    // 每填 targetCount 格后自动进入 free
    // （实际检测在 handleCellFill 中
  }

  _startFree() {
    const free = this._lessonPlan.phases.free;
    this._isActive = false;
    this._isWaitingInput = false;
    this._clearAllHighlights();

    // 关闭聚光灯/冻结等教学视觉元素
    if (this._renderer && typeof this._renderer.setSpotlight === 'function') {
      this._renderer.setSpotlight(false);
    }
    if (typeof this.setFreezeEnabled === 'function') {
      this.setFreezeEnabled(false);
    }

    // 显示解锁提示
    if (free?.unlockMessage) {
      this._showBubble(free.unlockMessage, '守笼人', null);
    }

    console.log('[LessonPlayer] 教学完成，2秒后激活自由模式');

    // 延迟 2 秒触发 onComplete，防止"刚出引导就通关"
    // 清理旧 timer，避免重复触发
    if (this._freeTimer) {
      clearTimeout(this._freeTimer);
      this._freeTimer = null;
    }
    this._freeTimer = setTimeout(() => {
      console.log('[LessonPlayer] 自由模式已激活');
      this._freeTimer = null;
      if (this._onComplete) {
        this._onComplete();
      }
    }, 2000);
  }

  _enterSemiAutoOrFree() {
    const phases = this._lessonPlan.phases;
    if (phases.semiAuto && phases.semiAuto.enabled) {
      this._enterPhase('semiAuto');
    } else {
      this._enterPhase('free');
    }
  }

  _showSuccess(text, voiceId) {
    this._showBubble(text || '答对了！', '守笼人', voiceId || 'J_03');

    if (this._onInputResult) {
      this._onInputResult('success', {
        phase: this._currentPhase,
        attempts: this._guidedAttempts,
      });
    }
  }

  // ==================== Action 执行 ====================

  _executeAction(step) {
    const { action, target, text, voiceId } = step;

    // 显示文字气泡（如果有）
    if (text) {
      this._showBubble(text, step.speaker || '守笼人', voiceId);
    }

    switch (action) {
      case 'highlightRow':
        if (typeof target === 'number') {
          this._clearRow(target);
        }
        break;
      case 'highlightCol':
        if (typeof target === 'number') {
          this._clearCol(target);
        }
        break;
      case 'highlightBox':
        if (typeof target === 'number') {
          this._clearBox(target);
        }
        break;
      case 'highlightCage':
        if (typeof target === 'number' || typeof target === 'string') {
          this._clearCage(target);
        }
        break;
      case 'highlightCell':
        if (Array.isArray(target) && target.length === 2) {
          this._clearCell(target[0], target[1]);
        }
        break;
      case 'focusCell':
        if (Array.isArray(target) && target.length === 2) {
          this._clearAllHighlights();
          this._activeHighlights.focusCell = [target[0], target[1]];
          this._highlightCell(target[0], target[1], 'pulse');
        }
        break;
      case 'showSumBadge':
        // 和值徽章脉冲（由渲染层实现）
        if (this._renderer && typeof this._renderer.pulseCageSum === 'function') {
          this._renderer.pulseCageSum(target);
        }
        break;
      case 'wait':
        // 纯等待，不做额外事
        break;
      case 'spotlightOn':
        if (this._renderer && typeof this._renderer.setSpotlight === 'function') {
          const intensity = typeof target === 'number' ? target : 0.45;
          this._renderer.setSpotlight(true, intensity);
        }
        break;
      case 'spotlightOff':
        if (this._renderer && typeof this._renderer.setSpotlight === 'function') {
          this._renderer.setSpotlight(false);
        }
        break;
      case 'freezeOn':
        this.setFreezeEnabled(true);
        break;
      case 'freezeOff':
        this.setFreezeEnabled(false);
        break;
      case 'clearHighlights':
        this._clearAllHighlights();
        break;
      case 'highlightButton':
        // 高亮指定按钮（派发自定义事件，由 guide.js 处理 DOM 操作）
        this._dispatchEvent('lesson-highlight-button', { button: target, highlight: true });
        break;
      case 'unhighlightButton':
        this._dispatchEvent('lesson-highlight-button', { button: target, highlight: false });
        break;
    }

    // 强制重绘
    if (this._renderer) {
      this._renderer.forceRender = true;
    }
  }

  // ==================== 高亮管理 ====================

  _clearRow(row) {
    this._activeHighlights.rows.add(row);
    if (this._renderer && typeof this._renderer.setHighlightRow === 'function') {
      this._renderer.setHighlightRow(row, true);
    }
  }

  _clearCol(col) {
    this._activeHighlights.cols.add(col);
    if (this._renderer && typeof this._renderer.setHighlightCol === 'function') {
      this._renderer.setHighlightCol(col, true);
    }
  }

  _clearBox(box) {
    this._activeHighlights.boxes.add(box);
    if (this._renderer && typeof this._renderer.setHighlightBox === 'function') {
      this._renderer.setHighlightBox(box, true);
    }
  }

  _clearCage(cageId) {
    this._activeHighlights.cages.add(String(cageId));
    if (this._renderer && typeof this._renderer.setHighlightCage === 'function') {
      this._renderer.setHighlightCage(cageId, true);
    }
  }

  _clearCell(r, c, mode = 'normal') {
    const key = r + ',' + c;
    this._activeHighlights.cells.add(key);
    if (this._renderer && typeof this._renderer.setHighlightCell === 'function') {
      this._renderer.setHighlightCell(r, c, true, mode);
    }
  }

  _highlightCell(r, c, mode = 'normal') {
    if (this._renderer && typeof this._renderer.setHighlightCell === 'function') {
      this._renderer.setHighlightCell(r, c, true, mode);
      this._renderer.forceRender = true;
    }
  }

  _shakeCell(r, c) {
    if (this._renderer && typeof this._renderer.shakeCell === 'function') {
      this._renderer.shakeCell(r, c);
      this._renderer.forceRender = true;
    }
  }

  _clearAllHighlights() {
    const r = this._renderer;

    // 清除所有教学高亮
    if (r && typeof r.clearAllLessonHighlights === 'function') {
      r.clearAllLessonHighlights();
    } else {
      // 逐个清除
      this._activeHighlights.rows.forEach(row => {
        if (r && typeof r.setHighlightRow === 'function') r.setHighlightRow(row, false);
      });
      this._activeHighlights.cols.forEach(col => {
        if (r && typeof r.setHighlightCol === 'function') r.setHighlightCol(col, false);
      });
      this._activeHighlights.boxes.forEach(box => {
        if (r && typeof r.setHighlightBox === 'function') r.setHighlightBox(box, false);
      });
      this._activeHighlights.cages.forEach(cageId => {
        if (r && typeof r.setHighlightCage === 'function') r.setHighlightCage(cageId, false);
      });
      this._activeHighlights.cells.forEach(key => {
        const [rr, cc] = key.split(',').map(Number);
        if (r && typeof r.setHighlightCell === 'function') r.setHighlightCell(rr, cc, false);
      });
      // 关闭聚光灯
      if (r && typeof r.setSpotlight === 'function') r.setSpotlight(false);
      // 关闭冻结
      this.setFreezeEnabled(false);
    }

    this._activeHighlights = {
      rows: new Set(),
      cols: new Set(),
      boxes: new Set(),
      cages: new Set(),
      cells: new Set(),
      focusCell: null,
    };

    if (r) r.forceRender = true;
  }

  // ==================== 气泡 & 语音 ====================

  _showBubble(text, speaker, voiceId) {
    // 通过自定义事件，由 guide.js 监听并显示气泡
    const event = new CustomEvent('lesson-bubble', {
      detail: { text, speaker, voiceId }
    });
    document.dispatchEvent(event);
  }

  /**
   * 派发自定义事件（供外部监听）
   */
  _dispatchEvent(name, detail) {
    const event = new CustomEvent(name, { detail });
    document.dispatchEvent(event);
  }

  // ==================== 数据校验 ====================

  _validateLessonPlan() {
    const lp = this._lessonPlan;
    if (!lp || !lp.phases) return false;

    const size = this._board ? this._board.size : 4;
    const phases = lp.phases;

    // 校验 guided 阶段
    if (phases.guided && phases.guided.targetCell) {
      const [r, c] = phases.guided.targetCell;
      if (r < 0 || r >= size || c < 0 || c >= size) {
        console.error('[LessonPlayer] guided.targetCell 超出范围:', r, c);
        return false;
      }
      // 校验 correctValue 是否等于 solution（仅 NUMBER 模式）
      const interactionType = phases.guided.interactionType || 'NUMBER';
      if (interactionType === 'NUMBER' && this._levelData?.solution) {
        const expected = this._levelData.solution[r][c];
        if (phases.guided.correctValue !== expected) {
          console.error('[LessonPlayer] guided.correctValue 错误:', phases.guided.correctValue, '!=', expected);
          return false;
        }
      }
      // NOTE_ONLY 模式：校验 expectedNote 是数组
      if (interactionType === 'NOTE_ONLY') {
        if (!Array.isArray(phases.guided.expectedNote) || phases.guided.expectedNote.length === 0) {
          console.error('[LessonPlayer] guided.expectedNote 无效');
          return false;
        }
      }
    }

    // 校验 demo 步骤
    if (phases.demo?.steps) {
      for (const step of phases.demo.steps) {
        if (step.action === 'highlightCage') {
          // 检查 cageId 是否存在
          const cages = this._levelData?.cages || [];
          const exists = cages.some(cg => String(cg.id) === String(step.target));
          if (!exists) {
            console.warn('[LessonPlayer] demo step cage 不存在:', step.target, '，将跳过该步');
          }
        }
        if (step.action === 'highlightRow' || step.action === 'highlightCol') {
          if (step.target < 0 || step.target >= size) {
            console.warn('[LessonPlayer] demo step 行/列超出范围:', step.target);
          }
        }
        if ((step.action === 'highlightCell' || step.action === 'focusCell') && Array.isArray(step.target)) {
          const [r, c] = step.target;
          if (r < 0 || r >= size || c < 0 || c >= size) {
            console.warn('[LessonPlayer] demo step 格子超出范围:', step.target);
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

// 导出到全局
if (typeof window !== 'undefined') {
  window.LessonPlayer = LessonPlayer;
}
