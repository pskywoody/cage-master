// ==========================================
// dialog.js - V4 UI 层：DialogSystem 对话系统
// ==========================================
// 说明（参照 CageMasterV4-refactoring-manual sec2 与附录 B）：
//   ui/dialog.js 提供角色对话气泡/对话面板，供教学（onBubble）、
//   剧情演出等场景使用。功能：
//     - show(text, speaker, options)  显示单条对话
//     - queue(dialogArray)            依次播放对话序列
//     - skip()                        跳过当前对话（补全文本）
//     - hide()                        立即隐藏
//     - isShowing()                   是否正在显示
//     - 打字机效果 + 点击继续 + onComplete 回调
//   纯 DOM 实现，可挂载到指定容器；未指定容器时自动创建浮层。
//
// 环境约束：
//   - 纯 ES Module 语法；无模块顶层 DOM 访问（Node import 不报错）。
// ==========================================

import I18n from '../i18n/i18n.js';

export class DialogSystem {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - 挂载容器（可选；缺省为浮动层挂到 body）
   * @param {'bubble'|'panel'} [options.type='bubble'] - 展示形态：气泡 / 对话面板
   * @param {number} [options.typingSpeed=40] - 打字机速度（毫秒/字符）
   * @param {Function} [options.onComplete] - 整段对话结束回调
   * @param {Function} [options.onShow] - 显示回调
   * @param {Function} [options.onHide] - 隐藏回调
   * @param {string} [options.avatar] - 默认头像（文本或 emoji）
   */
  constructor(options) {
    options = options || {};

    /** @type {HTMLElement|null} */
    this._container = options.container || null;

    /** @type {'bubble'|'panel'} */
    this._type = options.type === 'panel' ? 'panel' : 'bubble';

    /** @type {number} */
    // 2026-08-03：默认打字机 200ms/字（与 story-engine 语速一致，教学气泡可读）
    // 手感审计：实际生效值在各调用点显式传入（game.html 构造默认 52、教学气泡 120），
    // 此默认值仅作未传参兜底，调为 400ms/字（慢档，防未传参时过快）
    this._typingSpeed = options.typingSpeed || 400;

    /** @type {Function|null} */
    this._onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;

    /** @type {Function|null} */
    this._onShow = typeof options.onShow === 'function' ? options.onShow : null;

    /** @type {Function|null} */
    this._onHide = typeof options.onHide === 'function' ? options.onHide : null;

    /** @type {string} */
    this._defaultAvatar = options.avatar || '';

    // ---- 运行状态 ----
    /** @type {boolean} 是否正在显示 */
    this._showing = false;

    /** @type {Array<Object>} 待播放队列 */
    this._queue = [];

    /** @type {Object|null} 当前对话项 */
    this._current = null;

    /** @type {number|null} 打字机定时器 */
    this._typingTimer = null;

    /** @type {string} 已打出的文本 */
    this._typedText = '';

    /** @type {boolean} 当前条目是否已全部打出 */
    this._typeFinished = true;

    // ---- DOM 节点（惰性创建） ----
    this._root = null;
    this._bubbleEl = null;
    this._textEl = null;
    this._speakerEl = null;
    this._avatarEl = null;
    this._arrowEl = null;
  }

  // ============================================================
  //  公共 API
  // ============================================================

  /**
   * 显示一条对话
   * @param {string} text - 对话文本
   * @param {string} [speaker] - 说话人名称
   * @param {Object} [options] - { onComplete, avatar, typingSpeed, sticky }
   * @returns {DialogSystem} this
   */
  show(text, speaker, options) {
    try {
      options = options || {};
      const item = {
        text: String(text == null ? '' : text),
        speaker: speaker != null ? String(speaker) : '',
        avatar: options.avatar !== undefined ? options.avatar : this._defaultAvatar,
        typingSpeed: options.typingSpeed !== undefined ? options.typingSpeed : this._typingSpeed,
        onComplete: typeof options.onComplete === 'function' ? options.onComplete : null,
        sticky: options.sticky === true,
        anchorEl: options.anchorEl || null,
        anchorSide: options.anchorSide || null,
      };

      // 清空队列，仅播放本条
      this._queue = [item];
      this._playNext();
      return this;
    } catch (e) {
      console.warn('[DialogSystem] show error:', e);
      return this;
    }
  }

