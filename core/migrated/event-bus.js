// ==========================================
// EventBus - 迁移自 cagemaster3/core/event-bus.js
// 转换为 ES Module 格式
// ==========================================
'use strict';

  class EventBus {
    constructor() {
      this._listeners = {};
    }

    on(event, callback) {
      if (!this._listeners[event]) {
        this._listeners[event] = [];
      }
      this._listeners[event].push(callback);
      return () => this.off(event, callback);
    }

    off(event, callback) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(cb => cb !== callback);
    }

    emit(event, ...args) {
      if (!this._listeners[event]) return;
      this._listeners[event].forEach(cb => {
        try { cb(...args); } catch(e) { console.error('EventBus error:', event, e); }
      });
    }

    once(event, callback) {
      const wrapper = (...args) => {
        this.off(event, wrapper);
        callback(...args);
      };
      return this.on(event, wrapper);
    }
  }

export { EventBus };
