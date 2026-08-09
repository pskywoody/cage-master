// ==========================================
// ThreeActEngine - 迁移自 cagemaster3/game/ThreeActEngine.js
// 转换为 ES Module 格式
// ==========================================
'use strict';

  // ========================================================
  //  参数映射表（三幕 → 参数）
  // ========================================================

  const ACT_PARAMS = {
    1: {
      aiSpeed: 0.7,
      hintCooldown: 0.8,
      comboMultiplier: 1.2,
    },
    2: {
      aiSpeed: 1.0,
      hintCooldown: 1.0,
      comboMultiplier: 1.0,
    },
    3: {
      aiSpeed: 1.4,
      hintCooldown: 1.5,
      comboMultiplier: 1.5,
    },
  };

  // 幕次阈值（百分比）
  const ACT_THRESHOLDS = {
    ACT1_MAX: 30,   // 0-30%  → Act 1
    ACT2_MAX: 70,   // 30-70% → Act 2
    // 70-100% → Act 3
  };

  // ========================================================
  //  ThreeActEngine 单例类
  // ========================================================

  class ThreeActEngine {
    constructor() {
      /** @type {1|2|3} 当前幕 */
      this._act = 1;

      /** @type {number} 当前进度 0-100 */
      this._progress = 0;

      /** @type {Object} 当前幕参数 */
      this._params = Object.assign({}, ACT_PARAMS[1]);

      /** @type {Array} 幕切换回调列表 */
      this._listeners = [];
    }

    // ========================================================
    //  核心方法
    // ========================================================

    /**
     * 根据进度更新幕次和参数
     * @param {number} progress - 进度百分比 (0-100)
     * @returns {boolean} 是否发生了幕切换
     */
    update(progress) {
      // 钳制到 0-100
      const p = Math.max(0, Math.min(100, progress));
      this._progress = p;

      // 计算当前幕
      let newAct;
      if (p < ACT_THRESHOLDS.ACT1_MAX) {
        newAct = 1;
      } else if (p < ACT_THRESHOLDS.ACT2_MAX) {
        newAct = 2;
      } else {
        newAct = 3;
      }

      // 幕次未变化：只更新进度，不触发事件
      if (newAct === this._act) {
        return false;
      }

      // 幕次变化：更新参数并派发事件
      const prevAct = this._act;
      this._act = newAct;
      this._params = Object.assign({}, ACT_PARAMS[newAct]);

      // 触发回调
      this._emitChange(prevAct);

      return true;
    }

    /**
     * 获取当前幕参数
     * @returns {{ aiSpeed: number, hintCooldown: number, comboMultiplier: number }}
     */
    getParams() {
      return Object.assign({}, this._params);
    }

    /**
     * 获取当前幕编号
     * @returns {1|2|3}
     */
    getAct() {
      return this._act;
    }

    /**
     * 获取当前进度
     * @returns {number} 0-100
     */
    getProgress() {
      return this._progress;
    }

    /**
     * 订阅幕切换事件
     * @param {Function} callback - (data) => {}
     *   data: { act, prevAct, params, progress }
     * @returns {Function} 取消订阅函数
     */
    onActChange(callback) {
      if (typeof callback !== 'function') {
        return function() {};
      }
      this._listeners.push(callback);
      const self = this;
      return function() {
        const idx = self._listeners.indexOf(callback);
        if (idx >= 0) self._listeners.splice(idx, 1);
      };
    }

    // ========================================================
    //  内部方法
    // ========================================================

    /**
     * 派发幕切换事件
     * @param {number} prevAct - 切换前的幕
     */
    _emitChange(prevAct) {
      const data = {
        act: this._act,
        prevAct: prevAct,
        params: this.getParams(),
        progress: this._progress,
      };

      // 调用回调列表
      for (let i = 0; i < this._listeners.length; i++) {
        try {
          this._listeners[i](data);
        } catch (e) {
          console.error('[ThreeActEngine] listener error:', e);
        }
      }

      // 派发自定义事件到 window
      if (typeof window !== 'undefined' && typeof CustomEvent !== 'undefined') {
        try {
          const event = new CustomEvent('three-act:changed', { detail: data });
          window.dispatchEvent(event);
        } catch (e) {
          console.error('[ThreeActEngine] dispatchEvent error:', e);
        }
      }
    }
  }

  // ========================================================

  // 暴露到全局

  // 兼容 CommonJS / ES Module 环境（可选）

export { ThreeActEngine };
