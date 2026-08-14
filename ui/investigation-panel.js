// ==========================================
// InvestigationPanel - Evidence System (Step 7 UI)
// ==========================================
// 45 Panel Investigation Mode 的 UI 层。
//
// 原则（与架构冻结一致）：
//   - 本模块只做 UI 投影，不吞逻辑。
//   - 数据一律来自 InvestigationViewModel（core/investigation-view-model.js）。
//   - 不直接读 EvidenceRecord / Graph / InvestigationState。
//
// 三个 Tab：
//   Evidence Tab（本步完整实现）：
//     已发现 / 已确认 / 未发现、关联证据、推理价值、状态迁移、发现/确认 move。
//   Timeline Tab / Board Tab（Step 7 后续）：
//     本步先渲染占位视图，数据已由 ViewModel 备好。
//
// 使用：
//   const panel = new InvestigationPanel();
//   panel.setViewModel(vm);   // 注入投影数据
//   panel.toggle();           // 展开 / 收起
// ==========================================

// ==========================================
// Engine 决策契约 · Step 2 验收记录（2026-08-10）
// ==========================================
// 45 Panel 接入 Backend Engine 判题链时，只消费下方「稳定输出契约」，
// 绝不自行解释 rule 或在前端复刻规则文案 —— 否则会引入双决策源。
//
//   契约唯一来源：POST /api/v1/engine/judge 的响应
//   {
//     matched_rules:        string[]          // 命中规则 ID（仅供展示/调试，不可据此复刻文案）
//     primary_diagnosis:    string            // 主诊断文案（P1 强弹窗）
//     secondary_diagnosis:  string            // 次诊断文案（P2/P3 状态栏）
//     tags:                 string[]          // 打标
//     ui_trigger: {
//       show_popup:         boolean           // 是否弹窗
//       popup_style:        string            // diagnostic_red | diagnostic_green | none
//       force_quiz:         boolean           // 强制复习
//       add_to_weekend_pack:boolean           // 加入周末急救包
//     }
//   }
//
//   渲染原则：
//   - 文案一律取自 primary_diagnosis / secondary_diagnosis。
//   - 不得根据 matched_rules 里的 ID（如 D001）在前端复刻 rules_v1.json 的文案。
//   - ui_trigger 决定交互形态（弹窗/样式/复习/急救包），本面板只按它渲染。
//
//   Engine 侧回归护栏已冻结（backend-engine/，Rule Coverage 23/23 + Regression 10/10）：
//   若 matched_rules / diagnosis / tags / ui_trigger 发生漂移，回滚护栏会 CI fail。
//   Step 3 将新增 adapter：engine response → 本面板渲染（纯映射，无逻辑）。
// ==========================================

const CM = window.CM || (window.CM = {});

// Step 3：Learning 区块渲染器（纯渲染，消费 EngineAdapter 渲染模型，不解 rule ID）。
import { renderLearningDecision } from '../core/learning-renderer.js?v=88';
import I18n from '../i18n/i18n.js';

const STATE_COLOR = {
  undiscovered: { bg: '#2a2530', fg: '#8a8f98', label: I18n.t('ui.investigation.state.undiscovered') },
  discovered:   { bg: 'rgba(224,166,60,.16)', fg: '#e0a63c', label: I18n.t('ui.investigation.state.discovered') },
  confirmed:    { bg: 'rgba(76,175,125,.18)', fg: '#4caf7d', label: I18n.t('ui.investigation.state.confirmed') },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[ch]);
}

