// ==========================================
// InvestigationState - Evidence System (Step 5)
// ==========================================
// 玩家调查过程的状态机。
//
// 静态链（已完成，冻结）：
//   Level JSON → Case Analyzer → EvidenceRecord → EvidenceGraph
//
// 运行时缺的就是本模块：
//   - 玩家当前状态
//   - 哪些 Evidence 已发现
//   - 哪些 Graph Node 已展开
//   - Closure 是否触发
//
// 核心原则：investigation-state.js 不关心 Sudoku 内部。
//   它只接收游戏运行时抛出的"调查事件"，维护一份可持久化的调查快照。
//   静态的 EvidenceGraph 与运行的 InvestigationState 严格分离——
//   这保证 Step 7 接 45 Panel 时，不会把静态数据和运行状态混在一起。
//
// Graph 持有规则（重要）：
//   - 运行时：可持有 graph 引用，用于计算 progress / 节点总数。
//   - 存档时：绝不序列化 Graph 本体，只序列化 graphId + 证据集合 + 收束态。
//   - 加载时：从静态资源重新生成 Graph，再 attachGraph() 接回。
// ==========================================

export const CLOSURE_STATE = {
  IDLE: 'idle',            // 案件未收束
  TRIGGERED: 'triggered',  // 触发证据已确认，收束旁白/动画已触发
  CLOSED: 'closed',        // 案件正式关闭
};

export const EVIDENCE_STATE = {
  UNDISCOVERED: 'undiscovered', // 未发现（图节点默认隐藏）
  DISCOVERED: 'discovered',     // 已发现（节点揭示）
  CONFIRMED: 'confirmed',       // 已确认（证据成立）
};

export class InvestigationState {
  constructor(options = {}) {
    this.levelId = options.levelId ?? null;
    this.graphId = options.graphId ?? null;   // 静态资源引用，存档只存它
    this.graph = options.graph ?? null;          // 运行时引用（瞬态，不序列化）
    this.onChange = options.onChange ?? null;    // 状态变更回调 → 驱动 UI 刷新

    // ---- 运行时状态 ----
    this._discovered = new Set();   // evidenceId
    this._confirmed = new Set();    // evidenceId
    this._expanded = new Set();     // nodeId（UI 展开瞬态，不持久化）
    this._closure = {
      state: CLOSURE_STATE.IDLE,
      move: null,
      triggerEvidence: [],
    };
    // 调查事件顺序日志（供 Step 6 Timeline Engine 消费）
    this._events = [];
  }

  // ---- 初始化 ----
  start(levelId, graph, graphId = null) {
    this.levelId = levelId;
    this.graph = graph ?? null;
    this.graphId = graphId ?? (graph?.levelId ? `GRAPH-${graph.levelId}` : null);
    this._discovered.clear();
    this._confirmed.clear();
    this._expanded.clear();
    this._closure = { state: CLOSURE_STATE.IDLE, move: null, triggerEvidence: [] };
    this._events = [];
    this._record('start', {});
    this._emit();
    return this;
  }

  /** 加载/换关时，把静态 Graph 接回运行时（Graph 本身来自静态资源，不随存档保存）。 */
  attachGraph(graph, graphId = null) {
    this.graph = graph ?? null;
    if (graph?.levelId && !this.levelId) this.levelId = graph.levelId;
    if (graphId) this.graphId = graphId;
    else if (graph?.levelId && !this.graphId) this.graphId = `GRAPH-${graph.levelId}`;
    return this;
  }

  // ---- Evidence 生命周期 ----
  /** 玩家首次遇到某条证据（节点揭示）。返回是否发生变更。 */
  discoverEvidence(evidenceId, move = null) {
    if (!evidenceId) return false;
    if (!this._discovered.has(evidenceId)) {
      this._discovered.add(evidenceId);
      this._record('discover', { evidenceId, move });
      this._emit();
      return true;
    }
    return false;
  }

  /** 证据确认成立（蕴含发现）。返回是否发生变更。 */
  confirmEvidence(evidenceId, move = null) {
    if (!evidenceId) return false;
    this._discovered.add(evidenceId);
    if (!this._confirmed.has(evidenceId)) {
      this._confirmed.add(evidenceId);
      this._record('confirm', { evidenceId, move });
      this._emit();
      return true;
    }
    return false;
  }

