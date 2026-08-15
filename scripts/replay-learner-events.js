// scripts/replay-learner-events.js
// 离线回放：events.jsonl → LearnerModel.observe → learner-state-report.json
// 用法：node scripts/replay-learner-events.js sample.jsonl [输出路径]
// 每行一个 LearnerEvent（统一 schema）；也可给 raw 事件（含 source/action）。

import fs from 'fs';
import { LearnerModel } from '../core/learner-model.js';
import { normalize, toObservation } from '../core/learner-event-adapter.js';

const input = process.argv[2];
if (!input) {
  console.error('用法: node scripts/replay-learner-events.js <events.jsonl> [out.json]');
  process.exit(2);
}
const output = process.argv[3] || 'reports/learner-state-report.json';

const lines = fs.readFileSync(input, 'utf8').split(/\r?\n/).filter((l) => l.trim());
const lm = new LearnerModel();
let observed = 0;
let skipped = 0;

for (const line of lines) {
  let raw;
  try { raw = JSON.parse(line); } catch (e) { skipped++; continue; }
  const ev = normalize(raw);
  const obs = toObservation(ev);
  if (!obs) { skipped++; continue; }
  lm.observe(obs);
  observed++;
}

const report = {
  generated_at: new Date().toISOString(),
  input,
  observed_events: observed,
  skipped_events: skipped,
  skills: {},
};

const seen = new Set();
for (const line of lines) {
  let raw;
  try { raw = JSON.parse(line); } catch (e) { continue; }
  const ev = normalize(raw);
  if (ev.technique && !seen.has(ev.technique)) seen.add(ev.technique);
}

for (const tech of seen) {
  report.skills[tech] = {
    state: lm.skillState(tech).state,
    confidence: Number(lm.skillState(tech).confidence.toFixed(3)),
    trend: lm.skillState(tech).trend,
    mastery: Number(lm.mastery(tech).toFixed(3)),
  };
}

fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(`replay 完成：${observed} 事件 consume，${skipped} 跳过`);
console.log('输出:', output);
console.log(JSON.stringify(report, null, 2));