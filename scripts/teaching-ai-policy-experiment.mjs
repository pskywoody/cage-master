// ============================================================
// teaching-ai-policy-experiment.mjs — Teaching AI Phase 4
// Small Offline Policy Experiment：离线比较 3 个 teaching policy。
// 只读研究；不改生产；不改 simulator 参数；不接真实 LearnerModel。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { stepLearner, skillLevel, SKILL_LEVELS } from '../core/teaching-learner-simulator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-policy-experiment');
fs.mkdirSync(OUT, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'teaching-ai-policy-catalog.json'), 'utf8')).policies;
const TECHNIQUE = 'hiddenPair';
const EPISODES = 10;
const HINT_ACTIONS = new Set(['hint_step', 'ease_hint', 'guided_question', 'surface_mistake', 'reveal']);

function matchRule(rule, level, errorPattern) {
  const w = rule.when || {};
  if (w.level) {
    const ok = Array.isArray(w.level) ? w.level.includes(level) : w.level === level;
    if (!ok) return false;
  }
  if (w.errorPattern && w.errorPattern !== errorPattern) return false;
  return true;
}

function selectAction(rules, level, errorPattern) {
  for (const r of rules) if (matchRule(r, level, errorPattern)) return r.action;
  return 'hint_step';
}

// 30 个确定性 learner profiles
const population = [];
for (let i = 0; i < 30; i++) {
  const level = i < 8 ? 'struggling' : i < 18 ? 'novice' : i < 26 ? 'guided' : 'independent';
  const errorPattern = ['omission', 'misread', 'guess', 'weak'][i % 4];
  population.push({
    id: 'L' + String(i + 1).padStart(3, '0'),
    mastery: { [TECHNIQUE]: level },
    errorPattern,
    frustration: +(0.2 + (i % 5) * 0.15).toFixed(2),
    engagement: +(0.5 + (i % 4) * 0.1).toFixed(2),
  });
}
fs.writeFileSync(path.join(OUT, 'learner-population.json'), JSON.stringify(population, null, 2));

const trajectories = [];
const outcomes = [];

for (const L of population) {
  for (const policy of Object.keys(catalog)) {
    let state = { mastery: { ...L.mastery }, frustration: L.frustration, engagement: L.engagement, consecutiveFailures: 0 };
    const beforeIdx = SKILL_LEVELS.indexOf(skillLevel(state, TECHNIQUE));
    const engStart = state.engagement;
    let hintCount = 0, solvedCount = 0, recoveryEpisode = null;

    for (let ep = 1; ep <= EPISODES; ep++) {
      const level = skillLevel(state, TECHNIQUE);
      const action = selectAction(catalog[policy].rules, level, L.errorPattern);
      const r = stepLearner({ learnerState: state, teachingAction: action, technique: TECHNIQUE });
      const success = r.successProbability >= 0.5;
      if (HINT_ACTIONS.has(action)) hintCount++;
      if (success) solvedCount++;
      if (recoveryEpisode === null && beforeIdx <= 1 && SKILL_LEVELS.indexOf(r.nextSkillState[TECHNIQUE]) >= 2) {
        recoveryEpisode = ep;
      }
      trajectories.push({
        experiment_id: 'teaching-ai-phase4-policy-experiment',
        learner: L.id,
        policy,
        episode: ep,
        errorPattern: L.errorPattern,
        action,
        beforeLevel: level,
        afterLevel: r.nextSkillState[TECHNIQUE],
        successProbability: r.successProbability,
        success,
        engagementSignal: r.engagementSignal,
        frustrationRisk: r.frustrationRisk,
      });
      state = r.nextLearnerState;
      state.consecutiveFailures = success ? 0 : (state.consecutiveFailures || 0) + 1;
    }

    const afterIdx = SKILL_LEVELS.indexOf(skillLevel(state, TECHNIQUE));
    outcomes.push({
      learner: L.id,
      policy,
      initialLevel: L.mastery[TECHNIQUE],
      errorPattern: L.errorPattern,
      mastery_before: beforeIdx,
      mastery_after: afterIdx,
      skill_gain: afterIdx - beforeIdx,
      hint_count: hintCount,
      solved_count: solvedCount,
      hint_dependency: +(hintCount / Math.max(1, solvedCount)).toFixed(3),
      recovery_episode: recoveryEpisode,
      engagement_proxy_delta: +(state.engagement - engStart).toFixed(3),
      engagement_signal_source: 'SIMULATED_ONLY',
    });
  }
}

fs.writeFileSync(path.join(OUT, 'trajectories.jsonl'), trajectories.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'outcomes.json'), JSON.stringify(outcomes, null, 2));
fs.writeFileSync(path.join(OUT, 'assignments.jsonl'), outcomes.map((o) => JSON.stringify({ learner: o.learner, policy: o.policy, initialLevel: o.initialLevel, errorPattern: o.errorPattern })).join('\n') + '\n');

// 聚合：按 (policy, initial bucket) 平均
function bucketize(level) { return (level === 'struggling' || level === 'novice') ? 'low' : 'high'; }
function mean(arr) { return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3) : 0; }
const summary = { byPolicy: {}, byPolicyBucket: {} };
for (const p of Object.keys(catalog)) {
  const rows = outcomes.filter((o) => o.policy === p);
  summary.byPolicy[p] = {
    mean_skill_gain: mean(rows.map((o) => o.skill_gain)),
    mean_hint_dependency: mean(rows.map((o) => o.hint_dependency)),
    mean_engagement_delta: mean(rows.map((o) => o.engagement_proxy_delta)),
  };
  for (const b of ['low', 'high']) {
    const rr = rows.filter((o) => bucketize(o.initialLevel) === b);
    if (rr.length) {
      summary.byPolicyBucket[`${p}|${b}`] = {
        n: rr.length,
        mean_skill_gain: mean(rr.map((o) => o.skill_gain)),
        mean_hint_dependency: mean(rr.map((o) => o.hint_dependency)),
      };
    }
  }
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('trajectories:', trajectories.length, 'outcomes:', outcomes.length);
console.log('summary by policy:', JSON.stringify(summary.byPolicy, null, 2));
console.log('summary by policy|bucket:', JSON.stringify(summary.byPolicyBucket, null, 2));