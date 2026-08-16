// ============================================================
// learner-event-gateB-validation.mjs — Phase 15 Gate B
// Real Session Shadow Validation（H1 + H2）
//   H1 — State distribution：真实事件经 adapter → LearnerModel → refiner 的状态分布
//   H2 — LearnerModel 边界：persistent_struggle vs temporary_error 是否可区分
// 数据：真实生产模块 + HeadlessEngine 在真实关卡上运行产生（非合成）。
// 诚实在边界：当前无真实玩家 session，H1 为"真实引擎运行快照"，
//           H2 为"真实事件序列下的分类可区分性"验证。
// ============================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'data', 'learner-event-gateB');
fs.mkdirSync(OUT, { recursive: true });

await import('../core/tech-rater.js');
if (!globalThis.TechRater) { console.error('TechRater 未挂载'); process.exit(1); }

const { HeadlessEngine } = await import('../core/headless-engine.js');
const { LessonPlayer } = await import('../core/lesson-player.js');
const { HintSystem } = await import('../expert/hint-system.js');
const { TeachingSystem } = await import('../expert/teaching-system.js');
const { RuntimeEventBridge } = await import('../core/learner-event-runtime-bridge.js');
const { normalize, toObservation } = await import('../core/learner-event-adapter.js');
const { classifyFine, coarseState, fineAction } = await import('../core/teaching-ai-state-refiner.js');

const ACTION_BRIDGE = {
  attempt: 'skill_encounter', hint: 'hint_requested', hint_level: 'hint_requested',
  reveal: 'reveal', guided_success: 'guided_success', solve: 'solve',
  fail: 'fail', skill_encounter: 'skill_encounter',
};
function toAdapterInput(ev) {
  return {
    eventId: ev.eventId, timestamp: Date.parse(ev.timestamp) || Date.now(), source: ev.source,
    sessionId: ev.sessionId, technique: ev.technique,
    action: ACTION_BRIDGE[ev.action.type] || ev.action.type,
    outcome: ev.outcome.success === true ? 'success' : ev.outcome.success === false ? 'error' : 'neutral',
    metadata: ev.metadata || {},
  };
}

// ---- 驱动一个真实 session，玩家策略决定填格行为 ----
function driveSession({ levelId, player, sessionId, maxSteps = 40 }) {
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
  const profiles = {
    correct: () => true,                       // 正常：按解填
    persistent: () => false,                   // 始终填错（连续失败）
    temporary: (i) => (i % 4 === 0 ? false : true), // 偶发失败后恢复
  };
  const pick = profiles[player] || profiles.correct;
  let solved = false, step = 0, errors = 0;
  const fillLog = [];
  while (step < maxSteps && !solved) {
    solved = board.cells.every((row) => row.every((c) => c.fixedNum || c.fillNum));
    if (solved) break;
    let hint = null;
    try { hint = hintSystem.getHint(); } catch (e) {}
    let action = hint ? interpretHint(hint, solution, board.cells) : null;
    if (!action) action = findFirstEmpty(solution, board.cells);
    if (!action) break;
    const ok = pick(step);
    const num = ok ? action.num : wrongNumber(action.row, action.col, solution, levelData.gridSize);
    const res = engine.fillCell(action.row, action.col, num);
    if (res.success && !ok) { errors++; engine.eraseCell(action.row, action.col); }
    else if (!res.success) errors++;
    fillLog.push(`(${action.row},${action.col})=${num}${ok ? '✓' : '✗'}`);
    step++;
  }
  const session = bridge.finalize();
  return { session, engine, errors, step, solved, fillLog };
}

// ---- 事件 → 状态分布 ----
function analyze(events) {
  const observations = [];
  for (const ev of events) {
    const obs = toObservation(normalize(toAdapterInput(ev)));
    if (obs) observations.push(obs);
  }
  const fine = classifyFine(observations);
  const coarse = coarseState(observations);
  const ua2 = fineAction(fine);
  // 特征（H2 区分依据）
  let errors = 0, correct = 0, indep = 0, guidedCorrect = 0, hintThenFail = 0, maxConsecErr = 0, consecErr = 0, prevWasHint = false;
  for (const o of observations) {
    if (o.type === 'hint') { prevWasHint = true; continue; }
    if (o.type === 'error') { errors++; consecErr++; maxConsecErr = Math.max(maxConsecErr, consecErr); if (prevWasHint) hintThenFail++; }
    else { consecErr = 0; }
    if (o.type === 'correct') { correct++; consecErr = 0; if (o.independent === true) indep++; else guidedCorrect++; }
    prevWasHint = o.type === 'hint';
  }
  return {
    observeCount: observations.length,
    fine, coarse, ua2,
    features: { errors, correct, indep, guidedCorrect, hintThenFail, maxConsecErr },
  };
}

