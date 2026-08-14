// ============================================================
//  duel-ai.mjs - 双 AI 对战驱动 + 过程追踪（V4.3.31）
// ============================================================
//  莹莹(blind) vs 阿妍(expert) 共享盘面轮流走棋，完整复用 Boss 战机制。
//  本版加入 5 项"过程原因"追踪（回应盲区评审）：
//    盲区1: 拦截尝试/冷却阻止/概率失败 分类计数
//    盲区2: think null 原因分类（noCandidates / candidatesOccupied / rngMiss）
//    盲区3: 蓄力窗口期莹莹行为（选中格/填对错/无视）
//    盲区4: 格子易手时间线（hotPotato / 幽灵格寿命 / 抢回延迟）
//    盲区5: 每步步序号 + 事件时间戳，可还原因果
//
//  用法：
//    node scripts/duel-ai.mjs [关卡] [局数] [plain|intercept] [--trace]
//    例：node scripts/duel-ai.mjs 109 12 intercept --trace
//    --trace 额外输出每步明细（JSON lines 到 stdout）
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { BattleManager, AIPlayerCore } from '../core/battle-manager.js';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const LEVEL = Number(process.argv[2] || 109);
const ROUNDS = Number(process.argv[3] || 8);
const WITH_INTERCEPT = (process.argv[4] || 'intercept') === 'intercept';
const TRACE = process.argv.includes('--trace');
// V4.3.32：玩家侧角色可选（ying 莹莹 / average 平均玩家 / yan 阿妍），默认 ying
const PLAYER = (() => {
  const m = process.argv.find((a) => a.startsWith('--player='));
  return m ? m.split('=')[1] : 'ying';
})();
const SPAWN = (() => { const m = process.argv.find((a) => a.startsWith('--spawn=')); return m ? m.split('=')[1] : 'yan'; })();
const SIEGE_MS = (() => { const m = process.argv.find((a) => a.startsWith('--siegeMs=')); return m ? Number(m.split('=')[1]) : null; })();
const FOCUS_GAIN = (() => { const m = process.argv.find((a) => a.startsWith('--focusGain=')); return m ? Number(m.split('=')[1]) : null; })();
// V4.3.31 追加：拦截冷却以"回合计"指定（脚本管理递减，适配同步循环；--cooldown=N）
const COOLDOWN_TURNS = (() => { const m = process.argv.find((a) => a.startsWith('--cooldown=')); return m ? Number(m.split('=')[1]) : null; })();

const rawLevel = JSON.parse(fs.readFileSync(path.join(ROOT, `data/levels/level-${LEVEL}.json`), 'utf8'));

function findEmpty(board, heuristic) {
  const cands = [];
  for (let r = 0; r < board.size; r++) for (let c = 0; c < board.size; c++) {
    const cell = board.cells[r][c];
    if (cell && !cell.fixedNum && !cell.fillNum) cands.push({ r, c });
  }
  if (!cands.length) return null;
  if (heuristic === 'minCandidates') {
    let best = cands[0], bestN = 99;
    for (const t of cands) {
      const cell = board.cells[t.r][t.c];
      const n = cell.candidates instanceof Set ? cell.candidates.size : (Array.isArray(cell.candidates) ? cell.candidates.length : 9);
      if (n < bestN) { bestN = n; best = t; }
    }
    return best;
  }
  return cands[Math.floor(Math.random() * cands.length)];
}
function wrongNum(size, correct) {
  let n = correct;
  while (n === correct) n = 1 + Math.floor(Math.random() * size);
  return n;
}

/**
 * 盲区2：think() 返回 null 后分类根因
 * @returns {'noCandidates'|'candidatesOccupied'|'rngMiss'}
 */
