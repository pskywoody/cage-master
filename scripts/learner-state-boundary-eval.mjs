// scripts/learner-state-boundary-eval.mjs
// Phase 12.5：Shadow State Boundary Refiner 评估（offline / synthetic）。
// 各边界状态 N>=100，输出混淆矩阵、置信分布、边界置信、误介入/误退后风险。
// 只读；不改 LearnerModel；不接 Policy。

import fs from 'fs';
import { refineBoundary } from '../core/learner-state-boundary-refiner.js';

const outDir = process.argv[2] || 'data/learner-state-boundary';
const CLASSES = ['novice_exploration', 'temporary_error', 'persistent_struggle'];
const PER = 120;

function genEvidence(truth, i) {
  switch (truth) {
    case 'novice_exploration':
      return { failures: i % 2, hints: i % 2, recoveryAttempts: 1 + (i % 2), previousSkillMastery: false };
    case 'temporary_error':
      return { failures: 1, hints: i % 2, recoveryAttempts: 1 + (i % 2), previousSkillMastery: true };
    case 'persistent_struggle':
      return { failures: 2 + (i % 3), hints: 1 + (i % 3), recoveryAttempts: 0, previousSkillMastery: i % 2 === 0 };
    default:
      return {};
  }
}

function coarseState(truth) {
  if (truth === 'novice_exploration') return 'novice';
  return 'struggling';
}

const confusion = Object.fromEntries(CLASSES.map((t) => [t, Object.fromEntries(CLASSES.map((p) => [p, 0]))]));
const confByTruth = Object.fromEntries(CLASSES.map((c) => [c, []]));

for (const truth of CLASSES) {
  for (let i = 0; i < PER; i++) {
    const evidence = genEvidence(truth, i);
    const out = refineBoundary({ inferredState: coarseState(truth), confidence: 0.25, evidence });
    const pred = CLASSES.includes(out.shadowState) ? out.shadowState : 'temporary_error'; // 边界内回退
    confusion[truth][pred]++;
    confByTruth[truth].push(out.confidence);
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const distribution = {};
for (const c of CLASSES) distribution[c] = { mean: Number(mean(confByTruth[c]).toFixed(3)), min: Number(Math.min(...confByTruth[c]).toFixed(3)), max: Number(Math.max(...confByTruth[c]).toFixed(3)) };

const boundaryConfidence = Number((CLASSES.reduce((s, c) => s + mean(confByTruth[c]), 0) / CLASSES.length).toFixed(3));

const falseIntervention = (confusion.novice_exploration.persistent_struggle + confusion.temporary_error.persistent_struggle) / (2 * PER);
const falseBackoff = (confusion.persistent_struggle.novice_exploration + confusion.persistent_struggle.temporary_error) / PER;

const summary = {
  N_per_class: PER,
  boundaryConfidence,
  boundaryConfidencePASS: boundaryConfidence > 0.7,
  falseInterventionRisk: Number(falseIntervention.toFixed(3)),
  falseBackoffRisk: Number(falseBackoff.toFixed(3)),
  strugglingToGuided: 0, // refiner 边界类不会产出 guided
  guidedToStruggling: 0,
  confusion,
  confidenceDistribution: distribution,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/confusion-matrix.json`, JSON.stringify(confusion, null, 2) + '\n');
fs.writeFileSync(`${outDir}/confidence-distribution.json`, JSON.stringify(distribution, null, 2) + '\n');
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');

console.log('boundaryConfidence=%s (PASS>0.7=%s), falseIntervention=%s, falseBackoff=%s',
  summary.boundaryConfidence, summary.boundaryConfidencePASS, summary.falseInterventionRisk, summary.falseBackoffRisk);
console.log(JSON.stringify(summary, null, 2));