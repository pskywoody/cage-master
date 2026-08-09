// P0 参数扫描 v4：80 组矩阵（5 cooldown × 4 siege × 4 focus）× 20 局
// 采纳评审：① HotPotatoAvg = 所有权变更次数 / 已填格数；② FunScore = 0.35×tempo + 0.35×risk + 0.30×climax
// ③ 新增"忍杀触发时盘面完成度"（目标 50%-80%）；④ 输出 mean + std（防随机抖动假达标）
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { BattleManager, AIPlayerCore } from '../core/battle-manager.js';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const LEVEL = 109;
const PLAYER = 'average';
const ROUNDS = 20;

const COOLDOWNS = [1, 3, 5, 8, 12];
const SIEGE_MS = [1000, 2000, 3000, 5000];
const FOCUS_GAINS = [1, 3, 5, 8];

const rawLevel = JSON.parse(fs.readFileSync(path.join(ROOT, `data/levels/level-${LEVEL}.json`), 'utf8'));

function findEmpty(board) {
  const cands = [];
  for (let r = 0; r < board.size; r++) for (let c = 0; c < board.size; c++) {
    const cell = board.cells[r][c];
    if (cell && !cell.fixedNum && !cell.fillNum) {
      const n = cell.candidates instanceof Set ? cell.candidates.size : (Array.isArray(cell.candidates) ? cell.candidates.length : 9);
      cands.push({ r, c, n });
    }
  }
  if (!cands.length) return null;
  cands.sort((a, b) => a.n - b.n);
  return cands[0];
}
function wrongNum(size, correct) { let n = correct; while (n === correct) n = 1 + Math.floor(Math.random() * size); return n; }

