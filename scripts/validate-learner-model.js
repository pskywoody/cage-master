// scripts/validate-learner-model.js
// LearnerModel 离线回放校验（基于真实事件字段名建模，合成序列回放）。
// 运行：node scripts/validate-learner-model.js

import { LearnerModel, SKILL_STATES } from '../core/learner-model.js';

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log('  ✓', name);
  } else {
    console.log('  ✗', name, detail ? JSON.stringify(detail) : '');
    failures++;
  }
}

const NOW = Date.now();
const MIN = 60 * 1000;
const DAY = 24 * 3600 * 1000;

console.log('Offline Replay: LearnerModel');

// Case 1: 连续成功 → unknown → exposed → guided → independent
{
  const lm = new LearnerModel();
  check('Case1 初始 unknown', lm.skillState('nakedSingle').state === SKILL_STATES.UNKNOWN, lm.skillState('nakedSingle'));

  lm.observe({ technique: 'nakedSingle', type: 'encounter', ts: NOW });
  check('Case1 encounter→exposed', lm.skillState('nakedSingle').state === SKILL_STATES.EXPOSED, lm.skillState('nakedSingle'));

  lm.observe({ technique: 'nakedSingle', type: 'hint', ts: NOW + MIN });
  lm.observe({ technique: 'nakedSingle', type: 'correct', independent: false, hintLevel: 3, ts: NOW + 2 * MIN });
  check('Case1 提示下正确→guided', lm.skillState('nakedSingle').state === SKILL_STATES.GUIDED, lm.skillState('nakedSingle'));

  lm.observe({ technique: 'nakedSingle', type: 'correct', independent: true, ts: NOW + 3 * MIN });
  check('Case1 独立正确→independent', lm.skillState('nakedSingle').state === SKILL_STATES.INDEPENDENT, lm.skillState('nakedSingle'));

  lm.observe({ technique: 'nakedSingle', type: 'correct', independent: true, ts: NOW + 4 * MIN });
  lm.observe({ technique: 'nakedSingle', type: 'correct', independent: true, ts: NOW + 5 * MIN });
  check('Case1 连续独立正确→mastered', lm.skillState('nakedSingle').state === SKILL_STATES.MASTERED, lm.skillState('nakedSingle'));
}

// Case 2: 反复提示/错误 → guided + struggling
{
  const lm = new LearnerModel();
  lm.observe({ technique: 'hiddenPair', type: 'encounter', ts: NOW });
  lm.observe({ technique: 'hiddenPair', type: 'hint', ts: NOW + MIN });
  lm.observe({ technique: 'hiddenPair', type: 'error', ts: NOW + 2 * MIN });
  lm.observe({ technique: 'hiddenPair', type: 'hint', ts: NOW + 3 * MIN });
  lm.observe({ technique: 'hiddenPair', type: 'error', ts: NOW + 4 * MIN });
  const st = lm.skillState('hiddenPair');
  check('Case2 反复提示→guided', st.state === SKILL_STATES.GUIDED, st);
  check('Case2 反复错→struggling', st.trend === 'struggling', st);
}

// Case 3: 长期不用 → mastered confidence 衰减
{
  const lm = new LearnerModel();
  const t0 = NOW - 14 * DAY;
  lm.observe({ technique: 'rule45', type: 'encounter', ts: t0 });
  lm.observe({ technique: 'rule45', type: 'correct', independent: true, ts: t0 + MIN });
  lm.observe({ technique: 'rule45', type: 'correct', independent: true, ts: t0 + 2 * MIN });
  lm.observe({ technique: 'rule45', type: 'correct', independent: true, ts: t0 + 3 * MIN });
  const fresh = lm.skillState('rule45', t0 + 4 * MIN);
  const decayed = lm.skillState('rule45', NOW);
  check('Case3 近期可达 mastered', fresh.state === SKILL_STATES.MASTERED, fresh);
  check('Case3 长期未练 confidence 衰减', decayed.confidence < fresh.confidence, { fresh: fresh.confidence, decayed: decayed.confidence });
}

console.log('');
if (failures > 0) {
  console.log(`FAILED: ${failures} assertions`);
  process.exit(1);
} else {
  console.log('PASS: learner-model offline replay');
}