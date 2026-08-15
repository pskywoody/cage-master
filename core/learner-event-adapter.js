// core/learner-event-adapter.js
// 只读事件适配器：把已有来源的原始信号统一成 Learner Event，再映射为 LearnerModel.observe 的输入。
// 不创造事件，不接生产教学，不改任何行为。

let _seq = 0;

function nextId() {
  _seq += 1;
  return `ev_${Date.now().toString(36)}_${_seq}`;
}

/**
 * 把单一原始信号归一化为统一 Learner Event。
 * @param {Object} raw - 任意已有来源的原始信号
 * @returns {Object} 统一事件
 */
export function normalize(raw) {
  const src = (raw && raw.source) || 'unknown';
  const ev = {
    eventId: (raw && raw.eventId) || nextId(),
    timestamp: (raw && raw.timestamp) || Date.now(),
    source: src,
    sessionId: (raw && raw.sessionId) || null,
    technique: (raw && raw.technique) || null,
    action: (raw && raw.action) || 'unknown',
    outcome: (raw && raw.outcome) || 'neutral',
    metadata: (raw && raw.metadata && typeof raw.metadata === 'object') ? raw.metadata : {},
  };
  return ev;
}

const ACTION_MAP = {
  skill_encounter: { type: 'encounter' },
  skill_used_correctly: { type: 'correct', independent: true },
  skill_mastery: { type: 'correct', independent: true },
  guided_success: { type: 'correct', independent: false },
  fail: { type: 'error' },
  reveal: { type: 'hint' },
  technique_taught: { type: 'encounter' },
  hint_requested: { type: 'hint' },
  hint_level: { type: 'hint' },
  hint_followed: { type: 'correct', independent: false },
  mistake: { type: 'error' },
};

/**
 * 把统一 Learner Event 映射为 LearnerModel.observe 的输入。
 * 无技巧粒度的事件（solve_complete/duration/attempt 等）返回 null，交给调用方跳过。
 * @param {Object} learnerEvent
 * @returns {Object|null} - { technique, type, ts, independent?, hintLevel? }
 */
export function toObservation(learnerEvent) {
  if (!learnerEvent || !learnerEvent.technique) return null;
  const mapped = ACTION_MAP[learnerEvent.action];
  if (!mapped) return null;
  const obs = {
    technique: learnerEvent.technique,
    type: mapped.type,
    ts: learnerEvent.timestamp,
  };
  if (mapped.independent !== undefined) obs.independent = mapped.independent;
  const hl = learnerEvent.metadata && learnerEvent.metadata.hintLevel;
  if (learnerEvent.action === 'guided_success' || learnerEvent.action === 'hint_level' || learnerEvent.action === 'reveal') {
    if (hl !== undefined && hl !== null) obs.hintLevel = hl;
  }
  return obs;
}