/**
 * ============================================================
 *  NotePlayback - 笔记回放系统
 * ============================================================
 *
 *  把笔记数据变成"推理过程的录像"，让玩家回看自己的思考路径。
 *
 *  功能：
 *  - 记录完整的笔记和填数事件序列
 *  - 支持多种回放速度（0.5x / 1x / 2x / 5x）
 *  - 支持暂停/继续/跳转
 *  - 高亮关键节点（Eureka时刻、第一次使用某技巧等）
 *
 *  数据格式：纯文本事件序列，单局约2-10KB
 *
 *  使用方式：
 *    // 开始记录
 *    NotePlayback.startRecording();
 *
 *    // 记录事件（通常由 ReasoningMonitor 自动完成）
 *    NotePlayback.recordEvent(event);
 *
 *    // 停止记录并获取回放数据
 *    const data = NotePlayback.stopRecording();
 *
 *    // 加载回放数据
 *    NotePlayback.loadPlayback(data);
 *
 *    // 播放控制
 *    NotePlayback.play();
 *    NotePlayback.pause();
 *    NotePlayback.setSpeed(2); // 2x 加速
 *    NotePlayback.seek(0.5);   // 跳到50%位置
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {Object} PlaybackEvent
 * @property {number} timestamp - 相对时间（毫秒，从0开始）
 * @property {'note'|'fill'|'erase'|'select'|'eureka'} type - 事件类型
 * @property {number} row - 行号
 * @property {number} col - 列号
 * @property {number} [value] - 数值（笔记或填数）
 * @property {string} [action] - 操作类型（add/remove/toggle）
 * @property {string} [source] - 来源（manual/auto）
 * @property {boolean} [isError] - 是否错误
 * @property {Object} [metadata] - 附加信息
 */

/**
 * @typedef {Object} PlaybackData
 * @property {string} version - 数据格式版本
 * @property {string} levelId - 关卡ID
 * @property {string} chapterId - 章节ID
 * @property {number} totalDuration - 总时长（毫秒）
 * @property {number} totalNotes - 总笔记数
 * @property {number} totalFills - 总填数
 * @property {PlaybackEvent[]} events - 事件序列
 * @property {Array} eurekaMoments - Eureka时刻索引
 */

// ============================================================
//  NotePlayback 类
// ============================================================

class NotePlayback {
  // ========================================================
  //  状态
  // ========================================================

  /** @type {boolean} 是否正在录制 */
  static _isRecording = false;

  /** @type {number} 录制开始时间（绝对时间戳） */
  static _recordStartTime = 0;

  /** @type {PlaybackEvent[]} 录制的事件 */
  static _recordedEvents = [];

  /** @type {PlaybackData|null} 当前加载的回放数据 */
  static _playbackData = null;

  /** @type {boolean} 是否正在播放 */
  static _isPlaying = false;

  /** @type {number} 当前播放位置（毫秒） */
  static _currentTime = 0;

  /** @type {number} 播放速度倍率 */
  static _playbackSpeed = 1;

  /** @type {number|null} 播放定时器ID */
  static _playTimer = null;

  /** @type {number} 上次播放更新时间 */
  static _lastPlayTime = 0;

  /** @type {Function|null} 事件回调 */
  static _onEvent = null;

  /** @type {Function|null} 状态变化回调 */
  static _onStateChange = null;

  // ========================================================
  //  录制功能
  // ========================================================

  /**
   * 开始录制
   * @param {Object} options
   * @param {string} [options.levelId] - 关卡ID
   * @param {string} [options.chapterId] - 章节ID
   */
  static startRecording(options = {}) {
    this._isRecording = true;
    this._recordStartTime = Date.now();
    this._recordedEvents = [];
    this._levelId = options.levelId || '';
    this._chapterId = options.chapterId || '';
  }

  /**
   * 记录事件
   * @param {Object} event - 事件数据
   */
  static recordEvent(event) {
    if (!this._isRecording) return;

    const relativeTime = Date.now() - this._recordStartTime;

    const playbackEvent = {
      timestamp: relativeTime,
      ...event,
    };

    this._recordedEvents.push(playbackEvent);
  }

  /**
   * 停止录制并获取回放数据
   * @returns {PlaybackData}
   */
  static stopRecording() {
    this._isRecording = false;

    const totalDuration = this._recordedEvents.length > 0
      ? this._recordedEvents[this._recordedEvents.length - 1].timestamp
      : 0;

    // 找出Eureka时刻
    const eurekaMoments = [];
    this._recordedEvents.forEach((evt, idx) => {
      if (evt.type === 'eureka') {
        eurekaMoments.push({ index: idx, timestamp: evt.timestamp });
      }
    });

    // 统计
    let totalNotes = 0;
    let totalFills = 0;
    for (const evt of this._recordedEvents) {
      if (evt.type === 'note') totalNotes++;
      if (evt.type === 'fill') totalFills++;
    }

    const data = {
      version: '1.0',
      levelId: this._levelId,
      chapterId: this._chapterId,
      totalDuration,
      totalNotes,
      totalFills,
      events: this._recordedEvents,
      eurekaMoments,
    };

    this._playbackData = data;
    return data;
  }

  /**
   * 是否正在录制
   * @returns {boolean}
   */
  static isRecording() {
    return this._isRecording;
  }

  // ========================================================
  //  回放功能
  // ========================================================

  /**
   * 加载回放数据
   * @param {PlaybackData} data
   */
  static loadPlayback(data) {
    this._playbackData = data;
    this._currentTime = 0;
    this._isPlaying = false;
    this._stopPlayTimer();
  }

