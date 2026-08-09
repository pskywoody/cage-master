/**
 * LevelManager - 关卡进度管理
 *
 * 功能：
 * - 加载章节索引（chapters.json）
 * - 维护严格有向图（DAG），按序解锁
 * - 进度持久化（统一走 DataStore / 内存回退）
 * - URL 跳关检测
 * - 教学完成状态管理
 *
 * 使用方式：
 *   const lm = new LevelManager();
 *   lm.loadChapters(chaptersData);
 *   lm.markLevelCompleted(101);
 *   const unlocked = lm.getUnlockedLevels();
 */

export class LevelManager {
  constructor(options) {
    options = options || {};
    this._chapters = options.chapters || [];
    this._levelMap = {}; // levelId -> { chapterId, index, locked, completed, teachingCompleted, skipped }
    this._progress = {}; // levelId -> { completed, teachingCompleted, skipped, completedAt }
    this._storageKey = options.storageKey || "cagemaster4_progress";
    this._useStorage = options.useStorage !== false;
    // 统一存储：优先注入的 storageAdapter，其次浏览器 DataStore，最后内存
    this._storageAdapter = options.storageAdapter || null;
    this._loaded = false;
    this._onProgressChange = options.onProgressChange || null;
    this._initStorage();
    this._loadProgress();
  }

  /**
   * 加载章节索引
   * @param {Array} chapters - chapters.json 中的 chapters 数组
   */
  loadChapters(chapters) {
    if (!chapters || !Array.isArray(chapters)) {
      console.error("[LevelManager] Invalid chapters data");
      return false;
    }
    this._chapters = chapters;
    this._buildLevelMap();
    this._loaded = true;
    return true;
  }

  /**
   * 获取已加载的章节列表
   */
  getChapters() {
    return this._chapters;
  }

  /**
   * 获取指定章节信息
   */
  getChapter(chapterId) {
    return this._chapters.find(function(c) { return c.chapterId === chapterId; }) || null;
  }

  /**
   * 获取指定关卡所属章节
   */
  getChapterOfLevel(levelId) {
    var level = this._levelMap[levelId];
    return level ? level.chapterId : null;
  }

  /**
   * 获取关卡在章节中的序号
   */
  getLevelIndexInChapter(levelId) {
    var level = this._levelMap[levelId];
    return level ? level.index : -1;
  }

  /**
   * 标记关卡已完成
   * @param {number} levelId
   * @param {Object} [extra] - 额外信息 { teachingCompleted, skipped }
   */
  markLevelCompleted(levelId, extra) {
    extra = extra || {};
    this._progress[levelId] = {
      completed: true,
      teachingCompleted: extra.teachingCompleted !== false,
      skipped: extra.skipped || false,
      completedAt: Date.now(),
    };
    this._saveProgress();
    if (this._onProgressChange) {
      this._onProgressChange(levelId, "completed");
    }
  }

  /**
   * 标记教学已完成（前关完成但教学跳过）
   */
  markTeachingCompleted(levelId) {
    if (!this._progress[levelId]) {
      this._progress[levelId] = { completed: false, teachingCompleted: true, skipped: false, completedAt: Date.now() };
    } else {
      this._progress[levelId].teachingCompleted = true;
    }
    this._saveProgress();
  }

  /**
   * 标记关卡为"跳过游玩"
   */
  markLevelSkipped(levelId) {
    this._progress[levelId] = {
      completed: false,
      teachingCompleted: false,
      skipped: true,
      skippedAt: Date.now(),
    };
    this._saveProgress();
  }

  /**
   * 检查关卡是否已完成
   */
  isLevelCompleted(levelId) {
    var p = this._progress[levelId];
    return !!(p && p.completed);
  }