async function playOnce(cooldown, siegeMs, focusGain) {
  const levelData = JSON.parse(JSON.stringify(rawLevel));
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const solution = levelData.solution;

  const evCount = {};
  const bm = new BattleManager({ onEvent: (t) => { evCount[t] = (evCount[t] || 0) + 1; }, focusGain });
  bm.start({
    board, solution,
    opponent: {
      id: 'yan', displayName: '阿妍',
      lockCells: [
        { cageId: 'A', releaseEvent: 'gear_1' },
        { cageId: 'F', releaseEvent: 'gear_2' },
        { cageId: 'K', releaseEvent: 'gear_3' },
      ],
      battleTuning: { isKiller: true, pulseEnabled: true, fadeCagesInBattle: true },
    },
    onEnd: () => {},
  });
  if (bm._aiPlayer) bm._aiPlayer._personality.siegeTime = siegeMs;
  bm.winTarget = bm.totalEmpty;

  const playerAI = new AIPlayerCore(board, PLAYER, (r, c) => bm.getCellCategory(r, c), bm._weightedScoreEnabled);

  const intStats = { attempts: 0, success: 0, blockedByCooldown: 0, failedByChance: 0 };
  let siegeTotal = 0, siegePicked = 0, siegePickedCorrect = 0;
  let siegeActive = false, siegeCell = null;
  let ownerChanges = 0;            // 所有权变更次数（HotPotato 分子）
  let deathblowCompletes = [];     // 每次忍杀触发时的盘面完成度
  let prevDeathblow = 0;
  let yingFills = 0, yingCorrect = 0;

  let turn = 0, guard = 0;
  while (bm.active && !bm.ended && guard++ < 500) {
    if (turn === 0) {
      if (bm._playerStunned) { turn = 1; continue; }
      if (bm._underSiege && !siegeActive) {
        siegeActive = true; siegeCell = { r: bm._underSiege.r, c: bm._underSiege.c };
        siegeTotal++;
      }
      if (siegeActive && bm._underSiege) {
        const sg = bm._underSiege;
        const sgCell = board.cells[sg.r]?.[sg.c];
        if (sgCell && !sgCell.fixedNum && !sgCell.fillNum && Math.random() < 0.6) {
          const guessed = Math.random() < 0.82;
          const num = guessed ? solution[sg.r][sg.c] : wrongNum(board.size, solution[sg.r][sg.c]);
          engine.fillCell(sg.r, sg.c, num);
          bm.onPlayerFill(sg.r, sg.c, num, guessed);
          playerAI.syncFromBoard(board);
          if (bm._aiPlayer) bm._aiPlayer.syncFromBoard(board);
          siegePicked++; if (guessed) siegePickedCorrect++;
          siegeActive = false;
          turn = 1; continue;
        }
      }
      let step = playerAI.think();
      if (!step) {
        const t = findEmpty(board);
        if (!t) break;
        const correct = solution[t.r][t.c];
        step = { row: t.r, col: t.c, num: Math.random() < 0.82 ? correct : wrongNum(board.size, correct), techniqueName: '降级' };
      }
      if (step && step.type === 'note') { turn = 1; continue; } // 笔记操作：模拟中跳过（不计填数）
      if (bm._aiPlayer && typeof bm._aiPlayer.tryIntercept === 'function') {
        intStats.attempts++;
        if (bm._interceptCooldown > 0) {
          intStats.blockedByCooldown++;
          bm._interceptCooldown = Math.max(0, bm._interceptCooldown - 1);
        } else if (!bm.aiOwned[step.row][step.col] && !bm.playerOwned[step.row][step.col]) {
          const iStep = bm._aiPlayer.tryIntercept(step.row, step.col);
          if (iStep) {
            intStats.success++;
            bm._interceptCooldown = cooldown;
            bm._applyAiMove(iStep);
            bm._aiPlayer.syncFromBoard(board);
            playerAI.syncFromBoard(board);
          } else intStats.failedByChance++;
        } else intStats.failedByChance++;
      }
      const { row, col, num } = step;
      const cell = board.cells[row]?.[col];
      if (!cell || cell.fixedNum || cell.fillNum) { turn = 1; continue; }
      const wasAi = bm.aiOwned[row][col];
      const wasPlayer = bm.playerOwned[row][col];
      const isCorrect = num === solution[row][col];
      const res = engine.fillCell(row, col, num);
      if (!res.success) { turn = 1; continue; }
      bm.onPlayerFill(row, col, num, isCorrect);
      playerAI.syncFromBoard(board);
      if (bm._aiPlayer) bm._aiPlayer.syncFromBoard(board);
      yingFills++; if (isCorrect) yingCorrect++;
      if (wasAi || wasPlayer) ownerChanges++; // 抢回/易主
    } else {
      let step = bm._aiPlayer ? bm._aiPlayer.think() : null;
      if (!step) {
        const t = findEmpty(board);
        if (!t) break;
        const correct = solution[t.r][t.c];
        step = { row: t.r, col: t.c, num: Math.random() < 0.98 ? correct : wrongNum(board.size, correct), techniqueName: '降级' };
      }
      if (step && step.type === 'note') { turn = 0; continue; } // 笔记操作：模拟中跳过
      const wasPlayer = bm.playerOwned[step.row][step.col];
      bm._applyAiMove(step);
      bm._aiPlayer.syncFromBoard(board);
      playerAI.syncFromBoard(board);
      if (wasPlayer) ownerChanges++;
      if (siegeActive && !bm._underSiege) siegeActive = false;
    }
    // 忍杀完成度采样：deathblow 计数增加时记录
    const dbNow = evCount['deathblow'] || 0;
    if (dbNow > prevDeathblow) {
      prevDeathblow = dbNow;
      const filled = bm.playerCount + bm.aiCount;
      deathblowCompletes.push(bm.totalEmpty ? +(filled / bm.totalEmpty * 100).toFixed(1) : 0);
    }
    turn ^= 1;
  }
  const winner = (bm.playerCount === bm.aiCount) ? 'draw' : (bm.playerCount > bm.aiCount ? 'ying' : 'ayan');
  const filledTotal = bm.playerCount + bm.aiCount;
  return {
    winner,
    yingCount: bm.playerCount, aiCount: bm.aiCount,
    hotPotatoAvg: filledTotal ? +(ownerChanges / filledTotal).toFixed(3) : 0,
    interceptRate: intStats.attempts ? +(intStats.success / intStats.attempts * 100).toFixed(1) : 0,
    parryRate: siegeTotal ? +(siegePicked / siegeTotal * 100).toFixed(1) : 0,
    stealRate: yingFills ? +(yingCorrect / yingFills * 100).toFixed(1) : 0,
    deathblows: evCount['deathblow'] || 0,
    deathblowCompletes,
    winMargin: Math.abs(bm.playerCount - bm.aiCount),
  };
}