  /**
   * 依次播放对话序列
   * @param {Array<Object|string>} dialogArray - [{text, speaker, ...}] 或纯字符串
   * @param {Object} [commonOptions] - 应用到所有条目的公共选项
   * @returns {DialogSystem} this
   */
  queue(dialogArray, commonOptions) {
    try {
      commonOptions = commonOptions || {};
      if (!Array.isArray(dialogArray)) return this;

      this._queue = dialogArray.map((entry) => {
        if (typeof entry === 'string') {
          return {
            text: entry,
            speaker: commonOptions.speaker || '',
            avatar: commonOptions.avatar !== undefined ? commonOptions.avatar : this._defaultAvatar,
            typingSpeed: commonOptions.typingSpeed !== undefined ? commonOptions.typingSpeed : this._typingSpeed,
            onComplete: null,
            sticky: false,
          };
        }
        entry = entry || {};
        return {
          text: String(entry.text == null ? '' : entry.text),
          speaker: entry.speaker != null ? String(entry.speaker) : (commonOptions.speaker || ''),
          avatar: entry.avatar !== undefined ? entry.avatar
            : (commonOptions.avatar !== undefined ? commonOptions.avatar : this._defaultAvatar),
          typingSpeed: entry.typingSpeed !== undefined ? entry.typingSpeed
            : (commonOptions.typingSpeed !== undefined ? commonOptions.typingSpeed : this._typingSpeed),
          onComplete: typeof entry.onComplete === 'function' ? entry.onComplete : null,
          sticky: entry.sticky === true || commonOptions.sticky === true,
        };
      });

      if (!this._showing) {
        this._playNext();
      }
      return this;
    } catch (e) {
      console.warn('[DialogSystem] queue error:', e);
      return this;
    }
  }

  /**
   * 跳过当前对话：补全打字机文本；若已补全则结束整段（触发 onComplete）
   */
  skip() {
    try {
      if (!this._showing) return;
      this._finishTyping();
      if (this._typeFinished) {
        this._finishAll(true);
      }
    } catch (e) {
      console.warn('[DialogSystem] skip error:', e);
    }
  }

  /**
   * 立即隐藏（不触发对话 onComplete）
   */
  hide() {
    try {
      this._clearTyping();
      this._queue = [];
      this._current = null;
      this._showing = false;

      if (this._root && typeof document !== 'undefined') {
        this._root.style.display = 'none';
      }
      if (typeof this._onHide === 'function') {
        try { this._onHide(); } catch (e) { console.warn('[DialogSystem] onHide error:', e); }
      }
    } catch (e) {
      console.warn('[DialogSystem] hide error:', e);
    }
  }

  /**
   * 是否正在显示
   * @returns {boolean}
   */
  isShowing() {
    return this._showing;
  }

  /**
   * 销毁：清理定时器与 DOM
   */
  destroy() {
    try {
      this._clearTyping();
      if (this._root && this._root.parentNode) {
        this._root.parentNode.removeChild(this._root);
      }
      this._root = null;
      this._bubbleEl = null;
      this._textEl = null;
      this._speakerEl = null;
      this._avatarEl = null;
      this._arrowEl = null;
      this._showing = false;
      this._queue = [];
      this._current = null;
    } catch (e) {
      console.warn('[DialogSystem] destroy error:', e);
    }
  }

  // ============================================================
  //  内部实现
  // ============================================================

