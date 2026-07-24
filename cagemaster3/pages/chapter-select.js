// ChapterSelect - 章节选择界面 + 进度持久化 + 多周目系统
// 深色学术风，与 Caged Cipher 整体风格一致

;(function(global) {
  'use strict';

  const STORAGE_KEY = 'cagedcipher_progress';

  // === chapters.json 缓存 ===
  let _cachedChapterData = null;
  let _chapterDataPromise = null;

  function getChapterData() {
    if (_cachedChapterData) {
      return Promise.resolve(_cachedChapterData);
    }
    if (_chapterDataPromise) {
      return _chapterDataPromise;
    }
    _chapterDataPromise = fetch('data/chapters.json')
      .then(res => res.json())
      .then(data => {
        _cachedChapterData = data;
        _chapterDataPromise = null;
        return data;
      })
      .catch(err => {
        _chapterDataPromise = null;
        throw err;
      });
    return _chapterDataPromise;
  }

  // === 印记定义 ===
  const SEAL_DEFS = [
    {
      id: 'flame',
      name: '炎之印记',
      icon: '🔥',
      levelId: 701,
      desc: '零错误 + 不使用提示',
      detail: '在第1隐藏关中，不犯任何错误且不使用提示，以纯粹的意志突破炎之试炼。',
      color: '#ef4444',
      element: 'fire'
    },
    {
      id: 'water',
      name: '水之印记',
      icon: '💧',
      levelId: 702,
      desc: '零错误 + 限时内完成',
      detail: '在第2隐藏关中，零错误且在时限内完成，如流水般流畅地解开谜题。',
      color: '#3b82f6',
      element: 'water'
    },
    {
      id: 'earth',
      name: '岩之印记',
      icon: '⛰️',
      levelId: 703,
      desc: '零错误 + 不使用笔记',
      detail: '在第3隐藏关中，零错误且不借助任何笔记，仅凭记忆与推演征服岩之考验。',
      color: '#a16207',
      element: 'earth'
    },
    {
      id: 'wind',
      name: '风之印记',
      icon: '🌪️',
      levelId: 704,
      desc: '零错误 + 不用提示 + 限时',
      detail: '在第4隐藏关中，零错误、不使用提示且限时完成，如风般迅捷无迹。',
      color: '#22c55e',
      element: 'wind'
    },
    {
      id: 'star',
      name: '星之印记',
      icon: '⭐',
      levelId: 705,
      desc: '全印记 + 真结局 + 零错误',
      detail: '集齐四枚元素印记，达成真结局，且以零错误通关最终隐藏关，获得星辰的认可。',
      color: '#fbbf24',
      element: 'star'
    }
  ];

  // 印记限时阈值（秒），根据关卡 gridSize 调整
  const SEAL_TIME_LIMITS = {
    702: 300,  // 水之印记：5分钟
    704: 240,  // 风之印记：4分钟
  };

  const ACHIEVEMENT_DEFS = {
    // === 进度类 ===
    first_clear: { id: 'first_clear', name: '初出茅庐', desc: '首次通关任意关卡', icon: '🎯', category: 'progress' },
    chapter2_clear: { id: 'chapter2_clear', name: '深入险境', desc: '通关第2章所有普通关卡', icon: '🔥', category: 'progress' },
    chapter3_clear: { id: 'chapter3_clear', name: '迷雾渐开', desc: '通关第3章所有普通关卡', icon: '🌫️', category: 'progress' },
    chapter4_clear: { id: 'chapter4_clear', name: '真相逼近', desc: '通关第4章所有普通关卡', icon: '🔍', category: 'progress' },
    chapter5_clear: { id: 'chapter5_clear', name: '终局将至', desc: '通关第5章所有普通关卡', icon: '⚔️', category: 'progress' },
    all_chapters_clear: { id: 'all_chapters_clear', name: '全线通关', desc: '通关全部8章普通关卡', icon: '👑', category: 'progress' },
    chapter1_s: { id: 'chapter1_s', name: '完美入门', desc: '第一章所有关卡S级通关', icon: '⭐', category: 'progress' },
    all_hidden: { id: 'all_hidden', name: '密信收藏家', desc: '解锁所有隐藏关', icon: '📜', category: 'progress' },

    // === 技巧类 ===
    no_hint_ch1: { id: 'no_hint_ch1', name: '独立思考', desc: '第一章某关不使用提示通关', icon: '🧠', category: 'skill' },
    first_rule45: { id: 'first_rule45', name: '星衡初悟', desc: '首次使用45法则推导出正确数字', icon: '⚖️', category: 'skill' },
    naked_pair_master: { id: 'naked_pair_master', name: '数对大师', desc: '使用裸数对技巧正确填数累计10次', icon: '🔗', category: 'skill' },
    pointing_pair_pro: { id: 'pointing_pair_pro', name: '区块专家', desc: '使用区块排除正确填数累计10次', icon: '🎯', category: 'skill' },
    cage_sum_expert: { id: 'cage_sum_expert', name: '笼和达人', desc: '使用笼和推导正确填数累计20次', icon: '🧮', category: 'skill' },
    note_master: { id: 'note_master', name: '笔记狂人', desc: '单关标记超过50个候选数', icon: '📝', category: 'skill' },

    // === 挑战类 ===
    speed_demon: { id: 'speed_demon', name: '疾风侦探', desc: '任意关卡在2分钟内完成', icon: '⚡', category: 'challenge' },
    speed_5min: { id: 'speed_5min', name: '神速解谜', desc: '5分钟内通关任意9×9关卡', icon: '🚀', category: 'challenge' },
    flawless_victory: { id: 'flawless_victory', name: '完美无瑕', desc: '单关零错误通关', icon: '💎', category: 'challenge' },
    no_hint_run: { id: 'no_hint_run', name: '连胜达人', desc: '连续3关不使用提示通关', icon: '🔥', category: 'challenge' },
    persistent: { id: 'persistent', name: '坚持不懈', desc: '累计游戏时长超过1小时', icon: '⏳', category: 'challenge' },
    true_ending: { id: 'true_ending', name: '星辰传人', desc: '达成真结局', icon: '✨', category: 'challenge' },
  };

  // === 进度管理 ===
  const ProgressManager = {
    _data: null,
    _onAchievementUnlock: null,

    load() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          this._data = JSON.parse(raw);
          // 迁移旧数据
          this._migrate();
        } else {
          this._data = this._defaultData();
        }
      } catch (e) {
        this._data = this._defaultData();
      }
      return this._data;
    },

    save() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
      } catch (e) {
        console.warn('[ProgressManager] Save failed:', e);
      }
    },

    _defaultData() {
      return {
        version: 4,
        currentCycle: 1,
        unlockedChapters: [1],
        levelScores: {},
        lastPlayedLevel: null,
        // 隐藏关解锁状态
        unlockedHiddenLevels: [],
        // 成就
        achievements: [],
        // 总提示次数（当前周目）
        totalHints: 0,
        // 真结局是否已达成
        trueEndingUnlocked: false,
        trueEndingCleared: false,
        // 累计游戏时长（秒）
        totalPlayTime: 0,
        // 技巧使用统计（用于技巧类成就）
        skillStats: {
          rule45Count: 0,
          nakedPairCount: 0,
          pointingPairCount: 0,
          cageSumCount: 0,
        },
        // 连续无提示通关数
        noHintStreak: 0,
        // 成就解锁时间（id -> timestamp）
        achievementTimes: {},
        // 印记系统
        seals: {},
      };
    },

    _migrate() {
      let changed = false;
      // 确保基础字段存在（版本1之前的旧数据）
      if (!this._data.levelScores) {
        this._data.levelScores = {};
        changed = true;
      }
      if (!this._data.unlockedChapters) {
        this._data.unlockedChapters = [1];
        changed = true;
      }
      if (typeof this._data.currentCycle !== 'number' || !this._data.currentCycle) {
        this._data.currentCycle = 1;
        changed = true;
      }
      if (!this._data.version || this._data.version < 2) {
        this._data.version = 2;
        if (!this._data.unlockedHiddenLevels) this._data.unlockedHiddenLevels = [];
        if (!this._data.achievements) this._data.achievements = [];
        if (typeof this._data.totalHints !== 'number') this._data.totalHints = 0;
        if (typeof this._data.trueEndingUnlocked !== 'boolean') this._data.trueEndingUnlocked = false;
        if (typeof this._data.trueEndingCleared !== 'boolean') this._data.trueEndingCleared = false;
        changed = true;
      }
      if (!this._data.version || this._data.version < 3) {
        this._data.version = 3;
        if (typeof this._data.totalPlayTime !== 'number') this._data.totalPlayTime = 0;
        if (!this._data.skillStats) {
          this._data.skillStats = {
            rule45Count: 0,
            nakedPairCount: 0,
            pointingPairCount: 0,
            cageSumCount: 0,
          };
        }
        if (typeof this._data.noHintStreak !== 'number') this._data.noHintStreak = 0;
        changed = true;
      }
      if (!this._data.version || this._data.version < 4) {
        this._data.version = 4;
        if (!this._data.seals || typeof this._data.seals !== 'object') {
          this._data.seals = {};
        }
        if (!this._data.achievementTimes || typeof this._data.achievementTimes !== 'object') {
          this._data.achievementTimes = {};
        }
        changed = true;
      }
      if (changed) this.save();
    },

    reset() {
      this._data = this._defaultData();
      this.save();
    },

    // 成就回调设置
    onAchievementUnlock(callback) {
      this._onAchievementUnlock = callback;
    },

    // 成就系统
    unlockAchievement(id) {
      if (!ACHIEVEMENT_DEFS[id]) return false;
      if (this._data.achievements.indexOf(id) !== -1) return false;
      this._data.achievements.push(id);
      // 记录解锁时间
      if (!this._data.achievementTimes) this._data.achievementTimes = {};
      this._data.achievementTimes[id] = Date.now();
      this.save();
      if (this._onAchievementUnlock) {
        try { this._onAchievementUnlock(ACHIEVEMENT_DEFS[id]); } catch (e) {}
      }
      return true;
    },

    hasAchievement(id) {
      return this._data.achievements.indexOf(id) !== -1;
    },

    getAchievements() {
      return this._data.achievements.slice();
    },

    getAchievementDefs() {
      return ACHIEVEMENT_DEFS;
    },

    getAchievementUnlockTime(id) {
      if (!this._data.achievementTimes) return null;
      return this._data.achievementTimes[id] || null;
    },

    // 总提示次数
    addHintCount(count) {
      this._data.totalHints += count || 1;
      this.save();
    },

    getTotalHints() {
      return this._data.totalHints || 0;
    },

    resetTotalHints() {
      this._data.totalHints = 0;
      this.save();
    },

    // 累计游戏时长
    addPlayTime(seconds) {
      this._data.totalPlayTime = (this._data.totalPlayTime || 0) + (seconds || 0);
      this.save();
    },

    getTotalPlayTime() {
      return this._data.totalPlayTime || 0;
    },

    // 技巧使用统计
    addSkillCount(skillName, count) {
      if (!this._data.skillStats) {
        this._data.skillStats = {
          rule45Count: 0,
          nakedPairCount: 0,
          pointingPairCount: 0,
          cageSumCount: 0,
        };
      }
      const key = skillName + 'Count';
      if (typeof this._data.skillStats[key] === 'number') {
        this._data.skillStats[key] += count || 1;
        this.save();
      }
    },

    getSkillCount(skillName) {
      if (!this._data.skillStats) return 0;
      const key = skillName + 'Count';
      return this._data.skillStats[key] || 0;
    },

    // 连续无提示通关
    getNoHintStreak() {
      return this._data.noHintStreak || 0;
    },

    incrementNoHintStreak() {
      this._data.noHintStreak = (this._data.noHintStreak || 0) + 1;
      this.save();
      return this._data.noHintStreak;
    },

    resetNoHintStreak() {
      this._data.noHintStreak = 0;
      this.save();
    },

    // 章节解锁
    isChapterUnlocked(chapterId) {
      return this._data.unlockedChapters.indexOf(chapterId) !== -1;
    },

    unlockChapter(chapterId) {
      if (!this.isChapterUnlocked(chapterId)) {
        this._data.unlockedChapters.push(chapterId);
        this._data.unlockedChapters.sort((a, b) => a - b);
        this.save();
      }
    },

    // 关卡成绩
    getLevelScore(levelId, cycle) {
      if (!this._data || !this._data.levelScores) return null;
      const key = cycle ? levelId + '_c' + cycle : levelId;
      return this._data.levelScores[key] || null;
    },

    setLevelScore(levelId, score) {
      if (!this._data) return false;
      if (!this._data.levelScores) this._data.levelScores = {};
      const cycle = this._data.currentCycle || 1;
      const key = levelId + '_c' + cycle;
      const existing = this._data.levelScores[key];
      // 只保存更好的成绩（更高评级或相同评级但更快）
      if (!existing || this._isBetterScore(score, existing)) {
        this._data.levelScores[key] = score;
        this.save();
        return true;
      }
      return false;
    },

    // 设置上次游玩关卡
    setLastPlayedLevel(levelId) {
      this._data.lastPlayedLevel = levelId;
      this.save();
    },

    getLastPlayedLevel() {
      return this._data.lastPlayedLevel;
    },

    _isBetterScore(newScore, oldScore) {
      const gradeOrder = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
      const newGrade = gradeOrder[newScore.grade] || 0;
      const oldGrade = gradeOrder[oldScore.grade] || 0;
      if (newGrade !== oldGrade) return newGrade > oldGrade;
      return newScore.time < oldScore.time;
    },

    // 章节通关状态
    getChapterGrade(chapterId, chaptersData) {
      const cycle = this._data.currentCycle;
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return null;

      let worstGrade = null;
      let allCleared = true;
      for (const lvl of chapter.levels) {
        const score = this.getLevelScore(lvl.levelId, cycle);
        if (!score) {
          allCleared = false;
          break;
        }
        if (!worstGrade || this._gradeRank(score.grade) < this._gradeRank(worstGrade)) {
          worstGrade = score.grade;
        }
      }
      return allCleared ? worstGrade : null;
    },

    _gradeRank(grade) {
      const order = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
      return order[grade] || 0;
    },

    _findChapter(chapterId, chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return null;
      for (const ch of chaptersData.chapters) {
        if (ch.chapterId === chapterId) return ch;
      }
      return null;
    },

    // 周目相关
    getCurrentCycle() {
      return this._data.currentCycle;
    },

    setCurrentCycle(cycle) {
      this._data.currentCycle = cycle;
      this.save();
    },

    // 检查是否可以进入下一周目（所有章节至少D级通关）
    canAdvanceCycle(chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return false;
      for (const ch of chaptersData.chapters) {
        const grade = this.getChapterGrade(ch.chapterId, chaptersData);
        if (!grade || this._gradeRank(grade) < this._gradeRank('D')) {
          return false;
        }
      }
      return true;
    },

    // 下一周目
    advanceCycle() {
      this._data.currentCycle++;
      this.save();
      return this._data.currentCycle;
    },

    // === 隐藏关系统 ===
    isHiddenLevelUnlocked(levelId) {
      return this._data.unlockedHiddenLevels.indexOf(levelId) !== -1;
    },

    unlockHiddenLevel(levelId) {
      if (this.isHiddenLevelUnlocked(levelId)) return false;
      this._data.unlockedHiddenLevels.push(levelId);
      this.save();
      // 检查是否所有隐藏关都已解锁
      this._checkAllHiddenUnlocked();
      return true;
    },

    _checkAllHiddenUnlocked() {
      // 此方法需要 chaptersData，在 ChapterSelect 中调用检查
    },

    // 获取某章的普通关卡列表（过滤隐藏关）
    getNormalLevels(chapter) {
      if (!chapter || !chapter.levels) return [];
      return chapter.levels.filter(function(lvl) { return !lvl.isHidden; });
    },

    // 获取某章的隐藏关卡列表
    getHiddenLevels(chapter) {
      if (!chapter || !chapter.levels) return [];
      return chapter.levels.filter(function(lvl) { return lvl.isHidden; });
    },

    // 检查某章普通关卡是否全部S级
    isChapterAllS(chapterId, chaptersData) {
      const cycle = this._data.currentCycle;
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return false;
      const normalLevels = chapter.levels.filter(function(lvl) { return !lvl.isHidden; });
      if (normalLevels.length === 0) return false;
      for (const lvl of normalLevels) {
        const score = this.getLevelScore(lvl.levelId, cycle);
        if (!score || score.grade !== 'S') return false;
      }
      return true;
    },

    // 检查某章普通关卡是否全部通关
    isChapterCleared(chapterId, chaptersData) {
      const cycle = this._data.currentCycle;
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return false;
      const normalLevels = chapter.levels.filter(function(lvl) { return !lvl.isHidden; });
      if (normalLevels.length === 0) return false;
      for (const lvl of normalLevels) {
        const score = this.getLevelScore(lvl.levelId, cycle);
        if (!score) return false;
      }
      return true;
    },

    // 检查所有章节普通关卡是否全部通关
    isAllChaptersCleared(chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return false;
      for (const ch of chaptersData.chapters) {
        if (!this.isChapterCleared(ch.chapterId, chaptersData)) return false;
      }
      return true;
    },

    // 检查并解锁某章的隐藏关（满足条件自动解锁）
    checkAndUnlockHiddenLevels(chapterId, chaptersData) {
      const chapter = this._findChapter(chapterId, chaptersData);
      if (!chapter || !chapter.levels) return [];
      const unlocked = [];
      const cycle = this._data.currentCycle;

      for (const lvl of chapter.levels) {
        if (!lvl.isHidden) continue;
        if (this.isHiddenLevelUnlocked(lvl.levelId)) continue;

        // 条件1：本章所有普通关卡S级通关
        const allS = this.isChapterAllS(chapterId, chaptersData);
        // 条件2：二周目以上自动解锁（可选配置，默认关闭）
        const cycleUnlock = lvl.hiddenUnlockType === 'cycle' && cycle >= 2;
        // 条件3：特定关卡不使用提示通关（此处简化为检查本章S级，具体在guide.js中触发）

        if (allS || cycleUnlock) {
          this.unlockHiddenLevel(lvl.levelId);
          unlocked.push(lvl.levelId);
        }
      }
      return unlocked;
    },

    // 获取所有隐藏关总数
    getTotalHiddenCount(chaptersData) {
      if (!chaptersData || !chaptersData.chapters) return 0;
      let count = 0;
      for (const ch of chaptersData.chapters) {
        if (ch.levels) {
          for (const lvl of ch.levels) {
            if (lvl.isHidden) count++;
          }
        }
      }
      return count;
    },

    // 获取已解锁隐藏关数量
    getUnlockedHiddenCount() {
      return this._data.unlockedHiddenLevels.length;
    },

    // 检查是否所有隐藏关都已通关
    areAllHiddenCleared(chaptersData) {
      const cycle = this._data.currentCycle;
      if (!chaptersData || !chaptersData.chapters) return false;
      for (const ch of chaptersData.chapters) {
        if (!ch.levels) continue;
        for (const lvl of ch.levels) {
          if (lvl.isHidden) {
            const score = this.getLevelScore(lvl.levelId, cycle);
            if (!score) return false;
          }
        }
      }
      return true;
    },

    // === 真结局系统 ===
    isTrueEndingUnlocked() {
      return this._data.trueEndingUnlocked === true;
    },

    isTrueEndingCleared() {
      return this._data.trueEndingCleared === true;
    },

    setTrueEndingCleared() {
      this._data.trueEndingCleared = true;
      this.save();
      this.unlockAchievement('true_ending');
    },

    // 真结局解锁条件检查
    checkTrueEndingUnlock(chaptersData) {
      if (this._data.trueEndingUnlocked) return false;
      const cycle = this._data.currentCycle;
      if (cycle < 2) return false; // 二周目以上

      // 条件1：所有章节通关（不含真结局章本身）
      const normalChapters = (chaptersData && chaptersData.chapters)
        ? chaptersData.chapters.filter(function(ch) { return !ch.isTrueEnding; })
        : [];
      for (const ch of normalChapters) {
        const grade = this.getChapterGrade(ch.chapterId, chaptersData);
        if (!grade || this._gradeRank(grade) < this._gradeRank('D')) {
          return false;
        }
      }

      // 条件2：所有隐藏关全部通关
      if (!this.areAllHiddenCleared(chaptersData)) return false;

      // 条件3：总提示次数不超过阈值（20次）
      if (this._data.totalHints > 20) return false;

      // 全部满足，解锁真结局
      this._data.trueEndingUnlocked = true;
      // 解锁第8章
      this.unlockChapter(8);
      this.save();
      return true;
    },

    // 周目难度修正
    getCycleModifiers() {
      const cycle = this._data.currentCycle;
      if (cycle <= 1) {
        return { hintMultiplier: 1.0, errorPenalty: 0.15, timeMultiplier: 1.0, label: '一周目' };
      } else if (cycle === 2) {
        return { hintMultiplier: 0.5, errorPenalty: 0.25, timeMultiplier: 0.75, label: '二周目' };
      } else {
        return { hintMultiplier: 0.5, errorPenalty: 0.30, timeMultiplier: 0.6, label: '第' + cycle + '周目' };
      }
    },

    // === 印记系统 ===

    getSealDefs() {
      return SEAL_DEFS;
    },

    getSealDef(sealId) {
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        if (SEAL_DEFS[i].id === sealId) return SEAL_DEFS[i];
      }
      return null;
    },

    // 根据关卡 ID 查找对应印记定义
    getSealDefByLevel(levelId) {
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        if (SEAL_DEFS[i].levelId === levelId) return SEAL_DEFS[i];
      }
      return null;
    },

    isSealUnlocked(sealId) {
      if (!this._data.seals) return false;
      return this._data.seals[sealId] !== undefined &&
             this._data.seals[sealId] !== null;
    },

    getUnlockedSeals() {
      const result = [];
      if (!this._data.seals) return result;
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        const def = SEAL_DEFS[i];
        if (this.isSealUnlocked(def.id)) {
          result.push({
            id: def.id,
            name: def.name,
            icon: def.icon,
            levelId: def.levelId,
            desc: def.desc,
            unlockedAt: this._data.seals[def.id].unlockedAt,
            levelScore: this._data.seals[def.id].levelScore
          });
        }
      }
      return result;
    },

    getUnlockedSealCount() {
      let count = 0;
      for (let i = 0; i < SEAL_DEFS.length; i++) {
        if (this.isSealUnlocked(SEAL_DEFS[i].id)) count++;
      }
      return count;
    },

    unlockSeal(sealId, levelScore) {
      const def = this.getSealDef(sealId);
      if (!def) return false;
      if (this.isSealUnlocked(sealId)) return false;

      if (!this._data.seals) this._data.seals = {};
      this._data.seals[sealId] = {
        unlockedAt: Date.now(),
        levelScore: levelScore || null
      };
      this.save();

      // 触发回调
      if (this._onSealUnlock) {
        try { this._onSealUnlock(def); } catch (e) {}
      }

      return true;
    },

    onSealUnlock(callback) {
      this._onSealUnlock = callback;
    },

    /**
     * 检查印记条件
     * @param {number|string} sealId - 印记 ID 或 关卡 ID
     * @param {Object} stats - 本关统计数据 { errors, hints, timeSeconds, usedNotes, levelId }
     * @returns {boolean} 是否满足条件
     */
    checkSealCondition(sealId, stats) {
      // 如果传入的是关卡 ID，先查找对应印记
      let def = this.getSealDef(sealId);
      if (!def) {
        def = this.getSealDefByLevel(parseInt(sealId));
      }
      if (!def) return false;

      const errors = stats.errors || 0;
      const hints = stats.hints || 0;
      const timeSeconds = stats.timeSeconds || 0;
      const usedNotes = stats.usedNotes || false;

      // 所有印记的基础条件：零错误
      if (errors > 0) return false;

      switch (def.id) {
        case 'flame':
          // 炎之印记：零错误 + 不用提示
          return hints === 0;

        case 'water':
          // 水之印记：零错误 + 限时内完成
          {
            const timeLimit = SEAL_TIME_LIMITS[def.levelId] || 300;
            return timeSeconds > 0 && timeSeconds <= timeLimit;
          }

        case 'earth':
          // 岩之印记：零错误 + 不使用笔记
          return !usedNotes;

        case 'wind':
          // 风之印记：零错误 + 不用提示 + 限时
          {
            const timeLimit = SEAL_TIME_LIMITS[def.levelId] || 240;
            return hints === 0 && timeSeconds > 0 && timeSeconds <= timeLimit;
          }

        case 'star':
          // 星之印记：全印记 + 真结局 + 零错误
          {
            // 检查是否已解锁其他四枚元素印记
            const elementSeals = ['flame', 'water', 'earth', 'wind'];
            let allElements = true;
            for (let i = 0; i < elementSeals.length; i++) {
              if (!this.isSealUnlocked(elementSeals[i])) {
                allElements = false;
                break;
              }
            }
            // 真结局已达成
            const trueEnding = this.isTrueEndingCleared();
            return allElements && trueEnding;
          }

        default:
          return false;
      }
    },

    // 获取印记限时（用于 UI 显示）
    getSealTimeLimit(sealId) {
      const def = this.getSealDef(sealId);
      if (!def) return null;
      return SEAL_TIME_LIMITS[def.levelId] || null;
    },
  };

  // === ChapterSelect 类 ===
  class ChapterSelect {
    constructor(options) {
      this.options = options || {};
      this.onSelectLevel = this.options.onSelectLevel || function() {};
      this.chaptersData = null;
      this.container = null;
      this.expandedChapter = null;
      this._isVisible = false;
    }

    // 加载章节数据
    async loadChapters() {
      try {
        this.chaptersData = await getChapterData();
        return this.chaptersData;
      } catch (e) {
        console.error('[ChapterSelect] Failed to load chapters:', e);
        return null;
      }
    }

    // 显示章节选择
    show() {
      if (this._isVisible) return;
      this._isVisible = true;
      ProgressManager.load();

      if (!this.container) {
        this._buildDOM();
      }

      // 检查隐藏关和真结局解锁
      this._checkAllUnlocks();

      this._render();
      const overlay = document.getElementById('chapter-select-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        requestAnimationFrame(() => {
          overlay.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
          overlay.style.opacity = '1';
          overlay.style.transform = 'translateX(0)';
        });
      }
    }

    // 隐藏
    hide() {
      if (!this._isVisible) return;
      this._isVisible = false;
      const overlay = document.getElementById('chapter-select-overlay');
      if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transform = 'translateX(-30px)';
        setTimeout(() => {
          overlay.style.display = 'none';
        }, 400);
      }
    }

    // 构建 DOM
    _buildDOM() {
      const overlay = document.createElement('div');
      overlay.id = 'chapter-select-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.98);z-index:22000;display:none;' +
        'flex-direction:column;align-items:center;overflow-y:auto;' +
        'opacity:0;transform:translateX(-30px);backdrop-filter:blur(8px);';

      // 顶部栏
      const header = document.createElement('div');
      header.id = 'cs-header';
      header.style.cssText = 'width:100%;max-width:900px;padding:24px 20px 16px;' +
        'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;';

      const titleWrap = document.createElement('div');
      titleWrap.innerHTML = '<div style="font-size:24px;font-weight:900;color:#f1f5f9;' +
        'letter-spacing:4px;">章节选择</div>' +
        '<div id="cs-cycle-label" style="font-size:13px;color:#64748b;' +
        'margin-top:4px;letter-spacing:2px;">一周目</div>';

      const closeBtn = document.createElement('button');
      closeBtn.id = 'cs-close-btn';
      closeBtn.textContent = '✕';
      closeBtn.style.cssText = 'width:40px;height:40px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:8px;cursor:pointer;' +
        'font-size:18px;transition:all 0.2s;';
      closeBtn.addEventListener('mouseenter', () => {
        closeBtn.style.background = '#334155';
        closeBtn.style.color = '#f1f5f9';
      });
      closeBtn.addEventListener('mouseleave', () => {
        closeBtn.style.background = '#1e293b';
        closeBtn.style.color = '#94a3b8';
      });
      closeBtn.addEventListener('click', () => this.hide());

      // 成就按钮
      const achBtn = document.createElement('button');
      achBtn.id = 'cs-achievement-btn';
      achBtn.textContent = '🏆';
      achBtn.title = '成就';
      achBtn.style.cssText = 'width:40px;height:40px;border:1px solid #334155;' +
        'background:#1e293b;color:#fbbf24;border-radius:8px;cursor:pointer;' +
        'font-size:18px;transition:all 0.2s;margin-right:8px;';
      achBtn.addEventListener('mouseenter', () => {
        achBtn.style.background = '#334155';
        achBtn.style.borderColor = '#fbbf24';
      });
      achBtn.addEventListener('mouseleave', () => {
        achBtn.style.background = '#1e293b';
        achBtn.style.borderColor = '#334155';
      });
      achBtn.addEventListener('click', () => this._showAchievementPanel());

      // 印记按钮
      const sealBtn = document.createElement('button');
      sealBtn.id = 'cs-seal-btn';
      sealBtn.textContent = '✦';
      sealBtn.title = '印记';
      sealBtn.style.cssText = 'width:40px;height:40px;border:1px solid #334155;' +
        'background:#1e293b;color:#a855f7;border-radius:8px;cursor:pointer;' +
        'font-size:18px;font-weight:900;transition:all 0.2s;margin-right:8px;';
      sealBtn.addEventListener('mouseenter', () => {
        sealBtn.style.background = '#334155';
        sealBtn.style.borderColor = '#a855f7';
        sealBtn.style.textShadow = '0 0 10px rgba(168,85,247,0.8)';
      });
      sealBtn.addEventListener('mouseleave', () => {
        sealBtn.style.background = '#1e293b';
        sealBtn.style.borderColor = '#334155';
        sealBtn.style.textShadow = 'none';
      });
      sealBtn.addEventListener('click', () => this._showSealPanel());

      const btnGroup = document.createElement('div');
      btnGroup.style.cssText = 'display:flex;gap:8px;';
      btnGroup.appendChild(sealBtn);
      btnGroup.appendChild(achBtn);
      btnGroup.appendChild(closeBtn);

      header.appendChild(titleWrap);
      header.appendChild(btnGroup);
      overlay.appendChild(header);

      // 章节网格
      const grid = document.createElement('div');
      grid.id = 'cs-chapter-grid';
      grid.style.cssText = 'width:100%;max-width:900px;padding:0 20px 40px;' +
        'display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));' +
        'gap:16px;';
      overlay.appendChild(grid);

      // 周目切换区
      const cycleBar = document.createElement('div');
      cycleBar.id = 'cs-cycle-bar';
      cycleBar.style.cssText = 'width:100%;max-width:900px;padding:0 20px 20px;' +
        'display:flex;justify-content:center;gap:12px;flex-wrap:wrap;';
      overlay.appendChild(cycleBar);

      // 底部信息
      const footer = document.createElement('div');
      footer.style.cssText = 'width:100%;max-width:900px;padding:16px 20px 32px;' +
        'text-align:center;font-size:12px;color:#475569;letter-spacing:2px;';
      footer.textContent = 'CAGED CIPHER · 档案侦探记录';
      overlay.appendChild(footer);

      document.body.appendChild(overlay);

      this.container = overlay;
    }

    // 渲染
    _render() {
      if (!this.chaptersData || !this.chaptersData.chapters) return;

      const mods = ProgressManager.getCycleModifiers();
      const cycleLabel = document.getElementById('cs-cycle-label');
      if (cycleLabel) {
        cycleLabel.textContent = mods.label +
          (ProgressManager.getCurrentCycle() > 1 ? ' · 提示×' + mods.hintMultiplier + ' · 错误×' + (mods.errorPenalty / 0.15).toFixed(1) : '');
      }

      const grid = document.getElementById('cs-chapter-grid');
      if (!grid) return;
      grid.innerHTML = '';

      for (const ch of this.chaptersData.chapters) {
        // 真结局章只有解锁后才显示
        if (ch.isTrueEnding && !ProgressManager.isTrueEndingUnlocked()) continue;
        const card = this._createChapterCard(ch);
        grid.appendChild(card);
      }

      // 渲染周目切换
      this._renderCycleBar();
    }

    _createChapterCard(chapter) {
      const unlocked = ProgressManager.isChapterUnlocked(chapter.chapterId);
      const grade = ProgressManager.getChapterGrade(chapter.chapterId, this.chaptersData);
      const normalLevels = ProgressManager.getNormalLevels(chapter);
      const levelCount = normalLevels.length;
      const hiddenLevels = ProgressManager.getHiddenLevels(chapter);
      const hiddenUnlocked = hiddenLevels.filter(function(lvl) {
        return ProgressManager.isHiddenLevelUnlocked(lvl.levelId);
      }).length;
      const hasHiddenUnlocked = hiddenUnlocked > 0;
      const color = chapter.color || '#64748b';
      const isTrueEnding = chapter.isTrueEnding === true;

      const card = document.createElement('div');
      card.className = 'cs-chapter-card';
      card.dataset.chapterId = chapter.chapterId;
      card.style.cssText = 'background:rgba(30,41,59,0.8);border:1px solid ' +
        (unlocked ? color + '40' : '#1e293b') + ';' +
        'border-radius:12px;padding:20px;cursor:' + (unlocked ? 'pointer' : 'not-allowed') + ';' +
        'transition:all 0.3s ease;position:relative;overflow:hidden;' +
        (unlocked ? '' : 'opacity:0.5;') +
        (isTrueEnding ? 'box-shadow:0 0 20px rgba(251,191,36,0.2);' : '');

      // 顶部色条
      const colorBar = document.createElement('div');
      colorBar.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:3px;' +
        'background:' + (unlocked ? color : '#334155') + ';';
      card.appendChild(colorBar);

      // 真结局标记
      if (isTrueEnding && ProgressManager.isTrueEndingCleared()) {
        const teBadge = document.createElement('div');
        teBadge.style.cssText = 'position:absolute;top:10px;right:10px;' +
          'font-size:12px;padding:2px 8px;border-radius:4px;' +
          'background:rgba(251,191,36,0.2);color:#fbbf24;' +
          'border:1px solid rgba(251,191,36,0.4);letter-spacing:1px;';
        teBadge.textContent = '真结局 ✓';
        card.appendChild(teBadge);
      }

      // 章节编号 + 标题
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px;';
      header.innerHTML =
        '<span style="font-size:13px;color:' + (unlocked ? color : '#475569') +
        ';font-weight:700;letter-spacing:2px;">第' + this._cnNum(chapter.chapterId) + '章</span>' +
        (grade ? '<span class="cs-grade-badge" style="font-size:20px;font-weight:900;color:' +
          this._gradeColor(grade) + ';margin-left:auto;text-shadow:0 0 10px currentColor;">' +
          grade + '</span>' : '') +
        (!unlocked ? '<span style="margin-left:auto;font-size:20px;">🔒</span>' : '');
      card.appendChild(header);

      // 标题
      const title = document.createElement('div');
      title.style.cssText = 'font-size:20px;font-weight:700;color:#f1f5f9;' +
        'margin-bottom:6px;letter-spacing:1px;';
      title.textContent = chapter.title || '未命名章节';
      card.appendChild(title);

      // 副标题
      if (chapter.subtitle) {
        const subtitle = document.createElement('div');
        subtitle.style.cssText = 'font-size:12px;color:#64748b;margin-bottom:12px;letter-spacing:1px;';
        subtitle.textContent = chapter.subtitle;
        card.appendChild(subtitle);
      }

      // 关卡数量 + 隐藏关标记
      const info = document.createElement('div');
      info.style.cssText = 'font-size:13px;color:#94a3b8;display:flex;gap:16px;flex-wrap:wrap;';
      info.innerHTML = '<span>📜 ' + levelCount + ' 关</span>' +
        '<span id="cs-progress-' + chapter.chapterId + '">' +
        this._getChapterProgress(chapter) + '</span>' +
        (hasHiddenUnlocked ? '<span style="color:#fbbf24;">✨ 隐藏关已解锁</span>' : '');
      card.appendChild(info);

      // 描述
      if (chapter.description && unlocked) {
        const desc = document.createElement('div');
        desc.style.cssText = 'font-size:12px;color:#64748b;margin-top:12px;' +
          'line-height:1.6;max-height:0;overflow:hidden;transition:max-height 0.3s;';
        desc.className = 'cs-chapter-desc';
        desc.textContent = chapter.description;
        card.appendChild(desc);
      }

      // 关卡列表（展开时显示）
      const levelList = document.createElement('div');
      levelList.className = 'cs-level-list';
      levelList.style.cssText = 'margin-top:0;max-height:0;overflow:hidden;' +
        'transition:max-height 0.4s ease, margin-top 0.3s;display:flex;' +
        'flex-direction:column;gap:6px;';
      levelList.id = 'cs-levels-' + chapter.chapterId;
      card.appendChild(levelList);

      // 交互
      if (unlocked) {
        card.addEventListener('click', (e) => {
          // 如果点击的是关卡列表内部，不触发展开/收起
          if (e.target.closest('.cs-level-item')) return;
          this._toggleChapter(chapter.chapterId);
        });
        card.addEventListener('mouseenter', () => {
          card.style.borderColor = color + '80';
          card.style.transform = 'translateY(-2px)';
          card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.3)';
        });
        card.addEventListener('mouseleave', () => {
          card.style.borderColor = color + '40';
          card.style.transform = 'translateY(0)';
          card.style.boxShadow = 'none';
        });
      }

      return card;
    }

    _toggleChapter(chapterId) {
      const levelList = document.getElementById('cs-levels-' + chapterId);
      const desc = document.querySelector(
        '[data-chapter-id="' + chapterId + '"] .cs-chapter-desc'
      );

      if (this.expandedChapter === chapterId) {
        // 收起
        if (levelList) {
          levelList.style.maxHeight = '0';
          levelList.style.marginTop = '0';
        }
        if (desc) desc.style.maxHeight = '0';
        this.expandedChapter = null;
      } else {
        // 先收起之前展开的
        if (this.expandedChapter !== null) {
          const prevList = document.getElementById('cs-levels-' + this.expandedChapter);
          const prevDesc = document.querySelector(
            '[data-chapter-id="' + this.expandedChapter + '"] .cs-chapter-desc'
          );
          if (prevList) {
            prevList.style.maxHeight = '0';
            prevList.style.marginTop = '0';
          }
          if (prevDesc) prevDesc.style.maxHeight = '0';
        }

        // 展开当前
        this._populateLevelList(chapterId);
        if (levelList) {
          levelList.style.maxHeight = '600px';
          levelList.style.marginTop = '12px';
        }
        if (desc) desc.style.maxHeight = '100px';
        this.expandedChapter = chapterId;
      }
    }

    _populateLevelList(chapterId) {
      const levelList = document.getElementById('cs-levels-' + chapterId);
      if (!levelList) return;
      levelList.innerHTML = '';

      const chapter = this._findChapter(chapterId);
      if (!chapter || !chapter.levels) return;

      const cycle = ProgressManager.getCurrentCycle();
      const normalLevels = ProgressManager.getNormalLevels(chapter);
      const hiddenLevels = ProgressManager.getHiddenLevels(chapter);

      // 普通关卡
      for (let i = 0; i < normalLevels.length; i++) {
        const lvl = normalLevels[i];
        const item = this._createLevelItem(lvl, i + 1, false, cycle);
        levelList.appendChild(item);
      }

      // 隐藏关（已解锁的才显示）
      const unlockedHidden = hiddenLevels.filter(function(lvl) {
        return ProgressManager.isHiddenLevelUnlocked(lvl.levelId);
      });
      if (unlockedHidden.length > 0) {
        const divider = document.createElement('div');
        divider.style.cssText = 'display:flex;align-items:center;gap:8px;' +
          'margin:8px 4px 4px;color:#fbbf24;font-size:12px;letter-spacing:2px;';
        divider.innerHTML = '<span style="flex:1;height:1px;' +
          'background:linear-gradient(to right,transparent,rgba(251,191,36,0.4));"></span>' +
          '✨ 隐藏关卡' +
          '<span style="flex:1;height:1px;' +
          'background:linear-gradient(to left,transparent,rgba(251,191,36,0.4));"></span>';
        levelList.appendChild(divider);

        for (let i = 0; i < unlockedHidden.length; i++) {
          const lvl = unlockedHidden[i];
          const item = this._createLevelItem(lvl, i + 1, true, cycle);
          levelList.appendChild(item);
        }
      }
    }

    _createLevelItem(lvl, idx, isHidden, cycle) {
      const score = ProgressManager.getLevelScore(lvl.levelId, cycle);
      const grade = score ? score.grade : null;

      const item = document.createElement('div');
      item.className = 'cs-level-item';
      item.dataset.levelId = lvl.levelId;
      item.style.cssText = 'display:flex;align-items:center;gap:10px;' +
        'padding:10px 14px;background:rgba(15,23,42,0.6);' +
        'border:1px solid ' + (isHidden ? 'rgba(251,191,36,0.3)' : '#334155') + ';' +
        'border-radius:8px;cursor:pointer;transition:all 0.2s;';

      const numLabel = (isHidden ? '★' : String(idx).padStart(2, '0'));
      item.innerHTML =
        '<span style="font-size:13px;font-weight:700;color:' +
        (isHidden ? '#fbbf24' : '#64748b') + ';min-width:28px;">' +
        numLabel + '</span>' +
        '<span style="flex:1;font-size:14px;color:' +
        (isHidden ? '#fef3c7' : '#cbd5e1') + ';">' +
        (lvl.title || ('第' + idx + '关')) + '</span>' +
        (grade ? '<span style="font-size:16px;font-weight:900;color:' +
          this._gradeColor(grade) + ';">' + grade + '</span>' :
          '<span style="font-size:12px;color:#475569;">未通关</span>');

      const self = this;
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        self._selectLevel(lvl.levelId);
      });
      item.addEventListener('mouseenter', function() {
        item.style.background = isHidden
          ? 'rgba(251,191,36,0.1)' : 'rgba(51,65,85,0.8)';
        item.style.borderColor = isHidden
          ? 'rgba(251,191,36,0.6)' : '#475569';
      });
      item.addEventListener('mouseleave', function() {
        item.style.background = 'rgba(15,23,42,0.6)';
        item.style.borderColor = isHidden
          ? 'rgba(251,191,36,0.3)' : '#334155';
      });

      return item;
    }

    _selectLevel(levelId) {
      this.hide();
      setTimeout(() => {
        this.onSelectLevel(levelId);
      }, 300);
    }

    _renderCycleBar() {
      const bar = document.getElementById('cs-cycle-bar');
      if (!bar) return;
      bar.innerHTML = '';

      const currentCycle = ProgressManager.getCurrentCycle();
      const canAdvance = ProgressManager.canAdvanceCycle(this.chaptersData);

      // 周目选择按钮
      for (let c = 1; c <= currentCycle; c++) {
        const btn = document.createElement('button');
        btn.style.cssText = 'padding:8px 20px;border:1px solid ' +
          (c === currentCycle ? '#fbbf24' : '#334155') + ';' +
          'background:' + (c === currentCycle ? 'rgba(251,191,36,0.1)' : '#1e293b') + ';' +
          'color:' + (c === currentCycle ? '#fbbf24' : '#94a3b8') + ';' +
          'border-radius:20px;cursor:pointer;font-size:13px;letter-spacing:1px;' +
          'transition:all 0.2s;';
        btn.textContent = '第' + this._cnNum(c) + '周目';
        btn.addEventListener('click', () => {
          ProgressManager.setCurrentCycle(c);
          this._render();
        });
        bar.appendChild(btn);
      }

      // 新周目解锁按钮
      if (canAdvance) {
        const newBtn = document.createElement('button');
        newBtn.style.cssText = 'padding:8px 20px;border:1px dashed #22c55e;' +
          'background:rgba(34,197,94,0.1);color:#22c55e;' +
          'border-radius:20px;cursor:pointer;font-size:13px;letter-spacing:1px;' +
          'transition:all 0.2s;';
        newBtn.textContent = '开启第' + this._cnNum(currentCycle + 1) + '周目 ✦';
        newBtn.addEventListener('click', () => {
          const next = ProgressManager.advanceCycle();
          this._render();
          // 显示新周目提示
          this._showCycleStartToast(next);
        });
        bar.appendChild(newBtn);
      }
    }

    _showCycleStartToast(cycle) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:50%;left:50%;' +
        'transform:translate(-50%,-50%);background:rgba(15,23,42,0.95);' +
        'border:2px solid #fbbf24;border-radius:16px;padding:40px 60px;' +
        'text-align:center;z-index:23000;opacity:0;transition:opacity 0.5s;' +
        'box-shadow:0 0 60px rgba(251,191,36,0.3);';
      toast.innerHTML =
        '<div style="font-size:14px;color:#64748b;letter-spacing:8px;margin-bottom:16px;">NEW GAME+</div>' +
        '<div style="font-size:36px;font-weight:900;color:#fbbf24;' +
        'letter-spacing:6px;margin-bottom:20px;text-shadow:0 0 20px rgba(251,191,36,0.5);">' +
        '第' + this._cnNum(cycle) + '周目</div>' +
        '<div style="font-size:14px;color:#94a3b8;line-height:2;">' +
        '提示次数减半<br>错误惩罚加重<br>评级标准更严</div>';
      document.body.appendChild(toast);

      requestAnimationFrame(() => { toast.style.opacity = '1'; });
      setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 500);
      }, 2500);
    }

    // 工具方法
    _findChapter(chapterId) {
      if (!this.chaptersData || !this.chaptersData.chapters) return null;
      for (const ch of this.chaptersData.chapters) {
        if (ch.chapterId === chapterId) return ch;
      }
      return null;
    }

    _getChapterProgress(chapter) {
      const cycle = ProgressManager.getCurrentCycle();
      const normalLevels = ProgressManager.getNormalLevels(chapter);
      if (normalLevels.length === 0) return '0/0';
      let cleared = 0;
      for (const lvl of normalLevels) {
        if (ProgressManager.getLevelScore(lvl.levelId, cycle)) cleared++;
      }
      return cleared + '/' + normalLevels.length;
    }

    // 检查所有解锁（隐藏关 + 真结局）
    _checkAllUnlocks() {
      if (!this.chaptersData || !this.chaptersData.chapters) return;
      let newHiddenUnlocked = [];
      for (const ch of this.chaptersData.chapters) {
        if (ch.isTrueEnding) continue;
        const unlocked = ProgressManager.checkAndUnlockHiddenLevels(ch.chapterId, this.chaptersData);
        newHiddenUnlocked = newHiddenUnlocked.concat(unlocked);
      }
      // 检查 all_hidden 成就
      if (ProgressManager.getUnlockedHiddenCount() > 0 &&
          ProgressManager.getUnlockedHiddenCount() >= ProgressManager.getTotalHiddenCount(this.chaptersData)) {
        ProgressManager.unlockAchievement('all_hidden');
      }
      // 检查 chapter1_s 成就
      if (ProgressManager.isChapterAllS(1, this.chaptersData)) {
        ProgressManager.unlockAchievement('chapter1_s');
      }
      // 检查真结局解锁
      const teUnlocked = ProgressManager.checkTrueEndingUnlock(this.chaptersData);
      if (teUnlocked) {
        this._showTrueEndingUnlockToast();
      }
      // 显示新解锁隐藏关提示
      if (newHiddenUnlocked.length > 0) {
        this._showHiddenUnlockToast(newHiddenUnlocked.length);
      }
    }

    _showHiddenUnlockToast(count) {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:30%;left:50%;' +
        'transform:translate(-50%,-50%);background:rgba(15,23,42,0.95);' +
        'border:2px solid #fbbf24;border-radius:12px;padding:24px 40px;' +
        'text-align:center;z-index:23000;opacity:0;transition:opacity 0.5s;' +
        'box-shadow:0 0 40px rgba(251,191,36,0.3);';
      toast.innerHTML =
        '<div style="font-size:14px;color:#64748b;letter-spacing:4px;margin-bottom:12px;">HIDDEN UNLOCKED</div>' +
        '<div style="font-size:24px;font-weight:900;color:#fbbf24;' +
        'letter-spacing:3px;margin-bottom:8px;">✨ 隐藏关已解锁 ✨</div>' +
        '<div style="font-size:13px;color:#94a3b8;">发现 ' + count + ' 个新的隐藏关卡</div>';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.style.opacity = '1'; });
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 500);
      }, 2000);
    }

    _showTrueEndingUnlockToast() {
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;top:30%;left:50%;' +
        'transform:translate(-50%,-50%);background:radial-gradient(ellipse at center,rgba(251,191,36,0.2) 0%,rgba(15,23,42,0.95) 70%);' +
        'border:2px solid #fbbf24;border-radius:16px;padding:32px 48px;' +
        'text-align:center;z-index:23000;opacity:0;transition:opacity 0.8s;' +
        'box-shadow:0 0 60px rgba(251,191,36,0.5);';
      toast.innerHTML =
        '<div style="font-size:14px;color:#fbbf24;letter-spacing:8px;margin-bottom:16px;">TRUE ENDING UNLOCKED</div>' +
        '<div style="font-size:28px;font-weight:900;color:#fbbf24;' +
        'letter-spacing:4px;margin-bottom:12px;text-shadow:0 0 20px rgba(251,191,36,0.5);">真结局已解锁</div>' +
        '<div style="font-size:13px;color:#94a3b8;line-height:1.8;">星辰之门已开启<br>最终的真相在等着你</div>';
      document.body.appendChild(toast);
      requestAnimationFrame(function() { toast.style.opacity = '1'; });
      setTimeout(function() {
        toast.style.opacity = '0';
        setTimeout(function() { toast.remove(); }, 800);
      }, 3000);
    }

    // 成就面板
    _showAchievementPanel() {
      const existing = document.getElementById('cs-achievement-panel');
      if (existing) {
        existing.style.display = 'flex';
        requestAnimationFrame(function() { existing.style.opacity = '1'; });
        return;
      }

      const panel = document.createElement('div');
      panel.id = 'cs-achievement-panel';
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.98);z-index:24000;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'opacity:0;transition:opacity 0.3s;backdrop-filter:blur(8px);';

      const content = document.createElement('div');
      content.style.cssText = 'width:90%;max-width:500px;background:rgba(30,41,59,0.9);' +
        'border:1px solid #334155;border-radius:16px;padding:32px;' +
        'max-height:80vh;overflow-y:auto;';

      const header = document.createElement('div');
      header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;';
      header.innerHTML =
        '<div style="font-size:22px;font-weight:900;color:#f1f5f9;letter-spacing:3px;">🏆 成就</div>' +
        '<button id="cs-ach-close" style="width:36px;height:36px;border:1px solid #334155;' +
        'background:#1e293b;color:#94a3b8;border-radius:8px;cursor:pointer;' +
        'font-size:16px;transition:all 0.2s;">✕</button>';
      content.appendChild(header);

      const defs = ProgressManager.getAchievementDefs();
      const unlocked = ProgressManager.getAchievements();
      const defKeys = Object.keys(defs);
      const stats = document.createElement('div');
      stats.style.cssText = 'font-size:13px;color:#64748b;margin-bottom:16px;letter-spacing:1px;';
      stats.textContent = '已解锁 ' + unlocked.length + ' / ' + defKeys.length + ' 个成就';
      content.appendChild(stats);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      for (const key of defKeys) {
        const def = defs[key];
        const isUnlocked = unlocked.indexOf(key) !== -1;
        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 16px;' +
          'background:' + (isUnlocked ? 'rgba(251,191,36,0.08)' : 'rgba(15,23,42,0.6)') + ';' +
          'border:1px solid ' + (isUnlocked ? 'rgba(251,191,36,0.3)' : '#334155') + ';' +
          'border-radius:8px;transition:all 0.2s;';
        item.innerHTML =
          '<div style="font-size:28px;opacity:' + (isUnlocked ? '1' : '0.3') + ';">' + def.icon + '</div>' +
          '<div style="flex:1;">' +
          '<div style="font-size:15px;font-weight:700;color:' + (isUnlocked ? '#fbbf24' : '#64748b') + ';' +
          'margin-bottom:2px;">' + def.name + '</div>' +
          '<div style="font-size:12px;color:' + (isUnlocked ? '#94a3b8' : '#475569') + ';">' + def.desc + '</div>' +
          '</div>' +
          (isUnlocked ? '<div style="color:#22c55e;font-size:12px;font-weight:700;">✓ 已解锁</div>' :
           '<div style="color:#475569;font-size:12px;">未解锁</div>');
        list.appendChild(item);
      }
      content.appendChild(list);
      panel.appendChild(content);
      document.body.appendChild(panel);

      document.getElementById('cs-ach-close').addEventListener('click', function() {
        panel.style.opacity = '0';
        setTimeout(function() { panel.style.display = 'none'; }, 300);
      });

      requestAnimationFrame(function() { panel.style.opacity = '1'; });
    }

    // 印记面板
    _showSealPanel() {
      const existing = document.getElementById('cs-seal-panel');
      if (existing) {
        existing.style.display = 'flex';
        requestAnimationFrame(function() { existing.style.opacity = '1'; });
        return;
      }

      const sealDefs = ProgressManager.getSealDefs();
      const unlockedCount = ProgressManager.getUnlockedSealCount();

      const panel = document.createElement('div');
      panel.id = 'cs-seal-panel';
      panel.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
        'background:rgba(15,23,42,0.98);z-index:24000;display:flex;' +
        'flex-direction:column;align-items:center;justify-content:center;' +
        'opacity:0;transition:opacity 0.4s ease;backdrop-filter:blur(12px);';

      const content = document.createElement('div');
      content.style.cssText = 'width:90%;max-width:560px;background:rgba(30,41,59,0.95);' +
        'border:1px solid rgba(168,85,247,0.2);border-radius:20px;padding:36px 28px 28px;' +
        'max-height:85vh;overflow-y:auto;' +
        'box-shadow:0 0 60px rgba(168,85,247,0.15),inset 0 1px 0 rgba(255,255,255,0.05);';

      // 头部
      const header = document.createElement('div');
      header.style.cssText = 'text-align:center;margin-bottom:24px;';
      header.innerHTML =
        '<div style="font-size:28px;font-weight:900;color:#f1f5f9;' +
        'letter-spacing:6px;margin-bottom:8px;">✦ 印记圣坛 ✦</div>' +
        '<div style="font-size:13px;color:#a855f7;letter-spacing:2px;">' +
        'SEAL SHRINE · 已觉醒 ' + unlockedCount + ' / ' + sealDefs.length + '</div>' +
        '<div style="width:60px;height:2px;background:linear-gradient(90deg,transparent,#a855f7,transparent);' +
        'margin:16px auto 0;"></div>';
      content.appendChild(header);

      // 印记圆环展示
      const sealRing = document.createElement('div');
      sealRing.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);' +
        'gap:10px;margin-bottom:24px;justify-items:center;';

      for (let i = 0; i < sealDefs.length; i++) {
        const def = sealDefs[i];
        const isUnlocked = ProgressManager.isSealUnlocked(def.id);
        const sealData = isUnlocked ? ProgressManager._data.seals[def.id] : null;

        const sealItem = document.createElement('div');
        sealItem.style.cssText =
          'width:100%;aspect-ratio:1;' +
          'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
          'border-radius:50%;cursor:pointer;transition:all 0.3s ease;position:relative;' +
          'background:' + (isUnlocked
            ? 'radial-gradient(circle,' + def.color + '20 0%,transparent 70%)'
            : 'rgba(15,23,42,0.8)') + ';' +
          'border:2px solid ' + (isUnlocked ? def.color + '60' : '#334155') + ';';

        sealItem.innerHTML =
          '<div style="font-size:32px;' + (isUnlocked ? '' : 'filter:grayscale(100%) opacity(0.3);') +
          'text-shadow:' + (isUnlocked ? '0 0 20px ' + def.color + '80' : 'none') + ';">' +
          (isUnlocked ? def.icon : '❓') + '</div>' +
          '<div style="font-size:10px;margin-top:4px;letter-spacing:1px;' +
          'color:' + (isUnlocked ? def.color : '#475569') + ';font-weight:700;">' +
          (isUnlocked ? def.name : '???') + '</div>';

        sealItem.addEventListener('mouseenter', function() {
          sealItem.style.transform = 'scale(1.1)';
          if (isUnlocked) {
            sealItem.style.boxShadow = '0 0 20px ' + def.color + '60';
          }
        });
        sealItem.addEventListener('mouseleave', function() {
          sealItem.style.transform = 'scale(1)';
          sealItem.style.boxShadow = 'none';
        });
        sealItem.addEventListener('click', function() {
          showSealDetail(def, isUnlocked, sealData);
        });

        sealRing.appendChild(sealItem);
      }
      content.appendChild(sealRing);

      // 分割线
      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;background:linear-gradient(90deg,transparent,#334155,transparent);margin:8px 0 20px;';
      content.appendChild(divider);

      // 印记列表（详细）
      const listTitle = document.createElement('div');
      listTitle.style.cssText = 'font-size:13px;color:#64748b;letter-spacing:2px;margin-bottom:12px;';
      listTitle.textContent = '印记图鉴';
      content.appendChild(listTitle);

      const list = document.createElement('div');
      list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      for (let i = 0; i < sealDefs.length; i++) {
        const def = sealDefs[i];
        const isUnlocked = ProgressManager.isSealUnlocked(def.id);
        const sealData = isUnlocked ? ProgressManager._data.seals[def.id] : null;

        const item = document.createElement('div');
        item.style.cssText = 'display:flex;align-items:center;gap:14px;padding:14px 16px;' +
          'background:' + (isUnlocked
            ? 'linear-gradient(135deg,' + def.color + '15,rgba(30,41,59,0.6))'
            : 'rgba(15,23,42,0.6)') + ';' +
          'border:1px solid ' + (isUnlocked ? def.color + '40' : '#1e293b') + ';' +
          'border-radius:12px;transition:all 0.2s;cursor:pointer;';
        item.innerHTML =
          '<div style="font-size:32px;flex-shrink:0;width:44px;text-align:center;' +
          (isUnlocked ? '' : 'filter:grayscale(100%) opacity(0.3);') + '">' +
          (isUnlocked ? def.icon : '🔒') + '</div>' +
          '<div style="flex:1;min-width:0;">' +
          '<div style="font-size:15px;font-weight:700;color:' +
          (isUnlocked ? def.color : '#475569') + ';margin-bottom:3px;">' +
          (isUnlocked ? def.name : '未知印记') + '</div>' +
          '<div style="font-size:12px;color:' + (isUnlocked ? '#94a3b8' : '#334155') + ';">' +
          (isUnlocked ? def.desc : '完成对应隐藏关的挑战以解锁') + '</div>' +
          (isUnlocked && sealData && sealData.unlockedAt
            ? '<div style="font-size:11px;color:#64748b;margin-top:4px;">' +
              '获得时间：' + new Date(sealData.unlockedAt).toLocaleDateString('zh-CN') +
              '</div>'
            : '') +
          '</div>' +
          (isUnlocked
            ? '<div style="color:' + def.color + ';font-size:12px;font-weight:900;' +
              'padding:4px 10px;border:1px solid ' + def.color + '40;border-radius:20px;' +
              'background:' + def.color + '10;">✦ 已觉醒</div>'
            : '<div style="color:#475569;font-size:11px;padding:4px 8px;' +
              'border:1px solid #334155;border-radius:20px;">未解锁</div>');

        item.addEventListener('mouseenter', function() {
          item.style.transform = 'translateX(4px)';
          if (isUnlocked) {
            item.style.borderColor = def.color + '70';
          }
        });
        item.addEventListener('mouseleave', function() {
          item.style.transform = 'translateX(0)';
          item.style.borderColor = isUnlocked ? def.color + '40' : '#1e293b';
        });
        item.addEventListener('click', function() {
          showSealDetail(def, isUnlocked, sealData);
        });

        list.appendChild(item);
      }
      content.appendChild(list);

      // 关闭按钮
      const closeWrap = document.createElement('div');
      closeWrap.style.cssText = 'text-align:center;margin-top:24px;';
      closeWrap.innerHTML =
        '<button id="cs-seal-close" style="padding:10px 32px;' +
        'background:rgba(168,85,247,0.1);border:1px solid rgba(168,85,247,0.3);' +
        'color:#a855f7;border-radius:20px;cursor:pointer;font-size:13px;' +
        'letter-spacing:2px;transition:all 0.2s;">关 闭</button>';
      content.appendChild(closeWrap);

      panel.appendChild(content);
      document.body.appendChild(panel);

      document.getElementById('cs-seal-close').addEventListener('click', function() {
        panel.style.opacity = '0';
        setTimeout(function() { panel.style.display = 'none'; }, 400);
      });

      panel.addEventListener('click', function(e) {
        if (e.target === panel) {
          panel.style.opacity = '0';
          setTimeout(function() { panel.style.display = 'none'; }, 400);
        }
      });

      requestAnimationFrame(function() { panel.style.opacity = '1'; });

      // 印记详情弹窗
      function showSealDetail(def, isUnlocked, sealData) {
        const oldDetail = document.getElementById('cs-seal-detail');
        if (oldDetail) oldDetail.remove();

        const detail = document.createElement('div');
        detail.id = 'cs-seal-detail';
        detail.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
          'z-index:25000;display:flex;align-items:center;justify-content:center;' +
          'background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);' +
          'opacity:0;transition:opacity 0.3s ease;';

        const box = document.createElement('div');
        box.style.cssText = 'width:85%;max-width:360px;background:rgba(15,23,42,0.98);' +
          'border:2px solid ' + (isUnlocked ? def.color + '60' : '#334155') + ';' +
          'border-radius:16px;padding:32px 24px;text-align:center;' +
          'box-shadow:0 0 40px ' + (isUnlocked ? def.color + '30' : 'rgba(0,0,0,0.5)') + ';' +
          'transform:scale(0.9);transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1);';

        const iconSize = isUnlocked ? '80px' : '60px';
        const iconFilter = isUnlocked ? '' : 'grayscale(100%) opacity(0.3)';

        box.innerHTML =
          '<div style="font-size:' + iconSize + ';margin-bottom:16px;filter:' + iconFilter + ';' +
          (isUnlocked ? 'text-shadow:0 0 30px ' + def.color + '80;' : '') + '">' +
          (isUnlocked ? def.icon : '🔒') + '</div>' +
          '<div style="font-size:22px;font-weight:900;color:' +
          (isUnlocked ? def.color : '#475569') + ';letter-spacing:4px;margin-bottom:8px;">' +
          (isUnlocked ? def.name : '???') + '</div>' +
          '<div style="font-size:11px;color:#64748b;letter-spacing:2px;margin-bottom:16px;">' +
          (isUnlocked ? 'SEAL · ' + def.element.toUpperCase() : 'SEAL · UNKNOWN') + '</div>' +
          '<div style="height:1px;background:linear-gradient(90deg,transparent,' +
          (isUnlocked ? def.color + '60' : '#334155') + ',transparent);margin-bottom:16px;"></div>' +
          '<div style="font-size:13px;color:#94a3b8;line-height:1.8;margin-bottom:8px;">' +
          (isUnlocked ? def.detail : '神秘的印记，蕴含着未知的力量。<br>完成对应隐藏关的完美挑战以觉醒此印记。') +
          '</div>' +
          (isUnlocked && sealData && sealData.unlockedAt
            ? '<div style="font-size:11px;color:#64748b;margin-top:16px;padding-top:12px;' +
              'border-top:1px dashed #334155;">' +
              '觉醒于 ' + new Date(sealData.unlockedAt).toLocaleString('zh-CN') +
              '</div>'
            : '') +
          '<button style="margin-top:20px;padding:8px 28px;' +
          'background:' + (isUnlocked ? def.color + '20' : '#1e293b') + ';' +
          'border:1px solid ' + (isUnlocked ? def.color + '50' : '#334155') + ';' +
          'color:' + (isUnlocked ? def.color : '#64748b') + ';border-radius:20px;' +
          'cursor:pointer;font-size:12px;letter-spacing:2px;transition:all 0.2s;">知 道 了</button>';

        detail.appendChild(box);
        document.body.appendChild(detail);

        const closeBtn = box.querySelector('button');
        function closeDetail() {
          detail.style.opacity = '0';
          box.style.transform = 'scale(0.9)';
          setTimeout(function() { detail.remove(); }, 300);
        }
        closeBtn.addEventListener('click', closeDetail);
        detail.addEventListener('click', function(e) {
          if (e.target === detail) closeDetail();
        });

        requestAnimationFrame(function() {
          detail.style.opacity = '1';
          box.style.transform = 'scale(1)';
        });
      }
    }

    _gradeColor(grade) {
      const colors = {
        S: '#fbbf24',
        A: '#22c55e',
        B: '#3b82f6',
        C: '#a855f7',
        D: '#ef4444',
      };
      return colors[grade] || '#64748b';
    }

    _cnNum(n) {
      const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
      if (n <= 10) return map[n];
      if (n < 20) return '十' + map[n - 10];
      return String(n);
    }
  }

  // 暴露
  global.ChapterSelect = ChapterSelect;
  global.ProgressManager = ProgressManager;

})(window);
