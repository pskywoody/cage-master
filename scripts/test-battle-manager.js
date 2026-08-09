// ============================================================
//  test-battle-manager.js - BattleManager 最小构造测试
//  验证：new BattleManager() + 加载 109 关 Boss 数据（第1章 阿妍）
//        + onPlayerFill / onPlayerUndo / 机关锁 / 得分进度
//  运行：node scripts/test-battle-manager.js
// ============================================================
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreUrl = pathToFileURL(path.join(__dirname, '..', 'core', 'battle-manager.js')).href;

const { BattleManager, BOSS_CONFIGS, BATTLE_EVENTS } = await import(coreUrl);

let pass = 0;
let fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}`, extra !== undefined ? extra : ''); }
}

console.log('=== BattleManager 最小构造测试 ===');

// 1. 模块导出检查
console.log('[1] 导出检查');
assert('BattleManager 是 class', typeof BattleManager === 'function' && /class/.test(BattleManager.toString()));
assert('BOSS_CONFIGS 已导出', typeof BOSS_CONFIGS === 'object');
assert('BATTLE_EVENTS 已导出', typeof BATTLE_EVENTS === 'object');
const configKeys = Object.keys(BOSS_CONFIGS);
console.log('    BOSS_CONFIGS 章节:', configKeys.join(', '));
assert('BOSS_CONFIGS 包含 8 章', configKeys.length === 8);
assert('第1章配置含 battleData/lockCells/preDialog/winDialog/warningLines',
  BOSS_CONFIGS[1].battleData && BOSS_CONFIGS[1].battleData.lockCells &&
  BOSS_CONFIGS[1].preDialog && BOSS_CONFIGS[1].winDialog && BOSS_CONFIGS[1].warningLines);
assert('第1章 battleData.lockCells 共 3 个', BOSS_CONFIGS[1].battleData.lockCells.length === 3);
assert('第1章 battleData.levelId === 109', BOSS_CONFIGS[1].battleData.levelId === 109);
assert('第2章 battleTuning.pulseEnabled 已迁移', BOSS_CONFIGS[2].battleTuning?.pulseEnabled === true);
assert('第3章 battleTuning.fakeCells 已迁移', BOSS_CONFIGS[3].battleTuning?.fakeCells?.length === 2);
assert('第4章 battleTuning.regionLocks 已迁移', BOSS_CONFIGS[4].battleTuning?.regionLocks?.length === 3);
assert('第5章 battleTuning.collapseConfig 已迁移', BOSS_CONFIGS[5].battleTuning?.collapseConfig?.stages?.length === 3);

// 2. 构造 BattleManager（Node 无 DOM/localStorage，应自动回退）
console.log('[2] 构造 BattleManager');
const seenEvents = [];
const bm = new BattleManager({
  onEvent: (type, data) => { seenEvents.push(type); },
  logger: { log: () => {}, warn: () => {}, error: () => {} },
});
assert('实例创建成功', bm instanceof BattleManager);
assert('初始未激活', bm.active === false && bm.ended === false);

// 3. 加载 109 关 Boss 数据并启动
console.log('[3] 启动 Boss 战（第1章·阿妍，试炼石 levelId=109，6x6）');
let endResult = null;
bm.start({
  boardData: BOSS_CONFIGS[1].battleData,
  opponent: BOSS_CONFIGS[1],
  onEnd: (res) => { endResult = res; },
});
assert('战斗已激活', bm.active === true);
assert('棋盘尺寸 6x6', bm.size === 6);
assert('totalEmpty 已计算 (>0)', bm.totalEmpty > 0);
assert('winTarget 已计算', bm.winTarget > 0 && bm.winTarget <= bm.totalEmpty);
assert('AI 玩家已初始化（TechRater 驱动）', bm._aiPlayer !== null);
assert('机关锁已初始化（3 个锁）', bm._lockStates.size === 3);
assert('机关锁 cageId A 存在', bm._lockStates.has('A'));
assert('BATTLE_START 事件已触发', seenEvents.includes(BATTLE_EVENTS.BATTLE_START));

// 4. 玩家填数
console.log('[4] onPlayerFill 调用');
const sol = BOSS_CONFIGS[1].battleData.solution;
const empties = [];
for (let r = 0; r < 6; r++) {
  for (let c = 0; c < 6; c++) {
    const cell = bm._board.cells[r][c];
    if (!cell.fixedNum && !cell.fillNum) empties.push({ r, c });
  }
}
assert('存在可填空格', empties.length > 0);

// 模拟真实流程：先写棋盘再通知（与 V3 一致）
for (let i = 0; i < 3; i++) {
  const e = empties[i];
  bm._board.cells[e.r][e.c].fillNum = sol[e.r][e.c];
  bm.onPlayerFill(e.r, e.c, sol[e.r][e.c], true);
}
assert('playerCount === 3', bm.playerCount === 3);
assert('combo.count === 3', bm._combo.count === 3);
assert('correctCount === 3', bm._correctCount === 3);
assert('getPlayerScore() 返回格数（未启用加权）', bm.getPlayerScore() === 3);

// 5. 撤销
console.log('[5] onPlayerUndo 调用');
const undoCell = empties[0];
bm.onPlayerUndo(undoCell.r, undoCell.c);
assert('撤销后 playerCount === 2', bm.playerCount === 2);
assert('撤销后 playerOwned 清除', bm.playerOwned[undoCell.r][undoCell.c] === false);

// 6. 填错重置连击
console.log('[6] 填错处理');
bm.onPlayerFill(empties[1].r, empties[1].c, 9, false); // 错误填数
assert('填错后 combo 重置为 0', bm._combo.count === 0);
assert('playerMistakeCount === 1', bm._playerMistakeCount === 1);

// 7. 机关锁释放：填满笼 A（(0,0)=1, (1,0)=4，和值 5）
console.log('[7] 机关锁机制（第1章）');
bm._board.cells[0][0].fillNum = sol[0][0];
bm.onPlayerFill(0, 0, sol[0][0], true);
bm._board.cells[1][0].fillNum = sol[1][0];
bm.onPlayerFill(1, 0, sol[1][0], true);
const lockA = bm._lockStates.get('A');
assert('笼 A 已解锁（sum=5 填满）', lockA && lockA.released === true);
assert('LOCK_RELEASED 事件已触发', seenEvents.includes(BATTLE_EVENTS.LOCK_RELEASED));

// 8. 得分进度 API
console.log('[8] 得分进度 API');
const progress = bm.getScoreProgress();
assert('getScoreProgress 返回对象', progress && typeof progress === 'object');
assert('scoreProgress.playerPercent 为数字', typeof progress.playerPercent === 'number');
assert('getSpeedMultiplier 可用', typeof bm.getSpeedMultiplier() === 'number');
assert('getCellCategory 可调用', bm.getCellCategory(0, 0) === null || true);
assert('isWeightedScoreEnabled 返回 boolean', typeof bm.isWeightedScoreEnabled() === 'boolean');
assert('getScoreBreakdown 返回对象', typeof bm.getScoreBreakdown() === 'object');
assert('getFakeCells/getLockStates 可调用', Array.isArray(bm.getFakeCells()) && bm.getLockStates() instanceof Map);
assert('hasRegionLocks/hasFakeCells 可调用', typeof bm.hasRegionLocks() === 'boolean' && typeof bm.hasFakeCells() === 'boolean');

// 9. 停止
console.log('[9] 停止战斗');
bm.stop();
assert('停止后 active === false', bm.active === false);
assert('停止后 AI 玩家已清理', bm._aiPlayer === null);

// 10. 事件总线完整性
console.log('[10] 事件统计');
console.log('    收到事件类型数:', new Set(seenEvents).size);
assert('收到至少 3 类事件', new Set(seenEvents).size >= 3);

console.log('========================================');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
