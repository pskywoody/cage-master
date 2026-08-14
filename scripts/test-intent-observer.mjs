// ============================================================
//  test-intent-observer.mjs - CM4-R4 IntentObserver 验证
// ============================================================
//  验证：
//    1. 进攻场景：targetHub 在中立/对方据点 + 高 aggression → attackingHub 正确
//    2. 防守场景：targetHub 在己方据点 + 低 aggression → defendingHub 正确
//    3. 冲线场景：玩家已占 2 据点 + 高进度 → chasingLine=true
//    4. 试探场景：低 aggression + balanced → strategy=probe
//    5. riskLevel 综合反映 aggression/tempo/strategy
//    6. toAnalysisCompat 兼容旧接口
//  用法：node scripts/test-intent-observer.mjs
// ============================================================
import { inferIntent, IntentObserver } from '../core/intent-observer.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- 1. 进攻场景 ----
console.log('1) 进攻场景');
const attackAnalysis = {
  targetHub: 1,
  aggression: 0.7,
  tempo: 'accelerating',
  strategy: 'aggressive',
  isBeingTargeted: true,
};
const attackCtx = {
  hubOwnership: ['player', null, 'boss'], // 0:玩家, 1:中立, 2:Boss
  selfHubCount: 1,   // Boss 据点数（观察者是 Boss 方）
  opponentHubCount: 1, // 玩家据点数
  progress: 0.4,
};
const attackIntent = inferIntent(attackAnalysis, attackCtx);
assert('attackingHub = 1（中立据点）', attackIntent.attackingHub === 1, `actual=${attackIntent.attackingHub}`);
assert('defendingHub = -1（无防守目标）', attackIntent.defendingHub === -1, `actual=${attackIntent.defendingHub}`);
assert('riskLevel > 0.5（高激进）', attackIntent.riskLevel > 0.5, `actual=${attackIntent.riskLevel.toFixed(3)}`);
assert('strategy = pressure', attackIntent.strategy === 'pressure', `actual=${attackIntent.strategy}`);
assert('confidence > 0.5', attackIntent.confidence > 0.5, `actual=${attackIntent.confidence.toFixed(3)}`);

// ---- 2. 防守场景 ----
console.log('2) 防守场景');
const defAnalysis = {
  targetHub: 0,
  aggression: 0.1,
  tempo: 'steady',
  strategy: 'defensive',
  isBeingTargeted: false,
};
const defCtx = {
  hubOwnership: ['player', null, 'boss'],
  selfHubCount: 1,
  opponentHubCount: 1,
  progress: 0.5,
};
const defIntent = inferIntent(defAnalysis, defCtx);
assert('defendingHub = 0（玩家自己的据点）', defIntent.defendingHub === 0, `actual=${defIntent.defendingHub}`);
assert('attackingHub = -1', defIntent.attackingHub === -1, `actual=${defIntent.attackingHub}`);
assert('riskLevel < 0.4（低激进）', defIntent.riskLevel < 0.4, `actual=${defIntent.riskLevel.toFixed(3)}`);
assert('strategy = fortify', defIntent.strategy === 'fortify', `actual=${defIntent.strategy}`);

// ---- 3. 冲线场景 ----
console.log('3) 冲线场景');
const lineAnalysis = {
  targetHub: 2,
  aggression: 0.6,
  tempo: 'accelerating',
  strategy: 'aggressive',
  isBeingTargeted: true,
};
const lineCtx = {
  hubOwnership: ['player', 'player', null],
  selfHubCount: 0,
  opponentHubCount: 2, // 玩家已占 2 个
  progress: 0.7,
};
const lineIntent = inferIntent(lineAnalysis, lineCtx);
assert('chasingLine = true', lineIntent.chasingLine === true, `actual=${lineIntent.chasingLine}`);
assert('chasing conf > 0.6', lineIntent._conf.chasing > 0.6, `actual=${lineIntent._conf.chasing.toFixed(3)}`);
assert('strategy = finish', lineIntent.strategy === 'finish', `actual=${lineIntent.strategy}`);

// ---- 4. 试探场景 ----
console.log('4) 试探场景');
const probeAnalysis = {
  targetHub: -1,
  aggression: 0.1,
  tempo: 'steady',
  strategy: 'balanced',
  isBeingTargeted: false,
};
const probeCtx = {
  hubOwnership: [null, null, null],
  selfHubCount: 0,
  opponentHubCount: 0,
  progress: 0.1,
};
const probeIntent = inferIntent(probeAnalysis, probeCtx);
assert('strategy = probe', probeIntent.strategy === 'probe', `actual=${probeIntent.strategy}`);
assert('riskLevel < 0.3', probeIntent.riskLevel < 0.3, `actual=${probeIntent.riskLevel.toFixed(3)}`);
assert('confidence < 0.5（低样本）', probeIntent.confidence < 0.5, `actual=${probeIntent.confidence.toFixed(3)}`);

// ---- 5. riskLevel 验证 ----
console.log('5) riskLevel 梯度');
// 高风险
const highRisk = inferIntent(
  { targetHub: 1, aggression: 0.8, tempo: 'accelerating', strategy: 'aggressive' },
  { hubOwnership: [null, null, null], selfHubCount: 0, opponentHubCount: 0, progress: 0.6 }
);
// 低风险
const lowRisk = inferIntent(
  { targetHub: 0, aggression: 0.1, tempo: 'decelerating', strategy: 'defensive' },
  { hubOwnership: ['player', null, null], selfHubCount: 0, opponentHubCount: 1, progress: 0.3 }
);
assert('高风险 > 低风险', highRisk.riskLevel > lowRisk.riskLevel,
  `high=${highRisk.riskLevel.toFixed(3)} vs low=${lowRisk.riskLevel.toFixed(3)}`);
assert('高风险 > 0.6', highRisk.riskLevel > 0.6, `actual=${highRisk.riskLevel.toFixed(3)}`);
assert('低风险 < 0.3', lowRisk.riskLevel < 0.3, `actual=${lowRisk.riskLevel.toFixed(3)}`);

// ---- 6. 兼容接口 ----
console.log('6) toAnalysisCompat 兼容');
const obs = new IntentObserver();
const compat = obs.toAnalysisCompat(attackIntent);
assert('targetHub 映射正确', compat.targetHub === 1, `actual=${compat.targetHub}`);
assert('isBeingTargeted 映射正确', compat.isBeingTargeted === true, `actual=${compat.isBeingTargeted}`);
assert('aggression 映射为 riskLevel', Math.abs(compat.aggression - attackIntent.riskLevel) < 1e-9);
assert('_intent 完整保留', compat._intent && compat._intent.strategy === 'pressure');

// ---- 7. 空输入容错 ----
console.log('7) 空输入容错');
const emptyIntent = inferIntent(null, null);
assert('空输入不崩溃', emptyIntent && typeof emptyIntent === 'object');
assert('attackingHub 默认 -1', emptyIntent.attackingHub === -1);
assert('riskLevel ∈ [0,1]', emptyIntent.riskLevel >= 0 && emptyIntent.riskLevel <= 1);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);