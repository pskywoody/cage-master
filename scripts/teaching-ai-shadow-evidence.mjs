// ============================================================
// teaching-ai-shadow-evidence.mjs — Teaching AI Phase 10
// Shadow Evidence Accumulation Loop（承接 Phase 8 adapter + Phase 9 observation）
//
// 只观察、只记录、不执行教学动作；不改 LessonPlan/HintSystem/TeachingSystem。
//
// 产出（data/teaching-ai-shadow-evidence/）：
//   shadow-events.v2.jsonl         schema v2 证据记录（含 observed_outcome）
//   outcome-tracking.json          每来源 outcome 汇总
//   recovery-measurement.json      按 disagreement 类型的描述性 recovery 统计
//   counterfactual-trajectories.json 每 session 实际 vs shadow 动作序列
//   policy-candidate-ranking.json  候选策略的关联性优先级（非因果）
//   summary.json                   schema 自校验 + 计数
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shadowRecommend, projectLearnerState } from '../core/teaching-ai-shadow-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-shadow-evidence');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = path.join(ROOT, 'samples', 'learner-events-sample.jsonl');
const WINDOW = 3;

// action -> category（与 observation 一致）
const LESSON_ACTION = {
  guided_success: 'guided', reveal: 'reveal', hint_requested: 'hint', hint_level: 'hint',
  skill_encounter: 'demo', technique_taught: 'demo', skill_used_correctly: 'free', skill_mastery: 'free',
  fail: null, mistake: null,
};
const ADAPTER_CAT = { reveal: 'reveal', free_attempt: 'free', question: 'question', partial_hint: 'partial_hint', guided: 'guided', demo: 'demo' };
const RECOVERY_ACTIONS = new Set(['skill_used_correctly', 'skill_mastery']);
const FAIL_ACTIONS = new Set(['fail', 'mistake']);
const HINT_ACTIONS = new Set(['hint_requested', 'hint_level', 'reveal']);

// disagreement taxonomy
const LOWDEP = ['question', 'free'];
const CURDEP = ['hint', 'guided', 'reveal', 'demo'];
const MOREEXPL = ['demo', 'partial_hint', 'guided'];
function classify(currentCat, shadowCat, conf) {
  if (currentCat == null) return { type: 'N', high: false };
  if (currentCat === shadowCat) return { type: 'A', high: false };
  if (LOWDEP.includes(shadowCat) && CURDEP.includes(currentCat)) return { type: 'B', high: conf > 0.8 };
  if (MOREEXPL.includes(shadowCat) && ['question', 'free'].includes(currentCat)) return { type: 'C', high: conf > 0.8 };
  return { type: 'D', high: conf > 0.8 };
}

// outcome window：后续 WINDOW 个事件（课前序，不含当前事件）
function outcome(events, i) {
  const next = events.slice(i + 1, i + 1 + WINDOW);
  let recovered = false, latency = null, fails = 0, hints = 0;
  for (let k = 0; k < next.length; k++) {
    const a = next[k].action;
    if (RECOVERY_ACTIONS.has(a)) { if (!recovered) { recovered = true; latency = k + 1; } }
    if (FAIL_ACTIONS.has(a)) fails++;
    if (HINT_ACTIONS.has(a)) hints++;
  }
  return { recovered, failure_count: fails, hint_count: hints, recovery_latency_events: latency };
}

function processSession(sid, source, events) {
  const seen = [];
  const records = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const snapshot = projectLearnerState(seen);
    const tech = e.technique || 'hiddenPair';
    const shadow = shadowRecommend({ learnerState: snapshot, technique: tech });
    const currentCat = LESSON_ACTION[e.action] ?? null;
    const shadowCat = ADAPTER_CAT[shadow.recommendedAction];
    const dis = classify(currentCat, shadowCat, shadow.confidence);
    const oc = outcome(events, i);
    records.push({
      schema_version: '2',
      session_id: sid,
      event_id: e.eventId,
      timestamp: e.timestamp,
      source,
      technique: tech,
      learner_snapshot: snapshot,
      current_teaching_action: e.action,
      system_action_category: currentCat,
      shadow_recommendation: shadow.recommendedAction,
      shadow_action_category: shadowCat,
      confidence: shadow.confidence,
      reason: shadow.reason,
      disagreement: dis,
      observed_outcome: oc,
    });
    seen.push(e);
  }
  return records;
}

