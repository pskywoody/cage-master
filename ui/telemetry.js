// ==========================================
// telemetry.js - CM4 行为观测采集器（第一阶段 MVP）
// ==========================================
// 定位（spec v1.0 §1.2）：只记录 → 分析 → 发现规律；不判断、不干预玩家。
//  - 挂到 GameApp 事件总线：game.html handleEvent 入口把事件转发给 ingest()。
// 所有事件统一 envelope：{ timestamp, session_id, player_id, level_id, event_type, payload }
//  - 核心事件规范化为 spec 命名；未映射事件保留原名但同样入流（不丢数据）。
//  - 派生指标（pause / recovery / TCI / 卡点 / 错误分类）由
//    scripts/analyze-telemetry.js 计算，本模块只负责记录原始事件。
//  - 落盘：内存 + localStorage(限长滚动) + export() 下载 JSONL。
// 环境约束：纯 ES Module；无模块顶层 DOM 访问（Node import 不报错）。
// ==========================================

const STORAGE_KEY = 'cm4_telemetry_v1';
const MAX_STORED = 3000;

// CM4 emitEvent type → spec event_type + payload 规范化
const EVENT_MAPPINGS = {
  cellSelect: { type: 'cell_focus', map: (p) => ({ row: p.r, col: p.c }) },
  cellFill: { type: 'cell_fill', map: (p) => ({ row: p.r, col: p.c, value: p.num, correct: !!p.correct, success: !!p.success }) },
  cellErase: { type: 'cell_erase', map: (p) => ({ row: p.r, col: p.c, previous_value: p.num }) },
  noteToggle: { type: 'note_toggle', map: (p) => ({ row: p.r, col: p.c, candidate: p.num, action: p.added ? 'add' : 'remove' }) },
  numberFocus: { type: 'number_focus', map: (p) => ({ number: p.value, source: p.source }) },
  levelStart: { type: 'level_start', map: (p) => ({ level_id: p.levelId }) },
  levelLoaded: { type: 'level_loaded', map: (p) => ({ level_id: p.levelId }) },
  levelComplete: { type: 'level_complete', map: (p) => ({ level_id: p.levelId }) },
  loadError: { type: 'level_error', map: (p) => ({ level_id: p.levelId, message: (p && p.error && p.error.message) || null }) },
  blockedInput: { type: 'blocked_input', map: (p) => ({ reason: p.reason, row: p.r, col: p.c }) },
  bellRung: { type: 'bell_rung', map: () => ({}) },
  bombStrike: { type: 'bomb_strike', map: (p) => ({ reason: p.reason, row: p.r, col: p.c }) },
  evacuationUnlock: { type: 'evacuation_unlock', map: (p) => ({ zone: p.zone }) },
  hintModeStart: { type: 'hint_start', map: () => ({}) },
  hintModeEnd: { type: 'hint_end', map: () => ({}) },
  hintFillResult: { type: 'hint_result', map: (p) => ({ correct: !!p.correct }) },
  bubble: { type: 'dialog_bubble', map: (p) => ({ speaker: p.speaker }) },
};

// Boss 战相关事件名（tpl-battle-controller / battle-manager 上报）归一为 boss_action
const BOSS_EVENT_PREFIXES = ['tpl_', 'battle_', 'boss_'];
const BOSS_EVENT_NAMES = new Set(['board_changed', 'ai_placed', 'telegraph', 'strategy_change']);

export class Telemetry {
  /**
   * @param {Object} options
   * @param {Function} [options.getPlayerId] - 返回 player_id（可选）
   * @param {boolean}  [options.persist] - 是否 localStorage 持久化（默认 true）
   */
  constructor(options) {
    options = options || {};
    this._getPlayerId = typeof options.getPlayerId === 'function' ? options.getPlayerId : null;
    this._persist = options.persist !== false;

    this._events = [];
    this._session = this._genId();
    this._currentLevelId = null;
    this._enabled = true;
    this._restoreStored();
  }

