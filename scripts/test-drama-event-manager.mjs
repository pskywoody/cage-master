// ============================================================
//  test-drama-event-manager.mjs - CM4-R5 DramaEventManager 验证
// ============================================================
//  验证：
//    1. 基本生成/过期：trySpawnGhost 成功，过期后自动移除
//    2. 阶段窗口：opening < development < crisis < climax
//    3. 冷却机制：连续调用受 cooldown 限制
//    4. 数量上限：超过 maxGhosts 不再生成
//    5. 手动移除：removeGhost 清理定时器
//    6. selectConflictCandidates：只返回空格
//  用法：node scripts/test-drama-event-manager.mjs
// ============================================================
import { DramaEventManager, DRAMA_EVENTS, GHOST_LIFETIME_BY_PHASE, selectConflictCandidates } from '../core/drama-event-manager.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---- 1. 基本生成/过期 ----
console.log('1) 基本生成与过期');
let added = 0, removed = 0, events = [];
const mgr = new DramaEventManager({
  addGhost: () => { added++; },
  removeGhost: () => { removed++; },
  onEvent: (e, d) => { events.push({ event: e, data: d }); },
  cooldown: 0, // 测试用 0 冷却
});

const result = mgr.trySpawnGhost({
  side: 'boss',
  phase: 'development',
  candidateCells: [{ r: 1, c: 1 }],
});
assert('生成成功', result !== null);
assert('返回正确坐标', result && result.r === 1 && result.c === 1);
assert('addGhost 被调用', added === 1);
assert('活跃数 = 1', mgr.getActiveCount() === 1);
assert('boss 侧活跃数 = 1', mgr.getActiveCount('boss') === 1);
assert('GHOST_SPAWNED 事件触发', events.some(e => e.event === DRAMA_EVENTS.GHOST_SPAWNED));
assert('durationMs 符合 development (8s)', result && result.durationMs === 8000);

// 手动移除
const rmOk = mgr.removeGhost(1, 1, 'boss');
assert('手动移除成功', rmOk === true);
assert('移除后活跃数 = 0', mgr.getActiveCount() === 0);
assert('removeGhost 被调用', removed === 1);
assert('GHOST_EXPIRED 事件触发', events.some(e => e.event === DRAMA_EVENTS.GHOST_EXPIRED));

// ---- 2. 阶段窗口时长 ----
console.log('2) 阶段窗口时长');
const phases = ['opening', 'development', 'crisis', 'climax'];
const expected = { opening: 5000, development: 8000, crisis: 10000, climax: 12000 };
for (const p of phases) {
  const m = new DramaEventManager({ addGhost: () => {}, removeGhost: () => {}, cooldown: 0 });
  const r = m.trySpawnGhost({ side: 'player', phase: p, candidateCells: [{ r: 0, c: 0 }] });
  assert(`${p} 窗口 = ${expected[p]}ms`, r && r.durationMs === expected[p]);
  m.clearAll();
}

// ---- 3. 冷却机制 ----
console.log('3) 冷却机制');
const cooldownMgr = new DramaEventManager({
  addGhost: () => {}, removeGhost: () => {}, cooldown: 1000,
});
const r1 = cooldownMgr.trySpawnGhost({ side: 'boss', phase: 'opening', candidateCells: [{ r: 0, c: 0 }] });
assert('第一次成功', r1 !== null);
const r2 = cooldownMgr.trySpawnGhost({ side: 'boss', phase: 'opening', candidateCells: [{ r: 1, c: 1 }] });
assert('冷却期内第二次失败', r2 === null);
cooldownMgr.clearAll();

// ---- 4. 数量上限 ----
console.log('4) 数量上限');
const capMgr = new DramaEventManager({
  addGhost: () => {}, removeGhost: () => {}, cooldown: 0, maxGhosts: 2,
});
const cells = [{ r: 0, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 2 }];
let count = 0;
for (let i = 0; i < cells.length; i++) {
  if (capMgr.trySpawnGhost({ side: 'boss', phase: 'opening', candidateCells: [cells[i]] })) count++;
}
assert(`最多生成 2 个（maxGhosts=2）`, count === 2 && capMgr.getActiveCount('boss') === 2);
capMgr.clearAll();

// ---- 5. clearAll ----
console.log('5) clearAll 清理');
const clearMgr = new DramaEventManager({
  addGhost: () => {}, removeGhost: () => {}, cooldown: 0,
});
clearMgr.trySpawnGhost({ side: 'boss', phase: 'opening', candidateCells: [{ r: 0, c: 0 }] });
clearMgr.trySpawnGhost({ side: 'player', phase: 'opening', candidateCells: [{ r: 1, c: 1 }] });
assert('清理前 2 个', clearMgr.getActiveCount() === 2);
clearMgr.clearAll();
assert('清理后 0 个', clearMgr.getActiveCount() === 0);

// ---- 6. selectConflictCandidates ----
console.log('6) selectConflictCandidates');
// 模拟一个 3x3 棋盘（仅测试结构）
const mockBoard = {
  size: 3,
  cells: [
    [{ fixedNum: 1 }, {}, {}],
    [{}, { fillNum: 5 }, {}],
    [{}, {}, { isAiFilled: true }],
  ],
};
const mockTpl = {
  getHubProgress: () => [
    { playerDims: 2, bossDims: 2 }, // 完全平衡，冲突度最高
    { playerDims: 3, bossDims: 1 }, // 不平衡
    { playerDims: 1, bossDims: 0 }, // 极不平衡
  ],
  getHubBlocks: () => [0, 1, 2], // 3 个据点 = 3 个宫（3x3 每宫 1 格... 实际 3x3 没有宫，仅测试）
};
// 3x3 棋盘的 boxH/boxW 计算：size=6 用 2x3，size=9 用 3x3
// size=3 的话 boxH=2, boxW=1.5（不对），所以这个 mock 仅测试函数不崩溃
const cands = selectConflictCandidates(mockTpl, mockBoard, 1, 3);
assert('返回数组', Array.isArray(cands));
assert('候选都是空格', cands.every(c => {
  const cell = mockBoard.cells[c.r][c.c];
  return !cell.fixedNum && !cell.fillNum && !cell.isAiFilled;
}));

// ---- 7. 禁用状态 ----
console.log('7) 禁用状态');
const disabledMgr = new DramaEventManager({ addGhost: () => {}, removeGhost: () => {}, cooldown: 0 });
disabledMgr.setEnabled(false);
const rd = disabledMgr.trySpawnGhost({ side: 'boss', phase: 'opening', candidateCells: [{ r: 0, c: 0 }] });
assert('禁用时不生成', rd === null);
disabledMgr.setEnabled(true);
const re = disabledMgr.trySpawnGhost({ side: 'boss', phase: 'opening', candidateCells: [{ r: 0, c: 0 }] });
assert('恢复后可生成', re !== null);
disabledMgr.clearAll();

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);