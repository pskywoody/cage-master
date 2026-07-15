/**
 * TutorialUI - 交互式教学浮动面板
 * 显示教学文字、进度指示器、操作提示和反馈
 */
class TutorialUI {
  constructor({ canvas, onSkip, onNext }) {
    this.canvas = canvas;
    this.onSkip = onSkip || (() => {});
    this.onNext = onNext || (() => {});
    
    this.panelEl = null;
    this.isVisible = false;
    this.feedbackTimer = null;
    
    this._build();
  }

  /**
   * 构建DOM结构
   */
  _build() {
    // 主面板容器
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'tutorial-panel';
    this.panelEl.innerHTML = `
      <div class="tutorial-header">
        <div class="tutorial-title-area">
          <span class="tutorial-speaker"></span>
          <span class="tutorial-title"></span>
        </div>
        <div class="tutorial-progress">
          <span class="tutorial-step-num"></span>
        </div>
      </div>
      <div class="tutorial-body">
        <div class="tutorial-text"></div>
        <div class="tutorial-action-hint" style="display:none;"></div>
        <div class="tutorial-feedback" style="display:none;"></div>
      </div>
      <div class="tutorial-footer">
        <div class="tutorial-dots"></div>
        <button class="tutorial-skip-btn">跳过教程</button>
      </div>
    `;
    
    // 绑定事件
    this.panelEl.querySelector('.tutorial-skip-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm('确定要跳过教学吗？')) {
        this.onSkip();
      }
    });
    
    document.body.appendChild(this.panelEl);
  }

  /**
   * 显示面板
   * @param {string} title - 教程标题
   * @param {string} speaker - 说话角色
   */
  show(title, speaker) {
    this.panelEl.querySelector('.tutorial-title').textContent = title || '';
    this.panelEl.querySelector('.tutorial-speaker').textContent = speaker ? `${speaker}：` : '';
    this.panelEl.style.display = 'block';
    this.panelEl.classList.add('active');
    this.isVisible = true;
  }

  /**
   * 隐藏面板
   */
  hide() {
    this.panelEl.classList.remove('active');
    this.panelEl.classList.remove('show-feedback-correct');
    this.panelEl.classList.remove('show-feedback-error');
    setTimeout(() => {
      this.panelEl.style.display = 'none';
      this.isVisible = false;
    }, 300);
  }

  /**
   * 显示教学文字
   * @param {string} text - 文字内容
   */
  showText(text) {
    const textEl = this.panelEl.querySelector('.tutorial-text');
    textEl.textContent = text;
    textEl.style.display = 'block';
    
    // 隐藏操作提示和反馈
    this.panelEl.querySelector('.tutorial-action-hint').style.display = 'none';
    this.panelEl.querySelector('.tutorial-feedback').style.display = 'none';
  }

  /**
   * 显示操作提示
   * @param {string} hint - 提示文字
   */
  showActionHint(hint) {
    const hintEl = this.panelEl.querySelector('.tutorial-action-hint');
    hintEl.textContent = hint;
    hintEl.style.display = 'block';
  }

  /**
   * 显示反馈
   * @param {string} type - 'correct' 或 'error'
   * @param {string} message - 反馈文字
   */
  showFeedback(type, message) {
    const feedbackEl = this.panelEl.querySelector('.tutorial-feedback');
    feedbackEl.textContent = message;
    feedbackEl.style.display = 'block';
    
    // 清除之前的样式
    this.panelEl.classList.remove('show-feedback-correct', 'show-feedback-error');
    
    // 添加新样式
    if (type === 'correct') {
      this.panelEl.classList.add('show-feedback-correct');
    } else {
      this.panelEl.classList.add('show-feedback-error');
    }
    
    // 清除定时器
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    
    // 2秒后隐藏反馈
    this.feedbackTimer = setTimeout(() => {
      feedbackEl.style.display = 'none';
      this.panelEl.classList.remove('show-feedback-correct', 'show-feedback-error');
    }, 2000);
  }

  /**
   * 更新进度指示器
   * @param {number} current - 当前步骤索引
   * @param {number} total - 总步骤数
   */
  updateProgress(current, total) {
    // 更新步骤数字
    this.panelEl.querySelector('.tutorial-step-num').textContent = `${current + 1}/${total}`;
    
    // 更新圆点
    const dotsEl = this.panelEl.querySelector('.tutorial-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const dot = document.createElement('span');
      dot.className = 'tutorial-dot';
      if (i < current) dot.classList.add('done');
      if (i === current) dot.classList.add('active');
      dotsEl.appendChild(dot);
    }
  }

  /**
   * 销毁
   */
  destroy() {
    if (this.feedbackTimer) {
      clearTimeout(this.feedbackTimer);
    }
    if (this.panelEl && this.panelEl.parentNode) {
      this.panelEl.parentNode.removeChild(this.panelEl);
    }
    this.panelEl = null;
  }
}

// 导出到全局
window.TutorialUI = TutorialUI;
