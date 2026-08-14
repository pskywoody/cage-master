/**
 * ============================================================
 *  b4d1-benchmark.cjs — B4-D1-1 Cross-level Family Rarity
 * ============================================================
 *
 *  目的：验证「跨关 family 罕见度」——奖励候选内稀有的 canonical family，
 *  打破 B4-D0.5 确认的 4-family basin 锁死（top4=61%，headLock=4）。
 *  只对 family 出现贡献，不对 cage shape 强制（避免 B4-A 的「抑制已有≠产生新」）。
 *
 *  机制（cage-generator-v9.cjs）：
 *    familyRarity = Σ_{candidate内每个canonical family} 1/sqrt(1 + globalFamilyCount)
 *    fitness = baseFitness - familyNoveltyWeight * familyRarity
 *    _familyCounts 跨关累计（generateBatch 内累积），_familyRankChanges 诊断翻转。
 *
 *  与 B4-B 整关 fingerprint novelty 的区别：per-cage family 维度，信号有梯度
 *  （pool 内 family 本就多样，B4-D0 证明），不再受整关 fingerprint 恒定问题困扰。
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true 冻结，
 *  只改 familyNoveltyWeight：0 (baseline) / 机制验证点。
 *
 *  验收（回 B3-FINAL 口径，不设 noveltyRankChanges gate）：
 *    必须保持：
 *      avgScore        within baseline ±30
 *      ratio.mean      不出现明显漂移
 *      uniqueAll       true
 *      runtime         不可明显恶化
 *    成功（二者满足其一）：
 *      Hcanonical ↑ +0.1      （跨关 family 分布熵提升）
 *      或 top4Share ↓ ≥3pp    （头部 family 集中度下降）
 *    机制指标：
 *      familyRankChanges > 0  （rarity 真的进入 selection 路径）
 *
 *  用法:
 *    node scripts/b4d1-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4d1-benchmark.json
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
  const canonicalFamily = new Map(); // family -> count（Hcanonical）
  const sizeHist = {};
  const ratios = [], scores = [];
  let totalCages = 0, singleton = 0, complexNum = 0;
  let uniqueAll = true;
  // family 跨关频次（每关去重，与机制一致）
  const levelFamilySets = [];
  for (const lv of batch) {
    ratios.push(lv._objective ? lv._objective.cageReasoningRatio : 0);
    if (lv.difficultyInfo && lv.difficultyInfo.score !== undefined) scores.push(lv.difficultyInfo.score);
    if (lv.meta && lv.meta.unique === false) uniqueAll = false;
    const famSet = new Set();
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const feats = cageFeatures(cells);
      sizeHist[feats.size] = (sizeHist[feats.size] || 0) + 1;
      totalCages++;
      if (feats.size === 1) singleton++;
      if (feats.crossHouse && feats.size >= 4) complexNum++;
      const a = classifyArchetype(cells);
      if (CANONICAL_SHAPE_SET.has(a)) {
        const fam = canonicalize(cells);
        canonicalFamily.set(fam, (canonicalFamily.get(fam) || 0) + 1); // 全局频次（含重复笼）
        famSet.add(fam);
      }
    }
    levelFamilySets.push(famSet);
  }
  // Hcanonical：canonical family 分布熵（全局频次）
  let Hcanonical = 0;
  const famVals = [...canonicalFamily.values()];
  const canonicalTotal = famVals.reduce((a, b) => a + b, 0);
  for (const c of famVals) { const p = c / canonicalTotal; Hcanonical -= p * Math.log(p); }
  // top-k share（跨关）：family 出现关次占比
  const famLevelCount = new Map();
  for (const s of levelFamilySets) {
    for (const fam of s) famLevelCount.set(fam, (famLevelCount.get(fam) || 0) + 1);
  }
  // top-k share：按全局笼频次（canonicalFamily 已有），前 k 个 family 的笼数占比
  const famCountsSorted = [...canonicalFamily.values()].sort((a, b) => b - a);
  const totalCanonical = famCountsSorted.reduce((a, b) => a + b, 0);
  let top1c = 0, top4c = 0, top8c = 0;
  for (let i = 0; i < famCountsSorted.length; i++) {
    if (i === 0) top1c = famCountsSorted[0];
    if (i < 4) top4c += famCountsSorted[i];
    if (i < 8) top8c += famCountsSorted[i];
  }
  // headLock：跨关出现关次占比 >=80% 的 family 数
  const numLevels = batch.length;
  const lc = [...famLevelCount.values()].sort((a, b) => b - a);
  let headLock = 0;
  for (const c of lc) if (c / numLevels >= 0.8) headLock++;
  const meanR = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sizeShare = {};
  for (const k of Object.keys(sizeHist)) sizeShare[k] = sizeHist[k] / totalCages;
  return {
    levels: numLevels, totalCages,
    Hcanonical: Math.round(Hcanonical * 1000) / 1000,
    canonicalFamilyCount: canonicalFamily.size,
    top1FamilyShare: totalCanonical ? Math.round(top1c / totalCanonical * 1000) / 1000 : 0,
    top4FamilyShare: totalCanonical ? Math.round(top4c / totalCanonical * 1000) / 1000 : 0,
    top8FamilyShare: totalCanonical ? Math.round(top8c / totalCanonical * 1000) / 1000 : 0,
    headFamilyLockCount: headLock,
    singletonRatio: singleton / totalCages,
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
    objective: { familyNoveltyWeight: weight },
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4D1' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const r = analyze(batch);
  console.log(`>> ${label}: famW=${weight}  Hcanonical=${r.Hcanonical}  fam=${r.canonicalFamilyCount}  headLock=${r.headFamilyLockCount}  top4=${(r.top4FamilyShare * 100).toFixed(1)}%  comp=${(r.complexShare * 100).toFixed(1)}%  ratio=${(r.ratioMean * 100).toFixed(1)}%  score=${r.avgScore}  uniq=${r.uniqueAll}  (${elapsed}s)`);
  return { result: r, familyRankChanges: gen._familyRankChanges, elapsed: Number(elapsed) };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-D1-1 Cross-level Family Rarity ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  only familyNoveltyWeight varies\n`);

  // B4-D1-1：单点机制验证。fitness 总量 ~30-60。
  //   familyRarity = Σ 1/sqrt(1+count)。候选约 8-14 个 family，初始全稀有 ≈ 8-14。
  //   weight=3 → 贡献 ~24-42，进入同量级，机制可见。
  const arms = [
    { label: 'baseline', w: 0 },
    { label: 'B4-D1', w: 3 },
  ];
  const results = {};
  for (const arm of arms) {
    results[arm.label] = runArm(arm.label, opts, arm.w);
  }

  const base = results.baseline.result;
  const b = results['B4-D1'].result;
  const bRank = results['B4-D1'].familyRankChanges;
  const gates = {
    mechanism_engaged: bRank > 0,
    // B3 稳定（B3-FINAL 口径）
    score_stable: b.avgScore !== null && base.avgScore !== null && Math.abs(b.avgScore - base.avgScore) <= 30,
    ratio_no_drift: Math.abs(b.ratioMean - base.ratioMean) <= 0.03,
    complex_not_down: b.complexShare >= base.complexShare - 0.001,
    unique_all: b.uniqueAll,
    // 成功标准（二选一）
    Hcanonical_up: b.Hcanonical > base.Hcanonical + 0.1,
    top4_down_3pp: b.top4FamilyShare <= base.top4FamilyShare - 0.03,
  };
  const b3Stable = gates.score_stable && gates.ratio_no_drift && gates.complex_not_down && gates.unique_all;
  const diversityUp = gates.Hcanonical_up || gates.top4_down_3pp;

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true },
    variable: { familyNoveltyWeight: [0, 3] },
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v.result, familyRankChanges: v.familyRankChanges, elapsed: v.elapsed }])),
    gates,
    b3Stable,
    diversityUp,
    verdict: computeVerdict(results, gates, b3Stable, diversityUp),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4d1-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`b3Stable=${b3Stable}  diversityUp=${diversityUp}`);
  console.log(`\n已保存: ${outPath}`);
}

// 结果解释：
//   familyRankChanges=0 → 机制未进入 selection 路径 → FAIL（记录，不扫权重）
//   b3Stable=false       → 机制有效但破坏质量 → 需复查
//   b3Stable && diversityUp → PASS（跨关 family rarity 打破 basin）
//   b3Stable && !diversityUp → 机制有效但未提升 diversity → 指标/权重不足，记录
function computeVerdict(results, gates, b3Stable, diversityUp) {
  const bRank = results['B4-D1'].familyRankChanges;
  if (bRank === 0) {
    return 'FAIL：familyRankChanges=0 → cross-level family rarity 未进入 selection 路径。记录，不扫权重。';
  }
  if (!b3Stable) {
    return 'Review：机制进入 selection 但 B3 质量退化（score/ratio/complex/unique 有破坏）。需复查。';
  }
  if (diversityUp) {
    return 'PASS：family rarity 进入 selection 且 B3 稳定、Hcanonical↑或top4↓ ≥3pp → 跨关 family rarity 打破 basin。';
  }
  return 'Review：机制进入 selection 且 B3 稳定，但 Hcanonical/top4 未达阈值 → diversity 未提升，信号或权重不足。';
}

if (require.main === module) {
  main();
}