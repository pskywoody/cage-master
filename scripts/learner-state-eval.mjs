// scripts/learner-state-eval.mjs
// Teaching AI Phase 12：Learner State Identification（offline / shadow-only）。
// 合成 ground truth（4 个 intervention-boundary 状态 × 50 learner）→ observe 事件
// → LearnerModel.skillState() → 映射到 boundary 状态 → 混淆矩阵与不确定性。
// 只读；不接生产 LearnerModel；不改 mastery 定义；不自动触发教学。

import fs from 'fs';
import { LearnerModel } from '../core/learner-model.js';

const outDir = process.argv[2] || 'data/learner-state-classification';
const TECH = 'hiddenPair';
const CLASSES = ['struggling', 'novice', 'guided', 'independent'];

// 每个 ground-truth 状态发射的 observe 事件序列（体现"该不该介入"的可观测信号差异）
const CLASS_EVENTS = {
  struggling: ['encounter', 'error', 'error'],
  novice: ['encounter', 'error'],
  guided: ['encounter', 'hint', 'guided_correct'],
  independent: ['encounter', 'independent_correct'],
};

function observeEvent(lm, type, ts) {
  switch (type) {
    case 'encounter': lm.observe({ technique: TECH, type: 'encounter', ts }); break;
    case 'hint': lm.observe({ technique: TECH, type: 'hint', ts }); break;
    case 'error': lm.observe({ technique: TECH, type: 'error', ts }); break;
    case 'guided_correct': lm.observe({ technique: TECH, type: 'correct', independent: false, hintLevel: 2, ts }); break;
    case 'independent_correct': lm.observe({ technique: TECH, type: 'correct', independent: true, ts }); break;
    default: break;
  }
}

function predictedClass(state, trend) {
  if (trend === 'struggling') return 'struggling';
  if (state === 'guided') return 'guided';
  if (state === 'independent' || state === 'mastered') return 'independent';
  return 'novice';
}

const PER = 50;
const confusion = Object.fromEntries(CLASSES.map((t) => [t, Object.fromEntries(CLASSES.map((p) => [p, 0]))]));
const confidences = Object.fromEntries(CLASSES.map((c) => [c, []]));

let ts = 1700000000000;
for (const trueClass of CLASSES) {
  for (let i = 0; i < PER; i++) {
    const lm = new LearnerModel();
    for (const evType of CLASS_EVENTS[trueClass]) {
      observeEvent(lm, evType, (ts += 1000));
    }
    const st = lm.skillState(TECH, ts);
    const pred = predictedClass(st.state, st.trend);
    confusion[trueClass][pred]++;
    confidences[trueClass].push(st.confidence);
  }
}

const precisionRecall = {};
for (const c of CLASSES) {
  const tp = confusion[c][c];
  const predTotal = CLASSES.reduce((s, p) => s + confusion[p][c], 0);
  const trueTotal = CLASSES.reduce((s, p) => s + confusion[c][p], 0);
  precisionRecall[c] = {
    recall: trueTotal ? Number((tp / trueTotal).toFixed(3)) : 0,
    precision: predTotal ? Number((tp / predTotal).toFixed(3)) : null,
  };
}

const totalCorrect = CLASSES.reduce((s, c) => s + confusion[c][c], 0);
const total = CLASSES.reduce((s, c) => s + CLASSES.reduce((s2, p) => s2 + confusion[c][p], 0), 0);
const accuracy = total ? Number((totalCorrect / total).toFixed(3)) : 0;

const meanConfidence = {};
for (const c of CLASSES) {
  const arr = confidences[c];
  meanConfidence[c] = arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(3)) : 0;
}

const summary = {
  N: PER, // per-class sample size
  total: total,
  accuracy,
  confusion,
  precisionRecall,
  meanConfidence,
  strugglingPredictedAsGuided: confusion.struggling.guided,
  guidedPredictedAsStruggling: confusion.guided.struggling,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/confusion-matrix.json`, JSON.stringify(confusion, null, 2) + '\n');
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');

console.log(`Learner State Identification（合成 ${CLASSES.length}×${PER}）accuracy=${accuracy}`);
console.log(JSON.stringify(summary, null, 2));