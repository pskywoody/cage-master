// ==========================================
// InvestigationViewModel - Evidence System (Step 7 前置)
// ==========================================
// UI 数据投影层：把四个核心对象投影成 45 Panel 可直接消费的只读视图。
//
//   EvidenceRecord    + EvidenceMetadata + InvestigationState → Evidence Tab
//   CaseTimeline                                          → Timeline Tab
//   EvidenceGraph     + InvestigationState                → Board Tab
//
// 原则：
//   - 只读投影，永不改核心模型。
//   - UI 只碰 ViewModel，不直接读 EvidenceRecord / Graph / InvestigationState。
//   - 这样 45 Panel 不会再次开始吞逻辑。
//
// 内部统一把 InvestigationState 的 runtime 状态合入每个证据/节点：
//   undiscovered → DISCOVERED? → CONFIRMED
// ==========================================

import { EVIDENCE_STATE } from './investigation-state.js';
import { BEAT_TITLE, EVENT_TYPE } from './case-timeline.js';

export const EVIDENCE_STATE_LABEL = {
  [EVIDENCE_STATE.UNDISCOVERED]: '未发现',
  [EVIDENCE_STATE.DISCOVERED]: '已发现',
  [EVIDENCE_STATE.CONFIRMED]: '已确认',
};

// ---- Evidence Tab 投影 ----
/**
 * @param {Object} deps
 * @param {Array}  deps.records   - EvidenceRecord[]
 * @param {Object} deps.meta      - buildEvidenceMetadata() 输出（evidenceId → EvidenceMetadata）
 * @param {Object} deps.state     - InvestigationState
 * @returns {Array} 证据视图条目，按 evidenceValue 降序
 */
export function buildEvidenceTab({ records = [], meta = {}, state = null } = {}) {
  // target(cage) id → evidenceId，用于把 causedBy/leadsTo 的 cage id 映射回证据
  const byTarget = new Map();
  for (const r of records) {
    if (r.target?.id != null) byTarget.set(r.target.id, r.id);
  }

  return records
    .map(r => {
      const m = meta[r.id] || {};
      const related = new Set();
      for (const l of [...(r.causedBy || []), ...(r.leadsTo || [])]) {
        const eid = byTarget.get(l.id);
        if (eid) related.add(eid);
      }
      const st = state ? state.evidenceState(r.id) : EVIDENCE_STATE.UNDISCOVERED;
      return {
        evidenceId: r.id,
        targetId: r.target?.id ?? null,
        role: r.role,
        roleLabel: m.display?.description?.split(' · ')[0] || r.role,
        icon: m.display?.icon || '',
        color: m.display?.color || '#8a8f98',
        title: m.display?.title || r.id,
        evidenceValue: r.evidenceValue ?? 0,
        state: st,
        stateLabel: EVIDENCE_STATE_LABEL[st] || st,
        stateTransition: r.stateTransition || {},
        discoveredAt: r.timeline?.discoveredAt ?? null,
        resolvedAt: r.timeline?.resolvedAt ?? null,
        feedsDownstream: m.ui?.feedsDownstream ?? 0,
        priority: m.ui?.priority ?? 0,
        collapsed: m.ui?.collapsed ?? false,
        relatedEvidence: [...related],
      };
    })
    .sort((a, b) => b.evidenceValue - a.evidenceValue);
}

// ---- Timeline Tab 投影 ----
export const EVENT_TYPE_LABEL = {
  [EVENT_TYPE.EVIDENCE_CONFIRMED]: '证据确认',
  [EVENT_TYPE.CLUSTER_FORM]: '线索团形成',
  [EVENT_TYPE.CLOSURE]: '案件收束',
};

/** 直接投影 CaseTimeline，并给每个 beat 补中文标题、给每个 event 补类型标签。 */
export function buildTimelineTab(timeline = null) {
  if (!timeline) return { beats: [], events: [], closure: null };
  return {
    beats: (timeline.beats || []).map(b => ({ type: b.type, move: b.move, title: BEAT_TITLE[b.type] || b.type })),
    events: (timeline.events || []).map(e => ({ ...e, label: EVENT_TYPE_LABEL[e.type] || e.type })),
    closure: timeline.closure || null,
  };
}

