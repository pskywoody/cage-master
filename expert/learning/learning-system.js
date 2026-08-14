/**
 * LearningSystem - Learning Layer
 * ================================
 * 学习层核心模块：持久化追踪玩家风格与技巧熟练度。
 * 通过分析玩家的填数准确率、提示使用率、技巧成功率等数据，
 * 推断玩家风格（precise / experimental / cautious / balanced），
 * 并为上层决策提供自适应因子。
 *
 * 职责：
 *  - 记录填数、提示、重置、技巧使用等事件
 *  - 动态更新玩家风格（_updateStyle）
 *  - 提供技巧熟练度排名与评价生成
 *  - 可选的 replay 存储（保留最近 5 条）
 *
 * ES Module 迁移说明：
 *  - 从 IIFE 模式迁移为 ES Module，使用 `export class LearningSystem`
 *  - localStorage 依赖改为可选的注入方式（通过构造函数 config.dataStore）
 *  - 所有 Public 方法添加 try-catch 保护
 *
 * @module learning/learning-system
 */

// ---------------------------------------------------------------------------
// 默认存储键名
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'cagemaster3_learning';

// ---------------------------------------------------------------------------
// 默认的 localStorage 适配器（仅在全局可用时生效）
// ---------------------------------------------------------------------------
const defaultStorage = (typeof localStorage !== 'undefined') ? localStorage : null;

export class LearningSystem {
  /**
   * @param {Object}  [config={}]
   * @param {Object}  [config.dataStore]   可选的外部存储注入（替代 localStorage）
   * @param {Object}  [config.storage]     config.dataStore 的别名
   * @param {string}  [config.storageKey]  存储键名，默认 'cagemaster3_learning'
   */
  constructor(config = {}) {
    // 可选存储注入
    this._store = config.dataStore || config.storage || defaultStorage;
    this._storageKey = config.storageKey || STORAGE_KEY;

    this._data = this._load();

    // V4.3.27（P0-2）：画像更新监听（决策层实时读取）
    this._updateListeners = [];
  }

  // -----------------------------------------------------------------------
  // Public Methods
  // -----------------------------------------------------------------------

  /**
   * 记录一次技巧使用
   * @param {string}  name    - 技巧名称
   * @param {boolean} success - 是否成功
   */
  recordTechnique(name, success) {
    try {
      if (!name) return;
      if (!this._data.techniques[name]) {
        this._data.techniques[name] = { attempts: 0, successes: 0 };
      }
      this._data.techniques[name].attempts++;
      if (success) this._data.techniques[name].successes++;
      this._save();
      // V4.3.27（P0-2）：熟练度变化 → 通知决策层
      this._notifyListeners();
    } catch (e) {
      console.error('LearningSystem.recordTechnique:', e);
    }
  }

  /**
   * 记录一次填数
   * @param {number}  row
   * @param {number}  col
   * @param {number}  num
   * @param {boolean} isCorrect
   */
  recordFill(row, col, num, isCorrect) {
    try {
      this._data.totalFills++;
      if (isCorrect) this._data.correctFills++;
      this._updateStyle();
      this._save();
    } catch (e) {
      console.error('LearningSystem.recordFill:', e);
    }
  }

  /**
   * 记录一次提示使用
   */
  recordHint() {
    try {
      this._data.hintsUsed++;
      this._save();
    } catch (e) {
      console.error('LearningSystem.recordHint:', e);
    }
  }

  /**
   * 记录一次重置
   */
  recordReset() {
    try {
      this._data.resets++;
      this._save();
    } catch (e) {
      console.error('LearningSystem.recordReset:', e);
    }
  }