  /**
   * 检查关卡是否已解锁
   * 规则：前一关已完成，或章节第一关
   * 兼容：已通关关卡总是可重玩（v2.0——章节内插/重排教学关时，老进度不被新前置锁死）
   */
  isLevelUnlocked(levelId) {
    var level = this._levelMap[levelId];
    if (!level) return false;
    // 已通关关卡总是可重玩（不受重排后新前置关影响）
    if (this.isLevelCompleted(levelId)) return true;
    // 章节第一关总是解锁
    if (level.index === 0) return true;
    // 前一关是否已完成
    var prevLevelId = this._getPrevLevel(levelId);
    if (prevLevelId === null) return false;
    return this.isLevelCompleted(prevLevelId);
  }

  /**
   * 获取所有已解锁的关卡 ID
   */
  getUnlockedLevels() {
    var result = [];
    var ids = Object.keys(this._levelMap);
    for (var i = 0; i < ids.length; i++) {
      var id = parseInt(ids[i], 10);
      if (this.isLevelUnlocked(id)) {
        result.push(id);
      }
    }
    return result.sort(function(a, b) { return a - b; });
  }

  /**
   * 获取下一关 ID
   * @returns {number|null}
   */
  getNextLevel(levelId) {
    var level = this._levelMap[levelId];
    if (!level) return null;
    var chapter = this.getChapter(level.chapterId);
    if (!chapter) return null;
    var nextIdx = level.index + 1;
    if (nextIdx < chapter.levelIds.length) {
      return chapter.levelIds[nextIdx];
    }
    // 跨章节：下一章的第一关
    var nextChapter = this._chapters[level.chapterId]; // 0-based index
    // 查找当前章节的索引
    var chapterIdx = -1;
    for (var ci = 0; ci < this._chapters.length; ci++) {
      if (this._chapters[ci].chapterId === level.chapterId) {
        chapterIdx = ci;
        break;
      }
    }
    if (chapterIdx >= 0 && chapterIdx < this._chapters.length - 1) {
      var nextCh = this._chapters[chapterIdx + 1];
      if (nextCh.levelIds.length > 0) {
        return nextCh.levelIds[0];
      }
    }
    return null; // 最后一关
  }

  /**
   * 获取关卡进度统计
   */
  getProgress() {
    var total = Object.keys(this._levelMap).length;
    var completed = 0;
    var teachingCompleted = 0;
    var skipped = 0;
    var ids = Object.keys(this._progress);
    for (var i = 0; i < ids.length; i++) {
      var p = this._progress[ids[i]];
      if (p.completed) completed++;
      if (p.teachingCompleted) teachingCompleted++;
      if (p.skipped) skipped++;
    }
    return {
      total: total,
      completed: completed,
      teachingCompleted: teachingCompleted,
      skipped: skipped,
      progress: total > 0 ? Math.round(completed / total * 100) : 0,
    };
  }

  /**
   * 检查 URL 跳关
   * @param {number} levelId - 目标关卡 ID
   * @returns {Object} { isJump: boolean, isUnlocked: boolean, currentLevel: number|null }
   */
  checkUrlJump(levelId) {
    var result = {
      isJump: false,
      isUnlocked: this.isLevelUnlocked(levelId),
      currentLevel: null,
      lastCompleted: this._getLastCompletedLevel(),
    };
    if (!this._levelMap[levelId]) {
      return result;
    }
    result.currentLevel = levelId;
    // 如果关卡未解锁，就是跳关
    if (!result.isUnlocked) {
      result.isJump = true;
    }
    return result;
  }

  /**
   * 重置所有进度
   */
  resetAllProgress() {
    this._progress = {};
    this._saveProgress();
    if (this._onProgressChange) {
      this._onProgressChange(null, "reset");
    }
  }

  /**
   * 重置指定关卡的教学状态（重新教学）
   */
  resetLevelTeaching(levelId) {
    if (this._progress[levelId]) {
      this._progress[levelId].teachingCompleted = false;
      this._saveProgress();
    }
  }

  /**
   * 获取第一关 ID
   */
  getFirstLevel() {
    if (this._chapters.length > 0 && this._chapters[0].levelIds.length > 0) {
      return this._chapters[0].levelIds[0];
    }
    return null;
  }

