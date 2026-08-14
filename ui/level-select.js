// ==========================================
// level-select.js - V4 UI 层：LevelSelect 关卡选择
// ==========================================
// 说明（参照 CageMasterV4-refactoring-manual sec2-4 与附录 B）：
//   ui/level-select.js 渲染「章节 → 关卡」选择界面，
//   基于 core/level-manager.js 的解锁规则（DAG 顺序解锁）展示：
//     - 锁定（locked）  ：前一关未完成，不可点击
//     - 可玩（playable）：已解锁且未通关
//     - 已通关（completed）：已完成，可重玩
//   支持长按关卡图标 3 秒触发「重新教学」：
//     - 调用 LevelManager.resetLevelTeaching(levelId) 清除教学完成标记
//     - 触发 onReplayLesson(levelId) 回调
//
// 环境约束：
//   - 纯 ES Module 语法；无模块顶层 DOM 访问（Node import 不报错）。
//   - render() 返回 HTML 字符串；mount() 挂载到容器并绑定事件。
// ==========================================

import { LevelManager } from '../core/level-manager.js';
import I18n from '../i18n/i18n.js';

export class LevelSelect {
  /**
   * @param {Object} options
   * @param {HTMLElement} [options.container] - 挂载容器（可选，也可稍后 mount）
   * @param {LevelManager} options.levelManager - LevelManager 实例（必填）
   * @param {Function} [options.onSelect] - 选择关卡回调 (levelId) => void
   * @param {Function} [options.onReplayLesson] - 长按重新教学回调 (levelId) => void
   * @param {number} [options.longPressMs=3000] - 长按阈值（毫秒），默认 3000
   * @param {string} [options.emptyText] - 无章节数据时的占位文案
   */
  constructor(options) {
    options = options || {};
    if (!options.levelManager) {
      throw new Error('LevelSelect: levelManager is required');
    }

    /** @type {LevelManager} */
    this._levelManager = options.levelManager;

    /** @type {HTMLElement|null} */
    this._container = options.container || null;

    /** @type {Function|null} */
    this._onSelect = typeof options.onSelect === 'function' ? options.onSelect : null;

    /** @type {Function|null} */
    this._onReplayLesson = typeof options.onReplayLesson === 'function' ? options.onReplayLesson : null;

    /** @type {number} 长按触发阈值（毫秒） */
    this._longPressMs = options.longPressMs || 3000;

    /** @type {string} */
    this._emptyText = options.emptyText || I18n.t('ui.levelSelect.empty');

    /** @type {boolean} 样式是否已注入 */
    this._stylesInjected = false;

    /** @type {boolean} 是否已挂载 */
    this._mounted = false;
  }

  // ============================================================
  //  数据
  // ============================================================

  /**
   * 加载章节索引并渲染（委托 LevelManager.loadChapters）
   * @param {Array} chaptersData - data/chapters.json 的 chapters 数组
   * @returns {boolean}
   */
  loadChapters(chaptersData) {
    try {
      if (!this._levelManager) return false;
      const ok = this._levelManager.loadChapters(chaptersData);
      if (ok) this.render();
      return ok;
    } catch (e) {
      console.warn('[LevelSelect] loadChapters error:', e);
      return false;
    }
  }

  /**
   * 获取底层 LevelManager
   * @returns {LevelManager}
   */
  getLevelManager() {
    return this._levelManager;
  }

  // ============================================================
  //  渲染
  // ============================================================

  /**
   * V4.3.19：判断关卡是否为隐藏关（按需加载关卡元数据并缓存）
   * 隐藏关（isHidden: true）不在章节列表显示，仅通过特定方式解锁进入。
   * @param {number} levelId
   * @returns {boolean}
   * @private
   */
  _isHiddenLevel(levelId) {
    if (this._hiddenCache === undefined) this._hiddenCache = {};
    if (this._hiddenCache[levelId] !== undefined) return this._hiddenCache[levelId];
    // 默认不隐藏（同步渲染不被异步拖慢）；异步确认后再刷新
    this._hiddenCache[levelId] = false;
    if (typeof fetch === 'function') {
      fetch('data/levels/level-' + levelId + '.json')
        .then(function (resp) { return resp.ok ? resp.json() : null; })
        .then(function (data) {
          if (data && data.isHidden) {
            this._hiddenCache[levelId] = true;
            this.render(); // 隐藏关加载后重绘隐藏
          }
        }.bind(this))
        .catch(function () {});
    }
    return false;
  }

  /**
   * 重新渲染（若已挂载则刷新 DOM）
   * @returns {string} 渲染出的 HTML 字符串
   */
  render() {
    try {
      const html = this._buildHtml();
      if (this._mounted && this._container) {
        this._renderIntoContainers(html);
        this._bindEvents();
      }
      return html;
    } catch (e) {
      console.warn('[LevelSelect] render error:', e);
      return '<div class="cm-level-select cm-empty">' + I18n.t('ui.levelSelect.renderError') + '</div>';
    }
  }