  // ---- Graph Node 展开（UI 瞬态）----
  expandNode(nodeId) {
    if (!nodeId || this._expanded.has(nodeId)) return false;
    this._expanded.add(nodeId);
    this._record('expand', { nodeId });
    this._emit();
    return true;
  }

  collapseNode(nodeId) {
    if (!nodeId || !this._expanded.has(nodeId)) return false;
    this._expanded.delete(nodeId);
    this._record('collapse', { nodeId });
    this._emit();
    return true;
  }

  // ---- Closure 生命周期 ----
  /** 触发收束：通常由关键证据确认后调用。 */
  triggerClosure(triggerEvidence, move = null) {
    if (this._closure.state !== CLOSURE_STATE.IDLE) return false;
    this._closure.state = CLOSURE_STATE.TRIGGERED;
    this._closure.move = move ?? this._events.length;
    this._closure.triggerEvidence = (Array.isArray(triggerEvidence) ? triggerEvidence : [triggerEvidence]).filter(Boolean);
    this._record('closure_trigger', { move: this._closure.move, triggerEvidence: this._closure.triggerEvidence });
    this._emit();
    return true;
  }

  /** 关闭案件：终局收束。 */
  closeCase(move = null) {
    if (this._closure.state === CLOSURE_STATE.CLOSED) return false;
    this._closure.state = CLOSURE_STATE.CLOSED;
    this._closure.move = move ?? this._closure.move ?? this._events.length;
    this._record('closure_close', { move: this._closure.move });
    this._emit();
    return true;
  }

  // ---- 查询 ----
  isDiscovered(id) { return this._discovered.has(id); }
  isConfirmed(id) { return this._confirmed.has(id); }
  isExpanded(id) { return this._expanded.has(id); }

  evidenceState(id) {
    if (this._confirmed.has(id)) return EVIDENCE_STATE.CONFIRMED;
    if (this._discovered.has(id)) return EVIDENCE_STATE.DISCOVERED;
    return EVIDENCE_STATE.UNDISCOVERED;
  }

  get closureState() { return this._closure.state; }
  get closureMove() { return this._closure.move; }
  get discoveredCount() { return this._discovered.size; }
  get confirmedCount() { return this._confirmed.size; }
  get totalEvidence() { return this.graph?.nodes?.length ?? 0; }
  get events() { return this._events; }

  /** 调查完成度（0-1）：已发现 / 总证据 */
  get progress() {
    const total = this.totalEvidence;
    return total > 0 ? this._discovered.size / total : 0;
  }

  // ---- 快照 / 持久化（冻结结构）----
  snapshot() {
    return this.serialize();
  }

  serialize() {
    // 只存 graphId 引用，绝不序列化 Graph 本体（节点/边/metadata）。
    // 加载时用 graphId 从静态资源重新生成，再 attachGraph() 接回。
    return {
      levelId: this.levelId,
      graphId: this.graphId,
      discoveredEvidence: [...this._discovered],
      confirmedEvidence: [...this._confirmed],
      currentClosureState: {
        state: this._closure.state,
        move: this._closure.move,
        triggerEvidence: [...this._closure.triggerEvidence],
      },
    };
  }

  deserialize(data) {
    if (!data) return this;
    this.levelId = data.levelId ?? this.levelId;
    this.graphId = data.graphId ?? this.graphId;
    // Graph 不在此恢复：需用 graphId 重新加载后再 attachGraph()。
    this._discovered = new Set(data.discoveredEvidence || []);
    this._confirmed = new Set(data.confirmedEvidence || []);
    this._closure = {
      state: data.currentClosureState?.state || CLOSURE_STATE.IDLE,
      move: data.currentClosureState?.move ?? null,
      triggerEvidence: data.currentClosureState?.triggerEvidence || [],
    };
    this._record('restore', {});
    this._emit();
    return this;
  }

  // ---- 内部 ----
  _record(type, payload) {
    this._events.push({ type, move: payload.move ?? null, ...payload });
  }

  _emit() {
    if (this.onChange) this.onChange(this);
  }
}

export default InvestigationState;