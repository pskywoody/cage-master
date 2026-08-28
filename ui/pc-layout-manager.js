// ==========================================
// PcLayoutManager - 响应式桌面布局管理器
// ==========================================
// 2026-08-22 重构：从「纯 CSS media query 双栏」升级为「JS 驱动的三模式布局」。
//
// 三种模式（由 availableWidth / availableHeight / aspectRatio 综合判定）：
//   LARGE   —— 窗口宽且够高：棋盘 + 右侧完整控制面板（右栏 360-420px）
//   COMPACT —— 中等窗口：棋盘 + 紧凑控制面板（右栏 ~300-340px）
//   STACKED —— 窄窗口：棋盘在上、工具区在下（单栏，无右栏）
//
// 核心原则（棋盘优先）：
//   棋盘 > 数字键盘 > 信息面板。
//   任何模式下，若要显示右栏导致棋盘 < MIN_BOARD(650px)，则自动降级为 STACKED。
//   选定的棋盘尺寸直接写入 #board-container 的 CSS 变量 --board-size，
//   JS 是棋盘/右栏配比的唯一权威来源（取代散落的 media query）。
//
// 视觉收紧顺序（由先到后，守住棋盘不缩）：
//   减空白(padding/gap) → 减栏间距(_GAP) → 压右栏宽 → 最后才缩棋盘。
//
// 设计约束：
//   - 仅 UI 层：不触碰核心/数据/存档/评分
//   - 纯 try-catch + null 防御，元素缺失静默降级

export class PcLayoutManager {
  constructor(options = {}) {
    try {
      this._mode = 'stacked'; // large | compact | stacked
      this._layoutResizeTimer = null;
      this._onLayoutChange = typeof options.onLayoutChange === 'function' ? options.onLayoutChange : null;
      this._hasDom = (typeof document !== 'undefined' && typeof window !== 'undefined');
      this._toolRollHome = null;
      // 尺寸预算常量（近似：顶栏/状态行/间距）
      this._TOPBAR = 56;
      this._STATUS = 30;
      this._GAP = 8;             // 棋盘↔控制栏间距（进一步收紧，8px，非 0 防视觉粘连）
      this._PC_LEDGER = 56;      // PC 双栏下 45账本贴棋盘顶的让位高度预算
      this._SIDE_PAD = 16;
      this._V_PAD = 24;
      this._MIN_BOARD = 650;      // 棋盘下限（双栏预算）
      this._CAP = 860;            // 超大窗口棋盘上限
    } catch (e) {
      console.warn('[PcLayoutManager] constructor error:', e);
      this._mode = 'stacked';
    }
  }

  /**
   * 右栏宽度（与 CSS 的 clamp() 保持一致，供板宽预算用）。
   *   LARGE   —— clamp(360px, 22vw, 420px)
   *   COMPACT —— clamp(300px, 22vw, 340px)
   */
  _rightPanelWidth(mode, w) {
    if (mode === 'large') {
      // clamp(360px, 22vw, 420px) —— 440 太重，720:860 视觉≈重，压到 420 上限
      return Math.round(Math.min(420, Math.max(360, w * 0.22)));
    }
    return Math.round(Math.min(340, Math.max(300, w * 0.22)));
  }

  /**
   * 计算当前应为哪种布局，并给出棋盘尺寸（像素）。
   * @returns {{mode:string, board:number}}
   */
  computeLayout() {
    if (!this._hasDom) return { mode: 'stacked', board: 0 };
    const w = window.innerWidth;
    const h = window.innerHeight || 1;
    // aspectRatio 经「宽度预算」与「高度预算」间接纳入：棋盘取 min(baseW, baseH)，
    // 横屏宽裕则宽度主导、矮窗短栏则高度主导、窄屏则自动降级 STACKED。

    // 模式基线按宽度判定（LARGE ≥1400 / COMPACT 1000-1400 / STACKED <1000）
    const mode = w >= 1400 ? 'large' : (w >= 1000 ? 'compact' : 'stacked');
    const stackedBoard = this._computeStackedBoard(w, h);
    if (mode === 'stacked') {
      return { mode: 'stacked', board: stackedBoard };
    }

    // 双栏预算：高度预算含 45账本贴盘让位(_PC_LEDGER)，保证一屏放得下
    const rightW = this._rightPanelWidth(mode, w);
    const baseW = w - rightW - this._GAP - this._SIDE_PAD * 2;
    const baseH = h - this._TOPBAR - this._STATUS - this._V_PAD - this._PC_LEDGER;

    // 棋盘优先：仅当「宽度预算」挤不出 ≥MIN_BOARD(650) 时才降级单栏——
    // 因为只有宽度受限时，去掉右栏才能释放出更大的棋盘。
    // 高度受限（矮窗口，如 1280×720）不降级：STACKED 只会让棋盘更矮，反而不如双栏。
    if (baseW < this._MIN_BOARD) {
      return { mode: 'stacked', board: stackedBoard };
    }

    const board = Math.round(Math.min(baseW, baseH, this._CAP));
    return { mode, board };
  }