  /**
   * Record a replay session for later review.
   * Stores the most recent replay per level (keeps last 5).
   * @param {Object} replayData
   */
  recordReplay(replayData) {
    try {
      if (!replayData) return;
      if (!this._data.replays) {
        this._data.replays = [];
      }
      this._data.replays.push({
        savedAt: Date.now(),
        data: replayData,
      });
      // Keep only last 5 replays
      if (this._data.replays.length > 5) {
        this._data.replays.shift();
      }
      this._save();
    } catch (e) {
      console.error('LearningSystem.recordReplay:', e);
    }
  }

  /**
   * 获取已保存的 replay 列表
   * @returns {Array<Object>}
   */
  getReplays() {
    try {
      return this._data.replays || [];
    } catch (e) {
      console.error('LearningSystem.getReplays:', e);
      return [];
    }
  }

  /**
   * 获取当前玩家风格
   * @returns {{ value: string, confidence: number }}
   */
  getStyle() {
    try {
      return this._data.style || { value: 'balanced', confidence: 0.5 };
    } catch (e) {
      console.error('LearningSystem.getStyle:', e);
      return { value: 'balanced', confidence: 0.5 };
    }
  }

  /**
   * 获取指定技巧的熟练度百分比
   * @param {string} name
   * @returns {number} 0-100
   */
  getTechniqueProficiency(name) {
    try {
      const t = this._data.techniques[name];
      if (!t || t.attempts === 0) return 0;
      return Math.round((t.successes / t.attempts) * 100);
    } catch (e) {
      console.error('LearningSystem.getTechniqueProficiency:', e);
      return 0;
    }
  }

  /**
   * 获取熟练度最高的技巧列表
   * @param {number} [limit=5]
   * @returns {Array<{ name: string, proficiency: number, attempts: number }>}
   */
  getTopTechniques(limit = 5) {
    try {
      return Object.entries(this._data.techniques)
        .map(([name, t]) => ({
          name,
          proficiency: t.attempts > 0 ? Math.round((t.successes / t.attempts) * 100) : 0,
          attempts: t.attempts,
        }))
        .sort((a, b) => b.proficiency - a.proficiency)
        .slice(0, limit);
    } catch (e) {
      console.error('LearningSystem.getTopTechniques:', e);
      return [];
    }
  }

  /**
   * 根据评分生成评价文本
   * @param {Object} [rating={}]
   * @param {number}  [rating.nonTrivialRatio=0]
   * @param {number}  [rating.maxTechLevel=0]
   * @param {number}  [rating.score=0]
   * @returns {string}
   */
  generateComment(rating) {
    try {
      const { nonTrivialRatio = 0, maxTechLevel = 0, score = 0 } = rating || {};

      if (nonTrivialRatio < 0.15 && score < 300) {
        return '单凭直觉便能冲破这藏书楼的死角...你到底是在解局，还是在凭本能撕裂这牢笼？';
      }
      if (maxTechLevel >= 8 && nonTrivialRatio > 0.3) {
        return '星衡法则，三才游鱼...你对这数理铁律的运筹，像极了当年在那枯坐通宵的那个人。';
      }
      if (this._data.style.value === 'experimental') {
        return '你的试错精神令人印象深刻。每一次失败都让你离答案更近。';
      }
      if (this._data.style.value === 'cautious') {
        return '谨慎是解谜者的美德。你每一步都经过深思熟虑。';
      }
      return '不错的表现。继续保持这种节奏。';
    } catch (e) {
      console.error('LearningSystem.generateComment:', e);
      return '不错的表现。继续保持这种节奏。';
    }
  }

  // -----------------------------------------------------------------------
  // Private Methods
  // -----------------------------------------------------------------------

  /**
   * 根据当前数据更新玩家风格
   */
  _updateStyle() {
    const t = this._data;
    if (t.totalFills === 0) return;

    const accuracy = t.correctFills / t.totalFills;
    const hintRate = t.hintsUsed / Math.max(t.totalFills, 1);

    let value = 'balanced';
    let confidence = 0.5;

    if (accuracy > 0.9 && hintRate < 0.05) {
      value = 'precise';
      confidence = Math.min(0.9, accuracy);
    } else if (accuracy < 0.6) {
      value = 'experimental';
      confidence = Math.min(0.8, 1 - accuracy);
    } else if (hintRate > 0.3) {
      value = 'cautious';
      confidence = Math.min(0.8, hintRate);
    }

    this._data.style = { value, confidence };
  }

