// ============================================================
// teaching-ai-state-granularity.mjs — Teaching AI Phase 14
// Learner State Granularity Refinement（shadow-only）。
// 把 struggling 拆成 exploration_failure / temporary_error / persistent_struggle，
// 重跑 naive / UA-v1(coarse) / UA-v2(fine)，看错误介入率/错误撤退率。
// 不改生产 LearnerModel/simulator；不接生产。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-state-granularity');
fs.mkdirSync(OUT, { recursive: true });

const HEAVY = new Set(['partial_hint', 'guided', 'demo', 'reveal']);

function actionEffect(action, level) {
  switch (action) {
    case 'reveal': return { m: 0.10, hint: 0.20, frust: 0 };
    case 'demo': return { m: 0.45, hint: 0.05, frust: 0 };
    case 'guided': return { m: 0.55, hint: 0.15, frust: 0 };
    case 'question': return { m: level >= 1 ? 0.70 : 0.35, hint: -0.05, frust: level >= 1 ? 0 : 0.05 };
    case 'partial_hint': return { m: level >= 1 ? 0.45 : 0.55, hint: 0.10, frust: 0 };
    case 'free_attempt': return { m: level >= 2 ? 0.75 : 0.20, hint: -0.10, frust: level >= 2 ? 0 : 0.15 };
    default: return { m: 0.40, hint: 0.10, frust: 0 };
  }
}

// ground truth fine states → 事件序列
function eventsFor(fine, i) {
  const base = 1700000000000 + i * 1000000;
  const MIN = 60000, T = 'hiddenPair';
  let seq = [];
  const ev = (type, opts = {}) => ({ technique: T, type, ts: base + seq.length * MIN, ...opts });
  switch (fine) {
    case 'novice_exploration': seq = [ev('encounter'), ev('error')]; break; // 新技能 + 一次失败
    case 'temporary_error': seq = [ev('encounter'), ev('correct', { independent: true }), ev('error'), ev('correct', { independent: true })]; break; // 已会 + 偶发失误 + 可恢复
    case 'persistent_struggle': seq = [ev('encounter'), ev('hint'), ev('error'), ev('hint'), ev('error'), ev('error')]; break; // 反复失败 + hint 后仍失败
    case 'guided': seq = [ev('encounter'), ev('hint'), ev('correct', { independent: false, hintLevel: 2 }), ev('correct', { independent: false, hintLevel: 3 })]; break;
    case 'independent': seq = [ev('encounter'), ev('correct', { independent: true }), ev('correct', { independent: true }), ev('correct', { independent: true })]; break;
  }
  return seq;
}

// shadow 细粒度分类（不改 LearnerModel 定义，仅加一层）
function classifyFine(events) {
  let errors = 0, indep = 0, guidedCorrect = 0, hintThenFail = 0, prevWasHint = false, consecErr = 0, maxConsecErr = 0;
  for (const e of events) {
    if (e.type === 'hint') { prevWasHint = true; continue; }
    if (e.type === 'error') {
      errors++; consecErr++; maxConsecErr = Math.max(maxConsecErr, consecErr);
      if (prevWasHint) hintThenFail++;
    } else { consecErr = 0; }
    if (e.type === 'correct') {
      consecErr = 0;
      if (e.independent === true) indep++;
      else guidedCorrect++;
    }
    prevWasHint = e.type === 'hint';
  }
  if (indep >= 2) return 'independent';
  if (guidedCorrect >= 1 && errors <= 1) return 'guided';
  if ((hintThenFail >= 1 && errors >= 2) || errors >= 3 || maxConsecErr >= 3) return 'persistent_struggle';
  if (indep + guidedCorrect >= 1 && errors >= 1) return 'temporary_error';
  if (errors === 1 && indep === 0 && guidedCorrect === 0) return 'novice_exploration';
  if (errors === 0) return 'guided';
  return 'temporary_error';
}

function coarseState(events) {
  // 用真实 LearnerModel.skillState 的 coarse 结果（此处用轻量等价映射，避免额外模型噪音）
  const fine = classifyFine(events);
  if (fine === 'independent') return 'independent';
  if (fine === 'guided') return 'guided';
  // coarse: 所有非 guided/independent 的低掌握都归为 struggling（与 Phase 13 一致）
  if (fine === 'persistent_struggle' || fine === 'temporary_error' || fine === 'novice_exploration') return 'struggling';
  return 'novice';
}

