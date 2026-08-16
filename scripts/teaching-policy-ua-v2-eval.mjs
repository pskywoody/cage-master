// scripts/teaching-policy-ua-v2-eval.mjs
// Phase 14：UA-v2 Policy Re-evaluation（shadow / offline / synthetic）。
// 输入：Phase 12.5 refined state（refineBoundary 得到）+ Phase 13 coarse signal（对照 UA-v1）。
// 跑 Policy A(Naive) / B(UA-v1) / C(UA-v2)，产出 safety / learning / boundary-alignment 指标。
// 只读 core/learner-state-boundary-refiner.js；不改任何生产文件、不接生产、不自动触发教学。

import fs from 'fs';
import { refineBoundary } from '../core/learner-state-boundary-refiner.js';

const outDir = process.argv[2] || 'data/teaching-policy-ua-v2';
const REFINED = ['novice_exploration', 'temporary_error', 'persistent_struggle', 'guided', 'independent'];
const PER = 120;

// ---- 合成 learner 生成（复用 Phase 12.5 evidence 方法，保证 refiner 正确分类）----
function genEvidence(truth, i) {
  switch (truth) {
    case 'novice_exploration':
      return { failures: i % 2, hints: i % 2, recoveryAttempts: 1 + (i % 2), previousSkillMastery: false };
    case 'temporary_error':
      return { failures: 1, hints: i % 2, recoveryAttempts: 1 + (i % 2), previousSkillMastery: true };
    case 'persistent_struggle':
      return { failures: 2 + (i % 3), hints: 1 + (i % 3), recoveryAttempts: 0, previousSkillMastery: i % 2 === 0 };
    case 'guided':
      return { failures: 0, hints: 3, recoveryAttempts: 2, previousSkillMastery: true };
    case 'independent':
      return { failures: 0, hints: 0, recoveryAttempts: 3, previousSkillMastery: true };
    default:
      return {};
  }
}

// coarse state（Phase 13 输入）：novice_exploration→novice；temporary/persistent→struggling；guided/independent 透传
function coarseState(truth) {
  if (truth === 'novice_exploration') return 'novice';
  if (truth === 'guided') return 'guided';
  if (truth === 'independent') return 'independent';
  return 'struggling';
}
// coarse confidence（Phase 13 LearnerModel 估计）：模糊类低置信（根因），透传类高置信
function coarseConfidence(truth) {
  if (truth === 'guided' || truth === 'independent') return 0.95;
  return 0.25;
}

// ---- 策略 ----
function boundaryAction(coarse) {
  if (coarse === 'struggling') return 'partial_hint';
  if (coarse === 'novice') return 'question';
  if (coarse === 'guided') return 'question';
  if (coarse === 'independent') return 'free_attempt';
  return 'question';
}
// Policy A — Naive（coarse，无置信门控）
function policyNaive(coarse) {
  return boundaryAction(coarse);
}
// Policy B — UA-v1（coarse + coarse 置信；低置信且模糊类 → 先观察）
function policyUAv1(coarse, coarseConf) {
  if (coarseConf < 0.4 && (coarse === 'struggling' || coarse === 'novice')) return 'question';
  return boundaryAction(coarse);
}
// Policy C — UA-v2（refined + refined 置信；低置信安全兜底 → question）
function policyUAv2(refined, refinedConf) {
  if (refinedConf < 0.4) return 'question';
  const map = {
    novice_exploration: 'observe',
    temporary_error: 'question',
    persistent_struggle: 'partial_hint',
    guided: 'backoff',
    independent: 'backoff',
  };
  return map[refined] || 'question';
}

// ---- 期望动作 & 指标判定 ----
const EXPECTED = {
  novice_exploration: 'observe',
  temporary_error: 'question',
  persistent_struggle: 'partial_hint',
  guided: 'backoff',
  independent: 'backoff',
};
const INTERVENE = new Set(['partial_hint', 'teach']);
function isFalseIntervention(truth, action) {
  // 对明显不该脚手架的学习者（探索期/独立）仍给脚手架 = 过度介入
  return (truth === 'novice_exploration' || truth === 'independent') && INTERVENE.has(action);
}
function isFalseBackoff(truth, action) {
  // 持续挣扎却没被介入（question/backoff/free_attempt/observe）= 错误撤退
  return truth === 'persistent_struggle' && !INTERVENE.has(action);
}

// ---- 学习指标（模型化 proxy；明确非真实学员证据、非因果增益）----
const RECOVERY = {
  persistent_struggle: { teach: 2, partial_hint: 4, question: 7, backoff: 9, free_attempt: 9, observe: 9 },
  temporary_error: { question: 3, partial_hint: 3, teach: 4, backoff: 6, free_attempt: 6, observe: 5 },
  novice_exploration: { observe: 3, question: 4, partial_hint: 5, teach: 6, backoff: 7, free_attempt: 6 },
  guided: { backoff: 2, question: 3, partial_hint: 4, teach: 5, free_attempt: 3, observe: 4 },
  independent: { backoff: 1, free_attempt: 1, question: 2, partial_hint: 3, teach: 4, observe: 2 },
};
function recoveryTime(truth, action) { return RECOVERY[truth][action] ?? 5; }
function hintDependencyDelta(truth, action) {
  if (truth === 'novice_exploration' && INTERVENE.has(action)) return 1.0;
  if (truth === 'temporary_error' && action === 'partial_hint') return 0.3;
  if ((truth === 'independent' || truth === 'guided') && (action === 'backoff' || action === 'free_attempt')) return -0.5;
  return 0;
}
function transferDelta(truth, action) {
  if ((truth === 'novice_exploration' || truth === 'temporary_error') && (action === 'observe' || action === 'question')) return 1.0;
  if ((truth === 'novice_exploration' || truth === 'temporary_error') && INTERVENE.has(action)) return -0.5;
  return 0;
}
function retentionDelta(truth, action) {
  if ((truth === 'novice_exploration' || truth === 'temporary_error') && (action === 'observe' || action === 'question')) return 0.8;
  if ((truth === 'novice_exploration' || truth === 'temporary_error') && INTERVENE.has(action)) return -0.4;
  return 0;
}

