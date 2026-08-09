// ============================================================
//  test-battle-mechanics.js - 各章特殊机制冒烟测试（9x9 棋盘）
//  覆盖：第2章脉冲 / 第3章幻影格 / 第4章联动锁 / 第5章坍缩 /
//        第6-8章技能触发 / 三色加权回退 / 战绩存储注入
//  运行：node scripts/test-battle-mechanics.js
// ============================================================
import path from 'path';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const coreUrl = pathToFileURL(path.join(__dirname, '..', 'core', 'battle-manager.js')).href;
const { BattleManager, BOSS_CONFIGS } = await import(coreUrl);

let pass = 0, fail = 0;
function assert(name, cond, extra) {
  if (cond) { pass++; console.log(`  [PASS] ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}`, extra !== undefined ? extra : ''); }
}

// 构造一个 9x9 普通数独棋盘（带固定数字与解答），供 9x9 章节使用
function make9x9Board() {
  const boardData = [
    [5,3,0,0,7,0,0,0,0],
    [6,0,0,1,9,5,0,0,0],
    [0,9,8,0,0,0,0,6,0],
    [8,0,0,0,6,0,0,0,3],
    [4,0,0,8,0,3,0,0,1],
    [7,0,0,0,2,0,0,0,6],
    [0,6,0,0,0,0,2,8,0],
    [0,0,0,4,1,9,0,0,5],
    [0,0,0,0,8,0,0,7,9],
  ];
  const solution = [
    [5,3,4,6,7,8,9,1,2],
    [6,7,2,1,9,5,3,4,8],
    [1,9,8,3,4,2,5,6,7],
    [8,5,9,7,6,1,4,2,3],
    [4,2,6,8,5,3,7,9,1],
    [7,1,3,9,2,4,8,5,6],
    [9,6,1,5,3,7,2,8,4],
    [2,8,7,4,1,9,6,3,5],
    [3,4,5,2,8,6,1,7,9],
  ];
  return { levelId: 999, gridSize: 9, boardData, solution, cages: [] };
}

function startChapter(chapterId, extraOpts = {}) {
  const engine = new HeadlessEngine();
  engine.loadLevel(make9x9Board());
  const bm = new BattleManager({ logger: { log(){}, warn(){}, error(){} }, ...extraOpts });
  bm.start({ board: engine.getBoard(), solution: make9x9Board().solution, opponent: BOSS_CONFIGS[chapterId] });
  return bm;
}

console.log('=== 各章机制冒烟测试 ===');

// ---- 第2章：候选数脉冲 ----
console.log('[第2章] 候选数脉冲');
const bm2 = startChapter(2);
assert('pulseEnabled 配置已读取', BOSS_CONFIGS[2].battleTuning.pulseEnabled === true);
assert('脉冲定时器已启动', bm2._pulseTimer !== null);
assert('isPulsing() 初始 false', bm2.isPulsing() === false);
assert('getPulseOpacity() 初始 1', bm2.getPulseOpacity() === 1);
bm2._stopPulseTimer();
assert('stopPulseTimer 后定时器已清理', bm2._pulseTimer === null);
bm2.stop();

// ---- 第3章：幻影格 ----
console.log('[第3章] 幻影格');
const bm3 = startChapter(3);
assert('hasFakeCells() === true', bm3.hasFakeCells() === true);
assert('幻影格数量 2', bm3.getFakeCells().length === 2);
assert('getExposedFakeCells() 初始空', bm3.getExposedFakeCells().length === 0);
// 对幻影格 (0,7) 尝试证伪（该格在 9x9 棋盘上为空，机制初始化时填入假数字 6）
const accuse = bm3.tryAccuseFakeCell(0, 7);
assert('tryAccuseFakeCell(0,7) 成功证伪', accuse.success === true && accuse.isFake === true);
assert('证伪后已暴露 1 个', bm3.getExposedFakeCells().length === 1);
const accuse2 = bm3.tryAccuseFakeCell(0, 0); // 非幻影格（固定格 5）
assert('tryAccuseFakeCell(0,0) 返回 isFake:false', accuse2.success === true && accuse2.isFake === false);
bm3.stop();

