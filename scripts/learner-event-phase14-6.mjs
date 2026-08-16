// ============================================================
// learner-event-phase14-6.mjs — Teaching AI Phase 14.6
// State Transition Refinement 验证：
// 用真实引擎驱动"先独立成功 → 后陷入困境"轨迹，对比
//   旧 classifyFine（prior mastery bias） vs 新 StateTransitioner。
// 边界：不改 classifyFine / LearnerModel / 生产模块；新增 transition 层验证。
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'learner-event-phase14-6');
fs.mkdirSync(OUT, { recursive: true });

await import('../core/tech-rater.js');
const { HeadlessEngine } = await import('../core/headless-engine.js');
const { LessonPlayer } = await import('../core/lesson-player.js');
const { HintSystem } = await import('../expert/hint-system.js');
const { TeachingSystem } = await import('../expert/teaching-system.js');
const { RuntimeEventBridge } = await import('../core/learner-event-runtime-bridge.js');
const { normalize, toObservation } = await import('../core/learner-event-adapter.js');
const { classifyFine } = await import('../core/teaching-ai-state-refiner.js');
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

// 驱动真实 session：前 N 步正常（独立成功），后切换策略（temporary 或 persistent）
function driveSession({ levelId, startCorrect = 8, failPhase, sessionId, maxSteps = 40 }) {
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
  let solved = false, step = 0, errors = 0;
  while (step < maxSteps && !solved) {
    solved = board.cells.every((row) => row.every((c) => c.fixedNum || c.fillNum));
    if (solved) break;
    let hint = null;
    try { hint = hintSystem.getHint(); } catch (e) {}
    let action = hint ? interpretHint(hint, solution, board.cells) : null;
    if (!action) action = findFirstEmpty(solution, board.cells);
    if (!action) break;
    const inFailPhase = step >= startCorrect;
    const ok = !inFailPhase ? true : (failPhase === 'temporary' ? (step % 4 !== 0) : false);
    const num = ok ? action.num : wrongNumber(action.row, action.col, solution, levelData.gridSize);
    const res = engine.fillCell(action.row, action.col, num);
    if (res.success && !ok) { errors++; engine.eraseCell(action.row, action.col); }
    else if (!res.success) errors++;
    step++;
  }
  return bridge.finalize();
}

function toObs(events) {
  const obs = [];
  for (const ev of events) {
    const o = toObservation(normalize(toAdapterInput(ev)));
    if (o) obs.push(o);
  }
  return obs;
}

// ---- 场景：先成功 startCorrect 步，后陷入困境 ----
function runScenario(name, failPhase) {
  const events = driveSession({ levelId: '101', startCorrect: 8, failPhase, sessionId: `p146-${name}`, maxSteps: 30 }).events;
  const obs = toObs(events);
  const oldState = classifyFine(obs);
  const ts = new StateTransitioner({ windowSize: 5 });
  const newResult = ts.classifyAll(obs);
  return { name, events, obsCount: obs.length, oldState, newState: newResult.state, capability: newResult.capability, errors: obs.filter((o) => o.type === 'error').length, correct: obs.filter((o) => o.type === 'correct').length, hint: obs.filter((o) => o.type === 'hint').length };
}

const scenarios = [
  runScenario('prior_mastery_temp', 'temporary'),
  runScenario('prior_mastery_persist', 'persistent'),
];

// 纯轨迹断言（复用 Gate B 的 GAP 模板）
const AUDIT = [
  { name: 'case1', seq: ['correct','correct','error'], expect: 'temporary_error' },
  { name: 'case2', seq: ['correct','correct','hint','error','hint','error'], expect: 'persistent_struggle' },
  { name: 'case3_recover', seq: ['correct','correct','error','correct','correct'], expect: 'independent' },
  { name: 'pure_indep', seq: ['correct','correct'], expect: 'independent' },
];
const audit = AUDIT.map(({ name, seq, expect }) => {
  const obsSeq = seq.map((t, i) => ({ technique: 'nakedSingle', type: t, independent: t === 'correct', ts: i }));
  const oldG = classifyFine(obsSeq);
  const newG = new StateTransitioner({ windowSize: 5 }).classifyAll(obsSeq).state;
  return { name, seq: seq.join('→'), expect, old: oldG, new: newG, oldMatch: oldG === expect, newMatch: newG === expect };
});