// ---- FunScore（评审定义）：0.35 tempo + 0.35 risk + 0.30 climax ----
function trap(x, lo, hi, soft = 0.8) {
  if (x >= lo && x <= hi) return 1;
  if (x < lo) { const d = lo - x; return d > lo * soft ? 0 : 1 - d / (lo * soft); }
  const d = x - hi; return d > hi * soft ? 0 : 1 - d / (hi * soft);
}
function funScore(agg) {
  // tempo：拦截率 [20,30] + 易手率 hotPotatoAvg 高为好（目标 >0.3 归一）
  const tempo = trap(agg.interceptRateMean, 20, 30) * 70 + trap(agg.hotPotatoAvg * 100, 30, 60) * 30;
  // risk：招架率 [40,60] + 抢格正确率 [60,80]
  const risk = trap(agg.parryRateMean, 40, 60) * 50 + trap(agg.stealRateMean, 60, 80) * 50;
  // climax：忍杀触发局占比(>80%) + 完成度[50,80] + 胜者领先>3
  const killRate = agg.deathblowRoundsPct; // 已是百分比
  const comp = agg.deathblowCompleteAvg;
  const climax = trap(killRate, 80, 100) * 40 + (comp ? trap(comp, 50, 80) * 35 : 0) + trap(agg.winMarginAvg, 3, 8) * 25;
  return {
    tempo: Math.round(tempo), risk: Math.round(risk), climax: Math.round(climax),
    total: Math.round(0.35 * tempo + 0.35 * risk + 0.30 * climax),
  };
}
function std(arr) {
  if (!arr.length) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.round(Math.sqrt(arr.reduce((s, v) => s + (v - m) * (v - m), 0) / arr.length) * 10) / 10;
}

(async () => {
  const out = {};
  let totalRounds = 0;
  for (const cd of COOLDOWNS) {
    out[cd] = {};
    for (const sm of SIEGE_MS) {
      out[cd][sm] = {};
      for (const fg of FOCUS_GAINS) {
        const wins = { ying: 0, ayan: 0, draw: 0 };
        const iv = [], pv = [], sv = [], hv = [], mv = [], dv = [];
        let deathblowRounds = 0, completesAll = [];
        for (let i = 0; i < ROUNDS; i++) {
          const r = await playOnce(cd, sm, fg);
          totalRounds++;
          wins[r.winner]++;
          iv.push(r.interceptRate); pv.push(r.parryRate); sv.push(r.stealRate);
          hv.push(r.hotPotatoAvg); mv.push(r.winMargin); dv.push(r.deathblows);
          if (r.deathblows > 0) deathblowRounds++;
          completesAll = completesAll.concat(r.deathblowCompletes);
        }
        const agg = {
          rounds: ROUNDS, win: wins,
          interceptRateMean: +(iv.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(1),
          interceptRateStd: std(iv),
          parryRateMean: +(pv.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(1),
          stealRateMean: +(sv.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(1),
          hotPotatoAvg: +(hv.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(3),
          winMarginAvg: +(mv.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(1),
          deathblowPerRound: +(dv.reduce((a, b) => a + b, 0) / ROUNDS).toFixed(2),
          deathblowRoundsPct: Math.round(deathblowRounds / ROUNDS * 100),
          deathblowCompleteAvg: completesAll.length ? +(completesAll.reduce((a, b) => a + b, 0) / completesAll.length).toFixed(1) : null,
        };
        agg.fun = funScore(agg);
        out[cd][sm][fg] = agg;
      }
    }
  }
  const result = { level: LEVEL, player: PLAYER, rounds: ROUNDS, totalRounds, matrix: out };
  fs.writeFileSync(path.join(ROOT, 'scripts/scan-output.json'), JSON.stringify(result, null, 1), 'utf8');
  console.log(JSON.stringify(result, null, 1));
  process.exit(0);
})();