// ---- Board Tab 投影 ----
/**
 * @param {Object} deps
 * @param {Object} deps.graph   - EvidenceGraph
 * @param {Object} deps.meta    - buildEvidenceMetadata() 输出（evidenceId → EvidenceMetadata）
 * @param {Object} deps.state   - InvestigationState
 * @returns {Object} { nodes, edges, closureNode, primarySubgraph, spine }
 */
export function buildBoardTab({ graph = null, meta = {}, state = null } = {}) {
  if (!graph) return { nodes: [], edges: [], closureNode: null, primarySubgraph: null, spine: [] };
  const nodes = (graph.nodes || []).map(n => {
    const st = state ? state.evidenceState(n.id) : EVIDENCE_STATE.UNDISCOVERED;
    const m = meta[n.id] || {};
    return {
      id: n.id,
      targetId: n.targetId,
      type: n.type,
      role: n.role,
      hash: m.evidenceId ? m.evidenceId.replace(/^EV-\d+-CAGE-/, '#') : `#${n.targetId}`,
      title: m.display?.title || `证据 #${n.targetId}`,
      color: m.display?.color || '#8a8f98',
      state: st,
      stateLabel: EVIDENCE_STATE_LABEL[st] || st,
      expanded: state ? state.isExpanded(n.id) : false,
    };
  });
  const closureNode = graph.closureNode
    ? { ...graph.closureNode, state: state && state.closureState ? state.closureState : null }
    : null;
  return {
    nodes,
    edges: graph.edges || [],
    closureNode,
    primarySubgraph: graph.primarySubgraph || null,
    spine: graph.primarySubgraph?.spine || [],
  };
}

// ---- 总投影 ----
/**
 * 一次性投影 45 Panel Investigation Mode 三个 Tab 的全部数据。
 * @param {Object} deps
 * @param {Array}  deps.records
 * @param {Object} deps.graph
 * @param {Object} deps.meta
 * @param {Object} deps.timeline
 * @param {Object} deps.state
 * @returns {Object} { levelId, evidence, timeline, board, meta }
 */
export function buildInvestigationViewModel({ levelId = null, records = [], graph = null, meta = {}, timeline = null, state = null } = {}) {
  return {
    levelId: levelId ?? graph?.levelId ?? timeline?.levelId ?? null,
    evidence: buildEvidenceTab({ records, meta, state }),
    timeline: buildTimelineTab(timeline),
    board: buildBoardTab({ graph, meta, state }),
    meta: {
      progress: state ? state.progress : 0,
      discovered: state ? state.discoveredCount : 0,
      confirmed: state ? state.confirmedCount : 0,
      total: state ? state.totalEvidence : records.length,
      closureState: state ? state.closureState : null,
    },
  };
}

// ---- Note 投影（Step 8 · Goal 4）----
/**
 * 把 Player Memory 层（InvestigationNotesStore 的某关笔记）只读合入 ViewModel。
 * 不修改任何核心模型，返回浅拷贝。面板只读 note.text / note.exists / note.textPreview。
 * @param {Object} vm         - buildInvestigationViewModel() 输出
 * @param {Object} [notes]    - { evidenceId: { text, updatedAt } }
 * @returns {Object} 带 note 字段的 vm 浅拷贝
 */
export function projectNotes(vm, notes = {}) {
  if (!vm) return vm;
  const evidence = (vm.evidence || []).map((e) => {
    const t = (notes && notes[e.evidenceId] && notes[e.evidenceId].text) || '';
    return {
      ...e,
      note: {
        exists: !!t,
        text: t,
        textPreview: t.split('\n')[0].slice(0, 24),
      },
    };
  });
  return { ...vm, evidence };
}

export default { buildInvestigationViewModel, buildEvidenceTab, buildTimelineTab, buildBoardTab, projectNotes, EVIDENCE_STATE_LABEL, EVENT_TYPE_LABEL };