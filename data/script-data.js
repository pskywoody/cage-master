// ============================================================
//  ScriptData - 剧本数据加载与缓存模块
// ============================================================
//  负责：
//  - 加载 scripts.json（三周目完整剧本）
//  - 按 cycleId / levelId / chapterId 查找对话数据
//  - 将 scripts.json 的对话格式映射为 StoryEngine 可消费的格式
//  - 预留 i18n 国际化接口
// ============================================================

'use strict';

const ScriptData = (() => {
  const log = {
    info: (...args) => console.log('[ScriptData]', ...args),
    warn: (...args) => console.warn('[ScriptData]', ...args),
    error: (...args) => console.error('[ScriptData]', ...args),
  };

  // ============================================================
  //  内部状态
  // ============================================================

  let _rawData = null;
  let _loaded = false;
  let _loadingPromise = null;
  let _locale = 'zh-CN';
  const _translations = {};
  const SCRIPTS_URL = 'data/scripts/scripts.json';

  // v2.1：i18n——按语言加载剧本文件（scripts.{locale}.json，缺省回退 scripts.json）
  const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];

  // v2.1：speaker 名称显示层映射（剧本数据中的中文残留 → 当前语言）
  const SPEAKER_MAP = {
    'en-US': {
      '旁白': 'Narrator',
      '老师（留声）': 'Teacher (Recording)',
      '沈墨': 'Shen Mo',
    },
    'ja-JP': {
      '旁白': 'ナレーション',
      '老师（留声）': '先生（録音）',
      '沈墨': '沈墨',
    },
    'ko-KR': {
      '旁白': '나레이션',
      '老师（留声）': '선생님（녹음）',
      '沈墨': '심묵',
    },
  };

  function _mapSpeaker(speaker) {
    if (!speaker) return speaker;
    const map = SPEAKER_MAP[_locale];
    if (map && Object.prototype.hasOwnProperty.call(map, speaker)) return map[speaker];
    return speaker;
  }

  function _scriptsUrlFor(locale) {
    if (!locale || locale === 'zh-CN') return SCRIPTS_URL;
    return `data/scripts/scripts.${locale}.json`;
  }

  // ============================================================
  //  内部缓存
  // ============================================================

  const _cycleCache = new Map();
  const _chapterCache = new Map();
  const _levelDialogCache = new Map();

  // ============================================================
  //  对话行格式映射
  // ============================================================

  function _mapLine(line) {
    if (!line) return null;
    if (typeof line === 'string') {
      return { text: line, isNarration: true };
    }
    const result = {
      speaker: _mapSpeaker(line.speaker || ''),
      text: line.text || '',
      emotion: line.emotion || 'default',
      voiceId: line.vo || line.voiceId || null,
      action: line._action || line.action || null,
      sfx: line.sfx || null,
      bg: line.bg || null,
      cg: line.cg || null,
      pause: line.pause || 0,
      item: line.item || null,
      effect: line.effect || 0,
      type: line.type || null,
      subtitle: line.subtitle || null,
    };
    if (result.speaker === '旁白' || result.speaker === 'System' || result.speaker === '系统') {
      result.isNarration = true;
    }
    return result;
  }

  function _mapLines(lines) {
    if (!lines || !Array.isArray(lines)) return [];
    return lines.map(_mapLine).filter(Boolean);
  }

  // ============================================================
  //  数据加载与索引构建
  // ============================================================

  function _buildIndex() {
    _cycleCache.clear();
    _chapterCache.clear();
    _levelDialogCache.clear();

    const cycles = _rawData.cycles || [];
    cycles.forEach(cycle => {
      const cycleId = cycle.cycleId;
      _cycleCache.set(cycleId, cycle);

      (cycle.chapters || []).forEach(chapter => {
        const chapterId = chapter.chapterId;
        _chapterCache.set(`${cycleId}_${chapterId}`, chapter);

        (chapter.levels || []).forEach(level => {
          const levelId = level.levelId;
          if (!_levelDialogCache.has(levelId)) {
            _levelDialogCache.set(levelId, {
              preDialog: _mapLines(level.preDialog),
              clearDialog: _mapLines(level.clearDialog),
              cycleId,
              chapterId,
              title: level.title || '',
            });
          }
        });
      });
    });

    log.info(`Index built: ${_cycleCache.size} cycles, ${_chapterCache.size} chapters, ${_levelDialogCache.size} levels`);
  }

  async function load(options) {
    if (_loaded) return true;
    if (_loadingPromise) return _loadingPromise;

    // v2.1：页面加载时从 I18n 核心模块同步语言（语言切换后重载页面场景）
    if (typeof window !== 'undefined' && window.I18n && typeof window.I18n.getLocale === 'function') {
      const i18nLocale = window.I18n.getLocale();
      if (i18nLocale && SUPPORTED_LOCALES.indexOf(i18nLocale) >= 0) _locale = i18nLocale;
    }

    const url = (options && options.url) || _scriptsUrlFor(_locale);

    _loadingPromise = (async () => {
      try {
        log.info('Loading scripts from:', url);
        const response = await fetch(url);
        if (!response.ok) {
          // v2.1：目标语言剧本缺失时回退中文母本
          if (url !== SCRIPTS_URL) {
            log.warn('Locale scripts not found, falling back to zh-CN:', url);
            const fb = await fetch(SCRIPTS_URL);
            if (!fb.ok) throw new Error(`HTTP ${fb.status}: ${fb.statusText}`);
            _rawData = await fb.json();
          } else {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        } else {
          _rawData = await response.json();
        }
        _buildIndex();
        _loaded = true;
        log.info('Scripts loaded: version', _rawData.version);
        return true;
      } catch (err) {
        log.error('Failed to load scripts:', err);
        _rawData = null;
        _loaded = false;
        return false;
      } finally {
        _loadingPromise = null;
      }
    })();

    return _loadingPromise;
  }

  function isLoaded() {
    return _loaded;
  }

  /**
   * v2.1：重新加载剧本（语言切换后调用）。
   * 重置加载状态并按当前 _locale 重新 fetch。
   */
  async function reload() {
    _loaded = false;
    _rawData = null;
    _loadingPromise = null;
    return load();
  }

  // ============================================================
  //  查询接口
  // ============================================================

  function getDialogForLevel(levelId) {
    return _levelDialogCache.get(levelId) || null;
  }

  function getPreDialog(levelId) {
    const entry = _levelDialogCache.get(levelId);
    return entry ? entry.preDialog : [];
  }

  function getClearDialog(levelId) {
    const entry = _levelDialogCache.get(levelId);
    return entry ? entry.clearDialog : [];
  }

  function getChapterPrologue(cycleId, chapterId) {
    const chapter = _chapterCache.get(`${cycleId}_${chapterId}`);
    return chapter ? _mapLines(chapter.prologue) : [];
  }

  function getChapterEpilogue(cycleId, chapterId) {
    const chapter = _chapterCache.get(`${cycleId}_${chapterId}`);
    return chapter ? _mapLines(chapter.epilogue) : [];
  }

  function getChapterHiddenStory(cycleId, chapterId) {
    const chapter = _chapterCache.get(`${cycleId}_${chapterId}`);
    return chapter ? _mapLines(chapter.hiddenStory) : [];
  }

  function getCycle(cycleId) {
    return _cycleCache.get(cycleId) || null;
  }

  function getAllCycles() {
    return _rawData ? _rawData.cycles || [] : [];
  }

  function getLevelTitle(levelId) {
    const entry = _levelDialogCache.get(levelId);
    return entry ? entry.title : null;
  }

  function getLevelScriptContext(levelId) {
    const entry = _levelDialogCache.get(levelId);
    if (!entry) return null;
    return { cycleId: entry.cycleId, chapterId: entry.chapterId };
  }

  function getChapterBgm(cycleId, chapterId) {
    const chapter = _chapterCache.get(`${cycleId}_${chapterId}`);
    return chapter ? chapter.bgm || null : null;
  }

  function mapLine(line) {
    return _mapLine(line);
  }

  function mapLines(lines) {
    return _mapLines(lines);
  }

  // ============================================================
  //  i18n 国际化接口（v2.1：接入 I18n 核心模块）
  // ============================================================

  function setLocale(locale) {
    if (SUPPORTED_LOCALES.indexOf(locale) >= 0) _locale = locale;
    else _locale = 'zh-CN';
    log.info('Locale set to:', _locale);
  }

  function getLocale() {
    return _locale;
  }

  function t(key, params) {
    if (typeof window !== 'undefined' && window.I18n && typeof window.I18n.t === 'function') {
      return window.I18n.t(key, params);
    }
    return key;
  }

  function registerTranslations(translations) {
    Object.assign(_translations, translations || {});
    log.info(`Registered ${Object.keys(translations || {}).length} translations`);
  }

  // ============================================================
  //  调试辅助
  // ============================================================

  function getStatus() {
    return {
      loaded: _loaded,
      version: _rawData ? _rawData.version : null,
      cycles: _cycleCache.size,
      chapters: _chapterCache.size,
      levels: _levelDialogCache.size,
      locale: _locale,
    };
  }

  // ============================================================
  //  导出
  // ============================================================

  return {
    load, isLoaded, reload,
    getDialogForLevel, getPreDialog, getClearDialog,
    getChapterPrologue, getChapterEpilogue, getChapterHiddenStory,
    getCycle, getAllCycles, getLevelTitle, getLevelScriptContext, getChapterBgm,
    mapLine, mapLines,
    setLocale, getLocale, t, registerTranslations,
    getStatus,
  };
})();

if (typeof window !== 'undefined') {
  window.ScriptData = ScriptData;
}

export default ScriptData;