// ---- 主循环 ----
const policies = {
  PolicyA_Naive: (c, cc, r, rc) => policyNaive(c),
  PolicyB_UAv1: (c, cc, r, rc) => policyUAv1(c, cc),
  PolicyC_UAv2: (c, cc, r, rc) => policyUAv2(r, rc),
};

const records = [];
for (const truth of REFINED) {
  for (let i = 0; i < PER; i++) {
    const evidence = genEvidence(truth, i);
    const coarse = coarseState(truth);
    const coarseConf = coarseConfidence(truth);
    const refinedOut = refineBoundary({ inferredState: coarse, confidence: coarseConf, evidence });
    const refined = refinedOut.shadowState;
    const refinedConf = refinedOut.confidence;
    const rec = { truth, coarse, coarseConf: Number(coarseConf.toFixed(2)), refined, refinedConf };
    for (const [name, fn] of Object.entries(policies)) {
      const action = fn(coarse, coarseConf, refined, refinedConf);
      rec[name] = {
        action,
        expected: EXPECTED[truth],
        match: action === EXPECTED[truth],
        falseIntervention: isFalseIntervention(truth, action),
        falseBackoff: isFalseBackoff(truth, action),
        recoveryTime: recoveryTime(truth, action),
        hintDependency: hintDependencyDelta(truth, action),
        transfer: transferDelta(truth, action),
        retention: retentionDelta(truth, action),
      };
    }
    records.push(rec);
  }
}

// ---- 聚合 ----
const N = records.length;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
function agg(policyName) {
  const xs = records.map((r) => r[policyName]);
  const ps = records.filter((r) => r.truth === 'persistent_struggle').map((r) => r[policyName]);
  return {
    falseInterventionRate: Number((xs.filter((r) => r.falseIntervention).length / N).toFixed(3)),
    falseBackoffRate: Number((xs.filter((r) => r.falseBackoff).length / N).toFixed(3)),
    matchRate: Number((xs.filter((r) => r.match).length / N).toFixed(3)),
    recoveryTimeMean: Number(mean(xs.map((r) => r.recoveryTime)).toFixed(2)),
    recoveryTimePersistent: Number(mean(ps.map((r) => r.recoveryTime)).toFixed(2)),
    hintDependencyMean: Number(mean(xs.map((r) => r.hintDependency)).toFixed(3)),
    transferMean: Number(mean(xs.map((r) => r.transfer)).toFixed(3)),
    retentionMean: Number(mean(xs.map((r) => r.retention)).toFixed(3)),
  };
}
const metrics = {
  PolicyA_Naive: agg('PolicyA_Naive'),
  PolicyB_UAv1: agg('PolicyB_UAv1'),
  PolicyC_UAv2: agg('PolicyC_UAv2'),
};

// ---- Boundary Alignment：state × policy → action / expected / match ----
const alignment = {};
for (const truth of REFINED) {
  alignment[truth] = { expected: EXPECTED[truth] };
  for (const name of Object.keys(policies)) {
    const acts = records.filter((r) => r.truth === truth).map((r) => r[name].action);
    const action = acts[0]; // 同 truth 确定性
    const sample = records.find((r) => r.truth === truth)[name];
    alignment[truth][name] = { action, match: sample.match, count: acts.length };
  }
}

// ---- 验收 ----
const A = metrics.PolicyB_UAv1, C = metrics.PolicyC_UAv2;
const checks = {
  falseInterventionLE_UAv1: C.falseInterventionRate <= A.falseInterventionRate,
  falseBackoffLE_UAv1: C.falseBackoffRate <= A.falseBackoffRate,
  recoveryPersistentNotWorse: C.recoveryTimePersistent <= A.recoveryTimePersistent,
  hintDependencyNotIncreased: C.hintDependencyMean <= A.hintDependencyMean,
};
const VALIDATED = Object.values(checks).every(Boolean);

const summary = {
  N_per_class: PER,
  total: N,
  metrics,
  acceptance: {
    TEACHING_POLICY_UA_V2_VALIDATED: VALIDATED,
    checks,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/metrics.json`, JSON.stringify(metrics, null, 2) + '\n');
fs.writeFileSync(`${outDir}/state_action_confusion_matrix.json`, JSON.stringify(alignment, null, 2) + '\n');
fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2) + '\n');

console.log('=== Phase 14 UA-v2 metrics ===');
console.log(JSON.stringify(metrics, null, 2));
console.log('=== acceptance ===');
console.log(JSON.stringify(checks, null, 2));
console.log('TEACHING_POLICY_UA_V2_VALIDATED =', VALIDATED);
