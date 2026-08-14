/**
 * ============================================================
 *  generate-release-pool.cjs — B3-FINAL 正式 level pool 生成
 * ============================================================
 *
 *  产品化阶段：用【B3-FINAL 默认构造】（不显式传冻结旋钮，验证生产路径走默认）
 *  生成正式 level pool，产出 release candidate。
 *
 *  重点（不是单个最高指标，而是稳定性）：
 *    top4Share / entropyH 是否稳定
 *    difficulty curve（score）是否平滑
 *    uniqueAll 是否持续 true
 *    singleton / complex 是否在冻结基线范围内
 *
 *  用法:
 *    node scripts/generate-release-pool.cjs --count 100 --seed 20260810
 *      --count   生成关数（默认 100）
 *      --seed    固定 seed（默认 20260810，seed 递增保证互异样本）
 *      -o        输出 JSON 路径（默认 data/release-pool-b3final.json）
 *      --verbose 逐关打印
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

function canonicalize(cells) {
  if (!cells || cells.length === 0) return '';
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const transforms = [
    (r, c) => [r, c], (r, c) => [c, -r], (r, c) => [-r, -c], (r, c) => [-c, r],
    (r, c) => [-r, c], (r, c) => [c, r], (r, c) => [r, -c], (r, c) => [-c, -r],
  ];
  let best = null;
  for (const t of transforms) {
    const out = pts.map(([r, c]) => t(r, c));
    const minR = Math.min(...out.map((p) => p[0]));
    const minC = Math.min(...out.map((p) => p[1]));
    const norm = out.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const key = norm.map(([r, c]) => r + ',' + c).join('|');
    if (best === null || key.localeCompare(best) < 0) best = key;
  }
  return best;
}

function cageFeatures(cells) {
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const boxes = new Set(pts.map(([r, c]) => Math.floor(r / 3) + ',' + Math.floor(c / 3)));
  return { size: pts.length, crossHouse: boxes.size > 1 };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 100, seed: 20260810, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-FINAL 正式 Level Pool 生成 ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}\n`);

  const { CageFixer } = require('./cage-generator-v9.cjs');
  // 生产路径：只传生产参数，不显式传冻结旋钮 → 验证默认值真正生效
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
  });
  console.log(`[生效校验] gb=${gen.growthBias}  W=${gen.shapeDiversityWeight}  objective=${gen.objective.enabled}  λ=${gen.objective.topologyWeight}  ratio=${gen.objective.ratioWeight}  maxCollected=${gen.objective.maxCollected}\n`);

  const t0 = Date.now();
  const levels = [];
  const originalSeed = gen.seed;
  for (let i = 0; i < opts.count; i++) {
    gen.seed = originalSeed !== null ? originalSeed + i * 1000 : Date.now() + i;
    const lv = gen.generate({});
    const score = lv.difficultyInfo ? lv.difficultyInfo.score : null;
    levels.push({
      index: i + 1,
      levelId: lv.levelId || `release-${i + 1}`,
      score,
      star: lv.difficultyInfo ? lv.difficultyInfo.level : null,
      cageReasoningRatio: lv._objective ? lv._objective.cageReasoningRatio : null,
      unique: !(lv.meta && lv.meta.unique === false),
      cages: lv.cages || [],
      boardData: lv.boardData || null,
      solution: lv.solution || null,
    });
    if (opts.verbose) console.log(`  [${i + 1}/${opts.count}] score=${score}`);
  }
  gen.seed = originalSeed;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ---- 聚合指标（与回归分析一致） ----
  const shapeMap = new Map();
  const sizeHist = {};
  let totalCages = 0, singleton = 0, complexNum = 0;
  const ratios = [], scores = [];
  let uniqueAll = true;
  for (const lv of levels) {
    ratios.push(lv.cageReasoningRatio || 0);
    if (lv.score !== null && lv.score !== undefined) scores.push(lv.score);
    if (!lv.unique) uniqueAll = false;
    for (const cage of lv.cages || []) {
      const feats = cageFeatures(cage.cells || []);
      sizeHist[feats.size] = (sizeHist[feats.size] || 0) + 1;
      shapeMap.set(canonicalize(cage.cells || []), (shapeMap.get(canonicalize(cage.cells || [])) || 0) + 1);
      totalCages++;
      if (feats.size === 1) singleton++;
      if (feats.crossHouse && feats.size >= 4) complexNum++;
    }
  }
  const shapes = [...shapeMap.values()].sort((a, b) => b - a);
  let top4 = 0, top10 = 0;
  for (let i = 0; i < Math.min(4, shapes.length); i++) top4 += shapes[i];
  for (let i = 0; i < Math.min(10, shapes.length); i++) top10 += shapes[i];
  let H = 0;
  for (const c of shapeMap.values()) { const p = c / totalCages; H -= p * Math.log(p); }
  const rs = ratios.slice().sort((a, b) => a - b);
  const n = rs.length;
  const meanR = ratios.reduce((a, b) => a + b, 0) / (n || 1);
  const medianR = n ? rs[Math.floor(n / 2)] : 0;
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sizeShare = {};
  for (const k of Object.keys(sizeHist)) sizeShare[k] = sizeHist[k] / totalCages;

  const poolStats = {
    levels: levels.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    top10Share: top10 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR, ratioMedian: medianR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll, sizeShare,
  };

  const fmtSize = Object.keys(sizeShare).sort((a, b) => a - b).map((k) => `s${k}=${(sizeShare[k] * 100).toFixed(0)}%`).join(' ');
  console.log(`耗时 ${elapsed}s，${poolStats.levels} 关，${poolStats.totalCages} 笼`);
  console.log(`top4=${(poolStats.top4Share * 100).toFixed(1)}%  H=${poolStats.entropyH}  comp=${(poolStats.complexShare * 100).toFixed(1)}%  sing=${(poolStats.singletonRatio * 100).toFixed(1)}%  ratio.mean=${(poolStats.ratioMean * 100).toFixed(1)}%  score=${poolStats.avgScore}  uniqueAll=${poolStats.uniqueAll}`);
  console.log(`size: ${fmtSize}`);

  // 冻结基线判定
  const baseline = { top4: 0.516, H: 2.66, complex: 0.374, ratio: 0.245, score: 528.8 };
  const gates = {
    top4_50_53: poolStats.top4Share >= 0.50 && poolStats.top4Share <= 0.53,
    entropy_ge_26: poolStats.entropyH >= 2.60,
    complex_not_down: poolStats.complexShare >= baseline.complex - 0.02,
    ratio_not_below_baseline: poolStats.ratioMean >= baseline.ratio - 0.02,
    difficulty_stable: poolStats.avgScore >= baseline.score - 30 && poolStats.avgScore <= baseline.score + 30,
    singleton_lt_05: poolStats.singletonRatio < 0.05,
    unique: poolStats.uniqueAll,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    phase: 'productization',
    versionMarker: 'B3-FINAL (docs/B3-FINAL-manifest.md)',
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    defaultsApplied: {
      growthBias: gen.growthBias, shapeDiversityWeight: gen.shapeDiversityWeight,
      objective: { enabled: gen.objective.enabled, ratioWeight: gen.objective.ratioWeight, topologyWeight: gen.objective.topologyWeight, maxCollected: gen.objective.maxCollected },
    },
    frozenBaseline: baseline,
    stats: poolStats,
    gates,
    levels,
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'release-pool-b3final.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates)}`);
  console.log(`Pool 已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}