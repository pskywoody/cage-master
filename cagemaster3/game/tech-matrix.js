/**
 * ============================================================
 *  TechMatrix - 技术矩阵 · 侦探推理笔记面板
 * ============================================================
 *
 *  高级推理辅助工具，类似侦探的线索板，帮助玩家整理思路。
 *  包含四个 Tab：
 *    1. 🔍 证据链 - 当前提示的完整推理过程（观察→排除→结论）
 *    2. 📋 演算区 - 钉选的格子/数字，便签纸风格
 *    3. 📊 技巧雷达 - 实时检测可用的高级技巧
 *    4. 🔥 候选热力图 - 某个数字在所有格子中的候选状态
 *
 *  依赖：
 *    - Board 实例（读取候选数、格子状态）
 *    - TechRater 实例（技巧检测，可选）
 *    - Renderer 实例（棋盘高亮，可选）
 *    - AudioService（音效，可选）
 *
 *  用法：
 *    const matrix = new TechMatrix({
 *      board: board,
 *      techRater: techRater,
 *      renderer: renderer,
 *      container: document.body,
 *      onClose: () => {},
 *    });
 *    matrix.show();
 *    matrix.hide();
 *    matrix.toggle();
 *    matrix.update(board);
 *    matrix.showEvidence(hintResult);
 *    matrix.pinCell(r, c, group);
 *
 * ============================================================
 */

