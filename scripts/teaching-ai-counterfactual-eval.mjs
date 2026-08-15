// ============================================================
// teaching-ai-counterfactual-eval.mjs — Teaching AI Phase 2
// Counterfactual Runner：同一 learner，分别跑 mentor / expert / prober 策略，
// 对比 after 状态与学习指标。
// 仅离线合成数据，不接真实 LearnerModel。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { stepLearner, skillLevel, SKILL_LEVELS } from '../core/teaching-learner-simulator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-counterfactual');
fs.mkdirSync(OUT, { recursive: true });

const TECHNIQUE = 'hiddenPair';

// 同上 Phase 1 taxonomy：personality → 教学策略（按当前掌握 level 取动作）
function policyAction(personality, level) {
  if (personality === 'mentor') {
    if (level === 'struggling') return 'hint_step';
    if (level === 'novice' || level === 'guided') return 'ease_hint';
    return 'surface_mistake';
  }
  if (personality === 'expert') {
    return (level === 'struggling' || level === 'novice') ? 'show_optimal' : 'show_trajectory';
  }
  if (personality === 'prober') {
    if (level === 'independent' || level === 'fluent') return 'edge_case';
    if (level === 'guided') return 'probe_weakness';
    return 'pose_challenge';
  }
  return 'ease_hint';
}

const LEARNERS = [
  { id: 'L001', mastery: { [TECHNIQUE]: 'struggling' }, frustration: 0.5, engagement: 0.5, consecutiveFailures: 2 },
  { id: 'L002', mastery: { [TECHNIQUE]: 'novice' }, frustration: 0.3, engagement: 0.6, consecutiveFailures: 0 },
  { id: 'L003', mastery: { [TECHNIQUE]: 'guided' }, frustration: 0.2, engagement: 0.7, consecutiveFailures: 0 },
  { id: 'L004', mastery: { [TECHNIQUE]: 'independent' }, frustration: 0.1, engagement: 0.8, consecutiveFailures: 0 },
];

const POLICIES = ['mentor', 'expert', 'prober'];
const STEPS = 4;

const trajectories = [];
const summary = [];

for (const L of LEARNERS) {
  for (const policy of POLICIES) {
    let state = { ...L, mastery: { ...L.mastery } };
    const before = { [TECHNIQUE]: state.mastery[TECHNIQUE] };
    let successes = 0, interventions = 0;
    for (let t = 1; t <= STEPS; t++) {
      const level = skillLevel(state, TECHNIQUE);
      const action = policyAction(policy, level);
      const r = stepLearner({ learnerState: state, teachingAction: action, technique: TECHNIQUE });
      interventions++;
      if (r.successProbability >= 0.5) successes++;
      trajectories.push({
        experiment_id: 'teaching-ai-phase2-counterfactual',
        learner: L.id,
        policy,
        technique: TECHNIQUE,
        step: t,
        teachingAction: action,
        before: { [TECHNIQUE]: level, frustration: state.frustration, engagement: state.engagement },
        after: { ...r.nextSkillState, frustration: r.nextLearnerState.frustration, engagement: r.nextLearnerState.engagement },
        successProbability: r.successProbability,
        engagementSignal: r.engagementSignal,
        frustrationRisk: r.frustrationRisk,
      });
      state = r.nextLearnerState;
    }
    const initialIdx = SKILL_LEVELS.indexOf(before[TECHNIQUE]);
    const finalIdx = SKILL_LEVELS.indexOf(state.mastery[TECHNIQUE]);
    summary.push({
      learner: L.id,
      policy,
      before: before,
      after: { [TECHNIQUE]: state.mastery[TECHNIQUE] },
      learningGain: finalIdx - initialIdx,
      teachingEfficiency: (finalIdx - initialIdx) / interventions,
      engagementDelta: +((state.engagement - L.engagement).toFixed(2)),
      frustrationDelta: +((state.frustration - L.frustration).toFixed(2)),
      recoveredToGuided: state.mastery[TECHNIQUE] !== 'struggling' && state.mastery[TECHNIQUE] !== 'novice',
    });
  }
}

fs.writeFileSync(path.join(OUT, 'trajectories.jsonl'), trajectories.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('trajectories:', trajectories.length, '| learners:', LEARNERS.length, '| policies:', POLICIES.length);
console.log('summary (learner, policy -> gain / efficiency / frustrationDelta / recoveredToGuided):');
for (const s of summary) {
  console.log(`  ${s.learner}|${s.policy}: gain=${s.learningGain} eff=${s.teachingEfficiency} frustΔ=${s.frustrationDelta} recovered=${s.recoveredToGuided}`);
}