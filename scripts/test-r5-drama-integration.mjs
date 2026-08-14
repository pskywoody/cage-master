// ============================================================
//  test-r5-drama-integration.mjs - CM4-R5 DramaEvent 集成验证
// ============================================================
//  验证：
//    1. TplBattleController 启动后 DramaEventManager 已实例化
//    2. 默认禁用（shadow）：tryDramaGhost 返回 null
//    3. 启用后可生成戏剧幽灵，且出现在 TPL ghost 集合里
//    4. 幽灵只在空格生成（不侵占玩家格）
//    5. 过期后自动从 TPL ghost 集合移除
//  用法：node scripts/test-r5-drama-integration.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

import { HeadlessEngine } from '../core/headless-engine.js';
import { TplBattleController } from '../core/tpl-battle-controller.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels/level-109.json'), 'utf8'));
const engine = new HeadlessEngine();
engine.loadLevel(levelData);
const board = engine.getBoard();
const solution = levelData.solution;

const ctrl = new TplBattleController({
  onEvent: () => {},
  directorShadow: true,
  dramaActive: false, // CM4-R7：本测试验证"禁用路径 + 手工启用"，故关闭自动触发
});

ctrl.start({
  board,
  solution,
  opponent: { id: 'yan', name: '阿妍', speedMin: 0, speedMax: 0, personality: 'expert' },
  onEnd: () => {},
});

// ---- 1. 初始状态 ----
console.log('1) 初始状态');
const drama = ctrl.getDramaManager();
assert('DramaEventManager 已实例化', drama !== null);
assert('默认禁用', drama.isEnabled() === false);

// ---- 2. 禁用时不生成 ----
console.log('2) 禁用时不生成');
const r0 = ctrl.tryDramaGhost({ side: 'boss' });
assert('禁用时 tryDramaGhost 返回 null', r0 === null);
assert('禁用后 TPL ghost 数为 0', ctrl.getTpl().getGhostCells('player').length === 0);

// ---- 3. 启用后生成 ----
console.log('3) 启用后生成戏剧幽灵');
ctrl.setDramaEnabled(true);
// 先让 AI 走几步，产生一些据点进度
for (let i = 0; i < 10; i++) {
  ctrl._syncAiState();
  const step = ctrl._ai.think();
  if (!step || step.isNote) continue;
  const res = ctrl._tpl.onAIFill(step.row, step.col, step.num);
  if (!res.success) continue;
  const cell = board.cells[step.row]?.[step.col];
  if (cell) { cell.isAiFilled = true; cell._aiNum = solution[step.row][step.col]; }
}
// 降低 cooldown 以便测试
ctrl.getDramaManager()._cooldown = 0;

const r1 = ctrl.tryDramaGhost({ side: 'boss', topKHubs: 1 });
assert('启用后可生成', r1 !== null, `actual: ${JSON.stringify(r1)}`);
assert('生成的是空格（不侵占玩家）', r1 && (() => {
  const cell = board.cells[r1.r][r1.c];
  return cell && !cell.fillNum && !cell.isAiFilled;
})());
assert('TPL player 侧 ghost 数 ≥ 1（boss 方的幽灵 = 玩家可抢）',
  ctrl.getTpl().getGhostCells('player').length >= 1);

// ---- 4. 手动移除 ----
console.log('4) 手动移除');
if (r1) {
  const ok = drama.removeGhost(r1.r, r1.c, 'boss');
  assert('removeGhost 成功', ok === true);
  assert('移除后活跃数减少', drama.getActiveCount('boss') === 0);
}

// ---- 5. 过期自动移除 ----
console.log('5) 过期自动移除（短窗口测试）');
const r2 = ctrl.tryDramaGhost({ side: 'boss', durationMs: 50 });
assert('短窗口生成成功', r2 !== null);
assert('生成后活跃数 = 1', drama.getActiveCount('boss') === 1);
setTimeout(() => {
  const active = drama.getActiveCount('boss');
  assert('过期后活跃数 = 0', active === 0, `actual=${active}`);
  ctrl.stop();
  console.log(`\n结果: ${pass} passed, ${fail} failed`);
  process.exit(fail > 0 ? 1 : 0);
}, 200);