  /** 单栏棋盘尺寸（工具区在棋盘下方，垂直方向受限） */
  _computeStackedBoard(w, h) {
    const toolBlock = 200; // 工具区 + 间距预算
    const bw = w - this._SIDE_PAD * 2;
    const bh = h - this._TOPBAR - this._STATUS - toolBlock;
    return Math.max(Math.round(Math.min(bw, bh)), 320);
  }

  /** 当前模式 */
  getLayoutMode() {
    return this._mode;
  }

  /**
   * 应用布局：写 body[data-layout] + 双栏 class + 棋盘 --board-size + 工具区搬移
   * @private
   */
  applyLayout(layout) {
    try {
      if (!this._hasDom) return;
      const mode = layout.mode;
      const board = Math.max(Math.round(layout.board), 320);
      const changed = mode !== this._mode;

      this._mode = mode;
      document.body.setAttribute('data-layout', mode);
      const isPc = (mode === 'large' || mode === 'compact');
      document.body.classList.toggle('pc-layout-active', isPc);

      // 棋盘优先：尺寸唯一权威来源
      const bc = document.getElementById('board-container');
      if (bc) bc.style.setProperty('--board-size', board + 'px');
      const sl = document.getElementById('statusLine');
      if (sl) sl.style.setProperty('--board-size', board + 'px');

      this._repositionToolRoll(isPc);
      this.syncToPc();

      if (changed && this._onLayoutChange) {
        try { this._onLayoutChange(mode); } catch (e) { /* 忽略 */ }
      }
    } catch (e) {
      console.warn('[PcLayoutManager] applyLayout error:', e);
    }
  }

  /**
   * 更新布局（自动判定；仅在模式变化时应用）
   */
  updateLayout() {
    try {
      const layout = this.computeLayout();
      this.applyLayout(layout);
    } catch (e) {
      console.warn('[PcLayoutManager] updateLayout error:', e);
    }
  }

  /**
   * 将工具卷（数字键盘 + 工具栏）在「右侧面板」与「主区底部」之间搬移。
   * 双栏：移入 #pc-right-panel；单栏：移回原位/主区底部。
   * 仅移动 DOM 节点，不重建（事件监听、数字键盘结构均保留）。
   * @private
   */
  _repositionToolRoll(putInRightPanel) {
    try {
      if (!this._hasDom) return;
      const toolRoll = document.getElementById('toolRoll');
      if (!toolRoll) return;
      const rightPanel = document.getElementById('pc-right-panel');
      const main = document.getElementById('main');
      if (putInRightPanel) {
        if (rightPanel && toolRoll.parentElement !== rightPanel) {
          if (!this._toolRollHome && toolRoll.parentElement) {
            this._toolRollHome = toolRoll.parentElement;
          }
          rightPanel.appendChild(toolRoll);
        }
      } else {
        if (this._toolRollHome && toolRoll.parentElement !== this._toolRollHome) {
          this._toolRollHome.appendChild(toolRoll);
        } else if (main && toolRoll.parentElement !== main) {
          main.appendChild(toolRoll);
        }
      }
    } catch (e) {
      console.warn('[PcLayoutManager] _repositionToolRoll error:', e);
    }
  }

  /**
   * 初始化：绑定 resize / orientationchange 监听并应用首次布局
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
        setTimeout(() => { self.updateLayout(); self.syncToPc(); }, 200);
      });
      this.updateLayout();
      this.syncToPc();
    } catch (e) {
      console.warn('[PcLayoutManager] init error:', e);
    }
  }

  /**
   * 同步右侧面板数据（关卡信息 / 计时 / 进度 / 选中格）
   * 幂等：元素缺失时静默跳过
   */
  syncToPc() {
    try {
      if (!this._hasDom) return;
      const timerSrc = document.getElementById('timerDisplay');
      const timerDst = document.getElementById('pc-timer-display');
      if (timerSrc && timerDst) timerDst.textContent = timerSrc.textContent;

      const badgeSrc = document.getElementById('levelBadge');
      const badgeDst = document.getElementById('pc-level-info');
      if (badgeSrc && badgeDst) badgeDst.textContent = badgeSrc.textContent;

      const fillSrc = document.getElementById('fillStats');
      const fillDst = document.getElementById('pc-fill-stats');
      if (fillSrc && fillDst) fillDst.textContent = fillSrc.textContent;

      const selSrc = document.getElementById('selectedInfo');
      const selDst = document.getElementById('pc-selected-info');
      if (selSrc && selDst) selDst.textContent = selSrc.textContent;
    } catch (e) {
      console.warn('[PcLayoutManager] syncToPc error:', e);
    }
  }

  /** 当前是否为双栏（large/compact） */
  isPcLayout() {
    return this._mode === 'large' || this._mode === 'compact';
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