// ---- schema v2 自校验（无第三方依赖） ----
const REQUIRED = [
  'schema_version', 'session_id', 'event_id', 'timestamp', 'source', 'technique',
  'learner_snapshot', 'current_teaching_action', 'system_action_category',
  'shadow_recommendation', 'shadow_action_category', 'confidence', 'reason',
  'disagreement', 'observed_outcome',
];
function validateRecord(r) {
  const errs = [];
  for (const k of REQUIRED) if (!(k in r)) errs.push(`missing:${k}`);
  if (r.schema_version !== '2') errs.push(`schema_version!=2`);
  if (!['REAL', 'SYNTHETIC'].includes(r.source)) errs.push(`bad source:${r.source}`);
  if (!['A', 'B', 'C', 'D', 'N'].includes(r.disagreement?.type)) errs.push(`bad disagreement.type:${r.disagreement?.type}`);
  if (typeof r.observed_outcome?.recovered !== 'boolean') errs.push('observed_outcome.recovered not bool');
  return errs;
}

// ---- 分析函数 ----
function outcomeTracking(records) {
  const out = {};
  for (const src of ['REAL', 'SYNTHETIC']) {
    const rs = records.filter((r) => r.source === src);
    const rec = rs.filter((r) => r.observed_outcome.recovered).length;
    out[src] = { total: rs.length, recovered: rec, recovered_rate: rs.length ? +(rec / rs.length).toFixed(3) : null };
  }
  return out;
}

function recoveryMeasurement(records) {
  const groups = { A: { n: 0, recovered: 0 }, B: { n: 0, recovered: 0 }, C: { n: 0, recovered: 0 }, D: { n: 0, recovered: 0 }, N: { n: 0, recovered: 0 } };
  for (const r of records) {
    const g = groups[r.disagreement.type];
    g.n++;
    if (r.observed_outcome.recovered) g.recovered++;
  }
  const out = {};
  for (const [t, g] of Object.entries(groups)) {
    out[t] = { n: g.n, recovered: g.recovered, recovered_rate: g.n ? +(g.recovered / g.n).toFixed(3) : null };
  }
  out.note = 'descriptive only; NOT causal';
  return out;
}

function counterfactualTrajectories(records) {
  const bySession = {};
  for (const r of records) (bySession[r.session_id] = bySession[r.session_id] || []).push(r);
  const trajs = [];
  for (const [sid, rs] of Object.entries(bySession)) {
    trajs.push({
      session_id: sid,
      source: rs[0].source,
      technique: rs[0].technique,
      n_events: rs.length,
      actual_sequence: rs.map((r) => r.current_teaching_action),
      system_categories: rs.map((r) => r.system_action_category),
      shadow_sequence: rs.map((r) => r.shadow_recommendation),
      agree: rs.map((r) => r.disagreement.type === 'A'),
    });
  }
  return trajs;
}

function buildCategoryRecovery(records) {
  const map = {};
  for (const r of records) {
    const c = r.system_action_category;
    if (c == null) continue;
    map[c] = map[c] || { n: 0, recovered: 0 };
    map[c].n++;
    if (r.observed_outcome.recovered) map[c].recovered++;
  }
  for (const c of Object.keys(map)) map[c].rate = map[c].n ? +(map[c].recovered / map[c].n).toFixed(3) : null;
  return map;
}

