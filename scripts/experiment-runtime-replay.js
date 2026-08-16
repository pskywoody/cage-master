// scripts/experiment-runtime-replay.js
// 离线 runtime bridge 回放：learner events jsonl + battle ai traces jsonl → experiment events jsonl + report。
// 用法：node scripts/experiment-runtime-replay.js <learner.jsonl> <battle.jsonl> [events-out] [report-out]
// 只读；不接生产；不改任何行为。

import fs from 'fs';
import { RuntimeBridge } from '../core/experiment-runtime-bridge.js';

const learnerPath = process.argv[2] || 'samples/learner-events-sample.jsonl';
const battlePath = process.argv[3] || 'data/battle-ai-traces/decisions.jsonl';
const eventsOut = process.argv[4] || 'reports/experiment-runtime-events.jsonl';
const reportOut = process.argv[5] || 'reports/experiment-runtime-replay-report.json';

function readJsonl(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean);
}

const learnerEvents = readJsonl(learnerPath);
const battleDecisions = readJsonl(battlePath);

const bridge = new RuntimeBridge({ experimentId: 'runtime_bridge_replay', subjectId: 'replay' });

let learnerConsumed = 0;
let learnerSkipped = 0;
const learnerSourceBits = [];
for (const raw of learnerEvents) {
  const ev = bridge.consumeLearnerEvent(raw);
  if (ev) { learnerConsumed++; learnerSourceBits.push({ source: ev.source, subject: ev.subjectId, ts: ev.timestamp }); }
  else learnerSkipped++;
}

let battleConsumed = 0;
for (const d of battleDecisions) {
  if (bridge.consumeBattleDecision(d)) battleConsumed++;
}

const all = bridge.collector.events();
fs.writeFileSync(eventsOut, bridge.flush());

const nonBattle = all.filter((e) => e.source !== 'BattleAI');
const subjectPreserved = nonBattle.every((e) => e.subjectId !== 'replay');
const tsPreserved = nonBattle.length === learnerConsumed;
const sources = Array.from(new Set(all.map((e) => e.source)));

const report = {
  generated_at: new Date().toISOString(),
  inputs: { learnerPath, battlePath },
  event_count: { learner_total: learnerEvents.length, learner_consumed: learnerConsumed, learner_skipped: learnerSkipped, battle_consumed: battleConsumed, total_emitted: all.length },
  preserved: {
    event_count: learnerConsumed === nonBattle.length,
    subject: subjectPreserved,
    timestamp: tsPreserved,
  },
  sources: sources,
  output_files: { events: eventsOut, report: reportOut },
};

fs.writeFileSync(reportOut, JSON.stringify(report, null, 2) + '\n');
console.log('runtime bridge replay 完成');
console.log(JSON.stringify(report, null, 2));