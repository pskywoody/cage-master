// ============================================================
//  test-r7-drama-active.mjs - CM4-R7 DramaEvent Active 验证
// ============================================================
//  验证：
//    A. planPollutionGhost 纯函数（选据点）
//       - 空/无污染 → null
//       - 无 stage≥minStage → null
//       - stage2 → 选中该据点
//       - stage 优先、heat 次之（确定性）
//       - avoidHubs 排除
//    B. PollutionGhostDriver（连续争夺累加器）
//       - 未达连续阈值 → null
//       - 达阈值 → 返回目标 + turns
//       - 脱离决胜污染 → 复位
//       - reset 清空
//    C. 控制器级 _drivePollutionGhost（集成）
//       - 幽灵只落在冲突（污染）据点宫
//       - 幽灵只占空格，不覆盖玩家格
//       - 触发 POLLUTION_WARNING 事件
//  用法：node scripts/test-r7-drama-active.mjs
// ============================================================
import { planPollutionGhost, PollutionGhostDriver } from '../core/drama-pollution.js';
import { computePollution } from '../core/battle-context.js';
import { DramaEventManager, selectCandidatesForHub } from '../core/drama-event-manager.js';
import { TplBattleController } from '../core/tpl-battle-controller.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- A. planPollutionGhost 纯函数 ----------
console.log('A) 污染选据点');
assert('null pollution → null', planPollutionGhost({ pollution: null }) === null);
assert('空 active → null', planPollutionGhost({ pollution: { active: [] } }) === null);

const p_stage1 = { active: [{ hubIndex: 0, stage: 1, heat: 2 }] };
assert('唯 stage1 且 minStage=2 → null', planPollutionGhost({ pollution: p_stage1 }) === null);

const p_stage2 = { active: [{ hubIndex: 1, stage: 2, heat: 3 }] };
const a2 = planPollutionGhost({ pollution: p_stage2 });
assert('stage2 → 选中 hub1', a2 && a2.hubIndex === 1, `actual=${a2 && a2.hubIndex}`);

// stage 优先于 heat
const p_mix = { active: [
  { hubIndex: 0, stage: 1, heat: 3 },
  { hubIndex: 1, stage: 2, heat: 2 },
  { hubIndex: 2, stage: 2, heat: 3 },
] };
const a3 = planPollutionGhost({ pollution: p_mix });
assert('两个 stage2 取 heat 高的 hub2', a3 && a3.hubIndex === 2, `actual=${a3 && a3.hubIndex}`);

// avoidHubs 排除
const p_avoid = { active: [{ hubIndex: 1, stage: 2, heat: 3 }] };
assert('avoid hub1 → null', planPollutionGhost({ pollution: p_avoid, avoidHubs: [1] }) === null);

// 确定性：同输入两次同结果
const a4a = planPollutionGhost({ pollution: p_mix });
const a4b = planPollutionGhost({ pollution: p_mix });
assert('确定性：两次同结果', a4a.hubIndex === a4b.hubIndex);

// ---------- B. PollutionGhostDriver ----------
console.log('B) 连续争夺累加器');
const driver = new PollutionGhostDriver({ minStage: 2, minTurns: 3 });
const p_cont = { active: [{ hubIndex: 0, stage: 2, heat: 3 }] };
assert('第1步 → null', driver.tick(p_cont) === null);
assert('第2步 → null', driver.tick(p_cont) === null);
const b3 = driver.tick(p_cont);
assert('第3步 → 触发 hub0 turns=3', b3 && b3.hubIndex === 0 && b3.turns === 3, `actual=${b3 && JSON.stringify(b3)}`);

// 脱离决胜污染 → 复位
const p_clean = { active: [] };
assert('脱离污染复位后 → null', driver.tick(p_clean) === null);
assert('复位后 streak 清空', Object.keys(driver.getStreaks()).length === 0);

// reset
const driver2 = new PollutionGhostDriver({ minStage: 2, minTurns: 3 });
driver2.reset();
assert('reset 后 streak 空', Object.keys(driver2.getStreaks()).length === 0);
assert('reset 后 tick 重计 → null', driver2.tick(p_cont) === null);

// ---------- C. 控制器级集成 ----------
console.log('C) _drivePollutionGhost 集成');
// 构造 9x9 mock 棋盘：hub0 宫(rows0-2,cols0-2) 内，(0,0) 为玩家已填格，其余空格
const size = 9;
const cells = [];
for (let r = 0; r < size; r++) {
  const row = [];
  for (let c = 0; c < size; c++) row.push({});
  cells.push(row);
}
cells[0][0].fillNum = 5; // 玩家已填格（断言幽灵不覆盖它）
const board = { size, cells };
const hubBlocks = [0, 4, 8];

