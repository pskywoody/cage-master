// ==========================================
// ResourceManager v1 - 按需加载管理器
// 统一管理所有资源（关卡数据/立绘/题库）的按需加载与缓存
// 支持首包瘦身：首包只加载第1-2章 + 入门/简单题库
// ==========================================

const ResourceManager = (function() {
  const _cache = new Map();
  const _loading = new Map();

  // ---------- 内部加载器 ----------
  async function _fetchJSON(url) {
    if (_cache.has(url)) return _cache.get(url);
    if (_loading.has(url)) return _loading.get(url);

    const promise = fetch(url + '?v=' + (window.CONFIG ? Date.now() : 1))
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(data => {
        _cache.set(url, data);
        _loading.delete(url);
        return data;
      })
      .catch(e => {
        _loading.delete(url);
        console.warn('[ResourceManager] 加载失败:', url, e.message);
        return null;
      });

    _loading.set(url, promise);
    return promise;
  }

  // ---------- 关卡数据加载 ----------

  /**
   * 加载故事模式章节数据
   * 策略：首包仅含第1-2章，后续章节按需
   */
  async function loadChapter(chapterId) {
    const key = 'chapter_' + chapterId;
    if (_cache.has(key)) return _cache.get(key);

    // 尝试加载全量chapters.json
    const allChapters = await _fetchJSON('data/chapters.json');
    if (!allChapters) return null;

    const chapter = Array.isArray(allChapters)
      ? allChapters.find(ch => String(ch.chapterId) === String(chapterId))
      : null;

    if (chapter) _cache.set(key, chapter);
    return chapter || null;
  }

  /**
   * 获取所有章节元信息（不含关卡数据，轻量）
   */
  async function getChaptersMeta() {
    return await _fetchJSON('data/chapters.json');
  }

  /**
   * 加载杀手数独题库（按难度分包）
   * 策略：首包只加载入门+简单，高难度按需
   */
  async function loadKillerPuzzles(difficulty) {
    if (!difficulty) {
      // 加载全量（fallback）
      return await _fetchJSON('data/levels-killer.json');
    }
    // 按难度从分包加载
    const packUrl = 'data/packs/killer-' + difficulty + '.json';
    return await _fetchJSON(packUrl);
  }

  /**
   * 加载经典数独题库
   */
  async function loadClassicPuzzles() {
    return await _fetchJSON('data/levels.json');
  }

  // ---------- 立绘加载 ----------

  const _portraitCache = new Map();
  const PORTRAIT_BASE = 'assets/images/portraits/';

  /**
   * 预加载角色立绘（确保在剧情播放前加载好）
   * @param {string} charId - 角色ID
   * @param {string[]} emotions - 需预加载的表情列表
   */
  function preloadPortraits(charId, emotions) {
    emotions = emotions || ['default', 'smile', 'angry', 'surprised', 'sad', 'think'];
    emotions.forEach(emotion => {
      const key = charId + '_' + emotion;
      if (_portraitCache.has(key)) return;
      const img = new Image();
      img.src = PORTRAIT_BASE + key + '.jpg';
      _portraitCache.set(key, img);
    });
  }

  /**
   * 获取立绘URL
   */
  function getPortraitUrl(charId, emotion) {
    emotion = emotion || 'default';
    return PORTRAIT_BASE + charId + '_' + emotion + '.jpg';
  }

  // ---------- 资源预加载 ----------

  /**
   * 预加载后续章节（玩家玩当前章时后台悄悄加载）
   */
  function preloadNextChapter(currentChapterId) {
    const nextId = parseInt(currentChapterId) + 1;
    if (nextId > 7) return;
    setTimeout(() => {
      loadChapter(nextId).then(data => {
        if (data) console.log('[ResourceManager] 预加载第' + nextId + '章完成');
      });
    }, 3000);
  }

  /**
   * 预加载高难度题库（玩家玩简单时后台加载中等）
   */
  function preloadNextDifficulty(currentDiff) {
    const diffOrder = ['入门', '简单', '中等', '困难', '地狱'];
    const idx = diffOrder.indexOf(currentDiff);
    if (idx < 0 || idx >= diffOrder.length - 1) return;
    const nextDiff = diffOrder[idx + 1];
    setTimeout(() => {
      loadKillerPuzzles(nextDiff).then(data => {
        if (data) console.log('[ResourceManager] 预加载' + nextDiff + '题库完成');
      });
    }, 5000);
  }

  // ---------- 缓存管理 ----------

  function clearCache() {
    _cache.clear();
    _loading.clear();
  }

  function getCacheSize() {
    let size = 0;
    _cache.forEach((v, k) => size += JSON.stringify(v).length);
    return (size / 1024).toFixed(1) + 'KB';
  }

  // ---------- 清除旧数据文件（辅助） ----------

  function getAvailablePacks() {
    return ['入门', '简单', '中等', '困难', '地狱'];
  }

  return {
    loadChapter,
    getChaptersMeta,
    loadKillerPuzzles,
    loadClassicPuzzles,
    preloadPortraits,
    getPortraitUrl,
    preloadNextChapter,
    preloadNextDifficulty,
    clearCache,
    getCacheSize,
    getAvailablePacks,
    _cache,
    _portraitCache
  };
})();

// 导出到全局
if (typeof window !== 'undefined') {
  window.ResourceManager = ResourceManager;
  if (window.CONFIG && window.CONFIG.debug) {
    console.log('[ResourceManager] 已加载，可用API：', Object.keys(ResourceManager));
  }
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ResourceManager;
}
