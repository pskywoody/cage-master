// scripts/experiment-e2e-demo.js
// 虚拟实验端到端：REGISTER → ASSIGN → EVENT GENERATE → ANALYZE → REPORT（写 artifact package）
// 只读，不接真实用户，不改任何产品逻辑。运行：node scripts/experiment-e2e-demo.js

import { ExperimentRegistry } from '../core/experiment-registry.js';
import { assignVariant } from '../core/experiment-assigner.js';
import { analyzeExperiment } from '../core/experiment-analyzer.js';
import { writeArtifactPackage } from '../core/experiment-artifacts.js';

const experimentId = 'hint_policy_v2';
const registry = new ExperimentRegistry();
const experiment = registry.register({
  experimentId,
  name: 'Hint Policy v2 (synthetic)',
  hypothesis: '新提示策略相比旧提示策略，提高完成率/降低提示依赖/提升技能掌握。',
  variants: [{ id: 'A', label: 'control' }, { id: 'B', label: 'treatment' }],
  metrics: ['completion_rate', 'avg_time_ms', 'avg_steps', 'hint_per_session', 'mastery'],
  subjectUnit: 'session',
  seed: 42,
});

// ASSIGN：确定性分流
const subjects = [];
for (let i = 0; i < 12; i++) subjects.push(`sub_${i}`);

// EVENT GENERATE：treatment(B) 表现更好
const events = [];
let tsBase = 1700000000000;
function push(event, sessionId, variantId, subject, metrics = {}) {
  tsBase += 1000;
  events.push({
    experimentId, variantId, sessionId, timestamp: tsBase,
    event, subject, metrics,
  });
}

const t = 3; // variant index for treatment
for (const [i, sid] of subjects.entries()) {
  const variant = assignVariant(experimentId, sid, experiment.variants, experiment.seed);
  const isB = variant === 'B';
  const subject = { skill: 'hiddenPair', level: '403' };
  push('lesson_started', sid, variant, subject);

  const hints = isB ? 0 : (i % 2 === 0 ? 1 : 2);
  for (let h = 0; h < hints; h++) push('hint_request', sid, variant, subject, { hint_level: h + 1 });

  const mistakes = isB ? 0 : 1;
  for (let m = 0; m < mistakes; m++) push('mistake', sid, variant, subject);

  push('solve_step', sid, variant, subject);
  const succeeded = isB ? true : (i % 3 !== 0); // control 每 3 个失败 1 个
  if (succeeded) {
    push('lesson_complete', sid, variant, subject, {
      time_ms: isB ? 90000 + (i % 5) * 5000 : 150000 + (i % 5) * 8000,
      steps: isB ? 5 + (i % 3) : 9 + (i % 4),
      hint_count: hints,
    });
  }
}

// ANALYZE
const analysis = analyzeExperiment(experiment, events);

// REPORT（归档）
const dir = writeArtifactPackage(experimentId, { experiment, events, analysis });

console.log('E2E 完成；artifact 目录:', dir);
console.log(JSON.stringify({ sample_size: analysis.sample_size, deltas: analysis.deltas, missing_event_rate: analysis.missing_event_rate, variant_balance: analysis.variant_balance }, null, 2));