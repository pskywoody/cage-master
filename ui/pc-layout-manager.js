// ==========================================
// PcLayoutManager - V4 PC 双栏布局管理器
// ==========================================
// 迁移自 cagemaster3-new/ui/PcLayoutManager.js，适配 V4 DOM 结构。
//
// V3 版通过物理搬运 canvas 到 #pc-board-container 实现双栏；
// V4 版棋盘 canvas 本就固定在 #board-container 内，因此采用
// 「纯 CSS 双栏 + 右侧信息面板同步」方案：
//   - 检测宽屏（>=900px 且横屏）后给 body 加 pc-layout-active class，
//     由 game.html 的 CSS 将 #app 切换为双栏布局
//   - 右侧面板 #pc-right-panel 显示：关卡信息 / 计时 / 填数进度 / 三幕指示
//   - 提供 syncToPc() 供页面在 updateTimer/updateFillStats 等时机调用
//
// 设计约束：
//   - 不依赖 core/（纯 UI 层）
//   - 所有方法 try-catch + null 防御
//   - 元素不存在时静默降级

export class PcLayoutManager {
  /**
   * @param {Object} [options={}]
   * @param {Function} [options.onLayoutChange] - 布局切换回调 (isPc) => {}
   */
  constructor(options = {}) {
    try {
      this._isPcLayout = false;
      this._layoutResizeTimer = null;
      this._onLayoutChange = typeof options.onLayoutChange === 'function' ? options.onLayoutChange : null;
      this._hasDom = (typeof document !== 'undefined' && typeof window !== 'undefined');
    } catch (e) {
      console.warn('[PcLayoutManager] constructor error:', e);
      this._isPcLayout = false;
    }
  }

  /**
   * 检测当前是否应使用 PC 双栏布局。
   * P0-3：改为按屏幕宽高比判定——宽度 >= 900px 且宽高比 >= 1.4（约 16:9 及更宽）
   * 才激活双栏；9:16 竖屏手机 / 平板竖屏（宽高比 < 1.4）一律单栏。
   * 1.4 阈值覆盖 16:10 (1.6)、16:9 (1.78)、21:9 (2.33) 等宽屏，
   * 且排除 4:3 (1.33) 竖屏平板与折叠屏竖置。
   * @returns {boolean}
   */
  isPcLayoutActive() {
    try {
      if (!this._hasDom) return false;
      const w = window.innerWidth;
      const h = window.innerHeight || 1;
      return w >= 900 && (w / h) >= 1.4;
    } catch (e) {
      return false;
    }
  }

  /**
   * 切换布局（自动判断）
   */
  updateLayout() {
    try {
      const shouldBePc = this.isPcLayoutActive();
      if (shouldBePc && !this._isPcLayout) {
        this._setPcLayout(true);
      } else if (!shouldBePc && this._isPcLayout) {
        this._setPcLayout(false);
      }
    } catch (e) {
      console.warn('[PcLayoutManager] updateLayout error:', e);
    }
  }

  /**
   * 设置布局状态
   * @param {boolean} isPc
   * @private
   */
  _setPcLayout(isPc) {
    try {
      this._isPcLayout = isPc;
      if (this._hasDom) {
        document.body.classList.toggle('pc-layout-active', isPc);
      }
      // 同步右侧面板数据
      this.syncToPc();
      // 回调
      if (this._onLayoutChange) {
        try { this._onLayoutChange(isPc); } catch (e) { /* 忽略 */ }
      }
    } catch (e) {
      console.warn('[PcLayoutManager] _setPcLayout error:', e);
    }
  }

  /**
   * 初始化：绑定 resize / orientationchange 监听
   */
  init() {
    try {
      if (!this._hasDom) return;
      const self = this;

      window.addEventListener('resize', () => {
        if (self._layoutResizeTimer) clearTimeout(self._layoutResizeTimer);
        self._layoutResizeTimer = setTimeout(() => {
          self.updateLayout();
          self.syncToPc();
        }, 150);
      });

      window.addEventListener('orientationchange', () => {
        setTimeout(() => {
          self.updateLayout();
          self.syncToPc();
        }, 200);
      });

      // 初始检测
      this.updateLayout();
      this.syncToPc();
    } catch (e) {
      console.warn('[PcLayoutManager] init error:', e);
    }
  }

  /**
   * 同步右侧面板数据（关卡信息 / 计时 / 进度 / 三幕）
   * 幂等：元素缺失时静默跳过
   */
  syncToPc() {
    try {
      if (!this._hasDom) return;

      // 计时
      const timerSrc = document.getElementById('timerDisplay');
      const timerDst = document.getElementById('pc-timer-display');
      if (timerSrc && timerDst) timerDst.textContent = timerSrc.textContent;

      // 关卡信息
      const badgeSrc = document.getElementById('levelBadge');
      const badgeDst = document.getElementById('pc-level-info');
      if (badgeSrc && badgeDst) badgeDst.textContent = badgeSrc.textContent;

      // 填数进度
      const fillSrc = document.getElementById('fillStats');
      const fillDst = document.getElementById('pc-fill-stats');
      if (fillSrc && fillDst) fillDst.textContent = fillSrc.textContent;

      // 选中格信息
      const selSrc = document.getElementById('selectedInfo');
      const selDst = document.getElementById('pc-selected-info');
      if (selSrc && selDst) selDst.textContent = selSrc.textContent;

      // v2.0：三幕指示已移除（幕一/二/三无实际意义）
    } catch (e) {
      console.warn('[PcLayoutManager] syncToPc error:', e);
    }
  }

  /** 当前是否为 PC 布局 */
  isPcLayout() {
    return this._isPcLayout;
  }

  /** 销毁：移除监听 */
  destroy() {
    try {
      if (this._layoutResizeTimer) clearTimeout(this._layoutResizeTimer);
      this._layoutResizeTimer = null;
    } catch (e) {
      console.warn('[PcLayoutManager] destroy error:', e);
    }
  }
}

export default PcLayoutManager;
