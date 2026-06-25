// ==========================================
// 本地存储工具 - localStorage 存档管理
// ==========================================

const Storage = (function() {
  const KEY_PREFIX = 'killersudoku_';

  // 存档 key 构造
  function saveKey(levelId) {
    return KEY_PREFIX + 'save_' + levelId;
  }
  function completeKey(levelId) {
    return KEY_PREFIX + 'complete_' + levelId;
  }
  const STATS_KEY = KEY_PREFIX + 'stats';

  /**
   * 保存单关进度
   * @param {number} levelId
   * @param {Object} data { fillNums: number[][], candidates: string[][], time: seconds }
   */
  function saveProgress(levelId, data) {
    try {
      localStorage.setItem(saveKey(levelId), JSON.stringify(data));
    } catch (e) {
      console.warn('存档失败：', e.message);
    }
  }

  /**
   * 读取单关进度
   * @param {number} levelId
   * @returns {Object|null} 存档数据，无存档返回 null
   */
  function loadProgress(levelId) {
    try {
      const raw = localStorage.getItem(saveKey(levelId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('读档失败：', e.message);
      return null;
    }
  }

  /**
   * 清除单关进度
   */
  function clearProgress(levelId) {
    try {
      localStorage.removeItem(saveKey(levelId));
    } catch (e) {
      console.warn('清除存档失败：', e.message);
    }
  }

  /**
   * 标记关卡通关
   * @param {number} levelId
   * @param {Object} data { time: seconds, difficulty: string }
   */
  function markComplete(levelId, data) {
    try {
      // 只在首次通关或更快通关时更新
      const existing = localStorage.getItem(completeKey(levelId));
      if (existing) {
        const prev = JSON.parse(existing);
        if (data.time >= prev.time) return; // 已有更快记录，不更新
      }
      localStorage.setItem(completeKey(levelId), JSON.stringify(data));

      // 更新总统计
      updateStats(levelId, data);
    } catch (e) {
      console.warn('保存通关记录失败：', e.message);
    }
  }

  /**
   * 查询某关是否通关
   */
  function isCompleted(levelId) {
    try {
      return !!localStorage.getItem(completeKey(levelId));
    } catch (e) {
      return false;
    }
  }

  /**
   * 获取某关通关记录
   */
  function getCompleteRecord(levelId) {
    try {
      const raw = localStorage.getItem(completeKey(levelId));
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 更新总统计
   */
  function updateStats(levelId, data) {
    let stats = getStats();
    stats.totalCompleted += 1;
    stats.totalTime += data.time;
    if (!stats.difficultyCount[data.difficulty]) {
      stats.difficultyCount[data.difficulty] = 0;
    }
    stats.difficultyCount[data.difficulty] += 1;
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  }

  /**
   * 获取总统计
   */
  function getStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      return raw ? JSON.parse(raw) : {
        totalCompleted: 0,
        totalTime: 0,
        difficultyCount: {}
      };
    } catch (e) {
      return { totalCompleted: 0, totalTime: 0, difficultyCount: {} };
    }
  }

  /**
   * 批量获取多个关卡的通关状态
   * @param {Array} levelIds
   * @returns {Object} { [levelId]: { completed, time } }
   */
  function getCompleteBatch(levelIds) {
    const result = {};
    levelIds.forEach(id => {
      const record = getCompleteRecord(id);
      result[id] = {
        completed: !!record,
        time: record ? record.time : 0
      };
    });
    return result;
  }

  return {
    saveProgress,
    loadProgress,
    clearProgress,
    markComplete,
    isCompleted,
    getCompleteRecord,
    getStats,
    getCompleteBatch
  };
})();

window.Storage = Storage;
