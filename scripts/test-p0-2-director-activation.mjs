// P0-2 验证：TplBattleController 激活模式（directorShadow:false）下 Director 真正创建并调制
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

import { TplBattleController } from '../core/tpl-battle-controller.js';
import { BOSS_CONFIGS } from '../core/battle-manager.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels/level-109.json'), 'utf8'));
const events = [];
const ctrl = new TplBattleController({
  onEvent: (ev, data) => events.push([ev, data]),
  directorShadow: false, // P0-2 激活路径
});

const { HeadlessEngine } = await import('../core/headless-engine.js');
const engine = new HeadlessEngine();
engine.loadLevel(levelData);
const board = engine.getBoard();
const opponent = BOSS_CONFIGS[1]; // 第一章 Boss

assert('controller 构造成功', !!ctrl);
assert('directorShadow=false 生效', ctrl._directorShadow === false, 'actual=' + ctrl._directorShadow);

const ok = ctrl.start({ board, solution: levelData.solution, opponent, onEnd: () => {} });
assert('start 成功', ok === true);

// 激活模式下 Director 必须被创建（原 bug：shadow=false 不创建）
assert('Director 已创建（激活模式）', !!ctrl._director, 'director=' + ctrl._director);
assert('Director 未启用 shadow 记录', ctrl._director.getShadowLog ? ctrl._director.getShadowLog().length === 0 : true);

// AI 走几步后，决策应非空且通过 StrategySelector 调制
for (let i = 0; i < 5; i++) {
  ctrl._aiMove();
}
const dec = ctrl.getDirectorDecision();
assert('激活模式决策非空', !!dec && dec.strategyId, dec ? 'strategy=' + dec.strategyId : 'null');
const stats = ctrl._ai.getStrategySelectorStats ? ctrl._ai.getStrategySelectorStats() : null;
assert('StrategySelector 已启用', stats && stats.enabled === true, stats ? 'enabled=' + stats.enabled : 'no stats');
assert('激活产生调制（activations>0 或决策含 params）', (stats && stats.activations > 0) || (dec && dec.params && dec.params.hubWeightMult != null));

// 事件管线完整
const battleStart = events.some(([ev]) => ev === 'tpl_battle_start');
assert('BATTLE_START 事件发出', battleStart);

ctrl.stop();
console.log(`\nP0-2 激活路径验证: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
