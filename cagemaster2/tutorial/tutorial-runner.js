/**
 * TutorialRunner - 交互式教学状态机
 * 管理教学步骤的流转、验证和UI更新
 */
class TutorialRunner {
  constructor({ board, renderer, canvas, onComplete, onStepChange }) {
    this.board = board;
    this.renderer = renderer;
    this.canvas = canvas;
    this.onComplete = onComplete || (() => {});
    this.onStepChange = onStepChange || (() => {});
    
    // 状态
    this.isActive = false;
    this.config = null;
    this.steps = [];
    this.currentStepIndex = 0;
    this.currentStep = null;
    this.isWaitingForAction = false;
    this.retryCount = 0;
    this.maxRetries = 3;
    
    // UI引用（延迟创建）
    this.ui = null;
  }

  /**
   * 开始教程
   * @param {Object} tutorialConfig - 教程配置
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
    
    // 创建UI
    if (!this.ui) {
      this.ui = new TutorialUI({
        canvas: this.canvas,
        onSkip: () => this.skip(),
        onNext: () => this.advance()
      });
    }
    
    this.ui.show(tutorialConfig.title, tutorialConfig.speaker);
    this._showCurrentStep();
    
    console.log(`[TutorialRunner] 教程开始: ${tutorialConfig.id}, 共${this.steps.length}步`);
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
    
    // 更新UI进度
    this.ui.updateProgress(this.currentStepIndex, this.steps.length);
    
    // 清除之前的高亮
    this._clearHighlights();
    
    // 根据步骤类型处理
    switch (this.currentStep.type) {
      case 'show_text':
        this._handleShowText();
        break;
      case 'highlight_cells':
        this._handleHighlightCells();
        break;
      case 'prompt_fill':
        this._handlePromptFill();
        break;
      case 'prompt_candidate':
        this._handlePromptCandidate();
        break;
      case 'highlight_row_col':
        this._handleHighlightRowCol();
        break;
      case 'auto_fill':
        this._handleAutoFill();
        break;
      case 'show_hint':
        this._handleShowHint();
        break;
      case 'switch_mode':
        this._handleSwitchMode();
        break;
      default:
        console.warn(`[TutorialRunner] 未知步骤类型: ${this.currentStep.type}`);
        this.advance();
    }
    
    // 通知步骤变化
    this.onStepChange(this.currentStep, this.currentStepIndex, this.steps.length);
  }

  /**
   * 处理显示文字步骤
   */
  _handleShowText() {
    this.ui.showText(this.currentStep.text, this.currentStep.speaker);
    this.isWaitingForAction = false;
    
    if (this.currentStep.autoAdvance) {
      const delay = this.currentStep.delay || 2000;
      this._autoAdvanceTimer = setTimeout(() => this.advance(), delay);
    }
  }