// 构造污染上下文：hub0 双方争夺且接近决胜（heat3 → stage2）
const conflictCtx = {
  tpl: {
    hubs: [
      { playerDims: 3, bossDims: 2, visible: true },
      { playerDims: 0, bossDims: 0, visible: true },
      { playerDims: 0, bossDims: 0, visible: true },
    ],
    hubBlocks,
    castleHubIdx: 1,
  },
  drama: { phase: 'crisis' },
};
const heat = { levels: [3, 0, 0], max: { index: 0, level: 3 }, castleIndex: 1 };
const pollution = computePollution(conflictCtx, heat);
assert('集成：阵地污染 stage2', pollution.stages[0] === 2, `actual=${pollution.stages[0]}`);

// 用真实 DramaEventManager + 控制器（覆盖 getContext 返回冲突上下文）
const ctrl = new TplBattleController({ onEvent: () => {}, directorShadow: true });
const ghosts = [];
const drama = new DramaEventManager({
  addGhost: (r, c, side) => ghosts.push({ r, c, side }),
  removeGhost: () => {},
  onEvent: () => {},
  cooldown: 0,
  maxGhosts: 5,
});
drama.setEnabled(true);
ctrl._drama = drama;
ctrl._pollutionDriver = new PollutionGhostDriver({ minStage: 2, minTurns: 3 });
ctrl._tpl = { getHubBlocks: () => hubBlocks };
ctrl._board = board;
ctrl.getContext = () => conflictCtx;

// 前 2 步累计，第 3 步出幽灵
ctrl._drivePollutionGhost();
ctrl._drivePollutionGhost();
ctrl._drivePollutionGhost();
assert('集成：3 步后生成幽灵', ghosts.length === 1, `actual=${ghosts.length}`);
if (ghosts[0]) {
  const g = ghosts[0];
  assert('幽灵归属 boss（玩家可抢）', g.side === 'boss', `actual=${g.side}`);
  assert('幽灵落在冲突据点宫(rows0-2,cols0-2)', g.r >= 0 && g.r <= 2 && g.c >= 0 && g.c <= 2, `actual=${g.r},${g.c}`);
  assert('幽灵不覆盖玩家格(0,0)', !(g.r === 0 && g.c === 0), `actual=${g.r},${g.c}`);
}

// 事件验证：POLLUTION_WARNING 触发
let warned = null;
const ctrl2 = new TplBattleController({ onEvent: () => {}, directorShadow: true });
const evts = [];
ctrl2._onEvent = (type, data) => { if (type === 'tpl_pollution_warning') warned = data; evts.push(type); };
const drama2 = new DramaEventManager({ addGhost: () => {}, removeGhost: () => {}, onEvent: () => {}, cooldown: 0, maxGhosts: 5 });
drama2.setEnabled(true);
ctrl2._drama = drama2;
ctrl2._pollutionDriver = new PollutionGhostDriver({ minStage: 2, minTurns: 3 });
ctrl2._tpl = { getHubBlocks: () => hubBlocks };
ctrl2._board = board;
ctrl2.getContext = () => conflictCtx;
ctrl2._drivePollutionGhost();
ctrl2._drivePollutionGhost();
ctrl2._drivePollutionGhost();
assert('触发 POLLUTION_WARNING 事件', warned !== null);
assert('警告含 hubIndex=0', warned && warned.hubIndex === 0, `actual=${warned && warned.hubIndex}`);
assert('警告含 stage=2', warned && warned.stage === 2, `actual=${warned && warned.stage}`);

// 禁用时不出幽灵（对 ctrl 本身禁用）
const before = ghosts.length;
ctrl._drama.setEnabled(false);
ctrl._pollutionDriver.reset();
ctrl._drivePollutionGhost(); ctrl._drivePollutionGhost(); ctrl._drivePollutionGhost();
assert('禁用后不再生成', ghosts.length === before, `actual=${ghosts.length}`);

// selectCandidatesForHub 只选空格
const cands = selectCandidatesForHub({ getHubBlocks: () => hubBlocks }, board, 0, 4);
assert('候选只含空格(不含(0,0))', cands.every(c => !(c.r === 0 && c.c === 0)));
assert('候选都在 hub0 宫', cands.every(c => c.r >= 0 && c.r <= 2 && c.c >= 0 && c.c <= 2));

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);