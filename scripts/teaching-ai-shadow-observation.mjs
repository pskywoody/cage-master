// ============================================================
// teaching-ai-shadow-observation.mjs — Teaching AI Phase 9
// Shadow Observation Loop：真实/合成 session 事件流 → learner projection
// → shadowRecommend → Shadow Event Record（含 disagreement taxonomy + recovery 探测器）。
// 只读、只预测、不执行；不改 LessonPlan/HintSystem/TeachingSystem。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { shadowRecommend, projectLearnerState } from '../core/teaching-ai-shadow-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-shadow-observation');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = path.join(ROOT, 'samples', 'learner-events-sample.jsonl');

const LESSON_ACTION = {
  guided_success: 'guided', reveal: 'reveal', hint_requested: 'hint', hint_level: 'hint',
  skill_encounter: 'demo', technique_taught: 'demo', skill_used_correctly: 'free', skill_mastery: 'free',
  fail: null, mistake: null,
};
const ADAPTER_CAT = { reveal: 'reveal', free_attempt: 'free', question: 'question', partial_hint: 'partial_hint', guided: 'guided', demo: 'demo' };
const LOWDEP = ['question', 'free'];
const CURDEP = ['hint', 'guided', 'reveal', 'demo'];
const MOREEXPL = ['demo', 'partial_hint', 'guided'];

function classify(currentCat, shadowCat, conf) {
  if (!currentCat) return { type: 'N', high: false }; // 学生响应，无可比教学动作
  if (currentCat === shadowCat) return { type: 'A', high: false };
  if (LOWDEP.includes(shadowCat) && CURDEP.includes(currentCat)) return { type: 'B', high: conf > 0.8 };
  if (MOREEXPL.includes(shadowCat) && ['question', 'free'].includes(currentCat)) return { type: 'C', high: conf > 0.8 };
  return { type: 'D', high: conf > 0.8 };
}

function processSession(sid, events) {
  const seen = [];
  const records = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    const snapshot = projectLearnerState(seen);
    const tech = e.technique || 'hiddenPair';
    const shadow = shadowRecommend({ learnerState: snapshot, technique: tech });
    const currentCat = LESSON_ACTION[e.action] ?? null;
    const shadowCat = ADAPTER_CAT[shadow.recommendedAction];
    const c = classify(currentCat, shadowCat, shadow.confidence);
    // recovery 探测器：看后续 3 事件的描述性指标（不作因果解释）
    const next = events.slice(i + 1, i + 4);
    const follow = {
      fails: next.filter((x) => x.action === 'fail' || x.action === 'mistake').length,
      hints: next.filter((x) => ['hint_requested', 'hint_level', 'reveal'].includes(x.action)).length,
      independent: next.some((x) => x.action === 'skill_used_correctly'),
    };
    records.push({
      session_id: sid,
      timestamp: e.timestamp,
      learner_snapshot: snapshot,
      current_teaching_action: e.action,
      current_cat: currentCat,
      shadow_recommendation: shadow.recommendedAction,
      confidence: shadow.confidence,
      reason: shadow.reason,
      disagreement_type: c.type,
      high_confidence_disagree: c.high,
      recovery_followup: follow,
    });
    seen.push(e);
  }
  return records;
}

// 真实样本
const realEvents = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const realBySession = {};
for (const e of realEvents) (realBySession[e.sessionId] = realBySession[e.sessionId] || []).push(e);
const realRecords = [];
for (const [sid, evts] of Object.entries(realBySession)) realRecords.push(...processSession(sid, evts));

// 合成 session（确定性，标注 SYNTHETIC，仅用于演示 pipeline 可持续记录与分析可运行）
const PATTERNS = [
  ['skill_encounter', 'hint_requested', 'guided_success', 'skill_used_correctly', 'skill_mastery'],
  ['skill_encounter', 'hint_requested', 'fail', 'fail', 'guided_success', 'skill_used_correctly'],
  ['skill_encounter', 'reveal', 'hint_requested', 'guided_success', 'skill_used_correctly'],
];
const TECH_POOL = ['hiddenPair', 'nakedSingle', 'rule45'];
const synRecords = [];
for (let s = 0; s < 20; s++) {
  const pat = PATTERNS[s % 3];
  const tech = TECH_POOL[s % 3];
  const evts = pat.map((action, i) => ({ eventId: `syn-s${s}-e${i}`, timestamp: 1700000000000 + s * 100000 + i * 1000, source: 'SYNTHETIC', sessionId: `syn-${s}`, technique: tech, action, outcome: action.includes('fail') ? 'error' : (action.includes('_success') || action.includes('used_correctly') || action.includes('mastery') ? 'success' : 'neutral'), metadata: {} }));
  synRecords.push(...processSession(`syn-${s}`, evts));
}

function analyze(records, label) {
  const comparable = records.filter((r) => r.disagreement_type !== 'N');
  const disagree = comparable.filter((r) => ['B', 'C', 'D'].includes(r.disagreement_type));
  const byState = {};
  const byError = {};
  for (const r of comparable) {
    const lv = Object.values(r.learner_snapshot.mastery)[0] || 'unknown';
    byState[lv] = byState[lv] || { n: 0, disagree: 0 };
    byState[lv].n++;
    if (['B', 'C', 'D'].includes(r.disagreement_type)) byState[lv].disagree++;
    const ep = r.learner_snapshot.errorPattern;
    byError[ep] = byError[ep] || { n: 0, disagree: 0 };
    byError[ep].n++;
    if (['B', 'C', 'D'].includes(r.disagreement_type)) byError[ep].disagree++;
  }
  const typeCount = {};
  for (const r of records) typeCount[r.disagreement_type] = (typeCount[r.disagreement_type] || 0) + 1;
  return {
    label,
    total: records.length,
    comparable: comparable.length,
    disagreement_rate: comparable.length ? +(disagree.length / comparable.length).toFixed(3) : null,
    by_type: typeCount,
    high_confidence_disagreement: comparable.filter((r) => r.high_confidence_disagree).length,
    recovery_opportunity: records.filter((r) => (r.disagreement_type === 'N' || ['B', 'C', 'D'].includes(r.disagreement_type)) && ['partial_hint', 'question'].includes(r.shadow_recommendation)).length,
    by_learner_state: byState,
    by_error_type: byError,
  };
}

const out = {
  real: analyze(realRecords, 'real'),
  synthetic: analyze(synRecords, 'synthetic'),
};
fs.writeFileSync(path.join(OUT, 'shadow-events.jsonl'), [...realRecords, ...synRecords].map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.writeFileSync(path.join(OUT, 'analysis.json'), JSON.stringify(out, null, 2));

console.log(JSON.stringify(out, null, 2));