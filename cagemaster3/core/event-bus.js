// EventBus - Global event bus for inter-module communication
// Clean implementation with no encoding issues

;(function(global) {
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

  global.GlobalBus = new EventBus();
  global.EventBus = EventBus;
})(window);
