// ============================================================
// teaching-ai-outcome-eval.mjs — Teaching AI Phase 5
// 四维 outcome 复评 A/B/C（SHADOW）。复用正式 stepLearner 做单步，不修改它。
// recovery / hint dependency / transfer / retention 均为 SIMULATED_ONLY 影子计算。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { stepLearner, skillLevel, SKILL_LEVELS } from '../core/teaching-learner-simulator.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-outcome-evaluation');
fs.mkdirSync(OUT, { recursive: true });

const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'teaching-ai-policy-catalog.json'), 'utf8')).policies;
const TECHNIQUE = 'hiddenPair';
const EPISODES = 10;

function actionType(action) {
  if (['demo', 'show_optimal', 'show_trajectory', 'reference'].includes(action)) return 'demo';
  if (action === 'reveal') return 'reveal';
  if (['challenge', 'pose_challenge', 'probe_weakness', 'edge_case'].includes(action)) return 'challenge';
  return 'guided';
}
function matchRule(rule, level, errorPattern) {
  const w = rule.when || {};
  if (w.level) { const ok = Array.isArray(w.level) ? w.level.includes(level) : w.level === level; if (!ok) return false; }
  if (w.errorPattern && w.errorPattern !== errorPattern) return false;
  return true;
}
function selectAction(rules, level, errorPattern) {
  for (const r of rules) if (matchRule(r, level, errorPattern)) return r.action;
  return 'hint_step';
}

function buildPopulation() {
  const pop = [];
  for (let i = 0; i < 30; i++) {
    const level = i < 8 ? 'struggling' : i < 18 ? 'novice' : i < 26 ? 'guided' : 'independent';
    const errorPattern = ['omission', 'misread', 'guess', 'weak'][i % 4];
    pop.push({ id: 'L' + String(i + 1).padStart(3, '0'), level, errorPattern, frustration: 0.2 + (i % 5) * 0.15, engagement: 0.5 + (i % 4) * 0.1 });
  }
  return pop;
}
const POP = buildPopulation();

function clamp(x, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, x)); }

const outcomes = [];
for (const policy of Object.keys(catalog)) {
  for (const L of POP) {
    let state = { mastery: { [TECHNIQUE]: L.level }, frustration: L.frustration, engagement: L.engagement, consecutiveFailures: 0 };
    const beforeIdx = SKILL_LEVELS.indexOf(L.level);
    let hint = 0, reveal = 0, challengeSuccess = 0, successCount = 0, recovery = null;

    for (let ep = 1; ep <= EPISODES; ep++) {
      const lvl = skillLevel(state, TECHNIQUE);
      const action = selectAction(catalog[policy].rules, lvl, L.errorPattern);
      const t = actionType(action);
      const r = stepLearner({ learnerState: state, teachingAction: action, technique: TECHNIQUE });
      const success = r.successProbability >= 0.5;
      if (t === 'guided' || t === 'reveal') hint++;
      if (t === 'reveal') reveal++;
      if (t === 'challenge' && success) challengeSuccess++;
      if (success) successCount++;
      if (recovery === null && beforeIdx <= 1 && SKILL_LEVELS.indexOf(r.nextSkillState[TECHNIQUE]) >= 2) recovery = ep;
      state = r.nextLearnerState;
    }

    const finalLevel = skillLevel(state, TECHNIQUE);
    const finalIdx = SKILL_LEVELS.indexOf(finalLevel);
    const transfer = +((0.6 * clamp(finalIdx / 4)) + (0.4 * clamp(challengeSuccess / EPISODES))).toFixed(3);
    const retention = +(transfer * (finalIdx >= 3 ? 0.9 : 0.7)).toFixed(3);

    outcomes.push({
      learner: L.id,
      policy,
      initialLevel: L.level,
      errorPattern: L.errorPattern,
      mastery_gain: finalIdx - beforeIdx,
      recovery_episode: recovery,
      hint_dependency: +(hint / EPISODES).toFixed(3),
      reveal_ratio: +(reveal / EPISODES).toFixed(3),
      independent_completion_rate: +(challengeSuccess / Math.max(1, successCount)).toFixed(3),
      transfer_index: transfer,
      retention_index: retention,
      _source: 'SIMULATED_ONLY',
    });
  }
}

fs.writeFileSync(path.join(OUT, 'outcomes.json'), JSON.stringify(outcomes, null, 2));

function mean(arr) { return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3) : 0; }
const summary = { byPolicy: {} };
for (const p of Object.keys(catalog)) {
  const rows = outcomes.filter((o) => o.policy === p);
  const low = rows.filter((o) => o.initialLevel === 'struggling' || o.initialLevel === 'novice');
  summary.byPolicy[p] = {
    mean_mastery_gain: mean(rows.map((o) => o.mastery_gain)),
    mean_recovery_episode: mean((low.map((o) => o.recovery_episode)).filter((x) => x != null)),
    mean_hint_dependency: mean(rows.map((o) => o.hint_dependency)),
    mean_reveal_ratio: mean(rows.map((o) => o.reveal_ratio)),
    mean_independent_completion: mean(rows.map((o) => o.independent_completion_rate)),
    mean_transfer: mean(rows.map((o) => o.transfer_index)),
    mean_retention: mean(rows.map((o) => o.retention_index)),
  };
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('outcomes:', outcomes.length);
console.log(JSON.stringify(summary, null, 2));