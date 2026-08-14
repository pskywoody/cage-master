// ==========================================
// EvidenceRecord - Evidence System (Step 3)
// ==========================================
// 把 Case Analytics 输出（case-analyzer-report.js）转换成游戏可消费的证据条目。
//
// 核心转变：
//   note = 玩家备注          （旧）
//   EvidenceRecord = 案件档案中的证据条目（新）
//
// EvidenceRecord 不保存答案，只记录"为什么这个地方开始变得重要"。
//
// 证据角色（EvidenceRole）：
//   primary_clue    核心线索   evidenceValue >= 7   关键证据，喂给多个下游
//   supporting      辅助证据   5 <= value < 7       帮助确认
//   background      背景信息   3 <= value < 5       记录但不突出
//   noise           低价值     < 3                  不进入 Notes
//
// 自动生成流程：
//   Level JSON → Case Analyzer → Evidence Extractor → EvidenceRecord[] → UI Binding
//   关卡作者无需手写 notes，系统自动生成 evidence。
// ==========================================

export const EVIDENCE_ROLE = {
  PRIMARY_CLUE: 'primary_clue',
  SUPPORTING: 'supporting',
  BACKGROUND: 'background',
  NOISE: 'noise',
};

/** 依据 evidenceValue 分类证据角色 */
export function classifyRole(evidenceValue) {
  if (evidenceValue >= 7) return EVIDENCE_ROLE.PRIMARY_CLUE;
  if (evidenceValue >= 5) return EVIDENCE_ROLE.SUPPORTING;
  if (evidenceValue >= 3) return EVIDENCE_ROLE.BACKGROUND;
  return EVIDENCE_ROLE.NOISE;
}

/** 生成证据 ID：EV-{level}-{TYPE}-{id} */
function _evidenceId(levelId, type, id) {
  return `EV-${levelId}-${String(type).toUpperCase()}-${id}`;
}

/**
 * 从单关 Case Analytics 报告构建 EvidenceRecord[] + closure + graph。
 * @param {Object} caseReport - core/case-analyzer-report.js 的 analyze() 输出
 * @returns {Object} { levelId, records, closure, graph }
 */
export function buildEvidenceRecords(caseReport) {
  const levelId = caseReport.level;
  const nodes = (caseReport.evidence && caseReport.evidence.nodes) || [];
  const criticalPath = caseReport.criticalEvidencePath || [];

  // 过滤：仅保留 evidenceValue >= 3 的节点（noise 不进入 Notes）
  const significant = nodes.filter(n => n.evidenceValue >= 3);

  // 按收束顺序排序，作为证据链骨架
  const ordered = [...significant].sort((a, b) => (a.resolvedAtMove ?? 0) - (b.resolvedAtMove ?? 0));

  // 依赖链：每个节点 leadsTo 其直接后继，causedBy 其直接前驱
  const indexOf = new Map(ordered.map((n, i) => [n.cage, i]));

  const records = ordered.map((n, idx) => {
    const role = classifyRole(n.evidenceValue);
    const states = n.states || [];
    const last = states[states.length - 1];
    const prev = states.length > 1 ? states[states.length - 2] : states[0];

    // stateTransition：from = 首个观测态，to = 决胜变化态，final = RESOLVED
    const stateTransition = {
      from: states[0] || last,
      to: prev || last,
      final: last || 'OPEN',
    };

    // timeline
    const discoveredAt = n.focusedAtMove ?? n.resolvedAtMove ?? 0;
    const timeline = {
      discoveredAt,
      narrowedAt: n.focusedAtMove ?? null,
      resolvedAt: n.resolvedAtMove ?? null,
    };

    // causedBy / leadsTo（证据链上的直接前驱 / 后继）
    const causedBy = idx > 0 ? [{ type: 'cage', id: ordered[idx - 1].cage }] : [];
    const leadsTo = idx < ordered.length - 1 ? [{ type: 'cage', id: ordered[idx + 1].cage }] : [];

    // EvidenceRecord v1 冻结：仅 10 个字段，不再增加。
    // 任何展示/派生度量（如 feedsDownstream）一律进 EvidenceMetadata。
    return {
      id: _evidenceId(levelId, 'CAGE', n.cage),
      levelId,
      target: { type: 'cage', id: n.cage },
      role,
      evidenceValue: n.evidenceValue,
      stateTransition,
      timeline,
      causedBy,
      leadsTo,
      status: last === 'RESOLVED' ? 'confirmed' : 'open',
    };
  });

  // closure：由 closureEvent 生成特殊证据
  const ce = caseReport.closureEvent || {};
  const lastRec = records[records.length - 1];
  const closure = {
    id: `CLOSURE-${levelId}`,
    type: 'closure',
    levelId,
    triggerEvidence: lastRec ? [lastRec.id] : [],
    timeline: { move: ce.move ?? null, totalMoves: ce.totalMoves ?? null },
    closurePoint: ce.closurePoint ?? null,
    description: ce.description || '案件收束',
    status: 'fired',
  };

  // Evidence Graph：节点 + 边
  const graph = {
    levelId,
    nodes: records.map(r => ({ id: r.target.id, evidenceId: r.id, role: r.role, evidenceValue: r.evidenceValue, resolvedAtMove: r.timeline.resolvedAt })),
    edges: records.slice(0, -1).map((r, idx) => ({ from: r.target.id, to: records[idx + 1].target.id })),
    criticalPath,
  };

  return { levelId, records, closure, graph };
}

/** 便捷：仅返回单关记录（不含 closure） */
export function buildEvidencePayload(caseReport) {
  const { levelId, records, closure, graph } = buildEvidenceRecords(caseReport);
  return { levelId, evidence: records, closure, graph };
}

export default { EVIDENCE_ROLE, classifyRole, buildEvidenceRecords, buildEvidencePayload };