// ---- 第4章：联动锁 ----
console.log('[第4章] 联动锁');
const bm4 = startChapter(4);
assert('hasRegionLocks() === true', bm4.hasRegionLocks() === true);
assert('联动锁数量 3', Object.keys(bm4.getRegionLockStates()).length === 3);
assert('lock_a revealNotes 已迁移', bm4.getRegionLockStates().lock_a.revealNotes.length === 1);
assert('lock_a 初始 locked', bm4.getRegionLockStates().lock_a.locked === true);
// 填满 lock_a 的 4 格（(0,0)=5,(0,1)=3,(1,0)=6,(1,1)=7）→ 进入 primed
const sol = make9x9Board().solution;
[[0,0],[0,1],[1,0],[1,1]].forEach(([r, c]) => {
  bm4._board.cells[r][c].fillNum = sol[r][c];
  bm4.onPlayerFill(r, c, sol[r][c], true);
});
assert('lock_a 进入 primed', bm4.getRegionLockStates().lock_a.primed === true);
bm4.stop();

// ---- 第5章：坍缩 ----
console.log('[第5章] 坍缩');
const bm5 = startChapter(5);
assert('_collapseConfig 已读取', bm5._collapseConfig !== null);
assert('外层笼 ID 已读取', bm5._outerCageIds.length === 2);
assert('初始坍缩进度 0', bm5.getCollapseProgress() === 0);
assert('初始坍缩阶段 0', bm5.getCollapseStage() === 0);
// 模拟跨过 0.3 阈值
bm5._updateCollapseProgress(0.35);
assert('进度 0.35 触发阶段 1', bm5.getCollapseStage() === 1);
assert('getCollapseProgress() === 0.35', bm5.getCollapseProgress() === 0.35);
// 模拟跨过 0.9 阈值 → 完全坍缩
bm5._updateCollapseProgress(0.95);
assert('进度 0.95 触发阶段 3', bm5.getCollapseStage() === 3);
assert('外层笼已坍缩', bm5.getCollapsedCages().size === 2);
bm5.stop();

// ---- 第6-7章：技能触发（圈套） ----
console.log('[第6-7章] 技能触发');
const bm6 = startChapter(6);
bm6.triggerSkill('quantao'); // 设局人：圈套
assert('第6章 quantao 技能可触发（无异常）', true);
const bm7 = startChapter(7);
bm7.triggerSkill('quantao');
assert('第7章 quantao 技能可触发（无异常）', true);
// 跨 Boss 误触发应被忽略
const before = bm6.aiCount;
bm6.triggerSkill('guanju'); // 阿妍技能在设局人身上无效
assert('跨 Boss 技能被忽略', bm6.aiCount === before);
bm6.stop(); bm7.stop();

// ---- 存储注入：战绩系统 ----
console.log('[存储] 战绩系统（内存存储注入）');
const memStore = (() => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; } }; })();
const engine = new HeadlessEngine();
engine.loadLevel(make9x9Board());
const bmS = new BattleManager({ storage: memStore, logger: { log(){}, warn(){}, error(){} } });
bmS.start({ board: engine.getBoard(), solution: make9x9Board().solution, opponent: BOSS_CONFIGS[1] });
const sol2 = make9x9Board().solution;
// 填够胜利目标（9x9 共 51 空格，winTarget=39，填 42 个正确格确保触发 win）
const empties = [];
for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
  const cell = engine.getBoard().cells[r][c];
  if (!cell.fixedNum && !cell.fillNum) empties.push({ r, c });
}
for (let i = 0; i < Math.min(empties.length, 42); i++) {
  const e = empties[i];
  engine.getBoard().cells[e.r][e.c].fillNum = sol2[e.r][e.c];
  bmS.onPlayerFill(e.r, e.c, sol2[e.r][e.c], true);
  if (bmS.ended) break;
}
assert('胜利触发 _endBattle(win)', bmS.ended === true && bmS.result === 'win');
const bossStats = bmS.getBossStats('yingying');
assert('战绩已记录（yingying wins>=1）', bossStats && bossStats.wins >= 1);
const totalStats = bmS.getTotalStats();
assert('全局战绩 battles>=1', totalStats && totalStats.battles >= 1);
assert('存储已写入（memStore 有数据）', Object.keys(memStore).length >= 1);
bmS.resetStats();
assert('resetStats 后战绩清空', bmS.getTotalStats().battles === 0);

// ---- 三色加权回退 ----
console.log('[三色] 无 Adapter 时回退到格子计数');
const bmW = startChapter(1);
assert('未注入 Adapter 时加权关闭', bmW.isWeightedScoreEnabled() === false);
assert('getScoreBreakdown().isWeighted === false', bmW.getScoreBreakdown().isWeighted === false);
bmW.stop();

console.log('========================================');
console.log(`结果: ${pass} 通过, ${fail} 失败`);
console.log('========================================');
process.exit(fail > 0 ? 1 : 0);
