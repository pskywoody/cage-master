/**
 * TutorialRunner - 交互式教学状态机（使用StoryEngine剧情对话）
 * 管理教学步骤的流转，通过角色对话引导玩家填数
 */
class TutorialRunner {
  constructor({ board, renderer, canvas, onComplete }) {
    this.board = board;
    this.renderer = renderer;
    this.canvas = canvas;
    this.onComplete = onComplete || (() => {});
    
    // 状态
    this.isActive = false;
    this.config = null;
    this.steps = [];
    this.currentStepIndex = 0;
    this.currentStep = null;
    this.isWaitingForAction = false;
    this.retryCount = 0;
    this.maxRetries = 3;
  }

  /**
   * 开始教程
   */
  start(tutorialConfig) {
    if (!tutorialConfig || !tutorialConfig.steps || tutorialConfig.steps.length === 0) {
      console.warn('[TutorialRunner] 无效的教程配置');
      return;
    }
    
    this.config = tutorialConfig;
    this.steps = tutorialConfig.steps;
    this.currentStepIndex = 0;
    this.isActive = true;
    this.retryCount = 0;
    
    console.log(`[TutorialRunner] 教程开始: ${tutorialConfig.id}, 共${this.steps.length}步`);
    this._showCurrentStep();
  }

  /**
   * 显示当前步骤
   */
  _showCurrentStep() {
    if (this.currentStepIndex >= this.steps.length) {
      this._complete();
      return;
    }
    
    this.currentStep = this.steps[this.currentStepIndex];
    this.retryCount = 0;
    
    switch (this.currentStep.type) {
      case 'dialogue':
        this._handleDialogue();
        break;
      case 'highlight_cells':
        this._handleHighlightCells();
        break;
      case 'prompt_fill':
        this._handlePromptFill();
        break;
      case 'dialogue_after_fill':
        this._handleDialogue();
        break;
      default:
        console.warn(`[TutorialRunner] 未知步骤类型: ${this.currentStep.type}`);
        this.advance();
    }
  }

  /**
   * 处理剧情对话步骤 — 使用StoryEngine
   */
  _handleDialogue() {
    const lines = this.currentStep.lines || [];
    if (lines.length === 0) {
      this.advance();
      return;
    }
    
    // 使用StoryEngine播放角色对话
    if (typeof StoryEngine !== 'undefined' && StoryEngine.sayLines) {
      StoryEngine.sayLines(lines, () => {
        // 对话完成后推进到下一步
        this.advance();
      });
    } else {
      // 降级：如果StoryEngine不可用，跳过对话
      console.warn('[TutorialRunner] StoryEngine不可用，跳过对话');
      this.advance();
    }
  }

  /**
   * 处理高亮格子步骤
   */
  _handleHighlightCells() {
    const cells = this.currentStep.cells || [];
    const color = this.currentStep.color || '#fbbf24';
    const boardSize = this.board.size || 9;
    
    // 高亮目标格子
    cells.forEach(([r, c]) => {
      const cell = this.board.cells[r]?.[c];
      if (cell) {
        cell.isHighlightMask = true;
        cell.highlightOpacity = 0.5;
        cell.highlightColor = color;
      }
    });
    
    // 高亮相关行
    if (this.currentStep.highlightRow !== undefined) {
      const row = this.currentStep.highlightRow;
      for (let c = 0; c < boardSize; c++) {
        const cell = this.board.cells[row]?.[c];
        if (cell && !cell.fixedNum && !cell.fillNum && !(cell.isHighlightMask)) {
          cell.isHighlightMask = true;
          cell.highlightOpacity = 0.25;
          cell.highlightColor = '#3b82f6';
        }
      }
    }
    
    // 高亮相关列
    if (this.currentStep.highlightCol !== undefined) {
      const col = this.currentStep.highlightCol;
      for (let r = 0; r < boardSize; r++) {
        const cell = this.board.cells[r]?.[col];
        if (cell && !cell.fixedNum && !cell.fillNum && !(cell.isHighlightMask)) {
          cell.isHighlightMask = true;
          cell.highlightOpacity = 0.25;
          cell.highlightColor = '#3b82f6';
        }
      }
    }
    
    // 高亮相关宫
    if (this.currentStep.highlightBox && cells.length > 0) {
      const [tr, tc] = cells[0];
      const boxSize = boardSize === 4 ? 2 : 3;
      const boxR = Math.floor(tr / boxSize) * boxSize;
      const boxC = Math.floor(tc / boxSize) * boxSize;
      for (let r = boxR; r < boxR + boxSize; r++) {
        for (let c = boxC; c < boxC + boxSize; c++) {
          const cell = this.board.cells[r]?.[c];
          if (cell && !cell.fixedNum && !cell.fillNum && !(cell.isHighlightMask)) {
            cell.isHighlightMask = true;
            cell.highlightOpacity = 0.25;
            cell.highlightColor = '#a855f7';
          }
        }
      }
    }
    
    this.renderer.render(this.board);
    
    // 如果需要自动选中
    if (this.currentStep.autoSelect && cells.length > 0) {
      const [r, c] = cells[0];
      this.board.selectCell(r, c);
      this.renderer.render(this.board);
    }
    
    // 自动推进到下一步
    const delay = this.currentStep.delay || 2500;
    setTimeout(() => this.advance(), delay);
  }

