/**
 * BeatQuantizer - Timing Layer
 * =============================
 * 时序层核心模块：速率限制器，将反馈对齐到节拍间隔。
 * 确保反馈不会过于频繁地触发，维持稳定的节奏感。
 *
 * V4.3.28（P1）：BPM 节拍对齐升级
 *  - 从 AudioService.getBPM() 获取当前 BGM 节拍，干预对齐到重音（每 4 拍）
 *  - 保留固定间隔模式（无 BGM / AudioService 不可用）
 *  - 冷却机制：连续干预间最小间隔（心流态更长），避免刷屏
 *  - 队列改为支持多条（原来只保留最近一条），配合表达层中断抢占
 *
 * ES Module 迁移说明：
 *  - 从 IIFE 模式迁移为 ES Module，使用 `export class BeatQuantizer`
 *  - 所有 Public 方法添加 try-catch 保护
 *  - 对 callback 调用添加 try-catch 保护，防止单次异常导致定时器中断
 *
 * @module timing/beat-quantizer
 */

export class BeatQuantizer {
  /**
   * @param {Object} [config={}]
   * @param {number} [config.interval=2000]  固定节拍间隔（ms，无 BGM 时使用）
   * @param {Object} [config.audioService]   可注入的音频服务（含 getBPM），缺省读 window.AudioService
   * @param {number} [config.cooldown=3000]  干预最小间隔（ms）
   */
  constructor(config = {}) {
    try {
      this._interval = config.interval || 2000;
      this._audioService = config.audioService || null;
      this._cooldown = config.cooldown || 3000;
      this._lastBeat = Date.now();
      this._queue = [];
      this._processing = false;
      this._lastExecutionTime = 0;
    } catch (e) {
      console.error('BeatQuantizer.constructor:', e);
    }
  }

  // -----------------------------------------------------------------------
  // Public Methods
  // -----------------------------------------------------------------------

  /**
   * 入队一个待执行项；若已达节拍间隔则立即执行，否则等待下一个节拍（对齐重音）。
   * @param {*}        item     - 待处理的数据
   * @param {Function} [callback] - 回调函数，接收 item 作为参数
   */
  enqueue(item, callback) {
    try {
      if (item === null || item === undefined) return;
      this._queue.push({ item, callback });

      if (!this._processing) {
        this._processQueue();
      }
    } catch (e) {
      console.error('BeatQuantizer.enqueue:', e);
    }
  }

  /**
   * 获取当前节拍间隔（BPM 驱动或固定间隔）
   * @returns {number} ms
   */
  getBeatInterval() {
    try {
      if (this._audioService && typeof this._audioService.getBPM === 'function') {
        const bpm = this._audioService.getBPM() || 120;
        return 60000 / bpm;
      }
    } catch (e) {}
    // 无 BGM 时：window.AudioService 兜底
    const g = (typeof window !== 'undefined') ? window : globalThis;
    if (g.AudioService && typeof g.AudioService.getBPM === 'function') {
      try {
        const bpm = g.AudioService.getBPM() || 120;
        return 60000 / bpm;
      } catch (e) {}
    }
    return this._interval;
  }

  /**
   * 获取距离下一个重音（小节起点）的剩余时间（ms）
   * @returns {number}
   */
  getMsToNextBar() {
    try {
      const beat = this.getBeatInterval();
      const now = Date.now();
      const elapsed = (now - this._lastBeat) % beat;
      // 对齐到每 4 拍的重音：先算到下一拍，若下一拍不是重音则等 4 拍
      const beatsElapsed = Math.floor((now - this._lastBeat) / beat);
      const toNextDownbeat = ((4 - (beatsElapsed % 4)) % 4) * beat - elapsed;
      return Math.max(0, toNextDownbeat);
    } catch (e) {
      return 0;
    }
  }

  /**
   * 设置固定节拍间隔（无 BGM 模式）
   * @param {number} ms
   */
  setInterval(ms) {
    try {
      this._interval = ms;
    } catch (e) {
      console.error('BeatQuantizer.setInterval:', e);
    }
  }

  /**
   * 设置干预冷却（ms）
   * @param {number} ms
   */
  setCooldown(ms) {
    try {
      this._cooldown = ms;
    } catch (e) {}
  }

  // -----------------------------------------------------------------------
  // Private Methods
  // -----------------------------------------------------------------------

  /**
   * 处理队列：逐条执行，对齐节拍 + 冷却
   */
  _processQueue() {
    try {
      if (this._processing) return;
      this._processing = true;

      const run = () => {
        if (this._queue.length === 0) {
          this._processing = false;
          return;
        }

        const now = Date.now();

        // 冷却检查：距上次执行不足 cooldown 则等待
        if (now - this._lastExecutionTime < this._cooldown) {
          setTimeout(run, Math.max(50, this._cooldown - (now - this._lastExecutionTime)));
          return;
        }

        // 对齐到下一个重音（若 BPM 模式生效且间隔较小）
        const beat = this.getBeatInterval();
        if (beat <= this._interval) {
          const nextBar = this.getMsToNextBar();
          if (nextBar > 0 && nextBar < beat * 8) {
            setTimeout(run, nextBar);
            return;
          }
        }

        const entry = this._queue.shift();
        this._lastExecutionTime = Date.now();
        this._lastBeat = Date.now();
        this._safeCallback(entry.callback, entry.item);

        // 下一项在短间隔后继续（保持节奏，不阻塞）
        if (this._queue.length > 0) {
          setTimeout(run, Math.min(beat, this._interval));
        } else {
          this._processing = false;
        }
      };

      run();
    } catch (e) {
      console.error('BeatQuantizer._processQueue:', e);
      this._processing = false;
    }
  }

  /**
   * 安全调用回调函数
   * @param {Function} callback
   * @param {*}        item
   */
  _safeCallback(callback, item) {
    if (typeof callback === 'function') {
      try {
        callback(item);
      } catch (e) {
        console.error('BeatQuantizer: callback error', e);
      }
    }
  }
}
