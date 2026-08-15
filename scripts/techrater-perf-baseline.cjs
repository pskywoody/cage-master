'use strict';
/**
 * TechRater Optimization Preflight —— 性能基线采集（只读测量，不修改生产逻辑）
 *
 * 工作负载两套：
 *   1) storyLevels   —— data/levels/*.json（正式剧情关卡）
 *   2) releasePool   —— data/release-pool-b3final.json（生成器产出的高技巧关卡，真正的热点负载）
 *
 * 每关跑「TechRater.fromBoard + solve(2000) + getRating」，取 3 次求解中位耗时。
 * 输出：data/techrater-perf-baseline.json + 控制台摘要。
 *
 * 用法：node scripts/techrater-perf-baseline.cjs
 */
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const ROOT = path.join(__dirname, '..');

// 兼容 board.js 末尾的无条件 `window.Board = Board`（与 cage-generator-v9 的 _loadDeps 一致）。
if (typeof global.window === 'undefined') global.window = global;

function loadGlobal(fp) {
  (0, eval)(fs.readFileSync(fp, 'utf-8'));
}
loadGlobal(path.join(ROOT, 'core', 'board.js'));
loadGlobal(path.join(ROOT, 'core', 'tech-rater.js'));

const Board = global.Board || globalThis.Board;
const TechRater = global.TechRater || globalThis.TechRater;
if (!Board || !TechRater) {
  console.error('Board / TechRater 未挂载到全局');
  process.exit(1);
}

const RUNS = 3;

function round4(x) { return Math.round(x * 10000) / 10000; }

function benchOne(size, cells, cages, levelId) {
  cages = (cages && Array.isArray(cages)) ? cages : [];

  // fromBoard 构造成本（单独一次）
  const b0 = new Board(size);
  b0.loadLevel({ cells, cages, levelId });
  const tb0 = performance.now();
  TechRater.fromBoard(b0);
  const tb1 = performance.now();
  const boardMs = tb1 - tb0;

  const solveTimes = [];
  let rating = null, solvable = null, ratingMs = 0;

  for (let i = 0; i < RUNS; i++) {
    const b = new Board(size);
    b.loadLevel({ cells, cages, levelId });
    const r = TechRater.fromBoard(b);
    const t0 = performance.now();
    const res = r.solve(2000);
    const t1 = performance.now();
    solveTimes.push(t1 - t0);
    if (i === RUNS - 1) {
      const tr0 = performance.now();
      rating = r.getRating();
      ratingMs = performance.now() - tr0;
      solvable = !!res.solvable;
    }
  }

  solveTimes.sort((a, b) => a - b);
  return {
    levelId,
    size,
    solvable,
    steps: rating ? rating.totalSteps : null,
    maxTechLevel: rating ? rating.maxTechLevel : null,
    level: rating ? rating.level : null,
    score: rating ? rating.score : null,
    techCount: rating ? rating.techCount : null,
    boardMs: round4(boardMs),
    solveMs: round4(solveTimes[Math.floor(RUNS / 2)]),
    ratingMs: round4(ratingMs),
  };
}

function quantile(arr, q) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function aggregate(rows, label) {
  const solved = rows.filter((r) => r.solvable === true);
  const solveMsArr = solved.map((r) => r.solveMs);
  const totalSolveMs = solveMsArr.reduce((a, b) => a + b, 0);

  const techMix = {};
  const levelBuckets = {};
  for (const r of solved) {
    const tc = r.techCount || {};
    for (const t of Object.keys(tc)) techMix[t] = (techMix[t] || 0) + tc[t];
    const b = String(r.maxTechLevel);
    levelBuckets[b] = (levelBuckets[b] || 0) + 1;
  }

  const slowest = solved.slice().sort((a, b) => b.solveMs - a.solveMs).slice(0, 10)
    .map((r) => ({ levelId: r.levelId, size: r.size, solveMs: r.solveMs, maxTechLevel: r.maxTechLevel, steps: r.steps }));

  const summary = {
    label,
    totalLevels: rows.length,
    solvedCount: solved.length,
    errorCount: rows.length - solved.length,
    totalSolveMs: round4(totalSolveMs),
    meanSolveMs: round4(totalSolveMs / Math.max(1, solved.length)),
    medianSolveMs: round4(quantile(solveMsArr, 0.5)),
    p95SolveMs: round4(quantile(solveMsArr, 0.95)),
    maxSolveMs: round4(Math.max.apply(null, solveMsArr)),
    techMix,
    maxTechLevelBuckets: levelBuckets,
    slowest,
  };
  return { summary, rows };
}

