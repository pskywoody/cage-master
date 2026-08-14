// ==========================================
// InvestigationRig - Evidence System (Step 7 装配层)
// ==========================================
// 把 Static 层 + Runtime 层 + Presentation 投影层装成一条可运行的闭环：
//
//   Level JSON
//     → CaseAnalyzerReport.analyze()      （案件分析）
//     → buildEvidenceRecords()            （证据条目）
//     → buildEvidenceGraph()              （证据图）
//     → buildEvidenceMetadata()           （展示元数据）
//     → buildCaseTimeline()               （调查时间线）
//     → InvestigationState + EvidenceResolver（运行时状态 + 事件映射）
//     → buildInvestigationViewModel()     （投影层，供 45 Panel 消费）
//
// 本模块只负责"装配"，不含任何 UI 逻辑。
// 它消费游戏事件（levelLoaded / cellFill / levelComplete），驱动 InvestigationState，
// 并对外暴露 buildViewModel() 供面板刷新。
// ==========================================

import { CaseAnalyzerReport } from './case-analyzer-report.js';
import { buildEvidenceRecords } from './evidence-record.js';
import { buildEvidenceGraph } from './evidence-graph.js';
import { buildEvidenceMetadata } from './evidence-metadata.js';
import { buildCaseTimeline } from './case-timeline.js';
import { InvestigationState } from './investigation-state.js';
import { EvidenceResolver } from './evidence-resolver.js';
import { buildInvestigationViewModel } from './investigation-view-model.js?v=88';

function _getGlobal(name) {
  if (typeof window !== 'undefined' && window[name]) return window[name];
  if (typeof globalThis !== 'undefined' && globalThis[name]) return globalThis[name];
  return null;
}

/**
 * 案件装配器：持有一关的静态资源 + 运行时状态 + 投影，供 UI 消费。
 */
export class InvestigationRig {
  /**
   * @param {Object} opts
   * @param {Object} opts.gameApp   - GameApp 实例（用于读取运行态 cells）
   * @param {Function} [opts.onChange] - 状态变更回调（驱动面板刷新）
   */
  constructor({ gameApp = null, onChange = null } = {}) {
    this.gameApp = gameApp;
    this.onChange = onChange;

    this.levelId = null;
    this.records = [];
    this.graph = null;
    this.meta = {};
    this.timeline = null;
    this.state = null;
    this.resolver = null;
    this._lastResolved = new Set(); // 记录已确认的笼，避免重复 confirm
  }

  /** 是否已为当前关卡装配好案件。 */
  isReady() {
    return Boolean(this.graph && this.state);
  }

  /**
   * 关卡加载时装配整条链。
   * @param {number} levelId
   * @param {Object} levelData - Level JSON（含 boardData/cages/gridSize）
   * @returns {Object|null} ViewModel；分析失败返回 null
   */
  loadLevel(levelId, levelData) {
    try {
      const analyzer = new CaseAnalyzerReport();
      const report = analyzer.analyze(levelData);
      const { records, closure } = buildEvidenceRecords(report);
      const graph = buildEvidenceGraph({ levelId, evidence: records, closure });
      const meta = buildEvidenceMetadata(records);
      const timeline = buildCaseTimeline({ records, closure });

      this.levelId = levelId;
      this.records = records;
      this.graph = graph;
      this.meta = meta;
      this.timeline = timeline;

      this.state = new InvestigationState();
      this.state.start(levelId, graph);
      this.resolver = new EvidenceResolver({ graph, investigation: this.state });
      this._lastResolved = new Set();

      // 状态变更 → 通知外部刷新面板
      this.state.onChange = () => {
        if (this.onChange) this.onChange(this.buildViewModel());
      };

      return this.buildViewModel();
    } catch (e) {
      console.warn('[InvestigationRig] loadLevel 失败:', e && e.message);
      return null;
    }
  }

