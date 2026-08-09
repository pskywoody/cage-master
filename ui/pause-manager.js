// ==========================================
// PauseManager - V4 暂停菜单管理器
// ==========================================
// 迁移自 cagemaster3-new/ui/PauseManager.js，适配 V4 结构。
//
// 职责：
//   - 暂停/恢复：调用注入的回调（onPause/onResume），由页面决定
//     如何暂停计时器、专家系统心跳等
//   - 暂停菜单 UI：#pauseOverlay 模态（恢复 / 重新开始 / 章节选择 / 返回主页）
//   - 弹窗栈 + 滚动锁定（简化版）
//
// 设计约束：
//   - 纯 UI 层，不依赖 core/
//   - 所有方法 try-catch + null 防御
//   - 元素缺失时静默降级

export class PauseManager {
  /**
   * @param {Object} deps
   * @param {Function} [deps.isPaused] - () => boolean
   * @param {Function} [deps.setPaused] - (v:boolean) => {}
   * @param {Function} [deps.onPause] - 暂停回调（页面停表/停专家系统）
   * @param {Function} [deps.onResume] - 恢复回调（页面开表/恢复专家系统）
   * @param {Function} [deps.isCompleted] - () => boolean 关卡是否完成
   * @param {Function} [deps.isBoardReady] - () => boolean 棋盘是否就绪
   * @param {Function} [deps.onRestart] - 重新开始回调
   * @param {Function} [deps.onOpenChapters] - 打开章节抽屉回调
   * @param {Function} [deps.onExitToHome] - 返回主页回调
   */
  constructor(deps = {}) {
    this._deps = deps || {};
    this._hasDom = (typeof document !== 'undefined' && typeof window !== 'undefined');
    this._modalStack = [];
    this._overlay = null;
    this._overlayId = 'pauseOverlay';
  }

  _isPaused() {
    try {
      return this._deps.isPaused ? !!this._deps.isPaused() : false;
    } catch (e) { return false; }
  }

  _setPaused(v) {
    try {
      if (this._deps.setPaused) this._deps.setPaused(v);
    } catch (e) { console.warn('[PauseManager] setPaused error:', e); }
  }

  /**
   * 初始化：绑定暂停按钮 / ESC 键
   * @param {string} [btnId=pauseBtn] - 暂停按钮元素 id
   */
  init(btnId = 'pauseBtn') {
    try {
      if (!this._hasDom) return;

      // 暂停按钮
      const btn = document.getElementById(btnId);
      if (btn) {
        btn.addEventListener('click', () => this.togglePause());
      }

      // ESC 键（模态优先关闭，其次暂停）
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        // 若已有更高优先级的模态打开（过关弹窗），则不处理
        const completeModal = document.getElementById('completeModal');
        if (completeModal && completeModal.classList.contains('open')) return;
        const drawer = document.getElementById('chapterDrawer');
        if (drawer && drawer.classList.contains('open')) return;
        // 修复：ESC 双监听冲突——game.html 的 window 层也监听 ESC（取消数字笔/关抽屉）。
        // document 先于 window 冒泡，本处理已接管为暂停，必须阻止冒泡，避免单次按键双重副作用。
        e.stopPropagation();
        this.togglePause();
      });
    } catch (e) {
      console.warn('[PauseManager] init error:', e);
    }
  }

  /** 切换暂停状态 */
  togglePause() {
    try {
      if (this._isPaused()) {
        this.hidePauseMenu();
      } else {
        this.showPauseMenu();
      }
    } catch (e) {
      console.warn('[PauseManager] togglePause error:', e);
    }
  }

  /** 显示暂停菜单 */
  showPauseMenu() {
    try {
      if (!this._hasDom) return;
      if (this._isPaused()) return;
      if (this._deps.isCompleted && this._deps.isCompleted()) return;
      if (this._deps.isBoardReady && !this._deps.isBoardReady()) return;

      this._setPaused(true);
      this._lockBodyScroll('pause');

      // 回调：页面停表/停专家系统
      if (this._deps.onPause) {
        try { this._deps.onPause(); } catch (e) { console.warn('[PauseManager] onPause error:', e); }
      }

      this._overlay = document.getElementById(this._overlayId);
      if (this._overlay) {
        this._overlay.classList.add('open');
      }

      // 更新暂停面板时间
      this.updatePauseTime();
    } catch (e) {
      console.warn('[PauseManager] showPauseMenu error:', e);
    }
  }

  /** 隐藏暂停菜单 */
  hidePauseMenu() {
    try {
      if (!this._isPaused()) return;
      this._setPaused(false);
      this._popModal('pause');

      this._overlay = document.getElementById(this._overlayId);
      if (this._overlay) {
        this._overlay.classList.remove('open');
      }

      // 回调：页面开表/恢复专家系统
      if (this._deps.onResume) {
        try { this._deps.onResume(); } catch (e) { console.warn('[PauseManager] onResume error:', e); }
      }
    } catch (e) {
      console.warn('[PauseManager] hidePauseMenu error:', e);
    }
  }

  /** 更新暂停面板的已用时间显示 */
  updatePauseTime() {
    try {
      if (!this._hasDom) return;
      const el = document.getElementById('pause-time');
      if (!el) return;
      const timerEl = document.getElementById('timerDisplay');
      if (timerEl) el.textContent = timerEl.textContent;
    } catch (e) {
      console.warn('[PauseManager] updatePauseTime error:', e);
    }
  }

  // ===== 弹窗栈 / 滚动锁定 =====

  _lockBodyScroll(id) {
    try {
      if (!this._hasDom) return;
      if (this._modalStack.indexOf(id) === -1) {
        this._modalStack.push(id);
      }
      if (!document.body.classList.contains('modal-open')) {
        document.body.classList.add('modal-open');
        document.body.dataset.scrollTop = String(window.scrollY || document.documentElement.scrollTop || 0);
      }
    } catch (e) { /* 忽略 */ }
  }

  _popModal(id) {
    try {
      if (!this._hasDom) return;
      const idx = this._modalStack.indexOf(id);
      if (idx !== -1) this._modalStack.splice(idx, 1);
      if (this._modalStack.length === 0) {
        document.body.classList.remove('modal-open');
        const st = parseInt(document.body.dataset.scrollTop || '0', 10);
        if (st > 0) window.scrollTo(0, st);
      }
    } catch (e) { /* 忽略 */ }
  }

  /** 当前是否暂停中 */
  isPaused() {
    return this._isPaused();
  }
}

export default PauseManager;
