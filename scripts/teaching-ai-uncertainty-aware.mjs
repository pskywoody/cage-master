// ============================================================
// teaching-ai-uncertainty-aware.mjs — Teaching AI Phase 13
// 比较 naive policy（state→直接介入）与 uncertainty-aware policy（低置信→先观察/轻问）。
// 用真实 LearnerModel 估计 state+confidence，再用 Phase 6 causal 模型取一步效应。
// shadow only；不改 LearnerModel/simulator；不接生产。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { LearnerModel, SKILL_STATES } from '../core/learner-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-uncertainty-aware');
fs.mkdirSync(OUT, { recursive: true });

const NOW = 1700000000000, MIN = 60000, T = 'hiddenPair';
const HEAVY = new Set(['partial_hint', 'guided', 'demo', 'reveal']);

// Phase 6 causal action effect（一步）
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
const LEVEL_IDX = { struggling: 0, novice: 1, guided: 2, independent: 3 };

function boundaryAction(state) {
  if (state === 'struggling') return 'partial_hint';
  if (state === 'novice') return 'question';
  if (state === 'guided') return 'question';
  return 'free_attempt';
}
function uaAction(state, confidence) {
  const action = boundaryAction(state);
  if (confidence < 0.4 && (state === 'struggling' || state === 'novice')) return 'question'; // 低置信：先观察
  return action;
}

// ground truth → 事件序列
function eventsFor(trueState, i) {
  const base = NOW + i * 1000000;
  let seq = [];
  const ev = (type, opts = {}) => ({ technique: T, type, ts: base + seq.length * MIN, ...opts });
  switch (trueState) {
    case 'struggling': seq = [ev('encounter'), ev('hint'), ev('error'), ev('hint'), ev('error'), ev('error')]; break;
    case 'novice_with_error': seq = [ev('encounter'), ev('error')]; break;
    case 'novice_clean': seq = [ev('encounter')]; break;
    case 'guided': seq = [ev('encounter'), ev('hint'), ev('correct', { independent: false, hintLevel: 2 }), ev('correct', { independent: false, hintLevel: 3 })]; break;
    case 'independent': seq = [ev('encounter'), ev('correct', { independent: true }), ev('correct', { independent: true }), ev('correct', { independent: true })]; break;
  }
  return seq;
}

function estimateState(events) {
  const lm = new LearnerModel();
  for (const e of events) lm.observe(e);
  const s = lm.skillState(T);
  let state;
  if (s.trend === 'struggling') state = 'struggling';
  else if (s.state === SKILL_STATES.UNKNOWN || s.state === SKILL_STATES.EXPOSED) state = 'novice';
  else if (s.state === SKILL_STATES.GUIDED) state = 'guided';
  else state = 'independent';
  return { state, confidence: s.confidence };
}

const TRUE_STATES = ['struggling', 'novice_with_error', 'novice_clean', 'guided', 'independent'];
const N = 60;
const rows = [];
for (const trueState of TRUE_STATES) {
  for (let i = 0; i < N; i++) {
    const { state, confidence } = estimateState(eventsFor(trueState, i));
    const lvl = LEVEL_IDX[state];
    const naive = boundaryAction(state);
    const ua = uaAction(state, confidence);
    const nev = actionEffect(naive, lvl);
    const uev = actionEffect(ua, lvl);
    const isNovice = trueState === 'novice_with_error' || trueState === 'novice_clean';
    rows.push({
      trueState, estimatedState: state, confidence: +confidence.toFixed(3),
      naiveAction: naive, uaAction: ua,
      naive: { hint: nev.hint, frust: nev.frust, mastery: nev.m },
      ua: { hint: uev.hint, frust: uev.frust, mastery: uev.m },
      naiveUnnecessary: isNovice && HEAVY.has(naive),
      uaUnnecessary: isNovice && HEAVY.has(ua),
    });
  }
}

function mean(arr) { return +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3); }
function rate(arr) { return +(arr.filter(Boolean).length / arr.length).toFixed(3); }

const novices = rows.filter((r) => r.trueState.startsWith('novice'));
const strugglers = rows.filter((r) => r.trueState === 'struggling');
const all = rows;

const summary = {
  all: {
    naiveHintDependency: mean(all.map((r) => r.naive.hint)),
    uaHintDependency: mean(all.map((r) => r.ua.hint)),
    naiveFrustration: mean(all.map((r) => r.naive.frust)),
    uaFrustration: mean(all.map((r) => r.ua.frust)),
    naiveMastery: mean(all.map((r) => r.naive.mastery)),
    uaMastery: mean(all.map((r) => r.ua.mastery)),
    naiveUnnecessaryRate: rate(all.map((r) => r.naiveUnnecessary)),
    uaUnnecessaryRate: rate(all.map((r) => r.uaUnnecessary)),
  },
  novice: {
    naiveUnnecessaryRate: rate(novices.map((r) => r.naiveUnnecessary)),
    uaUnnecessaryRate: rate(novices.map((r) => r.uaUnnecessary)),
    naiveHintDependency: mean(novices.map((r) => r.naive.hint)),
    uaHintDependency: mean(novices.map((r) => r.ua.hint)),
  },
  struggling: {
    naiveHintDependency: mean(strugglers.map((r) => r.naive.hint)),
    uaHintDependency: mean(strugglers.map((r) => r.ua.hint)),
    naiveFrustration: mean(strugglers.map((r) => r.naive.frust)),
    uaFrustration: mean(strugglers.map((r) => r.ua.frust)),
    naiveMastery: mean(strugglers.map((r) => r.naive.mastery)),
    uaMastery: mean(strugglers.map((r) => r.ua.mastery)),
  },
};

fs.writeFileSync(path.join(OUT, 'rows.json'), JSON.stringify(rows, null, 2));
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log(JSON.stringify(summary, null, 2));
const est = {};
for (const r of rows) est[r.trueState] = est[r.trueState] || {}; for (const r of rows) est[r.trueState][r.estimatedState] = (est[r.trueState][r.estimatedState] || 0) + 1;
console.log('true→estimated:', JSON.stringify(est));