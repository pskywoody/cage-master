// ============================================================
//  test-tpl-director-shadow.mjs - CM4-R2 TplBattleController 集成验证
// ============================================================
//  验证：
//    1. TplBattleController 启动后 Director 已注入（默认 shadow）
//    2. AI think() 后 getDirectorDecision() 返回非空
//    3. 战斗结束后 getDirectorShadowSummary() 有数据
//  用法：node scripts/test-tpl-director-shadow.mjs
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

import { HeadlessEngine } from '../core/headless-engine.js';
import { TplBattleController } from '../core/tpl-battle-controller.js';

let pass = 0, fail = 0;
function assert(name, cond) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

// 加载一个关卡
const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels/level-109.json'), 'utf8'));
const engine = new HeadlessEngine();
engine.loadLevel(levelData);
const board = engine.getBoard();
const solution = levelData.solution;

// 创建 controller
const events = [];
const ctrl = new TplBattleController({
  onEvent: (event, data) => events.push({ event, data }),
  directorShadow: true, // 显式开启
});

const ok = ctrl.start({
  board,
  solution,
  opponent: { id: 'yan', name: '阿妍', speedMin: 0, speedMax: 0, personality: 'expert' },
  onEnd: () => {},
});
assert('controller 启动成功', ok === true);
assert('TPL 已初始化', ctrl.getTpl() !== null);

// 手动触发 AI 思考几步（绕过定时器，直接调内部）
// 先同步状态
ctrl._syncAiState();
const decBefore = ctrl.getDirectorDecision();
// 第一次同步后 AI 还没 think，可能没有决策
assert('getDirectorDecision 存在接口', decBefore === null || typeof decBefore === 'object');

// 模拟几次 AI 落子（手动驱动 think）
let aiMoves = 0;
for (let i = 0; i < 5 && i < 20; i++) {
  if (!ctrl._ai) break;
  ctrl._syncAiState();
  const step = ctrl._ai.think();
  if (!step || step.isNote) continue;
  const res = ctrl._tpl.onAIFill(step.row, step.col, step.num);
  if (!res.success) continue;
  const cell = board.cells[step.row]?.[step.col];
  if (cell) {
    cell.isAiFilled = true;
    cell._aiNum = solution[step.row][step.col];
  }
  aiMoves++;
}
assert(`AI 成功落子 ${aiMoves} 步（≥1）`, aiMoves >= 1);

// 验证 Director 决策有记录
const dec = ctrl.getDirectorDecision();
assert('Director 决策非空', dec !== null && typeof dec === 'object');
assert('决策含 phase', dec && dec.phase != null);
assert('决策含 strategyId', dec && typeof dec.strategyId === 'string');
assert('决策含 params', dec && dec.params && typeof dec.params.hubWeightMult === 'number');

// 验证 Shadow 汇总
const summary = ctrl.getDirectorShadowSummary();
assert('Shadow 汇总非空', summary !== null);
assert('汇总有 total', summary && typeof summary.total === 'number' && summary.total > 0);
assert('汇总有 phaseDist', summary && summary.phaseDist && Object.keys(summary.phaseDist).length > 0);
assert('汇总有 recommendVsActual', summary && summary.recommendVsActual && typeof summary.recommendVsActual.same === 'number');

console.log(`\n结果: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);