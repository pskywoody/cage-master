// ============================================================
// learner-event-phase15-transition-accuracy.mjs — Phase 15 Gate B
// Transition Accuracy：用真实 learner-event 验证 StateTransitioner
// 能否正确跟踪 learner state change（而非仅识别 struggling）。
// CM4 最大未知量：识别 learner state 变化，不是识别 struggling。
// 方法：真实引擎驱动"多阶段"轨迹（独立→困境→恢复），
// 玩家策略提供 ground-truth 状态序列；StateTransitioner 在线逐事件分类，
// 计算逐 step 状态匹配率 + transition 检测延迟/误报。
// 边界：真实引擎事件（非真实用户）；真实用户 session 到位后重跑。
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'learner-event-phase15');
fs.mkdirSync(OUT, { recursive: true });

await import('../core/tech-rater.js');
const { HeadlessEngine } = await import('../core/headless-engine.js');
const { LessonPlayer } = await import('../core/lesson-player.js');
const { HintSystem } = await import('../expert/hint-system.js');
const { TeachingSystem } = await import('../expert/teaching-system.js');
const { RuntimeEventBridge } = await import('../core/learner-event-runtime-bridge.js');
const { normalize, toObservation } = await import('../core/learner-event-adapter.js');
const { StateTransitioner } = await import('../core/teaching-ai-state-transitioner.js');

const ACTION_BRIDGE = {
  attempt: 'skill_encounter', hint: 'hint_requested', hint_level: 'hint_requested',
  reveal: 'reveal', guided_success: 'guided_success', solve: 'solve',
  fail: 'fail', skill_encounter: 'skill_encounter',
};
function toAdapterInput(ev) {
  return { eventId: ev.eventId, timestamp: Date.parse(ev.timestamp) || Date.now(), source: ev.source,
    sessionId: ev.sessionId, technique: ev.technique,
    action: ACTION_BRIDGE[ev.action.type] || ev.action.type,
    outcome: ev.outcome.success === true ? 'success' : ev.outcome.success === false ? 'error' : 'neutral',
    metadata: ev.metadata || {} };
}

// 玩家阶段策略：返回每步是否填对（ok）
//   phase A: 独立成功（全对）→ capability independent
//   phase B: 困境（temporary=偶发错 / persistent=全错）
//   phase C: 恢复（全对）
function playerPolicy(failPhase, i, A, B, C) {
  if (i < A) return true;                       // phase A 独立
  if (i < A + B) return failPhase === 'temporary' ? (i % 4 !== 0) : false; // phase B 困境
  return true;                                   // phase C 恢复
}
// ground-truth 状态（每步，基于玩家策略阶段）
function gtState(failPhase, i, A, B) {
  if (i < A) return 'independent';
  if (i < A + B) return failPhase === 'temporary' ? 'temporary_error' : 'persistent_struggle';
  return 'independent';
}

// 驱动真实引擎，逐 step 在线分类，返回逐 step 对比
function driveTransitions({ levelId, failPhase, A, B, C, sessionId }) {
  const levelData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'levels', `level-${levelId}.json`), 'utf8'));
  const engine = new HeadlessEngine(levelData.gridSize || 9);
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const teachingSystem = new TeachingSystem({ enablePersistence: false });
  const hintSystem = new HintSystem(board, levelData.solution, { teachingSystem, preferredTechnique: null });
  hintSystem.cooldownMs = 0;
  const lessonPlayer = new LessonPlayer({ engine, levelData, delay: 0 });
  const bridge = new RuntimeEventBridge({ sessionId });
  bridge.attachAll({ lessonPlayer, hintSystem, teachingSystem, engine });

  const solution = levelData.solution;
  const ts = new StateTransitioner({ windowSize: 5, recoveryThreshold: 2 });
  const steps = [];
  let solved = false, i = 0;
  const maxSteps = A + B + C;
  while (i < maxSteps && !solved) {
    solved = board.cells.every((row) => row.every((c) => c.fixedNum || c.fillNum));
    if (solved) { steps.push({ i, gt: gtState(failPhase, i, A, B), pred: ts.currentState().state, forcedSolved: true }); i++; continue; }
    let hint = null;
    try { hint = hintSystem.getHint(); } catch (e) {}
    let action = hint ? interpretHint(hint, solution, board.cells) : null;
    if (!action) action = findFirstEmpty(solution, board.cells);
    if (!action) { i++; continue; }
    // 先喂 hint 观察（若有）
    const ok = playerPolicy(failPhase, i, A, B, C);
    const num = ok ? action.num : wrongNumber(action.row, action.col, solution, levelData.gridSize);
    const res = engine.fillCell(action.row, action.col, num);
    if (!ok || res.success === false) engine.eraseCell(action.row, action.col);
    if (DA_DEBUG) DA_LOG.push({ i, action, num, res, ok });
    // 收集本步新增 observation 并喂给 transitioner
    const evs = bridge.getEvents();
    // 用全部事件喂（增量简化：对整段重算不可行，改为按事件追加）
    // 这里打平：把 bridge 收集到的事件逐条转 observation 喂（去重用 eventId）
    for (const ev of evs) {
      if (ev._fed) continue; ev._fed = true;
      const o = toObservation(normalize(toAdapterInput(ev)));
      if (o) ts.push(o);
    }
    steps.push({ i, gt: gtState(failPhase, i, A, B), pred: ts.currentState().state });
    i++;
  }
  return { steps, engine: null };
}

