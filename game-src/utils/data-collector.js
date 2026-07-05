/**
 * ============================================================
 *  DataCollector - 数据回收系统
 * ============================================================
 *
 *  收集匿名化的推理数据，用于游戏优化。
 *
 *  核心原则：
 *  - 回收的是匿名化的推理摘要，不是原始笔记内容
 *  - 数据是玩家的，玩家说了算
 *  - 完全匿名，不收集任何可识别身份的信息
 *  - 玩家可随时关闭数据分享
 *
 *  上传数据结构：
 *  - anonymizedId: 匿名ID
 *  - levelId / chapterId: 关卡信息
 *  - noteFrequency / noteAccuracy: 笔记指标
 *  - errorRate / spatialConcentration: 行为指标
 *  - reasoningPath / playerType: 推理模式
 *  - eurekaCount / maxCascade: 高光时刻
 *  - totalTime / totalNotes / totalFills: 统计数据
 *
 * ============================================================
 */

// ============================================================
//  类型定义
// ============================================================

/**
 * @typedef {Object} ReasoningSummary
 * @property {string} anonymizedId - 匿名ID
 * @property {string} levelId - 关卡ID
 * @property {string} chapterId - 章节ID
 * @property {number} noteFrequency - 笔记频率
 * @property {number} noteAccuracy - 笔记准确率
 * @property {number} errorRate - 错误率
 * @property {number} spatialConcentration - 空间集中度
 * @property {string[]} reasoningPath - 推理路径
 * @property {string} playerType - 玩家类型
 * @property {number} eurekaCount - Eureka次数
 * @property {number} maxCascade - 最大连锁数
 * @property {number} totalTime - 总时间（秒）
 * @property {number} totalNotes - 总笔记数
 * @property {number} totalFills - 总填数
 * @property {number} timestamp - 时间戳
 */

// ============================================================
//  DataCollector 类
// ============================================================

class DataCollector {
  // ========================================================
  //  配置
  // ========================================================

  /** 数据上传端点（可配置） */
  static UPLOAD_ENDPOINT = '/api/analytics/reasoning';

  /** 本地存储键名 */
  static STORAGE_KEY = 'data_collector_config';

  /** 匿名ID存储键 */
  static ANON_ID_KEY = 'data_collector_anon_id';

  /** 未发送数据队列存储键 */
  static PENDING_QUEUE_KEY = 'data_collector_pending';

  // ========================================================
  //  状态
  // ========================================================

  /** @type {boolean} 是否启用数据收集 */
  static _enabled = false;

  /** @type {string} 匿名ID */
  static _anonId = '';

  /** @type {Array} 待上传数据队列 */
  static _pendingQueue = [];

  /** @type {boolean} 是否已初始化 */
  static _initialized = false;

  /** @type {number} 关卡开始时间 */
  static _levelStartTime = 0;

  /** @type {Object} 关卡开始时的状态快照 */
  static _levelStartState = null;

  // ========================================================
  //  初始化
  // ========================================================

  /**
   * 初始化数据收集系统
   * @param {Object} [options]
   * @param {boolean} [options.enabled] - 是否启用
   * @param {string} [options.endpoint] - 上传端点
   */
  static init(options = {}) {
    if (this._initialized) return;

    // 从本地存储加载配置
    this._loadConfig();

    // 如果传入了启用状态，覆盖
    if (options.enabled !== undefined) {
      this._enabled = options.enabled;
      this._saveConfig();
    }

    if (options.endpoint) {
      this.UPLOAD_ENDPOINT = options.endpoint;
    }

    // 生成或加载匿名ID
    this._ensureAnonId();

    // 加载待上传队列
    this._loadPendingQueue();

    // 尝试发送待上传的数据
    this._flushPendingQueue();

    this._initialized = true;
  }

  // ========================================================
  //  开关控制
  // ========================================================

  /**
   * 启用数据收集
   */
  static enable() {
    this._enabled = true;
    this._saveConfig();
  }

  /**
   * 禁用数据收集
   */
  static disable() {
    this._enabled = false;
    this._saveConfig();
  }

  /**
   * 切换启用状态
   * @returns {boolean} 新状态
   */
  static toggle() {
    this._enabled = !this._enabled;
    this._saveConfig();
    return this._enabled;
  }

  /**
   * 是否启用
   * @returns {boolean}
   */
  static isEnabled() {
    return this._enabled;
  }

  // ========================================================
  //  关卡生命周期
  // ========================================================

  /**
   * 标记关卡开始
   * @param {string} levelId
   * @param {string} [chapterId]
   */
  static onLevelStart(levelId, chapterId = '') {
    if (!this._enabled) return;

    this._levelStartTime = Date.now();
    this._levelStartState = {
      levelId,
      chapterId,
    };
  }

