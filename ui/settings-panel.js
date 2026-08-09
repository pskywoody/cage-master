// ==========================================
// settings-panel.js - V4 UI 层：SettingsPanel 设置面板
// ==========================================
// 说明（参照 CageMasterV4-refactoring-manual sec2-4 与附录 B）：
//   ui/settings-panel.js 提供设置面板（音量、画质、笔记模式、语言预留），
//   通过 core/data-store.js 的 DataStore 持久化到分类 SETTINGS：
//     DataStore.get(key, DataStore.SETTINGS, defaultValue)
//     DataStore.set(key, value, DataStore.SETTINGS)
//   方法：
//     open() / close() / get(key) / set(key, value) / onChange 回调
//   画质设置会同步到 PerformanceMonitor（high/medium/low）。
//
// 环境约束：
//   - 纯 ES Module 语法；无模块顶层 DOM 访问（Node import 不报错）。
// ==========================================

import { DataStore } from '../core/data-store.js';

export class SettingsPanel {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - 挂载容器（可选；缺省为浮动层）
   * @param {Object}      [options.dataStore] - 可注入的 DataStore（默认使用 core/data-store.js）
   * @param {Object}      [options.performanceMonitor] - PerformanceMonitor 实例（画质联动）
   * @param {Function}    [options.onChange] - 设置变更回调 (key, value) => void
   * @param {Object}      [options.defaults] - 自定义默认值（覆盖内置默认）
   */
  constructor(options) {
    options = options || {};

    /** @type {HTMLElement|null} */
    this._container = options.container || null;

    /** @type {Object} DataStore */
    this._dataStore = options.dataStore || DataStore;

    /** @type {Object|null} */
    this._performanceMonitor = options.performanceMonitor || null;

    /** @type {Function|null} 设置变更回调 */
    this.onChange = typeof options.onChange === 'function' ? options.onChange : null;

    /** @type {Object} 各设置的默认值 */
    this._defaults = Object.assign({
      volume: 0.7,        // 主音量 0~1（与 AudioService master 默认值对齐）
      volumeSfx: 0.6,     // 音效音量 0~1
      volumeVoice: 0.85,  // 语音音量 0~1
      volumeBgm: 0.4,     // BGM 音量 0~1
      quality: 'high',    // 画质 high | medium | low
      noteMode: 'cycle',  // 笔记模式 cycle | toggle
      language: 'zh',     // 语言（预留，仅 zh）
      autoCandidates: false, // 自动候选笔记（默认关闭，2026-08-03）
      skipLesson: false, // 跳过教学（v2.0：默认关闭，开启后进入关卡自动跳过教学）
      heatmap: true, // 难度热区（v2.0：默认开启，绿/黄/红三色难度覆盖层；低画质自动关闭）
      hintNarrator: '', // 提示讲解员（v2.0：默认空=跟随系统随机，可选守笼人/阿妍/莹莹/设局人/星辰梭，沈墨除外）
      chibiChatter: true, // chibi 讲解（v2.0：默认开启；关闭后不听 chibi 聒噪，专心游戏——提示/教学不出角色气泡）
      muteAll: false, // 总静音（v2.0：默认关闭；开启后所有声音关闭）
    }, options.defaults || {});

    /** @type {Object} 各设置的合法值校验表 */
    this._validators = {
      volume: (v) => {
        const n = Number(v);
        return !isNaN(n) ? Math.max(0, Math.min(1, n)) : this._defaults.volume;
      },
      volumeSfx: (v) => {
        const n = Number(v);
        return !isNaN(n) ? Math.max(0, Math.min(1, n)) : this._defaults.volumeSfx;
      },
      volumeVoice: (v) => {
        const n = Number(v);
        return !isNaN(n) ? Math.max(0, Math.min(1, n)) : this._defaults.volumeVoice;
      },
      volumeBgm: (v) => {
        const n = Number(v);
        return !isNaN(n) ? Math.max(0, Math.min(1, n)) : this._defaults.volumeBgm;
      },
      quality: (v) => ['high', 'medium', 'low'].indexOf(v) >= 0 ? v : this._defaults.quality,
      noteMode: (v) => ['cycle', 'toggle'].indexOf(v) >= 0 ? v : this._defaults.noteMode,
      language: (v) => ['zh'].indexOf(v) >= 0 ? v : 'zh',
      autoCandidates: (v) => !!v,
      skipLesson: (v) => !!v,
      heatmap: (v) => !!v,
      hintNarrator: (v) => ['', 'cagekeeper', 'ayan', 'ying', 'plotter', 'weaver'].indexOf(v) >= 0 ? v : '',
      chibiChatter: (v) => !!v,
      muteAll: (v) => !!v,
    };

    /** @type {boolean} 是否已打开 */
    this._isOpen = false;

    /** @type {HTMLElement|null} 面板 DOM */
    this._panel = null;
    this._stylesInjected = false;
  }

