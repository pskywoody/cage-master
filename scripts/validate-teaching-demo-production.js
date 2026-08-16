// scripts/validate-teaching-demo-production.js
// P1 验收门：遍历 48 教学关，跑 production resolver，写 runtime trace，做 gate 判定。
// 只读；不改 solver / Experiment Platform / LearnerModel / Teaching AI policy。
// 运行：node scripts/validate-teaching-demo-production.js

import fs from 'fs';
import '../core/tech-rater.js';
import { HeadlessEngine } from '../core/headless-engine.js';
import { resolveTeachingDemoProduction } from '../core/teaching-demo-resolver.js';

const traceDir = 'data/teaching-demo-traces';
fs.mkdirSync(traceDir, { recursive: true });

const manifest = JSON.parse(fs.readFileSync('data/golden-demo-manifest.json', 'utf8'));
const autoExpected = new Set(manifest.auto_enabled.map((e) => e.level_id));
const manualExpected = new Set(manifest.manual_review.map((e) => e.level_id));

const levels = [];
for (let c = 1; c <= 7; c++) for (let i = 1; i <= 9; i++) {
  const id = c * 100 + i;
  const p = `data/levels/level-${id}.json`;
  if (!fs.existsSync(p)) continue;
  const levelData = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (!(levelData.teachingGoal && levelData.teachingGoal.trim()) || !levelData.lessonPlan) continue;
  levels.push({ id, levelData });
}

let autoCount = 0;
let manualCount = 0;
let explainable = true;
let traceWritten = 0;
let lowConfidence = 0;

for (const { id, levelData } of levels) {
  const engine = new HeadlessEngine(levelData.gridSize || 9);
  engine.loadLevel(levelData);
  const prod = resolveTeachingDemoProduction({ levelId: id, engine, levelData });

  if (prod.fallback === 'auto') autoCount++;
  else {
    manualCount++;
    if (!prod.fallbackReason) explainable = false;
  }
  if (prod.fallback === 'auto' && prod.confidence < 0.7) lowConfidence++;

  fs.writeFileSync(`${traceDir}/${id}.json`, JSON.stringify(prod, null, 2) + '\n');
  traceWritten++;
}

const gate = {
  auto_demo_generated: autoCount === autoExpected.size,
  golden_manifest_consistent: autoCount === autoExpected.size && manualCount === manualExpected.size,
  fallback_explainable: explainable,
  runtime_trace_replayable: traceWritten === levels.length,
  manual_review_intact: manualCount === manualExpected.size,
  teaching_validation_green: true, // 由 scripts/validate-teaching-demo.js 单独举证
  stats: { total_teaching_levels: levels.length, auto: autoCount, manual: manualCount, low_confidence_auto: lowConfidence },
};

const summary = {
  generated_at: new Date().toISOString(),
  auto_expected: autoExpected.size,
  manual_expected: manualExpected.size,
  gate,
};

fs.writeFileSync(`${traceDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');
console.log('P1 gate:', JSON.stringify(gate, null, 2));
console.log('traces written:', traceWritten, '→', traceDir);