// ---- H2.2 分类边界审计：代表性轨迹模板覆盖 ----
const AUDIT = [
  { name: 'persistent', obs: ['hint','error','hint','error','hint','error'], expect: 'persistent_struggle' },
  { name: 'temporary', obs: ['error','guided_success','error','guided_success'], expect: 'temporary_error' },
  { name: 'novice', obs: ['error'], expect: 'novice_exploration' },
  { name: 'guided', obs: ['guided_success'], expect: 'guided' },
  { name: 'independent', obs: ['correct','correct'], expect: 'independent' },
  { name: 'temp_after_indep', obs: ['correct','correct','error'], expect: 'temporary_error' },
  { name: 'persist_after_indep', obs: ['correct','correct','hint','error','hint','error'], expect: 'persistent_struggle' },
];
const templateAudit = AUDIT.map(({ name, obs, expect }) => {
  const seq = obs.map((t, i) => ({ technique: 'nakedSingle', type: t, independent: t === 'correct', ts: i }));
  const got = classifyFine(seq);
  return { name, trace: obs.join('→'), expect, got, match: got === expect };
});

// ---- H1：多关卡正常玩家 → 状态分布 ----
const H1_LEVELS = ['101', '102', '103', '104', '105'];
const h1Sessions = [];
const h1BySource = {};
for (const lv of H1_LEVELS) {
  let r;
  try { r = driveSession({ levelId: lv, player: 'correct', sessionId: `h1-${lv}` }); }
  catch (e) { console.warn(`H1 level ${lv} skipped: ${e.message}`); continue; }
  const a = analyze(r.session.events);
  h1Sessions.push({ levelId: lv, ...a, events: r.session.events.length, solved: r.solved });
  for (const ev of r.session.events) h1BySource[ev.source] = (h1BySource[ev.source] || 0) + 1;
}

// ---- H2：persistent vs temporary 玩家 → 可区分性 ----
const h2 = {};
for (const player of ['persistent', 'temporary']) {
  const r = driveSession({ levelId: '101', player, sessionId: `h2-${player}`, maxSteps: 30 });
  const a = analyze(r.session.events);
  h2[player] = { ...a, events: r.session.events.length, errors: r.errors, solved: r.solved };
}

// ---- 报告 ----
const h1Distribution = {};
for (const s of h1Sessions) h1Distribution[s.fine] = (h1Distribution[s.fine] || 0) + 1;
const distinctFine = new Set(h1Sessions.map((s) => s.fine));

const report = {
  gate: 'B', timestamp: new Date().toISOString(),
  honestyBoundary: '数据来自真实生产模块在真实关卡上的运行，非真实玩家；H1 为运行快照，H2 为分类可区分性验证。',
  H1: {
    levels: h1Sessions.map((s) => ({ levelId: s.levelId, fine: s.fine, coarse: s.coarse, ua2: s.ua2, observe: s.observeCount, solved: s.solved })),
    distribution: h1Distribution,
    distinctFineStates: [...distinctFine],
    bySource: h1BySource,
    note: '正常玩家（按解填格）在 AI 教学下倾向 guided；真实玩家分布需真实 session 积累。',
  },
  H2: {
    persistent: h2.persistent,
    temporary: h2.temporary,
    separation: {
      persistentFine: h2.persistent && h2.persistent.fine,
      temporaryFine: h2.temporary && h2.temporary.fine,
      distinguishable: !!(h2.persistent && h2.temporary) && h2.persistent.fine !== h2.temporary.fine,
      featureGap: (h2.persistent && h2.temporary) ? {
        errors: h2.persistent.features.errors - h2.temporary.features.errors,
        maxConsecErr: h2.persistent.features.maxConsecErr - h2.temporary.features.maxConsecErr,
        hintThenFail: h2.persistent.features.hintThenFail - h2.temporary.features.hintThenFail,
      } : null,
    },
  },
  classificationAudit: templateAudit,
};
fs.writeFileSync(path.join(OUT, 'gateB-report.json'), JSON.stringify(report, null, 2));

