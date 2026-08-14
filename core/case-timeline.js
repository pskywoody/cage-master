// ==========================================
// CaseTimeline v1 - Evidence System (Step 6)
// ==========================================
// 把静态证据链 + 运行时调查状态，组织成"玩家经历过的一次调查过程"。
//
// Timeline 不是 Sudoku replay log：它不显示所有走子。
// 它只回答：玩家调查这个案件经历了什么过程？
//
// 输入（三个稳定源，均冻结）：
//   - EvidenceRecord[].timeline   （discoveredAt / narrowedAt / resolvedAt）
//   - InvestigationState._events  （可选，运行时真实顺序）
//   - EvidenceGraph              （causedBy / leadsTo，用于 cluster 归属）
//
// 输出结构（v1 冻结）：
//   {
//     levelId,
//     events: [ { move, type, evidenceId | evidenceIds } ],  // 离散事实
//     beats:  [ { type, move } ],                            // 叙事抽象
//     mainline,
//     closure
//   }
//
// 三类事件（EVENT_TYPE）：
//   evidence_confirmed  某条证据确认
//   cluster_form        核心证据落地，形成线索团（含其解锁的下游）
//   closure             案件收束
//
// 三类节奏（BEAT_TYPE）：
//   breakthrough            首次突破
//   investigation_narrowed  调查收束（确认进度过中点）
//   case_closed             案件关闭
// ==========================================

import { EVIDENCE_ROLE } from './evidence-record.js';

export const EVENT_TYPE = {
  EVIDENCE_CONFIRMED: 'evidence_confirmed',
  CLUSTER_FORM: 'cluster_form',
  CLOSURE: 'closure',
};

export const BEAT_TYPE = {
  BREAKTHROUGH: 'breakthrough',
  INVESTIGATION_NARROWED: 'investigation_narrowed',
  CASE_CLOSED: 'case_closed',
};

export const BEAT_TITLE = {
  [BEAT_TYPE.BREAKTHROUGH]: '首次突破',
  [BEAT_TYPE.INVESTIGATION_NARROWED]: '调查收束',
  [BEAT_TYPE.CASE_CLOSED]: '案件关闭',
};

/**
 * 构建案件时间线。
 * @param {Object} opts
 * @param {Array}  opts.records  - frozen EvidenceRecord[]
 * @param {Object} opts.closure  - closure（含 timeline.move / closurePoint）
 * @param {Object} [opts.state]  - InvestigationState（可选）
 * @returns {Object} CaseTimeline v1
 */
export function buildCaseTimeline({ records = [], closure = {}, state = null } = {}) {
  const levelId = closure.levelId ?? records[0]?.levelId ?? null;

  // target(cage) id → record，用于把 leadsTo 的 cage id 映射回证据 id
  const byTarget = new Map();
  for (const r of records) {
    if (r.target?.id != null) byTarget.set(r.target.id, r);
  }

  const confirmations = records
    .filter(r => r.timeline?.resolvedAt != null)
    .map(r => ({ move: r.timeline.resolvedAt, evidenceId: r.id, role: r.role, evidenceValue: r.evidenceValue, leadsTo: r.leadsTo || [] }));

  // ---- 事件（离散事实）----
  const events = [];
  for (const c of confirmations) {
    events.push({ move: c.move, type: EVENT_TYPE.EVIDENCE_CONFIRMED, evidenceId: c.evidenceId });
    // 核心证据确认 → 形成线索团（含它解锁的下游）
    if (c.role === EVIDENCE_ROLE.PRIMARY_CLUE) {
      const clusterIds = [c.evidenceId];
      for (const l of c.leadsTo) {
        const targetRec = byTarget.get(l.id);
        if (targetRec) clusterIds.push(targetRec.id);
      }
      events.push({ move: c.move, type: EVENT_TYPE.CLUSTER_FORM, evidenceIds: clusterIds });
    }
  }

  const closureMove = closure.timeline?.move ?? null;
  if (closureMove != null) {
    events.push({ move: closureMove, type: EVENT_TYPE.CLOSURE, evidenceId: closure.id ?? `CLOSURE-${levelId}` });
  }

  // 排序 + 合并同 move 的 cluster_form（union evidenceIds）
  events.sort((a, b) => a.move - b.move);
  const merged = [];
  for (const ev of events) {
    const last = merged[merged.length - 1];
    if (last && last.move === ev.move && last.type === ev.type && ev.type === EVENT_TYPE.CLUSTER_FORM) {
      last.evidenceIds = [...new Set([...last.evidenceIds, ...ev.evidenceIds])];
    } else {
      merged.push({ ...ev, evidenceIds: ev.evidenceIds ? [...ev.evidenceIds] : undefined });
    }
  }

  // ---- 节奏（叙事抽象）----
  const beats = [];
  if (confirmations.length) {
    beats.push({ type: BEAT_TYPE.BREAKTHROUGH, move: confirmations[0].move });
    const total = confirmations.length;
    const mid = Math.ceil(total / 2);
    if (mid > 1 && mid <= total) {
      beats.push({ type: BEAT_TYPE.INVESTIGATION_NARROWED, move: confirmations[mid - 1].move });
    }
  }
  if (closureMove != null) {
    beats.push({ type: BEAT_TYPE.CASE_CLOSED, move: closureMove });
  }
  // 去重（同 move 同 type）
  const seen = new Set();
  const uniqueBeats = [];
  for (const b of beats.sort((a, b) => a.move - b.move)) {
    const key = `${b.move}:${b.type}`;
    if (!seen.has(key)) { seen.add(key); uniqueBeats.push(b); }
  }

  // ---- 主线：证据确认顺序 ----
  const mainline = confirmations.map(c => c.evidenceId);

  // ---- 统计 ----
  const resolvedMoves = confirmations.map(c => c.move);
  const meta = {
    evidenceConfirmed: confirmations.length,
    span: resolvedMoves.length ? Math.max(...resolvedMoves) - Math.min(...resolvedMoves) : 0,
    events: merged.length,
    beats: uniqueBeats.length,
    runtimeOrdered: Boolean(state?.events?.length),
  };

  return {
    levelId,
    events: merged,
    beats: uniqueBeats,
    mainline,
    closure: { move: closureMove, closurePoint: closure.closurePoint ?? null },
    meta,
  };
}

export default { buildCaseTimeline, EVENT_TYPE, BEAT_TYPE, BEAT_TITLE };