  /**
   * 标记关卡结束并收集数据
   * @param {Object} [additionalData] - 额外数据
   * @returns {ReasoningSummary|null}
   */
  static onLevelComplete(additionalData = {}) {
    if (!this._enabled || !this._levelStartState) return null;

    const totalTime = (Date.now() - this._levelStartTime) / 1000;

    // 从 ReasoningMonitor 获取推理摘要
    let summary = {};
    if (typeof ReasoningMonitor !== 'undefined') {
      summary = ReasoningMonitor.getReasoningSummary();
    }

    // 从 EurekaDetector 获取Eureka数据
    let eurekaCount = 0;
    let maxCascade = 0;
    if (typeof EurekaDetector !== 'undefined') {
      eurekaCount = EurekaDetector.getEurekaCount();
      maxCascade = EurekaDetector.getMaxCascade();
    }

    const data = {
      anonymizedId: this._anonId,
      levelId: this._levelStartState.levelId,
      chapterId: this._levelStartState.chapterId,
      noteFrequency: summary.noteFrequency || 0,
      noteAccuracy: summary.noteAccuracy || 0,
      errorRate: summary.errorRate || 0,
      spatialConcentration: summary.spatialConcentration || 0,
      reasoningPath: summary.reasoningPath || [],
      playerType: summary.playerType || 'unknown',
      eurekaCount,
      maxCascade,
      totalTime: Math.round(totalTime),
      totalNotes: summary.totalNotes || 0,
      totalFills: summary.totalFills || 0,
      timestamp: Date.now(),
      ...additionalData,
    };

    // 加入待发送队列
    this._pendingQueue.push(data);
    this._savePendingQueue();

    // 尝试立即发送
    this._flushPendingQueue();

    // 重置
    this._levelStartTime = 0;
    this._levelStartState = null;

    return data;
  }

  // ========================================================
  //  数据上传
  // ========================================================

  /**
   * 尝试发送待上传队列中的数据
   */
  static _flushPendingQueue() {
    if (!this._enabled) return;
    if (this._pendingQueue.length === 0) return;
    if (typeof fetch === 'undefined') return; // 非浏览器环境

    // 最多一次发10条
    const batch = this._pendingQueue.slice(0, 10);

    fetch(this.UPLOAD_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: batch }),
    })
      .then(response => {
        if (response.ok) {
          // 发送成功，移除已发送的数据
          this._pendingQueue = this._pendingQueue.slice(batch.length);
          this._savePendingQueue();
        }
      })
      .catch(err => {
        // 发送失败，保留在队列中，下次再试
        console.debug('DataCollector: 上传失败，已加入队列', err.message);
      });
  }

  /**
   * 手动触发上传
   * @returns {Promise<boolean>}
   */
  static async flush() {
    if (!this._enabled || this._pendingQueue.length === 0) {
      return false;
    }

    try {
      const response = await fetch(this.UPLOAD_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ data: this._pendingQueue }),
      });

      if (response.ok) {
        this._pendingQueue = [];
        this._savePendingQueue();
        return true;
      }
    } catch (e) {
      console.debug('DataCollector: 手动上传失败', e.message);
    }

    return false;
  }

  // ========================================================
  //  本地存储
  // ========================================================

  static _loadConfig() {
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const config = JSON.parse(saved);
        this._enabled = config.enabled || false;
      }
    } catch (e) {
      // 忽略
    }
  }

  static _saveConfig() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        enabled: this._enabled,
      }));
    } catch (e) {
      // 忽略
    }
  }

  static _ensureAnonId() {
    try {
      let id = localStorage.getItem(this.ANON_ID_KEY);
      if (!id) {
        id = 'anon_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(this.ANON_ID_KEY, id);
      }
      this._anonId = id;
    } catch (e) {
      this._anonId = 'anon_local';
    }
  }

  static _loadPendingQueue() {
    try {
      const saved = localStorage.getItem(this.PENDING_QUEUE_KEY);
      if (saved) {
        this._pendingQueue = JSON.parse(saved);
      }
    } catch (e) {
      this._pendingQueue = [];
    }
  }

  static _savePendingQueue() {
    try {
      // 最多保留100条
      const toSave = this._pendingQueue.slice(-100);
      localStorage.setItem(this.PENDING_QUEUE_KEY, JSON.stringify(toSave));
    } catch (e) {
      // 忽略
    }
  }

  // ========================================================
  //  查询方法
  // ========================================================

  /**
   * 获取匿名ID
   * @returns {string}
   */
  static getAnonId() {
    return this._anonId;
  }

  /**
   * 获取待上传队列长度
   * @returns {number}
   */
  static getPendingCount() {
    return this._pendingQueue.length;
  }

  /**
   * 清空所有本地数据（用户撤回同意时调用）
   */
  static clearAllData() {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
      localStorage.removeItem(this.ANON_ID_KEY);
      localStorage.removeItem(this.PENDING_QUEUE_KEY);
    } catch (e) {
      // 忽略
    }

    this._enabled = false;
    this._anonId = '';
    this._pendingQueue = [];
  }
}

// ============================================================
//  导出
// ============================================================

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { DataCollector };
}

if (typeof window !== 'undefined') {
  window.DataCollector = DataCollector;
}
