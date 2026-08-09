// ============================================================
//  replay-capture.mjs - 单局对战回放捕获（V1.0）
// ============================================================
//  用法：
//    node scripts/replay-capture.mjs [关卡] [--cooldown=N] [--siegeMs=N] [--focusGain=N]
//      [--player=ying|average|yan] [--spawn=yan|ying] [--output=replay.json] [--trace]
//    默认输出到 replay-sample.json
// ============================================================
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { BattleManager, AIPlayerCore } from '../core/battle-manager.js';
import { HeadlessEngine } from '../core/headless-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---- CLI args ----
const LEVEL = Number(process.argv[2] || 109);
const COOLDOWN = (() => { const m = process.argv.find(a => a.startsWith('--cooldown=')); return m ? Number(m.split('=')[1]) : 5; })();
const SIEGE_MS = (() => { const m = process.argv.find(a => a.startsWith('--siegeMs=')); return m ? Number(m.split('=')[1]) : 3000; })();
const FOCUS_GAIN = (() => { const m = process.argv.find(a => a.startsWith('--focusGain=')); return m ? Number(m.split('=')[1]) : 5; })();
const PLAYER = (() => { const m = process.argv.find(a => a.startsWith('--player=')); return m ? m.split('=')[1] : 'ying'; })();
const SPAWN = (() => { const m = process.argv.find(a => a.startsWith('--spawn=')); return m ? m.split('=')[1] : 'yan'; })();
const OUTPUT = (() => { const m = process.argv.find(a => a.startsWith('--output=')); return m ? m.split('=')[1] : 'replay-sample.json'; })();
const TRACE = process.argv.includes('--trace');

const rawLevel = JSON.parse(fs.readFileSync(path.join(ROOT, `data/levels/level-${LEVEL}.json`), 'utf8'));

// ---- Helpers ----
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

// ---- AI Personality configs ----
const AI_PERSONALITIES = {
  blind: {
    id: 'blind', displayName: '莹莹',
    baseErrorRate: 0.18, misreadChance: 0.15, blindBoxChance: 0.08,
    techDirection: 'lowest', interceptProbability: 0.0,
    thinkTime: 800, siegeTime: SIEGE_MS,
  },
  average: {
    id: 'average', displayName: '平均玩家',
    baseErrorRate: 0.10, misreadChance: 0.08, blindBoxChance: 0.03,
    techDirection: 'lowest', interceptProbability: 0.0,
    thinkTime: 600, siegeTime: SIEGE_MS,
  },
  expert: {
    id: 'expert', displayName: '阿妍',
    baseErrorRate: 0.02, misreadChance: 0.03, blindBoxChance: 0.0,
    techDirection: 'highest', interceptProbability: 0.0,
    thinkTime: 400, siegeTime: SIEGE_MS,
  },
};

