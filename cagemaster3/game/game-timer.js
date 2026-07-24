// ==========================================
// GameTimer - 游戏计时器 + 暂停系统
// 精确到秒，支持自动暂停、对话暂停、回调
// ==========================================

;(function(global) {
  'use strict';

  class GameTimer {
    constructor(options = {}) {
      // 配置
      this.onTick = options.onTick || null;       // 每秒回调 (seconds) => void
      this.onPause = options.onPause || null;     // 暂停时回调
      this.onResume = options.onResume || null;   // 继续时回调
      this.autoPauseOnHide = options.autoPauseOnHide !== false; // 页面隐藏自动暂停

      // 状态
      this._seconds = 0;          // 累计秒数
      this._isRunning = false;    // 是否正在运行
      this._isPaused = false;     // 是否处于暂停状态
      this._startTimestamp = 0;   // 本次运行开始时间戳
      this._intervalId = null;    // setInterval ID
      this._visibilityHandler = null; // visibilitychange handler

      // 对话暂停计数（支持嵌套调用）
      this._dialogPauseCount = 0;
      this._wasRunningBeforeDialog = false;

      // 绑定 visibility handler
      if (this.autoPauseOnHide && typeof document !== 'undefined') {
        this._visibilityHandler = () => this._onVisibilityChange();
        document.addEventListener('visibilitychange', this._visibilityHandler);
      }
    }

    // === 公共 API ===

    /**
     * 开始计时（从0开始）
     */
    start() {
      this._seconds = 0;
      this._isRunning = true;
      this._isPaused = false;
      this._dialogPauseCount = 0;
      this._startTimestamp = Date.now();
      this._startInterval();
      this._fireTick();
    }

    /**
     * 暂停计时
     */
    pause() {
      if (!this._isRunning || this._isPaused) return;
      this._isPaused = true;
      // 累加当前运行段的时间
      this._accumulate();
      this._stopInterval();
      if (this.onPause) {
        try { this.onPause(); } catch (e) {}
      }
    }

    /**
     * 继续计时
     */
    resume() {
      if (!this._isRunning || !this._isPaused) return;
      this._isPaused = false;
      this._startTimestamp = Date.now();
      this._startInterval();
      if (this.onResume) {
        try { this.onResume(); } catch (e) {}
      }
    }

    /**
     * 切换暂停/继续
     */
    toggle() {
      if (this._isPaused) {
        this.resume();
      } else {
        this.pause();
      }
    }

    /**
     * 对话暂停（可嵌套调用）
     * 多次调用 pauseForDialog 需要对应次数的 resumeFromDialog 才能真正恢复
     */
    pauseForDialog() {
      if (this._dialogPauseCount === 0) {
        this._wasRunningBeforeDialog = this._isRunning && !this._isPaused;
        if (this._wasRunningBeforeDialog) {
          this.pause();
        }
      }
      this._dialogPauseCount++;
    }

    /**
     * 对话结束恢复
     */
    resumeFromDialog() {
      if (this._dialogPauseCount <= 0) return;
      this._dialogPauseCount--;
      if (this._dialogPauseCount === 0 && this._wasRunningBeforeDialog) {
        this.resume();
        this._wasRunningBeforeDialog = false;
      }
    }

    /**
     * 重置计时器
     */
    reset() {
      this._stopInterval();
      this._seconds = 0;
      this._isRunning = false;
      this._isPaused = false;
      this._dialogPauseCount = 0;
      this._startTimestamp = 0;
      this._fireTick();
    }

    /**
     * 获取当前秒数
     */
    getTime() {
      if (this._isRunning && !this._isPaused) {
        // 加上当前运行段的时间
        return this._seconds + Math.floor((Date.now() - this._startTimestamp) / 1000);
      }
      return this._seconds;
    }

    /**
     * 获取格式化的时间字符串 MM:SS
     */
    getFormattedTime() {
      const total = this.getTime();
      const m = Math.floor(total / 60);
      const s = total % 60;
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    /**
     * 是否已暂停
     */
    get isPaused() {
      return this._isPaused;
    }

    /**
     * 是否正在运行（已 start 且未 reset）
     */
    get isRunning() {
      return this._isRunning;
    }

    /**
     * 销毁计时器，清理事件监听
     */
    destroy() {
      this._stopInterval();
      if (this._visibilityHandler && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }
      this._isRunning = false;
      this._isPaused = false;
    }

    // === 内部方法 ===

    _startInterval() {
      if (this._intervalId) return;
      this._intervalId = setInterval(() => {
        this._fireTick();
      }, 1000);
    }

    _stopInterval() {
      if (this._intervalId) {
        clearInterval(this._intervalId);
        this._intervalId = null;
      }
    }

    _accumulate() {
      if (this._isRunning && !this._isPaused && this._startTimestamp > 0) {
        const elapsed = Math.floor((Date.now() - this._startTimestamp) / 1000);
        if (elapsed > 0) {
          this._seconds += elapsed;
        }
      }
      this._startTimestamp = 0;
    }

    _fireTick() {
      if (this.onTick) {
        try { this.onTick(this.getTime()); } catch (e) {}
      }
    }

    _onVisibilityChange() {
      if (!this._isRunning) return;

      if (document.hidden) {
        // 页面隐藏：累加时间并暂停 interval
        if (!this._isPaused) {
          this._accumulate();
          this._stopInterval();
        }
      } else {
        // 页面显示：如果不是主动暂停的，则恢复
        if (!this._isPaused) {
          this._startTimestamp = Date.now();
          this._startInterval();
          this._fireTick();
        }
      }
    }
  }

  global.GameTimer = GameTimer;

})(window);