  // ============================================================
  //  读写
  // ============================================================

  /**
   * 读取设置值
   * @param {string} key - 设置键（volume/quality/noteMode/language）
   * @returns {*} 值（无默认值则返回 null）
   */
  get(key) {
    try {
      const def = Object.prototype.hasOwnProperty.call(this._defaults, key)
        ? this._defaults[key]
        : null;
      try {
        return this._dataStore.get(key, DataStore.SETTINGS, def);
      } catch (e) {
        console.warn('[SettingsPanel] get failed for', key, e);
        return def;
      }
    } catch (e) {
      console.warn('[SettingsPanel] get error:', e);
      return null;
    }
  }

  /**
   * 写入设置值（校验 + 持久化 + 联动 + onChange）
   * @param {string} key - 设置键
   * @param {*} value - 新值
   * @returns {boolean} 是否成功
   */
  set(key, value) {
    try {
      const validator = this._validators[key];
      const normalized = validator ? validator(value) : value;

      let ok = false;
      try {
        ok = this._dataStore.set(key, normalized, DataStore.SETTINGS);
      } catch (e) {
        console.warn('[SettingsPanel] set failed for', key, e);
        ok = false;
      }

      // 画质联动 PerformanceMonitor
      if (key === 'quality' && this._performanceMonitor &&
          typeof this._performanceMonitor.setLevel === 'function') {
        this._performanceMonitor.setLevel(normalized);
      }

      if (typeof this.onChange === 'function') {
        try {
          this.onChange(key, normalized);
        } catch (e) {
          console.warn('[SettingsPanel] onChange error:', e);
        }
      }
      return ok;
    } catch (e) {
      console.warn('[SettingsPanel] set error:', e);
      return false;
    }
  }

  /**
   * 读取全部设置
   * @returns {Object}
   */
  getAll() {
    try {
      const result = {};
      for (const key of Object.keys(this._defaults)) {
        result[key] = this.get(key);
      }
      return result;
    } catch (e) {
      console.warn('[SettingsPanel] getAll error:', e);
      return {};
    }
  }

  /**
   * 获取内置默认值表（只读拷贝）
   * @returns {Object}
   */
  getDefaults() {
    try {
      return Object.assign({}, this._defaults);
    } catch (e) {
      console.warn('[SettingsPanel] getDefaults error:', e);
      return {};
    }
  }

  // ============================================================
  //  显示 / 隐藏
  // ============================================================

  /**
   * 打开设置面板
   * @returns {boolean}
   */
  open() {
    try {
      if (typeof document === 'undefined') return false;
      this._ensurePanel();
      if (!this._panel) return false;
      this._syncControls();
      this._panel.style.display = 'block';
      this._isOpen = true;
      return true;
    } catch (e) {
      console.warn('[SettingsPanel] open error:', e);
      return false;
    }
  }

  /**
   * 关闭设置面板
   */
  close() {
    try {
      if (this._panel) {
        this._panel.style.display = 'none';
      }
      this._isOpen = false;
    } catch (e) {
      console.warn('[SettingsPanel] close error:', e);
    }
  }

  /**
   * 是否打开
   * @returns {boolean}
   */
  isOpen() {
    return this._isOpen;
  }

  /**
   * 切换开/关
   */
  toggle() {
    try {
      if (this._isOpen) this.close();
      else this.open();
    } catch (e) {
      console.warn('[SettingsPanel] toggle error:', e);
    }
  }

  // ============================================================
  //  DOM
  // ============================================================

