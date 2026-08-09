/**
 * LevelPoolManager - 精选关卡池管理（2026-08-04）
 *
 * 功能：
 * - 加载池 JSON（data/pool-{technique}.json，由 scripts/generate-pool.cjs 生成）
 * - 按序 / 随机取关，进度持久化（localStorage）
 * - 池条目 → GameApp 兼容 levelData 转换
 *
 * 使用方式：
 *   const pool = new LevelPoolManager({ poolUrl: 'data/pool-xwing-001.json' });
 *   await pool.load();
 *   const entry = pool.getNextLevel();          // 顺序取（进度持久化）
 *   const levelData = pool.toLevelData(entry);  // 转 GameApp 可加载格式
 *   gameApp.startPoolLevel(levelData, entry.levelId);
 */

export class LevelPoolManager {
  constructor(options) {
    options = options || {};
    this._poolUrl = options.poolUrl || null;
    this._baseUrl = options.baseUrl || '';
    this._storageKey = options.storageKey || 'cagemaster4_pool_progress';
    this._pool = [];
    this._loaded = false;
    this._loadFn = typeof options.loadPool === 'function' ? options.loadPool : null;
    this._progress = this._readProgress();
    this._poolMeta = null;
  }

  /**
   * 加载池数据（fetch 或注入 loadPool）
   * @returns {Promise<boolean>}
   */
  async load() {
    if (this._loadFn) {
      this._pool = await this._loadFn();
    } else if (typeof fetch !== 'undefined' && this._poolUrl) {
      const url = this._baseUrl + this._poolUrl;
      const resp = await fetch(url, { cache: 'no-store' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + url);
      const data = await resp.json();
      this._poolMeta = data.metadata || null;
      this._pool = Array.isArray(data.pool) ? data.pool : [];
    } else {
      throw new Error('LevelPoolManager: 需要 poolUrl 或 loadPool');
    }
    this._loaded = true;
    return this._pool.length > 0;
  }

  getPoolSize() {
    return this._pool.length;
  }

  getMetadata() {
    return this._poolMeta;
  }

  isLoaded() {
    return this._loaded;
  }

  /**
   * 顺序取关：按进度 index 取下一关（循环回绕），并持久化进度
   * @returns {Object|null} 池条目
   */
  getNextLevel() {
    if (this._pool.length === 0) return null;
    let idx = this._progress.index || 0;
    if (idx >= this._pool.length) idx = 0;
    const entry = this._pool[idx];
    this._progress.index = idx + 1;
    this._writeProgress();
    return entry;
  }

  /**
   * 随机取关（不推进顺序进度）
   * @returns {Object|null} 池条目
   */
  getRandomLevel() {
    if (this._pool.length === 0) return null;
    const idx = Math.floor(Math.random() * this._pool.length);
    return this._pool[idx];
  }

  /**
   * 查看当前顺序位置条目（不推进进度）
   */
  peekNextLevel() {
    if (this._pool.length === 0) return null;
    let idx = this._progress.index || 0;
    if (idx >= this._pool.length) idx = 0;
    return this._pool[idx];
  }

  /**
   * 池条目 → GameApp 兼容 levelData
   * 补充现有关卡格式字段：title/teachingGoal/difficultyLevel
   * @param {Object} entry - 池条目（generate-pool 输出的 slim 对象）
   * @returns {Object} levelData
   */
  toLevelData(entry) {
    if (!entry) return null;
    const techniques = (entry.difficultyInfo && entry.difficultyInfo.techniquesUsed) || [];
    return {
      levelId: entry.levelId || 'pool-' + Date.now(),
      title: '高级挑战 · X-Wing',
      mode: 'pool',
      gridSize: entry.gridSize || 9,
      difficulty: entry.difficulty || '专家',
      difficultyLevel: 5,
      teachingGoal: techniques.length > 0
        ? '运用高阶技巧：' + techniques.join('、')
        : '高阶技巧综合运用',
      features: ['cage', 'pool', 'xwing'],
      boardData: entry.boardData,
      solution: entry.solution,
      cages: entry.cages,
      threeAct: entry.threeAct || null,
      rhythm: entry.rhythm || null,
      // 池子专属元信息
      poolMeta: {
        technique: (this._poolMeta && this._poolMeta.technique) || null,
        aestheticsScore: entry.aestheticsScore || 0,
        aestheticsDetails: entry.aestheticsDetails || null,
        generatedAt: entry.generatedAt || null,
      },
    };
  }

  // ---- 进度持久化 ----

  _readProgress() {
    try {
      const raw = localStorage.getItem(this._storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  _writeProgress() {
    try {
      localStorage.setItem(this._storageKey, JSON.stringify(this._progress));
    } catch (e) {
      // localStorage 不可用时静默降级（内存进度仍有效）
    }
  }

  resetProgress() {
    this._progress = {};
    this._writeProgress();
  }
}
