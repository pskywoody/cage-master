// ============================================================
// teaching-ai-intervention-boundary.mjs — Teaching AI Phase 11
// Intervention Boundary Study：找到「AI 什么时候该教、什么时候该退后」。
// shadow only / counterfactual only；不接生产；不改 simulator。
// 输出 Intervention Boundary Map（按 learner state 的介入概率 + 证据）。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-intervention-boundary');
fs.mkdirSync(OUT, { recursive: true });

const LEVELS = ['struggling', 'novice', 'guided', 'independent', 'fluent'];
const clamp = (x, lo = 0, hi = 4) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// 介入动作 = 教/提示；退后动作 = 让学生尝试
const INTERVENE = new Set(['reveal', 'demo', 'guided', 'partial_hint']);

function actionEffect(action, level) {
  switch (action) {
    case 'reveal': return { m: 0.10, hint: 0.20, ind: 0.10, frust: 0 };
    case 'demo': return { m: 0.45, hint: 0.05, ind: 0.15, frust: 0 };
    case 'guided': return { m: 0.55, hint: 0.15, ind: 0.28, frust: 0 };
    case 'question': return { m: level >= 1 ? 0.70 : 0.35, hint: -0.05, ind: 0.46, frust: level >= 1 ? 0 : 0.05 };
    case 'partial_hint': return { m: level >= 1 ? 0.45 : 0.55, hint: 0.10, ind: 0.36, frust: 0 };
    case 'free_attempt': return { m: level >= 2 ? 0.75 : 0.20, hint: -0.10, ind: 0.62, frust: level >= 2 ? 0 : 0.15 };
    default: return { m: 0.40, hint: 0.10, ind: 0.30, frust: 0 };
  }
}

function policyAction(policy, levelIdx, errorPattern) {
  if (policy === 'A_always_teach') return 'guided';
  if (policy === 'B_minimal_hint') return 'free_attempt';
  // C adaptive boundary
  if (levelIdx <= 0) return 'partial_hint';
  if (levelIdx <= 1) return (errorPattern === 'guess' || errorPattern === 'weak') ? 'partial_hint' : 'question';
  if (levelIdx <= 2) return 'question';
  return 'free_attempt';
}

const STATES = ['struggling', 'novice', 'guided', 'independent'];
const ERRORS = ['omission', 'misread', 'guess', 'weak'];
const EPISODES = 10;
const N = 100;

const rows = [];
for (const state of STATES) {
  for (const policy of ['A_always_teach', 'B_minimal_hint', 'C_adaptive_boundary']) {
    const agg = { mastery: 0, hint: 0, frust: 0, ind: 0, interveneSteps: 0 };
    let recoverySum = 0, recoveryN = 0;
    for (let i = 0; i < N; i++) {
      const err = ERRORS[i % 4];
      let score = LEVELS.indexOf(state);
      const start = score;
      let hint = 0, ind = 0, frust = 0.2, recovery = null, interveneSteps = 0;
      for (let ep = 0; ep < EPISODES; ep++) {
        const lvl = Math.round(score);
        const action = policyAction(policy, lvl, err);
        if (INTERVENE.has(action)) interveneSteps++;
        const e = actionEffect(action, lvl);
        score = clamp(score + e.m);
        hint = clamp01(hint + e.hint);
        ind += e.ind;
        frust = clamp01(frust + e.frust);
        if (recovery === null && start <= 1 && score >= 3) recovery = ep + 1;
      }
      agg.mastery += score;
      agg.hint += hint;
      agg.frust += frust;
      agg.ind += ind;
      agg.interveneSteps += interveneSteps;
      if (recovery !== null) { recoverySum += recovery; recoveryN++; }
    }
    const mean = (x) => x / N;
    const mastery = mean(agg.mastery);
    const hint = mean(agg.hint);
    const frust = mean(agg.frust);
    const ind = mean(agg.ind) / EPISODES;
    const transfer = 0.6 * clamp01(mastery / 4) + 0.4 * clamp01(ind);
    const value = +(transfer + (1 - frust) + (1 - hint)).toFixed(3);
    const interveneProb = +(agg.interveneSteps / (N * EPISODES)).toFixed(3);
    rows.push({
      state, policy,
      mean_mastery: +mastery.toFixed(3),
      mean_hint_dependency: +(hint).toFixed(3),
      mean_frustration: +(frust).toFixed(3),
      mean_transfer: +(transfer).toFixed(3),
      mean_recovery: recoveryN ? +(recoverySum / recoveryN).toFixed(2) : null,
      intervene_probability: interveneProb,
      value,
    });
  }
}

fs.writeFileSync(path.join(OUT, 'policy-outcomes.json'), JSON.stringify(rows, null, 2));

// 每个 state：best policy + 边界证据
const map = [];
for (const state of STATES) {
  const sRows = rows.filter((r) => r.state === state);
  const best = sRows.reduce((a, b) => (b.value > a.value ? b : a));
  const cv = sRows.find((r) => r.policy === 'C_adaptive_boundary');
  const av = sRows.find((r) => r.policy === 'A_always_teach');
  const bv = sRows.find((r) => r.policy === 'B_minimal_hint');
  let interveneProb, reason;
  if (best.policy === 'A_always_teach') { interveneProb = 1.0; reason = 'intervene 最优：加速恢复并降低挫败（依赖成本可接受）'; }
  else if (best.policy === 'B_minimal_hint') { interveneProb = 0.0; reason = '退后最优：介入只增加依赖、不增 transfer/frustration 收益'; }
  else { interveneProb = cv.intervene_probability; reason = '自适应边界最优：按 state 分档介入'; }
  map.push({
    state,
    intervene_probability: interveneProb,
    best_policy: best.policy,
    value: best.value,
    evidence: {
      always_teach: { value: av.value, hint: av.mean_hint_dependency, frust: av.mean_frustration, recovery: av.mean_recovery },
      minimal_hint: { value: bv.value, hint: bv.mean_hint_dependency, frust: bv.mean_frustration, recovery: bv.mean_recovery },
      adaptive: { value: cv.value, hint: cv.mean_hint_dependency, frust: cv.mean_frustration, recovery: cv.mean_recovery },
    },
    reason,
  });
}

fs.writeFileSync(path.join(OUT, 'intervention-boundary-map.json'), JSON.stringify(map, null, 2));

console.log('=== policy outcomes (state × policy) ===');
for (const r of rows) console.log(`  ${r.state}|${r.policy}: value=${r.value} m=${r.mean_mastery} hint=${r.mean_hint_dependency} frust=${r.mean_frustration} transfer=${r.mean_transfer} recovery=${r.mean_recovery} interveneProb=${r.intervene_probability}`);
console.log('=== Intervention Boundary Map ===');
for (const m of map) console.log(`  ${m.state}: intervene=${m.intervene_probability} best=${m.best_policy} (${m.reason})`);