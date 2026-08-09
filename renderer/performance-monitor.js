/**
 * PerformanceMonitor - 性能监控与质量分级
 *
 * 三档质量等级：high / medium / low
 * 特征开关（粒子、辉光、热力图）
 * 分辨率缩放与帧率监控自适应降级
 */

export class PerformanceMonitor {
  constructor(options) {
    options = options || {};
    this._level = options.level || "high";
    this._fpsHistory = [];
    this._lastFrameTime = typeof performance !== "undefined" ? performance.now() : 0;
    this._frameCount = 0;
    this._fps = 60;
    this._autoAdjust = options.autoAdjust !== false;
    this._adjustThreshold = options.adjustThreshold || 30;
    this._onLevelChange = options.onLevelChange || null;

    this._configs = {
      high: {
        label: "\u9AD8\u753B\u8D28",
        resolutionScale: 1.0,
        particles: true,
        glow: true,
        heatmap: true,
        antiAlias: true,
        shadowBlur: true,
        animationSmoothness: 1.0,
        cageOverlayOpacity: 0.35,
        maxParticles: 200,
      },
      medium: {
        label: "\u4E2D\u753B\u8D28",
        resolutionScale: 0.75,
        particles: true,
        glow: false,
        heatmap: true,
        antiAlias: true,
        shadowBlur: false,
        animationSmoothness: 0.6,
        cageOverlayOpacity: 0.25,
        maxParticles: 80,
      },
      low: {
        label: "\u4F4E\u753B\u8D28",
        resolutionScale: 0.5,
        particles: false,
        glow: false,
        heatmap: false,
        antiAlias: false,
        shadowBlur: false,
        animationSmoothness: 0.3,
        cageOverlayOpacity: 0.15,
        maxParticles: 0,
      },
    };
    this._quality = Object.assign({}, this._configs[this._level]);
  }

  setLevel(level) {
    if (!this._configs[level]) {
      console.warn("[PerformanceMonitor] Unknown level: " + level);
      return;
    }
    this._level = level;
    this._quality = Object.assign({}, this._configs[level]);
    this._fpsHistory = [];
    if (this._onLevelChange) {
      this._onLevelChange(level, this._quality);
    }
  }

  getLevel() { return this._level; }
  getQuality() { return Object.assign({}, this._quality); }

  getAvailableLevels() {
    var result = [];
    var keys = Object.keys(this._configs);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      result.push({ id: k, label: this._configs[k].label, resolutionScale: this._configs[k].resolutionScale });
    }
    return result;
  }

  recordFrame() {
    var now = typeof performance !== "undefined" ? performance.now() : 0;
    var delta = now - this._lastFrameTime;
    this._lastFrameTime = now;
    if (delta > 0) {
      var instantFps = 1000 / delta;
      this._fpsHistory.push(instantFps);
      if (this._fpsHistory.length > 60) this._fpsHistory.shift();
      var sum = 0;
      for (var j = 0; j < this._fpsHistory.length; j++) { sum += this._fpsHistory[j]; }
      this._fps = sum / this._fpsHistory.length;
    }
    this._frameCount++;
    if (this._autoAdjust && this._frameCount % 60 === 0) {
      this._checkAutoAdjust();
    }
  }

  getFps() { return Math.round(this._fps); }

  getStats() {
    return { fps: this.getFps(), level: this._level, frameCount: this._frameCount, quality: this.getQuality() };
  }

  setAutoAdjust(enabled) { this._autoAdjust = enabled; }

  getRenderScale() {
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    return dpr * this._quality.resolutionScale;
  }

  _checkAutoAdjust() {
    if (this._fps < this._adjustThreshold && this._level !== "low") {
      var levels = ["high", "medium", "low"];
      var currentIdx = levels.indexOf(this._level);
      if (currentIdx < levels.length - 1) {
        var nextLevel = levels[currentIdx + 1];
        console.warn("[PerformanceMonitor] FPS " + this.getFps() + " below threshold, downgrading to " + nextLevel);
        this.setLevel(nextLevel);
      }
    }
  }
}

export default PerformanceMonitor;
