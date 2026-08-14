// ============================================================
//  test-battle-context.mjs - CM4-R1 BattleContext 冒烟测试
// ============================================================
//  验证：
//    1. createBattleContext 在空/无 tpl 时安全返回空上下文
//    2. 嵌套视图（board/player/ai/tpl/drama/meta）字段齐全
//    3. 扁平兼容视图与 toGameState 投影一致
//    4. controller 集成：getContext() 返回统一上下文
//  用法：node scripts/test-battle-context.mjs
// ============================================================
import { createBattleContext, toGameState, emptyContext } from '../core/battle-context.js';

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

// ---- 1. 空上下文安全 ----
console.log('1) emptyContext 安全');
const empty = emptyContext();
assert('无嵌套漏洞', empty.player && empty.ai && empty.tpl && empty.drama && empty.meta);
assert('扁平字段默认值', empty.selfHubCount === 0 && empty.progress === 0 && empty.isLeading === null);
assert('空 tpl 时 player.defense 存在', typeof empty.player.defense === 'object');

// ---- 2. 空 tpl 下 createBattleContext 容错 ----
console.log('2) 无 tpl 容错');
const noTpl = createBattleContext({ board: null, totalEmpty: 0 });
assert('返回空上下文而非抛错', noTpl && noTpl.ai && noTpl.tpl);
assert('isLeading 为 null', noTpl.isLeading === null);

// ---- 3. 模拟真实 tpl ----
console.log('3) 模拟 tpl 构建');
const mockTpl = {
  getHubBlocks: () => [0, 4, 8],
  getCastleHubIdx: () => 4,
  getHubProgress: () => [
    { occupiedBy: 'boss', playerDims: 1, bossDims: 3 },
    { occupiedBy: 'player', playerDims: 3, bossDims: 1 },
    { occupiedBy: null, playerDims: 2, bossDims: 2 },
  ],
  getStats: () => ({ playerOwned: 5, aiOwned: 4 }),
  getHubCounts: () => [
    { id: 0, player: 1, boss: 3, occupiedBy: 'boss' },
    { id: 1, player: 3, boss: 1, occupiedBy: 'player' },
    { id: 2, player: 2, boss: 2, occupiedBy: null },
  ],
  isMigrationFailed: () => false,
};
const mockBoard = {
  size: 3,
  cells: [
    [{}, {}, {}],
    [{}, { fillNum: 5 }, {}],
    [{ isAiFilled: true }, {}, {}],
  ],
};
const ctx = createBattleContext({
  tpl: mockTpl,
  board: mockBoard,
  totalEmpty: 9,
  aiConsecutiveCorrect: 3,
  opponent: { id: 'yan', personality: 'expert', difficulty: 2 },
  step: 7,
});
// 据点归属
assert('self(hub2) 1 vs opp(hub2) 1', ctx.selfHubCount === 1 && ctx.opponentHubCount === 1);
assert('isLeading 持平为 null', ctx.isLeading === null);
// 进度
assert('progress = filled/empty', Math.abs(ctx.progress - 2 / 9) < 1e-9);
// 嵌套视图
assert('player.ownedGrid', Array.isArray(ctx.player.ownedGrid) && ctx.player.ownedGrid.length === 3);
assert('ai.ownedGrid', Array.isArray(ctx.ai.ownedGrid) && ctx.ai.ownedGrid[0] === true);
assert('drama.phase development (progress 0.22)', ctx.drama.phase === 'development');
assert('drama.tension 持平 0.5', ctx.drama.tension === 0.5);
assert('meta.personality', ctx.meta.personality === 'expert');
// 扁平视图
assert('hubCounts 投影', ctx.hubCounts.length === 3);
assert('playerDefense 计算', Math.abs(ctx.playerDefense[0] - 0.25) < 1e-9);

// ---- 4. toGameState 投影 ----
console.log('4) toGameState 投影');
const gs = toGameState(ctx);
assert('含 selfHubCount', gs.selfHubCount === 1);
assert('含 hubOwnership', gs.hubOwnership.length === 3);
assert('含 migrationFailed', gs.migrationFailed === false);
assert('含 consecutiveCorrect', gs.consecutiveCorrect === 3);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);