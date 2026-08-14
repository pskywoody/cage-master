// ============================================================
//  test-r65-presentation.mjs - CM4-R6.5 呈现计算逻辑验证
// ============================================================
//  验证：
//    A. computeHubHeat 热度分级（0-3）
//       - 无人关注 → 0
//       - 单方推进 → 1
//       - 双方争夺 → 2
//       - 接近成线/决胜 → 3
//       - 隐藏据点 → 0（不泄露信息）
//       - 城堡据点加权
//    B. detectAIPressure 连续聚焦压力检测
//       - 空 history → null
//       - 连续聚焦一个据点 → pressure ≥ 1 且指向该据点
//       - 无据点聚焦 → null
//  用法：node scripts/test-r65-presentation.mjs
// ============================================================
import { computeHubHeat, detectAIPressure, computePollution } from '../core/battle-context.js';
import { HeadlessEngine } from '../core/headless-engine.js';
import { TplBattleController } from '../core/tpl-battle-controller.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

// 构造 ctx：3 个据点（0/1/2），城堡=1
function makeCtx(hubStates, castleIdx = 1) {
  return {
    tpl: {
      castleHubIdx: castleIdx,
      hubs: hubStates.map((s) => ({
        visible: s.visible !== false,
        playerDims: s.playerDims || 0,
        bossDims: s.bossDims || 0,
      })),
    },
  };
}

// ---- A. computeHubHeat ----
console.log('A) Hub Heat 分级');
// 无人关注
const a0 = computeHubHeat(makeCtx([
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]));
assert('无人关注 → 全部 0', a0.levels.every(l => l === 0));

