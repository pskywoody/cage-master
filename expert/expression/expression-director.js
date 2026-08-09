/**
 * ExpressionDirector - Expression Layer
 * =======================================
 * 表达层核心模块：管理视觉/音频表达指令的优先级队列与中断逻辑。
 * 接收来自 DecisionEngine 的指令，按优先级排序，通过注册的 handler 执行。
 *
 * 职责：
 *  - 维护优先级队列，EUREKA 级指令清空队列
 *  - 防抖：最小执行间隔（_minInterval = 1500ms）
 *  - 注册 action handler 以解耦实际渲染/播放逻辑
 *
 * ES Module 迁移说明：
 *  - 从 IIFE 模式迁移为 ES Module，使用 `export class ExpressionDirector`
 *  - 所有 Public 方法添加 try-catch 保护
 *  - 对 handler 调用添加额外保护（原有 _execute 已有 try-catch）
 *
 * @module expression/expression-director
 */

// ---------------------------------------------------------------------------
// 优先级常量
// ---------------------------------------------------------------------------
const PRIORITY = {
  EUREKA: 100,
  TEACHING: 80,
  STUCK_GUIDE: 50,
  COMBO_EFFECT: 30,
  AMBIENT: 10,
};

export class ExpressionDirector {
  constructor() {
    this._queue = [];
    this._handlers = {};
    this._activeExpression = null;
    this._lastDisplayTime = 0;
    this._minInterval = 1500;
    this._processing = false;

    // V4.3.28（P1）：中断抢占机制
    this._interruptHandlers = [];
    this._cancel = false;
  }

  // -----------------------------------------------------------------------
  // Public Methods
  // -----------------------------------------------------------------------

  /**
   * V4.3.28（P1）：注册中断处理器（高优先级指令抢占当前动画时触发）
   * @param {Function} handler - () => void，当前动画应快速淡出
   */
  onInterrupt(handler) {
    try {
      if (typeof handler === 'function') this._interruptHandlers.push(handler);
    } catch (e) {}
  }

  /**
   * V4.3.28（P1）：请求中断当前正在执行的表达任务
   * 设置 _cancel 标记并触发中断处理器（当前动画快速淡出）
   * @returns {boolean} 是否成功发起中断
   */
  interrupt() {
    try {
      if (!this._activeExpression) return false;
      this._cancel = true;
      for (const fn of this._interruptHandlers) {
        try { fn(); } catch (e) {}
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 注册指定 action 类型的执行 handler
   * @param {string}   type    - action 名称（如 'SHOW_TOAST', 'EUREKA'）
   * @param {Function} handler - 接收 payload 的执行函数
   */
  registerActionHandler(type, handler) {
    try {
      this._handlers[type] = handler;
    } catch (e) {
      console.error('ExpressionDirector.registerActionHandler:', e);
    }
  }

  /**
   * 入队一条决策指令，按优先级排序并触发队列处理
   * @param {Object} decision - { action, priority, payload }
   */
  enqueue(decision) {
    try {
      if (!decision || !decision.action) return;

      const priority = decision.priority || PRIORITY.AMBIENT;

      // EUREKA clears queue
      if (priority >= PRIORITY.EUREKA) {
        this._queue = [];
        this._activeExpression = null;
      }

      // V4.3.28（P1）：高优先级（>= TEACHING 80）指令抢占当前低优先级动画
      if (priority >= PRIORITY.TEACHING && this._activeExpression) {
        this.interrupt();
      }

      // Insert sorted by priority (highest first)
      let inserted = false;
      for (let i = 0; i < this._queue.length; i++) {
        if (priority > (this._queue[i].priority || 0)) {
          this._queue.splice(i, 0, { ...decision, priority });
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this._queue.push({ ...decision, priority });
      }

      this._processQueue();
    } catch (e) {
      console.error('ExpressionDirector.enqueue:', e);
    }
  }

  /**
   * 获取当前队列状态
   * @returns {Object} { pending: number, active: *, lastDisplay: number }
   */
  getQueueStatus() {
    try {
      return {
        pending: this._queue.length,
        active: this._activeExpression,
        lastDisplay: this._lastDisplayTime,
      };
    } catch (e) {
      console.error('ExpressionDirector.getQueueStatus:', e);
      return { pending: 0, active: null, lastDisplay: 0 };
    }
  }

  // -----------------------------------------------------------------------
  // Private Methods
  // -----------------------------------------------------------------------

  /**
   * 处理队列（带防抖和递归调度）
   */
  _processQueue() {
    try {
      if (this._processing) return;
      if (this._queue.length === 0) return;

      const now = Date.now();
      if (now - this._lastDisplayTime < this._minInterval) {
        setTimeout(() => this._processQueue(), this._minInterval);
        return;
      }

      this._processing = true;
      const command = this._queue.shift();
      this._execute(command);
      this._lastDisplayTime = Date.now();

      // Process next after minimum interval
      if (this._queue.length > 0) {
        setTimeout(() => {
          this._processing = false;
          this._processQueue();
        }, this._minInterval);
      } else {
        this._processing = false;
      }
    } catch (e) {
      console.error('ExpressionDirector._processQueue:', e);
      this._processing = false;
    }
  }

  /**
   * 执行单条指令（调用已注册的 handler）
   * V4.3.28（P1）：执行期间设置 _activeExpression，供 interrupt() 抢占
   * @param {Object} command - { action, payload }
   */
  _execute(command) {
    try {
      this._cancel = false;
      this._activeExpression = command;
      const handler = this._handlers[command.action];
      if (handler) {
        try {
          handler(command.payload || {});
        } catch (e) {
          console.error('ExpressionDirector: handler error', command.action, e);
        }
      } else {
        console.warn('ExpressionDirector: unknown action', command.action);
      }
    } catch (e) {
      console.error('ExpressionDirector._execute:', e);
    } finally {
      // 指令已派发完成；_activeExpression 保持到下一个 minInterval 以便抢占窗口
      if (!this._cancel) {
        setTimeout(() => {
          if (this._activeExpression === command) this._activeExpression = null;
        }, this._minInterval);
      } else {
        this._activeExpression = null;
      }
    }
  }
}
