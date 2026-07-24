// EventLogger - Automatic event logging for debugging and testing
// Intercepts all GlobalBus events and logs them to console

;(function(global) {
  'use strict';

  const _log = [];
  const MAX_LOG = 500;
  let _enabled = true;

  // Intercept GlobalBus.emit
  if (global.GlobalBus) {
    const originalEmit = global.GlobalBus.emit.bind(global.GlobalBus);
    global.GlobalBus.emit = function(event, ...args) {
      if (_enabled) {
        const entry = {
          time: Date.now(),
          event: event,
          args: args.length > 0 ? args : undefined,
        };
        _log.push(entry);
        if (_log.length > MAX_LOG) _log.shift();
        console.log('[EVENT]', event, ...args);
      }
      return originalEmit(event, ...args);
    };
  }

  // Public API
  global.EventLogger = {
    log: (eventName, data) => {
      if (!_enabled) return;
      const entry = { time: Date.now(), event: eventName, data };
      _log.push(entry);
      if (_log.length > MAX_LOG) _log.shift();
      console.log('[EVENT]', eventName, data);
    },

    getLog: () => [..._log],

    getRecent: (count = 20) => _log.slice(-count),

    filterByEvent: (eventName) => _log.filter(e => e.event === eventName),

    clear: () => { _log.length = 0; },

    enable: () => { _enabled = true; },
    disable: () => { _enabled = false; },

    // Summary for debugging
    summary: () => {
      const counts = {};
      _log.forEach(e => { counts[e.event] = (counts[e.event] || 0) + 1; });
      return counts;
    },
  };

  console.log('[EventLogger] Initialized');
})(window);