const report = {
  gate: 'Phase14.6', timestamp: new Date().toISOString(),
  boundary: '新增 StateTransitioner 验证；不改 classifyFine/LearnerModel/生产模块。',
  scenarios: scenarios.map((s) => ({
    name: s.name, obs: s.obsCount, errors: s.errors, correct: s.correct, hint: s.hint,
    oldState: s.oldState, newState: s.newState, capability: s.capability,
    fixed: s.newState !== 'independent' && s.oldState === 'independent',
  })),
  audit,
  summary: {
    priorMasteryBiasFixed: scenarios.filter((s) => s.newState !== 'independent' && s.oldState === 'independent').length,
    auditNewPass: audit.filter((a) => a.newMatch).length,
    auditOldPass: audit.filter((a) => a.oldMatch).length,
  },
};
fs.writeFileSync(path.join(OUT, 'phase14-6-report.json'), JSON.stringify(report, null, 2));

console.log('===== Phase 14.6: State Transition Refinement =====');
console.log('\n-- 真实轨迹（先成功 8 步 → 后陷入困境）--');
for (const s of scenarios) {
  console.log(`  ${s.name.padEnd(22)} err=${s.errors} corr=${s.correct} hint=${s.hint}`);
  console.log(`    old classifyFine: ${s.oldState.padEnd(20)} → new StateTransitioner: ${s.newState} (cap=${s.capability}) ${s.fixed ? '✓ FIXED' : ''}`);
}
console.log('\n-- 纯轨迹审计（修复 GAP）--');
for (const a of audit) {
  console.log(`  ${a.name.padEnd(16)} ${a.seq.padEnd(40)} expect=${a.expect.padEnd(20)} old=${a.old.padEnd(20)} new=${a.new} ${a.newMatch ? '✓' : '✗'}`);
}
console.log('\n  priorMasteryBiasFixed:', report.summary.priorMasteryBiasFixed, '| audit old pass:', report.summary.auditOldPass, '/', audit.length, '| new pass:', report.summary.auditNewPass, '/', audit.length);

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
function extractTarget(t, solution) {
  if (!t) return null;
  if (typeof t.row === 'number' && typeof t.col === 'number' && t.value) return { row: t.row, col: t.col, num: t.value };
  if (Array.isArray(t.cells) && t.cells.length > 0) { const f = t.cells[0]; const v = t.value || t.values?.[0] || solution[f.row]?.[f.col]; if (f && typeof f.row === 'number' && typeof f.col === 'number' && v) return { row: f.row, col: f.col, num: v }; }
  return null;
}
function regionEmpty(cells, region) {
  const { type, index } = region; const size = cells.length; const out = [];
  if (type === 'cell' && region.row != null) { const c = cells[region.row]?.[region.col]; if (c && !c.fixedNum && !c.fillNum) out.push({ row: region.row, col: region.col }); return out; }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) { const cell = cells[r][c]; if (cell.fixedNum || cell.fillNum) continue; let inR = false; if (type === 'row' && r === index) inR = true; else if (type === 'col' && c === index) inR = true; else if (type === 'box') { const bs = Math.round(Math.sqrt(size)); if (Math.floor(r / bs) * bs + Math.floor(c / bs) === index) inR = true; } if (inR) out.push({ row: r, col: c }); }
  return out;
}
function findFirstEmpty(solution, cells) { for (let r = 0; r < solution.length; r++) for (let c = 0; c < solution[0].length; c++) if (!cells[r][c].fillNum && !cells[r][c].fixedNum) return { row: r, col: c, num: solution[r][c] }; return null; }