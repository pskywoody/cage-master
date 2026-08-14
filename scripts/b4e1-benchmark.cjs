/**
 * ============================================================
 *  b4e1-benchmark.cjs — B4-E1 Objective Saturation
 * ============================================================
 *
 *  目的：验证「objective 过度奖励已探索 head 结构」是否为 basin lock 根因。
 *  与 B4-C（birth-side）不同：C1/C2 改出生分布都打不动 headLock（10→10），
 *  证明「候选 availability」不是瓶颈；E1 改 selection 的 fitness landscape，
 *  直接惩罚「候选与历史 winner 的结构相似度」——让 objective 不再对同构结构反复给高分。
 *
 *  假说（用户定义）：
 *    E1: head basin 不是因为真的更优，而是 objective 对它过度奖励。
 *        → 若对「已赢过的结构」施加相似度 repulsion，headLock 应下降。
 *
 *  机制（cage-generator-v9.cjs）：
 *    levelFamilyVector(cages) = per-level canonical family 计数向量。
 *    cosineSimilarity(a,b)    = 两关 family 向量的余弦相似度。
 *    exploredSim = max over 历史 winners 的 cosine(candidate, winner)。
 *    fitness = baseFitness + exploredHeadWeight * exploredSim
 *      （fitness 越小越好 → 越像过去已赢结构，fitness 加得越多 → 越难被选中）
 *    跨关记忆：_winnerFamilyVectors 在 _finalizeLevel 累计每个 winner 的向量。
 *    诊断：_headSimRankChanges 记录「无该项不翻转、加该项后翻转」的次数。
 *
 *  与 B4-C1/D1 的关键区别：
 *    C1/D1 惩罚【单个 family 的跨关频率】（family identity）。
 *    E1 惩罚【候选 level 与历史 winner 的整体结构相似度】（level↔level repulsion）。
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true / canonicalProfile=true 冻结，
 *  只改 exploredHeadWeight：0 (baseline) / 机制可见单点 30（novelty∈[0,1]→贡献 0-30，
 *  与 B4-B 的 novelty=30 同量级，确保进入 ranking 路径）。不扫描。
 *
 *  验收（objective-side，看 headLockPool / poolHfamily / complexShare）：
 *    PASS:
 *      headLockPool ≤ baseline - 2
 *      AND poolHfamily >= baseline
 *    B3 稳定：complex / ratio / score / unique 不可退化
 *    机制指标：headSimRankChanges > 0（repulsion 真的进入 selection 路径）
 *
 *  预测：
 *    成功：headLockPool 10→≤8，poolH 不降，winner top4 集中度下降
 *    失败（headLockPool 不变）：即使 objective 对 head 施加 repulsion，
 *      候选池仍无足够「非 head 替代」→ 根因在 generation/search 而非 objective
 *
 *  用法:
 *    node scripts/b4e1-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4e1-benchmark.json（约 13min，两臂）
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
  const o = { count: 30, seed: 20260810, weight: 30, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--weight') o.weight = parseFloat(args[++i]);
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

// B3-FINAL 口径 + winner 侧 basin/family 分布（稳定性参考，不作 E1 主 gate）
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

// E1 主指标：候选池 level（目标即便发生在 objective，也看 pool 的 head 是否被打破）
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
    objective: { canonicalNoveltyWeight: 0, exploredHeadWeight: weight },
    canonicalProfile: true,
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4E1' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const winner = analyzeWinner(batch);
  const pool = analyzePool(batch, gen.getPoolCoverage());
  console.log(`>> ${label}: w=${weight}  headLockPool=${pool.headLockPool}  poolH=${pool.poolHfamilyMean}  headSimFlips=${gen._headSimRankChanges}  comp=${(winner.complexShare * 100).toFixed(1)}%  ratio=${(winner.ratioMean * 100).toFixed(1)}%  score=${winner.avgScore}  uniq=${winner.uniqueAll}  (${elapsed}s)`);
  return { winner, pool, headSimRankChanges: gen._headSimRankChanges, elapsed: Number(elapsed) };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-E1 Objective Saturation (explored-head similarity repulsion) ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  canonicalProfile=true`);
  console.log(`only exploredHeadWeight varies: 0 / ${opts.weight}（机制可见单点，不扫描）\n`);

  const arms = [
    { label: 'baseline', w: 0 },
    { label: 'B4-E1', w: opts.weight },
  ];
  const results = {};
  for (const arm of arms) results[arm.label] = runArm(arm.label, opts, arm.w);

  const base = results.baseline, b = results['B4-E1'];
  const bw = base.winner, bp = base.pool, cw = b.winner, cp = b.pool;
  const gates = {
    mechanism_engaged: b.headSimRankChanges > 0,
    // B3 稳定（B3-FINAL 口径）
    score_stable: cw.avgScore !== null && bw.avgScore !== null && Math.abs(cw.avgScore - bw.avgScore) <= 30,
    ratio_no_drift: Math.abs(cw.ratioMean - bw.ratioMean) <= 0.03,
    complex_not_down: cw.complexShare >= bw.complexShare - 0.001,
    unique_all: cw.uniqueAll,
    // E1 PASS 标准（保持不变）
    headLockPool_down_ge2: cp.headLockPool <= bp.headLockPool - 2,
    poolHfamily_not_down: cp.poolHfamilyMean >= bp.poolHfamilyMean,
  };
  const b3Stable = gates.score_stable && gates.ratio_no_drift && gates.complex_not_down && gates.unique_all;

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, weight: opts.weight, elapsedSeconds: Math.round((base.elapsed + b.elapsed) * 10) / 10 },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true, canonicalProfile: true },
    variable: { exploredHeadWeight: [0, opts.weight] },
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { ...v.winner, pool: v.pool, headSimRankChanges: v.headSimRankChanges, elapsed: v.elapsed }])),
    gates,
    b3Stable,
    verdict: computeVerdict(results, gates, b3Stable),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4e1-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`b3Stable=${b3Stable}`);
  console.log(`\n已保存: ${outPath}`);
}

// 结果解释（E1 目标在 objective，看 pool 的 head 是否被 repulsion 打破）：
//   headSimRankChanges=0       → repulsion 未进入 selection 路径 → FAIL（记录，不扫权重）
//   headLockPool 不变          → 候选池无足够「非 head 替代」→ objective 非根因（generation/search 是）
//   headLockPool ≤ baseline-2 且 poolH 不降 → PASS（objective landscape 是 basin lock 根因）
function computeVerdict(results, gates, b3Stable) {
  const baseLock = results.baseline.pool.headLockPool;
  const eLock = results['B4-E1'].pool.headLockPool;
  const baseH = results.baseline.pool.poolHfamilyMean;
  const eH = results['B4-E1'].pool.poolHfamilyMean;
  const flips = results['B4-E1'].headSimRankChanges;
  if (flips === 0) {
    return `FAIL：headSimRankChanges=0 → explored-head similarity repulsion 未进入 selection 路径（候选与历史 winner 相似度无差异或信号恒定）。记录，不扫权重。`;
  }
  if (eLock >= baseLock) {
    return `FAIL（关键负结果）：headLockPool 未下降（${baseLock}→${eLock}）但 repulsion 确实进入 selection（flips=${flips}）→ 候选池无足够「非 head 替代」可被 repulsion 选中 → objective landscape 非根因，根因在 generation/search（候选 availability）。`;
  }
  if (gates.headLockPool_down_ge2 && gates.poolHfamily_not_down) {
    return `PASS：headLockPool ${baseLock}→${eLock}（降≥2）且 poolH ${baseH}→${eH} 不降 → objective 对已探索 head 的过度奖励是 basin lock 根因（E1 成立）。`;
  }
  if (eLock < baseLock) {
    return `Review：headLockPool 仅降 ${baseLock}→${eLock}（<2）或 poolH反降 ${baseH}→${eH} → objective repulsion 起效但不足以打破 basin。`;
  }
  return `FAIL：headLockPool 未下降（${baseLock}→${eLock}）→ objective land 非根因。`;
}

if (require.main === module) {
  main();
}