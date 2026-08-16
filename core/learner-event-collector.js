// ============================================================
// learner-event-collector.js — Teaching AI Phase 14.5
// Learner Event Collector：session 管理 + collect() API + JSONL 落盘。
// 只读采集器：不改任何来源行为（LessonPlayer/HintSystem/TeachingSystem/Puzzle），
// 由各来源在既有事件点调用本 API 追加写入（挂接点见 docs/CM4/learner-event-capture-foundation.md）。
// ============================================================
import fs from 'fs';
import path from 'path';

let _seq = 0;
function nextId() { _seq += 1; return `ev_${Date.now().toString(36)}_${_seq}`; }
function nowIso() { return new Date().toISOString(); }

export class LearnerEventCollector {
  /**
   * @param {Object} opts
   * @param {string} [opts.filePath] - JSONL 落盘路径（append-only）
   * @param {string} [opts.sessionId]
   */
  constructor({ filePath, sessionId } = {}) {
    this._filePath = filePath || null;
    this._sessionId = sessionId || `sess_${Date.now().toString(36)}`;
    this._events = [];
    this._open = true;
    if (this._filePath) fs.mkdirSync(path.dirname(this._filePath), { recursive: true });
  }

  /**
   * 采集一条运行时信号，输出 capture-contract 形状的事件并追加落盘。
   * @param {Object} raw { source, technique, actionType, success?, mistakes?, solveTime?, timestamp? }
   */
  collect(raw) {
    if (!this._open) return null;
    const ev = {
      eventId: (raw && raw.eventId) || nextId(),
      sessionId: (raw && raw.sessionId) || this._sessionId,
      timestamp: (raw && raw.timestamp) || nowIso(),
      source: (raw && raw.source) || 'unknown',
      technique: (raw && raw.technique) || null,
      action: { type: (raw && raw.actionType) || 'attempt' },
      outcome: {
        success: (raw && raw.success !== undefined) ? raw.success : null,
        mistakes: (raw && raw.mistakes !== undefined) ? raw.mistakes : null,
        solveTime: (raw && raw.solveTime !== undefined) ? raw.solveTime : null,
      },
    };
    this._events.push(ev);
    if (this._filePath) fs.appendFileSync(this._filePath, JSON.stringify(ev) + '\n');
    return ev;
  }

  /** 取当前 session 快照 { sessionId, events[] }（Gate 1 输出） */
  getSession() {
    return { sessionId: this._sessionId, events: this._events.slice() };
  }

  finalize() {
    this._open = false;
    return this.getSession();
  }
}