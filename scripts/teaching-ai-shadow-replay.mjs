// ============================================================
// teaching-ai-shadow-replay.mjs — Teaching AI Phase 8
// 离线回放：把 samples/learner-events-sample.jsonl 投影为
// learner snapshot + shadow decision，与 lesson 实际动作做 agreement 分析。
// 只观察、不执行；不改 LessonPlan/HintSystem。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { shadowRecommend, projectLearnerState } from '../core/teaching-ai-shadow-adapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'teaching-ai-shadow');
fs.mkdirSync(OUT, { recursive: true });

const SAMPLE = path.join(ROOT, 'samples', 'learner-events-sample.jsonl');
const events = fs.readFileSync(SAMPLE, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));

// event → lesson 实际动作类别
const LESSON_ACTION = {
  guided_success: 'guided',
  reveal: 'reveal',
  hint_requested: 'hint',
  hint_level: 'hint',
  skill_encounter: 'demo',
  technique_taught: 'demo',
  skill_used_correctly: 'free',
  skill_mastery: 'free',
  fail: null,
  mistake: null,
};
// adapter action → 类别
function adapterCat(a) {
  if (a === 'reveal') return 'reveal';
  if (a === 'free_attempt') return 'free';
  if (a === 'question') return 'question';
  if (a === 'partial_hint' || a === 'guided') return 'guided';
  if (a === 'demo') return 'demo';
  return 'hint';
}

const bySession = {};
for (const e of events) (bySession[e.sessionId] = bySession[e.sessionId] || []).push(e);

const rows = [];
let disagree = 0, comparable = 0, highConfDisagree = 0, recoveryOpportunity = 0, hintPredHigh = 0;
for (const [sid, evts] of Object.entries(bySession)) {
  const seen = [];
  for (const e of evts) {
    const snapshot = projectLearnerState(seen); // 当前事件前的 learner snapshot
    const tech = e.technique || 'hiddenPair';
    const shadow = shadowRecommend({ learnerState: snapshot, technique: tech });
    const lessonCat = LESSON_ACTION[e.action] ?? null;
    const shadowCat = adapterCat(shadow.recommendedAction);
    let agree = null;
    if (lessonCat !== null) {
      comparable++;
      agree = lessonCat === shadowCat;
      if (!agree) {
        disagree++;
        if (shadow.confidence > 0.8) highConfDisagree++;
      }
    } else if (e.action === 'fail' || e.action === 'mistake') {
      // fail：lesson 无动作 → 若 adapter 推荐支持性动作 = recovery opportunity
      if (['guided', 'question'].includes(shadowCat)) recoveryOpportunity++;
    }
    if (['guided', 'reveal', 'hint'].includes(shadowCat)) hintPredHigh++;
    rows.push({
      session: sid,
      eventId: e.eventId,
      event: e.action,
      learner_snapshot: snapshot,
      shadow_decision: shadow,
      lesson_action: lessonCat,
      agree,
    });
    seen.push(e);
  }
}

fs.writeFileSync(path.join(OUT, 'shadow-decisions.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');

const summary = {
  totalEvents: rows.length,
  comparable: comparable,
  disagreementRate: comparable ? +(disagree / comparable).toFixed(3) : null,
  highConfidenceDisagreement: highConfDisagree,
  recoveryOpportunity: recoveryOpportunity,
  hintDependencyPredictionHighCount: hintPredHigh,
  learnerStateProjectedInRealTime: true,
  affectsUserBehavior: false,
};
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('summary:', JSON.stringify(summary, null, 2));
for (const r of rows) {
  console.log(`  ${r.session}|${r.event}: snapshot=${JSON.stringify(r.learner_snapshot.mastery)} shadow=${r.shadow_decision.recommendedAction}(c=${r.shadow_decision.confidence}) lesson=${r.lesson_action} agree=${r.agree}`);
}