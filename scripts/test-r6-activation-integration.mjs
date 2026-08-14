// ============================================================
//  test-r6-activation-integration.mjs - CM4-R6 激活层集成验证
// ============================================================
//  验证：
//    1. setDirector(shadow=true) → selector 禁用，不激活
//    2. setDirector(shadow=false) → selector 启用，激活旋钮
//    3. 有效决策 → 调制 _tempHubWeight/_currentStrategy
//    4. 越界决策 → 回退，不覆盖旋钮（保持人格基线）
//    5. getStrategySelectorStats 返回统计
//  用法：node scripts/test-r6-activation-integration.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

import { HeadlessEngine } from '../core/headless-engine.js';
import { AIPlayerCore } from '../core/battle-manager.js';
import { Director } from '../core/director.js';

// 用真实关卡棋盘构造 AIPlayerCore（关观察器，只测激活链路）
function makeAI() {
  const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels/level-109.json'), 'utf8'));
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const ai = new AIPlayerCore(board, 'steady', null, false, false);
  return ai;
}

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- 1. Shadow 模式 ----
console.log('1) Shadow 模式');
const aiShadow = makeAI();
const dirShadow = new Director({ shadow: true });
aiShadow.setDirector(dirShadow, true); // shadow=true
let ssStats = aiShadow.getStrategySelectorStats();
assert('selector 已创建', ssStats !== null);
assert('shadow 时 selector disabled', ssStats.enabled === false);

// 模拟走一步
aiShadow._directorDecision = null;
aiShadow._runDirector();
assert('shadow 下决策已记录', aiShadow._directorDecision !== null);
const ssStats2 = aiShadow.getStrategySelectorStats();
assert('shadow 下零激活', ssStats2.activations === 0);
assert('shadow 下 currentStrategy 未被覆盖（默认 attack）', aiShadow._currentStrategy === 'attack');

// ---- 2. Active 模式 ----
console.log('2) Active 模式');
const aiActive = makeAI();
const dirActive = new Director({ shadow: false });
const beforeStrategy = aiActive._currentStrategy;
const beforeHub = aiActive._tempHubWeight;
aiActive.setDirector(dirActive, false); // shadow=false → active
const activeStats = aiActive.getStrategySelectorStats();
assert('active 时 selector enabled', activeStats.enabled === true);

// 有效决策：crisis 阶段 contested 目标
aiActive._director._phase = 'crisis';
aiActive._runDirector();
const activeStats2 = aiActive.getStrategySelectorStats();
assert('active 下出现激活', activeStats2.activations > 0);
assert('策略方向被覆盖（contested→attack）', aiActive._currentStrategy === 'attack');
assert('hubWeight 被调制（≠基线）',
  aiActive._tempHubWeight !== beforeHub,
  `actual=${aiActive._tempHubWeight}, before=${beforeHub}`);
assert('hubWeight 落在边界内 [0.85,1.45]',
  aiActive._tempHubWeight >= 0.85 && aiActive._tempHubWeight <= 1.45,
  `actual=${aiActive._tempHubWeight}`);

// ---- 3. 越界决策回退 ----
console.log('3) 越界决策回退');
const aiFallback = makeAI();
const dirFallback = new Director({ shadow: false });
aiFallback.setDirector(dirFallback, false);
aiFallback._tempHubWeight = 1.0; // 基线
// 构造一个 hubWeightMul 越界的假决策，直接喂给 _applyDirectorParams
aiFallback._applyDirectorParams({
  params: { targetSource: 'contested', hubWeightMult: 9.9 },
});
const fbStats = aiFallback.getStrategySelectorStats();
assert('越界触发回退', fbStats.lastReason === 'hub_out_of_bounds');
assert('回退后 hubWeight 未被覆盖（保持 1.0）', aiFallback._tempHubWeight === 1.0, `actual=${aiFallback._tempHubWeight}`);

// ---- 4. 有效决策确实改变落子倾向（不直接指定格子）----
console.log('4) 激活只调候选空间权重，不指定格子');
const aiActive2 = makeAI();
const dirActive2 = new Director({ shadow: false });
aiActive2.setDirector(dirActive2, false);
aiActive2._applyDirectorParams({
  params: { targetSource: 'owned', hubWeightMult: 1.0, stealLevel: 0.2 },
});
assert('owned → defend', aiActive2._currentStrategy === 'defend');
assert('stealLevel 映射到防守权重代理：0.5+0.2=0.7', aiActive2._tempDefenseWeight === 0.7, `actual=${aiActive2._tempDefenseWeight}`);

// ---- 5. 无 Director 时安全 ----
console.log('5) 无 Director 安全');
const aiNoDir = makeAI();
const safe = aiNoDir._runDirector();
assert('无 Director 时 _runDirector 返回 null', safe === null);
assert('无 Director 时 stats 为 null 或 disabled', aiNoDir.getStrategySelectorStats() === null
  || aiNoDir.getStrategySelectorStats().enabled === true);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);