  /**
   * 获取关卡总数
   */
  getTotalLevelCount() {
    return Object.keys(this._levelMap).length;
  }

  /**
   * 获取所有关卡 ID 列表（按顺序）
   */
  getAllLevelIds() {
    var result = [];
    for (var ci = 0; ci < this._chapters.length; ci++) {
      var chapter = this._chapters[ci];
      for (var li = 0; li < chapter.levelIds.length; li++) {
        result.push(chapter.levelIds[li]);
      }
    }
    return result;
  }

  // ==================== 内部方法 ====================

  /**
   * 构建关卡索引映射
   */
  _buildLevelMap() {
    this._levelMap = {};
    for (var ci = 0; ci < this._chapters.length; ci++) {
      var chapter = this._chapters[ci];
      for (var li = 0; li < chapter.levelIds.length; li++) {
        var levelId = chapter.levelIds[li];
        this._levelMap[levelId] = {
          chapterId: chapter.chapterId,
          index: li,
          chapterIndex: ci,
          totalInChapter: chapter.levelIds.length,
        };
      }
    }
  }

  /**
   * 获取前一关 ID
   */
  _getPrevLevel(levelId) {
    var level = this._levelMap[levelId];
    if (!level) return null;
    if (level.index === 0) return null; // 章节第一关没有前一关
    var chapter = this.getChapter(level.chapterId);
    if (!chapter) return null;
    return chapter.levelIds[level.index - 1];
  }

  /**
   * 获取最后完成的关卡 ID
   */
  _getLastCompletedLevel() {
    var lastId = null;
    var lastTime = 0;
    var ids = Object.keys(this._progress);
    for (var i = 0; i < ids.length; i++) {
      var p = this._progress[ids[i]];
      if (p.completed && p.completedAt > lastTime) {
        lastTime = p.completedAt;
        lastId = parseInt(ids[i], 10);
      }
    }
    return lastId;
  }

  /**
   * 初始化存储后端
   * 优先级：注入的 storageAdapter > 浏览器 DataStore > 内存
   */
  _initStorage() {
    if (!this._useStorage) return;
    // 已注入适配器（测试/自定义环境）
    if (this._storageAdapter) return;
    // 浏览器环境：动态加载 DataStore（ES Module）
    if (typeof localStorage !== 'undefined' && typeof document !== 'undefined') {
      // DataStore 由 UI 层预加载到全局（见 game.html / index.html 引入顺序）
      if (typeof window !== 'undefined' && window.DataStore) {
        this._storageAdapter = {
          get: function(key) { return window.DataStore.get(key, window.DataStore.PROGRESS, null); },
          set: function(key, value) {
            window.DataStore.set(key, value, window.DataStore.PROGRESS);
          },
        };
      }
    }
  }

  /**
   * 从存储加载进度
   */
  _loadProgress() {
    if (!this._useStorage) return;
    try {
      var stored = null;
      if (this._storageAdapter) {
        stored = this._storageAdapter.get(this._storageKey);
      } else if (typeof localStorage !== 'undefined') {
        // 降级：直接 localStorage（含旧 key 迁移）
        stored = localStorage.getItem(this._storageKey);
        if (stored) {
          // 迁移到 DataStore（若可用）
          if (this._storageAdapter) {
            this._storageAdapter.set(this._storageKey, JSON.parse(stored));
          }
        }
      }
      if (stored) {
        if (typeof stored === 'string') stored = JSON.parse(stored);
        if (stored && stored.progress) {
          this._progress = stored.progress;
        }
      }
    } catch (e) {
      this._useStorage = false;
    }
  }

  /**
   * 保存进度到存储
   */
  _saveProgress() {
    if (!this._useStorage) return;
    try {
      var payload = { progress: this._progress, updatedAt: Date.now() };
      if (this._storageAdapter) {
        this._storageAdapter.set(this._storageKey, payload);
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem(this._storageKey, JSON.stringify(payload));
      }
    } catch (e) {
      console.warn("[LevelManager] Failed to save progress:", e.message);
    }
  }
}

export default LevelManager;
