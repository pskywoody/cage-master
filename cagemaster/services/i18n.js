/**
 * 多语言国际化系统 (i18n)
 * 支持中文(zh-CN)、日语(ja)、韩语(ko)、英语(en)
 * 使用方法：t('key') 或 t('key', {param: value})
 */
(function(global) {
  'use strict';

  const I18N = {
    locale: 'zh-CN',
    fallback: 'zh-CN',
    messages: {},
    supportedLocales: ['zh-CN', 'ja', 'ko', 'en'],
    
    /**
     * 初始化i18n系统
     * @param {string} locale - 语言代码
     */
    async init(locale) {
      // 从本地存储读取语言设置
      const saved = this._getSavedLocale();
      this.locale = locale || saved || this._detectBrowserLocale() || 'zh-CN';
      
      // 加载语言包
      await this.loadLocale(this.locale);
      
      console.log(`🌐 i18n initialized: ${this.locale}`);
      return this;
    },
    
    /**
     * 检测浏览器语言
     */
    _detectBrowserLocale() {
      const lang = (navigator.language || navigator.userLanguage || 'zh-CN').toLowerCase();
      if (lang.startsWith('zh')) return 'zh-CN';
      if (lang.startsWith('ja')) return 'ja';
      if (lang.startsWith('ko')) return 'ko';
      if (lang.startsWith('en')) return 'en';
      return null;
    },
    
    /**
     * 从本地存储读取语言设置
     */
    _getSavedLocale() {
      try {
        if (typeof Storage !== 'undefined') {
          return Storage.getLocale ? Storage.getLocale() : localStorage.getItem('killersudoku_locale');
        }
      } catch(e) {}
      return null;
    },
    
    /**
     * 保存语言设置
     */
    _saveLocale(locale) {
      try {
        if (typeof Storage !== 'undefined' && Storage.setLocale) {
          Storage.setLocale(locale);
        } else {
          localStorage.setItem('killersudoku_locale', locale);
        }
      } catch(e) {}
    },
    
    /**
     * 深度合并对象（用于fallback）
     */
    _deepMerge(target, source) {
      const result = { ...target };
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
            target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
          result[key] = this._deepMerge(target[key], source[key]);
        } else {
          result[key] = source[key];
        }
      }
      return result;
    },

    /**
     * 加载语言包
     */
    async loadLocale(locale) {
      if (!this.supportedLocales.includes(locale)) {
        console.warn(`⚠️ Unsupported locale: ${locale}, falling back to ${this.fallback}`);
        locale = this.fallback;
      }
      
      try {
        let messages = null;
        
        // 优先从内嵌消息加载
        if (this._inlineMessages && this._inlineMessages[locale]) {
          messages = this._inlineMessages[locale];
        } else {
          // 从JSON文件加载
          const res = await fetch(`utils/locales/${locale}.json?v=39`);
          if (res.ok) {
            messages = await res.json();
          }
        }
        
        if (messages) {
          // 如果不是fallback语言，先加载fallback作为基础，然后用目标语言覆盖
          if (locale !== this.fallback) {
            try {
              let fallbackMessages = null;
              if (this._inlineMessages && this._inlineMessages[this.fallback]) {
                fallbackMessages = this._inlineMessages[this.fallback];
              } else {
                const fbRes = await fetch(`utils/locales/${this.fallback}.json?v=39`);
                if (fbRes.ok) {
                  fallbackMessages = await fbRes.json();
                }
              }
              if (fallbackMessages) {
                messages = this._deepMerge(fallbackMessages, messages);
              }
            } catch(e) {
              console.warn(`⚠️ Failed to load fallback locale:`, e.message);
            }
          }
          
          this.messages = messages;
          this.locale = locale;
          this._saveLocale(locale);
          this._applyToDOM();
          return true;
        }
      } catch(e) {
        console.warn(`⚠️ Failed to load locale ${locale}:`, e.message);
      }
      
      // fallback
      if (locale !== this.fallback) {
        return this.loadLocale(this.fallback);
      }
      return false;
    },
    
    /**
     * 设置内嵌语言包（避免fetch请求，用于APK打包）
     */
    setInlineMessages(messages) {
      this._inlineMessages = messages;
    },
    
    /**
     * 翻译主函数
     * @param {string} key - 翻译键，支持点号嵌套如 'ui.settings.title'
     * @param {Object} params - 插值参数 {name: 'value'}
     * @returns {string}
     */
    t(key, params) {
      const msg = this._getMessage(key);
      if (msg === null || msg === undefined) {
        // key不存在时返回key本身（方便开发调试）
        console.warn(`🌐 i18n missing key: ${key} (locale: ${this.locale})`);
        return key;
      }
      
      // 如果是对象/数组且没有第三个参数raw=true，返回key
      if (typeof msg === 'object') {
        return key;
      }
      
      let text = String(msg);
      
      // 参数插值: {name}, {0}, {1} 等
      if (params) {
        text = text.replace(/\{(\w+)\}/g, (match, name) => {
          return params[name] !== undefined ? String(params[name]) : match;
        });
      }
      
      return text;
    },

    /**
     * 获取原始翻译消息（可以是对象/数组，用于教程步骤等）
     * @param {string} key
     * @returns {*}
     */
    getRaw(key) {
      return this._getMessage(key);
    },
    
    /**
     * 获取翻译消息（支持嵌套key）
     */
    _getMessage(key) {
      const parts = key.split('.');
      let obj = this.messages;
      for (const part of parts) {
        if (obj && typeof obj === 'object' && part in obj) {
          obj = obj[part];
        } else {
          return null;
        }
      }
      return obj;
    },
    
    /**
     * 切换语言
     */
    async setLocale(locale) {
      await this.loadLocale(locale);
      // 触发自定义事件，通知页面刷新
      if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('localechanged', { detail: { locale } }));
      }
      return this;
    },
    
    /**
     * 获取当前语言
     */
    getLocale() {
      return this.locale;
    },
    
    /**
     * 获取支持的语言列表
     */
    getSupportedLocales() {
      return this.supportedLocales.map(code => ({
        code,
        name: this._getLocaleName(code),
        nativeName: this._getLocaleNativeName(code)
      }));
    },
    
    _getLocaleName(code) {
      const names = {
        'zh-CN': 'Chinese',
        'ja': 'Japanese', 
        'ko': 'Korean',
        'en': 'English'
      };
      return names[code] || code;
    },
    
    _getLocaleNativeName(code) {
      const names = {
        'zh-CN': '简体中文',
        'ja': '日本語',
        'ko': '한국어',
        'en': 'English'
      };
      return names[code] || code;
    },
    
    /**
     * 将翻译应用到DOM中带有data-i18n属性的元素
     */
    _applyToDOM() {
      if (typeof document === 'undefined') return;
      
      document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const attr = el.getAttribute('data-i18n-attr');
        const text = this.t(key);
        
        if (attr) {
          el.setAttribute(attr, text);
        } else {
          el.textContent = text;
        }
      });
      
      // 处理placeholder
      document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = this.t(key);
      });
      
      // 处理title
      document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = this.t(key);
      });
    },
    
    /**
     * 格式化时间
     */
    formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      const key = m > 0 ? 'time.format.min_sec' : 'time.format.s';
      return this.t(key, { m, s: String(s).padStart(2, '0') });
    },
    
    /**
     * 格式化进度
     */
    formatProgress(current, total) {
      return this.t('ui.progress.format', { current, total });
    }
  };

  // 导出到全局
  global.I18N = I18N;
  global.t = function(key, params) { return I18N.t(key, params); };

})(typeof window !== 'undefined' ? window : this);