  /**
   * 消费游戏事件。目前支持：
   *   levelLoaded { levelId, levelData }
   *   cellFill    { r, c, num }  → 判定所在笼是否已解决
   *   levelComplete              → 关闭案件
   * @param {string} type
   * @param {Object} [payload]
   */
  handleEvent(type, payload = {}) {
    if (type === 'levelLoaded') {
      if (payload.levelData) this.loadLevel(payload.levelId, payload.levelData);
      return;
    }
    if (!this.isReady()) return;

    if (type === 'cellFill') {
      this._onCellFill(payload.r, payload.c);
    } else if (type === 'levelComplete') {
      if (this.resolver) this.resolver.onCaseClosed(this._moveCount());
    }
  }

  /** 外部主动触发某笼确认（如提示演示完成后）。 */
  resolveCage(cageId) {
    if (!this.resolver) return null;
    const res = this.resolver.onCageResolved(cageId, this._moveCount());
    if (res && res.changed) this._lastResolved.add(cageId);
    return res;
  }

  /** 生成当前投影（供面板刷新）。只读，不触核心模型。 */
  buildViewModel() {
    return buildInvestigationViewModel({
      levelId: this.levelId,
      records: this.records,
      graph: this.graph,
      meta: this.meta,
      timeline: this.timeline,
      state: this.state,
    });
  }

  // ---- 内部 ----
  /** 读当前运行态 cells，判定 (r,c) 所在笼是否已解决，是则 confirm。 */
  _onCellFill(r, c) {
    try {
      const st = this.gameApp && this.gameApp.getEngine
        ? this.gameApp.getEngine().getState()
        : null;
      if (!st || !st.cells) return;
      const cages = this.records.length
        ? this._cagesOfField()
        : [];
      if (!cages.length) return;
      const cage = cages.find((cg) => (cg.cells || []).some((cc) => {
        const p = parsePos(cc);
        return p && p.r === r && p.c === c;
      }));
      if (!cage) return;
      if (this._lastResolved.has(cage.id)) return;
      if (this._isCageSolved(st, cage)) {
        this.resolveCage(cage.id);
      }
    } catch (e) { /* 静默，不打断游戏 */ }
  }

  /** 从 level JSON 读取 cages（缓存到本 rig）。 */
  _cagesOfField() {
    if (!this._cages && this.gameApp && this.gameApp._levelData) {
      this._cages = this.gameApp._levelData.cages || [];
    }
    return this._cages || [];
  }

  /** 判定笼内所有格已填且无笼和错误。 */
  _isCageSolved(st, cage) {
    const cells = st.cells;
    for (const cc of cage.cells || []) {
      const p = parsePos(cc);
      if (!p || p.r < 0 || p.c < 0) continue;
      const cell = cells[p.r] && cells[p.r][p.c];
      if (!cell) return false;
      if (!cell.fixedNum && !cell.fillNum) return false; // 有空格
      if (cell.isCageSumError) return false;             // 笼和错误
      if (cell.isError) return false;                    // 行/列/宫冲突
    }
    return true;
  }

  /** 粗略 move 计数：用已确认证据数（无真实步数时兜底）。 */
  _moveCount() {
    return this.state ? this.state.confirmedCount : 0;
  }
}

/** 笼格坐标解析（兼容 {row:'a',col:1} / [r,c] / 'r c'） */
function parsePos(cc) {
  if (Array.isArray(cc)) return { r: cc[0], c: cc[1] };
  if (typeof cc === 'string') {
    const p = cc.split(/\s+/).map(Number);
    return { r: p[0], c: p[1] };
  }
  if (cc && typeof cc === 'object') {
    const rowVal = cc.row !== undefined ? cc.row : cc.r;
    let r = -1;
    if (typeof rowVal === 'number') r = rowVal;
    else if (typeof rowVal === 'string' && rowVal.length === 1) r = rowVal.toLowerCase().charCodeAt(0) - 97;
    return { r: r, c: (cc.col !== undefined ? cc.col : cc.c) - 1 };
  }
  return null;
}

/**
 * 便捷工厂：预先以一份 level JSON 装配 rig。
 * @param {Object} opts { gameApp, levelData, levelId, onChange }
 * @returns {InvestigationRig}
 */
export function createInvestigationRig({ gameApp = null, levelData = null, levelId = null, onChange = null } = {}) {
  const rig = new InvestigationRig({ gameApp, onChange });
  if (levelData) rig.loadLevel(levelId ?? levelData.levelId ?? null, levelData);
  return rig;
}

export default InvestigationRig;