  /**
   * 开始播放
   */
  static play() {
    if (!this._playbackData) return;
    if (this._isPlaying) return;

    this._isPlaying = true;
    this._lastPlayTime = Date.now();
    this._startPlayTimer();

    if (this._onStateChange) {
      this._onStateChange({ isPlaying: true, currentTime: this._currentTime });
    }
  }

  /**
   * 暂停播放
   */
  static pause() {
    if (!this._isPlaying) return;

    this._isPlaying = false;
    this._stopPlayTimer();

    if (this._onStateChange) {
      this._onStateChange({ isPlaying: false, currentTime: this._currentTime });
    }
  }

  /**
   * 跳转到指定位置
   * @param {number} progress - 0-1 的进度
   */
  static seek(progress) {
    if (!this._playbackData) return;

    const clampedProgress = Math.max(0, Math.min(1, progress));
    this._currentTime = clampedProgress * this._playbackData.totalDuration;

    // 重放到当前时间点的所有事件
    this._replayToCurrentTime();

    if (this._onStateChange) {
      this._onStateChange({
        isPlaying: this._isPlaying,
        currentTime: this._currentTime,
        progress: clampedProgress,
      });
    }
  }

  /**
   * 设置播放速度
   * @param {number} speed - 0.5 / 1 / 2 / 5
   */
  static setSpeed(speed) {
    const validSpeeds = [0.5, 1, 2, 5];
    if (!validSpeeds.includes(speed)) return;

    this._playbackSpeed = speed;
  }

  /**
   * 获取当前播放速度
   * @returns {number}
   */
  static getSpeed() {
    return this._playbackSpeed;
  }

  // ========================================================
  //  播放定时器
  // ========================================================

  static _startPlayTimer() {
    if (this._playTimer) return;

    const tick = () => {
      if (!this._isPlaying) return;

      const now = Date.now();
      const delta = (now - this._lastPlayTime) * this._playbackSpeed;
      this._lastPlayTime = now;

      this._currentTime += delta;

      // 检查是否播放完毕
      if (this._currentTime >= this._playbackData.totalDuration) {
        this._currentTime = this._playbackData.totalDuration;
        this.pause();
        return;
      }

      // 处理当前时间点的事件
      this._processEventsUpTo(this._currentTime);

      // 继续下一帧
      this._playTimer = requestAnimationFrame(tick);
    };

    this._playTimer = requestAnimationFrame(tick);
  }

  static _stopPlayTimer() {
    if (this._playTimer) {
      cancelAnimationFrame(this._playTimer);
      this._playTimer = null;
    }
  }

  // ========================================================
  //  事件处理
  // ========================================================

  /** @type {number} 上次处理到的事件索引 */
  static _lastProcessedIndex = -1;

  /**
   * 处理到指定时间点的所有事件
   * @param {number} time - 时间点（毫秒）
   */
  static _processEventsUpTo(time) {
    if (!this._playbackData || !this._onEvent) return;

    const events = this._playbackData.events;

    while (
      this._lastProcessedIndex + 1 < events.length &&
      events[this._lastProcessedIndex + 1].timestamp <= time
    ) {
      this._lastProcessedIndex++;
      const event = events[this._lastProcessedIndex];
      this._onEvent(event);
    }
  }

  /**
   * 重放到当前时间（用于seek后）
   */
  static _replayToCurrentTime() {
    this._lastProcessedIndex = -1;
    this._processEventsUpTo(this._currentTime);
  }

  // ========================================================
  //  回调设置
  // ========================================================

  /**
   * 设置事件回调
   * @param {Function} callback - (event) => void
   */
  static setOnEvent(callback) {
    this._onEvent = callback;
  }

  /**
   * 设置状态变化回调
   * @param {Function} callback - (state) => void
   */
  static setOnStateChange(callback) {
    this._onStateChange = callback;
  }

  // ========================================================
  //  查询方法
  // ========================================================

  /**
   * 获取播放进度（0-1）
   * @returns {number}
   */
  static getProgress() {
    if (!this._playbackData || this._playbackData.totalDuration === 0) return 0;
    return this._currentTime / this._playbackData.totalDuration;
  }

  /**
   * 获取总时长（秒）
   * @returns {number}
   */
  static getTotalDuration() {
    if (!this._playbackData) return 0;
    return this._playbackData.totalDuration / 1000;
  }

  /**
   * 获取当前时间（秒）
   * @returns {number}
   */
  static getCurrentTime() {
    return this._currentTime / 1000;
  }

  /**
   * 是否正在播放
   * @returns {boolean}
   */
  static isPlaying() {
    return this._isPlaying;
  }

  /**
   * 获取Eureka时刻列表
   * @returns {Array}
   */
  static getEurekaMoments() {
    return this._playbackData?.eurekaMoments || [];
  }

  // ========================================================
  //  数据序列化
  // ========================================================

  /**
   * 序列化为JSON字符串
   * @param {PlaybackData} [data]
   * @returns {string}
   */
  static toJSON(data = null) {
    const d = data || this._playbackData;
    return d ? JSON.stringify(d) : '{}';
  }

  /**
   * 从JSON字符串加载
   * @param {string} json
   * @returns {PlaybackData}
   */
  static fromJSON(json) {
    try {
      const data = JSON.parse(json);
      this.loadPlayback(data);
      return data;
    } catch (e) {
      console.error('NotePlayback: 解析JSON失败', e);
      return null;
    }
  }

  /**
   * 获取数据大小估算（字节）
   * @param {PlaybackData} [data]
   * @returns {number}
   */
  static estimateSize(data = null) {
    const d = data || this._playbackData;
    if (!d) return 0;
    return JSON.stringify(d).length;
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NotePlayback };
}

if (typeof window !== 'undefined') {
  window.NotePlayback = NotePlayback;
}
