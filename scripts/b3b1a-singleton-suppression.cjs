/**
 * ============================================================
 *  b3b1a-singleton-suppression.cjs — Step B3-B1a Singleton Suppression A/B
 * ============================================================
 *
 *  目的：验证「只抑制 size-1 笼、不引入新 shape bias」是否能把
 *  singleton ratio 从 ~16% 压到 ≤5%，同时不退化 difficulty / ratio。
 *
 *  对照（同一 seed / 同一样本数，互异可复现）：
 *    baseline  = suppressSingletons=false（旧行为）
 *    suppressed= suppressSingletons=true （B3-B1a）
 *
 *  指标（对每关 cages 做 topology audit）：
 *    singletonRatio   size==1 笼占比                Gate1: ≤5%
 *    top4Share        出现次数 top-4 shape 占全部笼   Gate2: <40%
 *    complexShare     跨宫且 size>=4 的 cage 占比     Gate3: 观察
 *    sizeDist         cage 格数分布（保持大笼占比）
 *    entropy H        拓扑熵（不追求变大，观察不退化）
 *    avgRatio         笼推理率（Gate4: 不退化）
 *    avgScore         难度分（Gate4: 保持 star 区间）
 *    unique           每关唯一解（生成器内保证）
 *
 *  用法:
 *    node scripts/b3b1a-singleton-suppression.cjs --count 25 --seed 20260810
 *  输出: data/b3b1a-singleton-suppression.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

// ---- Canonical shape（平移 + 8 dihedral 变换取最小形）----
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
  const o = { count: 25, seed: 20260810, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function analyze(batch) {
  const shapeMap = new Map();
  let totalCages = 0;
  let singleton = 0;
  const sizeDist = {};
  let complexShareNum = 0;
  let crossShareNum = 0;
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
      const shapeID = canonicalize(cells);
      const feats = cageFeatures(cells);
      const e = shapeMap.get(shapeID) || { count: 0 };
      e.count = (e.count || 0) + 1;
      e.sizeSum = (e.sizeSum || 0) + feats.size;
      e.cross = (e.cross || 0) + (feats.crossHouse ? 1 : 0);
      shapeMap.set(shapeID, e);
      totalCages++;
      if (feats.size === 1) singleton++;
      sizeDist[feats.size] = (sizeDist[feats.size] || 0) + 1;
      if (feats.crossHouse && feats.size >= 4) complexShareNum++;
      if (feats.crossHouse) crossShareNum++;
    }
  }

  const shapes = [...shapeMap.entries()].sort((a, b) => b[1].count - a[1].count);
  let top4 = 0;
  for (let i = 0; i < Math.min(4, shapes.length); i++) top4 += shapes[i][1].count;

  // 熵 H
  let H = 0;
  for (const [, e] of shapeMap) {
    const p = e.count / totalCages;
    H -= p * Math.log(p);
  }

  const sizeDistPct = {};
  for (const k of Object.keys(sizeDist)) sizeDistPct[k] = Math.round((sizeDist[k] / totalCages) * 1000) / 1000;

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
    complexShare: complexShareNum / totalCages,
    crossHouseShare: crossShareNum / totalCages,
    sizeDist,
    sizeDistPct,
    ratio: { median: medianR, mean: meanR, ge_20: rSorted.filter((r) => r >= 0.2).length / (n || 1) },
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
  };
}

function run(opts, suppress) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: suppress,
  });
  const batch = gen.generateBatch(opts.count, {});
  return analyze(batch);
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-B1a Singleton Suppression A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}\n`);

  const t0 = Date.now();
  const baseline = run(opts, false);
  const t1 = Date.now();
  const suppressed = run(opts, true);
  const t2 = Date.now();

  console.log(`baseline   ${baseline.levels} 关（${((t1 - t0) / 1000).toFixed(1)}s）`);
  console.log(`suppressed ${suppressed.levels} 关（${((t2 - t1) / 1000).toFixed(1)}s）\n`);

  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  const row = (label, f) =>
    console.log(`  ${label.padEnd(16)} baseline=${f(baseline)}   suppressed=${f(suppressed)}`);

  console.log('--- topology distribution ---');
  row('singletonRatio', (a) => fmtPct(a.singletonRatio));
  row('top4Share', (a) => fmtPct(a.top4Share));
  row('complexShare', (a) => fmtPct(a.complexShare));
  row('crossHouseShare', (a) => fmtPct(a.crossHouseShare));
  row('entropyH', (a) => a.entropyH.toFixed(3));
  row('uniqueShapes', (a) => a.uniqueShapes);
  console.log('\n--- cage size dist ---');
  console.log(`  baseline  ${JSON.stringify(baseline.sizeDistPct)}`);
  console.log(`  suppressed ${JSON.stringify(suppressed.sizeDistPct)}`);
  console.log('\n--- Gate4 no-regress ---');
  row('ratio.median', (a) => fmtPct(a.ratio.median));
  row('ratio.mean', (a) => fmtPct(a.ratio.mean));
  row('ratio.ge_20', (a) => fmtPct(a.ratio.ge_20));
  row('avgScore', (a) => a.avgScore);
  row('uniqueAll', (a) => a.uniqueAll);

  const gates = {
    Gate1_singleton_le_5pct: suppressed.singletonRatio <= 0.05,
    Gate2_top4_lt_40pct: suppressed.top4Share < 0.40,
    Gate4_ratio_no_regress: suppressed.ratio.mean >= baseline.ratio.mean - 0.01,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed },
    baseline_off: baseline,
    suppressed_on: suppressed,
    gates,
    verdict:
      'B3-B1a 验证：singleton≤5% 说明抑制生效；top4<40% 说明 trivial mass 下降；' +
      'ratio 不退化说明未伤及推理密度。未达 Gate 则需查残余单格 / merge 路径。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3b1a-singleton-suppression.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}