  /**
   * 生成章节 → 关卡选择界面 HTML
   * @returns {string}
   */
  _buildHtml() {
    try {
      if (!this._levelManager) return '<div class="cm-level-select cm-empty">' + this._escapeHtml(this._emptyText) + '</div>';
      const chapters = this._levelManager.getChapters() || [];
      if (chapters.length === 0) {
        return '<div class="cm-level-select cm-empty">' + this._escapeHtml(this._emptyText) + '</div>';
      }

      const parts = ['<div class="cm-level-select">'];
      for (let ci = 0; ci < chapters.length; ci++) {
        const chapter = chapters[ci];
        if (!chapter || !Array.isArray(chapter.levelIds)) continue;

        const levelIds = chapter.levelIds;
        // V4.3.19：过滤隐藏关（isHidden: true 的关卡不在章节列表显示，仅通过特定方式解锁）
        const visibleIds = levelIds.filter((id) => !this._isHiddenLevel(id));
        const completedInChapter = visibleIds.filter((id) => this._levelManager.isLevelCompleted(id)).length;

        parts.push('<section class="cm-chapter" data-chapter="' + chapter.chapterId + '">');
        parts.push('<header class="cm-chapter-header">');
        // v2.1：章节标题/描述优先走 i18n 语言包（chapters.{id}.title / .description），缺省回退 chapters.json
        const chTitle = I18n.t('chapters.' + chapter.chapterId + '.title');
        const chTitleFinal = (chTitle && chTitle.indexOf('chapters.') !== 0) ? chTitle : (chapter.title || I18n.t('ui.levelSelect.unnamedChapter'));
        parts.push('<h3 class="cm-chapter-title">' + I18n.t('ui.levelSelect.chapterTitle', { chapter: chapter.chapterId, title: this._escapeHtml(chTitleFinal) }) + '</h3>');
        parts.push('<span class="cm-chapter-progress">' + completedInChapter + '/' + visibleIds.length + '</span>');
        parts.push('</header>');
        const chDesc = I18n.t('chapters.' + chapter.chapterId + '.description');
        const chDescFinal = (chDesc && chDesc.indexOf('chapters.') !== 0) ? chDesc : (chapter.description || '');
        if (chDescFinal) {
          parts.push('<p class="cm-chapter-desc">' + this._escapeHtml(chDescFinal) + '</p>');
        }
        parts.push('<div class="cm-level-grid">');

        for (let li = 0; li < visibleIds.length; li++) {
          const levelId = visibleIds[li];
          const status = this._getStatus(levelId);
          const label = this._getLevelLabel(levelId, status);
          parts.push(this._buildLevelIcon(levelId, status, label));
        }

        parts.push('</div>');
        parts.push('</section>');
      }
      parts.push('</div>');
      return parts.join('');
    } catch (e) {
      console.warn('[LevelSelect] _buildHtml error:', e);
      return '<div class="cm-level-select cm-empty">' + I18n.t('ui.levelSelect.buildError') + '</div>';
    }
  }

  /**
   * 构建单个关卡图标（HTML 字符串）
   * @param {number} levelId
   * @param {string} status - locked | playable | completed
   * @param {string} label - 图标上显示的文字
   * @returns {string}
   */
  _buildLevelIcon(levelId, status, label) {
    const statusClass = 'cm-level cm-level--' + status;
    const aria = status === 'locked' ? ' locked' : (status === 'completed' ? ' completed' : ' playable');
    return '<div class="' + statusClass + '" data-level="' + levelId + '" data-status="' + status +
      '" role="button" tabindex="0" aria-label="' + I18n.t('ui.levelSelect.ariaLevel', { level: levelId }) + aria + '">' +
      '<span class="cm-level-badge">' + this._escapeHtml(label) + '</span>' +
      '<span class="cm-level-status">' + this._statusText(status) + '</span>' +
      '</div>';
  }

  /**
   * 关卡状态：locked / playable / completed
   * @param {number} levelId
   * @returns {string}
   */
  _getStatus(levelId) {
    try {
      if (!this._levelManager) return 'locked';
      if (this._levelManager.isLevelCompleted(levelId)) return 'completed';
      if (this._levelManager.isLevelUnlocked(levelId)) return 'playable';
      return 'locked';
    } catch (e) {
      return 'locked';
    }
  }

