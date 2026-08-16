// scripts/teaching-ai-calibration-replay.mjs
// Teaching AI Phase 3：把 simulator 假设与已有 learner 事件做方向性对齐回放。
// 输入：samples/learner-events-sample.jsonl
// 输出：data/teaching-ai-calibration/{alignment.jsonl, summary.json}
// 只读；不改 simulator、不改生产逻辑、不做量级拟合。

import fs from 'fs';
import { stepLearner, SKILL_LEVELS } from '../core/teaching-learner-simulator.js';

const input = process.argv[2] || 'samples/learner-events-sample.jsonl';
const outDir = process.argv[3] || 'data/teaching-ai-calibration';

const SIM_ACTION = {
  skill_encounter: 'show_trajectory',
  hint_requested: 'hint_step',
  guided_success: 'ease_hint',
  skill_used_correctly: 'pose_challenge',
  skill_mastery: 'show_optimal',
  fail: 'surface_mistake',
};

const OBS_STATE = {
  skill_encounter: 'exposed',
  hint_requested: 'guided',
  guided_success: 'guided',
  skill_used_correctly: 'independent',
  skill_mastery: 'mastered',
  fail: 'struggling',
};

const startLevel = 'novice';
const sims = new Map(); // `${session}::${technique}` -> learnerState

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const rows = [];
let alignedEvents = 0;
let nonNeutralEvents = 0;
let masteryUpCount = 0;

for (const line of lines) {
  let ev;
  try { ev = JSON.parse(line); } catch (e) { continue; }
  const action = ev.action;
  const simAction = SIM_ACTION[action];
  if (!simAction) continue; // 只对齐已映射动作

  const technique = ev.technique || 'hiddenPair';
  const key = `${ev.sessionId || ev.session}::${technique}`;
  if (!sims.has(key)) sims.set(key, { mastery: { [technique]: startLevel }, frustration: 0.3, engagement: 0.6, consecutiveFailures: 0 });
  const learnerState = sims.get(key);

  const beforeLevel = learnerState.mastery[technique] || startLevel;
  const res = stepLearner({ learnerState, teachingAction: simAction, technique });
  const afterLevel = res.nextSkillState[technique];

  learnerState.mastery[technique] = afterLevel;
  if (learnerState.consecutiveFailures !== undefined) {
    learnerState.consecutiveFailures = (action === 'fail') ? (learnerState.consecutiveFailures + 1) : 0;
  }

  const predictedSuccess = res.successProbability >= 0.5;
  const observedOutcome = ev.outcome || 'neutral';
  const successAligned = observedOutcome === 'neutral' ? 'n/a' : (predictedSuccess === (observedOutcome === 'success'));
  const masteryUp = SKILL_LEVELS.indexOf(afterLevel) > SKILL_LEVELS.indexOf(beforeLevel);

  if (observedOutcome !== 'neutral') nonNeutralEvents++;
  if (successAligned === true) alignedEvents++;
  if (masteryUp) masteryUpCount++;

  rows.push({
    session: ev.sessionId || ev.session,
    eventId: ev.eventId || null,
    source: ev.source || null,
    action,
    technique,
    simAction,
    beforeLevel,
    afterLevel,
    predictedSuccess,
    observedOutcome,
    observedState: OBS_STATE[action] || 'unknown',
    masteryUp,
    successAligned,
  });
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/alignment.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const summary = {
  totalEvents: rows.length,
  directionalSuccessAlignment: nonNeutralEvents ? Number((alignedEvents / nonNeutralEvents).toFixed(2)) : 0,
  alignedEvents,
  nonNeutralEvents,
  masteryUpCount,
};
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');

console.log('校准回放完成；输出:', outDir);
console.log(JSON.stringify(summary, null, 2));