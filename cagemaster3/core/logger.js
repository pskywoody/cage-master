// Logger - Simple logging utility
// Clean implementation

;(function(global) {
  'use strict';

  const LEVELS = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };
  const COLORS = { DEBUG: '#94a3b8', INFO: '#60a5fa', WARN: '#fbbf24', ERROR: '#f87171' };

  class Logger {
    constructor(prefix) {
      this.prefix = prefix || 'App';
      this.level = LEVELS.DEBUG;
    }

    _log(level, ...args) {
      if (level < this.level) return;
      const tag = level === LEVELS.ERROR ? 'ERROR' : level === LEVELS.WARN ? 'WARN' : 'INFO';
      console.log(`[${this.prefix}] ${tag}:`, ...args);
    }

    debug(...args) { this._log(LEVELS.DEBUG, ...args); }
    info(...args) { this._log(LEVELS.INFO, ...args); }
    warn(...args) { this._log(LEVELS.WARN, ...args); }
    error(...args) { this._log(LEVELS.ERROR, ...args); }
  }

  global.Logger = Logger;
})(window);
