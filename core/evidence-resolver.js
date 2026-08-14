// ==========================================
// EvidenceResolver - Evidence System (Step 7 前置)
// ==========================================
// 运行时适配器：把游戏引擎事件映射到 InvestigationState。
//
//      Game Engine
//           |
//     Cage State Change
//           |
//           v
//     EvidenceResolver      ← 本模块
//           |
//           v
//     InvestigationState
//           |
//           v
//     Timeline Event
//
// 职责（只做映射，不做分析）：
//   - 按 target(type, id) 反查证据
//   - onCageResolved(cageId, move)  → confirmEvidence
//   - onCageFocused(cageId, move)   → discoverEvidence（首次聚焦即"发现线索"）
//   - onClosureTriggered(cageId, move) → triggerClosure
//
// 它不关心 Sudoku 怎么填、数字是否合法——只认"哪个 cage 发生了什么"。
// ==========================================

export class EvidenceResolver {
  /**
   * @param {Object} opts
   * @param {Object} opts.graph         - EvidenceGraph（含 nodes）
   * @param {Object} opts.investigation - InvestigationState 实例
   */
  constructor({ graph = null, investigation = null } = {}) {
    this.graph = graph ?? null;
    this.investigation = investigation ?? null;
    this._index = null; // 惰性构建：type+id → node
  }

  /** 按 target 反查证据节点（graph node）。 */
  findEvidenceByTarget(type, id) {
    this._ensureIndex();
    const key = `${String(type).toLowerCase()}:${id}`;
    return this._index.get(key) ?? null;
  }

  /**
   * Cage 确认成立（关键事件）。
   * @returns {Object|null} 变更结果；未命中或未变化返回 null
   */
  onCageResolved(cageId, move = null) {
    const node = this.findEvidenceByTarget('cage', cageId);
    if (!node) return null;
    const changed = this.investigation?.confirmEvidence(node.id, move);
    return { evidenceId: node.id, changed: Boolean(changed), node };
  }

  /**
   * Cage 首次聚焦（可视为"发现线索"）。discover 幂等，重复聚焦不重复记录。
   */
  onCageFocused(cageId, move = null) {
    const node = this.findEvidenceByTarget('cage', cageId);
    if (!node) return null;
    const changed = this.investigation?.discoverEvidence(node.id, move);
    return { evidenceId: node.id, changed: Boolean(changed), node };
  }

  /**
   * Closure 触发（通常由最后一个关键证据确认后驱动）。
   */
  onClosureTriggered(move = null, triggerEvidenceId = null) {
    const inv = this.investigation;
    if (!inv) return null;
    const trigger = triggerEvidenceId ?? inv.graph?.closureNode?.id ?? null;
    const changed = inv.triggerClosure(trigger, move);
    return { closureId: trigger, changed: Boolean(changed) };
  }

  /** 快捷：传入 move 时按收束 move 关闭案件。 */
  onCaseClosed(move = null) {
    const inv = this.investigation;
    if (!inv) return null;
    const changed = inv.closeCase(move);
    return { changed: Boolean(changed) };
  }

  // ---- 内部 ----
  _ensureIndex() {
    if (this._index) return;
    this._index = new Map();
    for (const n of this.graph?.nodes || []) {
      if (n.targetId != null) {
        this._index.set(`cage:${n.targetId}`, n);
      }
    }
  }
}

/**
 * 便捷工厂：把静态 graph 与一个 investigation 实例接成 resolver。
 * @param {Object} graph         - EvidenceGraph
 * @param {Object} investigation - InvestigationState
 * @returns {EvidenceResolver}
 */
export function createResolver(graph, investigation) {
  return new EvidenceResolver({ graph, investigation });
}

export default EvidenceResolver;