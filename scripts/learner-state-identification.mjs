// ============================================================
// learner-state-identification.mjs — Teaching AI Phase 12
// 验证真实 LearnerModel 能否可靠识别 intervention boundary 所需状态。
// 用合成真实状态(ground truth) → 发射事件 → LearnerModel.skillState → 混淆矩阵。
// offline / shadow；不改 LearnerModel 定义。
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { LearnerModel, SKILL_STATES } from '../core/learner-model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'learner-state-classification');
fs.mkdirSync(OUT, { recursive: true });

const NOW = 1700000000000;
const MIN = 60000;
const T = 'hiddenPair';
const BOUNDARY = ['struggling', 'novice', 'guided', 'independent'];

// ground truth → 观测事件序列（含确定性噪声，按 i 变化）
function eventsFor(trueState, i) {
  const base = NOW + i * 1000000;
  let seq = [];
  const ev = (type, opts = {}) => ({ technique: T, type, ts: base + seq.length * MIN, ...opts });
  switch (trueState) {
    case 'struggling':
      seq = [ev('encounter'), ev('hint'), ev('error'), ev('hint'), ev('error'), ev('error')];
      if (i % 3 === 0) seq.push(ev('hint'), ev('error'));           // 更深挣扎
      if (i % 3 === 1) seq.push(ev('error'), ev('hint'), ev('error')); // 多错
      break;
    case 'novice':
      seq = [ev('encounter'), ev('error')];
      if (i % 2 === 0) seq.push(ev('hint'));  // 部分新手也请求提示
      break;
    case 'guided':
      seq = [ev('encounter'), ev('hint'), ev('correct', { independent: false, hintLevel: 2 }), ev('correct', { independent: false, hintLevel: 3 })];
      if (i % 3 === 0) seq.push(ev('error'));  // 偶尔回退
      break;
    case 'independent':
      seq = [ev('encounter'), ev('correct', { independent: true }), ev('correct', { independent: true }), ev('correct', { independent: true })];
      if (i % 3 === 1) seq.push(ev('correct', { independent: true }));
      break;
  }
  return seq;
}

// LearnerModel.skillState → intervention boundary 状态
function toBoundary(state, trend) {
  if (trend === 'struggling') return 'struggling';
  if (state === SKILL_STATES.UNKNOWN || state === SKILL_STATES.EXPOSED) return 'novice';
  if (state === SKILL_STATES.GUIDED) return 'guided';
  if (state === SKILL_STATES.INDEPENDENT || state === SKILL_STATES.MASTERED) return 'independent';
  return 'novice';
}

const N = 50;
const matrix = {}; // true -> predicted -> count
const confByPred = {}; // predicted -> sum confidence
const confCnt = {};
for (const ts of BOUNDARY) { matrix[ts] = {}; }

for (const trueState of BOUNDARY) {
  for (let i = 0; i < N; i++) {
    const lm = new LearnerModel();
    for (const e of eventsFor(trueState, i)) lm.observe(e);
    const s = lm.skillState(T);
    const pred = toBoundary(s.state, s.trend);
    matrix[trueState][pred] = (matrix[trueState][pred] || 0) + 1;
    confByPred[pred] = (confByPred[pred] || 0) + s.confidence;
    confCnt[pred] = (confCnt[pred] || 0) + 1;
  }
}

// 统计
const summary = { N, confusion: matrix, accuracy: 0, precisionRecall: {}, meanConfidence: {} };
let correct = 0;
for (const ts of BOUNDARY) {
  const row = matrix[ts];
  correct += (row[ts] || 0);
  const total = N;
  const tp = row[ts] || 0;
  const pn = BOUNDARY.reduce((a, p) => a + (matrix[p]?.[ts] || 0), 0); // 预测为 ts 的总数
  summary.precisionRecall[ts] = {
    recall: +(tp / total).toFixed(3),
    precision: pn ? +(tp / pn).toFixed(3) : null,
  };
  summary.meanConfidence[ts] = confCnt[ts] ? +(confByPred[ts] / confCnt[ts]).toFixed(3) : 0;
}
summary.accuracy = +(correct / (BOUNDARY.length * N)).toFixed(3);
// boundary 关注：struggling ↔ guided 混淆
summary.strugglingPredictedAsGuided = matrix['struggling']['guided'] || 0;
summary.guidedPredictedAsStruggling = matrix['guided']['struggling'] || 0;

fs.writeFileSync(path.join(OUT, 'confusion-matrix.json'), JSON.stringify(matrix, null, 2));
fs.writeFileSync(path.join(OUT, 'summary.json'), JSON.stringify(summary, null, 2));

console.log('=== Confusion Matrix (true rows × predicted cols) ===');
console.log('          ' + BOUNDARY.join('  '));
for (const ts of BOUNDARY) {
  console.log(`${ts.padEnd(11)} ` + BOUNDARY.map((p) => String(matrix[ts][p] || 0).padStart(9)).join(''));
}
console.log('accuracy:', summary.accuracy);
console.log('precision/recall:', JSON.stringify(summary.precisionRecall));
console.log('meanConfidence per predicted:', JSON.stringify(summary.meanConfidence));
console.log('struggling→guided 误判:', summary.strugglingPredictedAsGuided, '| guided→struggling 误判:', summary.guidedPredictedAsStruggling);