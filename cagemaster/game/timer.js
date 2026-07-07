/**
 * ============================================================
 *  GameTimer - 游戏计时器模块
 * ============================================================
 *
 *  统一的计时器/暂停/继续功能，消除 main.js 和 guide.js 的重复代码。
 *
 *  用法：
 *    const timer = new GameTimer({
 *      timerEl: '#timer',
 *      pauseOverlay: '#pause-overlay',
 *      onTick: () => saveProgress(),  // 每10秒回调
 *      onPause: () => {},             // 暂停时回调
 *      onResume: () => {},            // 恢复时回调
 *      backUrl: 'menu.html',          // 返回按钮目标
 *      autoSaveInterval: 10,          // 自动存档间隔（秒）
 *    });
 *    timer.start();
 *    timer.pause();
 *    timer.resume();
 *    timer.toggle();
 *    timer.getTime(); // 返回秒数
 *    timer.setTime(seconds);
 *    timer.destroy();
 *
 * ============================================================
 */

class GameTimer {
  constructor(options = {}) {
    this.elapsedSeconds = options.initialTime || 0;
    this.isPaused = false;
    this.isCompleted = false;
    this.timerInterval = null;
    this.autoSaveInterval = options.autoSaveInterval || 10;

    // DOM 选择器
    this.timerSelector = options.timerEl || '#timer';
    this.pauseOverlaySelector = options.pauseOverlay || '#pause-overlay';
    this.resumeBtnSelector = options.resumeBtn || '#btn-resume';
    this.backBtnSelector = options.backBtn || '#btn-back';

    // 回调
    this.onTick = options.onTick || (() => {});
    this.onPause = options.onPause || (() => {});
    this.onResume = options.onResume || (() => {});
    this.onBack = options.onBack || null;
    this.backUrl = options.backUrl || 'menu.html';

    // 内部状态
    this._pausedByDialogue = false;
    this._pausedByVisibility = false;
    this._bound = false;
  }

  // ---------- 核心计时 ----------

  start() {
    if (this.timerInterval) return;
    this.timerInterval = setInterval(() => {
      if (!this.isPaused && !this.isCompleted) {
        this.elapsedSeconds++;
        this._updateDisplay();
        // 自动存档
        if (this.elapsedSeconds % this.autoSaveInterval === 0) {
          this.onTick(this.elapsedSeconds);
        }
      }
    }, 1000);
  }

  stop() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  complete() {
    this.isCompleted = true;
    this.stop();
  }

  // ---------- 暂停/继续 ----------

  pause() {
    if (this.isCompleted) return;
    if (this.isPaused) return;
    this.isPaused = true;
    this._updatePauseUI(true);
    this.onPause();
  }

  resume() {
    if (this.isCompleted) return;
    if (!this.isPaused) return;
    this.isPaused = false;
    this._updatePauseUI(false);
    this.onResume();
  }

  toggle() {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  // ---------- 时间存取 ----------

  getTime() {
    return this.elapsedSeconds;
  }

  setTime(seconds) {
    this.elapsedSeconds = Math.max(0, Math.floor(seconds));
    this._updateDisplay();
  }

  formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  // ---------- UI 绑定 ----------

  bind() {
    if (this._bound) return;
    this._bound = true;

    const timerEl = document.querySelector(this.timerSelector);
    const resumeBtn = document.querySelector(this.resumeBtnSelector);
    const backBtn = document.querySelector(this.backBtnSelector);

    // 点击计时器切换暂停
    if (timerEl) {
      timerEl.addEventListener('click', () => {
        if (typeof AudioManager !== 'undefined') AudioManager.playClick();
        this.toggle();
      });
    }

    // 继续按钮
    if (resumeBtn) {
      resumeBtn.addEventListener('click', () => {
        if (typeof AudioManager !== 'undefined') AudioManager.playClick();
        this.resume();
      });
    }

    // 返回按钮
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof AudioManager !== 'undefined') AudioManager.playClick();
        if (this.onBack) {
          this.onBack();
        } else {
          this.onTick(this.elapsedSeconds); // 离开前存档
          window.location.href = this.backUrl;
        }
      });
    }

    // 角色台词播放时暂停
    document.addEventListener('story-dialogue-start', () => {
      if (!this.isPaused && !this.isCompleted) {
        this._pausedByDialogue = true;
        this.isPaused = true;
        const timerEl = document.querySelector(this.timerSelector);
        if (timerEl) timerEl.classList.add('paused');
      }
    });
    document.addEventListener('story-dialogue-end', () => {
      if (this._pausedByDialogue && !this.isCompleted) {
        this._pausedByDialogue = false;
        this.isPaused = false;
        const timerEl = document.querySelector(this.timerSelector);
        if (timerEl) timerEl.classList.remove('paused');
      }
    });

    // 页面不可见时暂停
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (!this.isPaused && !this.isCompleted) {
          this._pausedByVisibility = true;
          this.isPaused = true;
          this._updatePauseUI(true);
          this.onTick(this.elapsedSeconds);
        }
      } else {
        if (this._pausedByVisibility) {
          this._pausedByVisibility = false;
          // 保持暂停状态，用户手动恢复
        }
      }
    });

    this._updateDisplay();
  }

  // ---------- 内部方法 ----------

  _updateDisplay() {
    const timerEl = document.querySelector(this.timerSelector);
    if (timerEl) {
      timerEl.textContent = this.formatTime(this.elapsedSeconds);
    }
  }

  _updatePauseUI(paused) {
    const overlay = document.querySelector(this.pauseOverlaySelector);
    const timerEl = document.querySelector(this.timerSelector);

    if (overlay) {
      if (paused) {
        overlay.classList.add('active');
      } else {
        overlay.classList.remove('active');
      }
    }
    if (timerEl) {
      if (paused) {
        timerEl.classList.add('paused');
      } else {
        timerEl.classList.remove('paused');
      }
    }
  }

  destroy() {
    this.stop();
    this.isCompleted = true;
    this._bound = false;
  }
}

// 兼容 CommonJS（Node 环境）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GameTimer;
}