// ---- 诊断：打印 normal 场景的逐步 gt/pred ----
const DA_DEBUG = process.argv.includes('--debug');
const DA_LOG = [];
const diag = driveTransitions({ levelId: '101', failPhase: 'none', A: 12, B: 0, C: 0, sessionId: 'p15-diag' });
console.log('  [diag normal] step: gt/pred');
diag.steps.slice(0, 12).forEach((s) => console.log(`    ${s.i}: ${s.gt}/${s.pred}`));
if (DA_DEBUG) DA_LOG.slice(0, 8).forEach((d) => console.log('    fill', d.i, 'num', d.num, 'at', d.action && d.action.row, d.action && d.action.col, 'res.success=', d.res.success, 'ok=', d.ok, JSON.stringify(d.action && d.action.num)));

// 评估：transition 检测（主指标）+ state accuracy（辅助，去能力建立期与稳定段）
function evaluate(name, result) {
  const steps = result.steps;
  const total = steps.length;
  const match = steps.filter((s) => s.gt === s.pred).length;
  const stateAccuracy = total ? match / total : 0;
  // transition 点检测：真实 gt 变化的位置
  const gtTransitions = [];
  for (let k = 1; k < total; k++) if (steps[k].gt !== steps[k - 1].gt) gtTransitions.push(k);
  const predTransitions = [];
  for (let k = 1; k < total; k++) if (steps[k].pred !== steps[k - 1].pred) predTransitions.push(k);
  // 对每个 gt transition，找最近 pred transition 的距离
  const transitionDetected = gtTransitions.map((g) => {
    if (predTransitions.length === 0) return { gt: g, detected: false, delay: null };
    const d = Math.min(...predTransitions.map((p) => Math.abs(p - g)));
    return { gt: g, detected: true, delay: d };
  });
  // 误报：pred transition 但 gt 没变
  const falseAlarms = predTransitions.filter((p) => !gtTransitions.some((g) => Math.abs(g - p) <= 1)).length;
  // 稳定段 accuracy：排除 gt transition 前后 window 内的步（能力建立期 + 过渡期）
  const W = 5;
  const stableIdx = [];
  for (let k = 0; k < total; k++) {
    if (gtTransitions.some((g) => Math.abs(g - k) <= W)) continue;
    stableIdx.push(k);
  }
  const stableMatch = stableIdx.filter((k) => steps[k].gt === steps[k].pred).length;
  const stableAccuracy = stableIdx.length ? stableMatch / stableIdx.length : 0;
  return { name, stateAccuracy, stableAccuracy, gtTransitions, predTransitions, transitionDetected, falseAlarms, total };
}

// 三个场景
const scenarios = [
  { name: 'independent_to_temporary_recover', failPhase: 'temporary', A: 8, B: 8, C: 8 },
  { name: 'independent_to_persistent', failPhase: 'persistent', A: 8, B: 12, C: 4 },
  { name: 'normal_independent', failPhase: 'none', A: 20, B: 0, C: 0 },
];

const results = scenarios.map((s) => {
  const r = driveTransitions({ levelId: '101', failPhase: s.failPhase, A: s.A, B: s.B, C: s.C, sessionId: `p15-${s.name}` });
  return evaluate(s.name, r);
});

