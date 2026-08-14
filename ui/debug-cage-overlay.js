// ==========================================
// DebugCageOverlay - Cage Resolution Layer (Step 2: Debug)
// ==========================================
// 开发者专用调试浮层（不面向玩家）。
// 显示每个 Cage 的推理生命周期状态：
//   Cage 01  ACTIVE  [7,8] [6,9]
//   Cage 02  RESOLVED
// 数据来自 core/cage-analyzer.js（三态：UNKNOWN / ACTIVE / RESOLVED）。
//
// 用法：
//   const ov = new DebugCageOverlay();
//   ov.attach(app);       // app 需暴露 getEngine()/getBoard()
//   ov.toggle();          // 显示/隐藏
//   ov.refresh();         // 手动刷新（render 循环里节流调用）
// ==========================================

import { CageAnalyzer } from '../core/cage-analyzer.js?v=87';

const STATE_COLOR = {
  OPEN: '#8a8f98',
  NARROWED: '#e0a63c',
  RESOLVED: '#4caf7d',
};

class DebugCageOverlay {
  constructor() {
    this.app = null;
    this.visible = false;
    this._lastRefresh = 0;
    this._refreshInterval = 400; // ms
    this._el = null;
    this._bodyEl = null;
    this._summaryEl = null;
    this._createDom();
  }

  _createDom() {
    const el = document.createElement('div');
    el.id = 'debug-cage-overlay';
    el.style.cssText = [
      'position:fixed', 'z-index:99999', 'top:8px', 'right:14px',
      'width:300px', 'max-height:80vh', 'overflow:auto',
      'background:rgba(10,12,16,0.92)', 'border:1px solid #3a3f48',
      'border-radius:8px', 'padding:10px 12px', 'font:11px/1.5 monospace',
      'color:#cfd3da', 'display:none', 'backdrop-filter:blur(2px)',
    ].join(';');
    el.innerHTML = [
      '<div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#e8ebef">',
      'Cage Resolution <span style="color:#8a8f98;font-weight:400">(debug)</span></div>',
      '<div id="__cage-summary" style="margin-bottom:6px"></div>',
      '<div id="__cage-list"></div>',
    ].join('');
    document.body.appendChild(el);
    this._el = el;
    this._summaryEl = el.querySelector('#__cage-summary');
    this._bodyEl = el.querySelector('#__cage-list');
  }

  attach(app) {
    this.app = app;
  }

  toggle() {
    this.visible = !this.visible;
    if (this._el) this._el.style.display = this.visible ? 'block' : 'none';
    if (this.visible) this.refresh(true);
    return this.visible;
  }

  show() { if (!this.visible) this.toggle(); }
  hide() { if (this.visible) this.toggle(); }

  /**
   * 节流刷新（render 每帧调用，模块内部限频）
   * @param {boolean} force - 忽略节流强制刷新
   */
  refresh(force = false) {
    if (!this.visible) return;
    const now = Date.now();
    if (!force && now - this._lastRefresh < this._refreshInterval) return;
    this._lastRefresh = now;

    let board = null;
    try {
      const eng = this.app && this.app.getEngine ? this.app.getEngine() : null;
      board = eng && eng.getBoard ? eng.getBoard() : null;
    } catch (e) { board = null; }

    if (!board || !board.cages || board.cages.length === 0) {
      this._bodyEl.textContent = '（无 Cage / 未加载关卡）';
      this._summaryEl.textContent = '';
      return;
    }

    let results;
    try {
      const analyzer = new CageAnalyzer(board);
      results = analyzer.analyzeAll();
      const s = analyzer.getSummary();
      this._summaryEl.innerHTML =
        `Cage <b>${s.total}</b> · ` +
        `<span style="color:${STATE_COLOR.OPEN}">OPEN ${s.open}</span> · ` +
        `<span style="color:${STATE_COLOR.NARROWED}">NARROWED ${s.narrowed}</span> · ` +
        `<span style="color:${STATE_COLOR.RESOLVED}">RESOLVED ${s.resolved}</span>` +
        (s.changed ? ` · <span style="color:#7fd0ff">Δ ${s.changed}</span>` : '');
    } catch (e) {
      this._bodyEl.textContent = '分析失败: ' + e.message;
      return;
    }

    // 设计者视角：STATE / Remaining / Forced / Changed（不展示候选组合，避免变 solver debug）
    const rows = results.map(r => {
      const color = STATE_COLOR[r.solverState] || '#fff';
      const remaining = r.solved ? '—' : String(r.emptyCount);
      const forced = r.solved ? '—' : (r.forced ? 'Yes' : 'No');
      const changed = r.changed ? '<span style="color:#7fd0ff">Δ</span>' : '';
      return `<div>Cage ${String(r.cageId).padStart(2, '0')} ` +
        `<span style="color:${color};font-weight:700">${r.solverState}</span>` +
        `<span style="color:#8a8f98"> · R:<b>${remaining}</b> F:${forced} ${changed}</span></div>`;
    });

    this._bodyEl.innerHTML = rows.join('');
  }
}

export { DebugCageOverlay };
export default DebugCageOverlay;