  // ============================================================
  //  开关 / 查询
  // ============================================================

  setEnabled(on) { this._enabled = !!on; }
  isEnabled() { return this._enabled; }
  getEvents() { return this._events.slice(); }
  getSessionId() { return this._session; }
  getCurrentLevelId() { return this._currentLevelId; }

  // ============================================================
  //  事件入口（由 game.html handleEvent 转发）
  // ============================================================

  /**
   * 规范化并记录一条事件。
   * @param {string} type - CM4 emitEvent 事件名
   * @param {Object} payload
   */
  ingest(type, payload) {
    if (!this._enabled || typeof type !== 'string' || !type) return;
    try {
      const rec = this._normalize(type, payload || {});
      if (!rec) return;
      this._events.push(rec);
      if (this._events.length > MAX_STORED * 2) this._events.splice(0, this._events.length - MAX_STORED);
      if (this._persist) this._persistToStorage();
    } catch (e) {
      console.warn('[Telemetry] ingest fail:', type, e);
    }
  }

  _normalize(type, payload) {
    const now = Date.now();
    // 跟踪当前关卡
    if (type === 'levelStart' && payload.levelId != null) this._currentLevelId = payload.levelId;
    if (type === 'levelComplete' && payload.levelId != null) this._currentLevelId = payload.levelId;

    let eventType = type;
    let body = payload;
    const m = EVENT_MAPPINGS[type];
    if (m) {
      eventType = m.type;
      body = m.map(payload);
    } else if (this._isBossEvent(type, payload)) {
      eventType = 'boss_action';
      body = { source_type: type, payload: payload };
    }

    return {
      timestamp: now,
      session_id: this._session,
      player_id: this._getPlayerId ? this._getPlayerId() : null,
      level_id: this._currentLevelId,
      event_type: eventType,
      payload: body,
    };
  }

  _isBossEvent(type, payload) {
    if (BOSS_EVENT_NAMES.has(type)) return true;
    for (const pre of BOSS_EVENT_PREFIXES) {
      if (type.indexOf(pre) === 0) return true;
    }
    return false;
  }

  // ============================================================
  //  导出（JSONL 下载）
  // ============================================================

  /** @returns {string} JSONL 文本 */
  exportJSONL() {
    return this._events.map((e) => {
      try { return JSON.stringify(e); } catch (err) { return null; }
    }).filter(Boolean).join('\n');
  }

  /** 导出并下载 JSONL 文件（浏览器环境） */
  export(filename) {
    try {
      if (typeof document === 'undefined') return this.exportJSONL();
      const text = this.exportJSONL();
      const blob = new Blob([text], { type: 'application/x-ndjson' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || ('cm4-telemetry-' + this._session + '.jsonl');
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      return text;
    } catch (e) {
      console.warn('[Telemetry] export fail:', e);
      return this.exportJSONL();
    }
  }

  clear() {
    this._events = [];
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* ignore */ }
  }

  // ============================================================
  //  内部：localStorage 持久化（限长滚动）
  // ============================================================

  _persistToStorage() {
    try {
      if (typeof localStorage === 'undefined') return;
      const tail = this._events.slice(-MAX_STORED);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tail));
    } catch (e) {
      // 存储满/不可用时静默降级为纯内存
    }
  }

  _restoreStored() {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) this._events = arr.slice(-MAX_STORED);
    } catch (e) { /* ignore */ }
  }

  _genId() {
    try {
      const rnd = (typeof crypto !== 'undefined' && crypto.getRandomValues)
        ? Array.from(crypto.getRandomValues(new Uint8Array(6))).map((b) => b.toString(16).padStart(2, '0')).join('')
        : Math.random().toString(16).slice(2, 14);
      return 's_' + Date.now().toString(36) + '_' + rnd;
    } catch (e) {
      return 's_' + Math.random().toString(36).slice(2, 14);
    }
  }
}

export default Telemetry;
