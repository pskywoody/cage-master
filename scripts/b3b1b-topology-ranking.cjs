/**
 * ============================================================
 *  b3b1b-topology-ranking.cjs — Step B3-B1b Topology Ranking A/B
 * ============================================================
 *
 *  目的：验证「topologyScore 只用于 candidate ranking（λ 小）」
 *  能否降低 topology concentration（top4Share），而不碰 difficulty/unique/rhythm。
 *
 *  对照（同一 seed / 同一样本数，互异可复现）：
 *    control = suppressSingletons=true, objective OFF（即 B3-B1a baseline）
 *    b1b     = suppressSingletons=true, objective ON, topologyWeight=λ（ratioWeight=0）
 *
 *  单变量：除 topology 排名项外，其余完全一致。
 *
 *  指标（对每关 cages 做 topology audit）：
 *    top4Share        目标 Gate2: 58% → <45%（第一版不追 40%）
 *    singletonRatio   Gate4: ≤5% 不退化
 *    complexShare     观察（Gate3 目标：complex category entropy，不强行拉单类）
 *    entropyH         拓扑熵不退化
 *    ratio            笼推理率不退化
 *    avgScore         难度分不回归
 *    unique           唯一解全过
 *
 *  用法:
 *    node scripts/b3b1b-topology-ranking.cjs --count 25 --seed 20260810 --weights 5,15,30,50
 *  输出: data/b3b1b-topology-ranking.json
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
  return { size, spanBoxes: boxes.size, crossHouse: boxes.size > 1 };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 25, seed: 20260810, weights: [10, 25, 50], collected: 4, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--weights') o.weights = (args[++i] || '').split(',').map(Number).filter((n) => !isNaN(n));
    else if (args[i] === '--collected') o.collected = parseInt(args[++i], 10) || 4;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function analyze(batch) {
  const shapeMap = new Map();
  let totalCages = 0;
  let singleton = 0;
  let complexNum = 0;
  const ratios = [];
  const scores = [];
  let uniqueAll = true;

  for (const lv of batch) {
    const ratio = lv._objective ? lv._objective.cageReasoningRatio : 0;
    ratios.push(ratio);
    if (lv.difficultyInfo && lv.difficultyInfo.score !== undefined) scores.push(lv.difficultyInfo.score);
    if (lv.meta && lv.meta.unique === false) uniqueAll = false;
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const feats = cageFeatures(cells);
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
  for (const c of shapeMap.values()) {
    const p = c / totalCages;
    H -= p * Math.log(p);
  }

  const rSorted = ratios.slice().sort((a, b) => a - b);
  const n = rSorted.length;
  const medianR = n % 2 === 1 ? rSorted[(n - 1) / 2] : (rSorted[n / 2 - 1] + rSorted[n / 2]) / 2;
  const meanR = ratios.reduce((a, b) => a + b, 0) / (n || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;

  return {
    levels: batch.length,
    totalCages,
    uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratio: { median: medianR, mean: meanR },
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
  };
}

function run(opts, objectiveConfig) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true,
    objective: objectiveConfig,
  });
  const batch = gen.generateBatch(opts.count, {});
  return analyze(batch);
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-B1b Topology Ranking A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ(s)=${opts.weights.join(',')}\n`);

  const t0 = Date.now();
  const control = run(opts, { enabled: false });
  const t1 = Date.now();
  console.log(`control (B3-B1a)  ${control.levels} 关（${((t1 - t0) / 1000).toFixed(1)}s）`);

  const rows = [];
  for (const w of opts.weights) {
    const t = Date.now();
    // 单变量：只开 topology 项，ratioWeight=0（不混入 B3-A ratio 择优）
    const r = run(opts, { enabled: true, ratioWeight: 0, topologyWeight: w, maxCollected: opts.collected });
    const dt = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`b1b λ=${w}  ${r.levels} 关（${dt}s）  top4=${(r.top4Share * 100).toFixed(1)}%  comp=${(r.complexShare * 100).toFixed(1)}%  ratio=${(r.ratio.mean * 100).toFixed(1)}%  score=${r.avgScore}`);
    rows.push({ lambda: w, ...r });
  }

  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  console.log('\n--- 对照表 ---');
  console.log(`  ${'λ'.padEnd(6)} ${'top4Share'.padEnd(10)} ${'singleton'.padEnd(10)} ${'complex'.padEnd(9)} ${'H'.padEnd(7)} ${'ratio.mean'.padEnd(11)} ${'avgScore'.padEnd(9)} ${'unique'}`);
  console.log(`  ${'ctr'.padEnd(6)} ${fmtPct(control.top4Share).padEnd(10)} ${fmtPct(control.singletonRatio).padEnd(10)} ${fmtPct(control.complexShare).padEnd(9)} ${control.entropyH.toFixed(3).padEnd(7)} ${fmtPct(control.ratio.mean).padEnd(11)} ${control.avgScore} ${control.uniqueAll}`);
  for (const r of rows) {
    console.log(`  ${String(r.lambda).padEnd(6)} ${fmtPct(r.top4Share).padEnd(10)} ${fmtPct(r.singletonRatio).padEnd(10)} ${fmtPct(r.complexShare).padEnd(9)} ${r.entropyH.toFixed(3).padEnd(7)} ${fmtPct(r.ratio.mean).padEnd(11)} ${r.avgScore} ${r.uniqueAll}`);
  }

  // 选 λ 使 top4Share 最低且不退化 difficulty/ratio
  const best = rows.slice().sort(
    (a, b) => (a.top4Share - b.top4Share) || (a.ratio.mean - b.ratio.mean)
  )[0];

  const gates = {
    Gate2_top4_lt_45pct: best && best.top4Share < 0.45,
    Gate4_singleton_le_5pct: best && best.singletonRatio <= 0.05,
    Gate4_ratio_no_regress: best && best.ratio.mean >= control.ratio.mean - 0.01,
    Gate4_unique: best && best.uniqueAll,
    Gate4_score_stable: best && best.avgScore >= control.avgScore - 30 && best.avgScore <= control.avgScore + 30,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, lambdas: opts.weights },
    control_b1a: control,
    b1b: rows,
    best_lambda: best ? best.lambda : null,
    gates,
    verdict:
      'B3-B1b 验证：topologyScore（λ 小）只改 candidate ranking。Gate2 看 top4Share 58%→<45%；' +
      '若 λ 增大才降但 difficulty/ratio 退化，说明需改 builder（进入 B3-B1b 第二阶段）。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3b1b-topology-ranking.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}