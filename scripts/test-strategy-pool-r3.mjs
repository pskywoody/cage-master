// ============================================================
//  test-strategy-pool-r3.mjs - CM4-R3 四维策略评分验证
// ============================================================
//  验证：
//    1. 每个策略的 winValue / dramaValue 字段存在且在 0-1 范围
//    2. _scoreStrategy 返回合理得分（0-1 近似区间）
//    3. 不同人格的得分排序符合预期（如 blind 的 gamble 得分高）
//    4. 不同 phase 下 drama 权重变化符合预期（crisis > opening）
//    5. scored 模式下 shadow 日志含 scores 字段
//  用法：node scripts/test-strategy-pool-r3.mjs
// ============================================================
import { Director, STRATEGY_POOL, PERSONALITY_STRATEGY_BIAS, detectPhase } from '../core/director.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function near(a, b, eps = 1e-9) { return Math.abs(a - b) < eps; }

// ---- 1. 策略池字段完整性 ----
console.log('1) 策略池字段完整性');
const strategyIds = Object.keys(STRATEGY_POOL);
assert('共 7 条策略', strategyIds.length === 7);
for (const id of strategyIds) {
  const s = STRATEGY_POOL[id];
  assert(`${id}.winValue ∈ [0,1]`, typeof s.winValue === 'number' && s.winValue >= 0 && s.winValue <= 1);
  assert(`${id}.dramaValue ∈ [0,1]`, typeof s.dramaValue === 'number' && s.dramaValue >= 0 && s.dramaValue <= 1);
}

// ---- 2. 四维评分模型得分合理性 ----
console.log('2) 四维评分模型得分范围');
const d = new Director({ personality: 'steady', strategyWeights: { win: 0.25, drama: 0.25, person: 0.25, intent: 0.25 } });
const gameState = { progress: 0.5, selfHubCount: 1, opponentHubCount: 1, consecutiveErrors: 0 };
const observer = { analysis: { targetHub: 1, isBeingTargeted: false } };
// 手动设 phase 为 development（_scoreStrategy 依赖 this._phase）
d._phase = 'development';
for (const id of strategyIds) {
  const score = d._scoreStrategy(id, gameState, observer);
  assert(`${id} 得分 ≈ [0.2, 0.8] 合理区间`, score > 0.1 && score < 0.9, `actual=${score.toFixed(3)}`);
}

// ---- 3. 人格偏置对得分的影响 ----
console.log('3) 人格偏置影响');
const blind = new Director({ personality: 'blind' });
blind._phase = 'crisis';
const expert = new Director({ personality: 'expert' });
expert._phase = 'crisis';
const gs2 = { progress: 0.6, selfHubCount: 0, opponentHubCount: 2, consecutiveErrors: 0 }; // 落后
const obs2 = { analysis: { targetHub: -1 } };
const blindGamble = blind._scoreStrategy('gamble', gs2, obs2);
const expertGamble = expert._scoreStrategy('gamble', gs2, obs2);
assert('blind 的 gamble 得分 > expert 的 gamble 得分', blindGamble > expertGamble,
  `blind=${blindGamble.toFixed(3)} vs expert=${expertGamble.toFixed(3)}`);

const blindFortify = blind._scoreStrategy('fortify', gs2, obs2);
const expertFortify = expert._scoreStrategy('fortify', gs2, obs2);
assert('expert 的 fortify 得分 > blind 的 fortify 得分', expertFortify > blindFortify,
  `expert=${expertFortify.toFixed(3)} vs blind=${blindFortify.toFixed(3)}`);

// ---- 4. 阶段对 drama 权重的影响 ----
console.log('4) 阶段 drama 倍率');
const d2 = new Director({ personality: 'steady' });
const gs3 = { progress: 0.1, selfHubCount: 1, opponentHubCount: 1 }; // opening
d2._phase = 'opening';
const sOpen = d2._scoreStrategy('gamble', gs3, { analysis: {} });
d2._phase = 'crisis';
const sCrisis = d2._scoreStrategy('gamble', { progress: 0.6, selfHubCount: 1, opponentHubCount: 1 }, { analysis: {} });
// gamble 的 dramaValue 很高（0.95），crisis 倍率 1.2 > opening 倍率 0.5
assert('crisis 下 gamble 得分 > opening 下得分（drama 驱动）', sCrisis > sOpen,
  `crisis=${sCrisis.toFixed(3)} vs opening=${sOpen.toFixed(3)}`);

// ---- 5. scoredPick 输出含 scores ----
console.log('5) _scoredPick 返回得分表');
const d3 = new Director({ personality: 'steady' });
d3._phase = 'development';
const eligible = ['probe', 'pressure', 'fortify'];
const result = d3._scoredPick(eligible, gameState, observer);
assert('返回 id', typeof result.id === 'string' && eligible.includes(result.id));
assert('返回 scores 含全部候选', result.scores && eligible.every(id => typeof result.scores[id] === 'number'));

// ---- 6. decide() 在 scored 模式下 shadow 日志含 scores ----
console.log('6) decide shadow 日志含 scores');
const d4 = new Director({ personality: 'steady' });
d4.enableShadow();
const dec = d4.decide(
  { progress: 0.3, selfHubCount: 1, opponentHubCount: 1, consecutiveErrors: 0 },
  { analysis: { targetHub: -1 } },
  { stepCount: 1, shadow: true, actualStrategyId: 'pressure' }
);
assert('决策非空', dec && dec.strategyId);
const summary = d4.summarizeShadow();
assert('summary 含 strategyScores', summary.strategyScores && typeof summary.strategyScores === 'object');
assert('strategyScores 有 avg 字段', Object.values(summary.strategyScores).some(s => typeof s.avg === 'number'));

// ---- 7. useScoredPick=false 回退旧版 ----
console.log('7) 回退旧版模式');
const d5 = new Director({ personality: 'steady', useScoredPick: false });
d5.enableShadow();
const dec5 = d5.decide(
  { progress: 0.3, selfHubCount: 1, opponentHubCount: 1, consecutiveErrors: 0 },
  { analysis: {} },
  { stepCount: 1, shadow: true }
);
assert('旧模式也能正常决策', dec5 && dec5.strategyId);
const log5 = d5.getShadowLog()[0];
assert('旧模式 scores 为 null', log5 && log5.scores === null);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);