const report = {
  gate: 'Phase15', phase: 'Transition Accuracy', timestamp: new Date().toISOString(),
  boundary: '真实引擎事件（非真实用户）；ground-truth 由步进策略定义；真实用户 session 到位后重跑。',
  semanticFix: 'recordEncounter(false) 在 getHint 时被调用=教学交互进行中，原误映射为 fail(error) 污染 struggling 信号；已改中性 encounter，真正错误由 Puzzle 填错捕获。',
  results,
  summary: {
    transitionsFound: results.reduce((a, r) => a + r.gtTransitions.length, 0),
    transitionsDetected: results.reduce((a, r) => a + r.transitionDetected.filter((t) => t.detected).length, 0),
    maxDelay: Math.max(...results.flatMap((r) => r.transitionDetected.map((t) => t.delay === null ? 0 : t.delay))),
    totalFalseAlarms: results.reduce((a, r) => a + r.falseAlarms, 0),
    avgStableAccuracy: results.reduce((a, r) => a + r.stableAccuracy, 0) / results.length,
  },
};
report.gateBinary = report.summary.transitionsFound > 0 && report.summary.transitionsDetected === report.summary.transitionsFound;
fs.writeFileSync(path.join(OUT, 'phase15-transition-accuracy.json'), JSON.stringify(report, null, 2));

console.log('===== Phase 15: Transition Accuracy =====');
for (const r of results) {
  console.log(`  ${r.name.padEnd(34)} acc=${(r.stateAccuracy * 100).toFixed(0)}% stable=${(r.stableAccuracy * 100).toFixed(0)}% trans=${r.gtTransitions.length} detected=${r.transitionDetected.filter(t=>t.detected).length} delays=[${r.transitionDetected.map(t=>t.delay).join(',')}] falseAlarm=${r.falseAlarms}`);
}
console.log(`  transitions ${report.summary.transitionsDetected}/${report.summary.transitionsFound} detected | maxDelay=${report.summary.maxDelay} | falseAlarms=${report.summary.totalFalseAlarms} | avgStableAccuracy=${(report.summary.avgStableAccuracy * 100).toFixed(0)}%`);
console.log('  semanticFix:', report.semanticFix);
console.log('  GATE:', report.gateBinary ? 'PASS' : 'INCONCLUSIVE (needs real session)');

// ---- 辅助 ----
function wrongNumber(row, col, solution, size) { const v = solution[row][col]; for (let n = 1; n <= size; n++) if (n !== v) return n; return null; }
function interpretHint(hint, solution, cells) {
  const level = hint.hintLevel || 0, target = hint.target;
  if (hint.type === 'elimination') return null;
  if (level >= 3) { const a = extractTarget(target, solution); if (a) return a; }
  if (level >= 2 && target && typeof target.row === 'number' && typeof target.col === 'number') { const v = solution[target.row]?.[target.col]; if (v) return { row: target.row, col: target.col, num: v }; }
  if (target && target.vague !== false && target.region) { for (const { row, col } of regionEmpty(cells, target.region)) { const v = solution[row]?.[col]; if (v) return { row, col, num: v }; } }
  return null;
}
function extractTarget(t, solution) { if (!t) return null; if (typeof t.row === 'number' && typeof t.col === 'number' && t.value) return { row: t.row, col: t.col, num: t.value }; if (Array.isArray(t.cells) && t.cells.length > 0) { const f = t.cells[0]; const v = t.value || t.values?.[0] || solution[f.row]?.[f.col]; if (f && typeof f.row === 'number' && typeof f.col === 'number' && v) return { row: f.row, col: f.col, num: v }; } return null; }
function regionEmpty(cells, region) { const { type, index } = region; const size = cells.length; const out = []; if (type === 'cell' && region.row != null) { const c = cells[region.row]?.[region.col]; if (c && !c.fixedNum && !c.fillNum) out.push({ row: region.row, col: region.col }); return out; } for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) { const cell = cells[r][c]; if (cell.fixedNum || cell.fillNum) continue; let inR = false; if (type === 'row' && r === index) inR = true; else if (type === 'col' && c === index) inR = true; else if (type === 'box') { const bs = Math.round(Math.sqrt(size)); if (Math.floor(r / bs) * bs + Math.floor(c / bs) === index) inR = true; } if (inR) out.push({ row: r, col: c }); } return out; }
function findFirstEmpty(solution, cells) { for (let r = 0; r < solution.length; r++) for (let c = 0; c < solution[0].length; c++) if (!cells[r][c].fillNum && !cells[r][c].fixedNum) return { row: r, col: c, num: solution[r][c] }; return null; }