// 单方推进
const a1 = computeHubHeat(makeCtx([
  { playerDims: 2, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]));
assert('单方推进(2,0) → 1', a1.levels[0] === 1, `actual=${a1.levels[0]}`);

// 双方争夺
const a2 = computeHubHeat(makeCtx([
  { playerDims: 1, bossDims: 1 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]));
assert('双方争夺(1,1) → 2', a2.levels[0] === 2, `actual=${a2.levels[0]}`);

// 接近成线（2+ 维，双方争夺）
const a3 = computeHubHeat(makeCtx([
  { playerDims: 1, bossDims: 2 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]));
assert('争夺且接近成线(1,2) → 3', a3.levels[0] === 3, `actual=${a3.levels[0]}`);

// 决胜：一方占满 3 维
const a4 = computeHubHeat(makeCtx([
  { playerDims: 3, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]));
assert('占满 3 维 → 3', a4.levels[0] === 3, `actual=${a4.levels[0]}`);

// 隐藏据点 → 0
const a5 = computeHubHeat(makeCtx([
  { playerDims: 2, bossDims: 2, visible: false },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]));
assert('隐藏据点 → 0（不泄露信息）', a5.levels[0] === 0, `actual=${a5.levels[0]}`);

// 城堡据点自然产生热度，并在结果中暴露 castleIndex 供 UI 高亮胜负关键
const a6 = computeHubHeat(makeCtx([
  { playerDims: 1, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
], 0));
assert('城堡据点单方推进 → 至少 1', a6.levels[0] >= 1, `actual=${a6.levels[0]}`);
assert('结果暴露 castleIndex=0', a6.castleIndex === 0, `actual=${a6.castleIndex}`);

// max 指向热度最高据点
const a7 = computeHubHeat(makeCtx([
  { playerDims: 1, bossDims: 1 },
  { playerDims: 0, bossDims: 3 },
  { playerDims: 0, bossDims: 0 },
], 0));
assert('max 指向决胜据点 index=1', a7.max.index === 1, `actual=${a7.max.index}`);

// ---- B. detectAIPressure ----
console.log('B) Threat Preview');
assert('空 focusStreak → null', detectAIPressure(makeCtx([]), []) === null);
assert('undefined focusStreak → null', detectAIPressure(makeCtx([]), undefined) === null);

// 连续聚焦据点 0
const ctxB = makeCtx([
  { playerDims: 1, bossDims: 1 },
  { playerDims: 0, bossDims: 0 },
  { playerDims: 0, bossDims: 0 },
]);
const b1 = detectAIPressure(ctxB, [
  { hubIndex: 0 }, { hubIndex: 0 }, { hubIndex: 0 },
]);
assert('检测到聚焦据点 0', b1 && b1.hubIndex === 0);
assert('pressure ≥ 1', b1 && b1.pressure >= 1, `actual=${b1 && b1.pressure}`);
assert('streak=3', b1 && b1.streak === 3, `actual=${b1 && b1.streak}`);

// 聚焦但 hubIndex=-1（无据点）→ null
const b2 = detectAIPressure(ctxB, [{ hubIndex: -1 }, { hubIndex: -1 }]);
assert('无据点聚焦 → null', b2 === null);

// 散点（不同据点）→ 指向最后一个且 pressure 较低
const b3 = detectAIPressure(ctxB, [
  { hubIndex: 0 }, { hubIndex: 1 }, { hubIndex: 0 },
]);
assert('散点聚焦仍指向最后据点 0', b3 && b3.hubIndex === 0);
assert('散点 streak=2', b3 && b3.streak === 2, `actual=${b3 && b3.streak}`);

// ---- C. 控制器级 getPresentation 冒烟 —— 验证 UI 实际消费的呈现视图 ----
console.log('C) getPresentation 控制器视图');
const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels/level-109.json'), 'utf8'));
const engine = new HeadlessEngine();
engine.loadLevel(levelData);
const board = engine.getBoard();
const solution = levelData.solution;
const ctrl = new TplBattleController({ onEvent: () => {}, directorShadow: true });
ctrl.start({
  board, solution,
  opponent: { id: 'yan', name: '阿妍', speedMin: 0, speedMax: 0, personality: 'expert' },
  onEnd: () => {},
});
const pres = ctrl.getPresentation();
assert('getPresentation 返回对象', pres && typeof pres === 'object');
assert('含 heat.levels 数组', pres && Array.isArray(pres.heat.levels));
assert('heat.levels 分级在 0-3', pres.heat.levels.every(l => l >= 0 && l <= 3));
assert('heat 暴露 castleIndex', typeof pres.heat.castleIndex === 'number');
assert('threat 为 null 或对象', pres.threat === null || typeof pres.threat === 'object');
assert('threat 有 hubIndex 字段', pres.threat === null || 'hubIndex' in pres.threat);
assert('含 pollution.stages 数组', pres && Array.isArray(pres.pollution.stages));
assert('pollution.stages 分级在 0-2', pres.pollution.stages.every(s => s >= 0 && s <= 2));
assert('pollution.cells 为对象', pres.pollution && typeof pres.pollution.cells === 'object');
assert('pollution.active 为数组', Array.isArray(pres.pollution.active));
ctrl.stop();

// ---- D. Pollution 污染分级（R6.5B-1）----
console.log('D) Pollution 污染分级');
// 构造 9x9 全空格棋盘 mock（块 0/4/8；boxH=3, boxW=3）
function makePollutionCtx(levels, hubBlocks, size, filledSet) {
  const cells = [];
  for (let r = 0; r < size; r++) {
    const row = [];
    for (let c = 0; c < size; c++) {
      row.push(filledSet && filledSet.has(r + ',' + c) ? { fillNum: 1 } : {});
    }
    cells.push(row);
  }
  return { board: { size, cells }, tpl: { hubBlocks, hubs: [] } };
}
const d0 = computePollution(makePollutionCtx(null, [0, 4, 8], 9), { levels: [0, 0, 0] });
assert('无热度 → 无污染', d0.stages.every(s => s === 0) && Object.keys(d0.cells).length === 0);
const d1 = computePollution(makePollutionCtx(null, [0, 4, 8], 9), { levels: [2, 0, 0] });
assert('heat2 → stage1', d1.stages[0] === 1 && d1.stages[1] === 0);
assert('stage1 污染块0空格', Object.keys(d1.cells).length > 0);
assert('active 含 hub0 stage1', d1.active.some(a => a.hubIndex === 0 && a.stage === 1));
const d2 = computePollution(makePollutionCtx(null, [0, 4, 8], 9), { levels: [3, 0, 0] });
assert('heat3 → stage2', d2.stages[0] === 2);
assert('active hub0 stage2', d2.active.some(a => a.hubIndex === 0 && a.stage === 2));
const d3 = computePollution(makePollutionCtx(null, [0, 4, 8], 9, new Set(['0,0'])), { levels: [3, 0, 0] });
assert('已填格不污染', d3.cells['0,0'] === undefined);
assert('未填格被污染(stage2)', d3.cells['0,1'] === 2, `actual=${d3.cells['0,1']}`);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);