// 手感修复验证：think() 时间预算 + Boss 节奏动态化
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

import { HeadlessEngine } from '../core/headless-engine.js';
import { AIPlayerCore, BOSS_CONFIGS } from '../core/battle-manager.js';

let pass = 0, fail = 0;
function assert(name, cond, detail) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

// 用真实 9x9 Boss 关构造
const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/levels/level-109.json'), 'utf8'));
const engine = new HeadlessEngine();
engine.loadLevel(levelData);
const board = engine.getBoard();

// 1) think() 时间预算：expert 人格在 9x9 上多次 think，观察单次耗时
const ai = new AIPlayerCore(board, 'expert', null, false, false);
const times = [];
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  ai.think();
  const dt = performance.now() - t0;
  times.push(dt);
  // 模拟落子推进盘面（选一个空格填解）
  try {
    const step = ai._findAllVisibleResults('lowest')[0];
    if (step) {
      const c = board.cells[step.row][step.col];
      if (c && !c.fillNum) { c.fillNum = step.num; }
    }
  } catch (e) {}
}
const maxT = Math.max(...times);
const avgT = times.reduce((a, b) => a + b, 0) / times.length;
console.log('  think() 单次耗时: avg=' + avgT.toFixed(1) + 'ms max=' + maxT.toFixed(1) + 'ms');
assert('think() 平均耗时 < 40ms（预算生效）', avgT < 40, 'avg=' + avgT.toFixed(1));

// 2) _findAllVisibleResults 预算检查点存在
assert('预算检查点已注入', ai._findAllVisibleResults.toString().indexOf('_budgetDeadline') > 0);

// 3) Boss 节奏动态化：_calcDynamicInterval 输出在合理范围
const ai2 = new AIPlayerCore(board, 'average', null, false, false);
const secs = [];
for (let i = 0; i < 20; i++) {
  const s = ai2._calcDynamicInterval();
  secs.push(s);
  ai2._gameState.isBurst = (i % 4 === 0); // 模拟爆发期
  ai2._gameState.isLeading = (i % 3 === 0) ? false : true;
}
const minS = Math.min(...secs), maxS = Math.max(...secs);
console.log('  _calcDynamicInterval: ' + minS.toFixed(2) + 's ~ ' + maxS.toFixed(2) + 's');
assert('动态间隔有变化（非固定值）', maxS - minS > 0.05, 'range=' + (maxS - minS).toFixed(2));
assert('动态间隔 >= 0.5s 下限', minS >= 0.5, 'min=' + minS.toFixed(2));
assert('动态间隔 < 4s 上限', maxS < 4, 'max=' + maxS.toFixed(2));

// 4) PerformanceMonitor 降级回升逻辑
const { PerformanceMonitor } = await import('../renderer/performance-monitor.js');
const pm = new PerformanceMonitor({ level: 'low', autoAdjust: true, adjustThreshold: 30 });
pm._fps = 55;
for (let i = 0; i < 3; i++) pm._checkAutoAdjust();
assert('FPS 稳定后从 low 回升 medium', pm.getLevel() === 'medium', 'level=' + pm.getLevel());
pm._fps = 55;
for (let i = 0; i < 3; i++) pm._checkAutoAdjust();
assert('再次回升到 high', pm.getLevel() === 'high', 'level=' + pm.getLevel());
const pm2 = new PerformanceMonitor({ level: 'high', autoAdjust: true });
pm2._fps = 15;
pm2._checkAutoAdjust();
assert('掉帧从 high 降到 medium', pm2.getLevel() === 'medium', 'level=' + pm2.getLevel());
assert('animationSmoothness 出口可用', pm.getAnimationSmoothness() === 1.0);

console.log(`\n手感修复验证: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