  /**
   * 关卡图标文字：完成显示对勾，锁定显示锁，可玩显示关卡号
   * @param {number} levelId
   * @param {string} status
   * @returns {string}
   */
  _getLevelLabel(levelId, status) {
    if (status === 'completed') return '\u2705';
    if (status === 'locked') return '\uD83D\uDD12';
    return String(levelId % 100);
  }

  /**
   * 状态文案
   * @param {string} status
   * @returns {string}
   */
  _statusText(status) {
    switch (status) {
      case 'completed': return I18n.t('ui.levelSelect.completed');
      case 'playable': return I18n.t('ui.levelSelect.playable');
      default: return I18n.t('ui.levelSelect.locked');
    }
  }

  /**
   * 挂载到容器并绑定事件（v2.0：支持多容器——书壳章节列表页 + 原章节抽屉共用同一实例）
   * @param {HTMLElement} [container] - 未在构造时传入则在此指定
   * @returns {boolean}
   */
  mount(container) {
    try {
      if (container) {
        if (!this._containers) this._containers = [];
        if (this._containers.indexOf(container) === -1) this._containers.push(container);
        this._container = container;
      }
      if (!this._container) return false;

      this._injectStyles();
      const html = this._buildHtml();
      this._renderIntoContainers(html);
      this._mounted = true;
      this._bindEvents();
      return true;
    } catch (e) {
      console.warn('[LevelSelect] mount error:', e);
      return false;
    }
  }

  /** 渲染到所有已挂载容器 */
  _renderIntoContainers(html) {
    const list = this._containers && this._containers.length ? this._containers : [this._container];
    list.forEach((c) => { if (c) c.innerHTML = html; });
  }

  /**
   * 解绑并清空容器
   */
  destroy() {
    try {
      if (this._container) {
        this._container.innerHTML = '';
      }
      this._mounted = false;
    } catch (e) {
      console.warn('[LevelSelect] destroy error:', e);
    }
  }

  /**
   * 刷新（保持挂载状态重新渲染）
   */
  refresh() {
    this.render();
  }

  // ============================================================
  //  事件绑定
  // ============================================================

  /**
   * 绑定所有关卡图标的事件：点击 + 长按（3 秒重新教学）
   * @private
   */
  _bindEvents() {
    try {
      if (!this._container || typeof document === 'undefined') return;

      const icons = this._container.querySelectorAll('.cm-level');
      for (let i = 0; i < icons.length; i++) {
        this._bindLevelIcon(icons[i]);
      }
    } catch (e) {
      console.warn('[LevelSelect] _bindEvents error:', e);
    }
  }

  /**
   * 绑定单个关卡图标
   * @private
   */
  _bindLevelIcon(el) {
    try {
      if (!el) return;
      const levelId = parseInt(el.getAttribute('data-level'), 10);
      const status = el.getAttribute('data-status');

      let pressTimer = null;
      let longPressFired = false;

      const cancelPress = () => {
        if (pressTimer !== null) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      // 长按开始
      el.addEventListener('pointerdown', (e) => {
        try {
          if (status === 'locked') return;
          longPressFired = false;
          cancelPress();
          pressTimer = setTimeout(() => {
            pressTimer = null;
            longPressFired = true;
            this._handleLongPress(levelId);
          }, this._longPressMs);
        } catch (e) {
          console.warn('[LevelSelect] pointerdown error:', e);
        }
      });

      // 取消长按
      el.addEventListener('pointerup', cancelPress);
      el.addEventListener('pointerleave', cancelPress);
      el.addEventListener('pointercancel', cancelPress);

      // 长按触发的重新教学需要手势释放，避免同一次触摸再触发点击
      el.addEventListener('click', (e) => {
        try {
          if (longPressFired) {
            e.preventDefault();
            e.stopPropagation();
            longPressFired = false;
            return;
          }
          this._handleSelect(levelId);
        } catch (e) {
          console.warn('[LevelSelect] click error:', e);
        }
      });

      // 键盘可达性（Enter / Space）
      el.addEventListener('keydown', (e) => {
        try {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            this._handleSelect(levelId);
          }
        } catch (e) {
          console.warn('[LevelSelect] keydown error:', e);
        }
      });

      // 屏蔽移动端长按系统菜单
      el.addEventListener('contextmenu', (e) => e.preventDefault());
    } catch (e) {
      console.warn('[LevelSelect] _bindLevelIcon error:', e);
    }
  }

