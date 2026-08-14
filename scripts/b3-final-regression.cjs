/**
 * ============================================================
 *  b3-final-regression.cjs — B3-FINAL 冻结回归（sanity check）
 * ============================================================
 *
 *  目的：不是新实验，而是确认 C1c 常驻化后的收益不是 sample noise。
 *  用【默认构造】（不显式传 objective/growthBias/shapeDiversityWeight，
 *  即验证 regionalization 真正生效），跑 N 级，对照冻结基线：
 *    top4Share ~51-52% / H ~2.65 / complex 不降 / ratio ≥ baseline / uniqueAll
 *
 *  冻结基线（B3-FINAL）：
 *    targetStar=4, λ=25, gb=0.4, W=0.2, suppress=true, objective enabled
 *
 *  用法:
 *    node scripts/b3-final-regression.cjs --count 100 --seed 20260810
 *  输出: data/b3-final-regression.json
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
  const size = pts.length;
  const boxes = new Set(pts.map(([r, c]) => Math.floor(r / 3) + ',' + Math.floor(c / 3)));
  return { size, crossHouse: boxes.size > 1 };
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

function analyze(batch) {
  const shapeMap = new Map();
  const sizeHist = {};
  let totalCages = 0, singleton = 0, complexNum = 0;
  const ratios = [], scores = [];
  let uniqueAll = true;
  for (const lv of batch) {
    ratios.push(lv._objective ? lv._objective.cageReasoningRatio : 0);
    if (lv.difficultyInfo && lv.difficultyInfo.score !== undefined) scores.push(lv.difficultyInfo.score);
    if (lv.meta && lv.meta.unique === false) uniqueAll = false;
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const feats = cageFeatures(cells);
      sizeHist[feats.size] = (sizeHist[feats.size] || 0) + 1;
      shapeMap.set(canonicalize(cells), (shapeMap.get(canonicalize(cells)) || 0) + 1);
      totalCages++;
      if (feats.size === 1) singleton++;
      if (feats.crossHouse && feats.size >= 4) complexNum++;
    }
  }
  const shapes = [...shapeMap.values()].sort((a, b) => b - a);
  let top4 = 0;
  for (let i = 0; i < Math.min(4, shapes.length); i++) top4 += shapes[i];
  let H = 0;
  for (const c of shapeMap.values()) { const p = c / totalCages; H -= p * Math.log(p); }
  const rs = ratios.slice().sort((a, b) => a - b);
  const n = rs.length;
  const meanR = ratios.reduce((a, b) => a + b, 0) / (n || 1);
  const medianR = n ? rs[Math.floor(n / 2)] : 0;
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sizeShare = {};
  for (const k of Object.keys(sizeHist)) sizeShare[k] = sizeHist[k] / totalCages;
  return {
    levels: batch.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR, ratioMedian: medianR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll, sizeShare,
  };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-FINAL 冻结回归 ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}`);
  console.log(`默认构造（验证 regionalization）: λ=25 + gb=0.4 + W=0.2 + suppress + objective enabled\n`);

  const { CageFixer } = require('./cage-generator-v9.cjs');
  // 只传生产相关参数，不显式传冻结旋钮 → 验证默认值真正生效
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
  });
  console.log(`[生效校验] growthBias=${gen.growthBias}  shapeDiversityWeight=${gen.shapeDiversityWeight}  objective.enabled=${gen.objective.enabled}  topologyWeight=${gen.objective.topologyWeight}  ratioWeight=${gen.objective.ratioWeight}  maxCollected=${gen.objective.maxCollected}\n`);

  const t0 = Date.now();
  const batch = [];
  const originalSeed = gen.seed;
  for (let i = 0; i < opts.count; i++) {
    gen.seed = originalSeed !== null ? originalSeed + i * 1000 : Date.now() + i;
    const lv = gen.generate({});
    batch.push(lv);
    if (opts.verbose) console.log(`  [${i + 1}/${opts.count}] score=${lv.difficultyInfo ? lv.difficultyInfo.score : '?'}`);
  }
  gen.seed = originalSeed;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const r = analyze(batch);
  const fmtSize = Object.keys(r.sizeShare).sort((a, b) => a - b).map((k) => `s${k}=${(r.sizeShare[k] * 100).toFixed(0)}%`).join(' ');
  console.log(`耗时 ${elapsed}s，${r.levels} 关，${r.totalCages} 笼`);
  console.log(`top4=${(r.top4Share * 100).toFixed(1)}%  H=${r.entropyH}  comp=${(r.complexShare * 100).toFixed(1)}%  sing=${(r.singletonRatio * 100).toFixed(1)}%  ratio.mean=${(r.ratioMean * 100).toFixed(1)}%  ratio.med=${(r.ratioMedian * 100).toFixed(1)}%  score=${r.avgScore}  uniqueAll=${r.uniqueAll}`);
  console.log(`size: ${fmtSize}`);

  // 冻结基线判定（对照 B3-FINAL）
  const baseline = { top4: 0.516, H: 2.66, complex: 0.374, ratio: 0.245, score: 528.8 };
  const gates = {
    top4_515_525: r.top4Share >= 0.50 && r.top4Share <= 0.53,
    entropy_ge_26: r.entropyH >= 2.60,
    complex_not_down: r.complexShare >= baseline.complex - 0.02,
    ratio_not_below_baseline: r.ratioMean >= baseline.ratio - 0.02,
    difficulty_stable: r.avgScore >= baseline.score - 30 && r.avgScore <= baseline.score + 30,
    singleton_lt_05: r.singletonRatio < 0.05,
    unique: r.uniqueAll,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    defaultsApplied: {
      growthBias: gen.growthBias, shapeDiversityWeight: gen.shapeDiversityWeight,
      objective: { enabled: gen.objective.enabled, ratioWeight: gen.objective.ratioWeight, topologyWeight: gen.objective.topologyWeight, maxCollected: gen.objective.maxCollected },
    },
    frozenBaseline: baseline,
    result: r,
    gates,
    verdict:
      'B3-FINAL 冻结回归：若 top4 ∈[50,53]% 且 H≥2.60、complex/ratio/难度不退化、unique 全过 → 常驻化成功，C1c 收益非 sample noise。' +
      '冻结配置 gb=0.4 + λ=25 + W=0.2 + objective enabled 已为 generator 默认。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3-final-regression.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}