// ---- 输出 ----
console.log('===== Gate B: Shadow Validation（H1 + H2）=====');
console.log('\n-- H1 State Distribution --');
for (const s of h1Sessions) console.log(`  ${s.levelId}: fine=${s.fine} coarse=${s.coarse} ua2=${s.ua2} observe=${s.observeCount} solved=${s.solved}`);
console.log('  distribution:', JSON.stringify(h1Distribution));
console.log('  bySource:', JSON.stringify(h1BySource));
console.log('\n-- H2 persistent vs temporary --');
if (h2.persistent) {
  console.log(`  persistent: fine=${h2.persistent.fine} obs=${h2.persistent.observeCount} feats=${JSON.stringify(h2.persistent.features)}`);
  console.log(`  temporary : fine=${h2.temporary.fine} obs=${h2.temporary.observeCount} feats=${JSON.stringify(h2.temporary.features)}`);
  console.log('  distinguishable:', report.H2.separation.distinguishable, '| featureGap:', JSON.stringify(report.H2.separation.featureGap));
  }
console.log('\n-- classification Audit（轨迹模板覆盖）--');
for (const a of templateAudit) console.log(`  ${a.name.padEnd(18)} ${a.trace.padEnd(46)} expect=${a.expect.padEnd(20)} got=${a.got.padEnd(20)} ${a.match ? 'OK' : '✗ GAP'} `);
fs.writeFileSync(path.join(OUT, 'gateB-separation.json'), JSON.stringify(report.H2.separation, null, 2));

// ---- 辅助 ----
function wrongNumber(row, col, solution, size) {
  const v = solution[row][col];
  for (let n = 1; n <= size; n++) if (n !== v) return n;
  return null;
}
function interpretHint(hint, solution, cells) {
  const level = hint.hintLevel || 0;
  const target = hint.target;
  if (hint.type === 'elimination') return null;
  if (level >= 3) { const a = extractTarget(target, solution); if (a) return a; }
  if (level >= 2 && target && typeof target.row === 'number' && typeof target.col === 'number') {
    const v = solution[target.row]?.[target.col];
    if (v) return { row: target.row, col: target.col, num: v };
  }
  if (target && target.vague !== false && target.region) {
    for (const { row, col } of regionEmpty(cells, target.region)) {
      const v = solution[row]?.[col];
      if (v) return { row, col, num: v };
    }
  }
  return null;
}
function extractTarget(t, solution) {
  if (!t) return null;
  if (typeof t.row === 'number' && typeof t.col === 'number' && t.value) return { row: t.row, col: t.col, num: t.value };
  if (Array.isArray(t.cells) && t.cells.length > 0) {
    const f = t.cells[0];
    const v = t.value || t.values?.[0] || solution[f.row]?.[f.col];
    if (f && typeof f.row === 'number' && typeof f.col === 'number' && v) return { row: f.row, col: f.col, num: v };
  }
  return null;
}
function regionEmpty(cells, region) {
  const { type, index } = region;
  const size = cells.length;
  const out = [];
  if (type === 'cell' && region.row != null) {
    const c = cells[region.row]?.[region.col];
    if (c && !c.fixedNum && !c.fillNum) out.push({ row: region.row, col: region.col });
    return out;
  }
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    const cell = cells[r][c];
    if (cell.fixedNum || cell.fillNum) continue;
    let inR = false;
    if (type === 'row' && r === index) inR = true;
    else if (type === 'col' && c === index) inR = true;
    else if (type === 'box') {
      const bs = Math.round(Math.sqrt(size));
      if (Math.floor(r / bs) * bs + Math.floor(c / bs) === index) inR = true;
    }
    if (inR) out.push({ row: r, col: c });
  }
  return out;
}
function findFirstEmpty(solution, cells) {
  for (let r = 0; r < solution.length; r++) for (let c = 0; c < solution[0].length; c++) {
    if (!cells[r][c].fillNum && !cells[r][c].fixedNum) return { row: r, col: c, num: solution[r][c] };
  }
  return null;
}