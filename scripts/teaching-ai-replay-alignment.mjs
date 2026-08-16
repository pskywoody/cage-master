// ============================================================
// teaching-ai-replay-alignment.mjs — Teaching AI Phase 3
// 离线重放对齐：把 samples/learner-events-sample.jsonl 的真实（样本）事件，
// 经 evidence map 映射为 simulator 教学动作，比较预测方向 vs 观察状态。
// 只读；不写生产；不拟合参数。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { stepLearner, skillLevel, SKILL_LEVELS } from '../core/teaching-learner-simulator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-calibration');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = path.join(ROOT, 'samples', 'learner-events-sample.jsonl');

const ACTION_MAP = {
  skill_encounter: 'show_trajectory',
  technique_encounter: 'show_trajectory',
  technique_taught: 'show_trajectory',
  guided_success: 'ease_hint',
  hint_requested: 'hint_step',
  hint_level: 'hint_step',
  skill_used_correctly: 'pose_challenge',
  skill_mastery: 'show_optimal',
  fail: 'surface_mistake',
  reveal: 'reveal',
  mistake: 'surface_mistake',
  solve_complete: 'show_optimal',
};

const OBSERVED_STATE = {
  skill_encounter: 'exposed',
  technique_taught: 'exposed',
  guided_success: 'guided',
  hint_requested: 'guided',
  hint_level: 'guided',
  skill_used_correctly: 'independent',
  skill_mastery: 'mastered',
  fail: 'struggling',
  mistake: 'struggling',
  reveal: 'guided',
};

const events = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const bySession = {};
for (const e of events) (bySession[e.sessionId] = bySession[e.sessionId] || []).push(e);

const rows = [];
for (const [sid, evts] of Object.entries(bySession)) {
  const tech = evts[0].technique || 'hiddenPair';
  let state = { mastery: { [tech]: 'novice' }, frustration: 0.3, engagement: 0.6, consecutiveFailures: 0 };
  for (const e of evts) {
    const t = e.technique || tech;
    const simAction = ACTION_MAP[e.action] || 'ease_hint';
    const before = skillLevel(state, t);
    const r = stepLearner({ learnerState: state, teachingAction: simAction, technique: t });
    const after = r.nextSkillState[t];
    const predictedSuccess = r.successProbability >= 0.5;
    const observedSuccess = e.outcome === 'success';
    const masteryUp = SKILL_LEVELS.indexOf(after) > SKILL_LEVELS.indexOf(before);
    rows.push({
      session: sid,
      eventId: e.eventId,
      source: e.source,
      action: e.action,
      technique: t,
      simAction,
      beforeLevel: before,
      afterLevel: after,
      predictedSuccess,
      observedOutcome: e.outcome,
      observedState: OBSERVED_STATE[e.action] || null,
      masteryUp,
      successAligned: (e.outcome === 'neutral') ? 'n/a' : (predictedSuccess === observedSuccess),
    });
    state = r.nextLearnerState;
    state.consecutiveFailures = (e.outcome === 'error') ? (state.consecutiveFailures || 0) + 1 : 0;
  }
}

fs.writeFileSync(path.join(OUT, 'alignment.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const scored = rows.filter((r) => r.successAligned !== 'n/a');
const alignedCount = scored.filter((r) => r.successAligned === true).length;
const summary = {
  totalEvents: rows.length,
  directionalSuccessAlignment: scored.length ? +(alignedCount / scored.length).toFixed(3) : null,
  alignedEvents: alignedCount,
  nonNeutralEvents: scored.length,
  masteryUpCount: rows.filter((r) => r.masteryUp).length,
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('rows:', rows.length, '| summary:', JSON.stringify(summary));
for (const r of rows) {
  console.log(`  ${r.session}|${r.action} -> ${r.simAction} | ${r.beforeLevel}->${r.afterLevel} | predSuccess=${r.predictedSuccess} obs=${r.observedOutcome} aligned=${r.successAligned}`);
}