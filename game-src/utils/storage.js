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
  const SETTINGS_KEY = KEY_PREFIX + 'settings';
  const ANALYTICS_KEY = KEY_PREFIX + 'analytics'; // 埋点总数据
  const SESSION_KEY = KEY_PREFIX + 'session';     // 当前会话的实时埋点
  const BATTLE_KEY = KEY_PREFIX + 'battle_stats'; // 对战战绩

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

  /**
   * 保存用户设置
   * @param {Object} settings
   */
  function saveSettings(settings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('保存设置失败：', e.message);
    }
  }

  /**
   * 读取用户设置
   * @returns {Object|null}
   */
  function getSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.warn('读取设置失败：', e.message);
      return null;
    }
  }

  // ==========================================
  // 埋点 & 难度校准
  // ==========================================

  /**
   * 开始一局的埋点记录
   * @param {number} levelId
   */
  function startSession(levelId) {
    const session = {
      levelId,
      startTime: Date.now(),
      actions: [],
      hintCount: 0,
      undoCount: 0,
      eraseCount: 0,
      errorCount: 0,
      setNumberCount: 0,
      candidateCount: 0,
      toolUses: {
        rule45: 0,
        clearCandidates: 0,
        boxSelect: 0
      }
    };
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('开始埋点失败：', e.message);
    }
    return session;
  }

  /**
   * 获取当前会话埋点
   */
  function getSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * 记录一个操作
   * @param {string} type - 操作类型
   * @param {Object} data - 附加数据
   */
  function logAction(type, data = {}) {
    const session = getSession();
    if (!session) return;

    const timeOffset = Date.now() - session.startTime;
    session.actions.push({ type, time: timeOffset, ...data });

    // 计数统计
    switch (type) {
      case 'hint':
        session.hintCount++;
        break;
      case 'undo':
        session.undoCount++;
        break;
      case 'erase':
        session.eraseCount++;
        break;
      case 'setNumber':
        session.setNumberCount++;
        break;
      case 'toggleCandidate':
        session.candidateCount++;
        break;
      case 'conflict':
        session.errorCount++;
        break;
      case 'useRule45':
        session.toolUses.rule45++;
        break;
      case 'useClearCandidates':
        session.toolUses.clearCandidates++;
        break;
      case 'useBoxSelect':
        session.toolUses.boxSelect++;
        break;
    }

    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn('记录埋点失败：', e.message);
    }
  }

  /**
   * 结束一局，保存到总埋点数据
   * @param {boolean} completed - 是否完成
   */
  function endSession(completed) {
    const session = getSession();
    if (!session) return;

    session.endTime = Date.now();
    session.totalTime = Math.floor((session.endTime - session.startTime) / 1000);
    session.completed = completed;

    // 保存到总埋点
    const analytics = getAllAnalytics();
    if (!analytics[session.levelId]) {
      analytics[session.levelId] = {
        attempts: 0,
        completions: 0,
        totalTime: 0,
        bestTime: null,
        avgTime: 0,
        avgHints: 0,
        avgUndos: 0,
        totalHints: 0,
        totalUndos: 0,
        difficultyScore: 0,
        history: [] // 最近 N 次记录
      };
    }

    const levelData = analytics[session.levelId];
    levelData.attempts++;
    if (completed) {
      levelData.completions++;
      levelData.totalTime += session.totalTime;
      levelData.totalHints += session.hintCount;
      levelData.totalUndos += session.undoCount;
      levelData.avgTime = Math.round(levelData.totalTime / levelData.completions);
      levelData.avgHints = +(levelData.totalHints / levelData.completions).toFixed(1);
      levelData.avgUndos = +(levelData.totalUndos / levelData.completions).toFixed(1);
      if (levelData.bestTime === null || session.totalTime < levelData.bestTime) {
        levelData.bestTime = session.totalTime;
      }
    }

    // 保留最近 20 次记录
    levelData.history.unshift({
      time: session.totalTime,
      completed,
      hints: session.hintCount,
      undos: session.undoCount,
      date: session.endTime
    });
    if (levelData.history.length > 20) {
      levelData.history = levelData.history.slice(0, 20);
    }

    // 计算难度分（越高越难）
    // 公式：平均用时权重 60% + 提示次数权重 25% + 撤销次数权重 15%
    // 归一化后加权
    if (levelData.completions > 0) {
      const timeScore = Math.min(levelData.avgTime / 600, 10); // 10分钟以上满分
      const hintScore = Math.min(levelData.avgHints / 10, 10);  // 10次提示以上满分
      const undoScore = Math.min(levelData.avgUndos / 20, 10);  // 20次撤销以上满分
      levelData.difficultyScore = +(timeScore * 0.6 + hintScore * 0.25 + undoScore * 0.15).toFixed(2);
    }

    try {
      localStorage.setItem(ANALYTICS_KEY, JSON.stringify(analytics));
      localStorage.removeItem(SESSION_KEY);
    } catch (e) {
      console.warn('保存埋点失败：', e.message);
    }

    return session;
  }

  /**
   * 获取所有埋点数据
   */
  function getAllAnalytics() {
    try {
      const raw = localStorage.getItem(ANALYTICS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 获取某关的埋点数据
   */
  function getLevelAnalytics(levelId) {
    const analytics = getAllAnalytics();
    return analytics[levelId] || null;
  }

  /**
   * 根据玩家数据重新校准难度排序
   * @param {Array} levels - 关卡列表
   * @returns {Array} 重新排序后的关卡列表，带校准后的难度标签
   */
  function calibrateDifficulty(levels) {
    const analytics = getAllAnalytics();

    // 给每道题打分
    const scored = levels.map(level => {
      const data = analytics[level.id];
      let score = 0;
      let hasData = false;

      if (data && data.completions > 0) {
        score = data.difficultyScore;
        hasData = true;
      }

      return {
        ...level,
        calibratedScore: score,
        hasPlayerData: hasData
      };
    });

    // 按难度分排序（有玩家数据的优先用玩家数据，没有的保持原顺序）
    scored.sort((a, b) => {
      // 都有数据 → 按分数排
      if (a.hasPlayerData && b.hasPlayerData) {
        return a.calibratedScore - b.calibratedScore;
      }
      // 只有一个有数据 → 有数据的排前面（更可靠）
      if (a.hasPlayerData) return -1;
      if (b.hasPlayerData) return 1;
      // 都没数据 → 按原 id 排
      return a.id - b.id;
    });

    // 重新分配难度标签（三分法：前1/3简单，中间1/3中等，后1/3困难）
    const total = scored.length;
    const simpleEnd = Math.ceil(total / 3);
    const mediumEnd = Math.ceil(total * 2 / 3);

    return scored.map((level, index) => {
      let newDifficulty = level.difficulty;
      if (level.hasPlayerData) {
        if (index < simpleEnd) newDifficulty = '简单';
        else if (index < mediumEnd) newDifficulty = '中等';
        else newDifficulty = '困难';
      }
      return {
        ...level,
        calibratedDifficulty: newDifficulty
      };
    });
  }

  // ==========================================
  // 对战战绩
  // ==========================================

  function getBattleStats() {
    try {
      const raw = localStorage.getItem(BATTLE_KEY);
      return raw ? JSON.parse(raw) : {
        totalGames: 0,
        wins: 0,
        losses: 0,
        maxCombo: 0,
        totalAttacks: 0,
        byDifficulty: {
          easy: { wins: 0, losses: 0 },
          medium: { wins: 0, losses: 0 },
          hard: { wins: 0, losses: 0 }
        }
      };
    } catch (e) {
      return { totalGames: 0, wins: 0, losses: 0, maxCombo: 0, totalAttacks: 0, byDifficulty: {} };
    }
  }

  function recordBattle(result) {
    try {
      const stats = getBattleStats();
      stats.totalGames++;
      if (result.won) stats.wins++;
      else stats.losses++;
      if (result.maxCombo > stats.maxCombo) stats.maxCombo = result.maxCombo;
      stats.totalAttacks += result.attacks || 0;

      const diff = result.difficulty || 'medium';
      if (!stats.byDifficulty[diff]) {
        stats.byDifficulty[diff] = { wins: 0, losses: 0 };
      }
      if (result.won) stats.byDifficulty[diff].wins++;
      else stats.byDifficulty[diff].losses++;

      localStorage.setItem(BATTLE_KEY, JSON.stringify(stats));
      return stats;
    } catch (e) {
      console.warn('保存对战战绩失败：', e.message);
    }
  }

  // ==========================================
  // 教学模式相关存储
  // ==========================================

  const TEACHING_COMPLETE_KEY = KEY_PREFIX + 'teaching_complete';   // 教学关卡通关记录
  const TEACHING_PROGRESS_KEY = KEY_PREFIX + 'teaching_progress';   // 教学关卡进度
  const TEACHING_BADGES_KEY = KEY_PREFIX + 'teaching_badges';       // 徽章获得状态
  const TEACHING_CHAPTERS_KEY = KEY_PREFIX + 'teaching_chapters';   // 章节通关进度

  /**
   * 获取所有教学关卡通关记录
   * @returns {Object} { [levelId]: { completed, time, stars } }
   */
  function getTeachingCompleteAll() {
    try {
      const raw = localStorage.getItem(TEACHING_COMPLETE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 检查某教学关卡是否通关
   * @param {number|string} levelId
   * @returns {boolean}
   */
  function isTeachingLevelCompleted(levelId) {
    const all = getTeachingCompleteAll();
    return !!all[levelId];
  }

  /**
   * 获取某教学关卡通关记录
   * @param {number|string} levelId
   * @returns {Object|null}
   */
  function getTeachingCompleteRecord(levelId) {
    const all = getTeachingCompleteAll();
    return all[levelId] || null;
  }

  /**
   * 标记教学关卡通关
   * @param {number|string} levelId
   * @param {Object} data { time: seconds, stars?: number }
   */
  function markTeachingComplete(levelId, data) {
    try {
      const all = getTeachingCompleteAll();
      const existing = all[levelId];
      // 只在首次通关或更快通关时更新
      if (existing && data.time >= existing.time) {
        // 已有更快记录，但仍需更新星星数（如果更高）
        if (data.stars && (!existing.stars || data.stars > existing.stars)) {
          existing.stars = data.stars;
          all[levelId] = existing;
          localStorage.setItem(TEACHING_COMPLETE_KEY, JSON.stringify(all));
        }
        return;
      }
      all[levelId] = {
        completed: true,
        time: data.time,
        stars: data.stars || 3
      };
      localStorage.setItem(TEACHING_COMPLETE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('保存教学通关记录失败：', e.message);
    }
  }

  /**
   * 批量获取教学关卡通关状态
   * @param {Array} levelIds
   * @returns {Object} { [levelId]: { completed, time, stars } }
   */
  function getTeachingCompleteBatch(levelIds) {
    const all = getTeachingCompleteAll();
    const result = {};
    levelIds.forEach(id => {
      result[id] = all[id] || { completed: false, time: 0, stars: 0 };
    });
    return result;
  }

  /**
   * 保存教学关卡进度
   * @param {number|string} levelId
   * @param {Object} data { fillNums, candidates, time }
   */
  function saveTeachingProgress(levelId, data) {
    try {
      const all = getTeachingProgressAll();
      all[levelId] = data;
      localStorage.setItem(TEACHING_PROGRESS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('保存教学进度失败：', e.message);
    }
  }

  /**
   * 读取教学关卡进度
   * @param {number|string} levelId
   * @returns {Object|null}
   */
  function loadTeachingProgress(levelId) {
    const all = getTeachingProgressAll();
    return all[levelId] || null;
  }

  /**
   * 清除教学关卡进度
   * @param {number|string} levelId
   */
  function clearTeachingProgress(levelId) {
    try {
      const all = getTeachingProgressAll();
      delete all[levelId];
      localStorage.setItem(TEACHING_PROGRESS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('清除教学进度失败：', e.message);
    }
  }

  /**
   * 获取所有教学关卡进度
   */
  function getTeachingProgressAll() {
    try {
      const raw = localStorage.getItem(TEACHING_PROGRESS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 获取所有获得的徽章
   * @returns {Object} { [badgeId]: { earned, earnedAt, name } }
   */
  function getTeachingBadgesAll() {
    try {
      const raw = localStorage.getItem(TEACHING_BADGES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 检查某徽章是否已获得
   * @param {string} badgeId
   * @returns {boolean}
   */
  function hasBadge(badgeId) {
    const all = getTeachingBadgesAll();
    return !!all[badgeId] && all[badgeId].earned;
  }

  /**
   * 解锁徽章
   * @param {string} badgeId
   * @param {Object} data { name?: string }
   */
  function unlockBadge(badgeId, data = {}) {
    try {
      const all = getTeachingBadgesAll();
      if (all[badgeId] && all[badgeId].earned) return; // 已获得
      all[badgeId] = {
        earned: true,
        earnedAt: Date.now(),
        name: data.name || badgeId
      };
      localStorage.setItem(TEACHING_BADGES_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('解锁徽章失败：', e.message);
    }
  }

  /**
   * 获取章节通关进度
   * @returns {Object} { [chapterId]: { completedLevels: number, totalLevels: number, unlocked: boolean } }
   */
  function getChapterProgressAll() {
    try {
      const raw = localStorage.getItem(TEACHING_CHAPTERS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  /**
   * 获取某章节进度
   * @param {number|string} chapterId
   * @returns {Object|null}
   */
  function getChapterProgress(chapterId) {
    const all = getChapterProgressAll();
    return all[chapterId] || null;
  }

  /**
   * 保存章节进度
   * @param {number|string} chapterId
   * @param {Object} data
   */
  function saveChapterProgress(chapterId, data) {
    try {
      const all = getChapterProgressAll();
      all[chapterId] = { ...all[chapterId], ...data };
      localStorage.setItem(TEACHING_CHAPTERS_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('保存章节进度失败：', e.message);
    }
  }

  /**
   * 检查某章节是否解锁
   * @param {number|string} chapterId
   * @param {number} unlockRequirement - 解锁需要的前置章节通关数
   * @returns {boolean}
   */
  function isChapterUnlocked(chapterId, unlockRequirement = 0) {
    // 第一章默认解锁
    if (chapterId === 1 || chapterId === '1') return true;
    if (unlockRequirement === 0) return true;

    // 检查前一章节是否通关
    const prevChapterId = typeof chapterId === 'number' ? chapterId - 1 : (parseInt(chapterId) - 1);
    const progress = getChapterProgress(prevChapterId);
    if (!progress) return false;
    return progress.completedLevels >= unlockRequirement;
  }

  /**
   * 检查某教学关卡是否解锁
   * 第一关默认解锁，后续关卡需要前一关通关
   * @param {number|string} levelId
   * @param {Array} levelIdsInChapter - 该章节的所有关卡ID数组（按顺序）
   * @returns {boolean}
   */
  function isTeachingLevelUnlocked(levelId, levelIdsInChapter) {
    const idx = levelIdsInChapter.indexOf(String(levelId));
    if (idx === -1) {
      // 也尝试数字比较
      const numId = parseInt(levelId);
      const numIdx = levelIdsInChapter.findIndex(id => parseInt(id) === numId);
      if (numIdx === -1) return false;
      if (numIdx === 0) return true;
      const prevId = levelIdsInChapter[numIdx - 1];
      return isTeachingLevelCompleted(prevId);
    }
    if (idx === 0) return true; // 第一关默认解锁
    const prevId = levelIdsInChapter[idx - 1];
    return isTeachingLevelCompleted(prevId);
  }

  return {
    saveProgress,
    loadProgress,
    clearProgress,
    markComplete,
    isCompleted,
    getCompleteRecord,
    getStats,
    getCompleteBatch,
    saveSettings,
    getSettings,
    startSession,
    getSession,
    logAction,
    endSession,
    getAllAnalytics,
    getLevelAnalytics,
    calibrateDifficulty,
    getBattleStats,
    recordBattle,
    // 教学模式
    getTeachingCompleteAll,
    isTeachingLevelCompleted,
    getTeachingCompleteRecord,
    markTeachingComplete,
    getTeachingCompleteBatch,
    saveTeachingProgress,
    loadTeachingProgress,
    clearTeachingProgress,
    getTeachingBadgesAll,
    hasBadge,
    unlockBadge,
    getChapterProgressAll,
    getChapterProgress,
    saveChapterProgress,
    isChapterUnlocked,
    isTeachingLevelUnlocked
  };
})();

window.Storage = Storage;