// ---- 负载 1：正式剧情关卡 ----
const LEVELS_DIR = path.join(ROOT, 'data', 'levels');
const storyFiles = fs.readdirSync(LEVELS_DIR)
  .filter((f) => /^level-\d+\.json$/.test(f))
  .sort((a, b) => parseInt(a.match(/(\d+)/)[1], 10) - parseInt(b.match(/(\d+)/)[1], 10));

const storyRows = [];
for (const f of storyFiles) {
  try {
    const lvl = JSON.parse(fs.readFileSync(path.join(LEVELS_DIR, f), 'utf-8'));
    storyRows.push(benchOne(lvl.gridSize, lvl.boardData, lvl.cages, lvl.levelId));
  } catch (e) {
    storyRows.push({ levelId: parseInt(f.match(/(\d+)/)[1], 10), file: f, error: String(e && e.message || e) });
  }
}

// ---- 负载 2：生成器 release pool（高技巧热点负载） ----
const poolPath = path.join(ROOT, 'data', 'release-pool-b3final.json');
const poolRows = [];
if (fs.existsSync(poolPath)) {
  const pool = JSON.parse(fs.readFileSync(poolPath, 'utf-8'));
  for (const lv of (pool.levels || [])) {
    const size = lv.boardData ? lv.boardData.length : 9;
    try {
      poolRows.push(benchOne(size, lv.boardData, lv.cages, lv.levelId));
    } catch (e) {
      poolRows.push({ levelId: lv.levelId, error: String(e && e.message || e) });
    }
  }
}

const story = aggregate(storyRows, 'storyLevels');
const releasePool = aggregate(poolRows, 'releasePool');

const out = {
  baseline: {
    generatedAt: new Date().toISOString(),
    node: process.version,
    runs: RUNS,
    story: story.summary,
    releasePool: releasePool.summary,
    // 冻结的验收标准（后续任何优化都不得突破这些口径）
    criteria: {
      correctness: {
        // 优化不得改变每关的求解结果与难度口径
        story: '每关 solvable / steps / maxTechLevel / level / score / techCount 与基线逐关一致',
        releasePool: '每关 solvable / steps / maxTechLevel / level / score / techCount 与基线逐关一致',
      },
      performance: {
        story: '总求解耗时 ≤ 基线 totalSolveMs；单关最大 ≤ 基线 maxSolveMs',
        releasePool: '总求解耗时 ≤ 基线 totalSolveMs；单关最大 ≤ 基线 maxSolveMs',
      },
      invariant: 'TechRater 保持纯逻辑推理、guess 未启用；不引入副作用改变候选语义',
    },
    rows: {
      story: story.rows,
      releasePool: poolRows,
    },
  },
};

const outPath = path.join(ROOT, 'data', 'techrater-perf-baseline.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));

function printSummary(name, s) {
  console.log(`\n===== ${name} =====`);
  console.log('关卡:', s.totalLevels, '| 解出:', s.solvedCount, '| 失败/异常:', s.errorCount);
  console.log('总耗时:', s.totalSolveMs, 'ms | 均值/中位/P95/最大:', s.meanSolveMs, '/', s.medianSolveMs, '/', s.p95SolveMs, '/', s.maxSolveMs, 'ms');
  console.log('最高技巧等级分桶:', JSON.stringify(s.maxTechLevelBuckets));
  console.log('技巧分布:', JSON.stringify(s.techMix));
  console.log('最慢10关:', JSON.stringify(s.slowest));
}

console.log('===== TechRater 性能基线（Preflight）=====');
console.log('Node:', process.version, '| 计时次数/关:', RUNS);
printSummary('storyLevels（正式关卡）', story.summary);
printSummary('releasePool（生成器高技巧关卡）', releasePool.summary);
console.log('\n已写入:', outPath);