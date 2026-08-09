// ============================================================
//  novice-teach-drive.js - 小白 AI 教学驱动（2026-08-04）
// ============================================================
//  用 HeadlessEngine + LessonPlayer 驱动真实五段式教学
//  （intro → demo → guided → semiAuto → free），模拟小白玩家行为：
//    - guided 按 accuracy 概率填对，否则填错重试（最多 maxAttempts，之后自动揭示）
//    - semiAuto 按 watchCells 引导填（偏离率偏离到任意空格），可产出真实引导采纳度
//    - free 直接按 solution 填完
//  输出与浏览器 GameApp.getAIReadableState().record 完全同构的 JSON
//  （moves / interactions / lessonEvents / lessonPlan 摘要 / initialBoard / cages 等），
//  供 scripts/analyze-teach.js 直接分析。
//
//  用法：
//    node scripts/novice-teach-drive.js --levels 101-108 --report reports/novice-101-108.json
//    node scripts/novice-teach-drive.js --levels 101-108 --accuracy 0.7 --drift 0.3 --report ...
// ============================================================

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { HeadlessEngine } from '../core/headless-engine.js';
import { LessonPlayer } from '../core/lesson-player.js';
import { buildRecordSnapshot } from '../core/ai-record.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- 命令行解析 ----
function parseArgs() {
  const args = process.argv.slice(2);
  const opt = { levels: '101-108', accuracy: 0.7, drift: 0.3, reportFile: null, maxSteps: 60 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--levels') opt.levels = args[++i];
    else if (args[i] === '--accuracy') opt.accuracy = parseFloat(args[++i]);
    else if (args[i] === '--drift') opt.drift = parseFloat(args[++i]);
    else if (args[i] === '--max-steps') opt.maxSteps = parseInt(args[++i], 10);
    else if (args[i] === '--report') opt.reportFile = args[++i];
  }
  return opt;
}

function parseLevelRange(range) {
  const parts = range.split('-').map(Number);
  if (parts.length === 1) return [parts[0]];
  const [start, end] = parts;
  const ids = [];
  for (let i = start; i <= end; i++) ids.push(i);
  return ids;
}