  /**
   * 选择关卡
   * @private
   */
  _handleSelect(levelId) {
    try {
      if (!this._levelManager) return;
      if (!this._levelManager.isLevelUnlocked(levelId)) {
        // 规格 4.5：点击未解锁 → 轻微摇晃 + 提示
        const el = this._container && this._container.querySelector('.cm-level[data-level="' + levelId + '"]');
        if (el) {
          el.classList.remove('cm-shake');
          void el.offsetWidth;
          el.classList.add('cm-shake');
          setTimeout(() => { try { el.classList.remove('cm-shake'); } catch (e) {} }, 500);
        }
        // Q5：明确提示前置关卡号（原"完成前置章节解锁"含糊；配合 toast 提升到
        // 抽屉之上，用户不再看到"点了没反应"）
        let prevText = I18n.t('ui.levelSelect.unlockPrev');
        try {
          const lm = this._levelManager;
          if (lm && typeof lm._getPrevLevel === 'function') {
            const prevId = lm._getPrevLevel(levelId);
            if (prevId != null) prevText = I18n.t('ui.levelSelect.unlockLevel', { level: prevId });
          }
        } catch (e) {}
        this._toast(prevText, 1800);
        return;
      }
      if (typeof this._onSelect === 'function') {
        this._onSelect(levelId);
      }
    } catch (e) {
      console.warn('[LevelSelect] _handleSelect error:', e);
    }
  }

  /**
   * 轻提示（game.html 挂载 window.showToast；缺失时静默）
   * @private
   */
  _toast(msg, dur) {
    try {
      if (typeof window.showToast === 'function') window.showToast(msg, dur);
    } catch (e) {}
  }

  /**
   * 长按触发重新教学（手册 sec2-2 异常处理：长按 3 秒触发 resetLessonPlan）
   * @private
   */
  _handleLongPress(levelId) {
    try {
      if (!this._levelManager) return;
      if (!this._levelManager.isLevelUnlocked(levelId)) return;

      // 清除教学完成标记，使下次进入关卡重新教学
      if (typeof this._levelManager.resetLevelTeaching === 'function') {
        this._levelManager.resetLevelTeaching(levelId);
      }
      if (typeof this._onReplayLesson === 'function') {
        this._onReplayLesson(levelId);
      }
    } catch (e) {
      console.warn('[LevelSelect] _handleLongPress error:', e);
    }
  }

  // ============================================================
  //  样式与工具
  // ============================================================

  /**
   * 注入默认样式（首次挂载时执行一次）
   * @private
   */
  _injectStyles() {
    if (this._stylesInjected || typeof document === 'undefined') return;
    this._stylesInjected = true;

    const style = document.createElement('style');
    style.id = 'cm-level-select-style';
    style.textContent = [
      '/* P1：章节列表 = 书内目录页（纸墨体系，匹配书壳） */',
      '.cm-level-select { font-family: inherit; padding: 8px 0; }',
      '.cm-empty { color: var(--color-ink-muted); padding: 24px; text-align: center; }',
      '.cm-chapter { margin-bottom: 20px; }',
      '.cm-chapter-header { display: flex; align-items: baseline; gap: 10px; }',
      '.cm-chapter-title { font-size: 17px; font-weight: 700; color: #3d2a1a; margin: 0 0 4px; font-family: \'ZCOOL XiaoWei\',\'KaiTi\',\'楷体\',serif; letter-spacing: 1px; }',
      '.cm-chapter-progress { font-size: 12px; color: var(--color-ink-muted); }',
      '.cm-chapter-desc { font-size: 12px; color: #6b5a42; margin: 2px 0 10px; line-height: 1.5; }',
      '.cm-level-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: 10px; }',
      '.cm-level { display: flex; flex-direction: column; align-items: center; gap: 4px;',
      '  padding: 8px 4px; border-radius: 6px; cursor: pointer; user-select: none;',
      '  border: 1px solid rgba(90,70,40,.35); background: rgba(237,229,208,.65); transition: transform .15s, box-shadow .15s; }',
      '.cm-level:hover { transform: translateY(-2px); box-shadow: 0 3px 10px rgba(140,100,60,.18); }',
      '.cm-level-badge { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center;',
      '  justify-content: center; font-size: 14px; font-weight: 700; color: #f5f0e0; background: #a08a70; }',
      '.cm-level-status { font-size: 11px; color: var(--color-ink-muted); }',
      '.cm-level--completed .cm-level-badge { background: #5a9e6e; }',
      '.cm-level--completed .cm-level-status { color: #5a9e6e; }',
      '.cm-level--locked { cursor: not-allowed; opacity: .55; filter: grayscale(.6); }',
      '.cm-level--locked .cm-level-badge { background: #b8aa9a; }',
      '.cm-level--locked:hover { transform: none; box-shadow: none; }',
      '.cm-level.cm-shake { animation: cmLevelShake .4s ease; }',
      '@keyframes cmLevelShake { 0%,100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 50% { transform: translateX(4px); } 75% { transform: translateX(-3px); } }',
      '.cm-level:focus-visible { outline: 2px solid #b8860b; outline-offset: 1px; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /**
   * HTML 转义
   * @private
   */
  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export default LevelSelect;