function policyCandidateRanking(records) {
  const comparable = records.filter((r) => r.disagreement.type !== 'N');
  const catRec = buildCategoryRecovery(records);
  const candidates = {
    shadow_default: (ls, t) => shadowRecommend({ learnerState: ls, technique: t }).recommendedAction,
    always_scaffold: () => 'partial_hint',
    always_question: () => 'question',
    always_free: () => 'free_attempt',
  };
  const scored = [];
  for (const [name, fn] of Object.entries(candidates)) {
    let sum = 0, n = 0;
    for (const r of comparable) {
      const action = fn(r.learner_snapshot, r.technique);
      const cat = ADAPTER_CAT[action] || action;
      const rate = catRec[cat]?.rate;
      if (rate != null) { sum += rate; n++; }
    }
    scored.push({ candidate: name, steps_scored: n, descriptive_recovery_assoc: n ? +(sum / n).toFixed(3) : null });
  }
  scored.sort((a, b) => (b.descriptive_recovery_assoc ?? 0) - (a.descriptive_recovery_assoc ?? 0));
  return {
    ranking: scored,
    category_recovery: catRec,
    note: 'associational prioritization for hypothesis generation only; NOT causal; do not claim superiority',
  };
}

// ---- 数据装载 ----
const realEvents = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const realBySession = {};
for (const e of realEvents) (realBySession[e.sessionId] = realBySession[e.sessionId] || []).push(e);

const records = [];
for (const [sid, evts] of Object.entries(realBySession)) records.push(...processSession(sid, 'REAL', evts));

// 合成 session（确定性，标注 SYNTHETIC，仅演示 pipeline 可持续与分析可运行）
const PATTERNS = [
  ['skill_encounter', 'hint_requested', 'guided_success', 'skill_used_correctly', 'skill_mastery'],
  ['skill_encounter', 'hint_requested', 'fail', 'fail', 'guided_success', 'skill_used_correctly'],
  ['skill_encounter', 'reveal', 'hint_requested', 'guided_success', 'skill_used_correctly'],
];
const TECH_POOL = ['hiddenPair', 'nakedSingle', 'rule45'];
for (let s = 0; s < 20; s++) {
  const pat = PATTERNS[s % 3];
  const tech = TECH_POOL[s % 3];
  const evts = pat.map((action, i) => ({
    eventId: `syn-s${s}-e${i}`,
    timestamp: 1700000000000 + s * 100000 + i * 1000,
    source: 'SYNTHETIC',
    sessionId: `syn-${s}`,
    technique: tech,
    action,
    outcome: action.includes('fail') ? 'error' : (action.includes('_success') || action.includes('used_correctly') || action.includes('mastery') ? 'success' : 'neutral'),
    metadata: {},
  }));
  records.push(...processSession(`syn-${s}`, 'SYNTHETIC', evts));
}

// ---- schema 自校验 ----
const invalid = [];
for (const r of records) {
  const errs = validateRecord(r);
  if (errs.length) invalid.push({ event_id: r.event_id, errs });
}

// ---- 写产物 ----
const write = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
fs.writeFileSync(path.join(OUT, 'shadow-events.v2.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');

const outcomeT = outcomeTracking(records);
const recoveryM = recoveryMeasurement(records);
const counterfact = counterfactualTrajectories(records);
const ranking = policyCandidateRanking(records);

write('outcome-tracking.json', outcomeT);
write('recovery-measurement.json', recoveryM);
write('counterfactual-trajectories.json', counterfact);
write('policy-candidate-ranking.json', ranking);

const summary = {
  schema_validation: { total: records.length, invalid: invalid.length, valid: records.length - invalid.length },
  real_events: realEvents.length,
  real_sessions: Object.keys(realBySession).length,
  synthetic_sessions: 20,
  total_records: records.length,
  affectsUserBehavior: false,
};
write('summary.json', summary);

console.log(JSON.stringify({
  schema_validation: summary.schema_validation,
  outcome_tracking: outcomeT,
  recovery_measurement: recoveryM,
  policy_candidate_ranking: ranking,
  affectsUserBehavior: false,
}, null, 2));