  /**
   * 惰性构建面板 DOM
   * @private
   */
  _ensurePanel() {
    if (this._panel || typeof document === 'undefined') return;
    this._injectStyles();

    const panel = document.createElement('div');
    panel.className = 'cm-settings';
    panel.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'cm-settings-header';
    header.innerHTML = '<span class="cm-settings-title">\u2699 \u8BBE\u7F6E</span>';

    // v2.0：隐藏入口——连点 5 次版本号打开 AI 调试（原暂停菜单 AI 调试按钮已移除）
    // Q4：版本号 = 本次大改（纸墨化 P0-P3 + Q1-Q3 布局调整），设置面板可见即确认加载新版
    // Q8：连点 5 次→3 次（玩家反馈找不到入口），第 1 次点击给提示气泡
    const versionEl = document.createElement('span');
    versionEl.className = 'cm-settings-version';
    versionEl.textContent = 'v4.3.33';
    versionEl.style.cssText = 'font-size:11px;color:#b0a89c;cursor:pointer;margin-right:8px;user-select:none;';
    let versionTaps = 0;
    let versionTapTimer = null;
    versionEl.addEventListener('click', () => {
      versionTaps++;
      if (versionTapTimer) clearTimeout(versionTapTimer);
      versionTapTimer = setTimeout(() => { versionTaps = 0; }, 1200);
      if (versionTaps === 1) {
        // 首次点击提示：AI 调试入口
        try {
          const tip = document.createElement('div');
          tip.textContent = '\u8FDE\u70B9 3 \u6B21\u6253\u5F00 AI \u8C03\u8BD5';
          tip.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(20,26,40,0.95);color:#e2e8f0;padding:10px 16px;border-radius:8px;border:1px solid rgba(251,191,36,0.4);font-size:13px;z-index:99999;box-shadow:0 4px 14px rgba(0,0,0,0.5);';
          document.body.appendChild(tip);
          setTimeout(() => { try { tip.remove(); } catch (eT) {} }, 1200);
        } catch (eT) {}
      }
      if (versionTaps >= 3) {
        versionTaps = 0;
        try {
          const u = new URL('ai-debug.html', window.location.href);
          window.open(u.href, 'ai-debug', 'width=1080,height=900');
        } catch (e) {
          window.open('./ai-debug.html', 'ai-debug', 'width=1080,height=900');
        }
      }
    });

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cm-settings-close';
    closeBtn.textContent = '\u00D7';
    closeBtn.addEventListener('click', () => this.close());
    // Q10：版本号放在关闭按钮前——必须先 appendChild(closeBtn) 再 insertBefore
    // （insertBefore 要求参考节点是子节点；原代码在 const 声明前访问 closeBtn
    //  触发 TDZ ReferenceError，后又顺序错误触发 NotFoundError，设置面板打不开）
    header.appendChild(closeBtn);
    header.insertBefore(versionEl, closeBtn);
    panel.appendChild(header);

    // 音量
    panel.appendChild(this._buildSlider('volume', '\u4E3B\u97F3\u91CF', 0, 100));
    // 音效音量
    panel.appendChild(this._buildSlider('volumeSfx', '\u97F3\u6548\u97F3\u91CF', 0, 100));
    // 语音音量
    panel.appendChild(this._buildSlider('volumeVoice', '\u8BED\u97F3\u97F3\u91CF', 0, 100));
    // BGM 音量
    panel.appendChild(this._buildSlider('volumeBgm', 'BGM\u97F3\u91CF', 0, 100));
    // 画质
    panel.appendChild(this._buildSelect('quality', '\u753B\u8D28', [
      { value: 'high', label: '\u9AD8' },
      { value: 'medium', label: '\u4E2D' },
      { value: 'low', label: '\u4F4E' },
    ]));
    // 笔记模式
    panel.appendChild(this._buildSelect('noteMode', '\u7B14\u8BB0\u6A21\u5F0F', [
      { value: 'cycle', label: '\u5FAA\u73AF\u5207\u6362' },
      { value: 'toggle', label: '\u76F4\u63A5\u5207\u6362' },
    ]));
    // 语言（预留）
    const langRow = this._buildSelect('language', '\u8BED\u8A00', [
      { value: 'zh', label: '\u7B80\u4F53\u4E2D\u6587' },
    ]);
    if (langRow) {
      const hint = langRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u66F4\u591A\u8BED\u8A00\u5C06\u5728\u540E\u7EED\u7248\u672C\u4E2D\u63A8\u51FA';
      panel.appendChild(langRow);
    }

    // 自动候选笔记开关（2026-08-03）：默认关闭，开启后自动填入引擎候选数
    const autoCandRow = this._buildSelect('autoCandidates', '\u81EA\u52A8\u5019\u9009\u7B14\u8BB0', [
      { value: false, label: '\u5173\u95ED\uFF08\u624B\u52A8\u8BB0\u7B14\u8BB0\uFF09' },
      { value: true, label: '\u5F00\u542F\uFF08\u81EA\u52A8\u586B\u5165\u5019\u9009\u6570\uFF09' },
    ]);
    if (autoCandRow) {
      const hint = autoCandRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u9AD8\u7AEF\u5C40\u5EFA\u8BAE\u5173\u95ED\uFF0C\u624B\u52A8\u7B14\u8BB0\u66F4\u5229\u4E8E\u63A8\u7406\u8BAD\u7EC3';
      panel.appendChild(autoCandRow);
    }

    // 跳过教学开关（v2.0）：默认关闭；开启后所有教学对话直接跳过
    const skipLessonRow = this._buildSelect('skipLesson', '\u8DF3\u8FC7\u6559\u5B66', [
      { value: false, label: '\u5173\u95ED\uFF08\u9ED8\u8BA4\uFF0C\u6B63\u5E38\u6559\u5B66\uFF09' },
      { value: true, label: '\u5F00\u542F\uFF08\u8DF3\u8FC7\u6240\u6709\u6559\u5B66\u5BF9\u8BDD\uFF09' },
    ]);
    if (skipLessonRow) {
      const hint = skipLessonRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u5F00\u542F\u540E\u8FDB\u5165\u5173\u5361\u65F6\u81EA\u52A8\u8DF3\u8FC7\u6559\u5B66\uFF0C\u76F4\u63A5\u81EA\u7531\u89E3\u9898';
      panel.appendChild(skipLessonRow);
    }

    // 难度热区开关（Q6）：实时推算"当前盘面可推格"——绿色=现在能填（深绿边框=高影响格），低画质自动关闭
    const heatmapRow = this._buildSelect('heatmap', '\u96BE\u5EA6\u70ED\u533A', [
      { value: true, label: '\u5F00\u542F\uFF08\u7EFF\u8272=\u5F53\u524D\u53EF\u63A8\u683C\uFF09' },
      { value: false, label: '\u5173\u95ED\uFF08\u4E0D\u663E\u793A\u53EF\u63A8\u683C\uFF09' },
    ]);
    if (heatmapRow) {
      const hint = heatmapRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u5B9E\u65F6\u63A8\u7B97\uFF1A\u7EFF\u8272=\u5F53\u524D\u53EF\u63A8\u51FA\u7684\u683C\uFF0C\u6DF1\u7EFF\u8FB9\u6846=\u9AD8\u5F71\u54CD\u53EF\u63A8\u683C\uFF1B\u586B\u6570\u540E\u81EA\u52A8\u91CD\u7B97\uFF1B\u4F4E\u753B\u8D28\u81EA\u52A8\u5173\u95ED';
      panel.appendChild(heatmapRow);
    }

    // 提示讲解员（v2.0）：默认按技巧难度自动分配（1-3级莹莹/4-6级阿妍/7-9级守笼人/10-11级设局人），
    // 选定后固定由该 chibi 角色讲解（沈墨除外）
    const narratorRow = this._buildSelect('hintNarrator', '\u63D0\u793A\u8BB2\u89E3\u5458', [
      { value: '', label: '\u81EA\u52A8\uFF08\u6309\u6280\u5DE7\u96BE\u5EA6\u5206\u914D\uFF09' },
      { value: 'cagekeeper', label: '\u5B88\u7B3C\u4EBA' },
      { value: 'ayan', label: '\u963F\u59ED' },
      { value: 'ying', label: '\u83B9\u83B9' },
      { value: 'plotter', label: '\u8BBE\u5C40\u4EBA' },
      { value: 'weaver', label: '\u661F\u8FB0\u68AD' },
    ]);
    if (narratorRow) {
      const hint = narratorRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u9ED8\u8BA4\u81EA\u52A8\uFF1A1-3\u7EA7\u83B9\u83B9 / 4-6\u7EA7\u963F\u59ED / 7-9\u7EA7\u5B88\u7B3C\u4EBA / 10-11\u7EA7\u8BBE\u5C40\u4EBA\uFF1B\u9009\u5B9A\u540E\u56FA\u5B9A\u7531\u8BE5\u89D2\u8272\u8BB2\u89E3';
      panel.appendChild(narratorRow);
    }

    // chibi 讲解开关（v2.0）：关闭后不听 chibi 聒噪，专心游戏
    const chibiRow = this._buildSelect('chibiChatter', 'chibi\u8BB2\u89E3', [
      { value: true, label: '\u5F00\u542F\uFF08\u9ED8\u8BA4\uFF0C\u63D0\u793A/\u6559\u5B66\u7531\u89D2\u8272\u8BB2\u89E3\uFF09' },
      { value: false, label: '\u5173\u95ED\uFF08\u4E0D\u542C chibi \u5608\u566A\uFF0C\u4E13\u5FC3\u89E3\u9898\uFF09' },
    ]);
    if (chibiRow) {
      const hint = chibiRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u5173\u95ED\u540E\u63D0\u793A\u4E0D\u51FA\u89D2\u8272\u6C14\u6CE1\uFF0C\u4F46\u52A8\u753B\u6F14\u793A\u4ECD\u6B63\u5E38';
      panel.appendChild(chibiRow);
    }

    // 总静音开关（v2.0）：一键关闭所有声音
    const muteRow = this._buildSelect('muteAll', '\u603B\u9759\u97F3', [
      { value: false, label: '\u5173\u95ED\uFF08\u9ED8\u8BA4\uFF0C\u6B63\u5E38\u53D1\u58F0\uFF09' },
      { value: true, label: '\u5F00\u542F\uFF08\u4E00\u952E\u9759\u97F3\u6240\u6709\u58F0\u97F3\uFF09' },
    ]);
    if (muteRow) {
      const hint = muteRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = '\u5F00\u542F\u540E\u4E3B/\u97F3\u6548/\u8BED\u97F3/BGM \u5168\u90E8\u9759\u97F3\uFF0C\u4E0D\u5F71\u54CD\u6E38\u620F';
      panel.appendChild(muteRow);
    }

    if (this._container) {
      this._container.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    this._panel = panel;
  }

  /**
   * 构建滑块行（音量）
   * @private
   */
  _buildSlider(key, label, min, max) {
    try {
      const row = document.createElement('div');
      row.className = 'cm-settings-row';
      row.innerHTML =
        '<label class="cm-settings-label" for="cm-set-' + key + '">' + label + '</label>' +
        '<div class="cm-settings-control">' +
        '  <input type="range" id="cm-set-' + key + '" min="' + min + '" max="' + max + '" step="1">' +
        '  <span class="cm-settings-value" id="cm-set-' + key + '-value"></span>' +
        '</div>' +
        '<div class="cm-settings-hint"></div>';
      const input = row.querySelector('input');
      if (input) {
        input.addEventListener('input', () => {
          try {
            const v = Number(input.value) / (max - min);
            this.set(key, v);
            const valEl = row.querySelector('.cm-settings-value');
            if (valEl) valEl.textContent = Math.round(v * 100) + '%';
          } catch (e) {
            console.warn('[SettingsPanel] slider input error:', e);
          }
        });
      }
      return row;
    } catch (e) {
      console.warn('[SettingsPanel] _buildSlider error:', e);
      return document.createElement('div');
    }
  }

  /**
   * 构建下拉行（画质/笔记模式/语言）
   * @private
   */
  _buildSelect(key, label, optionsList) {
    try {
      const row = document.createElement('div');
      row.className = 'cm-settings-row';
      const optsHtml = optionsList
        .map((o) => '<option value="' + o.value + '">' + o.label + '</option>')
        .join('');
      row.innerHTML =
        '<label class="cm-settings-label" for="cm-set-' + key + '">' + label + '</label>' +
        '<div class="cm-settings-control">' +
        '  <select id="cm-set-' + key + '">' + optsHtml + '</select>' +
        '</div>' +
        '<div class="cm-settings-hint"></div>';
      const select = row.querySelector('select');
      if (select) {
        select.addEventListener('change', () => {
          try {
            this.set(key, select.value);
          } catch (e) {
            console.warn('[SettingsPanel] select change error:', e);
          }
        });
      }
      return row;
    } catch (e) {
      console.warn('[SettingsPanel] _buildSelect error:', e);
      return document.createElement('div');
    }
  }

  /**
   * 将存储值同步到控件显示
   * @private
   */
  _syncControls() {
    try {
      if (!this._panel || typeof document === 'undefined') return;

      // 音量（4 通道）
      const volKeys = ['volume', 'volumeSfx', 'volumeVoice', 'volumeBgm'];
      for (const key of volKeys) {
        const input = document.getElementById('cm-set-' + key);
        if (input) {
          const v = this.get(key);
          input.value = String(Math.round(v * 100));
          const valEl = document.getElementById('cm-set-' + key + '-value');
          if (valEl) valEl.textContent = Math.round(v * 100) + '%';
        }
      }

      // 下拉
      const selects = ['quality', 'noteMode', 'language', 'chibiChatter', 'muteAll'];
      for (const key of selects) {
        const el = document.getElementById('cm-set-' + key);
        if (el) el.value = String(this.get(key));
      }
    } catch (e) {
      console.warn('[SettingsPanel] _syncControls error:', e);
    }
  }

  /**
   * 注入默认样式（首次构建面板时执行）
   * @private
   */
  _injectStyles() {
    if (this._stylesInjected || typeof document === 'undefined') return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'cm-settings-style';
    style.textContent = [
      '/* P1：设置面板 = 夹页纸（旧纸底 + 纹理叠层 + 墨描边） */',
      // Q15：z-index 9500→30000——topbar 是 21000，原 9500 导致面板顶部（含 × 关闭按钮）
      // 被 topbar 盖住点不到（用户反馈"没法退出设置"）。
      // 加 max-height + overflow-y:auto——面板内容超出屏幕可滚动（原无滚动，body 又被暂停锁定）
      '.cm-settings { position: fixed; right: 20px; top: 56px; width: 320px; max-height: calc(100vh - 88px);',
      '  overflow-y: auto; overscroll-behavior: contain; z-index: 30000;',
      '  background-color: #f5f0e0; background-image:',
      '  repeating-linear-gradient(45deg, rgba(200,190,170,.03) 0px, rgba(200,190,170,.03) 1px, transparent 1px, transparent 3px),',
      '  radial-gradient(ellipse at 20% 30%, rgba(184,168,136,.05) 0%, transparent 60%);',
      '  border: 1px solid rgba(61,47,34,.5); border-radius: 8px;',
      '  box-shadow: 0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px rgba(255,255,255,.28), inset 0 0 20px rgba(120,100,70,.16);',
      '  padding: 16px 18px; color: #3d2f22; }',
      // Q15：移动端窄屏适配——面板宽度不超出屏幕
      '@media (max-width: 420px) { .cm-settings { right: 16px; left: 16px; width: auto; max-height: calc(100vh - 100px); } }',
      '.cm-settings-header { display: flex; justify-content: space-between; align-items: center;',
      '  margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(90,70,40,.4); }',
      '.cm-settings-title { font-size: 16px; font-weight: 700; color: #3d2a1a; font-family: \'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif; letter-spacing: 2px; }',
      '.cm-settings-close { border: 1px solid rgba(90,70,40,.5); background: rgba(255,255,255,.25); color: #5a4630;',
      '  border-radius: 5px; width: 26px; height: 26px; cursor: pointer; font-size: 15px; line-height: 1; }',
      '.cm-settings-close:hover { border-color: #b8860b; color: #3d2a1a; }',
      '.cm-settings-row { margin-bottom: 12px; }',
      '.cm-settings-label { display: block; font-size: 13px; font-weight: 600; color: #4a3520; margin-bottom: 4px; }',
      '.cm-settings-control { display: flex; align-items: center; gap: 10px; }',
      '.cm-settings-control input[type=range] { flex: 1; accent-color: #b8860b; }',
      '.cm-settings-control select { flex: 1; height: 30px; border: 1px solid rgba(90,70,40,.5); border-radius: 5px;',
      '  background: #f5f0e0; color: #3a3229; padding: 0 8px; font-size: 13px; }',
      '.cm-settings-value { font-size: 13px; color: var(--color-ink-muted); min-width: 40px; text-align: right; }',
      '.cm-settings-hint { font-size: 12px; color: #a08a70; margin-top: 2px; }',
    ].join('\n');
    document.head.appendChild(style);
  }
}

export default SettingsPanel;