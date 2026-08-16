// ============================================================
// teaching-ai-causal-resolution.mjs — Teaching AI Phase 6
// SHADOW 因果模型：验证 action space 是否具备因果分辨率。
// 关键实验：同一 learner/同一状态，只换 Teaching Action → outcome 是否不同；
// 再跑 A/B/C，看 adaptive 是否与 static 分开。
// 不改生产、不改正式 simulator，全部 SIMULATED_ONLY。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-causal-resolution');
fs.mkdirSync(OUT, { recursive: true });

const TECHNIQUE = 'hiddenPair';
const EPISODES = 10;
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// 动作 → 期望效应（level: 0 struggling,1 novice,2 guided,3 independent,4 fluent）
function actionEffect(action, level) {
  switch (action) {
    case 'reveal': return { m: 0.10, hint: +0.20, ind: 0.10 };
    case 'demo': return { m: 0.45, hint: +0.05, ind: 0.15 };
    case 'guided': return { m: 0.55, hint: +0.15, ind: 0.28 };
    case 'question': return { m: level >= 1 ? 0.70 : 0.35, hint: -0.05, ind: 0.46 };
    case 'partial_hint': return { m: level >= 1 ? 0.45 : 0.55, hint: +0.10, ind: 0.36 };
    case 'free_attempt': return { m: level >= 2 ? 0.75 : 0.20, hint: -0.10, ind: 0.62 };
    default: return { m: 0.40, hint: 0.10, ind: 0.30 };
  }
}

// 重新定义的 policy（集中在 action space 表达）
function policyAction(policy, level, errorPattern) {
  const weak = level === 'struggling' || level === 'novice';
  if (policy === 'A_static_lesson') return weak ? 'demo' : 'free_attempt';
  if (policy === 'B_hint_aligned') {
    if (level === 'struggling' || level === 'novice') return 'partial_hint';
    return 'reveal';
  }
  // C learner adaptive
  if (level === 'struggling') return 'partial_hint';
  if (level === 'novice' || level === 'guided') return (errorPattern === 'guess' || errorPattern === 'weak') ? 'partial_hint' : 'question';
  return 'free_attempt';
}

const levelOf = (score) => LEVELS()[Math.max(0, Math.min(4, Math.round(score)))];
function LEVELS() { return ['struggling', 'novice', 'guided', 'independent', 'fluent']; }

// ---- 关键实验 1：同一 learner（guided 状态），只换 action ----
const resolution = [];
const probeMastery = 2.0; // guided
for (const action of ['reveal', 'demo', 'guided', 'question', 'partial_hint', 'free_attempt']) {
  const e = actionEffect(action, Math.round(probeMastery));
  resolution.push({
    learner: 'LX_fixed(guided)',
    action,
    mastery_delta: e.m,
    hint_dependency_delta: e.hint,
    independent_share: e.ind,
    transfer_contribution: +(0.6 * clamp((probeMastery + e.m) / 4) + 0.4 * e.ind).toFixed(3),
  });
}

// ---- 关键实验 2：A/B/C 重跑 ----
function buildPopulation() {
  const pop = [];
  for (let i = 0; i < 30; i++) {
    const level = i < 8 ? 'struggling' : i < 18 ? 'novice' : i < 26 ? 'guided' : 'independent';
    const errorPattern = ['omission', 'misread', 'guess', 'weak'][i % 4];
    pop.push({ id: 'L' + String(i + 1).padStart(3, '0'), level, errorPattern });
  }
  return pop;
}
const LEVEL_IDX = { struggling: 0, novice: 1, guided: 2, independent: 3, fluent: 4 };
const POP = buildPopulation();

const outcomes = [];
for (const policy of ['A_static_lesson', 'B_hint_aligned', 'C_learner_adaptive']) {
  for (const L of POP) {
    let score = LEVEL_IDX[L.level];
    const start = score;
    let hint = 0, indAcc = 0, recovery = null;
    for (let ep = 1; ep <= EPISODES; ep++) {
      const lvl = levelOf(score);
      const action = policyAction(policy, lvl, L.errorPattern);
      const e = actionEffect(action, Math.round(score));
      score = clamp(score + e.m, 0, 4);
      hint = clamp(hint + e.hint, 0, 1);
      indAcc += e.ind;
      if (recovery === null && start <= 1 && score >= 2) recovery = ep;
    }
    const transfer = +(0.6 * clamp(score / 4) + 0.4 * clamp(indAcc / EPISODES)).toFixed(3);
    const retention = +(transfer * (score >= 3 ? 0.9 : 0.7)).toFixed(3);
    outcomes.push({
      learner: L.id, policy, initialLevel: L.level, errorPattern: L.errorPattern,
      mastery_gain: +(score - start).toFixed(3),
      recovery_episode: recovery,
      hint_dependency: +hint.toFixed(3),
      independent_completion_rate: +(indAcc / EPISODES).toFixed(3),
      transfer_index: transfer,
      retention_index: retention,
      _source: 'SIMULATED_ONLY',
    });
  }
}

function mean(arr) { return arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3) : 0; }
const summary = { byPolicy: {} };
for (const p of ['A_static_lesson', 'B_hint_aligned', 'C_learner_adaptive']) {
  const rows = outcomes.filter((o) => o.policy === p);
  const low = rows.filter((o) => o.initialLevel === 'struggling' || o.initialLevel === 'novice');
  summary.byPolicy[p] = {
    mean_mastery_gain: mean(rows.map((o) => o.mastery_gain)),
    mean_recovery_episode: mean(low.map((o) => o.recovery_episode).filter((x) => x != null)),
    mean_hint_dependency: mean(rows.map((o) => o.hint_dependency)),
    mean_independent_completion: mean(rows.map((o) => o.independent_completion_rate)),
    mean_transfer: mean(rows.map((o) => o.transfer_index)),
    mean_retention: mean(rows.map((o) => o.retention_index)),
  };
}

fs.writeFileSync(path.join(OUT, 'resolution-matrix.json'), JSON.stringify(resolution, null, 2));
fs.writeFileSync(path.join(OUT, 'outcomes.json'), JSON.stringify(outcomes, null, 2));
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('=== 关键实验 1：同 learner(guided) 只换 action ===');
for (const r of resolution) console.log(`  ${r.action}: mDelta=${r.mastery_delta} hintΔ=${r.hint_dependency_delta} ind=${r.independent_share} transfer=${r.transfer_contribution}`);
console.log('=== 关键实验 2：A/B/C ===');
console.log(JSON.stringify(summary, null, 2));