// ============================================================
//  test-r7a-drama-director.mjs - CM4-R7-A Drama Director 验证
// ============================================================
//  验证：
//    A. planPressureBeat 纯函数（Pressure 节拍检测）
//       - 空 history → null
//       - 连续聚焦未达阈值 → null
//       - 连续聚焦达阈值 → shift_pressure 指令，targetHub ≠ fromHub
//       - 跳过 boss 已占领据点选目标
//       - 无处施压（其余全被 boss 占）→ null
//    B. DramaPlanner 类（滚动历史 + 状态累积）
//       - recordFocus/plan 累积历史
//       - 未达阈值返回 null，达阈值返回指令
//       - 滚动窗口上限 + reset
//    C. Director 消费层（decide 并入 targetHub）
//       - 带 drama 指令 → decision.drama.targetHub 一致且并入 params.targetHub
//       - 无 drama 指令 → decision.drama 缺省、params.targetHub 缺省
//  用法：node scripts/test-r7a-drama-director.mjs
// ============================================================
import { planPressureBeat, DramaPlanner } from '../core/drama-planner.js';
import { Director } from '../core/director.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// ---------- A. planPressureBeat 纯函数 ----------
console.log('A) Pressure 节拍检测');
assert('空 history → null', planPressureBeat({ focusHistory: [] }) === null);
assert('undefined history → null', planPressureBeat({ focusHistory: undefined }) === null);

// 单次聚焦不触发
const a1 = planPressureBeat({ focusHistory: [{ hub: 0, kind: 'attack' }], threshold: 3 });
assert('聚焦 1 次未达阈值 → null', a1 === null);

// 连续聚焦据点 0 三次 → 触发
const hist = [
  { hub: 0, kind: 'defend' },
  { hub: 0, kind: 'defend' },
  { hub: 0, kind: 'defend' },
];
const a2 = planPressureBeat({ focusHistory: hist, hubCount: 3, threshold: 3 });
assert('连续聚焦 3 次 → 触发 beat', a2 && a2.beat === 'shift_pressure', `actual=${a2 && a2.beat}`);
assert('fromHub=0', a2 && a2.fromHub === 0, `actual=${a2 && a2.fromHub}`);
assert('targetHub ≠ fromHub', a2 && a2.targetHub !== 0, `actual=${a2 && a2.targetHub}`);
assert('streak=3', a2 && a2.streak === 3, `actual=${a2 && a2.streak}`);
assert('pressure 在 0-1', a2 && a2.pressure > 0 && a2.pressure <= 1, `actual=${a2 && a2.pressure}`);

// 中断连续（不同据点）不触发
const a3 = planPressureBeat({
  focusHistory: [
    { hub: 0, kind: 'attack' },
    { hub: 1, kind: 'attack' },
    { hub: 0, kind: 'attack' },
  ],
  threshold: 3,
});
assert('尾部非连续(0,1,0) → null', a3 === null);

// 跳过 boss 已占领据点：boss 占 1，选 2
const a4 = planPressureBeat({
  focusHistory: [{ hub: 0 }, { hub: 0 }, { hub: 0 }],
  hubCount: 3,
  hubOwnership: ['', 'boss', ''],
});
assert('跳过 boss 占 1 → targetHub=2', a4 && a4.targetHub === 2, `actual=${a4 && a4.targetHub}`);

// 无处施压：其余全被 boss 占
const a5 = planPressureBeat({
  focusHistory: [{ hub: 0 }, { hub: 0 }, { hub: 0 }],
  hubCount: 3,
  hubOwnership: ['', 'boss', 'boss'],
});
assert('其余全被占 → null', a5 === null);

// 无据点聚焦（hub<0）不触发
const a6 = planPressureBeat({ focusHistory: [{ hub: -1 }, { hub: -1 }, { hub: -1 }], threshold: 3 });
assert('hub<0 → null', a6 === null);

// 单翼（hubCount=1）无处转移
const a7 = planPressureBeat({ focusHistory: [{ hub: 0 }, { hub: 0 }, { hub: 0 }], hubCount: 1 });
assert('单翼 hubCount=1 → null', a7 === null);

// ---------- B. DramaPlanner 类 ----------
console.log('B) DramaPlanner 状态累积');
const plan = new DramaPlanner({ threshold: 3, historyCap: 4 });
const ctx0 = { hubOwnership: ['', '', ''] };
assert('1 次聚焦 → null', plan.plan({ defendingHub: 1 }, ctx0) === null);
assert('2 次聚焦 → null', plan.plan({ defendingHub: 1 }, ctx0) === null);
assert('focusHistory 长度=2', plan.getHistory().length === 2, `actual=${plan.getHistory().length}`);
const d3 = plan.plan({ defendingHub: 1 }, ctx0);
assert('3 次聚焦 → 触发指令', d3 && d3.beat === 'shift_pressure', `actual=${d3 && d3.beat}`);
assert('fromHub=1', d3 && d3.fromHub === 1);
assert('getDirective 返回同一指令', plan.getDirective() === d3);
assert('getHistory 是副本(改不污染)', (() => { const h = plan.getHistory(); h.length = 0; return plan.getHistory().length === 3; })());

// 滚动窗口上限 4
for (let i = 0; i < 5; i++) plan.plan({ attackingHub: 2 }, ctx0);
assert('滚动窗口封顶=4', plan.getHistory().length === 4, `actual=${plan.getHistory().length}`);

// reset
plan.reset();
assert('reset 后 history 清空', plan.getHistory().length === 0);
assert('reset 后 directive=null', plan.getDirective() === null);

// 无聚焦（attackingHub/defendingHub 均 -1）不追踪
const plan2 = new DramaPlanner({ threshold: 3 });
for (let i = 0; i < 3; i++) plan2.plan({ attackingHub: -1, defendingHub: -1 }, ctx0);
assert('无明确焦点不追踪 → null', plan2.getHistory().length === 0 && plan2.getDirective() === null);

// ---------- C. Director 消费层 ----------
console.log('C) Director 并入 targetHub');
const dir = new Director({ personality: 'steady', useScoredPick: false });
const gs = {
  progress: 0.4, selfHubCount: 1, opponentHubCount: 1,
  hubOwnership: ['', '', ''],
  consecutiveErrors: 0,
};
// 带 drama 指令
const dec1 = dir.decide(gs, {}, { stepCount: 5, drama: { beat: 'shift_pressure', targetHub: 2, pressure: 0.8 } });
assert('decision.drama 已附带', dec1 && dec1.drama && dec1.drama.beat === 'shift_pressure');
assert('decision.drama.targetHub=2', dec1 && dec1.drama && dec1.drama.targetHub === 2);
assert('decision.params.targetHub=2', dec1.params && dec1.params.targetHub === 2, `actual=${dec1.params && dec1.params.targetHub}`);

// 无 drama 指令
const dir2 = new Director({ personality: 'steady', useScoredPick: false });
const dec2 = dir2.decide(gs, {}, { stepCount: 5 });
assert('无指令 → decision.drama 缺省', !dec2.drama);
assert('无指令 → params.targetHub 缺省', dec2.params.targetHub === undefined, `actual=${dec2.params.targetHub}`);

// 非法 targetHub（非整数）不并入
const dir3 = new Director({ personality: 'steady', useScoredPick: false });
const dec3 = dir3.decide(gs, {}, { stepCount: 5, drama: { beat: 'shift_pressure', targetHub: 2.5, pressure: 0.8 } });
assert('非整数 targetHub 不并入', dec3.params.targetHub === undefined, `actual=${dec3.params.targetHub}`);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);