  /**
   * 处理填数提示步骤
   */
  _handlePromptFill() {
    this.isWaitingForAction = true;
    
    const targetCells = this.currentStep.cells || [];
    const boardSize = this.board.size || 9;
    
    // 锁定所有非目标格子，只允许操作目标格子
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const cell = this.board.cells[r]?.[c];
        if (!cell) continue;
        
        const isTarget = targetCells.some(([tr, tc]) => tr === r && tc === c);
        
        if (isTarget) {
          // 高亮目标格子
          cell.isHighlightMask = true;
          cell.highlightOpacity = 0.5;
          cell.highlightColor = '#fbbf24';
          cell.isLocked = false;
        } else {
          // 锁定非目标格子
          cell.isLocked = true;
        }
      }
    }
    this.renderer.render(this.board);
    
    // 显示提示（使用toast）
    if (typeof showToast === 'function') {
      showToast('💡 在数字键盘上填入数字', 3000);
    }
  }

  /**
   * 推进到下一步
   */
  advance() {
    if (!this.isActive) return;
    
    // 清除高亮并解锁所有格子
    this._clearHighlights();
    this._unlockAllCells();
    
    // 推进索引
    this.currentStepIndex++;
    
    // 显示下一步
    this._showCurrentStep();
  }

  /**
   * 跳过教程
   */
  skip() {
    if (!this.isActive) return;
    
    console.log('[TutorialRunner] 教程被跳过');
    
    // 中断StoryEngine对话
    if (typeof StoryEngine !== 'undefined' && StoryEngine.interrupt) {
      StoryEngine.interrupt();
    }
    
    this._clearHighlights();
    this._complete();
  }

  /**
   * 教程完成
   */
  _complete() {
    this.isActive = false;
    this.currentStep = null;
    this.isWaitingForAction = false;
    
    this._clearHighlights();
    this.board.clearAllHighlight();
    this.renderer.render(this.board);
    
    this.onComplete();
    console.log('[TutorialRunner] 教程完成');
  }

  /**
   * 处理填数事件
   * @returns {boolean} 是否被教程消费
   */
  onNumberFilled(r, c, num) {
    if (!this.isActive || !this.isWaitingForAction) return false;
    if (!this.currentStep || this.currentStep.type !== 'prompt_fill') return false;
    
    const passed = TutorialValidator.validate(this.currentStep, this.board, { r, c, num });
    
    if (passed) {
      this.retryCount = 0;
      this.isWaitingForAction = false;
      // 验证通过，推进到下一步（对话鼓励）
      setTimeout(() => this.advance(), 300);
      return true;
    } else {
      this.retryCount++;
      // 显示错误提示
      if (typeof showToast === 'function') {
        showToast(`❌ 不对哦，再试一次 (${this.retryCount}/${this.maxRetries})`, 2000);
      }
      if (this.retryCount >= this.maxRetries) {
        // 超过最大重试次数，自动推进
        setTimeout(() => this.advance(), 1000);
      }
      return true;
    }
  }

  /**
   * 处理候选数事件
   */
  onCandidateToggled(r, c, candidates) {
    if (!this.isActive || !this.isWaitingForAction) return false;
    if (!this.currentStep || this.currentStep.type !== 'prompt_candidate') return false;
    
    const passed = TutorialValidator.validate(this.currentStep, this.board, { r, c, candidates });
    
    if (passed) {
      this.isWaitingForAction = false;
      setTimeout(() => this.advance(), 300);
      return true;
    } else {
      this.retryCount++;
      if (typeof showToast === 'function') {
        showToast(`❌ 再试一次 (${this.retryCount}/${this.maxRetries})`, 2000);
      }
      if (this.retryCount >= this.maxRetries) {
        setTimeout(() => this.advance(), 1000);
      }
      return true;
    }
  }

  /**
   * 处理格子选中事件
   */
  onCellSelected(r, c) {
    if (!this.isActive || !this.isWaitingForAction) return false;
    if (!this.currentStep || this.currentStep.type !== 'select_cell') return false;
    
    const passed = TutorialValidator.validate(this.currentStep, this.board, { r, c });
    if (passed) {
      this.isWaitingForAction = false;
      setTimeout(() => this.advance(), 300);
      return true;
    }
    return false;
  }

  /**
   * 清除所有高亮
   */
  _clearHighlights() {
    if (!this.board || !this.board.cells) return;
    const boardSize = this.board.size || 9;
    
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const cell = this.board.cells[r]?.[c];
        if (cell) {
          cell.isHighlightMask = false;
          cell.highlightOpacity = 0;
          cell.highlightColor = null;
        }
      }
    }
  }

  /**
   * 解锁所有格子
   */
  _unlockAllCells() {
    if (!this.board || !this.board.cells) return;
    const boardSize = this.board.size || 9;
    
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const cell = this.board.cells[r]?.[c];
        if (cell) {
          cell.isLocked = false;
        }
      }
    }
  }

  /**
   * 销毁
   */
  destroy() {
    this.skip();
  }
}

window.TutorialRunner = TutorialRunner;
