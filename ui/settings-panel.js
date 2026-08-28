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
      language: 'zh-CN', // 语言（v2.1：zh-CN / en-US / ja-JP / ko-KR）
      autoCandidates: false, // 自动候选笔记（默认关闭，2026-08-03）
      skipLesson: false, // 跳过教学（v2.0：默认关闭，开启后进入关卡自动跳过教学）
      heatmap: true, // 难度热区（v2.0：默认开启，绿/黄/红三色难度覆盖层；低画质自动关闭）
      hintNarrator: '', // 提示讲解员（v2.0：默认空=跟随系统按章节分配，可选沈墨/苏晚/薇拉/伊藤）
      chibiChatter: true, // chibi 讲解（v2.0：默认开启；关闭后不听 chibi 聒噪，专心游戏——提示/教学不出角色气泡）
      muteAll: false, // 总静音（v2.0：默认关闭；开启后所有声音关闭）
      instantErrorCheck: true, // 错误即时高亮（Q5：默认开启，填错立即红色高亮；关闭后不再实时标错）
      ledgerMode: 'compact', // 45账本模式（Q4：compact 紧凑 / full 完全 / off 关闭，默认紧凑）
      // 显示模式（桌面端）：windowed 窗口 / borderless 无边框 / fullscreen 真正全屏。
      // 仅 Electron 桌面壳生效（window.cm4Desktop 桥）；Web 浏览器运行时回退 Fullscreen API。
      displayMode: 'windowed',
      // 分辨率（桌面端）：auto / 1280x720 / 1600x900 / 1920x1080。
      // Windowed=窗口尺寸；Borderless=无边框尺寸；Fullscreen 用显示器原生分辨率，忽略此项。
      resolution: 'auto',
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
      language: (v) => ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'].indexOf(v) >= 0 ? v : 'zh-CN',
      autoCandidates: (v) => !!v,
      skipLesson: (v) => !!v,
      heatmap: (v) => !!v,
      hintNarrator: (v) => ['', 'shenmo', 'suwan', 'vera', 'ito'].indexOf(v) >= 0 ? v : '',
      chibiChatter: (v) => !!v,
      muteAll: (v) => !!v,
      instantErrorCheck: (v) => !!v,
      ledgerMode: (v) => ['compact', 'full', 'off'].indexOf(v) >= 0 ? v : this._defaults.ledgerMode,
      displayMode: (v) => ['windowed', 'borderless', 'fullscreen'].indexOf(v) >= 0 ? v : this._defaults.displayMode,
      resolution: (v) => ['auto', '1280x720', '1600x900', '1920x1080'].indexOf(v) >= 0 ? v : this._defaults.resolution,
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
      // 上线审计修复：Escape 关闭浮动面板（此前仅有关闭按钮）
      this._bindEscape();
      return true;
    } catch (e) {
      console.warn('[SettingsPanel] open error:', e);
      return false;
    }
  }

  /**
   * 上线审计修复：Escape 关闭面板（单次绑定，避免重复监听）
   */
  _bindEscape() {
    try {
      if (this._escapeBound) return;
      this._escapeBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this._isOpen) {
          e.preventDefault();
          this.close();
        }
      });
    } catch (e) { /* 忽略 */ }
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
    header.innerHTML = '<span class="cm-settings-title">' + window.I18n.t('ui.settings.title') + '</span>';

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
          tip.textContent = window.I18n.t('ui.settings.aiDebugTip');
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
    panel.appendChild(this._buildSlider('volume', window.I18n.t('ui.settings.volumeMaster'), 0, 100));
    // 音效音量
    panel.appendChild(this._buildSlider('volumeSfx', window.I18n.t('ui.settings.volumeSfx'), 0, 100));
    // 语音音量
    panel.appendChild(this._buildSlider('volumeVoice', window.I18n.t('ui.settings.volumeVoice'), 0, 100));
    // BGM 音量
    panel.appendChild(this._buildSlider('volumeBgm', window.I18n.t('ui.settings.volumeBgm'), 0, 100));
    // 画质
    panel.appendChild(this._buildSelect('quality', window.I18n.t('ui.settings.quality'), [
      { value: 'high', label: window.I18n.t('ui.settings.quality.high') },
      { value: 'medium', label: window.I18n.t('ui.settings.quality.medium') },
      { value: 'low', label: window.I18n.t('ui.settings.quality.low') },
    ]));
    // 笔记模式
    panel.appendChild(this._buildSelect('noteMode', window.I18n.t('ui.settings.noteMode'), [
      { value: 'cycle', label: window.I18n.t('ui.settings.noteMode.cycle') },
      { value: 'toggle', label: window.I18n.t('ui.settings.noteMode.toggle') },
    ]));
    // 语言（v2.1：四语切换）
    const langRow = this._buildSelect('language', window.I18n.t('ui.settings.language'), [
      { value: 'zh-CN', label: window.I18n.t('ui.settings.language.zhCN') },
      { value: 'en-US', label: 'English' },
      { value: 'ja-JP', label: window.I18n.t('ui.settings.language.jaJP') },
      { value: 'ko-KR', label: window.I18n.t('ui.settings.language.koKR') },
    ]);
    if (langRow) {
      const hint = langRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.language.hint');
      panel.appendChild(langRow);
    }

    // 自动候选笔记开关（2026-08-03）：默认关闭，开启后自动填入引擎候选数
    const autoCandRow = this._buildSelect('autoCandidates', window.I18n.t('ui.settings.autoCandidates'), [
      { value: false, label: window.I18n.t('ui.settings.autoCandidates.off') },
      { value: true, label: window.I18n.t('ui.settings.autoCandidates.on') },
    ]);
    if (autoCandRow) {
      const hint = autoCandRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.autoCandidates.hint');
      panel.appendChild(autoCandRow);
    }

    // 跳过教学开关（v2.0）：默认关闭；开启后所有教学对话直接跳过
    const skipLessonRow = this._buildSelect('skipLesson', window.I18n.t('ui.settings.skipLesson'), [
      { value: false, label: window.I18n.t('ui.settings.skipLesson.off') },
      { value: true, label: window.I18n.t('ui.settings.skipLesson.on') },
    ]);
    if (skipLessonRow) {
      const hint = skipLessonRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.skipLesson.hint');
      panel.appendChild(skipLessonRow);
    }

    // 难度热区开关（Q6）：实时推算"当前盘面可推格"——绿色=现在能填（深绿边框=高影响格），低画质自动关闭
    const heatmapRow = this._buildSelect('heatmap', window.I18n.t('ui.settings.heatmap'), [
      { value: true, label: window.I18n.t('ui.settings.heatmap.on') },
      { value: false, label: window.I18n.t('ui.settings.heatmap.off') },
    ]);
    if (heatmapRow) {
      const hint = heatmapRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.heatmap.hint');
      panel.appendChild(heatmapRow);
    }

    // 提示讲解员（v2.0）：默认按章节自动分配（第1章苏晚/第2章沈墨/第3章伊藤/第4章薇拉/第5章沈墨/第6-7章苏晚），
    // 选定后固定由该 chibi 角色讲解
    const narratorRow = this._buildSelect('hintNarrator', window.I18n.t('ui.settings.hintNarrator'), [
      { value: '', label: window.I18n.t('ui.settings.hintNarrator.auto') },
      { value: 'shenmo', label: window.I18n.t('ui.settings.hintNarrator.shenmo') },
      { value: 'suwan', label: window.I18n.t('ui.settings.hintNarrator.suwan') },
      { value: 'vera', label: window.I18n.t('ui.settings.hintNarrator.vera') },
      { value: 'ito', label: window.I18n.t('ui.settings.hintNarrator.ito') },
    ]);
    if (narratorRow) {
      const hint = narratorRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.hintNarrator.hint');
      panel.appendChild(narratorRow);
    }

    // chibi 讲解开关（v2.0）：关闭后不听 chibi 聒噪，专心游戏
    const chibiRow = this._buildSelect('chibiChatter', window.I18n.t('ui.settings.chibiChatter'), [
      { value: true, label: window.I18n.t('ui.settings.chibiChatter.on') },
      { value: false, label: window.I18n.t('ui.settings.chibiChatter.off') },
    ]);
    if (chibiRow) {
      const hint = chibiRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.chibiChatter.hint');
      panel.appendChild(chibiRow);
    }

    // 总静音开关（v2.0）：一键关闭所有声音
    const muteRow = this._buildSelect('muteAll', window.I18n.t('ui.settings.muteAll'), [
      { value: false, label: window.I18n.t('ui.settings.muteAll.off') },
      { value: true, label: window.I18n.t('ui.settings.muteAll.on') },
    ]);
    if (muteRow) {
      const hint = muteRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.muteAll.hint');
      panel.appendChild(muteRow);
    }

    // 错误即时高亮开关（Q5）：填错立即红色高亮；关闭后不实时标错
    const instErrRow = this._buildSelect('instantErrorCheck', window.I18n.t('ui.settings.instantErrorCheck'), [
      { value: true, label: window.I18n.t('ui.settings.instantErrorCheck.on') },
      { value: false, label: window.I18n.t('ui.settings.instantErrorCheck.off') },
    ]);
    if (instErrRow) {
      const hint = instErrRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.instantErrorCheck.hint');
      panel.appendChild(instErrRow);
    }

    // 45账本模式（Q4）：紧凑（默认）/ 完全 / 关闭
    const ledgerRow = this._buildSelect('ledgerMode', window.I18n.t('ui.settings.ledgerMode'), [
      { value: 'compact', label: window.I18n.t('ui.settings.ledgerMode.compact') },
      { value: 'full', label: window.I18n.t('ui.settings.ledgerMode.full') },
      { value: 'off', label: window.I18n.t('ui.settings.ledgerMode.off') },
    ]);
    if (ledgerRow) {
      const hint = ledgerRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.ledgerMode.hint');
      panel.appendChild(ledgerRow);
    }

    // 显示模式（桌面端）：窗口 / 无边框 / 全屏切换。
    // onChange 中经 window.cm4Desktop.setDisplayConfig 通知 Electron 主进程；
    // Web 浏览器环境由 onChange 侧代理 Fullscreen API（仅 windowed/fullscreen）。
    const displayModeRow = this._buildSelect('displayMode', window.I18n.t('ui.settings.displayMode'), [
      { value: 'windowed', label: window.I18n.t('ui.settings.displayMode.windowed') },
      { value: 'borderless', label: window.I18n.t('ui.settings.displayMode.borderless') },
      { value: 'fullscreen', label: window.I18n.t('ui.settings.displayMode.fullscreen') },
    ]);
    if (displayModeRow) {
      const hint = displayModeRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.displayMode.hint');
      panel.appendChild(displayModeRow);
    }

    // 分辨率（桌面端）：Windowed=窗口尺寸；Borderless=无边框尺寸；Fullscreen 用显示器原生分辨率。
    const resolutionRow = this._buildSelect('resolution', window.I18n.t('ui.settings.resolution'), [
      { value: 'auto', label: window.I18n.t('ui.settings.resolution.auto') },
      { value: '1280x720', label: '1280×720' },
      { value: '1600x900', label: '1600×900' },
      { value: '1920x1080', label: '1920×1080' },
    ]);
    if (resolutionRow) {
      const hint = resolutionRow.querySelector('.cm-settings-hint');
      if (hint) hint.textContent = window.I18n.t('ui.settings.resolution.hint');
      panel.appendChild(resolutionRow);
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
      const selects = ['quality', 'noteMode', 'language', 'chibiChatter', 'muteAll', 'instantErrorCheck', 'ledgerMode', 'displayMode', 'resolution'];
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
      // Q15：z-index 9500→200010——topbar 是 21000，startPage/bookShell 是 200000。
      // 原 30000 会被 fixed 200000 的开始页/书架盖住，导致「开始菜单设置点不了」（面板弹出但被盖死）。
      // 200010 高于 startPage/bookShell 覆盖层，低于 toast 300000。
      // 加 max-height + overflow-y:auto——面板内容超出屏幕可滚动（原无滚动，body 又被暂停锁定）
      '.cm-settings { position: fixed; right: 20px; top: 56px; width: 320px; max-height: calc(100vh - 88px);',
      '  overflow-y: auto; overscroll-behavior: contain; z-index: 200010;',
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
      '.cm-settings-hint { font-size: 12px; color: #6b4f33; margin-top: 2px; }',
    ].join('\n');
    document.head.appendChild(style);
  }
}

export default SettingsPanel;