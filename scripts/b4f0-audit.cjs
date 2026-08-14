/**
 * ============================================================
 *  b4f0-audit.cjs — B4-F0 Candidate Pipeline Audit（纯测量）
 * ============================================================
 *
 *  目的：**不引入任何机制**，验证 non-head candidate 是否在
 *   generator → difficulty → inRange → pool 途中被淘汰。
 *
 *  背景（B4-E1 结论）：
 *    E1 证明 selection repulsion 只在 head variant A/B/C 之间重排，
 *    无法选中 non-head candidate，因为 pool 里没有非 head 替代。
 *    因此瓶颈可能在 generator→pool 之间，而非 selection 后半段。
 *
 *  本脚本启用 generator 内置的 candidateAudit instrumentation：
 *    三分段记录每个候选的「head vs non-head 结构画像」：
 *      _auditRaw      raw：partitionCages + reshape 后、进入 dig 前
 *      _auditValid    difficulty-valid：_generateOne 返回非空（通过 dig+unique+rating 得 score）
 *      _auditInRange  inRange：score 在可接受区间（进入 selection pool）
 *    计算 head / non-head 各阶段 retention，定位淘汰点。
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true / canonicalProfile=true 冻结，
 *  仅加 candidateAudit=true（纯读，不改 selection/生成逻辑）。
 *  N=30。单臂，无对照——F0 是测量审计不是机制实验。
 *
 *  判定方向：
 *    head retention >> non-head retention（如 80% vs 5%）→ difficulty gate bias 为根因
 *    raw 阶段 headRatio 已极高（non-head 出生即少）→ generation 端为根因
 *    valid→inRange 无选择性 → selection 端为根因（但 E1 已排除 repulsion）
 *
 *  用法:
 *    node scripts/b4f0-audit.cjs --count 30 --seed 20260810
 *  输出: data/b4f0-audit.json（约 6-7min，单臂）
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
  const o = { count: 30, seed: 20260810, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

// B3-FINAL 口径 winner 指标（稳定性参考，F0 不设 PASS gate，只作对照）
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

// pool 指标（跨关候选池 family 覆盖，headLockPool 等）
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

function main() {
  const opts = parseArgs();
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    canonicalProfile: true,
    candidateAudit: true, // B4-F0：纯测量，不改 selection/生成
  });
  const t0 = Date.now();
  console.log(`=== B4-F0 Candidate Pipeline Audit（纯测量，无机制） ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  canonicalProfile=true  candidateAudit=true`);
  const batch = gen.generateBatch(opts.count, { prefix: 'B4F0' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const winner = analyzeWinner(batch);
  const pool = analyzePool(batch, gen.getPoolCoverage());
  const audit = gen.getCandidateAudit();

  console.log(`winner: comp=${(winner.complexShare * 100).toFixed(1)}%  ratio=${(winner.ratioMean * 100).toFixed(1)}%  score=${winner.avgScore}  uniq=${winner.uniqueAll}  (${elapsed}s)`);
  console.log(`pool:   headLockPool=${pool.headLockPool}  poolH=${pool.poolHfamilyMean}  uniqueFam=${pool.uniqueFamiliesInPool}`);
  console.log(`audit:  attempts=${audit.attempts}  raw=${audit.rawCount}  valid=${audit.validCount}  inRange=${audit.inRangeCount}`);
  console.log(`  raw     headRatio=${audit.raw.headRatio}  nonHeadRatio=${audit.raw.nonHeadRatio}  complex=${audit.raw.complexCages}`);
  console.log(`  valid   headRatio=${audit.valid.headRatio}  nonHeadRatio=${audit.valid.nonHeadRatio}  complex=${audit.valid.complexCages}`);
  console.log(`  inRange headRatio=${audit.inRange.headRatio}  nonHeadRatio=${audit.inRange.nonHeadRatio}  complex=${audit.inRange.complexCages}`);
  console.log(`  retentionValid   head=${audit.retentionValid.head}  nonHead=${audit.retentionValid.nonHead}`);
  console.log(`  retentionInRange head=${audit.retentionInRange.head}  nonHead=${audit.retentionInRange.nonHead}`);
  console.log(`  hitRate(raw→pool)=${audit.hitRate}`);
  console.log(`  relValid ΔheadRatio=${audit.relValid ? audit.relValid.deltaHeadRatio : null}  relInRange ΔheadRatio=${audit.relInRange ? audit.relInRange.deltaHeadRatio : null}`);

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true, canonicalProfile: true, candidateAudit: true },
    winner,
    pool,
    audit,
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4f0-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n已保存: ${outPath}`);
}

main();