// ---- Main capture ----
async function captureReplay() {
  const levelData = JSON.parse(JSON.stringify(rawLevel));
  const engine = new HeadlessEngine();
  engine.loadLevel(levelData);
  const board = engine.getBoard();
  const solution = levelData.solution;
  const gridSize = levelData.gridSize || board.size;

  const evCount = {};
  const bm = new BattleManager({
    onEvent: (t) => { evCount[t] = (evCount[t] || 0) + 1; },
    focusGain: FOCUS_GAIN,
  });
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
  if (bm._aiPlayer) bm._aiPlayer._personality.siegeTime = SIEGE_MS;
  bm.winTarget = bm.totalEmpty;

  const playerAI = new AIPlayerCore(board, PLAYER, (r, c) => bm.getCellCategory(r, c), bm._weightedScoreEnabled);
  if (playerAI._personality) playerAI._personality.siegeTime = SIEGE_MS;

  // ---- Frame capture ----
  const frames = [];
  let turn = 0, guard = 0;
  let siegeActive = false;
  let prevDeathblow = 0, prevCombo = 0;

  // Record initial board state
  function captureFrame(event, eventDetail, extra) {
    const frame = {
      step: frames.length + 1,
      turn: turn,
      player: turn === 0 ? 'ying' : 'ayan',
      row: extra?.row ?? -1,
      col: extra?.col ?? -1,
      num: extra?.num ?? 0,
      correct: extra?.correct ?? true,
      event: event || null,
      eventDetail: eventDetail || null,
      yingCount: bm.playerCount,
      aiCount: bm.aiCount,
      combo: bm._combo?.count || 0,
      bestCombo: bm._combo?.bestCombo || 0,
      focusBar: bm.playerCount > 0 ? Math.min(1, bm.playerCount / (bm.totalEmpty || 1) * 1.5) : 0.5,
      interceptCooldown: bm._interceptCooldown || 0,
      underSiege: bm._underSiege ? { r: bm._underSiege.r, c: bm._underSiege.c } : null,
    };
    frames.push(frame);
  }

  while (bm.active && !bm.ended && guard++ < 500) {
    if (turn === 0) {
      // ---- Ying's turn ----
      if (bm._playerStunned) { turn = 1; continue; }

      // Siege check
      if (bm._underSiege && !siegeActive) {
        siegeActive = true;
        captureFrame('siege_start', `蓄力锁定 (${bm._underSiege.r},${bm._underSiege.c})`, {
          row: bm._underSiege.r, col: bm._underSiege.c,
        });
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

          // Check for deathblow
          const dbNow = evCount['deathblow'] || 0;
          const ev = dbNow > prevDeathblow ? 'deathblow' : (guessed ? null : 'parry');
          if (dbNow > prevDeathblow) prevDeathblow = dbNow;

          captureFrame(ev, ev === 'parry' ? '招架成功' : (ev === 'deathblow' ? '忍杀触发！' : ''), {
            row: sg.r, col: sg.c, num, correct: guessed,
          });

          siegeActive = false;
          turn = 1; continue;
        }
      }

      // Normal AI think
      let step = playerAI.think();
      if (!step) {
        const t = findEmpty(board);
        if (!t) break;
        const correct = solution[t.r][t.c];
        step = { row: t.r, col: t.c, num: Math.random() < 0.82 ? correct : wrongNum(board.size, correct), techniqueName: '降级' };
      }

      // Intercept check
      if (bm._aiPlayer && typeof bm._aiPlayer.tryIntercept === 'function') {
        if (bm._interceptCooldown > 0) {
          bm._interceptCooldown = Math.max(0, bm._interceptCooldown - 1);
        } else if (!bm.aiOwned[step.row][step.col] && !bm.playerOwned[step.row][step.col]) {
          const iStep = bm._aiPlayer.tryIntercept(step.row, step.col);
          if (iStep) {
            bm._interceptCooldown = COOLDOWN;
            bm._applyAiMove(iStep);
            bm._aiPlayer.syncFromBoard(board);
            playerAI.syncFromBoard(board);
            captureFrame('intercept', `拦截 (${iStep.row},${iStep.col})`, {
              row: iStep.row, col: iStep.col, num: iStep.num, correct: true,
            });
            // Intercept counts as ayan's turn
            turn = 1; continue;
          }
        }
      }

      // Apply Ying's move
      const { row, col, num } = step;
      const cell = board.cells[row]?.[col];
      if (!cell || cell.fixedNum || cell.fillNum) { turn = 1; continue; }
      const isCorrect = num === solution[row][col];
      const res = engine.fillCell(row, col, num);
      if (!res.success) { turn = 1; continue; }

      bm.onPlayerFill(row, col, num, isCorrect);
      playerAI.syncFromBoard(board);
      if (bm._aiPlayer) bm._aiPlayer.syncFromBoard(board);

      // Check combo event
      const comboNow = bm._combo?.count || 0;
      let ev = null;
      if (comboNow > prevCombo && comboNow >= 3) ev = 'combo';
      prevCombo = comboNow;

      captureFrame(ev, ev === 'combo' ? `${comboNow}连击！` : '', { row, col, num, correct: isCorrect });
    } else {
      // ---- Ayan's turn ----
      let step = bm._aiPlayer ? bm._aiPlayer.think() : null;
      if (!step) {
        const t = findEmpty(board);
        if (!t) break;
        const correct = solution[t.r][t.c];
        step = { row: t.r, col: t.c, num: Math.random() < 0.98 ? correct : wrongNum(board.size, correct), techniqueName: '降级' };
      }

      // Check for deathblow on ayan's turn
      const dbBefore = evCount['deathblow'] || 0;
      bm._applyAiMove(step);
      bm._aiPlayer.syncFromBoard(board);
      playerAI.syncFromBoard(board);
      const dbAfter = evCount['deathblow'] || 0;

      let ev = null;
      if (dbAfter > dbBefore) {
        ev = 'deathblow';
        prevDeathblow = dbAfter;
      }

      captureFrame(ev, ev === 'deathblow' ? '忍杀触发！' : '', {
        row: step.row, col: step.col, num: step.num, correct: step.num === solution[step.row]?.[step.col],
      });

      if (siegeActive && !bm._underSiege) {
        siegeActive = false;
        captureFrame('siege_end', '蓄力结束', {});
      }
    }

    turn ^= 1;
  }

  // ---- Build replay JSON ----
  const replay = {
    level: LEVEL,
    gridSize,
    params: {
      cooldown: COOLDOWN,
      siegeMs: SIEGE_MS,
      focusGain: FOCUS_GAIN,
      player: PLAYER,
      spawn: SPAWN,
    },
    board: levelData.boardData,
    solution: levelData.solution,
    cages: (levelData.cages || []).map(c => ({
      sum: c.sum,
      cells: c.cells,
    })),
    result: {
      winner: (bm.playerCount === bm.aiCount) ? 'draw' : (bm.playerCount > bm.aiCount ? 'ying' : 'ayan'),
      yingCount: bm.playerCount,
      aiCount: bm.aiCount,
      totalEmpty: bm.totalEmpty,
      totalFrames: frames.length,
    },
    summary: {
      yingCorrect: bm.playerCount,
      aiCorrect: bm.aiCount,
      deathblows: evCount['deathblow'] || 0,
      bestCombo: bm._combo?.bestCombo || 0,
    },
    frames,
  };

  const outPath = path.join(ROOT, 'scripts', OUTPUT);
  fs.writeFileSync(outPath, JSON.stringify(replay, null, 1), 'utf8');
  console.log(`Replay saved to ${outPath}`);
  console.log(`  Level: ${LEVEL}  Grid: ${gridSize}×${gridSize}`);
  console.log(`  Params: cooldown=${COOLDOWN} siegeMs=${SIEGE_MS} focusGain=${FOCUS_GAIN}`);
  console.log(`  Result: ${replay.result.winner} (莹${replay.result.yingCount}:妍${replay.result.aiCount})`);
  console.log(`  Frames: ${frames.length}  Deathblows: ${replay.summary.deathblows}  BestCombo: ${replay.summary.bestCombo}`);

  if (TRACE) {
    console.log(JSON.stringify(replay, null, 1));
  }

  process.exit(0);
}

captureReplay().catch(err => {
  console.error('Capture failed:', err);
  process.exit(1);
});