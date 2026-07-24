// BeatQuantizer - Timing Layer
// Rate limiter that aligns feedback to beat intervals

;(function(global) {
  'use strict';

  class BeatQuantizer {
    constructor(config = {}) {
      this._interval = config.interval || 2000;
      this._lastBeat = Date.now();
      this._pending = null;
    }

    enqueue(item, callback) {
      const now = Date.now();
      const elapsed = now - this._lastBeat;

      if (elapsed >= this._interval) {
        this._lastBeat = now;
        if (callback) callback(item);
      } else {
        this._pending = item;
        const remaining = this._interval - elapsed;
        setTimeout(() => {
          if (this._pending === item) {
            this._lastBeat = Date.now();
            this._pending = null;
            if (callback) callback(item);
          }
        }, remaining);
      }
    }

    setInterval(ms) {
      this._interval = ms;
    }

    getMsToNextBar() {
      const elapsed = Date.now() - this._lastBeat;
      return Math.max(0, this._interval - elapsed);
    }
  }

  global.BeatQuantizer = BeatQuantizer;
})(window);
