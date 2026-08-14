/**
 * ============================================================
 *  b4c1-benchmark.cjs — B4-C1 Cross-level Family Birth Pressure
 * ============================================================
 *
 *  目的：验证「soft head-family avoidance」——在 growCage/partitionCages 的
 *  frontier pick 阶段，对 over-frequent（head）canonical family 做跨关 soft 衰减，
 * 把 head family 从「必然出现」拉向「可被绕开」，打破 B4-C0 确认的
 * 9/10 headLockPool 锁死。不禁止、不新建 family（B4-A1 模板注入的教训）。
 *
 *  机制（cage-generator-v9.cjs）：
 *    effectiveWeight = baseWeight * (1 - headFamilyPressure)
 *    headFamilyPressure = globalFamilyFrequency / targetFrequency
 *    targetFrequency = levels / FAMILY_TARGET_COUNT（公平份额分母=10）
 *    只在 family 超公平份额（gf>targetFreq）时起压，衰减有下限 floor（不归零）。
 *    跨关记忆来自 _familyCounts（winner 累计），非单关 diversity。
 *
 *  与 B4-A1 的区别：
 *    A1 是【外部形状目标 + 强制注入】→ 碎片化反弹；
 *    C1 是【历史频率 soft 衰减】→ 只轻微改变出生概率，不传外部形状、不强制。
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true 冻结，
 *  只改 familyBirthPressureWeight：0 (baseline) / 中等单点值 0.4。不扫描。
 *  canonicalProfile=true（采集 pool 指标）。
 *
 *  验收（C1 目标发生在 generation，不看 winner）：
 *    主指标（pool）：
 *      headLockPool：9 → 明显下降
 *      poolHfamily： 候选池 family 熵提升
 *    稳定性（B3-FINAL 口径）：
 *      complexShare / ratio / score / unique 不可退化
 *
 *  用法:
 *    node scripts/b4c1-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4c1-benchmark.json（约 13min，两臂）
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
  const o = { count: 30, seed: 20260810, weight: 0.4, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--weight') o.weight = parseFloat(args[++i]);
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

// B3-FINAL 口径 + winner 侧 family 分布（稳定性参考，不作 C1 主 gate）
function analyzeWinner(batch) {
  const canonicalFamily = new Map();
  const sizeHist = {};
  const ratios = [], scores = [];
  let totalCages = 0, singleton = 0, complexNum = 0;
  let uniqueAll = true;
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
        canonicalFamily.set(fam, (canonicalFamily.get(fam) || 0) + 1);
        famSet.add(fam);
      }
    }
    levelFamilySets.push(famSet);
  }
  let Hcanonical = 0;
  const famVals = [...canonicalFamily.values()];
  const canonicalTotal = famVals.reduce((a, b) => a + b, 0);
  for (const c of famVals) { const p = c / canonicalTotal; Hcanonical -= p * Math.log(p); }
  const famLevelCount = new Map();
  for (const s of levelFamilySets) for (const fam of s) famLevelCount.set(fam, (famLevelCount.get(fam) || 0) + 1);
  const famCountsSorted = [...canonicalFamily.values()].sort((a, b) => b - a);
  const totalCanonical = famCountsSorted.reduce((a, b) => a + b, 0);
  let top1c = 0, top4c = 0, top8c = 0;
  for (let i = 0; i < famCountsSorted.length; i++) {
    if (i === 0) top1c = famCountsSorted[0];
    if (i < 4) top4c += famCountsSorted[i];
    if (i < 8) top8c += famCountsSorted[i];
  }
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
    uniqueAll,
    sizeShare,
    winnerFamilyRank: Object.fromEntries([...famLevelCount].sort((a, b) => b[1] - a[1])),
  };
}

// C1 主指标：候选池 level（headLockPool / poolHfamily）——目标发生在 generation
function analyzePool(batch, poolCoverage) {
  const familyRank = poolCoverage ? poolCoverage.familyRank : {};
  const rankVals = Object.values(familyRank).sort((a, b) => b - a);
  const totalHits = rankVals.reduce((a, b) => a + b, 0);
  let headLockPool = 0;
  for (const c of rankVals) if (c / batch.length >= 0.8) headLockPool++;
  let top1 = 0, top4 = 0;
  rankVals.forEach((c, i) => { if (i === 0) top1 = c; if (i < 4) top4 += c; });
  let pHsum = 0, pHn = 0;
  for (const lv of batch) {
    const cp = lv._canonicalPool;
    if (cp && cp.poolHfamily !== undefined) { pHsum += cp.poolHfamily; pHn++; }
  }
  return {
    uniqueFamiliesInPool: poolCoverage ? poolCoverage.uniqueFamiliesInPool : 0,
    uniqueFamilyCombosInPool: poolCoverage ? poolCoverage.uniqueFamilyCombosInPool : 0,
    headLockPool,
    top1FamilyHitShare: totalHits ? Math.round(top1 / totalHits * 1000) / 1000 : null,
    top4FamilyHitShare: totalHits ? Math.round(top4 / totalHits * 1000) / 1000 : null,
    poolHfamilyMean: pHn ? Math.round((pHsum / pHn) * 1000) / 1000 : null,
  };
}

function runArm(label, opts, weight) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    canonicalProfile: true,
    familyBirthPressureWeight: weight,
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4C1' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const winner = analyzeWinner(batch);
  const pool = analyzePool(batch, gen.getPoolCoverage());
  console.log(`>> ${label}: w=${weight}  headLockPool=${pool.headLockPool}  poolH=${pool.poolHfamilyMean}  comp=${(winner.complexShare * 100).toFixed(1)}%  ratio=${(winner.ratioMean * 100).toFixed(1)}%  score=${winner.avgScore}  uniq=${winner.uniqueAll}  (${elapsed}s)`);
  return { winner, pool, elapsed: Number(elapsed) };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-C1 Cross-level Family Birth Pressure (soft head-family avoidance) ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  canonicalProfile=true`);
  console.log(`only familyBirthPressureWeight varies: 0 / ${opts.weight}（中等单点，不扫描）\n`);

  const arms = [
    { label: 'baseline', w: 0 },
    { label: 'B4-C1', w: opts.weight },
  ];
  const results = {};
  for (const arm of arms) results[arm.label] = runArm(arm.label, opts, arm.w);

  const base = results.baseline, b = results['B4-C1'];
  const bw = base.winner, bp = base.pool, cw = b.winner, cp = b.pool;
  const gates = {
    // B3 稳定（B3-FINAL 口径）
    score_stable: cw.avgScore !== null && bw.avgScore !== null && Math.abs(cw.avgScore - bw.avgScore) <= 30,
    ratio_no_drift: Math.abs(cw.ratioMean - bw.ratioMean) <= 0.03,
    complex_not_down: cw.complexShare >= bw.complexShare - 0.001,
    unique_all: cw.uniqueAll,
    // C1 主指标（pool / generation）
    headLockPool_down: cp.headLockPool < bp.headLockPool,
    poolHfamily_up: cp.poolHfamilyMean > bp.poolHfamilyMean,
  };
  const b3Stable = gates.score_stable && gates.ratio_no_drift && gates.complex_not_down && gates.unique_all;

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, weight: opts.weight, elapsedSeconds: Math.round((results.baseline.elapsed + results['B4-C1'].elapsed) * 10) / 10 },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true, canonicalProfile: true },
    variable: { familyBirthPressureWeight: [0, opts.weight] },
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v.winner, pool: v.pool, elapsed: v.elapsed }])),
    gates,
    b3Stable,
    verdict: computeVerdict(results, gates, b3Stable),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4c1-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`b3Stable=${b3Stable}`);
  console.log(`\n已保存: ${outPath}`);
}

// 结果解释（C1 目标在 generation，看 pool 不看 winner）：
//   !b3Stable            → 机制破坏 B3 质量 → FAIL（记录，不扫权重）
//   headLockPool 明显降（≥2）且 poolH 不降 → PASS（soft 起效）
//   仅降 1 或 poolH 反降   → Review（机制起效但不足以打破 basin）
//   未降                    → Review（机制未挪动候选池）
function computeVerdict(results, gates, b3Stable) {
  const baseLock = results.baseline.pool.headLockPool;
  const cLock = results['B4-C1'].pool.headLockPool;
  const baseH = results.baseline.pool.poolHfamilyMean;
  const cH = results['B4-C1'].pool.poolHfamilyMean;
  if (!b3Stable) {
    return 'FAIL：B3 质量退化（score/ratio/complex/unique 有破坏）。记录，不扫权重。';
  }
  if (cLock <= baseLock - 2 && cH >= baseH) {
    return `PASS：headLockPool ${baseLock}→${cLock}（明显下降≥2）且 poolH ${baseH}→${cH} 不降 → soft head-family avoidance 在 generation 起效。`;
  }
  if (cLock < baseLock) {
    return `Review：b3Stable 但 headLockPool 仅降 ${baseLock}→${cLock}（<2，非「明显下降」）且 poolH ${baseH}→${cH} → 机制起效但不足以打破 basin。`;
  }
  return `Review：b3Stable 但 headLockPool 未下降（${baseLock}→${cLock}）→ 机制未挪动候选池，信号/注入点不足。`;
}

if (require.main === module) {
  main();
}