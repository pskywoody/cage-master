// core/experiment-event-collector.js
// 只读研究基础设施：运行时事件收集器（实验镜像，不是业务事件）。
// 接收 { source, eventType, payload } → 统一实验事件。不接生产、不改任何行为。

export class ExperimentEventCollector {
  constructor({ experimentId = null, subjectId = null } = {}) {
    this._experimentId = experimentId;
    this._subjectId = subjectId;
    this._events = [];
  }

  bind({ experimentId, subjectId }) {
    if (experimentId !== undefined) this._experimentId = experimentId;
    if (subjectId !== undefined) this._subjectId = subjectId;
    return this;
  }

  /**
   * 记录一条实验镜像事件。
   * @param {Object} rec - { source, eventType, payload, timestamp? }
   * @param {Object} [rec.payload] - { technique, action, outcome, metadata }
   * @returns {Object} 归一化事件
   */
  record({ source, eventType, payload, timestamp, subjectId, experimentId } = {}) {
    payload = payload || {};
    const ev = {
      experimentId: experimentId !== undefined ? experimentId : this._experimentId,
      subjectId: subjectId !== undefined ? subjectId : this._subjectId,
      timestamp: timestamp || Date.now(),
      eventType: eventType || 'behavior',
      source: source || 'unknown',
      technique: payload.technique || null,
      action: payload.action || null,
      outcome: payload.outcome || 'neutral',
      metadata: payload.metadata || {},
    };
    this._events.push(ev);
    return ev;
  }

  events() { return this._events.slice(); }
  count() { return this._events.length; }
  toJsonl() { return this._events.map((e) => JSON.stringify(e)).join('\n') + '\n'; }
}