function loadLevel(levelId) {
  const filePath = path.join(__dirname, '../data/levels', `level-${levelId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

// ---- 工具 ----
function cellKey(r, c) { return { row: String.fromCharCode(97 + r), col: c + 1 }; }
function randInt(n) { return Math.floor(Math.random() * n); }
function randNum(size) { return 1 + randInt(size); }
function wrongValue(solution, r, c, size) {
  const correct = solution[r][c];
  let v = randNum(size);
  while (v === correct) v = randNum(size);
  return v;
}
function isEmptyCell(state, r, c) {
  const cell = state.cells[r] && state.cells[r][c];
  return cell && !cell.fixedNum && !cell.fillNum;
}
function findFirstEmpty(state, size) {
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
    if (isEmptyCell(state, r, c)) return [r, c];
  }
  return null;
}

// ============================================================
//  单关驱动
// ============================================================
async function runNoviceLevel(levelId, opt, log) {
  const levelData = loadLevel(levelId);
  if (!levelData) return { levelId, status: 'no-level' };

  const size = levelData.gridSize || 9;
  const solution = levelData.solution;
  const snapshot = buildRecordSnapshot(levelData);

  const record = {
    levelId,
    gridSize: size,
    startedAt: Date.now(),
    completedAt: null,
    ...snapshot,
    moves: [],
    interactions: [],
    lessonEvents: [],
  };
  const rec = (type, data) => record.interactions.push(Object.assign({
    ts: Date.now(),
    elapsedMs: record.startedAt ? (Date.now() - record.startedAt) : 0,
    type,
  }, data || {}));
  const mv = (type, r, c, num, extra) => {
    const e = {
      type,
      cell: cellKey(r, c),
      num: num != null ? num : null,
      ts: Date.now(),
      elapsedMs: record.startedAt ? (Date.now() - record.startedAt) : 0,
    };
    Object.assign(e, extra || {});
    record.moves.push(e);
  };

  const engine = new HeadlessEngine(size);
  engine.loadLevel(levelData);
  const lp = new LessonPlayer({ engine, levelData, delay: null });
  if (!lp.start()) {
    // 无教学计划：直接按解填完
    let guard = 0;
    while (guard++ < 64) {
      const st = engine.getState();
      const empty = findFirstEmpty(st, size);
      if (!empty) break;
      const [r, c] = empty;
      engine.fillCell(r, c, solution[r][c]);
      mv('fill', r, c, solution[r][c], { correct: true, lessonPhase: null, lessonPhaseAfter: 'free' });
    }
    record.completedAt = Date.now();
    rec('level_complete', {});
    return { levelId, status: 'passed', record };
  }

  rec('pre_dialog', { levelId });

  let steps = 0;
  const tooMany = () => steps++ > (opt.maxSteps || 60);

  // ---- intro / demo：小白点击气泡推进 ----
  let guard = 0;
  while ((lp.currentPhase === 'intro' || lp.currentPhase === 'demo') && guard++ < 80) {
    await wait(120);
    if (lp.currentPhase === 'intro') { lp.advance(); }
    else if (lp.currentPhase === 'demo') { lp.advance(); }
    if (tooMany()) break;
  }
  log(`[${levelId}] 阶段推进至 ${lp.currentPhase}（intro/demo 完成）`);

  // ---- guided ----
  if (lp.currentPhase === 'guided') {
    // methodText 讲解：小白点击跳过
    let eg = 0;
    while (lp._guidedExplaining && eg++ < 6) { lp.advance(); await wait(80); }

    const plan = record.lessonPlan && record.lessonPlan.guided;
    const interactionType = (plan && plan.interactionType) || 'NUMBER';
    let guidedGuard = 0;
    while (lp.currentPhase === 'guided' && guidedGuard++ < 12 && !tooMany()) {
      if (!lp.isWaitingInput) { await wait(150); continue; }
      const t = lp.getGuidedTarget();
      if (!t) { await wait(150); continue; }
      const [r, c] = t.cell;

      if (interactionType === 'WHAT_IF_ENTRY') {
        // 小白点「假设」按钮进入假设模式（教学要求先进入假设模式才能填数）
        const resEntry = lp.handleWhatIfEnter();
        mv('whatif_enter', r, c, null, {
          correct: !!resEntry.handled,
          lessonPhase: lp.currentPhase,
          lessonPhaseAfter: lp.currentPhase,
        });
        await wait(300);
        continue;
      }

      if (interactionType === 'NOTE_ONLY') {
        // 小白记笔记：按 expectedNote 记录（可能漏记/多记，简化：全记）
        const expected = record.lessonPlan.guided.expectedNote || [];
        for (const n of expected) {
          engine.toggleNote(r, c, n);
          const phaseBefore = lp.currentPhase;
          const resNote = lp.handleNoteToggle(r, c, n, true);
          mv('note', r, c, n, {
            added: true,
            lessonPhase: phaseBefore,
            lessonPhaseAfter: lp.currentPhase,
            correct: !!resNote.handled,
          });
        }
        await wait(1600); // 等 successText → 进入 semiAuto/free
      } else {
        // 小白填数：accuracy 概率填对，否则填错
        const isRight = Math.random() < opt.accuracy;
        const val = isRight ? t.value : wrongValue(solution, r, c, size);
        const phaseBefore = lp.currentPhase;
        const resFill = lp.handleCellFill(r, c, val);
        const correct = resFill.handled && resFill.correct === true;
        mv('fill', r, c, val, {
          correct,
          lessonPhase: phaseBefore,
          lessonPhaseAfter: lp.currentPhase,
        });
        if (!correct) {
          // 小白看到错误提示：擦除（模拟纠错），等 failHint 后再试
          engine.eraseCell(r, c);
          mv('erase', r, c, null, { lessonPhase: lp.currentPhase, lessonPhaseAfter: lp.currentPhase });
          await wait(200);
        } else {
          await wait(120);
        }
      }
      if (tooMany()) break;
    }
    // 若小白全错触发了 autoReveal，等待其完成
    if (lp.currentPhase === 'guided' && !lp.isWaitingInput) {
      await wait(2400);
    }
    log(`[${levelId}] guided 结束 → ${lp.currentPhase}`);
  }

  // ---- noteToFill：小白按 expectedNote 写笔记，再填正确答案（V4.3.32 补分支）----
  if (lp.currentPhase === 'noteToFill') {
    const ntf = (record.lessonPlan && (record.lessonPlan.noteToFill || record.lessonPlan.guided)) || {};
    let ntfGuard = 0;
    while (lp.currentPhase === 'noteToFill' && ntfGuard++ < 12 && !tooMany()) {
      await wait(200);
      if (!lp.isWaitingInput) { await wait(150); continue; }
      // noteToFill 阶段直接用配置的 targetCell（getGuidedTarget 会残留 guided 引导格）
      const cell = ntf.targetCell;
      if (!cell) { await wait(150); continue; }
      const [r, c] = cell;
      const expected = ntf.expectedNote || [];
      // 1) 写笔记
      const st = engine.getState();
      const cellObj = st.cells[r] && st.cells[r][c];
      const have = cellObj && cellObj.candidates instanceof Set ? cellObj.candidates : new Set();
      for (const n of expected) {
        if (!have.has(n)) {
          engine.toggleNote(r, c, n);
          const phaseBefore = lp.currentPhase;
          lp.handleNoteToggle(r, c, n, true);
          mv('note', r, c, n, { added: true, lessonPhase: phaseBefore, lessonPhaseAfter: lp.currentPhase });
        }
      }
      // 2) 填正确答案（用解）
      const solVal = solution[r] && solution[r][c];
      if (solVal != null) {
        const phaseBefore = lp.currentPhase;
        const resFill = lp.handleCellFill(r, c, solVal);
        const correct = resFill.handled && resFill.correct === true;
        mv('fill', r, c, solVal, { correct, lessonPhase: phaseBefore, lessonPhaseAfter: lp.currentPhase });
      }
      await wait(1600);
    }
    if (lp.currentPhase === 'noteToFill' && !lp.isWaitingInput) {
      await wait(1800);
    }
    log(`[${levelId}] noteToFill 结束 → ${lp.currentPhase}`);
  }

  // ---- semiAuto：小白按 watchCells 引导填（drift 概率偏离）----
  if (lp.currentPhase === 'semiAuto') {
    const semi = record.lessonPlan && record.lessonPlan.semiAuto;
    const watchCells = (semi && semi.watchCells) || [];
    const interactionType = (semi && semi.interactionType) || 'NUMBER';
    let semiGuard = 0;
    while (lp.currentPhase === 'semiAuto' && semiGuard++ < 12 && !tooMany()) {
      await wait(200);
      const st = engine.getState();
      // 候选：优先未填的 watchCells；偏离时选任意空格（含已填则跳过）
      let candidates = watchCells.filter(([wr, wc]) => isEmptyCell(st, wr, wc));
      if (candidates.length === 0 || Math.random() < opt.drift) {
        const all = [];
        for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
          if (isEmptyCell(st, r, c)) all.push([r, c]);
        }
        candidates = all;
      }
      if (candidates.length === 0) break;
      const [r, c] = candidates[randInt(candidates.length)];
      if (interactionType === 'NOTE_ONLY') {
        engine.toggleNote(r, c, 1);
        const phaseBefore = lp.currentPhase;
        lp.handleNoteToggle(r, c, 1, true);
        mv('note', r, c, 1, { added: true, lessonPhase: phaseBefore, lessonPhaseAfter: lp.currentPhase });
      } else if (interactionType === 'WHAT_IF_FILL') {
        // 小白在假设模式里试填（WhatIf 教学关：semiAuto 走 handleWhatIfCellFill）
        engine.fillCell(r, c, solution[r][c]); // 真实落盘（假设模式填数）
        const phaseBefore = lp.currentPhase;
        const resFill = lp.handleWhatIfCellFill(r, c, solution[r][c]);
        mv('fill', r, c, solution[r][c], {
          correct: !!(resFill && resFill.correct !== false),
          lessonPhase: phaseBefore,
          lessonPhaseAfter: lp.currentPhase,
        });
        await wait(150);
      } else {
        // 2026-08-04：lesson-player 的 semiAuto 分支现会真实落盘，脚本只需通知教学
        const phaseBefore = lp.currentPhase;
        const resFill = lp.handleCellFill(r, c, solution[r][c]);
        mv('fill', r, c, solution[r][c], {
          correct: true,
          lessonPhase: phaseBefore,
          lessonPhaseAfter: lp.currentPhase,
        });
        void resFill;
      }
    }
    await wait(1200); // 等 targetCount 达成 → free
    log(`[${levelId}] semiAuto 结束 → ${lp.currentPhase}`);
  }

  // ---- free：小白按解填完剩余空格 ----
  if (lp.currentPhase === 'free') {
    // guard 上限 = 盘面格数 + 余量（教学关初始固定数少，free 需填接近整盘）
    let guard2 = 0;
    const freeGuardMax = Math.max(64, size * size + 8);
    while (guard2++ < freeGuardMax) {
      const st = engine.getState();
      const empty = findFirstEmpty(st, size);
      if (!empty) break;
      const [r, c] = empty;
      engine.fillCell(r, c, solution[r][c]);
      mv('fill', r, c, solution[r][c], { correct: true, lessonPhase: null, lessonPhaseAfter: 'free' });
    }
  }

  record.lessonEvents = lp.getLessonEvents();
  const state = engine.getState();
  const isComplete = !!(state.validation && state.validation.isComplete);
  record.completedAt = Date.now();
  if (isComplete) rec('level_complete', {});
  else rec('level_complete', { incomplete: true });

  const status = isComplete ? 'passed' : 'stuck';
  log(`[${levelId}] ${status} | 步数:${record.moves.length} 事件:${record.lessonEvents.length} 完成:${isComplete}`);
  return { levelId, status, record };
}

// ============================================================
//  主流程
// ============================================================
const opt = parseArgs();
const levelIds = parseLevelRange(opt.levels);
console.log('小白教学驱动');
console.log(`关卡: ${levelIds.join(', ')} | accuracy:${opt.accuracy} drift:${opt.drift} maxSteps:${opt.maxSteps}`);

const results = [];
for (const id of levelIds) {
  const res = await runNoviceLevel(id, opt, (msg) => console.log(msg));
  results.push(res);
}

const passed = results.filter((r) => r.status === 'passed').length;
const stuck = results.filter((r) => r.status === 'stuck').length;
console.log('\n===== 汇总 =====');
console.log(`通过: ${passed}/${results.length} | 卡住: ${stuck}/${results.length}`);

if (opt.reportFile) {
  const report = {
    timestamp: new Date().toISOString(),
    driver: 'novice-teach-drive',
    accuracy: opt.accuracy,
    drift: opt.drift,
    levels: levelIds,
    summary: { total: results.length, passed, stuck, passRate: results.length ? passed / results.length : 0 },
    results,
  };
  const out = path.resolve(opt.reportFile);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`报告已保存: ${out}`);
}
