// ==========================================
// EvidenceGraph - Evidence System (Step 4)
// ==========================================
// EvidenceRecord 是节点，Evidence Graph 让玩家看到节点之间的关系。
//
// 定位：EvidenceRecord[] → Evidence Graph → Case Board
//
// 不直接显示 Cage，而是显示 Evidence Node。
// 玩家看到的是"这些线索如何共同关闭案件"，而不是"某笼填了什么数字"。
//
// 节点四类：
//   primary       核心证据（role=primary_clue）→ 大节点
//   supporting    辅助证据（role=supporting）   → 小节点，连接主线
//   background    背景证据（role=background）   → 默认隐藏，点开才显示
//   closure       收束事件（非 Cage）           → 特殊节点 CASE CLOSED
//
// 输入：Evidence Extractor 产出（evidence-record.js 的 buildEvidenceRecords 结果）
// ==========================================

import { EVIDENCE_ROLE } from './evidence-record.js';

export const NODE_TYPE = {
  PRIMARY: 'primary',
  SUPPORTING: 'supporting',
  BACKGROUND: 'background',
  CLOSURE: 'closure',
};

/** evidenceValue 分档 → 节点类型 */
export function nodeTypeForRole(role) {
  if (role === EVIDENCE_ROLE.PRIMARY_CLUE) return NODE_TYPE.PRIMARY;
  if (role === EVIDENCE_ROLE.SUPPORTING) return NODE_TYPE.SUPPORTING;
  if (role === EVIDENCE_ROLE.BACKGROUND) return NODE_TYPE.BACKGROUND;
  return NODE_TYPE.BACKGROUND;
}

/**
 * 从 Evidence Extractor 输出构建 Case Board 图。
 * @param {Object} payload - buildEvidenceRecords() 的返回值 { levelId, records, closure, graph }
 * @returns {Object} { levelId, nodes, edges, closureNode, meta, primarySubgraph, layoutHint }
 */
export function buildEvidenceGraph(payload) {
  const levelId = payload.levelId;
  const records = payload.evidence || payload.records || [];
  const closure = payload.closure || {};

  // feedsDownstream 是展示层派生度量，从收束链顺序计算（不再读取 EvidenceRecord）
  const _orderedByResolve = [...records].sort((a, b) => (a.timeline?.resolvedAt ?? 0) - (b.timeline?.resolvedAt ?? 0));
  const _resolveIndex = new Map(_orderedByResolve.map((r, i) => [r.id, i]));
  const _feedsDownstream = (id) => {
    const idx = _resolveIndex.get(id);
    return idx == null ? 0 : _orderedByResolve.length - 1 - idx;
  };

  // ---- 节点 ----
  const nodes = records.map(r => ({
    id: r.id,                 // EV-410-CAGE-11
    targetId: r.target.id,    // 11
    type: nodeTypeForRole(r.role),
    role: r.role,
    evidenceValue: r.evidenceValue,
    stateTransition: r.stateTransition,
    timeline: r.timeline,
    feedsDownstream: _feedsDownstream(r.id),
    // 呈现层元数据（不污染 EvidenceRecord，进 node 的展示字段）
    display: {
      title: `Evidence #${r.target.id}`,
      state: r.stateTransition.from === r.stateTransition.final ? r.stateTransition.final : `${r.stateTransition.from} → ${r.stateTransition.final}`,
      discoveredAt: r.timeline.discoveredAt,
      resolvedAt: r.timeline.resolvedAt,
    },
  }));

  // ---- 收束节点 ----
  const closureNode = {
    id: closure.id || `CLOSURE-${levelId}`,
    type: NODE_TYPE.CLOSURE,
    triggerEvidence: closure.triggerEvidence || [],
    timeline: closure.timeline || {},
    closurePoint: closure.closurePoint ?? null,
    display: {
      title: 'CASE CLOSED',
      move: closure.timeline?.move ?? null,
      description: closure.description || '',
    },
  };

  // ---- 边（依赖链：直接前驱 → 直接后继）----
  const edges = [];
  for (let i = 0; i < records.length - 1; i++) {
    edges.push({ from: records[i].id, to: records[i + 1].id });
  }
  // 最后一条证据 → 收束节点
  if (records.length) {
    const last = records[records.length - 1];
    edges.push({ from: last.id, to: closureNode.id });
  }

  // ---- 只含 Primary + Supporting 的主子图（默认视图）----
  const primarySubgraph = {
    nodeIds: nodes.filter(n => n.type === NODE_TYPE.PRIMARY || n.type === NODE_TYPE.SUPPORTING).map(n => n.id),
    // 主线链：primary/supporting 按收束顺序
    spine: nodes
      .filter(n => n.type === NODE_TYPE.PRIMARY || n.type === NODE_TYPE.SUPPORTING)
      .sort((a, b) => (a.timeline.resolvedAt ?? 0) - (b.timeline.resolvedAt ?? 0))
      .map(n => n.id),
    closureNodeId: closureNode.id,
  };

  // ---- 统计 ----
  const counts = { primary: 0, supporting: 0, background: 0, closure: 1 };
  for (const n of nodes) counts[n.type] = (counts[n.type] || 0) + 1;

  return {
    levelId,
    nodes,
    edges,
    closureNode,
    primarySubgraph,
    meta: {
      nodeCount: nodes.length + 1, // + closure
      counts,
      caseScore: payload.caseScore ?? null, // 若传入
      closurePoint: closure.closurePoint ?? null,
    },
  };
}

export default { NODE_TYPE, buildEvidenceGraph, nodeTypeForRole };