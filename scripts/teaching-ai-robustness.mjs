// ============================================================
// teaching-ai-robustness.mjs — Teaching AI Phase 7
// Policy Identifiability & Robustness：C 的优势是否稳定？
// 多环境 counterfactual + 排名稳定性 P(C>A) + ablation。
// 不改变 policy；只扰动 learner response 参数。SHADOW / SIMULATED_ONLY。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-robustness');
fs.mkdirSync(OUT, { recursive: true });

const EPISODES = 10;
const clamp = (x, lo = 0, hi = 4) => Math.max(lo, Math.min(hi, x));
const clamp01 = (x) => Math.max(0, Math.min(1, x));

// action effects (per env perturbation)
function baseEffect(action, level) {
  switch (action) {
    case 'reveal': return { m: 0.10, hint: 0.20, ind: 0.10 };
    case 'demo': return { m: 0.45, hint: 0.05, ind: 0.15 };
    case 'guided': return { m: 0.55, hint: 0.15, ind: 0.28 };
    case 'question': return { m: level >= 1 ? 0.70 : 0.35, hint: -0.05, ind: 0.46 };
    case 'partial_hint': return { m: level >= 1 ? 0.45 : 0.55, hint: 0.10, ind: 0.36 };
    case 'free_attempt': return { m: level >= 2 ? 0.75 : 0.20, hint: -0.10, ind: 0.62 };
    default: return { m: 0.40, hint: 0.10, ind: 0.30 };
  }
}

function actionEffect(action, level, env) {
  const b = baseEffect(action, level);
  let { m, hint, ind } = b;
  if (env === 'easy') { m *= 1.10; hint *= 0.80; ind *= 1.05; }
  if (env === 'hard') { m *= 0.85; hint *= 1.10; ind *= 0.90; }
  if (env === 'high_hint_sensitivity') { hint *= 1.50; if (action === 'reveal') m *= 0.5; }
  return { m, hint, ind };
}

function retentionDecay(env, level) {
  const high = env === 'high_forgetting' ? 0.80 : 0.90;
  const low = env === 'high_forgetting' ? 0.55 : 0.70;
  return level >= 3 ? high : low;
}

// policies（不随 env 变）
function chooseAction(policy, levelIdx, errorPattern, step, rng) {
  if (policy === 'A_static_lesson') {
    return (levelIdx <= 1) ? 'demo' : 'free_attempt';
  }
  if (policy === 'B_hint_aligned') {
    return (levelIdx <= 1) ? 'partial_hint' : 'reveal';
  }
  if (policy === 'C_full') {
    if (levelIdx === 0) return 'partial_hint';
    if (levelIdx <= 2) return (errorPattern === 'guess' || errorPattern === 'weak') ? 'partial_hint' : 'question';
    return 'free_attempt';
  }
  if (policy === 'C_no_state') { // 不检测 state，固定序列
    return ['partial_hint', 'question', 'free_attempt'][step % 3];
  }
  if (policy === 'C_no_adaptation') { // 恒定单一动作
    return 'question';
  }
  if (policy === 'C_random') { // 确定性伪随机
    const acts = ['reveal', 'demo', 'guided', 'question', 'partial_hint', 'free_attempt'];
    return acts[Math.floor(rng() * acts.length) % acts.length];
  }
  return 'question';
}

// 确定性 rng（LCG）
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const ENVS = ['baseline', 'easy', 'hard', 'high_forgetting', 'high_hint_sensitivity'];
const STATES = [
  ['struggling', 0], ['novice', 1], ['exposed', 1], ['guided', 2], ['independent', 3], ['near_mastery', 3.5],
];
const ERRORS = ['omission', 'misread', 'guess', 'weak'];

function run(env, policy) {
  const values = [];
  const metrics = { mastery: [], recovery: [], hint: [], transfer: [], retention: [], indep: [] };
  for (const [stateName, startScore] of STATES) {
    for (let i = 0; i < 20; i++) { // 6*20 = 120 learners
      const err = ERRORS[i % 4];
      const rng = makeRng((stateName.length + 1) * 1000 + i);
      let score = startScore;
      const start = startScore;
      let hint = 0, ind = 0, recovery = null;
      for (let ep = 0; ep < EPISODES; ep++) {
        const lvl = Math.round(score);
        const action = chooseAction(policy, lvl, err, ep, rng);
        const e = actionEffect(action, lvl, env);
        score = clamp(score + e.m);
        hint = clamp01(hint + e.hint);
        ind += e.ind;
        if (recovery === null && start <= 1 && score >= 2) recovery = ep + 1;
      }
      const transfer = 0.6 * clamp01(score / 4) + 0.4 * clamp01(ind / EPISODES);
      const retention = transfer * retentionDecay(env, score);
      values.push(transfer + retention);
      metrics.mastery.push(score - start);
      metrics.hint.push(hint);
      metrics.transfer.push(transfer);
      metrics.retention.push(retention);
      metrics.indep.push(ind / EPISODES);
      if (recovery !== null) metrics.recovery.push(recovery);
    }
  }
  const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  return {
    env, policy,
    value_score: +(mean(values)).toFixed(3),
    mean_mastery: +(mean(metrics.mastery)).toFixed(3),
    mean_hint_dependency: +(mean(metrics.hint)).toFixed(3),
    mean_transfer: +(mean(metrics.transfer)).toFixed(3),
    mean_retention: +(mean(metrics.retention)).toFixed(3),
    mean_recovery: +(mean(metrics.recovery)).toFixed(3),
  };
}

const results = [];
for (const env of ENVS) {
  for (const policy of ['A_static_lesson', 'B_hint_aligned', 'C_full']) {
    results.push(run(env, policy));
  }
}

// P(C>A)：C_full value > A value 的环境占比
const envWins = ENVS.map((env) => {
  const A = results.find((r) => r.env === env && r.policy === 'A_static_lesson');
  const C = results.find((r) => r.env === env && r.policy === 'C_full');
  return { env, C_minus_A: +(C.value_score - A.value_score).toFixed(3), C_wins: C.value_score > A.value_score };
});
const pCgtA = envWins.filter((x) => x.C_wins).length / envWins.length;

// ablation（baseline env）
const ablation = ['C_full', 'C_no_state', 'C_no_adaptation', 'C_random'].map((p) => run('baseline', p));

fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
fs.writeFileSync(path.join(OUT, 'env-wins.json'), JSON.stringify(envWins, null, 2));
fs.writeFileSync(path.join(OUT, 'ablation.json'), JSON.stringify(ablation, null, 2));

console.log('=== P(C>A) across envs ===');
for (const w of envWins) console.log(`  ${w.env}: C-A value = ${w.C_minus_A} (${w.C_wins ? 'C>' : 'A>='}A)`);
console.log('P(C>A) =', pCgtA);

console.log('=== env × policy (value / transfer / retention / recovery) ===');
for (const r of results) console.log(`  ${r.env}|${r.policy}: value=${r.value_score} transfer=${r.mean_transfer} retention=${r.mean_retention} recovery=${r.mean_recovery} hint=${r.mean_hint_dependency}`);

console.log('=== ablation (baseline) ===');
for (const a of ablation) console.log(`  ${a.policy}: value=${a.value_score} transfer=${a.mean_transfer} recovery=${a.mean_recovery}`);