/**
 * ============================================================
 *  b3b3-topology-v2.cjs — Step B3-B3 Topology Score v1→v2 A/B
 * ============================================================
 *
 *  目的：验证「评分函数表达力」而非「bias 强度」。growthBias 固定 0.4
 *  （B3-B2 甜点），唯一变量 = topology score v1 → v2。
 *
 *  v2 在 v1 基础上补充三个维度：
 *    1) branching      内部 degree>=3 的 T/cross 结点奖励
 *    2) area inefficiency  bounding box density 惩罚（取代粗糙矩形判断）
 *    3) cross-house strength  houseSpread 分层奖励（取代单一跨宫二元）
 *
 *  单变量：control(v1) vs experiment(v2)，gb 皆 0.4。
 *  不碰 difficulty / rating / uniqueness / selection / λ / solver / merge。
 *
 *  目标：
 *    top4Share: 49.2% → <47%
 *    complexShare: 39.9% → >42%
 *
 *  用法:
 *    node scripts/b3b3-topology-v2.cjs --count 20 --seed 20260810 --collected 8
 *  输出: data/b3b3-topology-v2.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

function canonicalize(cells) {
  if (!cells || cells.length === 0) return '';
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const transforms = [
    (r, c) => [r, c],
    (r, c) => [c, -r],
    (r, c) => [-r, -c],
    (r, c) => [-c, r],
    (r, c) => [-r, c],
    (r, c) => [c, r],
    (r, c) => [r, -c],
    (r, c) => [-c, -r],
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
  const o = { count: 20, seed: 20260810, collected: 8, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--collected') o.collected = parseInt(args[++i], 10) || 8;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function analyze(batch) {
  const shapeMap = new Map();
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
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return {
    levels: batch.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
  };
}

function run(opts, scoreVersion) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const objective = { enabled: true, ratioWeight: 0, topologyWeight: 25, maxCollected: opts.collected };
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true,
    objective,
    growthBias: 0.4,
    topologyScoreVersion: scoreVersion,
  });
  const batch = gen.generateBatch(opts.count, {});
  return analyze(batch);
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-B3 Topology Score v1→v2 A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  gb=0.4  collected=${opts.collected}\n`);

  const t0 = Date.now();
  const v1 = run(opts, 1);
  const t1 = Date.now();
  console.log(`v1 (control, gb=0.4)  ${v1.levels} 关（${((t1 - t0) / 1000).toFixed(1)}s）  top4=${(v1.top4Share * 100).toFixed(1)}%  comp=${(v1.complexShare * 100).toFixed(1)}%  ratio=${(v1.ratioMean * 100).toFixed(1)}%  score=${v1.avgScore}`);

  const v2 = run(opts, 2);
  const t2 = Date.now();
  console.log(`v2 (gb=0.4)             ${v2.levels} 关（${((t2 - t1) / 1000).toFixed(1)}s）  top4=${(v2.top4Share * 100).toFixed(1)}%  comp=${(v2.complexShare * 100).toFixed(1)}%  ratio=${(v2.ratioMean * 100).toFixed(1)}%  score=${v2.avgScore}`);

  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  console.log('\n--- 对照表 ---');
  console.log(`  ${'ver'.padEnd(6)} ${'top4Share'.padEnd(10)} ${'singleton'.padEnd(10)} ${'complex'.padEnd(9)} ${'H'.padEnd(7)} ${'ratioMean'.padEnd(10)} ${'avgScore'.padEnd(9)} ${'unique'}`);
  console.log(`  ${'v1'.padEnd(6)} ${fmtPct(v1.top4Share).padEnd(10)} ${fmtPct(v1.singletonRatio).padEnd(10)} ${fmtPct(v1.complexShare).padEnd(9)} ${v1.entropyH.toFixed(3).padEnd(7)} ${fmtPct(v1.ratioMean).padEnd(10)} ${v1.avgScore} ${v1.uniqueAll}`);
  console.log(`  ${'v2'.padEnd(6)} ${fmtPct(v2.top4Share).padEnd(10)} ${fmtPct(v2.singletonRatio).padEnd(10)} ${fmtPct(v2.complexShare).padEnd(9)} ${v2.entropyH.toFixed(3).padEnd(7)} ${fmtPct(v2.ratioMean).padEnd(10)} ${v2.avgScore} ${v2.uniqueAll}`);

  const gates = {
    // B3-B3 目标（相对 gb=0.4 基线 49.2% / 39.9%）
    target_top4_lt_47: v2.top4Share < 0.47,
    target_complex_gt_42: v2.complexShare > 0.42,
    // 硬门
    GateA_singleton_le_5pct: v2.singletonRatio <= 0.05,
    GateB_top4_lt_50pct: v2.top4Share < 0.5,
    GateC_top4_lt_45pct: v2.top4Share < 0.45,
    GateC_complex_gt_45pct: v2.complexShare > 0.45,
    Gate_difficulty_pm5: v2.avgScore >= v1.avgScore - 30 && v2.avgScore <= v1.avgScore + 30,
    Gate_ratio_no_regress: v2.ratioMean >= v1.ratioMean - 0.01,
    Gate_unique: v2.uniqueAll,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, growthBias: 0.4, collected: opts.collected },
    baseline_v1: v1,
    experiment_v2: v2,
    gates,
    verdict:
      'v2 目标：top4<47%、complex>42%。若 v2 优于 v1 → 评分表达力有效，可继续向 Gate C；' +
      '若 v2 不优于 v1 → 三个新维度方向或权重需调，或 sweet spot 需重扫 gb。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3b3-topology-v2.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}