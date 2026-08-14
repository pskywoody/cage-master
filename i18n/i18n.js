// ============================================================
//  i18n.js - 国际化核心模块（CM4）
// ============================================================
//  职责：
//  - 管理当前语言（zh-CN / en-US / ja-JP / ko-KR）
//  - 加载 i18n/locale/{locale}/ 下的语言包（ui/chapters/levels/boss/story）
//  - 提供 t(key, params) 翻译函数（回退链：当前语言 → zh-CN → key）
//  - 语言切换持久化（localStorage）与事件通知（cm4:localechange）
// ============================================================

'use strict';

const I18n = (() => {
  const SUPPORTED_LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'];
  const DEFAULT_LOCALE = 'zh-CN';
  const STORAGE_KEY = 'cm4_locale';
  const LOCALE_BASE = 'i18n/locale/';
  // 每个语言包由多个 JSON 文件合并而成（按需加载，缺省自动跳过）
  // 注：boss 台词与 story 剧本分别经 locale/{locale}/boss/battle.json 与 data/scripts/scripts.{locale}.json 独立加载，不在此处合并
  const DICT_FILES = ['ui', 'chapters', 'levels'];

  let _locale = DEFAULT_LOCALE;
  /** @type {Object<string, Object<string,string>>} 已加载语言包 { locale: { key: text } } */
  const _dicts = {};
  /** @type {Object<string, boolean>} 已加载标记 */
  const _loaded = {};
  /** @type {Object<string, Promise>} 加载中 Promise */
  const _loading = {};

  const log = {
    info: (...a) => console.log('[I18n]', ...a),
    warn: (...a) => console.warn('[I18n]', ...a),
    error: (...a) => console.error('[I18n]', ...a),
  };

  // ============================================================
  //  加载
  // ============================================================

  async function _loadDictFile(locale, name) {
    const url = `${LOCALE_BASE}${locale}/${name}.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  /**
   * 加载某语言的完整语言包（合并所有 DICT_FILES）。
   * 幂等：已加载则直接返回。
   */
  async function loadLocale(locale) {
    if (!SUPPORTED_LOCALES.includes(locale)) locale = DEFAULT_LOCALE;
    if (_loaded[locale]) return true;
    if (_loading[locale]) return _loading[locale];

    _loading[locale] = (async () => {
      const merged = {};
      for (const name of DICT_FILES) {
        const data = await _loadDictFile(locale, name);
        if (data && typeof data === 'object') {
          Object.assign(merged, data);
        }
      }
      _dicts[locale] = merged;
      _loaded[locale] = true;
      _loading[locale] = null;
      log.info(`Loaded locale pack: ${locale} (${Object.keys(merged).length} keys)`);
      return true;
    })();

    return _loading[locale];
  }

  // ============================================================
  //  语言管理
  // ============================================================

  function getLocale() {
    return _locale;
  }

  function isSupported(locale) {
    return SUPPORTED_LOCALES.includes(locale);
  }

  /**
   * 切换语言（持久化 + 通知）。
   * @param {string} locale
   * @param {boolean} [notify=true] 是否触发 cm4:localechange 事件
   */
  async function setLocale(locale, notify = true) {
    if (!SUPPORTED_LOCALES.includes(locale)) locale = DEFAULT_LOCALE;
    if (_locale === locale && _loaded[locale]) {
      if (notify) _notify();
      return true;
    }
    _locale = locale;
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) { /* ignore */ }
    await loadLocale(locale);
    if (notify) _notify();
    return true;
  }

  /**
   * 初始化：从 localStorage 恢复语言并加载语言包（不阻塞）。
   */
  function init() {
    let saved = null;
    try {
      if (typeof localStorage !== 'undefined') saved = localStorage.getItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
    if (saved && SUPPORTED_LOCALES.includes(saved)) {
      _locale = saved;
    } else {
      _locale = DEFAULT_LOCALE;
    }
    // 预加载当前语言包（异步，不阻塞启动）
    loadLocale(_locale);
    return _locale;
  }

  function _notify() {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      try {
        window.dispatchEvent(new CustomEvent('cm4:localechange', { detail: { locale: _locale } }));
      } catch (e) { /* ignore */ }
    }
  }

  // ============================================================
  //  翻译
  // ============================================================

  /**
   * 翻译 key。
   * 回退链：当前语言 → zh-CN → 原样返回 key。
   * @param {string} key
   * @param {Object} [params] 插值参数，如 { name: '沈墨' } 替换 {name}
   * @returns {string}
   */
  function t(key, params) {
    if (!key) return key;
    let str = (_dicts[_locale] || {})[key];
    if (str === undefined && _locale !== DEFAULT_LOCALE) {
      str = (_dicts[DEFAULT_LOCALE] || {})[key];
    }
    if (str === undefined) str = key;
    if (params && typeof params === 'object') {
      str = String(str).replace(/\{(\w+)\}/g, (m, name) =>
        Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : m);
    }
    return str;
  }

  /**
   * 判断某 key 在当前语言是否有翻译（不含回退）。
   */
  function has(key, locale) {
    const loc = locale || _locale;
    return !!(_dicts[loc] && _dicts[loc][key] !== undefined);
  }

  // ============================================================
  //  导出
  // ============================================================

  return {
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
    getLocale,
    setLocale,
    init,
    loadLocale,
    isSupported,
    t,
    has,
  };
})();

if (typeof window !== 'undefined') {
  window.I18n = I18n;
}

export default I18n;
