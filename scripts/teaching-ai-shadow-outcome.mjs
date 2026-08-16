// ============================================================
// teaching-ai-shadow-outcome.mjs — Teaching AI Phase 10
// Shadow Outcome Attribution：对历史/合成轨迹做 counterfactual 归因。
// 三指标：counterfactual recovery / hint economy / trajectory divergence。
// 只分析、不执行；一切 counterfactual 均为描述性、模型条件结论。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { shadowRecommend } from '../core/teaching-ai-shadow-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-shadow-outcome');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = path.join(ROOT, 'samples', 'learner-events-sample.jsonl');
const LEVELS = ['struggling', 'novice', 'guided', 'independent', 'fluent'];
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));

// 实际事件 → 期望效应（用 learner-event-taxonomy 语义）
function actualEffect(action) {
  switch (action) {
    case 'skill_encounter': case 'technique_taught': return { m: 0.10, hint: 0.00, ind: 0.05, frust: 0 };
    case 'hint_requested': case 'hint_level': return { m: 0.00, hint: 0.10, ind: 0.00, frust: 0 };
    case 'reveal': return { m: 0.10, hint: 0.20, ind: 0.02, frust: 0 };
    case 'guided_success': return { m: 0.50, hint: 0.05, ind: 0.10, frust: -0.03 };
    case 'skill_used_correctly': return { m: 0.70, hint: -0.10, ind: 0.50, frust: -0.05 };
    case 'skill_mastery': return { m: 0.80, hint: -0.10, ind: 0.60, frust: -0.05 };
    case 'fail': case 'mistake': return { m: 0.00, hint: 0.05, ind: 0.00, frust: 0.15 };
    default: return { m: 0, hint: 0, ind: 0, frust: 0 };
  }
}

// shadow 动作 → 期望效应（Phase 6/7 causal 模型）
function shadowEffect(action, level) {
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
const levelName = (s) => LEVELS[Math.max(0, Math.min(4, Math.round(s)))];

// 每 session：actual track vs shadow-counterfactual track
function processSession(sid, events) {
  const act = { score: 0, hint: 0, ind: 0, frust: 0.3 };
  const shd = { score: 0, hint: 0, ind: 0, frust: 0.3 };
  let actIndep = null, shdIndep = null, productive = 0, dependency = 0, hintSeq = 0;

  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    // actual track
    const ae = actualEffect(e.action);
    act.score = clamp(act.score + ae.m, 0, 4);
    act.hint = clamp(act.hint + ae.hint);
    act.ind += ae.ind;
    act.frust = clamp(act.frust + ae.frust);
    if (actIndep === null && act.score >= 3) actIndep = i + 1;

    // shadow track（counterfactual：用 shadow 推荐动作替代当前教学动作）
    const shadow = shadowRecommend({ learnerState: { mastery: { hiddenPair: levelName(shd.score) }, hintDependency: shd.hint, frustration: shd.frust, errorPattern: 'omission' }, technique: 'hiddenPair' });
    const se = shadowEffect(shadow.recommendedAction, Math.round(shd.score));
    shd.score = clamp(shd.score + se.m, 0, 4);
    shd.hint = clamp(shd.hint + se.hint);
    shd.ind += se.ind;
    shd.frust = clamp(shd.frust + se.frust);
    if (shdIndep === null && shd.score >= 3) shdIndep = i + 1;

    // hint economy（实际轨迹）
    if (['hint_requested', 'hint_level', 'reveal', 'guided_success'].includes(e.action)) {
      hintSeq++;
      const next = events.slice(i + 1, i + 3);
      if (next.some((x) => x.action === 'skill_used_correctly')) productive++;
    } else {
      if (hintSeq >= 2) dependency++;
      hintSeq = 0;
    }
  }
  if (hintSeq >= 2) dependency++;

  return {
    session_id: sid,
    actual: { mastery: +act.score.toFixed(3), hintDependency: +act.hint.toFixed(3), frustration: +act.frust.toFixed(3), indepStep: actIndep },
    shadow: { mastery: +shd.score.toFixed(3), hintDependency: +shd.hint.toFixed(3), frustration: +shd.frust.toFixed(3), indepStep: shdIndep },
    hintEconomy: { productive, dependency },
  };
}

const realEvents = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const realBySession = {};
for (const e of realEvents) (realBySession[e.sessionId] = realBySession[e.sessionId] || []).push(e);

const PATTERNS = [
  ['skill_encounter', 'hint_requested', 'guided_success', 'skill_used_correctly', 'skill_mastery'],
  ['skill_encounter', 'hint_requested', 'fail', 'fail', 'guided_success', 'skill_used_correctly'],
  ['skill_encounter', 'reveal', 'hint_requested', 'guided_success', 'skill_used_correctly'],
];
const TECH_POOL = ['hiddenPair', 'nakedSingle', 'rule45'];
const synSessions = {};
for (let s = 0; s < 20; s++) {
  const pat = PATTERNS[s % 3];
  const tech = TECH_POOL[s % 3];
  synSessions[`syn-${s}`] = pat.map((action, i) => ({ sessionId: `syn-${s}`, timestamp: 1700000000000 + s * 100000 + i * 1000, technique: tech, action }));
}

const sessions = [];
for (const [sid, evts] of Object.entries(realBySession)) sessions.push({ kind: 'real', ...processSession(sid, evts) });
for (const [sid, evts] of Object.entries(synSessions)) sessions.push({ kind: 'synthetic', ...processSession(sid, evts) });

// 归因判定（每 session）
for (const s of sessions) {
  const betterHint = s.shadow.hintDependency < s.actual.hintDependency;
  const fasterRecovery = (s.shadow.indepStep ?? 99) <= (s.actual.indepStep ?? 99);
  const masteryOk = s.shadow.mastery >= s.actual.mastery - 0.1;
  const frustWorse = s.shadow.frustration > s.actual.frustration + 0.05;
  s.verdict = (betterHint && fasterRecovery && masteryOk && !frustWorse) ? 'CaseA_shadow_better'
    : (betterHint && frustWorse) ? 'CaseB_tradeoff'
    : 'CaseC_style_only';
}

fs.writeFileSync(path.join(OUT, 'sessions.json'), JSON.stringify(sessions, null, 2));

const agg = { byVerdict: {}, byKind: {}, hintEconomy: { productive: 0, dependency: 0 } };
for (const s of sessions) {
  agg.byVerdict[s.verdict] = (agg.byVerdict[s.verdict] || 0) + 1;
  agg.byKind[s.kind] = (agg.byKind[s.kind] || 0) + 1;
  agg.hintEconomy.productive += s.hintEconomy.productive;
  agg.hintEconomy.dependency += s.hintEconomy.dependency;
}
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(agg, null, 2));

console.log('sessions:', sessions.length, '| byVerdict:', JSON.stringify(agg.byVerdict), '| byKind:', JSON.stringify(agg.byKind));
console.log('hintEconomy:', JSON.stringify(agg.hintEconomy));
for (const s of sessions) {
  console.log(`  ${s.kind}|${s.session_id}: actual(m=${s.actual.mastery},h=${s.actual.hintDependency},i=${s.actual.indepStep}) shadow(m=${s.shadow.mastery},h=${s.shadow.hintDependency},i=${s.shadow.indepStep}) => ${s.verdict}`);
}