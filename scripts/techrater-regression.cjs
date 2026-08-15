'use strict';
/**
 * TechRater 逐关指纹（优化前后等价性比对）
 *
 * 对 storyLevels + releasePool 逐关求解，记录：
 *   solvable / steps / maxTechLevel / level / score / techCount
 *   + cageUnique 步骤的 comboCount 与 combos 列表（用于验证 before combos == after combos）
 *
 * 用法：
 *   node scripts/techrater-regression.cjs <输出文件.json>
 * 输出末尾打印该指纹的 SHA-256，便于前后对比。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
if (typeof global.window === 'undefined') global.window = global;
function loadGlobal(fp) { (0, eval)(fs.readFileSync(fp, 'utf-8')); }
loadGlobal(path.join(ROOT, 'core', 'board.js'));
loadGlobal(path.join(ROOT, 'core', 'tech-rater.js'));

const Board = global.Board || globalThis.Board;
const TechRater = global.TechRater || globalThis.TechRater;

function fingerprintLevel(size, cells, cages, levelId) {
  const board = new Board(size);
  board.loadLevel({ cells, cages, levelId });
  const r = TechRater.fromBoard(board);
  const res = r.solve(2000);
  const rating = r.getRating();
  const steps = r.getSteps() || [];

  const cageCombos = [];
  for (const s of steps) {
    if (s && s.technique === 'cageUnique' && s.evidence) {
      cageCombos.push({
        comboCount: s.evidence.comboCount,
        combos: (s.evidence.combos || []).map((c) => c.slice().sort((a, b) => a - b)),
      });
    }
  }

  return {
    levelId,
    solvable: !!res.solvable,
    steps: rating.totalSteps,
    maxTechLevel: rating.maxTechLevel,
    level: rating.level,
    score: rating.score,
    techCount: rating.techCount,
    cageCombos,
  };
}

const rows = [];

// story levels
const LEVELS_DIR = path.join(ROOT, 'data', 'levels');
for (const f of fs.readdirSync(LEVELS_DIR).filter((x) => /^level-\d+\.json$/.test(x)).sort()) {
  const lvl = JSON.parse(fs.readFileSync(path.join(LEVELS_DIR, f), 'utf-8'));
  rows.push(fingerprintLevel(lvl.gridSize, lvl.boardData, lvl.cages || [], lvl.levelId));
}

// release pool
const poolPath = path.join(ROOT, 'data', 'release-pool-b3final.json');
if (fs.existsSync(poolPath)) {
  const pool = JSON.parse(fs.readFileSync(poolPath, 'utf-8'));
  for (const lv of (pool.levels || [])) {
    const size = lv.boardData ? lv.boardData.length : 9;
    rows.push(fingerprintLevel(size, lv.boardData, lv.cages || [], lv.levelId));
  }
}

const payload = JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2);
const outPath = process.argv[2] || path.join(ROOT, 'data', 'techrater-fingerprint.json');
fs.writeFileSync(outPath, payload, 'utf-8');
const sha = crypto.createHash('sha256').update(payload).digest('hex');
console.log('rows:', rows.length);
console.log('sha256:', sha);
console.log('written:', outPath);