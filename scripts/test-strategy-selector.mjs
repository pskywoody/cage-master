// ============================================================
//  test-strategy-selector.mjs - CM4-R6 StrategySelector 验证
// ============================================================
//  验证：
//    1. 有效决策解析（targetSource/hubWeight/stealLevel/noteCadence）
//    2. 钳制：越界但容忍内 → 收敛到边界
//    3. 回退：超出容忍 → 返回 null（保护 Solver）
//    4. 无效决策/空决策 → null
//    5. disabled → null
//    6. 统计：activations / fallbacks / lastReason
//  用法：node scripts/test-strategy-selector.mjs
// ============================================================
import { StrategySelector, TARGET_SOURCE_TO_STRATEGY, KNOB_BOUNDS } from '../core/strategy-selector.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- 1. 有效决策解析 ----
console.log('1) 有效决策解析');
const s = new StrategySelector();
const valid = s.resolve({
  params: {
    targetSource: 'contested',
    hubWeightMult: 1.2,
    stealLevel: 0.6,
    noteCadence: { noteRate: 0.3, fakeRate: 0.7 },
  },
});
assert('返回剖面', valid !== null);
assert('targetStrategy=attack（contested）', valid.targetStrategy === 'attack');
assert('hubWeightMult 正确', valid.hubWeightMult === 1.2);
assert('stealLevel 正确', valid.stealLevel === 0.6);
assert('noteCadence 正确', valid.noteCadence.noteRate === 0.3 && valid.noteCadence.fakeRate === 0.7);

// owned → defend
const ownedP = s.resolve({ params: { targetSource: 'owned', hubWeightMult: 1.0 } });
assert('owned → defend', ownedP && ownedP.targetStrategy === 'defend');
// weakest → attack
const weakP = s.resolve({ params: { targetSource: 'weakest', hubWeightMult: 1.0 } });
assert('weakest → attack', weakP && weakP.targetStrategy === 'attack');

// ---- 2. 钳制 ----
console.log('2) 钳制到边界');
const clampS = new StrategySelector();
const over = clampS.resolve({
  targetSource: 'contested',
  params: { hubWeightMult: 1.6, stealLevel: 1.0 }, // 分别超边界 1.45/0.9
});
assert('hubWeightMult 钳到 1.45', over && over.hubWeightMult === 1.45);
assert('stealLevel 钳到 0.9', over && over.stealLevel === 0.9);
assert('in-bounds 值原样保留', clampS.resolve({
  targetSource: 'owned', params: { hubWeightMult: 0.9, stealLevel: 0.2 },
}).stealLevel === 0.2);

// ---- 3. 回退（超出容忍）----
console.log('3) 超出容忍回退');
const fallbackS = new StrategySelector();
assert('hubWeightMult=5.0 回退', fallbackS.resolve({
  params: { targetSource: 'contested', hubWeightMult: 5.0 },
}) === null);
assert('lastReason=hub_out_of_bounds', fallbackS.getLastReason() === 'hub_out_of_bounds');
assert('stealLevel=-2 回退', fallbackS.resolve({
  params: { targetSource: 'contested', stealLevel: -2 },
}) === null);
assert('noteRate=3 回退', fallbackS.resolve({
  params: { targetSource: 'contested', noteCadence: { noteRate: 3 } },
}) === null);

// ---- 4. 无效/空决策 ----
console.log('4) 无效/空决策');
const invalidS = new StrategySelector();
assert('null 决策 → null', invalidS.resolve(null) === null);
assert('空 params → null', invalidS.resolve({ params: {} }) === null);
assert('未知 source 且无旋钮 → null', invalidS.resolve({
  params: { targetSource: 'unknown_source' },
}) === null);

// ---- 5. disabled ----
console.log('5) disabled');
const disS = new StrategySelector({ enabled: false });
assert('disabled 返回 null', disS.resolve({
  params: { targetSource: 'contested', hubWeightMult: 1.0 },
}) === null);
assert('lastReason=disabled', disS.getLastReason() === 'disabled');
disS.setEnabled(true);
assert('重新启用后可解析', disS.resolve({
  params: { targetSource: 'contested', hubWeightMult: 1.0 },
}) !== null);

// ---- 6. 统计 ----
console.log('6) 统计');
let stats = invalidS.getStats();
assert('activations ≥ 0', stats.activations >= 0);
assert('fallbacks 计数', stats.fallbacks > 0);

// ---- 7. 常量完整性 ----
console.log('7) 常量完整性');
assert('映射表覆盖 4 种 targetSource',
  Object.keys(TARGET_SOURCE_TO_STRATEGY).length === 4);
for (const knob in KNOB_BOUNDS) {
  const [lo, hi] = KNOB_BOUNDS[knob];
  assert(`${knob} 边界 lo<hi`, lo < hi);
}

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);