export class InvestigationPanel {
  constructor(options = {}) {
    this.id = options.id || 'investigation-panel';
    this.vm = options.vm || null;
    this.activeTab = options.activeTab || 'evidence';
    // Step 8：交互出口。面板不碰棋盘/核心模型，只发请求给宿主（game.html 接线）。
    //   onNavigate({ type, cageId, evidenceId })
    this.onNavigate = options.onNavigate || null;
    // Step 8 · Goal 4：证据卡便签。面板不碰存储，只发变更请求给宿主。
    //   onNoteChange({ evidenceId, text })
    this.onNoteChange = options.onNoteChange || null;
    this._focusedEv = null;   // 当前聚焦证据 id
    this._focusedCage = null; // 当前聚焦笼 id
    this._cageByEv = new Map(); // evidenceId -> cageId
    // ---- 便签内部状态（Player Memory，面板私有）----
    this._noteLevelId = null;   // 当前面板所在的关卡（跨关重置草稿）
    this._noteOpen = new Set(); // 已展开编辑区的证据 id
    this._noteDrafts = {};      // evidenceId -> 当前草稿文本
    this._noteTimers = {};      // evidenceId -> debounce timer
    // Step 3：Learning 区块（非 Tab，与 Evidence 并列渲染）。只存渲染模型，DOM 由宿主注入。
    this._learningModel = null;
    this._buildShell();
    this.setTab('evidence', false);
  }

