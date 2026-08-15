// ============================================================
// teaching-ai-offline-sim.mjs — Battle AI → Teaching AI Phase 1
// 离线虚拟 learner 模拟：生成不同 personality 教学策略的模拟轨迹。
// 纯研究脚本，不改 core/，不接真实 LearnerModel。
// expected_effect 是模拟假设，不代表真实学习增益。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-simulations');
fs.mkdirSync(OUT, { recursive: true });

const EXPERIMENT_ID = 'teaching-ai-phase1-offline';

// personality → teaching policy（依据 teaching-intent-taxonomy.md）
const POLICY = {
  mentor: {
    omission: { intent: 'detect_mistake', action: 'surface_mistake', mD: 0.02, fD: 0.01 },
    misread: { intent: 'provide_correction_path', action: 'hint_step', mD: 0.03, fD: -0.05 },
    guess: { intent: 'reduce_pressure', action: 'ease_hint', mD: 0.01, fD: -0.08 },
    weak: { intent: 'reduce_pressure', action: 'ease_hint', mD: 0.02, fD: -0.07 },
  },
  prober: {
    omission: { intent: 'maintain_challenge', action: 'pose_challenge', mD: 0.03, fD: 0.03 },
    misread: { intent: 'expose_weakness', action: 'probe_weakness', mD: 0.04, fD: 0.04 },
    guess: { intent: 'test_boundary', action: 'edge_case', mD: 0.03, fD: 0.05 },
    weak: { intent: 'maintain_challenge', action: 'pose_challenge', mD: 0.02, fD: 0.04 },
  },
  expert: {
    omission: { intent: 'provide_reference_trajectory', action: 'show_trajectory', mD: 0.04, fD: 0.0 },
    misread: { intent: 'demonstrate_optimal_solution', action: 'show_optimal', mD: 0.05, fD: -0.02 },
    guess: { intent: 'demonstrate_optimal_solution', action: 'show_optimal', mD: 0.04, fD: -0.01 },
    weak: { intent: 'provide_reference_trajectory', action: 'show_trajectory', mD: 0.04, fD: 0.0 },
  },
};

const STUDENTS = [
  { error_pattern: 'omission', mastery: 0.4, frustration: 0.2 },
  { error_pattern: 'misread', mastery: 0.5, frustration: 0.4 },
  { error_pattern: 'guess', mastery: 0.3, frustration: 0.6 },
  { error_pattern: 'weak', mastery: 0.2, frustration: 0.1 },
];

const events = [];
for (const personality of ['mentor', 'prober', 'expert']) {
  for (const s of STUDENTS) {
    const state = { mastery: s.mastery, frustration: s.frustration };
    for (let t = 1; t <= 4; t++) {
      const pol = POLICY[personality][s.error_pattern];
      const event = {
        experiment_id: EXPERIMENT_ID,
        agent_personality: personality,
        teaching_intent: pol.intent,
        student_state: {
          mastery: +state.mastery.toFixed(3),
          error_pattern: s.error_pattern,
          frustration: +state.frustration.toFixed(3),
        },
        action: pol.action,
        expected_effect: {
          mastery_delta: pol.mD,
          frustration_delta: pol.fD,
          hypothesis: 'simulated hypothesis, not measured learning gain',
        },
      };
      events.push(event);
      // 确定性虚拟学习更新（仅模拟，不承诺真实学习）
      state.mastery = Math.min(1, state.mastery + pol.mD);
      state.frustration = Math.max(0, Math.min(1, state.frustration + pol.fD));
    }
  }
}

fs.writeFileSync(path.join(OUT, 'trajectories.jsonl'), events.map((e) => JSON.stringify(e)).join('\n') + '\n');
console.log('events:', events.length, '| written:', path.join(OUT, 'trajectories.jsonl'));
for (const p of ['mentor', 'prober', 'expert']) {
  const pv = events.filter((e) => e.agent_personality === p);
  console.log(`  ${p}: ${pv.map((e) => e.action).join(' → ')}`);
}