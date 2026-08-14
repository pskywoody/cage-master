/**
 * ============================================================
 *  b4g0-benchmark.cjs — B4-G0 Size Budget Sensitivity（可控性验证）
 * ============================================================
 *
 *  目的：B4-F2 定位 size=2/3 是 `_getCageSizeWeights(star=4)` 的显式预算
 *  （headRatio 的结构性根因）。G0 验证**【可控性】**：
 *    size2/size3 budget ↓  →  headRatio 是否按预期下降？
 *    →  unique / complexity / ratio 是否承受得住？
 *
 *  性质：纯实验臂，**不改 baseline、不入生产、不接 selection、不改 B3-FINAL**。
 *  干预方式：脚本内覆写 `gen._getCageSizeWeights = () => weights`（实例级，
 *  零生产代码改动），把 size2/3 的权重减半后转移到 size5（大笼），保持 sum=1。
 *
 *  协议：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective，
 *  canonicalProfile=true，与 B3-FINAL/F0/F1/F2 一致。只变 size weights。
 *
 *  实验臂（size2/size3 减半 → 转 size5）：
 *    baseline  {1:.02, 2:.10, 3:.25, 4:.30, 5:.33}   （原值，对照）
 *    G0-A      {1:.02, 2:.05, 3:.25, 4:.30, 5:.38}   size2 贡献
 *    G0-B      {1:.02, 2:.10, 3:.125,4:.30, 5:.455}  size3 贡献
 *    G0-C      {1:.02, 2:.05, 3:.125,4:.30, 5:.505}  上限测试（双降）
 *
 *  观察指标：
 *    headRatio（winner 关键指标，新增）
 *    headLockPool（pool）
 *    top4FamilyShare / top4FamilyHitShare（集中度）
 *    complexShare / ratio / score / uniqueAll / sizeShare
 *
 *  预期：
 *    若可控：size2/3 ↓ → headRatio ↓、headLockPool ↓，且 complex/unique 不崩
 *    若不可控：size budget 对 headRatio 无响应，或 complex/unique 崩塌
 *
 *  用法:
 *    node scripts/b4g0-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4g0-benchmark.json（约 20-25min，四臂）
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
  const o = { count: 30, seed: 20260810, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

// B3-FINAL 口径 + winner 侧 head/size/basin/family 分布（G0 主观测）
function analyzeWinner(batch) {
  const canonicalFamily = new Map();
  const basinHist = {};
  const sizeHist = {};
  const ratios = [], scores = [];
  let totalCages = 0, singleton = 0, complexNum = 0, headNum = 0;
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
        headNum++;
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
  for (const k of Object.keys(sizeHist)) sizeShare[k] = Math.round(sizeHist[k] / totalCages * 1000) / 1000;
  const basinShare = {};
  for (const k of Object.keys(basinHist)) basinShare[k] = Math.round(basinHist[k] / totalCages * 1000) / 1000;
  return {
    levels: numLevels, totalCages,
    headRatio: totalCages ? Math.round(headNum / totalCages * 1000) / 1000 : null, // G0 关键指标
    Hcanonical: Math.round(Hcanonical * 1000) / 1000,
    canonicalFamilyCount: canonicalFamily.size,
    top1FamilyShare: canonicalTotal ? Math.round(top1c / canonicalTotal * 1000) / 1000 : 0,
    top4FamilyShare: canonicalTotal ? Math.round(top4c / canonicalTotal * 1000) / 1000 : 0,
    top8FamilyShare: canonicalTotal ? Math.round(top8c / canonicalTotal * 1000) / 1000 : 0,
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

const ARMS = {
  baseline: { label: 'baseline', note: '原值对照', weights: { 1: 0.02, 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 } },
  'G0-A': { label: 'G0-A', note: 'size2 ↓（0.10→0.05）→size5', weights: { 1: 0.02, 2: 0.05, 3: 0.25, 4: 0.30, 5: 0.38 } },
  'G0-B': { label: 'G0-B', note: 'size3 ↓（0.25→0.125）→size5', weights: { 1: 0.02, 2: 0.10, 3: 0.125, 4: 0.30, 5: 0.455 } },
  'G0-C': { label: 'G0-C', note: 'size2+size3 双降 →size5（上限）', weights: { 1: 0.02, 2: 0.05, 3: 0.125, 4: 0.30, 5: 0.505 } },
};

function runArm(key, opts) {
  const cfg = ARMS[key];
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    canonicalProfile: true,
  });
  // B4-G0：实例级覆写 size weight（零生产代码改动，不入生产）
  gen._getCageSizeWeights = () => cfg.weights;
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: `B4G0-${cfg.label}` });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const winner = analyzeWinner(batch);
  const pool = analyzePool(batch, gen.getPoolCoverage());
  console.log(`>> ${cfg.label}: head=${(winner.headRatio * 100).toFixed(1)}%  headLockPool=${pool.headLockPool}  poolH=${pool.poolHfamilyMean}  top4Win=${(winner.top4FamilyShare * 100).toFixed(1)}%  comp=${(winner.complexShare * 100).toFixed(1)}%  ratio=${(winner.ratioMean * 100).toFixed(1)}%  score=${winner.avgScore}  uniq=${winner.uniqueAll}  (${elapsed}s)`);
  return { winner, pool, elapsed: Number(elapsed) };
}

function computeVerdict(results) {
  const base = results.baseline;
  const bW = base.winner, bP = base.pool;
  const rows = [];
  for (const key of ['G0-A', 'G0-B', 'G0-C']) {
    const w = results[key].winner, p = results[key].pool;
    const headDown = w.headRatio !== null && w.headRatio < bW.headRatio;
    const headLockDown = p.headLockPool < bP.headLockPool;
    const b3Stable = w.uniqueAll && Math.abs(w.avgScore - bW.avgScore) <= 30 &&
      w.complexShare >= bW.complexShare - 0.001 && Math.abs(w.ratioMean - bW.ratioMean) <= 0.03;
    rows.push({ arm: key, headRatio: w.headRatio, headLockPool: p.headLockPool, headDown, headLockDown, b3Stable });
  }
  return rows;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-G0 Size Budget Sensitivity（可控性验证，纯实验臂） ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  canonicalProfile=true`);
  console.log(`四臂：size2/3 budget 减半 → 转移 size5（sum=1），实例级覆写 _getCageSizeWeights，不入生产\n`);

  const results = {};
  for (const key of Object.keys(ARMS)) results[key] = runArm(key, opts);

  const verdict = computeVerdict(results);
  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Math.round(Object.values(results).reduce((a, r) => a + r.elapsed, 0) * 10) / 10 },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true, canonicalProfile: true },
    variable: 'size weights in _getCageSizeWeights(4)',
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { weights: ARMS[k].weights, note: ARMS[k].note, ...v.winner, pool: v.pool, elapsed: v.elapsed }])),
    verdict,
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4g0-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n可控性判定（相对 baseline headRatio=${results.baseline.winner.headRatio} headLockPool=${results.baseline.pool.headLockPool}）:`);
  for (const r of verdict) {
    console.log(`  ${r.arm}: head=${(r.headRatio * 100).toFixed(1)}%（↓${r.headDown}） headLockPool=${r.headLockPool}（↓${r.headLockDown}） b3Stable=${r.b3Stable}`);
  }
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}