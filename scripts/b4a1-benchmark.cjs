/**
 * ============================================================
 *  b4a1-benchmark.cjs — B4-A1 Topology Prior 第一轮基准
 * ============================================================
 *
 *  目的：验证「改变出生先验 → selection 是否需要更少修正」。
 *  协议：B3-FINAL baseline（prior OFF） vs B4-A prior ON，N=100，λ=25 冻结。
 *    ranking / objective / acceptance / seed protocol 全部 unchanged。
 *
 *  B3-FINAL 冻结：targetStar=4, λ=25, gb=0.4, W=0.2, suppress=true, objective enabled
 *  B4-A 变量：topologyPrior.enabled=true, templateBias=0.5（冻结，不扫）
 *
 *  用法:
 *    node scripts/b4a1-benchmark.cjs --count 100 --seed 20260810
 *  输出: data/b4a1-benchmark.json
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
  let uniqueAll = true, templateBirths = 0;
  for (const lv of batch) {
    ratios.push(lv._objective ? lv._objective.cageReasoningRatio : 0);
    if (lv.difficultyInfo && lv.difficultyInfo.score !== undefined) scores.push(lv.difficultyInfo.score);
    if (lv.meta && lv.meta.unique === false) uniqueAll = false;
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const feats = cageFeatures(cells);
      sizeHist[feats.size] = (sizeHist[feats.size] || 0) + 1;
      const id = canonicalize(cells);
      shapeMap.set(id, (shapeMap.get(id) || 0) + 1);
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
  const meanR = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sizeShare = {};
  for (const k of Object.keys(sizeHist)) sizeShare[k] = sizeHist[k] / totalCages;
  return {
    levels: batch.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll, sizeShare, templateBirths,
  };
}

function runArm(label, opts, priorEnabled) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    topologyPrior: priorEnabled ? { enabled: true, templateBias: 0.5 } : { enabled: false },
  });
  console.log(`>> ${label}: prior=${gen.topologyPrior.enabled} templateBias=${gen.topologyPrior.templateBias}`);
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
  console.log(`  top4=${(r.top4Share * 100).toFixed(1)}%  H=${r.entropyH}  comp=${(r.complexShare * 100).toFixed(1)}%  ratio.mean=${(r.ratioMean * 100).toFixed(1)}%  score=${r.avgScore}  uniqueAll=${r.uniqueAll}  (${elapsed}s)`);
  return r;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-A1 Topology Prior 第一轮基准 ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25 冻结  gb=0.4  W=0.2  suppress  objective enabled\n`);

  const baseline = runArm('B3-FINAL baseline (prior OFF)', opts, false);
  const prior = runArm('B4-A prior ON', opts, true);

  const frozenBaseline = { top4: 0.516, H: 2.66, complex: 0.374, ratio: 0.245, score: 528.8 };
  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, suppressSingletons: true, objective: 'enabled' },
    variable: { topologyPrior: { enabled: true, templateBias: 0.5 } },
    baseline, prior,
    comparison: {
      top4ShareDelta: Math.round((prior.top4Share - baseline.top4Share) * 1000) / 1000,
      entropyDelta: Math.round((prior.entropyH - baseline.entropyH) * 1000) / 1000,
      complexDelta: Math.round((prior.complexShare - baseline.complexShare) * 1000) / 1000,
      ratioDelta: Math.round((prior.ratioMean - baseline.ratioMean) * 1000) / 1000,
      scoreDelta: prior.avgScore !== null && baseline.avgScore !== null ? Math.round(prior.avgScore - baseline.avgScore) : null,
    },
    gates: {
      top4_down: prior.top4Share < baseline.top4Share,
      entropy_ge_260: prior.entropyH >= 2.60,
      complex_not_down: prior.complexShare >= frozenBaseline.complex - 0.02,
      ratio_not_worse: prior.ratioMean >= baseline.ratioMean - 0.02,
      score_stable: prior.avgScore !== null && Math.abs(prior.avgScore - baseline.avgScore) <= 30,
      unique_all: prior.uniqueAll,
    },
    verdict: computeVerdict(prior, baseline),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4a1-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(report.gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

function computeVerdict(prior, baseline) {
  const ok = prior.top4Share < baseline.top4Share
    && prior.entropyH >= 2.60
    && prior.ratioMean >= baseline.ratioMean - 0.02
    && prior.uniqueAll;
  return ok
    ? 'PASS：出生先验使 top4Share 下降、entropy 健康、ratio/难度不退化 → 出生先验是有效瓶颈，selection 修正负担降低。'
    : 'FAIL：出生先验未带来健康改善。记录结果，不微调（B4-A1 原则）。';
}

if (require.main === module) {
  main();
}