  /**
   * 播放队列中的下一条
   * @private
   */
  _playNext() {
    try {
      if (this._queue.length === 0) {
        this._finishAll(false);
        return;
      }
      const item = this._queue.shift();
      this._current = item;
      this._showing = true;
      this._renderItem(item);
      // 确保 DOM 可见（_ensureDom 初始为 display:none）
      if (this._root && typeof document !== 'undefined') {
        this._root.style.display = '';
        this._positionBubble();
      }
      if (typeof this._onShow === 'function') {
        try { this._onShow(); } catch (e) { console.warn('[DialogSystem] onShow error:', e); }
      }
    } catch (e) {
      console.warn('[DialogSystem] _playNext error:', e);
    }
  }

  /**
   * 定位气泡：有 anchorEl（如教学 Q 版人物）时锚定在其上方；
   * 否则保持屏幕下方居中（默认样式）
   * @private
   */
  _positionBubble() {
    try {
      if (typeof document === 'undefined' || !this._root) return;
      // 重置并列模式可能设置的显式宽度（恢复 CSS 默认）
      this._root.style.width = '';
      const item = this._current;
      if (item && item.anchorEl && typeof item.anchorEl.getBoundingClientRect === 'function') {
        const r = item.anchorEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          const vh = window.innerHeight || 0;
          const vw = window.innerWidth || 0;
          const spaceAbove = r.top;                 // 人物上方可用空间
          const spaceBelow = vh - r.bottom;          // 人物下方可用空间
          // 气泡估算高度（多行文本），留出余量
          const bubbleH = Math.min(240, Math.max(90, (this._current ? this._current.text.length * 8 : 90)));
          // 并列模式（anchorSide==='right'）：气泡在锚点右侧，与 chibi 左右并列互不遮挡
          if (item.anchorSide === 'right') {
            const bubbleW = 320; // 固定宽度：紧凑、不随文案长度跳动
            const gap = 10;
            let left = r.right + gap;
            // 右侧放不下则退回锚点左侧
            if (left + bubbleW > vw - 12) left = Math.max(12, r.left - bubbleW - gap);
            // 垂直：气泡上移 15px，与 chibi 同高靠上并列（不遮棋盘底部）
            let bottom = vh - r.bottom + 15;
            const maxBottom = Math.max(12, vh - bubbleH - 12);
            bottom = Math.min(bottom, maxBottom);
            bottom = Math.max(bottom, 12);
            this._root.style.width = bubbleW + 'px';
            this._root.style.left = left + 'px';
            this._root.style.bottom = bottom + 'px';
            this._root.style.transform = 'translateX(0)';
            return;
          }
          if (spaceAbove >= bubbleH + 60) {
            // 上方空间充足：气泡放在人物头顶上方
            let bottom = vh - r.top + 16;
            // clamp：气泡顶部至少留 12px，底部至少留 12px
            const maxBottom = Math.max(12, vh - bubbleH - 12);
            bottom = Math.min(bottom, maxBottom);
            bottom = Math.max(bottom, 12);
            this._root.style.left = (r.left + r.width / 2) + 'px';
            this._root.style.bottom = bottom + 'px';
            this._root.style.transform = 'translateX(-50%)';
            return;
          }
          if (spaceBelow >= bubbleH + 40) {
            // 上方不够但下方够：气泡放在人物下方
            this._root.style.left = (r.left + r.width / 2) + 'px';
            this._root.style.bottom = Math.max(12, spaceBelow - 16) + 'px';
            this._root.style.transform = 'translateX(-50%)';
            return;
          }
          // 上下都不够：贴近人物，尽量完整显示
          this._root.style.left = (r.left + r.width / 2) + 'px';
          this._root.style.bottom = Math.max(12, Math.min(vh - r.top + 8, vh - bubbleH - 8)) + 'px';
          this._root.style.transform = 'translateX(-50%)';
          return;
        }
      }
      this._root.style.left = '50%';
      this._root.style.bottom = '40px';
      this._root.style.transform = 'translateX(-50%)';
    } catch (e) {
      console.warn('[DialogSystem] _positionBubble error:', e);
    }
  }

  /**
   * 渲染当前条目并启动打字机
   * @private
   */
  _renderItem(item) {
    try {
      this._ensureDom();

      // 说话人（v2.0：avatar 元素已移除，不再渲染圆形头像）
      if (this._speakerEl) {
        this._speakerEl.textContent = item.speaker || '';
        this._speakerEl.style.display = item.speaker ? '' : 'none';
      }

      // 文本与打字机
      if (!this._textEl || !this._arrowEl) return;
      this._textEl.textContent = '';
      this._typedText = '';
      this._typeFinished = false;
      this._arrowEl.style.display = 'none';

      const speed = Math.max(0, item.typingSpeed || 0);
      let idx = 0;

      this._clearTyping();
      // [FEEL-LOG] 打字机节奏：开始打字（逐字间隔）
      if (typeof window !== 'undefined' && window.__feelLogEnabled) {
        console.log('[FEEL] typing_start', JSON.stringify({
          ts: Date.now(),
          textLen: item.text.length,
          speedMsPerChar: speed,
          estDurationMs: speed > 0 ? Math.round(item.text.length * speed) : 0,
          speaker: item.speaker || '',
        }));
      }
      if (speed <= 0 || item.text.length === 0) {
        // 同步补全
        this._textEl.textContent = item.text;
        this._typedText = item.text;
        this._typeFinished = true;
        this._arrowEl.style.display = '';
        // [FEEL-LOG] 打字机节奏：瞬时补全（speed<=0 或空文本）
        if (typeof window !== 'undefined' && window.__feelLogEnabled) {
          console.log('[FEEL] typing_instant', JSON.stringify({ ts: Date.now(), textLen: item.text.length }));
        }
        return;
      }

      this._typingTimer = setInterval(() => {
        try {
          idx++;
          if (!this._textEl) {
            this._clearTyping();
            return;
          }
          this._typedText = item.text.slice(0, idx);
          this._textEl.textContent = this._typedText;
          // v2.0：打字机音效——每 3 个非空格字符播一次（2026-08-15 用户反馈想更明显，密度 %6→%3）
          if (typeof AudioService !== 'undefined' && AudioService.sfx && item.typingSound !== false) {
            const ch = item.text[idx - 1];
            if (ch !== ' ' && ch !== '\u3000' && ch !== '\n' && (idx % 3) === 0) {
              try { AudioService.sfx.play('playTypewriterKey'); } catch (e) {}
            }
          }
          if (idx >= item.text.length) {
            this._clearTyping();
            this._typeFinished = true;
            if (this._arrowEl) this._arrowEl.style.display = '';
            // [FEEL-LOG] 打字机节奏：完成（实际耗时 vs 估算）
            if (typeof window !== 'undefined' && window.__feelLogEnabled) {
              console.log('[FEEL] typing_done', JSON.stringify({
                ts: Date.now(),
                textLen: item.text.length,
                speedMsPerChar: speed,
                actualDurationMs: Math.round(idx * speed),
                estDurationMs: Math.round(item.text.length * speed),
                deltaMs: Math.round(idx * speed - item.text.length * speed),
              }));
            }
          }
        } catch (e) {
          this._clearTyping();
          console.warn('[DialogSystem] typing interval error:', e);
        }
      }, speed);
    } catch (e) {
      console.warn('[DialogSystem] _renderItem error:', e);
    }
  }

  /**
   * 补全当前条目的打字机文本
   * @private
   */
  _finishTyping() {
    try {
      this._clearTyping();
      if (this._current && !this._typeFinished) {
        if (this._textEl) {
          this._textEl.textContent = this._current.text;
        }
        this._typedText = this._current.text;
        this._typeFinished = true;
        if (this._arrowEl) this._arrowEl.style.display = '';
      }
    } catch (e) {
      console.warn('[DialogSystem] _finishTyping error:', e);
    }
  }

  /**
   * 完成当前条目：触发条目回调并播放下一条；队列空则结束
   * @private
   */
  _advance() {
    try {
      const item = this._current;
      if (item && typeof item.onComplete === 'function') {
        try { item.onComplete(); } catch (e) { console.warn('[DialogSystem] item onComplete error:', e); }
      }
      this._current = null;
      this._playNext();
    } catch (e) {
      console.warn('[DialogSystem] _advance error:', e);
    }
  }

  /**
   * 整段结束
   * @param {boolean} skipped - 是否由 skip() 触发
   * @private
   */
  _finishAll(skipped) {
    try {
      this._clearTyping();
      const current = this._current;
      this._current = null;

      // sticky：保持显示，仅触发回调
      if (current && current.sticky) {
        if (current.onComplete && !skipped) {
          try { current.onComplete(); } catch (e) { console.warn('[DialogSystem] item onComplete error:', e); }
        }
        if (typeof this._onComplete === 'function') {
          try { this._onComplete({ skipped: skipped }); } catch (e) { console.warn('[DialogSystem] onComplete error:', e); }
        }
        return;
      }

      // 2026-08-03 修复时序竞态：先隐藏，再触发回调。
      // 回调（如教学下一条）可能同步 show() 新气泡；若先回调后隐藏，
      // 新气泡会被随后的 hide() 再次隐藏且 _showing 置 false，后续点击全部失效。
      this.hide();

      if (current && current.onComplete && !skipped) {
        try { current.onComplete(); } catch (e) { console.warn('[DialogSystem] item onComplete error:', e); }
      }
      if (typeof this._onComplete === 'function') {
        try { this._onComplete({ skipped: skipped }); } catch (e) { console.warn('[DialogSystem] onComplete error:', e); }
      }
    } catch (e) {
      console.warn('[DialogSystem] _finishAll error:', e);
    }
  }

  /**
   * 点击继续：未打完 -> 补全；已打完 -> 下一条/结束
   * @private
   */
  _handleClick() {
    try {
      if (!this._showing) return;
      if (!this._typeFinished) {
        this._finishTyping();
        return;
      }
      if (this._queue.length > 0) {
        this._advance();
      } else {
        this._finishAll(false);
      }
    } catch (e) {
      console.warn('[DialogSystem] _handleClick error:', e);
    }
  }

  /**
   * 清理打字机定时器
   * @private
   */
  _clearTyping() {
    if (this._typingTimer !== null) {
      clearInterval(this._typingTimer);
      this._typingTimer = null;
    }
  }

  // ============================================================
  //  DOM
  // ============================================================

  /**
   * 惰性创建 DOM（不在此前访问 document）
   * @private
   */
  _ensureDom() {
    if (this._root || typeof document === 'undefined') return;

    const root = document.createElement('div');
    root.className = 'cm-dialog cm-dialog--' + this._type;
    root.style.display = 'none';

    // 对话主体（可点击继续）
    const body = document.createElement('div');
    body.className = 'cm-dialog-body';

    // v2.0：移除 avatar 元素——avatarFor 恒返回空，圆形头像占位（守/妍/莹/设
    // 或空圆底）无意义，直接不创建，气泡内容区完全展开

    const content = document.createElement('div');
    content.className = 'cm-dialog-content';

    this._speakerEl = document.createElement('div');
    this._speakerEl.className = 'cm-dialog-speaker';

    this._textEl = document.createElement('div');
    this._textEl.className = 'cm-dialog-text';

    this._arrowEl = document.createElement('span');
    this._arrowEl.className = 'cm-dialog-arrow';
    this._arrowEl.textContent = '\u25BC'; // ▼

    content.appendChild(this._speakerEl);
    content.appendChild(this._textEl);
    content.appendChild(this._arrowEl);
    body.appendChild(content);
    root.appendChild(body);

    // 点击继续
    body.addEventListener('click', () => this._handleClick());

    // V4.3.26：长按对话气泡 → 跳过全部剩余对话
    let _skipLongPressTimer = null;
    const _startSkipLongPress = () => {
      if (_skipLongPressTimer) clearTimeout(_skipLongPressTimer);
      _skipLongPressTimer = setTimeout(() => {
        _skipLongPressTimer = null;
        // 显示"跳过"反馈
        if (this._textEl) {
          const origText = this._textEl.textContent;
          this._textEl.textContent = I18n.t('ui.dialog.skipped');
          setTimeout(() => {
            if (this._textEl) this._textEl.textContent = origText;
          }, 300);
        }
        this.skip();
      }, 800);
    };
    const _cancelSkipLongPress = () => {
      if (_skipLongPressTimer) { clearTimeout(_skipLongPressTimer); _skipLongPressTimer = null; }
    };
    body.addEventListener('pointerdown', _startSkipLongPress);
    body.addEventListener('pointerup', _cancelSkipLongPress);
    body.addEventListener('pointerleave', _cancelSkipLongPress);
    body.addEventListener('pointercancel', _cancelSkipLongPress);

    // 若指定了容器，挂到容器内；否则作为浮层挂到 body
    if (this._container) {
      this._container.appendChild(root);
    } else {
      document.body.appendChild(root);
    }

    this._root = root;
    this._bubbleEl = body;
    this._injectStyles();

    // 窗口变化时重定位（锚定 Q 版人物的气泡保持跟随）
    if (typeof window !== 'undefined' && !this._resizeBound) {
      this._resizeBound = () => {
        if (this._showing) {
          try { this._positionBubble(); } catch (e) {}
        }
      };
      window.addEventListener('resize', this._resizeBound);
    }

    // 点击屏幕任意位置切换下一句（2026-08-03）：
    // 气泡自身的点击已绑定；其余区域点击同样推进（跳过气泡内点击避免双触发）
    if (typeof document !== 'undefined' && !this._globalClickBound) {
      this._globalClickBound = true;
      document.addEventListener('click', (e) => {
        try {
          if (!this._showing) return;
          // 气泡/面板自身的点击由其内部 handler 处理
          if (e.target && e.target.closest && e.target.closest('.cm-dialog')) return;
          this._handleClick();
        } catch (err) {
          console.warn('[DialogSystem] global click error:', err);
        }
      });
    }
  }

  /**
   * 注入默认样式（首次创建 DOM 时执行）
   * @private
   */
  _injectStyles() {
    if (typeof document === 'undefined' || document.getElementById('cm-dialog-style')) return;

    const style = document.createElement('style');
    style.id = 'cm-dialog-style';
    style.textContent = [
      '.cm-dialog { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%);',
      '  width: min(560px, 92vw); z-index: 9000; }',
      '.cm-dialog--bubble .cm-dialog-body { background: rgba(30,22,14,.96); color: #f2e8da;',
      '  border: 1px solid #d4a853; border-radius: 14px; padding: 14px 18px;',
      '  box-shadow: 0 8px 30px rgba(0,0,0,.4); cursor: pointer; }',
      '.cm-dialog--panel .cm-dialog-body { background: #fdfaf5; color: #3a3229;',
      '  border: 1px solid #e2d6c8; border-radius: 12px; padding: 16px 18px;',
      '  box-shadow: 0 8px 30px rgba(0,0,0,.25); cursor: pointer; }',
      '.cm-dialog-content { flex: 1; min-width: 0; }',
      '.cm-dialog-speaker { font-size: 12px; font-weight: 600; color: #d4a853; margin-bottom: 4px; }',
      '.cm-dialog--panel .cm-dialog-speaker { color: #6b4f3a; }',
      '.cm-dialog-text { font-size: 14px; line-height: 1.5; display: inline; word-break: break-word; }',
      '.cm-dialog-arrow { display: inline-block; margin-left: 6px; font-size: 10px; color: #d4a853;',
      '  animation: cm-dialog-blink 1s step-end infinite; }',
      '@keyframes cm-dialog-blink { 50% { opacity: 0; } }',
    ].join('\n');
    document.head.appendChild(style);
  }
}

export default DialogSystem;