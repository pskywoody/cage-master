// ============================================================
//  test-r4-intent-integration.mjs - CM4-R4 IntentObserver 集成验证
// ============================================================
//  验证：
//    1. TplBattleController 启动后 IntentObserver 已实例化
//    2. 玩家落子后 getPlayerIntent() 返回非空
//    3. BattleContext.player.intent 字段存在且结构正确
//    4. 意图字段（attackingHub/defendingHub/chasingLine/riskLevel/strategy）合理
//  用法：node scripts/test-r4-intent-integration.mjs
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
});

ctrl.start({
  board,
  solution,
  opponent: { id: 'yan', name: '阿妍', speedMin: 0, speedMax: 0, personality: 'expert' },
  onEnd: () => {},
});

// ---- 1. 初始状态 ----
console.log('1) 初始状态');
assert('controller 启动成功', ctrl.active === true);
const intent0 = ctrl.getPlayerIntent();
// 初始时还没有玩家落子，观察器无数据，intent 可能为 null 或初始值
assert('getPlayerIntent 接口可用', intent0 === null || typeof intent0 === 'object');
const ctx0 = ctrl.getContext();
assert('BattleContext 存在', ctx0 !== null && typeof ctx0 === 'object');
assert('player.intent 字段存在（可能为 undefined/对象）',
  'player' in ctx0 && 'intent' in ctx0.player || ctx0.player.intent === undefined);

// ---- 2. 模拟玩家落子（多步，集中在一个据点宫）----
console.log('2) 玩家落子后意图推断');
const hubBlocks = ctrl.getTpl().getHubBlocks();
// 找到第一个据点宫的一个空格
let targetR = -1, targetC = -1;
for (let r = 0; r < board.size && targetR < 0; r++) {
  for (let c = 0; c < board.size && targetR < 0; c++) {
    const cell = board.cells[r][c];
    if (cell && !cell.fixedNum && !cell.fillNum) {
      const boxH = board.size <= 6 ? 2 : 3;
      const boxW = board.size / boxH;
      const blockIdx = Math.floor(r / boxH) * boxH + Math.floor(c / boxW);
      if (hubBlocks.includes(blockIdx)) {
        targetR = r; targetC = c;
      }
    }
  }
}
assert(`找到据点宫空格 (${targetR},${targetC})`, targetR >= 0);

// 模拟玩家连续填几个据点宫的格
let filled = 0;
for (let r = 0; r < board.size && filled < 3; r++) {
  for (let c = 0; c < board.size && filled < 3; c++) {
    const cell = board.cells[r][c];
    if (cell && !cell.fixedNum && !cell.fillNum) {
      const boxH = board.size <= 6 ? 2 : 3;
      const boxW = board.size / boxH;
      const blockIdx = Math.floor(r / boxH) * boxH + Math.floor(c / boxW);
      if (hubBlocks.includes(blockIdx)) {
        const num = solution[r][c];
        engine.fillCell(r, c, num); // 先让 engine 落子
        ctrl.onPlayerFill(r, c, num, true);
        filled++;
      }
    }
  }
}
assert(`玩家填了 ${filled} 个据点宫格`, filled >= 2);

// 再让 AI 走几步，触发同步
for (let i = 0; i < 3; i++) {
  ctrl._syncAiState();
  const step = ctrl._ai.think();
  if (!step || step.isNote) continue;
  const res = ctrl._tpl.onAIFill(step.row, step.col, step.num);
  if (!res.success) continue;
  const cell = board.cells[step.row]?.[step.col];
  if (cell) { cell.isAiFilled = true; cell._aiNum = solution[step.row][step.col]; }
}

const intent = ctrl.getPlayerIntent();
assert('getPlayerIntent 返回对象', intent && typeof intent === 'object');
assert('含 attackingHub 字段', 'attackingHub' in intent);
assert('含 defendingHub 字段', 'defendingHub' in intent);
assert('含 chasingLine 字段', typeof intent.chasingLine === 'boolean');
assert('含 riskLevel 字段 (0-1)', typeof intent.riskLevel === 'number' && intent.riskLevel >= 0 && intent.riskLevel <= 1);
assert('含 strategy 字段', typeof intent.strategy === 'string');
assert('含 confidence 字段 (0-1)', typeof intent.confidence === 'number' && intent.confidence >= 0 && intent.confidence <= 1);

// ---- 3. BattleContext 里的 intent ----
console.log('3) BattleContext 含 player.intent');
const ctx = ctrl.getContext();
assert('ctx.player.intent 存在', ctx.player.intent && typeof ctx.player.intent === 'object');
assert('ctx.player.intent.strategy 与 getPlayerIntent() 一致',
  ctx.player.intent.strategy === intent.strategy);

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);