function boundaryAction(coarse) {
  if (coarse === 'struggling') return 'partial_hint';
  if (coarse === 'novice') return 'question';
  if (coarse === 'guided') return 'question';
  return 'free_attempt';
}
function fineAction(fine) {
  if (fine === 'persistent_struggle') return 'partial_hint';
  if (fine === 'temporary_error') return 'question';
  if (fine === 'novice_exploration') return 'free_attempt';
  if (fine === 'guided') return 'question';
  return 'free_attempt';
}

const FINES = ['novice_exploration', 'temporary_error', 'persistent_struggle', 'guided', 'independent'];
const N = 60;
const rows = [];
for (const fine of FINES) {
  for (let i = 0; i < N; i++) {
    const evs = eventsFor(fine, i);
    const coarse = coarseState(evs);
    const fineEst = classifyFine(evs);
    const lvl = ['novice_exploration', 'temporary_error', 'persistent_struggle'].includes(fineEst) ? 0 : (fineEst === 'guided' ? 2 : 3);
    const naiveA = boundaryAction(coarse);
    const ua1A = (() => { const a = boundaryAction(coarse); return (coarse === 'struggling' || coarse === 'novice') ? 'question' : a; })(); // UA-v1 低置信 approximation（与 Phase 13：低置信→question）
    const ua2A = fineAction(fineEst);
    const ev = (a) => actionEffect(a, lvl);
    const ne = ev(naiveA), u1 = ev(ua1A), u2 = ev(ua2A);
    rows.push({
      fineTruth: fine, coarse, fineEst,
      naiveA, ua1A, ua2A,
      naive: { hint: ne.hint, frust: ne.frust, mastery: ne.m },
      ua1: { hint: u1.hint, frust: u1.frust, mastery: u1.m },
      ua2: { hint: u2.hint, frust: u2.frust, mastery: u2.m },
      naiveOver: fine === 'novice_exploration' && HEAVY.has(naiveA),
      ua1Over: fine === 'novice_exploration' && HEAVY.has(ua1A),
      ua2Over: fine === 'novice_exploration' && HEAVY.has(ua2A),
      naiveUnder: fine === 'persistent_struggle' && !HEAVY.has(naiveA),
      ua1Under: fine === 'persistent_struggle' && !HEAVY.has(ua1A),
      ua2Under: fine === 'persistent_struggle' && !HEAVY.has(ua2A),
    });
  }
}

const mean = (a) => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(3);
const rate = (a) => +(a.filter(Boolean).length / a.length).toFixed(3);
const nov = rows.filter((r) => r.fineTruth === 'novice_exploration');
const pers = rows.filter((r) => r.fineTruth === 'persistent_struggle');

const summary = {
  overInterventionRate: { naive: rate(rows.map((r) => r.naiveOver)), ua1: rate(rows.map((r) => r.ua1Over)), ua2: rate(rows.map((r) => r.ua2Over)) },
  underInterventionRate: { naive: rate(rows.map((r) => r.naiveUnder)), ua1: rate(rows.map((r) => r.ua1Under)), ua2: rate(rows.map((r) => r.ua2Under)) },
  hintDependency: { naive: mean(rows.map((r) => r.naive.hint)), ua1: mean(rows.map((r) => r.ua1.hint)), ua2: mean(rows.map((r) => r.ua2.hint)) },
  frustration: { naive: mean(rows.map((r) => r.naive.frust)), ua1: mean(rows.map((r) => r.ua1.frust)), ua2: mean(rows.map((r) => r.ua2.frust)) },
  mastery: { naive: mean(rows.map((r) => r.naive.mastery)), ua1: mean(rows.map((r) => r.ua1.mastery)), ua2: mean(rows.map((r) => r.ua2.mastery)) },
  persistent_struggle: {
    naive: { intervention: rate(rows.filter((r) => r.fineTruth === 'persistent_struggle').map((r) => HEAVY.has(r.naiveA))), frust: mean(pers.map((r) => r.naive.frust)), mastery: mean(pers.map((r) => r.naive.mastery)) },
    ua1: { intervention: rate(rows.filter((r) => r.fineTruth === 'persistent_struggle').map((r) => HEAVY.has(r.ua1A))), frust: mean(pers.map((r) => r.ua1.frust)), mastery: mean(pers.map((r) => r.ua1.mastery)) },
    ua2: { intervention: rate(rows.filter((r) => r.fineTruth === 'persistent_struggle').map((r) => HEAVY.has(r.ua2A))), frust: mean(pers.map((r) => r.ua2.frust)), mastery: mean(pers.map((r) => r.ua2.mastery)) },
  },
};

fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));