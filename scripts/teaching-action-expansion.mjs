// ============================================================
// teaching-action-expansion.mjs — Teaching Action Space Expansion
// 动作空间扩充 runner（shadow-only、只观测、不执行）。
// 接入现有 Shadow Evidence Accumulation：每步投影 learner snapshot，
// 用原有 adapter + 扩展动作空间生成候选，输出 coverage / evidence /
// uncertainty 的 ranking v2（非胜负）。
//
// 产出（data/teaching-action-space/）：
//   action-records.v1.jsonl         动作空间记录
//   action-coverage.json            每动作 coverage/evidence/uncertainty
//   shadow-policy-ranking-v2.json   覆盖型 ranking（非胜负）
//   summary.json                    schema 自校验
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shadowRecommend, projectLearnerState } from '../core/teaching-ai-shadow-adapter.js';
import { TEACHING_ACTIONS, generateQuestion, partialHint, difficultySignal, expandCandidates } from '../core/teaching-action-space.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-action-space');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = path.join(ROOT, 'samples', 'learner-events-sample.jsonl');
const LESSON_ACTION = {
  guided_success: 'guided', reveal: 'reveal', hint_requested: 'hint', hint_level: 'hint',
  skill_encounter: 'demo', technique_taught: 'demo', skill_used_correctly: 'free', skill_mastery: 'free',
  fail: null, mistake: null,
};

function processSession(sid, source, events) {
  const seen = [];
  const recs = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const snap = projectLearnerState(seen);
    const tech = e.technique || 'hiddenPair';
    const sysCat = LESSON_ACTION[e.action] ?? null;
    const original = shadowRecommend({ learnerState: snap, technique: tech });
    const q = generateQuestion({ learnerState: snap, technique: tech, errorContext: { target: tech } });
    const hintLvl = snap.consecutiveFailures >= 3 ? 1 : 0;
    const ph = partialHint(hintLvl, { technique: tech, errorContext: { target: tech } });
    const diff = difficultySignal({ learnerState: snap, technique: tech });
    recs.push({
      schema_version: '1',
      session_id: sid,
      event_id: e.eventId,
      source,
      technique: tech,
      learner_snapshot: snap,
      system_action_category: sysCat,
      shadow_original: original.recommendedAction,
      shadow_candidates: expandCandidates({ learnerState: snap, technique: tech }),
      question_candidate: q,
      partial_hint_candidate: ph,
      difficulty_signal: diff,
      shadow_only: true,
    });
    seen.push(e);
  }
  return recs;
}

// ---- 自校验 ----
const RECORD_REQUIRED = ['schema_version', 'session_id', 'event_id', 'source', 'technique', 'learner_snapshot', 'system_action_category', 'shadow_original', 'shadow_candidates', 'question_candidate', 'partial_hint_candidate', 'difficulty_signal', 'shadow_only'];
const ACTION_REQUIRED = ['action', 'target', 'intensity', 'reason', 'expected_outcome'];
function validateRecord(r) {
  const errs = [];
  for (const k of RECORD_REQUIRED) if (!(k in r)) errs.push(`missing:${k}`);
  if (r.schema_version !== '1') errs.push('schema_version!=1');
  for (const key of ['question_candidate', 'partial_hint_candidate']) {
    for (const a of ACTION_REQUIRED) if (!(key in r) || !(a in r[key])) errs.push(`${key}.missing:${a}`);
  }
  return errs;
}

// ---- coverage / ranking v2 ----
function actionCoverage(records) {
  const observed = {};
  for (const r of records) {
    const c = r.system_action_category;
    if (c != null) observed[c] = (observed[c] || 0) + 1;
  }
  const perAction = [];
  for (const a of TEACHING_ACTIONS) {
    const n = observed[a] || 0;
    perAction.push({
      action: a,
      shadow_can_generate: true,
      observed_system_evidence: n,
      status: n > 0 ? 'observable' : 'no_system_evidence',
      uncertainty: n === 0 ? null : (n < 5 ? 'high' : (n < 20 ? 'medium' : 'low')),
    });
  }
  perAction.sort((a, b) => (b.observed_system_evidence - a.observed_system_evidence) || a.action.localeCompare(b.action));
  const observable = perAction.filter((a) => a.status === 'observable').length;
  return {
    per_action: perAction,
    coverage_completeness: TEACHING_ACTIONS.length ? +(observable / TEACHING_ACTIONS.length).toFixed(3) : null,
    note: 'coverage-based ranking, NOT win/lose; unobserved actions need real sessions',
  };
}

// ---- 数据装载 ----
const realEvents = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const realBySession = {};
for (const e of realEvents) (realBySession[e.sessionId] = realBySession[e.sessionId] || []).push(e);

const records = [];
for (const [sid, evts] of Object.entries(realBySession)) records.push(...processSession(sid, 'REAL', evts));

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

// ---- 校验 + 分析 + 写产物 ----
const invalid = [];
for (const r of records) {
  const errs = validateRecord(r);
  if (errs.length) invalid.push({ event_id: r.event_id, errs });
}
const coverage = actionCoverage(records);

const write = (name, obj) => fs.writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
fs.writeFileSync(path.join(OUT, 'action-records.v1.jsonl'), records.map((r) => JSON.stringify(r)).join('\n') + '\n');
write('action-coverage.json', coverage);
write('shadow-policy-ranking-v2.json', coverage);

const summary = {
  schema_validation: { total: records.length, invalid: invalid.length, valid: records.length - invalid.length },
  action_space: TEACHING_ACTIONS,
  coverage_completeness: coverage.coverage_completeness,
  affectsUserBehavior: false,
};
write('summary.json', summary);

console.log(JSON.stringify({ schema_validation: summary.schema_validation, action_space: TEACHING_ACTIONS, coverage: coverage, affectsUserBehavior: false }, null, 2));