;(function(global) {
  'use strict';

  // ========================================================
  //  Tab 定义
  // ========================================================
  const TABS = [
    { id: 'evidence',  name: '证据链', icon: '🔍' },
    { id: 'workspace', name: '演算区', icon: '📋' },
    { id: 'radar',     name: '技巧雷达', icon: '📊' },
    { id: 'heatmap',   name: '热力图', icon: '🔥' },
  ];

  // ========================================================
  //  技巧定义（与 TechRater 对齐，用于雷达图显示）
  // ========================================================
  const TECH_LIST = [
    { id: 'nakedSingle',      name: '孤星',         alias: '裸单' },
    { id: 'cageUnique',       name: '唯一组合',      alias: '笼子唯一组合' },
    { id: 'hiddenSingle',     name: '隐曜',         alias: '隐单' },
    { id: 'rule45',           name: '星衡法则',      alias: '45法则' },
    { id: 'nakedPair',        name: '并蒂锁',        alias: '裸数对' },
    { id: 'hiddenPair',       name: '双曜',         alias: '隐数对' },
    { id: 'pointingClaiming', name: '区块排除',      alias: 'Pointing' },
    { id: 'nakedTriplet',     name: '三子法',        alias: '裸三数组' },
    { id: 'xWing',            name: '二连纵横阵',    alias: 'X-Wing' },
    { id: 'swordfish',        name: '三才游鱼阵',    alias: 'Swordfish' },
  ];

  // 演算区分组
  const WORKSPACE_GROUPS = [
    { id: 'observation', name: '观察', color: '#60a5fa', icon: '👁' },
    { id: 'hypothesis',  name: '假设', color: '#fbbf24', icon: '💭' },
    { id: 'conclusion',  name: '结论', color: '#34d399', icon: '✅' },
  ];

  // ========================================================
  //  TechMatrix 主类
  // ========================================================
  class TechMatrix {
    /**
     * @param {Object} [options]
     * @param {Board} [options.board] - 棋盘实例
     * @param {Object} [options.techRater] - TechRater 类（构造函数，可选）
     * @param {Renderer} [options.renderer] - 渲染器实例（用于高亮）
     * @param {HTMLElement} [options.container] - 面板容器父元素
     * @param {Function} [options.onClose] - 关闭回调
     */
    constructor(options = {}) {
      this.board = options.board || null;
      this.techRaterClass = options.techRater || null;
      this.renderer = options.renderer || null;
      this.container = options.container || document.body;
      this.onClose = options.onClose || null;

      this.visible = false;
      this.activeTab = 'evidence';
      this.el = null;
      this.overlay = null;

      // 状态
      this.currentHint = null;         // 当前提示结果
      this.expandedLayers = { observation: true, elimination: true, conclusion: true };
      this.pinnedCells = [];           // 钉选的格子 [{r, c, group, note}]
      this.heatmapNumber = 5;          // 热力图当前数字
      this.radarCache = null;          // 雷达图缓存
      this._radarDirty = true;

      this._build();
    }

    // === 公共 API ===

    show() {
      if (this.visible) return;
      this.visible = true;
      if (this.overlay) this.overlay.classList.add('show');
      if (this.el) this.el.classList.add('show');
      this._playSfx('paper_flip');
      // 刷新内容
      this._refreshRadar();
      this._renderHeatmap();
    }

    hide() {
      if (!this.visible) return;
      this.visible = false;
      if (this.overlay) this.overlay.classList.remove('show');
      if (this.el) this.el.classList.remove('show');
      // 清除棋盘高亮
      this._clearBoardHighlight('tech-matrix');
      if (this.onClose) this.onClose();
    }

    toggle() {
      if (this.visible) this.hide();
      else this.show();
    }

    /**
     * 棋盘变化时更新
     * @param {Board} [board]
     */
    update(board) {
      if (board) this.board = board;
      this._radarDirty = true;
      if (this.visible) {
        this._refreshRadar();
        this._renderHeatmap();
        this._renderWorkspace();
      }
    }

    /**
     * 显示某个提示的证据链
     * @param {Object} hintResult - HintSystem.getHint() 的返回值
     */
    showEvidence(hintResult) {
      if (!hintResult) return;
      this.currentHint = hintResult;
      this._switchTab('evidence');
      this._renderEvidence();
      if (!this.visible) this.show();
    }

    /**
     * 钉选一个格子到演算区
     * @param {number} r - 行
     * @param {number} c - 列
     * @param {string} [group='observation'] - 分组
     * @param {string} [note=''] - 备注
     */
    pinCell(r, c, group = 'observation', note = '') {
      // 检查是否已钉选
      const existing = this.pinnedCells.find(p => p.r === r && p.c === c);
      if (existing) {
        existing.group = group;
        if (note) existing.note = note;
      } else {
        this.pinnedCells.push({ r, c, group, note });
      }
      this._renderWorkspace();
    }

    /**
     * 移除钉选的格子
     */
    unpinCell(r, c) {
      this.pinnedCells = this.pinnedCells.filter(p => !(p.r === r && p.c === c));
      this._renderWorkspace();
    }

    /**
     * 设置渲染器（后续绑定）
     */
    setRenderer(renderer) {
      this.renderer = renderer;
    }

    /**
     * 设置棋盘（后续绑定）
     */
    setBoard(board) {
      this.board = board;
      this._radarDirty = true;
    }

    // === 构建 DOM ===

    _build() {
      // 遮罩层
      this.overlay = document.createElement('div');
      this.overlay.id = 'tech-matrix-overlay';
      this.overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.65);
        z-index: 19000;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.3s ease;
        backdrop-filter: blur(4px);
      `;
      this.overlay.addEventListener('click', () => this.hide());

      // 面板主体
      this.el = document.createElement('div');
      this.el.id = 'tech-matrix-panel';
      this.el.style.cssText = `
        position: fixed; top: 0; right: 0; width: 380px; height: 100%;
        max-width: 92vw;
        background:
          linear-gradient(180deg, rgba(30,28,38,0.98) 0%, rgba(20,18,28,0.98) 100%);
        border-left: 1px solid rgba(251,191,36,0.15);
        z-index: 20000;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        display: flex;
        flex-direction: column;
        box-shadow: -8px 0 40px rgba(0, 0, 0, 0.6);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
      `;

      this.el.innerHTML = `
        <!-- 头部 -->
        <div class="tm-header" style="
          padding: 18px 20px 14px;
          border-bottom: 1px solid rgba(251,191,36,0.1);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-shrink: 0;
          position: relative;
        ">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 22px;">📋</span>
            <div>
              <div style="font-size: 17px; font-weight: 700; color: #fbbf24; letter-spacing: 2px;">技术矩阵</div>
              <div style="font-size: 10px; color: #78716c; letter-spacing: 3px; margin-top: 2px;">— TECH MATRIX —</div>
            </div>
          </div>
          <button class="tm-close-btn" style="
            width: 34px; height: 34px;
            border: 1px solid rgba(251,191,36,0.2);
            background: rgba(251,191,36,0.05);
            color: #a8a29e;
            border-radius: 8px;
            cursor: pointer;
            font-size: 16px;
            display: flex; align-items: center; justify-content: center;
            transition: all 0.15s;
          ">✕</button>
          <!-- 装饰：图钉 -->
          <div style="position: absolute; top: -2px; left: 50%; transform: translateX(-50%);
            width: 12px; height: 12px; border-radius: 50%;
            background: radial-gradient(circle at 30% 30%, #ef4444, #991b1b);
            box-shadow: 0 1px 3px rgba(0,0,0,0.5);
          "></div>
        </div>

        <!-- Tab 导航 -->
        <div class="tm-tabs" style="
          display: flex;
          border-bottom: 1px solid rgba(251,191,36,0.08);
          flex-shrink: 0;
          padding: 0 8px;
          background: rgba(0,0,0,0.2);
        ">
          ${TABS.map(tab => `
            <button class="tm-tab-btn" data-tab="${tab.id}" style="
              flex: 1;
              padding: 12px 6px;
              background: none;
              border: none;
              color: #78716c;
              cursor: pointer;
              font-size: 12px;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
              transition: all 0.15s;
              border-bottom: 2px solid transparent;
              margin-bottom: -1px;
              font-family: inherit;
            ">
              <span style="font-size: 18px;">${tab.icon}</span>
              <span>${tab.name}</span>
            </button>
          `).join('')}
        </div>

        <!-- 内容区（可滚动） -->
        <div class="tm-content" style="
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 16px;
          position: relative;
        ">
          <!-- 证据链面板 -->
          <div class="tm-tab-panel" data-panel="evidence" style="display: none;">
            <div class="tm-evidence-empty" style="
              text-align: center;
              padding: 60px 20px;
              color: #57534e;
            ">
              <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">🔍</div>
              <div style="font-size: 14px; margin-bottom: 6px;">暂无证据链</div>
              <div style="font-size: 11px; opacity: 0.7;">使用提示后，这里会显示完整推理过程</div>
            </div>
            <div class="tm-evidence-content" style="display: none;"></div>
          </div>

          <!-- 演算区面板 -->
          <div class="tm-tab-panel" data-panel="workspace" style="display: none;">
            <div class="tm-workspace-hint" style="
              font-size: 11px;
              color: #78716c;
              text-align: center;
              padding: 8px 12px;
              background: rgba(251,191,36,0.05);
              border: 1px dashed rgba(251,191,36,0.15);
              border-radius: 8px;
              margin-bottom: 14px;
              line-height: 1.6;
            ">
              💡 在棋盘上 <b>长按格子</b> 可钉选到演算区<br>
              分组整理你的观察、假设与结论
            </div>
            <div class="tm-workspace-groups"></div>
          </div>

          <!-- 技巧雷达面板 -->
          <div class="tm-tab-panel" data-panel="radar" style="display: none;">
            <div class="tm-radar-summary" style="
              background: linear-gradient(135deg, rgba(251,191,36,0.08) 0%, rgba(239,68,68,0.05) 100%);
              border: 1px solid rgba(251,191,36,0.15);
              border-radius: 10px;
              padding: 14px;
              margin-bottom: 14px;
            ">
              <div style="font-size: 11px; color: #a8a29e; letter-spacing: 2px; margin-bottom: 6px;">当前最可能的技巧</div>
              <div class="tm-radar-top-tech" style="font-size: 18px; font-weight: 700; color: #fbbf24;">检测中...</div>
            </div>
            <div class="tm-radar-list"></div>
          </div>

          <!-- 候选热力图面板 -->
          <div class="tm-tab-panel" data-panel="heatmap" style="display: none;">
            <div style="margin-bottom: 14px;">
              <div style="font-size: 11px; color: #78716c; margin-bottom: 8px; letter-spacing: 1px;">选择数字查看分布</div>
              <div class="tm-heatmap-numpad" style="
                display: grid;
                grid-template-columns: repeat(9, 1fr);
                gap: 4px;
              "></div>
            </div>
            <div class="tm-heatmap-grid-wrap" style="
              background: rgba(0,0,0,0.3);
              border-radius: 10px;
              padding: 10px;
              border: 1px solid rgba(251,191,36,0.1);
            ">
              <div class="tm-heatmap-grid" style="
                display: grid;
                gap: 2px;
                aspect-ratio: 1;
              "></div>
            </div>
            <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 10px; color: #57534e;">
              <span>◀ 不可能</span>
              <span class="tm-heatmap-count" style="color: #a8a29e;">-- 个候选</span>
              <span>可能 ▶</span>
            </div>
          </div>
        </div>

        <!-- 底部 -->
        <div class="tm-footer" style="
          padding: 12px 16px;
          border-top: 1px solid rgba(251,191,36,0.08);
          flex-shrink: 0;
          text-align: center;
          font-size: 10px;
          color: #57534e;
          letter-spacing: 2px;
        ">
          真相，藏在数字之间
        </div>
      `;

      // 注入样式
      this._injectStyles();

      this.container.appendChild(this.overlay);
      this.container.appendChild(this.el);

      this._bindEvents();
      this._initHeatmapNumpad();
      this._switchTab('evidence');
    }

    _injectStyles() {
      const style = document.createElement('style');
      style.textContent = `
        #tech-matrix-panel.show { transform: translateX(0) !important; }
        #tech-matrix-overlay.show { opacity: 1 !important; pointer-events: auto !important; }

        #tech-matrix-panel .tm-tab-btn.active {
          color: #fbbf24 !important;
          border-bottom-color: #fbbf24 !important;
          background: rgba(251,191,36,0.05) !important;
        }
        #tech-matrix-panel .tm-tab-btn:hover {
          color: #d6d3d1 !important;
        }
        #tech-matrix-panel .tm-close-btn:hover {
          background: rgba(239,68,68,0.15) !important;
          border-color: rgba(239,68,68,0.3) !important;
          color: #f87171 !important;
        }

        /* 滚动条 */
        #tech-matrix-panel .tm-content::-webkit-scrollbar {
          width: 4px;
        }
        #tech-matrix-panel .tm-content::-webkit-scrollbar-track {
          background: transparent;
        }
        #tech-matrix-panel .tm-content::-webkit-scrollbar-thumb {
          background: rgba(251,191,36,0.2);
          border-radius: 2px;
        }

        /* 证据链样式 */
        .tm-layer {
          margin-bottom: 14px;
          border-radius: 10px;
          overflow: hidden;
          border: 1px solid rgba(251,191,36,0.1);
        }
        .tm-layer-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          cursor: pointer;
          transition: background 0.15s;
        }
        .tm-layer-header:hover {
          background: rgba(251,191,36,0.05);
        }
        .tm-layer-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tm-layer-icon {
          font-size: 16px;
        }
        .tm-layer-title {
          font-size: 13px;
          font-weight: 600;
          color: #e7e5e4;
        }
        .tm-layer-badge {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 10px;
          font-weight: 600;
        }
        .tm-layer-arrow {
          color: #78716c;
          font-size: 12px;
          transition: transform 0.2s;
        }
        .tm-layer.collapsed .tm-layer-arrow {
          transform: rotate(-90deg);
        }
        .tm-layer-body {
          padding: 0 14px 12px;
          font-size: 12px;
          color: #a8a29e;
          line-height: 1.7;
        }
        .tm-layer.collapsed .tm-layer-body {
          display: none;
        }

        /* 观察层 */
        .tm-layer-observation .tm-layer-header {
          background: rgba(96,165,250,0.08);
        }
        .tm-layer-observation .tm-layer-badge {
          background: rgba(96,165,250,0.15);
          color: #60a5fa;
        }

        /* 排除层 */
        .tm-layer-elimination .tm-layer-header {
          background: rgba(239,68,68,0.06);
        }
        .tm-layer-elimination .tm-layer-badge {
          background: rgba(239,68,68,0.15);
          color: #f87171;
        }

        /* 结论层 */
        .tm-layer-conclusion .tm-layer-header {
          background: rgba(52,211,153,0.08);
        }
        .tm-layer-conclusion .tm-layer-badge {
          background: rgba(52,211,153,0.15);
          color: #34d399;
        }

        .tm-evidence-cell-list {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 6px;
        }
        .tm-evidence-cell-chip {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 3px 8px;
          background: rgba(251,191,36,0.08);
          border: 1px solid rgba(251,191,36,0.15);
          border-radius: 6px;
          font-size: 11px;
          color: #d6d3d1;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tm-evidence-cell-chip:hover {
          background: rgba(251,191,36,0.15);
          border-color: rgba(251,191,36,0.3);
        }
        .tm-highlight-btn {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 10px;
          margin-top: 8px;
          background: rgba(251,191,36,0.1);
          border: 1px solid rgba(251,191,36,0.25);
          border-radius: 6px;
          font-size: 11px;
          color: #fbbf24;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .tm-highlight-btn:hover {
          background: rgba(251,191,36,0.2);
        }
        .tm-elim-item {
          padding: 4px 0;
          border-bottom: 1px dashed rgba(239,68,68,0.1);
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .tm-elim-item:last-child {
          border-bottom: none;
        }
        .tm-elim-num {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(239,68,68,0.15);
          color: #f87171;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 700;
          text-decoration: line-through;
        }
        .tm-conclusion-box {
          background: rgba(52,211,153,0.08);
          border: 1px solid rgba(52,211,153,0.2);
          border-radius: 8px;
          padding: 10px 12px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .tm-conclusion-num {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(52,211,153,0.2);
          color: #34d399;
          border-radius: 8px;
          font-size: 20px;
          font-weight: 900;
        }
        .tm-tech-badge {
          display: inline-block;
          padding: 2px 8px;
          background: rgba(168,85,247,0.15);
          color: #c084fc;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          margin-bottom: 8px;
        }

        /* 演算区 */
        .tm-ws-group {
          margin-bottom: 16px;
        }
        .tm-ws-group-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 8px;
          padding-bottom: 6px;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .tm-ws-group-title .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .tm-ws-cards {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .tm-ws-card {
          background: linear-gradient(135deg, rgba(251,191,36,0.06) 0%, rgba(251,191,36,0.02) 100%);
          border: 1px solid rgba(251,191,36,0.12);
          border-radius: 8px;
          padding: 10px 12px;
          position: relative;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tm-ws-card:hover {
          border-color: rgba(251,191,36,0.3);
          transform: translateX(2px);
        }
        .tm-ws-card::before {
          content: '';
          position: absolute;
          top: -3px;
          left: 12px;
          width: 20px;
          height: 6px;
          background: rgba(239,68,68,0.6);
          border-radius: 2px;
          transform: rotate(-2deg);
        }
        .tm-ws-card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 4px;
        }
        .tm-ws-card-pos {
          font-size: 11px;
          color: #a8a29e;
          font-family: monospace;
        }
        .tm-ws-card-remove {
          width: 18px;
          height: 18px;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #78716c;
          border-radius: 4px;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tm-ws-card-remove:hover {
          color: #f87171;
          background: rgba(239,68,68,0.1);
        }
        .tm-ws-card-nums {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .tm-ws-num {
          width: 22px;
          height: 22px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(251,191,36,0.1);
          color: #fbbf24;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
        }
        .tm-ws-card-note {
          font-size: 11px;
          color: #78716c;
          margin-top: 6px;
          font-style: italic;
        }
        .tm-ws-empty {
          font-size: 11px;
          color: #57534e;
          text-align: center;
          padding: 8px;
          font-style: italic;
        }
        .tm-ws-group-select {
          margin-left: auto;
          font-size: 10px;
          padding: 2px 6px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 4px;
          color: #a8a29e;
          cursor: pointer;
        }

        /* 雷达列表 */
        .tm-radar-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          margin-bottom: 6px;
          background: rgba(255,255,255,0.02);
          border: 1px solid rgba(255,255,255,0.05);
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tm-radar-item:hover {
          background: rgba(255,255,255,0.04);
          border-color: rgba(251,191,36,0.15);
        }
        .tm-radar-item.found {
          background: rgba(52,211,153,0.06);
          border-color: rgba(52,211,153,0.25);
        }
        .tm-radar-item.possible {
          background: rgba(251,191,36,0.04);
          border-color: rgba(251,191,36,0.15);
        }
        .tm-radar-item-icon {
          font-size: 18px;
          width: 28px;
          text-align: center;
        }
        .tm-radar-item-info {
          flex: 1;
        }
        .tm-radar-item-name {
          font-size: 13px;
          font-weight: 600;
          color: #e7e5e4;
        }
        .tm-radar-item-alias {
          font-size: 10px;
          color: #78716c;
          margin-top: 2px;
        }
        .tm-radar-item-status {
          font-size: 10px;
          padding: 3px 8px;
          border-radius: 10px;
          font-weight: 600;
          white-space: nowrap;
        }
        .tm-radar-item-status.found {
          background: rgba(52,211,153,0.15);
          color: #34d399;
        }
        .tm-radar-item-status.possible {
          background: rgba(251,191,36,0.15);
          color: #fbbf24;
        }
        .tm-radar-item-status.unavailable {
          background: rgba(120,113,108,0.15);
          color: #78716c;
        }

        /* 热力图数字键盘 */
        .tm-hm-num-btn {
          aspect-ratio: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 6px;
          color: #a8a29e;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          font-family: inherit;
        }
        .tm-hm-num-btn:hover {
          background: rgba(251,191,36,0.1);
          color: #fbbf24;
          border-color: rgba(251,191,36,0.3);
        }
        .tm-hm-num-btn.active {
          background: rgba(251,191,36,0.2);
          color: #fbbf24;
          border-color: rgba(251,191,36,0.5);
          box-shadow: 0 0 8px rgba(251,191,36,0.3);
        }
        .tm-hm-cell {
          border-radius: 2px;
          transition: background 0.2s;
          position: relative;
        }
        .tm-hm-cell.filled {
          background: rgba(251,191,36,0.6) !important;
        }
        .tm-hm-cell.fixed {
          background: rgba(168,85,247,0.5) !important;
        }
      `;
      document.head.appendChild(style);
    }

    _bindEvents() {
      // 关闭按钮
      this.el.querySelector('.tm-close-btn').addEventListener('click', () => {
        this._playSfx('click');
        this.hide();
      });

      // Tab 切换
      this.el.querySelectorAll('.tm-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this._playSfx('click');
          this._switchTab(btn.dataset.tab);
        });
      });
    }

    _switchTab(tabId) {
      this.activeTab = tabId;
      // 更新 tab 按钮
      this.el.querySelectorAll('.tm-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabId);
      });
      // 更新面板
      this.el.querySelectorAll('.tm-tab-panel').forEach(panel => {
        panel.style.display = panel.dataset.panel === tabId ? 'block' : 'none';
      });
      // 懒加载内容
      if (tabId === 'radar') this._refreshRadar();
      if (tabId === 'heatmap') this._renderHeatmap();
      if (tabId === 'workspace') this._renderWorkspace();
      if (tabId === 'evidence') this._renderEvidence();
    }

    // === 证据链渲染 ===

    _renderEvidence() {
      const panel = this.el.querySelector('[data-panel="evidence"]');
      const emptyEl = panel.querySelector('.tm-evidence-empty');
      const contentEl = panel.querySelector('.tm-evidence-content');

      if (!this.currentHint) {
        emptyEl.style.display = 'block';
        contentEl.style.display = 'none';
        return;
      }

      emptyEl.style.display = 'none';
      contentEl.style.display = 'block';

      const hint = this.currentHint;
      const evidence = hint.evidence || {};
      const techniqueName = hint.techniqueName || hint.technique || '未知技巧';

      // 观察层数据
      const observationCells = this._extractObservationCells(evidence, hint);
      const observationText = this._buildObservationText(evidence, hint);

      // 排除层数据
      const eliminationItems = this._extractEliminations(evidence, hint);

      // 结论层数据
      const conclusion = this._extractConclusion(evidence, hint);

      contentEl.innerHTML = `
        <div style="margin-bottom: 14px;">
          <span class="tm-tech-badge">${techniqueName}</span>
          <div style="font-size: 12px; color: #a8a29e; line-height: 1.6;">
            ${hint.explanation || hint.dialogue || '通过观察与排除得出结论。'}
          </div>
        </div>

        <!-- 第一层：观察 -->
        <div class="tm-layer tm-layer-observation ${this.expandedLayers.observation ? '' : 'collapsed'}" data-layer="observation">
          <div class="tm-layer-header">
            <div class="tm-layer-header-left">
              <span class="tm-layer-icon">👁</span>
              <span class="tm-layer-title">观察</span>
              <span class="tm-layer-badge">${observationCells.length} 个线索</span>
            </div>
            <span class="tm-layer-arrow">▼</span>
          </div>
          <div class="tm-layer-body">
            <div>${observationText}</div>
            ${observationCells.length > 0 ? `
              <div class="tm-evidence-cell-list">
                ${observationCells.map(c => `
                  <span class="tm-evidence-cell-chip" data-r="${c.r}" data-c="${c.c}">
                    R${c.r + 1}C${c.c + 1}${c.v !== undefined ? ` = ${c.v}` : ''}
                  </span>
                `).join('')}
              </div>
              <button class="tm-highlight-btn" data-action="highlight-observation">
                🎯 在棋盘上高亮
              </button>
            ` : ''}
          </div>
        </div>

        <!-- 第二层：排除 -->
        <div class="tm-layer tm-layer-elimination ${this.expandedLayers.elimination ? '' : 'collapsed'}" data-layer="elimination">
          <div class="tm-layer-header">
            <div class="tm-layer-header-left">
              <span class="tm-layer-icon">✕</span>
              <span class="tm-layer-title">排除</span>
              <span class="tm-layer-badge">${eliminationItems.length} 项排除</span>
            </div>
            <span class="tm-layer-arrow">▼</span>
          </div>
          <div class="tm-layer-body">
            ${eliminationItems.length > 0 ? `
              ${eliminationItems.map(item => `
                <div class="tm-elim-item">
                  <span class="tm-elim-num">${item.num}</span>
                  <span>${item.reason}</span>
                </div>
              `).join('')}
              <button class="tm-highlight-btn" data-action="highlight-elimination">
                🎯 高亮排除区域
              </button>
            ` : '<div style="color: #78716c;">暂无排除步骤</div>'}
          </div>
        </div>

        <!-- 第三层：结论 -->
        <div class="tm-layer tm-layer-conclusion ${this.expandedLayers.conclusion ? '' : 'collapsed'}" data-layer="conclusion">
          <div class="tm-layer-header">
            <div class="tm-layer-header-left">
              <span class="tm-layer-icon">✅</span>
              <span class="tm-layer-title">结论</span>
              <span class="tm-layer-badge">确定</span>
            </div>
            <span class="tm-layer-arrow">▼</span>
          </div>
          <div class="tm-layer-body">
            ${conclusion ? `
              <div class="tm-conclusion-box">
                <span class="tm-conclusion-num">${conclusion.num}</span>
                <div>
                  <div style="font-size: 13px; font-weight: 600; color: #e7e5e4;">
                    R${conclusion.r + 1}C${conclusion.c + 1} = ${conclusion.num}
                  </div>
                  <div style="font-size: 11px; color: #78716c; margin-top: 3px;">
                    ${conclusion.reason || '此格唯一可能的数字'}
                  </div>
                </div>
              </div>
              <button class="tm-highlight-btn" data-action="highlight-conclusion">
                🎯 高亮目标格
              </button>
            ` : '<div style="color: #78716c;">暂无确定结论</div>'}
          </div>
        </div>
      `;

      // 绑定折叠事件
      contentEl.querySelectorAll('.tm-layer-header').forEach(header => {
        header.addEventListener('click', (e) => {
          if (e.target.closest('.tm-highlight-btn') || e.target.closest('.tm-evidence-cell-chip')) return;
          const layer = header.parentElement;
          const layerId = layer.dataset.layer;
          layer.classList.toggle('collapsed');
          this.expandedLayers[layerId] = !layer.classList.contains('collapsed');
          this._playSfx('click');
        });
      });

      // 绑定高亮按钮
      contentEl.querySelector('[data-action="highlight-observation"]')?.addEventListener('click', () => {
        this._highlightCells(observationCells, 'hint', 'tech-matrix-obs');
        this._playSfx('click');
      });
      contentEl.querySelector('[data-action="highlight-elimination"]')?.addEventListener('click', () => {
        const elimCells = this._getEliminationCells(evidence, hint);
        this._highlightCells(elimCells, 'error', 'tech-matrix-elim');
        this._playSfx('click');
      });
      contentEl.querySelector('[data-action="highlight-conclusion"]')?.addEventListener('click', () => {
        if (conclusion) {
          this._highlightCells([{ r: conclusion.r, c: conclusion.c }], 'success', 'tech-matrix-conc');
          this._playSfx('click');
        }
      });

      // 绑定格子芯片点击
      contentEl.querySelectorAll('.tm-evidence-cell-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          const r = parseInt(chip.dataset.r);
          const c = parseInt(chip.dataset.c);
          this._highlightCells([{ r, c }], 'hint', 'tech-matrix-chip');
          if (this.board && typeof this.board.selectCell === 'function') {
            this.board.selectCell(r, c);
          }
          if (this.renderer) this.renderer.render(this.board);
          this._playSfx('click');
        });
      });
    }

    _extractObservationCells(evidence, hint) {
      const cells = [];
      const type = evidence.type || hint.technique;

      if (evidence.targetCell) {
        cells.push({ r: evidence.targetCell[0], c: evidence.targetCell[1] });
      }
      if (evidence.rowNumbers) {
        evidence.rowNumbers.forEach(n => cells.push({ r: n.r, c: n.c, v: n.v }));
      }
      if (evidence.colNumbers) {
        evidence.colNumbers.forEach(n => cells.push({ r: n.r, c: n.c, v: n.v }));
      }
      if (evidence.boxNumbers) {
        evidence.boxNumbers.forEach(n => cells.push({ r: n.r, c: n.c, v: n.v }));
      }
      if (evidence.scopeCells) {
        evidence.scopeCells.forEach(([r, c]) => {
          if (!cells.find(cc => cc.r === r && cc.c === c)) {
            cells.push({ r, c });
          }
        });
      }
      if (hint.targetCells) {
        hint.targetCells.forEach(tc => {
          const r = tc.r !== undefined ? tc.r : tc.row;
          const c = tc.c !== undefined ? tc.c : tc.col;
          if (r !== undefined && c !== undefined && !cells.find(cc => cc.r === r && cc.c === c)) {
            cells.push({ r, c });
          }
        });
      }
      return cells.slice(0, 20); // 最多显示 20 个
    }

    _buildObservationText(evidence, hint) {
      const type = evidence.type || hint.technique;
      switch (type) {
        case 'nakedSingle':
          return `此格所在行/列/宫中已出现的数字排除了大部分可能，最终只剩下一个候选数。`;
        case 'hiddenSingle':
          const scopeText = evidence.scopeType === 'row' ? `第${evidence.scopeIndex + 1}行`
            : evidence.scopeType === 'col' ? `第${evidence.scopeIndex + 1}列`
            : `第${evidence.scopeIndex + 1}宫`;
          return `在${scopeText}中，数字 ${evidence.targetValue} 只有一个可能的位置。`;
        case 'rule45':
          return `利用「星衡法则」（${this.board ? this.board.size : 9}×${this.board ? this.board.size : 9}数独每行/列/宫和为 ${this.board ? this.board.size * (this.board.size + 1) / 2 : 45}），通过笼和反推边界格子的值。`;
        case 'nakedPair':
          return `在同一区域中，有两个格子恰好包含相同的两个候选数，它们构成了数对。`;
        case 'pointingClaiming':
          return `某数字在一个宫内只能出现在同一行/列上，因此可以排除该行/列其他位置的该数字。`;
        case 'cageUnique':
          return `笼子的和值限制使得剩余格子只有唯一的数字组合可能。`;
        default:
          return `观察盘面中的数字分布与候选状态。`;
      }
    }

    _extractEliminations(evidence, hint) {
      const items = [];
      const type = evidence.type || hint.technique;

      if (evidence.eliminated && evidence.eliminated.length > 0) {
        evidence.eliminated.forEach(num => {
          items.push({ num, reason: '已出现在相关区域中' });
        });
      }
      if (evidence.eliminatedPositions && evidence.eliminatedPositions.length > 0) {
        evidence.eliminatedPositions.forEach(ep => {
          const reasons = ep.reasons || ['候选被排除'];
          items.push({
            num: evidence.targetValue || '?',
            reason: `R${ep.cell[0] + 1}C${ep.cell[1] + 1} 因${reasons.join('、')}排除`
          });
        });
      }
      if (hint.eliminationSteps && hint.eliminationSteps > 0 && items.length === 0) {
        for (let i = 0; i < Math.min(hint.eliminationSteps, 5); i++) {
          items.push({ num: i + 1, reason: '通过规则排除' });
        }
      }
      if (items.length === 0 && evidence.candidates && evidence.candidates.length > 0) {
        const total = this.board ? this.board.size : 9;
        const elimCount = total - evidence.candidates.length;
        if (elimCount > 0) {
          items.push({ num: elimCount, reason: `个数字已被规则排除` });
        }
      }
      return items.slice(0, 10);
    }

    _getEliminationCells(evidence, hint) {
      const cells = [];
      if (evidence.eliminatedPositions) {
        evidence.eliminatedPositions.forEach(ep => {
          cells.push({ r: ep.cell[0], c: ep.cell[1] });
        });
      }
      return cells;
    }

    _extractConclusion(evidence, hint) {
      if (evidence.targetCell && evidence.targetValue !== undefined) {
        return {
          r: evidence.targetCell[0],
          c: evidence.targetCell[1],
          num: evidence.targetValue,
          reason: evidence.reason || ''
        };
      }
      if (hint.target) {
        return {
          r: hint.target.row !== undefined ? hint.target.row : hint.target.r,
          c: hint.target.col !== undefined ? hint.target.col : hint.target.c,
          num: hint.target.num || hint.target.value || '?',
          reason: ''
        };
      }
      if (hint.targetCells && hint.targetCells.length > 0) {
        const tc = hint.targetCells[0];
        return {
          r: tc.r !== undefined ? tc.r : tc.row,
          c: tc.c !== undefined ? tc.c : tc.col,
          num: tc.num || tc.value || '?',
          reason: ''
        };
      }
      return null;
    }

    // === 演算区渲染 ===

    _renderWorkspace() {
      const panel = this.el.querySelector('[data-panel="workspace"]');
      const groupsEl = panel.querySelector('.tm-workspace-groups');

      groupsEl.innerHTML = WORKSPACE_GROUPS.map(group => {
        const groupCells = this.pinnedCells.filter(p => p.group === group.id);
        return `
          <div class="tm-ws-group">
            <div class="tm-ws-group-title">
              <span class="dot" style="background: ${group.color};"></span>
              <span style="color: ${group.color};">${group.icon} ${group.name}</span>
              <span style="color: #57534e; font-size: 11px; font-weight: normal;">(${groupCells.length})</span>
            </div>
            <div class="tm-ws-cards">
              ${groupCells.length === 0
                ? '<div class="tm-ws-empty">暂无钉选</div>'
                : groupCells.map(pin => this._renderWorkspaceCard(pin)).join('')
              }
            </div>
          </div>
        `;
      }).join('');

      // 绑定事件
      groupsEl.querySelectorAll('.tm-ws-card-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const r = parseInt(btn.dataset.r);
          const c = parseInt(btn.dataset.c);
          this.unpinCell(r, c);
          this._playSfx('click');
        });
      });

      groupsEl.querySelectorAll('.tm-ws-card').forEach(card => {
        card.addEventListener('click', () => {
          const r = parseInt(card.dataset.r);
          const c = parseInt(card.dataset.c);
          if (this.board && typeof this.board.selectCell === 'function') {
            this.board.selectCell(r, c);
          }
          this._highlightCells([{ r, c }], 'hint', 'tech-matrix-ws');
          if (this.renderer) this.renderer.render(this.board);
          this._playSfx('click');
        });
      });

      // 分组切换
      groupsEl.querySelectorAll('.tm-ws-group-select').forEach(sel => {
        sel.addEventListener('click', (e) => {
          e.stopPropagation();
          // 简化版：循环切换分组
          const r = parseInt(sel.dataset.r);
          const c = parseInt(sel.dataset.c);
          const pin = this.pinnedCells.find(p => p.r === r && p.c === c);
          if (pin) {
            const idx = WORKSPACE_GROUPS.findIndex(g => g.id === pin.group);
            const nextIdx = (idx + 1) % WORKSPACE_GROUPS.length;
            pin.group = WORKSPACE_GROUPS[nextIdx].id;
            this._renderWorkspace();
            this._playSfx('click');
          }
        });
      });
    }

    _renderWorkspaceCard(pin) {
      const cell = this.board && this.board.cells[pin.r] && this.board.cells[pin.r][pin.c]
        ? this.board.cells[pin.r][pin.c]
        : null;

      let numsHtml = '';
      if (cell) {
        if (cell.fillNum || cell.fixedNum) {
          const num = cell.fillNum || cell.fixedNum;
          numsHtml = `<span class="tm-ws-num" style="background: rgba(168,85,247,0.2); color: #c084fc;">${num}</span>`;
        } else if (cell.candidates && cell.candidates.size > 0) {
          numsHtml = [...cell.candidates].sort((a, b) => a - b)
            .map(n => `<span class="tm-ws-num">${n}</span>`).join('');
        } else {
          numsHtml = '<span style="font-size: 11px; color: #57534e;">无候选</span>';
        }
      }

      return `
        <div class="tm-ws-card" data-r="${pin.r}" data-c="${pin.c}">
          <div class="tm-ws-card-header">
            <span class="tm-ws-card-pos">R${pin.r + 1}C${pin.c + 1}</span>
            <span class="tm-ws-card-remove" data-r="${pin.r}" data-c="${pin.c}" title="移除">✕</span>
          </div>
          <div class="tm-ws-card-nums">${numsHtml}</div>
          ${pin.note ? `<div class="tm-ws-card-note">"${pin.note}"</div>` : ''}
          <div style="margin-top: 6px; text-align: right;">
            <span class="tm-ws-group-select" data-r="${pin.r}" data-c="${pin.c}">切换分组 ↻</span>
          </div>
        </div>
      `;
    }

    // === 技巧雷达渲染 ===

    _refreshRadar() {
      if (!this.visible) return;
      const panel = this.el.querySelector('[data-panel="radar"]');
      if (!panel) return;

      const listEl = panel.querySelector('.tm-radar-list');
      const topTechEl = panel.querySelector('.tm-radar-top-tech');

      // 尝试用 TechRater 检测
      let detected = null;
      let availableMap = {};

      if (this.techRaterClass && this.board) {
        try {
          const rater = this._createTechRater();
          if (rater && typeof rater.findNextStep === 'function') {
            detected = rater.findNextStep();
          }
          // 逐个检测技巧可用性
          if (rater && typeof rater._findAllByTechnique === 'function') {
            TECH_LIST.forEach(tech => {
              try {
                const results = rater._findAllByTechnique(tech.id);
                availableMap[tech.id] = results && results.length > 0 ? 'found' : 'possible';
              } catch (e) {
                availableMap[tech.id] = 'possible';
              }
            });
          }
        } catch (e) {
          console.warn('[TechMatrix] Radar detection failed:', e);
        }
      }

      // 更新顶部显示
      if (detected && detected.technique) {
        const techInfo = TECH_LIST.find(t => t.id === detected.technique);
        topTechEl.textContent = techInfo ? techInfo.name : detected.technique;
        topTechEl.style.color = '#fbbf24';
      } else {
        topTechEl.textContent = '暂无可用技巧';
        topTechEl.style.color = '#78716c';
      }

      // 渲染列表
      listEl.innerHTML = TECH_LIST.map(tech => {
        const isFound = detected && detected.technique === tech.id;
        const status = availableMap[tech.id] || (isFound ? 'found' : 'possible');
        const statusText = isFound ? '已发现' : status === 'possible' ? '可能' : '未发现';
        const statusClass = isFound ? 'found' : status;

        return `
          <div class="tm-radar-item ${isFound ? 'found' : status === 'possible' ? 'possible' : ''}"
               data-tech="${tech.id}">
            <div class="tm-radar-item-icon">${isFound ? '✅' : status === 'possible' ? '❓' : '🔒'}</div>
            <div class="tm-radar-item-info">
              <div class="tm-radar-item-name">${tech.name}</div>
              <div class="tm-radar-item-alias">${tech.alias}</div>
            </div>
            <span class="tm-radar-item-status ${statusClass}">${statusText}</span>
          </div>
        `;
      }).join('');

      // 绑定点击事件
      listEl.querySelectorAll('.tm-radar-item').forEach(item => {
        item.addEventListener('click', () => {
          this._playSfx('click');
          // 点击后尝试高亮相关区域
          const techId = item.dataset.tech;
          this._highlightTechnique(techId);
        });
      });
    }

    _createTechRater() {
      if (!this.techRaterClass || !this.board) return null;
      try {
        if (typeof this.techRaterClass.fromBoard === 'function') {
          return this.techRaterClass.fromBoard(this.board);
        }
        return new this.techRaterClass(this.board);
      } catch (e) {
        return null;
      }
    }

    _highlightTechnique(techId) {
      if (!this.techRaterClass || !this.board) return;
      try {
        const rater = this._createTechRater();
        if (!rater || typeof rater._findAllByTechnique !== 'function') return;
        const results = rater._findAllByTechnique(techId);
        if (results && results.length > 0) {
          const best = results[0];
          const cells = [];
          if (best.row !== undefined && best.col !== undefined) {
            cells.push({ r: best.row, c: best.col });
          }
          if (best.evidence) {
            if (best.evidence.scopeCells) {
              best.evidence.scopeCells.forEach(([r, c]) => {
                if (!cells.find(cc => cc.r === r && cc.c === c)) {
                  cells.push({ r, c });
                }
              });
            }
            if (best.evidence.targetCell) {
              const [r, c] = best.evidence.targetCell;
              if (!cells.find(cc => cc.r === r && cc.c === c)) {
                cells.push({ r, c });
              }
            }
          }
          this._highlightCells(cells, 'hint', 'tech-matrix-radar');
          // 创建临时提示
          this.currentHint = {
            technique: techId,
            techniqueName: TECH_LIST.find(t => t.id === techId)?.name || techId,
            explanation: `这是 ${TECH_LIST.find(t => t.id === techId)?.name || techId} 技巧的应用区域`,
            target: results[0] ? { row: results[0].row, col: results[0].col, num: results[0].num } : null,
            targetCells: cells,
            evidence: results[0]?.evidence || null,
          };
          this._switchTab('evidence');
        }
      } catch (e) {
        console.warn('[TechMatrix] Highlight technique failed:', e);
      }
    }

    // === 候选热力图 ===

    _initHeatmapNumpad() {
      const numpad = this.el.querySelector('.tm-heatmap-numpad');
      if (!numpad) return;
      const size = this.board ? this.board.size : 9;

      let html = '';
      for (let i = 1; i <= size; i++) {
        html += `<button class="tm-hm-num-btn ${i === this.heatmapNumber ? 'active' : ''}" data-num="${i}">${i}</button>`;
      }
      numpad.innerHTML = html;

      numpad.querySelectorAll('.tm-hm-num-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          this.heatmapNumber = parseInt(btn.dataset.num);
          numpad.querySelectorAll('.tm-hm-num-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this._renderHeatmap();
          this._playSfx('click');
        });
      });
    }

    _renderHeatmap() {
      const panel = this.el.querySelector('[data-panel="heatmap"]');
      if (!panel) return;
      const gridWrap = panel.querySelector('.tm-heatmap-grid');
      const countEl = panel.querySelector('.tm-heatmap-count');
      if (!gridWrap || !this.board) return;

      const size = this.board.size;
      const num = this.heatmapNumber;

      gridWrap.style.gridTemplateColumns = `repeat(${size}, 1fr)`;
      gridWrap.style.gridTemplateRows = `repeat(${size}, 1fr)`;

      let candidateCount = 0;
      let html = '';

      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const cell = this.board.cells[r][c];
          let intensity = 0;
          let extraClass = '';

          if (cell.fixedNum) {
            extraClass = 'fixed';
            intensity = cell.fixedNum === num ? 1 : 0;
          } else if (cell.fillNum) {
            extraClass = 'filled';
            intensity = cell.fillNum === num ? 1 : 0;
          } else if (cell.candidates && cell.candidates.has(num)) {
            intensity = 1;
            candidateCount++;
          }

          // 计算宫边界
          const boxW = size === 9 ? 3 : size === 6 ? 3 : 2;
          const boxH = size === 9 ? 3 : size === 6 ? 2 : 2;
          const isRightBoxBorder = (c + 1) % boxW === 0 && c < size - 1;
          const isBottomBoxBorder = (r + 1) % boxH === 0 && r < size - 1;

          const bgColor = extraClass
            ? ''
            : `background: rgba(251,191,36,${0.08 + intensity * 0.65});`;

          const borderStyle = `
            ${isRightBoxBorder ? 'border-right: 2px solid rgba(251,191,36,0.3);' : ''}
            ${isBottomBoxBorder ? 'border-bottom: 2px solid rgba(251,191,36,0.3);' : ''}
          `;

          html += `<div class="tm-hm-cell ${extraClass}"
            style="${bgColor}${borderStyle}"
            data-r="${r}" data-c="${c}"
            title="R${r + 1}C${c + 1}"></div>`;
        }
      }

      gridWrap.innerHTML = html;
      countEl.textContent = `${candidateCount} 个候选`;

      // 绑定点击
      gridWrap.querySelectorAll('.tm-hm-cell').forEach(cellEl => {
        cellEl.addEventListener('click', () => {
          const r = parseInt(cellEl.dataset.r);
          const c = parseInt(cellEl.dataset.c);
          if (this.board && typeof this.board.selectCell === 'function') {
            this.board.selectCell(r, c);
          }
          this._playSfx('click');
          if (this.renderer) this.renderer.render(this.board);
        });
      });
    }

    // === 棋盘高亮 ===

    _highlightCells(cells, type = 'hint', key = 'tech-matrix') {
      if (!this.renderer || !cells || cells.length === 0) return;
      if (typeof this.renderer.highlightHintCells === 'function') {
        this.renderer.highlightHintCells(cells, type, key);
        this.renderer.forceRender = true;
        if (typeof this.renderer.render === 'function') {
          this.renderer.render(this.board);
        }
      }
    }

    _clearBoardHighlight(key = 'tech-matrix') {
      if (!this.renderer) return;
      if (typeof this.renderer.clearHintHighlights === 'function') {
        this.renderer.clearHintHighlights(key);
        this.renderer.forceRender = true;
        if (typeof this.renderer.render === 'function' && this.board) {
          this.renderer.render(this.board);
        }
      }
    }

    // === 工具方法 ===

    _playSfx(name) {
      if (typeof AudioService !== 'undefined' && AudioService.sfx) {
        AudioService.sfx.play(name);
      }
    }
  }

  // 导出到全局
  global.TechMatrix = TechMatrix;

})(typeof window !== 'undefined' ? window : this);