  /**
   * 从存储中加载数据
   * @returns {Object}
   */
  _load() {
    try {
      if (this._store && typeof this._store.getItem === 'function') {
        const raw = this._store.getItem(this._storageKey);
        if (raw) return JSON.parse(raw);
      }
    } catch (e) {
      // 静默降级
    }
    return this._defaultData();
  }

  /**
   * 将数据保存到存储
   */
  _save() {
    try {
      if (this._store && typeof this._store.setItem === 'function') {
        this._store.setItem(this._storageKey, JSON.stringify(this._data));
      }
    } catch (e) {
      // 静默降级
    }
  }

  /**
   * 返回默认数据
   * @returns {Object}
   */
  _defaultData() {
    return {
      totalFills: 0,
      correctFills: 0,
      hintsUsed: 0,
      resets: 0,
      techniques: {},
      style: { value: 'balanced', confidence: 0.5 },
    };
  }

  // -----------------------------------------------------------------------
  // V4.3.27（P0-2）：mastery 熟练度 + 画像推送（决策层实时读取）
  // -----------------------------------------------------------------------

  /**
   * 计算单技巧熟练度等级（1-5）
   * @param {{attempts:number, successes:number}} data
   * @returns {number}
   */
  _calcMastery(data) {
    const { attempts, successes } = data;
    if (!attempts) return 1;
    const rate = successes / attempts;
    if (attempts >= 20 && rate >= 0.7) return 5;
    if (attempts >= 10 && rate >= 0.6) return 4;
    if (attempts >= 5 && rate >= 0.5) return 3;
    if (attempts >= 2) return 2;
    return 1;
  }

  /**
   * 获取玩家画像（决策层实时读取）
   * @returns {Object} { techniqueMastery, masteryAvg, playerStyle, preferredCharacter, weakTechniques }
   */
  getProfile() {
    try {
      const mastery = {};
      for (const [name, d] of Object.entries(this._data.techniques || {})) {
        mastery[name] = { encounters: d.attempts, correct: d.successes, masteryLevel: this._calcMastery(d) };
      }
      const values = Object.values(mastery);
      const masteryAvg = values.length
        ? values.reduce((s, v) => s + v.masteryLevel, 0) / values.length
        : 1;
      const weak = values.length
        ? Object.entries(mastery).filter(([, v]) => v.masteryLevel <= 2).map(([k]) => k)
        : [];
      return {
        techniqueMastery: mastery,
        masteryAvg: Math.round(masteryAvg * 10) / 10,
        playerStyle: (this._data.style && this._data.style.value) || 'balanced',
        preferredCharacter: 'cagekeeper',
        weakTechniques: weak,
      };
    } catch (e) {
      return { techniqueMastery: {}, masteryAvg: 1, playerStyle: 'balanced', preferredCharacter: 'cagekeeper', weakTechniques: [] };
    }
  }

  /**
   * 订阅画像更新
   * @param {Function} listener - (profile) => void
   */
  onUpdate(listener) {
    try {
      if (typeof listener === 'function') this._updateListeners.push(listener);
    } catch (e) {}
  }

  /** 通知监听者（每 1s 节流，避免刷屏） */
  _notifyListeners() {
    try {
      const now = Date.now();
      if (this._lastNotifyTime && (now - this._lastNotifyTime) < 1000) return;
      this._lastNotifyTime = now;
      const profile = this.getProfile();
      for (const fn of this._updateListeners) {
        try { fn(profile); } catch (e) {}
      }
    } catch (e) {}
  }
}
