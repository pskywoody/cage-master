// ==========================================
// EvidenceMetadata - Evidence System (展示解释层)
// ==========================================
// EvidenceRecord v1 冻结后，任何"呈现 / 叙事"需求都进本层，不再污染核心模型。
//
//   EvidenceRecord   = 案件事实层（id / role / evidenceValue / ...）冻结不变
//   EvidenceMetadata = 展示解释层（icon / title / color / priority / ...）
//
// 本模块负责派生每个证据的展示信息 + 派生度量（如 feedsDownstream）。
// Evidence Graph 只读 EvidenceRecord 的冻结字段，展示字段可从这里取。
// ==========================================

import { EVIDENCE_ROLE } from './evidence-record.js';

export const EVIDENCE_ROLE_META = {
  [EVIDENCE_ROLE.PRIMARY_CLUE]: { icon: '★', color: '#e0a63c', label: '核心线索', priority: 3 },
  [EVIDENCE_ROLE.SUPPORTING]:   { icon: '◆', color: '#4caf7d', label: '辅助证据', priority: 2 },
  [EVIDENCE_ROLE.BACKGROUND]:   { icon: '·', color: '#8a8f98', label: '背景信息', priority: 1 },
  [EVIDENCE_ROLE.NOISE]:        { icon: '·', color: '#5c6470', label: '噪声',     priority: 0 },
};

/** 由收束链顺序派生：每个证据喂给多少下游（调查传播力） */
export function computeFeedsDownstream(records) {
  const ordered = [...records].sort((a, b) => (a.timeline?.resolvedAt ?? 0) - (b.timeline?.resolvedAt ?? 0));
  const indexOf = new Map(ordered.map((r, i) => [r.id, i]));
  return (evidenceId) => {
    const idx = indexOf.get(evidenceId);
    if (idx == null) return 0;
    return ordered.length - 1 - idx;
  };
}

/** 状态迁移展示文本：OPEN → RESOLVED（同态则只显示终态） */
export function stateLabelOf(st) {
  if (!st) return '';
  return st.from === st.final ? st.final : `${st.from} → ${st.final}`;
}

/**
 * 为一份 EvidenceRecord[] 派生展示元数据。
 * @param {Array} records - frozen EvidenceRecord[]
 * @returns {Object} metaById: { [evidenceId]: EvidenceMetadata }
 */
export function buildEvidenceMetadata(records) {
  const feedsDownstream = computeFeedsDownstream(records);
  const meta = {};
  for (const r of records) {
    const roleMeta = EVIDENCE_ROLE_META[r.role] || EVIDENCE_ROLE_META[EVIDENCE_ROLE.NOISE];
    meta[r.id] = {
      evidenceId: r.id,
      display: {
        icon: roleMeta.icon,
        title: `证据 #${r.target?.id ?? ''}`,
        description: `${roleMeta.label} · 价值 ${r.evidenceValue ?? 0}`,
        color: roleMeta.color,
        stateLabel: stateLabelOf(r.stateTransition),
      },
      ui: {
        priority: roleMeta.priority,
        collapsed: r.role === EVIDENCE_ROLE.BACKGROUND,
        feedsDownstream: feedsDownstream(r.id),
      },
      // 叙事 / 解锁 / 动画等未来需求，全部挂这里
      narrative: {},
    };
  }
  return meta;
}

export default { EVIDENCE_ROLE_META, buildEvidenceMetadata, computeFeedsDownstream, stateLabelOf };