  // ---- 生命周期 ----
  open() {
    this.el.classList.add('iv-open');
    this._refresh();
    // 上线审计修复：Escape 关闭浮动面板（单次绑定）
    if (!this._escapeBound) {
      this._escapeBound = true;
      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.isOpen()) {
          e.preventDefault();
          this.close();
        }
      });
    }
  }
  close() {
    this.el.classList.remove('iv-open');
  }
  toggle() {
    if (this.isOpen()) this.close(); else this.open();
  }
  isOpen() {
    return this.el.classList.contains('iv-open');
  }

  /** 注入投影数据并重绘当前 Tab。 */
  setViewModel(vm) {
    this.vm = vm || null;
    // Step 8 · Goal 4：跨关时重置便签草稿/展开态，避免残留上一关
    const lv = vm && vm.levelId != null ? String(vm.levelId) : null;
    if (lv !== this._noteLevelId) {
      this._noteLevelId = lv;
      this._noteOpen = new Set();
      this._noteDrafts = {};
      this._noteTimers = {};
    }
    this._refresh();
    return this;
  }

  setTab(tab, refresh = true) {
    this.activeTab = tab;
    const heads = this.el.querySelectorAll('.iv-tab');
    heads.forEach((h) => h.classList.toggle('iv-tab-active', h.dataset.tab === tab));
    if (refresh) this._refresh();
  }

  /**
   * Step 3：注入 Learning 决策渲染模型（EngineAdapter 输出），重绘 Learning 区块。
   * Learning 区块与 Evidence Tab 并列，不是新 Tab、不触碰这一关的证据逻辑。
   * @param {object} model - EngineAdapter.toRenderModel() 输出
   */
  setLearningDecision(model) {
    this._learningModel = model || null;
    this._renderLearningBlock();
    return this;
  }

  // ---- 渲染 ----
  _refresh() {
    if (!this.isOpen()) return;
    const body = this.el.querySelector('.iv-body');
    if (!this.vm) {
      body.innerHTML = '<div class="iv-empty">' + I18n.t('ui.investigation.emptyCase') + '</div>';
      return;
    }
    // Step 8：重建 evidenceId → cageId 映射（交互导航用）
    this._cageByEv = new Map();
    for (const e of this.vm.evidence || []) {
      if (e.targetId != null) this._cageByEv.set(e.evidenceId, e.targetId);
    }
    if (this.activeTab === 'evidence') body.innerHTML = this._renderEvidenceTab(this.vm.evidence);
    else if (this.activeTab === 'timeline') body.innerHTML = this._renderTimelineTab(this.vm.timeline);
    else if (this.activeTab === 'board') body.innerHTML = this._renderBoardTab(this.vm.board);
    // Step 3：Learning 区块与 Evidence 并列渲染（独立 DOM，不随 Tab 切换）。
    this._renderLearningBlock();
  }

  /** Step 3：把已注入的 Learning 模型渲染到独立区块（非 Tab）。 */
  _renderLearningBlock() {
    const box = this.el ? this.el.querySelector('.iv-learning') : null;
    if (!box) return;
    if (!this.isOpen() || !this._learningModel) return; // 关闭或未注入 → 不写 DOM
    box.innerHTML = renderLearningDecision(this._learningModel);
  }

  _renderEvidenceTab(list = []) {
    if (!list.length) return '<div class="iv-empty">' + I18n.t('ui.investigation.emptyEvidence') + '</div>';
    const cards = list.map((e) => {
      const st = STATE_COLOR[e.state] || STATE_COLOR.undiscovered;
      const related = (e.relatedEvidence && e.relatedEvidence.length)
        ? e.relatedEvidence.map((id) => `<span class="iv-chip">${esc(id.replace(/^EV-\d+-CAGE-/, '#'))}</span>`).join('')
        : '<span class="iv-mut">—</span>';
      const trans = e.stateTransition && e.stateTransition.from
        ? (e.stateTransition.from === e.stateTransition.final ? esc(e.stateTransition.final) : esc(e.stateTransition.from + ' → ' + e.stateTransition.final))
        : '—';
      const moves = [];
      if (e.discoveredAt != null) moves.push(I18n.t('ui.investigation.discoveredMove', { move: e.discoveredAt }));
      if (e.resolvedAt != null) moves.push(I18n.t('ui.investigation.confirmedMove', { move: e.resolvedAt }));
      // Step 8 · Goal 4：便签——读投影 note（只读），草稿优先于已存文本
      const note = e.note || { exists: false, text: '', textPreview: '' };
      const draft = this._noteDrafts[e.evidenceId];
      const noteText = draft !== undefined ? draft : note.text;
      const noteOpen = this._noteOpen.has(e.evidenceId);
      const noteFilled = note.exists || (draft !== undefined && draft.trim() !== '');
      return `
        <div class="iv-evidence ${e.collapsed ? 'iv-collapsed' : ''} ${e.evidenceId === this._focusedEv ? 'iv-ev-focus' : ''}" style="--evc:${e.color || '#8a8f98'}" data-ev="${esc(e.evidenceId)}" data-cage="${esc(e.targetId ?? '')}" title="${I18n.t('ui.investigation.locateTitle')}">
          <div class="iv-ev-head">
            <span class="iv-ev-icon">${esc(e.icon || '·')}</span>
            <span class="iv-ev-title">${esc(e.title || e.evidenceId)}</span>
            <span class="iv-ev-state" style="background:${st.bg};color:${st.fg}">${st.label}</span>
          </div>
          <div class="iv-ev-sub">${esc(e.roleLabel || e.role)}${I18n.t('ui.investigation.valueLabel', { value: e.evidenceValue ?? 0 })}</div>
          <div class="iv-ev-meta">
            <span class="iv-ev-trans">${trans}</span>
            ${moves.length ? `<span class="iv-ev-moves">${moves.join(' · ')}</span>` : ''}
          </div>
          <div class="iv-ev-related">${I18n.t('ui.investigation.relatedLabel')}${related}</div>
          <div class="iv-ev-note">
            <button type="button" class="iv-note-toggle" data-note-toggle="${esc(e.evidenceId)}">
              ${noteFilled ? I18n.t('ui.investigation.note') : I18n.t('ui.investigation.noteNew')}${noteFilled ? '<i class="iv-note-dot"></i>' : ''}
            </button>
            <div class="iv-note-body ${noteOpen ? 'iv-note-open' : ''}">
              <textarea data-note-ev="${esc(e.evidenceId)}" rows="2" placeholder="${I18n.t('ui.investigation.notePlaceholder')}">${esc(noteText)}</textarea>
              ${noteFilled ? `<div class="iv-note-preview">${esc(note.textPreview)}</div>` : ''}
              <button type="button" class="iv-note-del" data-note-del="${esc(e.evidenceId)}">${I18n.t('ui.investigation.noteDelete')}</button>
            </div>
          </div>
        </div>`;
    }).join('');
    return `<div class="iv-list">${cards}</div>`;
  }

  _renderTimelineTab(timeline = null) {
    if (!timeline || (!timeline.beats || !timeline.beats.length) && (!timeline.events || !timeline.events.length)) {
      return '<div class="iv-empty">' + I18n.t('ui.investigation.emptyTimeline') + '</div>';
    }
    // 投影层已把 beats / events 都带中文标签；这里按 move 合并成叙事流。
    // beats = 玩家经历了什么（主导航），events = 具体发生了什么（明细）。
    const rows = [];
    const beats = timeline.beats || [];
    const events = timeline.events || [];
    const byMove = new Map();
    for (const e of events) {
      if (!byMove.has(e.move)) byMove.set(e.move, []);
      byMove.get(e.move).push(e);
    }
    const allMoves = [...new Set([...beats.map(b => b.move), ...events.map(e => e.move)])].sort((a, b) => a - b);
    for (const mv of allMoves) {
      const beat = beats.find(b => b.move === mv);
      const evs = byMove.get(mv) || [];
      if (beat) {
        rows.push(`
          <div class="iv-tl-beat">
            <span class="iv-tl-move">MOVE ${String(mv).padStart(2, '0')}</span>
            <span class="iv-tl-bt">${esc(beat.title)}</span>
          </div>`);
      }
      for (const e of evs) {
        const detail = e.type === 'cluster_form'
          ? (e.evidenceIds || []).map(id => esc(id.replace(/^EV-\d+-CAGE-/, 'Cage #'))).join(' · ')
          : (e.evidenceId ? esc(e.evidenceId.replace(/^EV-\d+-CAGE-/, 'Cage #')) : '');
        // 事件涉及的笼 id（cluster 取首条；单条取对应笼）
        const cageId = e.type === 'cluster_form'
          ? (this._cageByEv.get((e.evidenceIds || [])[0]) ?? null)
          : (e.evidenceId ? (this._cageByEv.get(e.evidenceId) ?? null) : null);
        const isFocus = e.evidenceId && e.evidenceId === this._focusedEv;
        rows.push(`
          <div class="iv-tl-event ${isFocus ? 'iv-tl-focus' : ''}" ${cageId != null ? `data-cage="${esc(cageId)}" title="${I18n.t('ui.investigation.replayTitle')}"` : ''}>
            <span class="iv-tl-dot"></span>
            <span class="iv-tl-etype">${esc(e.label)}</span>
            ${detail ? `<span class="iv-tl-detail">${detail}</span>` : ''}
          </div>`);
      }
    }
    return `<div class="iv-tl">${rows.join('')}</div>`;
  }

  _renderBoardTab(board = null) {
    if (!board || !board.nodes || !board.nodes.length) {
      return '<div class="iv-empty">' + I18n.t('ui.investigation.emptyBoard') + '</div>';
    }
    const byId = new Map(board.nodes.map(n => [n.id, n]));
    // 推理链：优先 spine（primary+supporting 主线），否则按边顺序拓扑
    let chain = (board.spine && board.spine.length) ? board.spine : board.nodes.map(n => n.id);
    chain = chain.filter(id => byId.has(id));
    // 非主线节点（background）另行列出
    const offSpine = board.nodes.filter(n => !chain.includes(n.id));

    const link = (n) => {
      const st = STATE_COLOR[n.state] || STATE_COLOR.undiscovered;
      const isFocus = n.id === this._focusedEv;
      return `
        <div class="iv-bd-node ${isFocus ? 'iv-bd-focus' : ''}" style="--ncolor:${n.color || '#8a8f98'};--nfg:${st.fg};--nbg:${st.bg}" data-node="${esc(n.id)}" data-cage="${esc(n.targetId ?? '')}" title="${I18n.t('ui.investigation.expandTitle', { title: esc(n.title) })}">
          <span class="iv-bd-mark">${n.state === 'confirmed' ? '✓' : (n.expanded ? '○' : '•')}</span>
          <span class="iv-bd-hash">${esc(n.hash)}</span>
          <span class="iv-bd-lock">${n.state === 'undiscovered' ? '🔒' : ''}</span>
        </div>`;
    };

    const chainHtml = chain.length
      ? chain.map((id, i) => {
          const n = byId.get(id);
          const arrow = i < chain.length - 1 ? '<span class="iv-bd-arrow">→</span>' : '';
          return `<span class="iv-bd-link">${link(n)}</span>${arrow}`;
        }).join('')
      : '';
    const offHtml = offSpine.length
      ? offSpine.map(n => `<span class="iv-bd-link iv-bd-off">${link(n)}</span>`).join('')
      : '';
    const closureHtml = board.closureNode
      ? `<div class="iv-bd-closure"><span>⊘ CASE CLOSED</span>${board.closureNode.move != null ? ` · MOVE ${board.closureNode.move}` : ''}</div>`
      : '';

    return `
      <div class="iv-bd">
        <div class="iv-bd-label">${I18n.t('ui.investigation.chainLabel')}</div>
        <div class="iv-bd-chain">${chainHtml}${chain.length ? '<span class="iv-bd-arrow">→</span>' : ''}</div>
        ${closureHtml}
        ${offHtml ? `<div class="iv-bd-label iv-bd-label-off">${I18n.t('ui.investigation.backgroundEvidence')}</div><div class="iv-bd-chain">${offHtml}</div>` : ''}
        <div class="iv-bd-legend">
          <span><i class="iv-lg" style="--lgc:#4caf7d"></i>${I18n.t('ui.investigation.legend.confirmed')}</span>
          <span><i class="iv-lg" style="--lgc:#e0a63c"></i>${I18n.t('ui.investigation.legend.discovered')}</span>
          <span><i class="iv-lg" style="--lgc:#8a8f98"></i>${I18n.t('ui.investigation.legend.undiscovered')}</span>
        </div>
      </div>`;
  }

  // ---- 外壳 ----
  _buildShell() {
    if (document.getElementById(this.id)) {
      this.el = document.getElementById(this.id);
      return;
    }
    const el = document.createElement('div');
    el.id = this.id;
    el.className = 'iv-panel';
    el.innerHTML = `
      <div class="iv-head">
        <span class="iv-title">${I18n.t('ui.investigation.title')}</span>
        <button class="iv-close" title="${I18n.t('ui.investigation.closeTitle')}">✕</button>
      </div>
      <div class="iv-tabs">
        <button class="iv-tab" data-tab="evidence">${I18n.t('ui.investigation.tab.evidence')}</button>
        <button class="iv-tab" data-tab="timeline">${I18n.t('ui.investigation.tab.timeline')}</button>
        <button class="iv-tab" data-tab="board">${I18n.t('ui.investigation.tab.board')}</button>
      </div>
      <div class="iv-body"></div>
      <!-- Step 3：Learning 区块（非 Tab，与 Evidence 并列渲染） -->
      <div class="iv-learning"></div>`;
    document.body.appendChild(el);

    const closeBtn = el.querySelector('.iv-close');
    closeBtn.addEventListener('click', () => this.close());
    el.querySelectorAll('.iv-tab').forEach((h) => {
      h.addEventListener('click', () => this.setTab(h.dataset.tab));
    });
    // Step 8：body 内点击分发（证据卡 / 关系图节点 / 时间线事件 / 便签控件）
    const body = el.querySelector('.iv-body');
    body.addEventListener('click', (e) => this._handleBodyClick(e));
    // Step 8 · Goal 4：便签输入（防抖持久化）
    body.addEventListener('input', (e) => this._handleNoteInput(e));
    this.el = el;
  }

  // ---- Step 8：交互导航 ----
  _handleBodyClick(e) {
    // Goal 4：便签控件优先（避免触发证据卡导航）
    const nt = e.target.closest('[data-note-toggle]');
    if (nt) {
      e.stopPropagation();
      const evId = nt.dataset.noteToggle;
      if (this._noteOpen.has(evId)) this._noteOpen.delete(evId); else this._noteOpen.add(evId);
      this._refresh();
      return;
    }
    const nd = e.target.closest('[data-note-del]');
    if (nd) {
      e.stopPropagation();
      const evId = nd.dataset.noteDel;
      this._noteDrafts[evId] = '';
      this._noteOpen.delete(evId);
      if (this.onNoteChange) { try { this.onNoteChange({ evidenceId: evId, text: '' }); } catch (errNote) {} }
      this._refresh();
      return;
    }
    const nta = e.target.closest('[data-note-ev]');
    if (nta) { e.stopPropagation(); return; } // 点击便签输入区不导航

    const ev = e.target.closest('[data-ev]');
    if (ev) {
      e.stopPropagation();
      this._selectEvidence(ev.dataset.ev, ev.dataset.cage || null);
      return;
    }
    const node = e.target.closest('[data-node]');
    if (node) {
      e.stopPropagation();
      this._selectBoardNode(node.dataset.node, node.dataset.cage || null);
      return;
    }
    const ts = e.target.closest('[data-cage]');
    if (ts && !ts.closest('[data-ev]') && !ts.closest('[data-node]')) {
      e.stopPropagation();
      this._selectTimelineEvent(ts.dataset.cage);
    }
  }

  /** Goal 4：便签输入 → 更新草稿 + 防抖持久化（不重绘，保焦点）。 */
  _handleNoteInput(e) {
    const ta = e.target.closest('[data-note-ev]');
    if (!ta) return;
    const evId = ta.dataset.noteEv;
    this._noteDrafts[evId] = ta.value;
    // 轻量更新 toggle 标签（不整表重绘）；evidenceId 为安全格式，直接作选择器即可
    const sel = '[data-note-toggle="' + evId + '"]';
    const toggle = this.el.querySelector ? this.el.querySelector(sel) : null;
    if (toggle) {
      const filled = ta.value.trim() !== '';
      toggle.innerHTML = (filled ? I18n.t('ui.investigation.note') : I18n.t('ui.investigation.noteNew')) + (filled ? '<i class="iv-note-dot"></i>' : '');
    }
    clearTimeout(this._noteTimers[evId]);
    this._noteTimers[evId] = setTimeout(() => {
      if (this.onNoteChange) { try { this.onNoteChange({ evidenceId: evId, text: ta.value }); } catch (errNote) {} }
    }, 500);
  }

  /** 点击证据卡 → 定位到关系图节点 + 棋盘笼高亮。 */
  _selectEvidence(evidenceId, cageId) {
    this._focusedEv = evidenceId;
    this._focusedCage = cageId;
    this._emitLocate(cageId);
    this.setTab('board');
  }

  /** 点击关系图节点 → 展开来源证据 + 棋盘笼高亮。 */
  _selectBoardNode(evidenceId, cageId) {
    this._focusedEv = evidenceId;
    this._focusedCage = cageId;
    this._emitLocate(cageId);
    this.setTab('evidence');
  }

  /** 点击时间线事件 → 回放对应推理节点（定位关系图 + 棋盘笼高亮）。 */
  _selectTimelineEvent(cageId) {
    this._focusedCage = cageId;
    this._emitLocate(cageId);
    this.setTab('board');
  }

  _emitLocate(cageId) {
    if (this.onNavigate && cageId != null) {
      try { this.onNavigate({ type: 'locateCage', cageId }); } catch (e) {}
    }
  }

  /**
   * 供宿主在外部聚焦某证据（如从棋盘/其它入口跳转）。
   * @param {string} evidenceId
   */
  focusEvidence(evidenceId) {
    this._focusedEv = evidenceId;
    const cageId = evidenceId != null ? (this._cageByEv.get(evidenceId) ?? null) : null;
    this._focusedCage = cageId;
    this._emitLocate(cageId);
    this.setTab('evidence');
  }
}

export default InvestigationPanel;