function classifyThinkNull(ai, board) {
  let realAny = false;
  let allOccupied = true;
  const techIds = ai._getTechPriority();
  for (const techId of techIds) {
    try {
      const rs = ai._rater._findAllByTechnique(techId);
      if (rs && rs.length > 0) {
        realAny = true;
        for (const r of rs) {
          const cell = board.cells[r.row]?.[r.col];
          if (cell && !cell.fixedNum && !cell.fillNum) { allOccupied = false; break; }
        }
        if (!allOccupied) break;
      }
    } catch (e) { /* 该技巧异常跳过 */ }
  }
  if (!realAny) return 'noCandidates';
  if (allOccupied) return 'candidatesOccupied';
  return 'rngMiss'; // 有真实可用候选，但 discoveryRate 随机全跳过
}

async function playOnce(withIntercept) {
  const levelData = JSON.parse(JSON.stringify(rawLevel));
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const solution = levelData.solution;

  const evCount = {};
  const bm = new BattleManager({
    onEvent: (t) => { evCount[t] = (evCount[t] || 0) + 1; },
    // V4.3.32：专注基础收益可配置（扫参）
    ...(FOCUS_GAIN !== null ? { focusGain: FOCUS_GAIN } : {}),
  });
  let endResult = null;
  bm.start({
    board, solution,
    opponent: {
      id: SPAWN, displayName: '阿妍',
      lockCells: [
        { cageId: 'A', releaseEvent: 'gear_1' },
        { cageId: 'F', releaseEvent: 'gear_2' },
        { cageId: 'K', releaseEvent: 'gear_3' },
      ],
      battleTuning: { isKiller: true, pulseEnabled: true, fadeCagesInBattle: true },
    },
    onEnd: (r) => { endResult = r; },
  });
  if (bm._aiPlayer) {
    // 蓄力时长可配置（默认用角色自身 siegeTime，--siegeMs 覆盖）
    bm._aiPlayer._personality.siegeTime = (SIEGE_MS !== null) ? SIEGE_MS : bm._aiPlayer._personality.siegeTime;
  }
  bm.winTarget = bm.totalEmpty;

  const ying = new AIPlayerCore(board, PLAYER,
    (r, c) => bm.getCellCategory(r, c), bm._weightedScoreEnabled);
  // V4.3.34：AI睁眼——注入 ownership 网格（玩家侧 AI 也看到对手占领格）
  if (typeof ying.setOwnershipGrids === 'function') {
    ying.setOwnershipGrids(bm.aiOwned, bm.playerOwned);
  }

  // ---- 过程追踪统计 ----
  const trace = [];   // 盲区5：每步 { step, side, action, ... }
  const s = {
    ying: { fills: 0, correct: 0, wrong: 0, stolen: 0, fallback: 0 },
    ayan: { fills: 0, correct: 0, wrong: 0, fallback: 0, intercepts: 0 },
  };
  // 盲区1：拦截分类
  const intStats = { attempts: 0, success: 0, blockedByCooldown: 0, failedByChance: 0 };
  // 盲区2：think null 分类（双方）
  const nullStats = { ying: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 }, ayan: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 } };
  // 盲区3：蓄力窗口
  const siegeStats = { total: 0, yingPicked: 0, yingPickedCorrect: 0, yingPickedWrong: 0, yingIgnored: 0, yingStunnedDuring: 0, autoCompleted: 0 };
  // 盲区4：格子易手时间线
  const ownerHist = new Map(); // 'r,c' -> { owner, step, changes: [] }
  let hotPotatoCount = 0;      // 易手 >=2 次的格子数
  const ghostLifetimes = [];   // 阿妍幽灵格从占用到被抢的步数
  const reclaimDelays = [];    // 莹莹抢后阿妍抢回的步数

  function ownerOf(r, c) {
    if (bm.aiOwned[r] && bm.aiOwned[r][c]) return 'ayan';
    if (bm.playerOwned[r] && bm.playerOwned[r][c]) return 'ying';
    return 'none';
  }
  function recordOwnership(r, c, stepN, side) {
    const key = `${r},${c}`;
    const rec = ownerHist.get(key);
    const newOwner = side || ownerOf(r, c);
    if (!rec) {
      ownerHist.set(key, { owner: newOwner, step: stepN, changes: [{ step: stepN, to: newOwner }] });
      return;
    }
    if (rec.owner !== newOwner) {
      // 幽灵格寿命：ayan 占用 → 被 ying 抢（格子被实填）
      if (rec.owner === 'ayan' && newOwner === 'ying') ghostLifetimes.push(stepN - rec.step);
      // 抢回延迟：ying 实填 → ayan 再占（幽灵）
      if (rec.owner === 'ying' && newOwner === 'ayan') reclaimDelays.push(stepN - rec.step);
      rec.changes.push({ step: stepN, from: rec.owner, to: newOwner });
      rec.owner = newOwner;
      rec.step = stepN;
      if (rec.changes.length >= 3) hotPotatoCount++;
    }
  }

  let stepN = 0;
  let turn = 0, guard = 0;
  let siegeActive = false, siegeStartStep = 0, siegeCell = null;

  while (bm.active && !bm.ended && guard++ < 500) {
    stepN++;
    if (turn === 0) {
      // ---- 莹莹（玩家侧）回合 ----
      if (bm._playerStunned) {
        if (siegeActive) siegeStats.yingStunnedDuring++;
        trace.push({ step: stepN, side: 'ying', action: 'stunned' });
        turn = 1; continue;
      }
      // 蓄力窗口：莹莹行为记录（盲区3）
      if (bm._underSiege && !siegeActive) {
        siegeActive = true; siegeStartStep = stepN; siegeCell = { r: bm._underSiege.r, c: bm._underSiege.c };
        siegeStats.total++;
        trace.push({ step: stepN, side: 'ayan', action: 'siege_start', r: siegeCell.r, c: siegeCell.c });
      }
      if (siegeActive && bm._underSiege) {
        const sg = bm._underSiege;
        const sgCell = board.cells[sg.r]?.[sg.c];
        if (sgCell && !sgCell.fixedNum && !sgCell.fillNum && Math.random() < 0.6) {
          const guessed = Math.random() < 0.82;
          const num = guessed ? solution[sg.r][sg.c] : wrongNum(board.size, solution[sg.r][sg.c]);
          engine.fillCell(sg.r, sg.c, num);
          bm.onPlayerFill(sg.r, sg.c, num, guessed);
          ying.syncFromBoard(board);
          if (bm._aiPlayer) bm._aiPlayer.syncFromBoard(board);
          recordOwnership(sg.r, sg.c, stepN, 'ying');
          s.ying.fills++; if (guessed) { s.ying.correct++; siegeStats.yingPickedCorrect++; } else { s.ying.wrong++; siegeStats.yingPickedWrong++; }
          siegeStats.yingPicked++;
          trace.push({ step: stepN, side: 'ying', action: 'parry', r: sg.r, c: sg.c, num, correct: guessed });
          siegeActive = false;
          turn = 1; continue;
        }
      }
      let step = ying.think();
      if (!step) {
        // 盲区2：分类 think null
        const reason = classifyThinkNull(ying, board);
        nullStats.ying[reason]++;
        const t = findEmpty(board, 'minCandidates');
        if (!t) break;
        const correct = solution[t.r][t.c];
        step = { row: t.r, col: t.c, num: Math.random() < 0.82 ? correct : wrongNum(board.size, correct), techniqueName: '降级盲猜' };
        s.ying.fallback++;
        trace.push({ step: stepN, side: 'ying', action: 'think_null', reason });
      }
      // 笔记步骤防崩：莹莹写笔记（不落盘）时交回回合，不访问 step.row
      if (step.isNote || step.type === 'note') {
        s.ying.notes = (s.ying.notes || 0) + 1;
        trace.push({ step: stepN, side: 'ying', action: 'note', r: step.r, c: step.c, fake: !!step.isFake });
        turn = 1; continue;
      }
      // 蓄力窗口：莹莹 think 是否选中蓄力格（盲区3）
      if (siegeActive && siegeCell) {
        if (step.row === siegeCell.r && step.col === siegeCell.c) {
          siegeStats.yingPicked++; // 选中但未招架分支（60% 概率之外或填数失败）
        } else {
          siegeStats.yingIgnored++;
        }
      }
      // 盲区1：拦截尝试/冷却阻止/概率失败（模拟凝视）
      // V4.3.31：冷却以回合计递减（--cooldown=N）；null 时保持 200ms 兼容旧行为
      if (withIntercept && bm._aiPlayer && typeof bm._aiPlayer.tryIntercept === 'function') {
        intStats.attempts++;
        if (bm._interceptCooldown > 0) {
          intStats.blockedByCooldown++;
          bm._interceptCooldown = Math.max(0, bm._interceptCooldown - 1);
        } else if (!bm.aiOwned[step.row][step.col] && !bm.playerOwned[step.row][step.col]) {
          const iStep = bm._aiPlayer.tryIntercept(step.row, step.col);
          if (iStep) {
            intStats.success++;
            bm._interceptCooldown = (COOLDOWN_TURNS !== null) ? COOLDOWN_TURNS : 200;
            const wasPlayerCell = bm.playerOwned[step.row][step.col];
            const ok = bm._applyAiMove(iStep);
            bm._aiPlayer.syncFromBoard(board);
            ying.syncFromBoard(board);
            recordOwnership(iStep.row, iStep.col, stepN, 'ayan');
            if (ok) {
              s.ayan.intercepts++;
              if (wasPlayerCell) s.ying.stolen++;
              trace.push({ step: stepN, side: 'ayan', action: 'intercept', r: iStep.row, c: iStep.col });
            }
          } else {
            intStats.failedByChance++;
          }
        } else {
          intStats.failedByChance++; // 格已被占（含幽灵），拦截不可能成功
        }
      }
      const { row, col, num } = step;
      const cell = board.cells[row]?.[col];
      if (!cell || cell.fixedNum || cell.fillNum) { turn = 1; continue; }
      const isCorrect = num === solution[row][col];
      const wasAi = bm.aiOwned[row][col];
      const res = engine.fillCell(row, col, num);
      if (!res.success) { turn = 1; continue; }
      bm.onPlayerFill(row, col, num, isCorrect);
      ying.syncFromBoard(board);
      if (bm._aiPlayer) bm._aiPlayer.syncFromBoard(board);
      recordOwnership(row, col, stepN, 'ying');
      s.ying.fills++; if (isCorrect) s.ying.correct++; else s.ying.wrong++;
      if (wasAi) s.ying.stolen++;
      trace.push({ step: stepN, side: 'ying', action: 'fill', r: row, c: col, num, correct: isCorrect, technique: step.techniqueName, stolen: wasAi });
    } else {
      // ---- 阿妍（AI 侧）回合 ----
      let step = bm._aiPlayer ? bm._aiPlayer.think() : null;
      if (!step) {
        const reason = classifyThinkNull(bm._aiPlayer, board);
        nullStats.ayan[reason]++;
        const t = findEmpty(board, 'minCandidates');
        if (!t) break;
        const correct = solution[t.r][t.c];
        step = { row: t.r, col: t.c, num: Math.random() < 0.98 ? correct : wrongNum(board.size, correct), techniqueName: '降级' };
        s.ayan.fallback++;
        trace.push({ step: stepN, side: 'ayan', action: 'think_null', reason });
      }
      // 笔记步骤防崩：AI 写笔记（不落盘）时交回回合，不访问 step.row
      if (step.isNote || step.type === 'note') {
        s.ayan.notes = (s.ayan.notes || 0) + 1;
        trace.push({ step: stepN, side: 'ayan', action: 'note', r: step.r, c: step.c, fake: !!step.isFake });
        bm._aiPlayer.syncFromBoard(board);
        ying.syncFromBoard(board);
        turn ^= 1;
        continue;
      }
      const wasPlayer = bm.playerOwned[step.row][step.col];
      const applied = bm._applyAiMove(step);
      bm._aiPlayer.syncFromBoard(board);
      ying.syncFromBoard(board);
      const cell = board.cells[step.row]?.[step.col];
      if (applied && cell && !cell.fillNum) {
        const isCorrect = step.num === solution[step.row][step.col];
        s.ayan.fills++; if (isCorrect) s.ayan.correct++; else s.ayan.wrong++;
        if (wasPlayer) s.ayan.intercepts++;
        recordOwnership(step.row, step.col, stepN, 'ayan');
        trace.push({ step: stepN, side: 'ayan', action: 'fill_ghost', r: step.row, c: step.col, num: step.num, correct: isCorrect, technique: step.techniqueName, stoleBack: wasPlayer });
      } else if (bm._underSiege) {
        // 蓄力开始：不等待，交回回合（完成由异步定时器负责，siege_end 事件记录）
        trace.push({ step: stepN, side: 'ayan', action: 'siege_hold' });
      }
      // 蓄力窗口结束检测（_underSiege 已清）
      if (siegeActive && !bm._underSiege) {
        siegeActive = false;
        const completed = evCount['siege_end'] || 0;
        trace.push({ step: stepN, side: 'ayan', action: 'siege_end', completed });
      }
    }
    turn ^= 1;
  }

  const winner = (bm.playerCount === bm.aiCount) ? 'draw'
    : (bm.playerCount > bm.aiCount ? 'ying' : 'ayan');

  const result = {
    winner,
    yingCount: bm.playerCount, aiCount: bm.aiCount,
    steal: bm._stealCount, counter: bm._counterCount,
    sieges: evCount['siege_end'] || 0, parries: evCount['parry'] || 0, deathblows: evCount['deathblow'] || 0,
    bestCombo: bm._combo.bestCombo,
    s,
    // 盲区1-4 过程统计
    interceptStats: intStats,
    thinkNullStats: nullStats,
    siegeStats,
    ownership: {
      hotPotatoCount,
      ghostLifetimeAvg: ghostLifetimes.length ? (ghostLifetimes.reduce((a, b) => a + b, 0) / ghostLifetimes.length) : null,
      ghostLifetimeSamples: ghostLifetimes.length,
      reclaimDelayAvg: reclaimDelays.length ? (reclaimDelays.reduce((a, b) => a + b, 0) / reclaimDelays.length) : null,
      reclaimDelaySamples: reclaimDelays.length,
    },
    traceLen: trace.length,
  };
  if (TRACE) {
    for (const t of trace) console.log(JSON.stringify({ roundTrace: true, level: LEVEL, ...t }));
  }
  return result;
}

