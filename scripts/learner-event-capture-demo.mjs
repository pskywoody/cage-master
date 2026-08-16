// ============================================================
// learner-event-capture-demo.mjs — Teaching AI Phase 14.5
// 采集管线演示：Runtime Signals → Collector → capture-contract JSONL → Adapter
// → LearnerModel → State Refiner → UA-v2 shadow 对照。覆盖 Gate 1–4。
// 仅数据能力演示；不接真实教学、不改任何来源行为。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { LearnerEventCollector } from '../core/learner-event-collector.js';
import { normalize, toObservation } from '../core/learner-event-adapter.js';
import { LearnerModel } from '../core/learner-model.js';
import { classifyFine, coarseState, fineAction, boundaryAction } from '../core/teaching-ai-state-refiner.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'learner-event-capture');
fs.mkdirSync(OUT, { recursive: true });

// ---- Gate 1：采集器把 runtime signals 落成 capture-contract JSONL ----
const collector = new LearnerEventCollector({ filePath: path.join(OUT, 'capture.jsonl'), sessionId: 'cap-demo-s1' });
const rawSignals = [
  { source: 'TeachingSystem', technique: 'hiddenPair', actionType: 'attempt', success: false },
  { source: 'LessonPlayer', technique: 'hiddenPair', actionType: 'hint' },
  { source: 'LessonPlayer', technique: 'hiddenPair', actionType: 'attempt', success: false, mistakes: 1 },
  { source: 'LessonPlayer', technique: 'hiddenPair', actionType: 'guided_success', success: true },
  { source: 'HintSystem', technique: 'hiddenPair', actionType: 'hint' },
  { source: 'Puzzle', technique: 'hiddenPair', actionType: 'solve', success: true, mistakes: 2, solveTime: 120 },
];
for (const r of rawSignals) collector.collect(r);
const session = collector.finalize();
const gate1 = { ok: session.sessionId && session.events.length === rawSignals.length, sessionId: session.sessionId, eventCount: session.events.length };

// ---- Gate 2：adapter 消费 capture-contract → unified → observe ----
const ACTION_BRIDGE = { attempt: 'skill_encounter', hint: 'hint_requested', reveal: 'reveal', guided_success: 'guided_success', solve: 'skill_used_correctly', fail: 'fail' };
function toAdapterInput(ev) {
  return {
    eventId: ev.eventId, timestamp: Date.parse(ev.timestamp) || Date.now(), source: ev.source,
    sessionId: ev.sessionId, technique: ev.technique,
    action: ACTION_BRIDGE[ev.action.type] || ev.action.type,
    outcome: ev.outcome.success === true ? 'success' : ev.outcome.success === false ? 'error' : 'neutral',
    metadata: {},
  };
}
const lm = new LearnerModel();
const observations = [];
for (const ev of session.events) {
  const unified = normalize(toAdapterInput(ev));
  const obs = toObservation(unified);
  if (obs) { lm.observe(obs); observations.push(obs); }
}
const skillState = lm.skillState('hiddenPair');
const gate2 = { ok: observations.length > 0 && skillState.state !== 'unknown', observeCount: observations.length, skillState };

// ---- Gate 3：Phase 14 classifier 输出细粒度状态 ----
const fine = classifyFine(observations);
const coarse = coarseState(observations);
const gate3 = { ok: ['novice_exploration', 'temporary_error', 'persistent_struggle', 'guided', 'independent'].includes(fine), refinedState: fine, coarseState: coarse };

// ---- Gate 4：当前教学路径 vs UA-v2 hypothetical（哪里不同） ----
const ua2 = fineAction(fine);
const naive = boundaryAction(coarse);
const teachingEvents = session.events.filter((e) => ['hint', 'reveal', 'guided_success'].includes(e.action.type));
const actualTeaching = teachingEvents.map((e) => e.action.type);
const disagreement = actualTeaching.filter((a) => a !== ua2).length;
const gate4 = { ok: teachingEvents.length > 0, actualTeaching, ua2, naive, disagreementCount: disagreement, differing: disagreement > 0 };

const gates = { gate1, gate2, gate3, gate4 };
fs.writeFileSync(path.join(OUT, 'gates.json'), JSON.stringify(gates, null, 2));

console.log('Gate1 (session+events[]):', JSON.stringify(gate1));
console.log('Gate2 (adapter consumes):', JSON.stringify(gate2));
console.log('Gate3 (refined state):', JSON.stringify(gate3));
console.log('Gate4 (shadow disagreement):', JSON.stringify(gate4));
console.log('all gates:', gates.gate1.ok && gates.gate2.ok && gates.gate3.ok && gates.gate4.ok ? 'PASS' : 'PARTIAL');
console.log('capture jsonl:', path.join(OUT, 'capture.jsonl'));