  /**
   * 处理高亮格子步骤
   */
  _handleHighlightCells() {
    const cells = this.currentStep.cells || [];
    const color = this.currentStep.color || '#22c55e';
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
        if (cell && !cell.fixedNum && !cell.fillNum && !(cell.isHighlightMask && cell.highlightColor === color)) {
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
        if (cell && !cell.fixedNum && !cell.fillNum && !(cell.isHighlightMask && cell.highlightColor === color)) {
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
    this.ui.showText(this.currentStep.text, this.currentStep.speaker);
    
    // 如果需要自动选中
    if (this.currentStep.autoSelect && cells.length > 0) {
      const [r, c] = cells[0];
      this.board.selectCell(r, c);
      this.renderer.render(this.board);
    }
    
    this.isWaitingForAction = false;
    
    // 自动推进
    const delay = this.currentStep.delay || 2000;
    this._autoAdvanceTimer = setTimeout(() => this.advance(), delay);
  }

  /**
   * 处理填数提示步骤
   */
  _handlePromptFill() {
    this.ui.showText(this.currentStep.text, this.currentStep.speaker);
    this.ui.showActionHint('在数字键盘上填入数字');
    this.isWaitingForAction = true;
    
    // 高亮目标格子
    const cells = this.currentStep.cells || [];
    cells.forEach(([r, c]) => {
      const cell = this.board.cells[r]?.[c];
      if (cell) {
        cell.isHighlightMask = true;
        cell.highlightOpacity = 0.5;
        cell.highlightColor = '#fbbf24';
      }
    });
    this.renderer.render(this.board);
  }

  /**
   * 处理候选数提示步骤
   */
  _handlePromptCandidate() {
    this.ui.showText(this.currentStep.text);
    this.ui.showActionHint('切换到笔记模式，标记候选数');
    this.isWaitingForAction = true;
    
    // 高亮目标格子
    const cells = this.currentStep.cells || [];
    cells.forEach(([r, c]) => {
      const cell = this.board.cells[r]?.[c];
      if (cell) {
        cell.isHighlightMask = true;
        cell.highlightOpacity = 0.5;
        cell.highlightColor = '#fbbf24';
      }
    });
    this.renderer.render(this.board);
  }

  /**
   * 处理行列高亮步骤
   */
  _handleHighlightRowCol() {
    const { row, col } = this.currentStep;
    
    if (row !== undefined) {
      // 高亮整行
      for (let c = 0; c < 9; c++) {
        const cell = this.board.cells[row]?.[c];
        if (cell && !cell.fixedNum && !cell.fillNum) {
          cell.isHighlightMask = true;
          cell.highlightOpacity = 0.3;
          cell.highlightColor = '#3b82f6';
        }
      }
    }
    
    if (col !== undefined) {
      // 高亮整列
      for (let r = 0; r < 9; r++) {
        const cell = this.board.cells[r]?.[col];
        if (cell && !cell.fixedNum && !cell.fillNum) {
          cell.isHighlightMask = true;
          cell.highlightOpacity = 0.3;
          cell.highlightColor = '#3b82f6';
        }
      }
    }
    
    this.renderer.render(this.board);
    this.ui.showText(this.currentStep.text);
    this.isWaitingForAction = false;
    
    const delay = this.currentStep.delay || 2500;
    this._autoAdvanceTimer = setTimeout(() => this.advance(), delay);
  }

  /**
   * 处理自动填数步骤
   */
  _handleAutoFill() {
    this.ui.showText(this.currentStep.text);
    this.isWaitingForAction = false;
    
    const cells = this.currentStep.cells || [];
    const numbers = this.currentStep.numbers || [];
    const delay = this.currentStep.delay || 300;
    
    let i = 0;
    const fillNext = () => {
      if (i >= cells.length) {
        // 填完后推进
        setTimeout(() => this.advance(), 500);
        return;
      }
      
      const [r, c] = cells[i];
      const num = numbers[i];
      
      // 高亮当前格子
      const cell = this.board.cells[r]?.[c];
      if (cell) {
        cell.isHighlightMask = true;
        cell.highlightOpacity = 0.6;
        cell.highlightColor = '#22c55e';
      }
      this.renderer.render(this.board);
      
      // 延迟后填入
      setTimeout(() => {
        if (cell) {
          cell.isHighlightMask = false;
          this.board.setNumberAt(r, c, num, { recordHistory: false });
        }
        this.renderer.render(this.board);
        i++;
        setTimeout(fillNext, delay);
      }, 200);
    };
    
    setTimeout(fillNext, 500);
  }

  /**
   * 处理显示提示步骤
   */
  _handleShowHint() {
    this.ui.showText(this.currentStep.text);
    this.isWaitingForAction = false;
    
    // 触发提示
    if (this.board.showHint) {
      this.board.showHint(1);
      this.renderer.render(this.board);
    }
    
    const delay = this.currentStep.delay || 2500;
    this._autoAdvanceTimer = setTimeout(() => this.advance(), delay);
  }

  /**
   * 处理切换模式步骤
   */
  _handleSwitchMode() {
    this.ui.showText(this.currentStep.text);
    this.isWaitingForAction = false;
    
    if (this.currentStep.mode && this.board.setInputMode) {
      this.board.setInputMode(this.currentStep.mode);
    }
    
    const delay = this.currentStep.delay || 1500;
    this._autoAdvanceTimer = setTimeout(() => this.advance(), delay);
  }

  /**
   * 推进到下一步
   */
  advance() {
    if (!this.isActive) return;
    
    // 清除自动推进定时器
    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }
    
    // 清除高亮
    this._clearHighlights();
    
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
    
    if (this._autoAdvanceTimer) {
      clearTimeout(this._autoAdvanceTimer);
      this._autoAdvanceTimer = null;
    }
    
    this._clearHighlights();
    this.ui.hide();
    this.board.clearAllHighlight();
    this.renderer.render(this.board);
    
    this.onComplete();
    console.log('[TutorialRunner] 教程完成');
  }

  /**
   * 处理填数事件
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} num - 数字
   * @returns {boolean} 是否被教程消费
   */
  onNumberFilled(r, c, num) {
    if (!this.isActive || !this.isWaitingForAction) return false;
    if (!this.currentStep) return false;
    
    // 只处理需要填数的步骤
    if (this.currentStep.type !== 'prompt_fill') return false;
    
    // 验证
    const passed = TutorialValidator.validate(this.currentStep, this.board, { r, c, num });
    
    if (passed) {
      // 正确！
      this.ui.showFeedback('correct', '✓ 正确！');
      this.retryCount = 0;
      
      // 延迟后推进
      setTimeout(() => this.advance(), 800);
      return true;
    } else {
      // 错误
      this.retryCount++;
      this.ui.showFeedback('error', `再试一次 (${this.retryCount}/${this.maxRetries})`);
      
      if (this.retryCount >= this.maxRetries) {
        // 超过最大重试次数，自动推进
        setTimeout(() => this.advance(), 1000);
      }
      return true; // 消费了事件，但验证失败
    }
  }

  /**
   * 处理候选数事件
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {Set} candidates - 候选数集合
   * @returns {boolean} 是否被教程消费
   */
  onCandidateToggled(r, c, candidates) {
    if (!this.isActive || !this.isWaitingForAction) return false;
    if (!this.currentStep) return false;
    
    if (this.currentStep.type !== 'prompt_candidate') return false;
    
    const passed = TutorialValidator.validate(this.currentStep, this.board, { r, c, candidates });
    
    if (passed) {
      this.ui.showFeedback('correct', '✓ 候选数标记正确！');
      setTimeout(() => this.advance(), 800);
      return true;
    } else {
      this.retryCount++;
      this.ui.showFeedback('error', `再试一次 (${this.retryCount}/${this.maxRetries})`);
      
      if (this.retryCount >= this.maxRetries) {
        setTimeout(() => this.advance(), 1000);
      }
      return true;
    }
  }

  /**
   * 处理格子选中事件
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {boolean} 是否被教程消费
   */
  onCellSelected(r, c) {
    if (!this.isActive || !this.isWaitingForAction) return false;
    if (!this.currentStep) return false;
    
    if (this.currentStep.type !== 'select_cell') return false;
    
    const passed = TutorialValidator.validate(this.currentStep, this.board, { r, c });
    
    if (passed) {
      this.ui.showFeedback('correct', '✓ 选中了正确的格子！');
      setTimeout(() => this.advance(), 800);
      return true;
    }
    
    return false;
  }

  /**
   * 清除所有高亮
   */
  _clearHighlights() {
    if (!this.board || !this.board.cells) return;
    
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
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
   * 销毁
   */
  destroy() {
    this.skip();
    if (this.ui) {
      this.ui.destroy();
      this.ui = null;
    }
  }
}

// 导出到全局
window.TutorialRunner = TutorialRunner;
