// core/experiment-runtime-bridge.js
// 只读研究基础设施：运行时桥。连接 LearnerEventAdapter + ExperimentEventCollector。
// 把 raw 信号归一化为实验事件，不接生产、不改任何行为。

import { normalize, toObservation } from './learner-event-adapter.js';
import { ExperimentEventCollector } from './experiment-event-collector.js';

const INTERVENTION = new Set(['hint_request', 'hint_level', 'hint_shown', 'reveal', 'semiAuto_hint']);
const OUTCOME = new Set(['skill_mastery', 'skill_used_correctly', 'lesson_complete', 'solve_success']);
const EXPOSURE = new Set(['skill_encounter', 'technique_taught', 'lesson_started', 'guided_start', 'experiment_exposed', 'variant_seen']);

export function classifyEventType(action) {
  if (INTERVENTION.has(action)) return 'intervention';
  if (OUTCOME.has(action)) return 'outcome';
  if (EXPOSURE.has(action)) return 'exposure';
  return 'behavior';
}

export class RuntimeBridge {
  constructor({ experimentId = null, subjectId = null, collector } = {}) {
    this.collector = collector || new ExperimentEventCollector({ experimentId, subjectId });
    this._battleSeq = 0;
  }

  /**
   * 消费一条 raw learner 信号（TeachingSystem/LessonPlayer/HintSystem/Puzzle 源），
   * 复用 learner-event-adapter 的 normalize + toObservation。
   */
  consumeLearnerEvent(raw) {
    const ev = normalize(raw);
    const obs = toObservation(ev);
    if (!obs) return null;
    return this.collector.record({
      source: ev.source,
      eventType: classifyEventType(ev.action),
      timestamp: ev.timestamp,
      subjectId: ev.sessionId || undefined,
      payload: {
        technique: ev.technique,
        action: ev.action,
        outcome: ev.outcome,
        metadata: { ...ev.metadata, hintLevel: obs.hintLevel },
      },
    });
  }

  /**
   * 消费一条 Battle AI 决策（来自 data/battle-ai-traces/decisions.jsonl）。
   * trace 本身无时间戳，由桥按序合成单调时间。
   */
  consumeBattleDecision(decision, timestamp) {
    const ts = timestamp || Date.now() + this._battleSeq * 1000;
    this._battleSeq += 1;
    return this.collector.record({
      source: 'BattleAI',
      eventType: 'behavior',
      timestamp: ts,
      payload: {
        technique: decision.technique || null,
        action: 'battle_decision',
        outcome: 'neutral',
        metadata: {
          personality: decision.personality || null,
          state: decision.state || null,
          strategy: decision.strategy || null,
          directorStrategy: decision.directorStrategy || null,
          moveCount: decision.moveCount,
        },
      },
    });
  }

  flush() { return this.collector.toJsonl(); }
  count() { return this.collector.count(); }
}