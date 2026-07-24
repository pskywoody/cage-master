// ExpressionDirector - Expression Layer
// Priority queue + interrupt management for visual/audio expressions

;(function(global) {
  'use strict';

  const PRIORITY = {
    EUREKA: 100,
    TEACHING: 80,
    STUCK_GUIDE: 50,
    COMBO_EFFECT: 30,
    AMBIENT: 10,
  };

  class ExpressionDirector {
    constructor() {
      this._queue = [];
      this._handlers = {};
      this._activeExpression = null;
      this._lastDisplayTime = 0;
      this._minInterval = 1500;
      this._processing = false;
    }

    registerActionHandler(type, handler) {
      this._handlers[type] = handler;
    }

    enqueue(decision) {
      if (!decision || !decision.action) return;

      const priority = decision.priority || PRIORITY.AMBIENT;

      // EUREKA clears queue
      if (priority >= PRIORITY.EUREKA) {
        this._queue = [];
        this._activeExpression = null;
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
    }

    _processQueue() {
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
    }

    _execute(command) {
      const handler = this._handlers[command.action];
      if (handler) {
        try {
          handler(command.payload || {});
        } catch(e) {
          console.error('ExpressionDirector: handler error', command.action, e);
        }
      } else {
        console.warn('ExpressionDirector: unknown action', command.action);
      }
    }

    getQueueStatus() {
      return {
        pending: this._queue.length,
        active: this._activeExpression,
        lastDisplay: this._lastDisplayTime,
      };
    }
  }

  global.ExpressionDirector = ExpressionDirector;
})(window);
