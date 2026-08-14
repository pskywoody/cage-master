/**
 * ============================================================
 *  b4b-benchmark.cjs — B4-B Canonical Diversity 第一轮基准
 * ============================================================
 *
 *  目的：验证「改变 selection 对 topology basin 的覆盖」——
 *  在不破坏 B3-FINAL 质量分布的前提下，提高 canonical topology 的有效多样性。
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true 冻结，
 *  只改 canonicalNoveltyWeight：0 (baseline) / 0.05 / 0.1 / 0.2。N 关。
 *
 *  新指标：
 *    Hcanonical = canonical family（canonicalizeShape ID）分布的 Shannon 熵。
 *    （baseline 期望低 ~1.2；若 B4 novelty 提升到 ~1.8 才算改善）
 *    noveltyRankChanges = novelty 实际改变择优的次数（诊断：权重是否可感知）。
 *
 *  用法:
 *    node scripts/b4b-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4b-benchmark.json
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

function classifyArchetype(cells) {
  if (!cells || cells.length === 0) return 'singleton';
  const pts = cells.map(([r, c]) => [Number(r), Number(c)]);
  const n = pts.length;
  if (n === 1) return 'singleton';
  const rows = new Set(pts.map((p) => p[0]));
  const cols = new Set(pts.map((p) => p[1]));
  const straight = rows.size === 1 || cols.size === 1;
  const fullRect = rows.size * cols.size === n;
  let maxDeg = 0, turns = 0;
  for (const [r, c] of pts) {
    let deg = 0;
    const adjs = [];
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (pts.some(([pr, pc]) => pr === r + dr && pc === c + dc)) { deg++; adjs.push([dr, dc]); }
    }
    maxDeg = Math.max(maxDeg, deg);
    if (deg === 2 && adjs[0][0] * adjs[1][0] + adjs[0][1] * adjs[1][1] === 0) turns++;
  }
  if (n === 2) return 'domino';
  if (straight) return 'straight';
  if (fullRect) return 'rect';
  if (maxDeg >= 4) return 'cross';
  if (maxDeg >= 3) return 'T';
  if (n === 3) return 'L';
  if (turns >= 2) return 'zigzag';
  if (turns >= 1) return 'hook';
  return 'irregular';
}
const CANONICAL_SHAPE_SET = new Set(['L', 'T', 'domino', 'straight']);

function cageFeatures(cells) {
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const size = pts.length;
  const boxes = new Set(pts.map(([r, c]) => Math.floor(r / 3) + ',' + Math.floor(c / 3)));
  return { size, crossHouse: boxes.size > 1 };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 30, seed: 20260810, output: null, verbose: false };
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
  const canonicalFamily = new Map(); // family -> count（Hcanonical）
  let totalCages = 0, canonicalCages = 0, singleton = 0, complexNum = 0;
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
      const a = classifyArchetype(cells);
      if (CANONICAL_SHAPE_SET.has(a)) {
        canonicalCages++;
        const fam = canonicalize(cells);
        canonicalFamily.set(fam, (canonicalFamily.get(fam) || 0) + 1);
      }
    }
  }
  const shapes = [...shapeMap.values()].sort((a, b) => b - a);
  let top4 = 0;
  for (let i = 0; i < Math.min(4, shapes.length); i++) top4 += shapes[i];
  let H = 0;
  for (const c of shapeMap.values()) { const p = c / totalCages; H -= p * Math.log(p); }
  // Hcanonical：canonical family 分布熵
  let Hcanonical = 0;
  const famVals = [...canonicalFamily.values()];
  const canonicalTotal = famVals.reduce((a, b) => a + b, 0);
  for (const c of famVals) { const p = c / canonicalTotal; Hcanonical -= p * Math.log(p); }
  const meanR = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sizeShare = {};
  for (const k of Object.keys(sizeHist)) sizeShare[k] = sizeHist[k] / totalCages;
  // 滚动 fingerprint 多样性：unique level fingerprints / levels
  const fpSet = new Set(batch.map((lv) => {
    const fams = [];
    for (const cage of lv.cages || []) {
      const a = classifyArchetype(cage.cells || []);
      if (CANONICAL_SHAPE_SET.has(a)) fams.push(canonicalize(cage.cells || []));
    }
    return fams.sort().join('|');
  }));
  return {
    levels: batch.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    Hcanonical: Math.round(Hcanonical * 1000) / 1000,
    canonicalFamilyCount: canonicalFamily.size,
    uniqueLevelFingerprints: fpSet.size,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll, sizeShare,
  };
}

function runArm(label, opts, weight) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: weight },
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4B' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const r = analyze(batch);
  console.log(`>> ${label}: noveltyW=${weight}  top4=${(r.top4Share * 100).toFixed(1)}%  H=${r.entropyH}  Hcanonical=${r.Hcanonical}  fam=${r.canonicalFamilyCount}  fp=${r.uniqueLevelFingerprints}  comp=${(r.complexShare * 100).toFixed(1)}%  ratio=${(r.ratioMean * 100).toFixed(1)}%  score=${r.avgScore}  uniq=${r.uniqueAll}  (${elapsed}s)`);
  return { result: r, noveltyRankChanges: gen._noveltyRankChanges };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-B Canonical Diversity 基准 ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  only noveltyW varies\n`);

  // B4-B1.5：单点机制验证（非扫描）。
  //   指定值 0.05-0.2 落在 noise floor（novelty*0.2=0.2 << ranking 信号 30-60）。
  //   fitness 总量：diff(0-50)+ratio*100(10-40)+topo*25(7-17) ≈ 30-60。
  //   novelty∈[0,1]，weight=30 → 贡献 0-30，进入同量级，机制可见性测试。
  //   只测机制是否进入有效 selection 路径，不优化指标。
  const arms = [
    { label: 'baseline', w: 0 },
    { label: 'B4-B', w: 30 },
  ];
  const results = {};
  for (const arm of arms) {
    results[arm.label] = runArm(arm.label, opts, arm.w);
  }

  const base = results.baseline.result;
  const b = results['B4-B'].result;
  const bRank = results['B4-B'].noveltyRankChanges;
  const gates = {
    // 机制可见性：novelty 必须进入 selection 路径
    mechanism_engaged: bRank > 0,
    // B3 稳定（B4-B1.5 口径：top4 ≤ base+3pp，其不同于 B4-A 的 +2pp）
    top4_le_base_3pp: b.top4Share <= base.top4Share + 0.03,
    entropy_not_down_003: b.entropyH >= base.entropyH - 0.03,
    complex_not_down: b.complexShare >= base.complexShare - 0.001,
    ratio_no_drift: Math.abs(b.ratioMean - base.ratioMean) <= 0.03,
    unique_all: b.uniqueAll,
    // 成功：Hcanonical 提升
    Hcanonical_up: b.Hcanonical > base.Hcanonical + 0.1,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true },
    variable: { canonicalNoveltyWeight: [0, 30] },
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v.result, noveltyRankChanges: v.noveltyRankChanges }])),
    gates,
    verdict: computeVerdict(results, gates, base),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4b-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

// B4-B1.5 结果解释矩阵：
//   Case A: rankChanges>0 且 Hcanonical↑ 且 B3 stable → PASS，进 B4-B2（找最低有效 weight）
//   Case B: rankChanges>0 但 Hcanonical 不变 → objective 有作用但 fingerprint 不够表达 → 改 fingerprint
//   Case C: rankChanges=0 → 机制路径错误 → FAIL，进 B4-D
function computeVerdict(results, gates, base) {
  const bRank = results['B4-B'].noveltyRankChanges;
  const b = results['B4-B'].result;
  const b3Stable = gates.top4_le_base_3pp && gates.entropy_not_down_003 && gates.complex_not_down
    && gates.ratio_no_drift && gates.unique_all;
  if (bRank === 0) {
    return 'Case C：noveltyRankChanges=0 → selection-side canonical novelty 未进入有效路径，在当前 fitness landscape 下无效。B4-B FAIL，进 B4-D（multi-objective selection）。';
  }
  if (b.Hcanonical > base.Hcanonical + 0.1) {
    return b3Stable
      ? 'Case A：rankChanges>0 且 Hcanonical↑ 且 B3 stable → B4-B PASS，进 B4-B2（寻找最低有效 weight）。'
      : 'Case A*：rankChanges>0 且 Hcanonical↑ 但 B3 指标退化 → 机制有效但破坏质量，需复查。';
  }
  return 'Case B：rankChanges>0 但 Hcanonical 不变 → objective 有作用，但 canonical fingerprint 不够表达 topology，改 fingerprint。';
}

if (require.main === module) {
  main();
}