(async () => {
  const results = [];
  for (let i = 0; i < ROUNDS; i++) results.push(await playOnce(WITH_INTERCEPT));

  const agg = {
    win: { ying: 0, ayan: 0, draw: 0 },
    s: {
      ying: { fills: 0, correct: 0, wrong: 0, stolen: 0 },
      ayan: { fills: 0, correct: 0, wrong: 0, intercepts: 0 },
    },
    interceptStats: { attempts: 0, success: 0, blockedByCooldown: 0, failedByChance: 0 },
    thinkNullStats: {
      ying: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 },
      ayan: { noCandidates: 0, candidatesOccupied: 0, rngMiss: 0 },
    },
    siegeStats: { total: 0, yingPicked: 0, yingPickedCorrect: 0, yingPickedWrong: 0, yingIgnored: 0, yingStunnedDuring: 0 },
    ownership: { hotPotato: 0, ghostLifetimeSum: 0, ghostLifetimeN: 0, reclaimDelaySum: 0, reclaimDelayN: 0 },
    steal: 0, counter: 0, sieges: 0, parries: 0, deathblows: 0, bestCombo: 0,
  };
  for (const r of results) {
    agg.win[r.winner]++;
    agg.s.ying.fills += r.s.ying.fills; agg.s.ying.correct += r.s.ying.correct; agg.s.ying.wrong += r.s.ying.wrong; agg.s.ying.stolen += r.s.ying.stolen;
    agg.s.ayan.fills += r.s.ayan.fills; agg.s.ayan.correct += r.s.ayan.correct; agg.s.ayan.wrong += r.s.ayan.wrong; agg.s.ayan.intercepts += r.s.ayan.intercepts;
    agg.interceptStats.attempts += r.interceptStats.attempts;
    agg.interceptStats.success += r.interceptStats.success;
    agg.interceptStats.blockedByCooldown += r.interceptStats.blockedByCooldown;
    agg.interceptStats.failedByChance += r.interceptStats.failedByChance;
    agg.thinkNullStats.ying.noCandidates += r.thinkNullStats.ying.noCandidates;
    agg.thinkNullStats.ying.candidatesOccupied += r.thinkNullStats.ying.candidatesOccupied;
    agg.thinkNullStats.ying.rngMiss += r.thinkNullStats.ying.rngMiss;
    agg.thinkNullStats.ayan.noCandidates += r.thinkNullStats.ayan.noCandidates;
    agg.thinkNullStats.ayan.candidatesOccupied += r.thinkNullStats.ayan.candidatesOccupied;
    agg.thinkNullStats.ayan.rngMiss += r.thinkNullStats.ayan.rngMiss;
    agg.siegeStats.total += r.siegeStats.total;
    agg.siegeStats.yingPicked += r.siegeStats.yingPicked;
    agg.siegeStats.yingPickedCorrect += r.siegeStats.yingPickedCorrect;
    agg.siegeStats.yingPickedWrong += r.siegeStats.yingPickedWrong;
    agg.siegeStats.yingIgnored += r.siegeStats.yingIgnored;
    agg.siegeStats.yingStunnedDuring += r.siegeStats.yingStunnedDuring;
    agg.ownership.hotPotato += r.ownership.hotPotatoCount;
    agg.ownership.ghostLifetimeSum += (r.ownership.ghostLifetimeAvg ?? 0) * (r.ownership.ghostLifetimeSamples || 0);
    agg.ownership.ghostLifetimeN += r.ownership.ghostLifetimeSamples || 0;
    agg.ownership.reclaimDelaySum += (r.ownership.reclaimDelayAvg ?? 0) * (r.ownership.reclaimDelaySamples || 0);
    agg.ownership.reclaimDelayN += r.ownership.reclaimDelaySamples || 0;
    agg.steal += r.steal; agg.counter += r.counter; agg.sieges += r.sieges; agg.parries += r.parries; agg.deathblows += r.deathblows;
    agg.bestCombo = Math.max(agg.bestCombo, r.bestCombo);
  }
  const out = {
    level: LEVEL, mode: WITH_INTERCEPT ? 'intercept' : 'plain', rounds: ROUNDS,
    player: PLAYER, spawn: SPAWN,
    params: { cooldownTurns: COOLDOWN_TURNS, siegeMs: SIEGE_MS, focusGain: FOCUS_GAIN },
    win: agg.win,
    fillStats: agg.s,
    intercept: agg.interceptStats,
    thinkNull: agg.thinkNullStats,
    siege: agg.siegeStats,
    ownership: {
      hotPotatoAvg: (agg.ownership.hotPotato / ROUNDS).toFixed(1),
      ghostLifetimeAvg: agg.ownership.ghostLifetimeN ? (agg.ownership.ghostLifetimeSum / agg.ownership.ghostLifetimeN).toFixed(1) : null,
      reclaimDelayAvg: agg.ownership.reclaimDelayN ? (agg.ownership.reclaimDelaySum / agg.ownership.reclaimDelayN).toFixed(1) : null,
    },
    events: { steal: agg.steal, counter: agg.counter, sieges: agg.sieges, parries: agg.parries, deathblows: agg.deathblows, bestCombo: agg.bestCombo },
    perRound: results.map((r) => `${r.winner}(莹${r.yingCount}:妍${r.aiCount})`),
  };
  console.log(JSON.stringify(out, null, 1));
  process.exit(0);
})();
