/**
 * ============================================================
 *  b4c2-benchmark.cjs — B4-C2 Basin-level Birth Pressure
 * ============================================================
 *
 *  目的：验证「basin-level birth pressure」——惩罚 coarse structural basin 的
 *  occupancy（重复结构占用），而非 family identity。
 *
 *  假说：
 *    H1: family-level pressure failed because attraction occurs at basin level.
 *        （C1 证明 family 级均匀压力只在 basin 内部洗牌占优 family，不降 head 总量）
 *    H2: basin-level pressure should reduce repeated structural occupancy
 *        without forcing family cycling.
 *
 *  机制（cage-generator-v9.cjs）：
 *    与 C1 同机制、同 floor、同跨关累计，唯一区别是 pressure source：
 *      C1: effectiveWeight *= (1 - familyFreq/targetFreq)   → family identity
 *      C2: effectiveWeight *= (1 - basinFreq/targetFreq)    → coarse basin occupancy
 *    basinSignature(cells) 把 fine family 聚合成 6 个宏观 basin：
 *      linear(domino/straight-N) / corner(L/hook) / branch(T/cross) /
 *      rect(完整矩形) / complex(zigzag/irregular) / singleton
 *    不引入新 embedding，只用已有拓扑属性。
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true 冻结，
 *  只改 basinBirthPressureWeight：0 (baseline) / 中等单点值 0.4。不扫描。
 *  canonicalProfile=true（采集 pool 指标）。
 *
 *  验收（保持 C1 修正后的严格口径，不放宽）：
 *    PASS:
 *      headLockPool ≤ baseline - 2
 *      AND poolHfamily >= baseline
 *    B3 稳定：complex / ratio / score / unique 不可退化
 *
 *  预测：
 *    成功：headLockPool 10→≤8，poolH>=1.627，winner top4Share 下降
 *    失败（headLockPool 不变）：birth 非控制变量，selection/objective 维持 basin
 *
 *  用法:
 *    node scripts/b4c2-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4c2-benchmark.json（约 13min，两臂）
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

// 与生成器 basinSignature 对齐（压力分组）
function basinSignature(cells) {
  const a = classifyArchetype(cells);
  switch (a) {
    case 'singleton': return 'singleton';
    case 'domino':
    case 'straight': return 'linear';
    case 'L':
    case 'hook': return 'corner';
    case 'T':
    case 'cross': return 'branch';
    case 'rect': return 'rect';
    default: return 'complex';
  }
}

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

// B3-FINAL 口径 + winner 侧 basin/family 分布（稳定性参考，不作 C2 主 gate）
function analyzeWinner(batch) {
  const canonicalFamily = new Map();
  const basinHist = {};
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
      basinHist[basinSignature(cells)] = (basinHist[basinSignature(cells)] || 0) + 1;
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
  const basinShare = {};
  for (const k of Object.keys(basinHist)) basinShare[k] = Math.round(basinHist[k] / totalCages * 1000) / 1000;
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
    basinShare,
    ratioMean: meanR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
    sizeShare,
    winnerFamilyRank: Object.fromEntries([...famLevelCount].sort((a, b) => b[1] - a[1])),
  };
}

// C2 主指标：候选池 level（headLockPool / poolHfamily）——目标发生在 generation
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
    basinBirthPressureWeight: weight,
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4C2' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const winner = analyzeWinner(batch);
  const pool = analyzePool(batch, gen.getPoolCoverage());
  console.log(`>> ${label}: w=${weight}  headLockPool=${pool.headLockPool}  poolH=${pool.poolHfamilyMean}  comp=${(winner.complexShare * 100).toFixed(1)}%  ratio=${(winner.ratioMean * 100).toFixed(1)}%  score=${winner.avgScore}  uniq=${winner.uniqueAll}  (${elapsed}s)`);
  return { winner, pool, elapsed: Number(elapsed) };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-C2 Basin-level Birth Pressure (soft basin-occupancy avoidance) ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  canonicalProfile=true`);
  console.log(`only basinBirthPressureWeight varies: 0 / ${opts.weight}（中等单点，与 C1 同强度）\n`);

  const arms = [
    { label: 'baseline', w: 0 },
    { label: 'B4-C2', w: opts.weight },
  ];
  const results = {};
  for (const arm of arms) results[arm.label] = runArm(arm.label, opts, arm.w);

  const base = results.baseline, b = results['B4-C2'];
  const bw = base.winner, bp = base.pool, cw = b.winner, cp = b.pool;
  const gates = {
    score_stable: cw.avgScore !== null && bw.avgScore !== null && Math.abs(cw.avgScore - bw.avgScore) <= 30,
    ratio_no_drift: Math.abs(cw.ratioMean - bw.ratioMean) <= 0.03,
    complex_not_down: cw.complexShare >= bw.complexShare - 0.001,
    unique_all: cw.uniqueAll,
    // C2 PASS 标准（不放宽）
    headLockPool_down_ge2: cp.headLockPool <= bp.headLockPool - 2,
    poolHfamily_not_down: cp.poolHfamilyMean >= bp.poolHfamilyMean,
  };
  const b3Stable = gates.score_stable && gates.ratio_no_drift && gates.complex_not_down && gates.unique_all;

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, weight: opts.weight, elapsedSeconds: Math.round((results.baseline.elapsed + results['B4-C2'].elapsed) * 10) / 10 },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true, canonicalProfile: true },
    variable: { basinBirthPressureWeight: [0, opts.weight] },
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v.winner, pool: v.pool, elapsed: v.elapsed }])),
    gates,
    b3Stable,
    verdict: computeVerdict(results, gates, b3Stable),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4c2-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`b3Stable=${b3Stable}`);
  console.log(`\n已保存: ${outPath}`);
}

// 结果解释（C2 目标在 generation，看 pool 不看 winner）：
//   headLockPool 不变                → 关键负结果：birth 非控制变量，basin 由 selection/objective 维持（用户预测的失败分支）
//   headLockPool ≤ baseline-2 且 poolH 不降 → PASS（H2 成立：basin pressure 降重复占用）
//   仅降<2 或 poolH 反降            → Review（basin pressure 起效但不足以打破 basin）
function computeVerdict(results, gates, b3Stable) {
  const baseLock = results.baseline.pool.headLockPool;
  const cLock = results['B4-C2'].pool.headLockPool;
  const baseH = results.baseline.pool.poolHfamilyMean;
  const cH = results['B4-C2'].pool.poolHfamilyMean;
  if (cLock >= baseLock) {
    return `FAIL（关键负结果）：headLockPool 未下降（${baseLock}→${cLock}）→ birth mechanism 非控制变量，basin 由 selection/objective 维持。C1(family)+C2(basin) 均无法在出生端打破 basin，下一层应看 objective fitness landscape / selection temperature / diversity preservation term。`;
  }
  if (gates.headLockPool_down_ge2 && gates.poolHfamily_not_down) {
    return `PASS：headLockPool ${baseLock}→${cLock}（降≥2）且 poolH ${baseH}→${cH} 不降 → basin-level pressure 降低重复结构占用（H2 成立）。`;
  }
  if (cLock < baseLock) {
    return `Review：headLockPool 仅降 ${baseLock}→${cLock}（<2）或 poolH反降 ${baseH}→${cH} → basin pressure 起效但不足以打破 basin。`;
  }
  return `FAIL：headLockPool 未下降（${baseLock}→${cLock}）→ birth 非控制变量，selection/objective 维持 basin。`;
}

if (require.main === module) {
  main();
}