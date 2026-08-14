/**
 * ============================================================
 *  b4g1-benchmark.cjs — B4-G1 Size4 redirection + Size5 T-archetype suppression
 * ============================================================
 *
 *  前提：G0 证明 size budget 是真实旋钮但 headroom 有限——size2/3 ↓ 只把格子推给
 *  size5，而 size5 本身 T-heavy（head 仍存在，headLockPool 10→10，headRatio 触 65% 顶）。
 *  G1 换两个未测杠杆：
 *    (A) size→size4 重定向：把 size2/3 释放的权重转移给 size4（低-head sink），而非 size5。
 *    (B) size5 T/cross archetype 抑制：保持 size 预算，用新钩子 size5BranchSuppress
 *        （topologyBiasWeightV2 的 branch 加分 `1+0.6*branch` 乘 (1-s)）打掉 T/cross 偏好。
 *    (C) 组合：size4 增权 + size5 T 抑制（测理论上限）。
 *
 *  机制（cage-generator-v9.cjs 新增钩子，默认 0 生产不变）：
 *    size5BranchSuppress ∈ [0,1]：把 topologyBiasWeightV2 的 branch 加分 `0.6` 乘 (1-s)。
 *      只作用于 growCage frontier selection 的拓扑加权，不碰 size 预算/difficulty/selection。
 *    size weights：脚本内实例级覆写 `gen._getCageSizeWeights = () => weights`（零生产改动）。
 *
 *  协议：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective/canonicalProfile 冻结，
 *  与 G0 完全一致。三臂（G1-A/B/C）。对照基准 = G0 baseline（frozen reference）：
 *    headRatio 0.675 / headLockPool 10 / complexShare 0.354 / ratioMean 0.2276 / score 531.7。
 *
 *  验收（能否突破 65% headRatio）：
 *    breakthrough ：headRatio < 0.65
 *    b3Stable      ：uniqueAll && |score-531.7|≤30 && complexShare≥0.354-0.001
 *                    && |ratioMean-0.2276|≤0.03
 *    headLockDown  ：headLockPool < 10（次要）
 *    PASS（继续 B4）：至少一臂 breakthrough && b3Stable
 *    Freeze（自动冻结）：无任何臂 breakthrough（或 breakthrough 但 b3 不稳）
 *
 *  辅助机制验证（纯测量，确认 G1-B 真的打掉 size5 T）：
 *    sizeBreakdown：每 size 的 cage 数 / head 数 / headRatio / T/cross 占比 / archetype 分布。
 *
 *  用法:
 *    node scripts/b4g1-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4g1-benchmark.json（约 25min，三臂）
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

// B3-FINAL 口径 + winner 侧 head/size/basin/family 分布 + size-by-size head 分解
function analyzeWinner(batch) {
  const canonicalFamily = new Map();
  const basinHist = {};
  const sizeHist = {};
  const sizeHead = {};   // { size: { total, head, Tcross } }——G1-B 机制验证
  const sizeArchetype = {}; // { size: { archetype: count } }
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
      const a = classifyArchetype(cells);
      sizeHist[feats.size] = (sizeHist[feats.size] || 0) + 1;
      basinHist[basinSignature(cells)] = (basinHist[basinSignature(cells)] || 0) + 1;
      // size-level head 分解
      const sh = sizeHead[feats.size] || (sizeHead[feats.size] = { total: 0, head: 0, Tcross: 0 });
      sh.total++;
      if (CANONICAL_SHAPE_SET.has(a)) { sh.head++; headNum++; }
      if (a === 'T' || a === 'cross') sh.Tcross++;
      const sa = sizeArchetype[feats.size] || (sizeArchetype[feats.size] = {});
      sa[a] = (sa[a] || 0) + 1;
      totalCages++;
      if (feats.size === 1) singleton++;
      if (feats.crossHouse && feats.size >= 4) complexNum++;
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
  // size-level head 分解（含 headRatio per size + T/cross share）
  const sizeBreakdown = {};
  for (const k of Object.keys(sizeHead)) {
    const s = sizeHead[k];
    sizeBreakdown[k] = {
      total: s.total,
      headRatio: Math.round(s.head / s.total * 1000) / 1000,
      shareAllCages: Math.round(s.total / totalCages * 1000) / 1000,
      TcrossShare: Math.round(s.Tcross / s.total * 1000) / 1000,
      archetype: sizeArchetype[k],
    };
  }
  return {
    levels: numLevels, totalCages,
    headRatio: totalCages ? Math.round(headNum / totalCages * 1000) / 1000 : null,
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
    sizeBreakdown,
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

// G0 baseline（frozen reference）
const BASELINE = {
  headRatio: 0.675, headLockPool: 10,
  complexShare: 0.354294, ratioMean: 0.227647, avgScore: 531.7, uniqueAll: true,
};

const ARMS = {
  'G1-A': {
    label: 'G1-A', note: 'size2/3 ↓→size4（验证 size4 低-head sink）',
    weights: { 1: 0.02, 2: 0.05, 3: 0.15, 4: 0.45, 5: 0.33 },
    suppress: 0,
  },
  'G1-B': {
    label: 'G1-B', note: '保持 size 预算，size5 T/cross branch 加分全抑制',
    weights: { 1: 0.02, 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 },
    suppress: 1,
  },
  'G1-C': {
    label: 'G1-C', note: '组合：size4 增权 + size5 T 抑制（理论上限）',
    weights: { 1: 0.02, 2: 0.05, 3: 0.15, 4: 0.45, 5: 0.33 },
    suppress: 1,
  },
};

function runArm(key, opts) {
  const cfg = ARMS[key];
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    canonicalProfile: true,
    size5BranchSuppress: cfg.suppress, // G1-B/C：打掉 T/cross 偏好；G1-A：0
  });
  // B4-G1-A/C：实例级覆写 size weight（零生产代码改动）
  gen._getCageSizeWeights = () => cfg.weights;
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: `B4G1-${cfg.label}` });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const winner = analyzeWinner(batch);
  const pool = analyzePool(batch, gen.getPoolCoverage());
  const sb5 = winner.sizeBreakdown && winner.sizeBreakdown['5'];
  console.log(`>> ${cfg.label}: head=${(winner.headRatio * 100).toFixed(1)}%  headLockPool=${pool.headLockPool}  poolH=${pool.poolHfamilyMean}  top4Win=${(winner.top4FamilyShare * 100).toFixed(1)}%  comp=${(winner.complexShare * 100).toFixed(1)}%  ratio=${(winner.ratioMean * 100).toFixed(1)}%  score=${winner.avgScore}  uniq=${winner.uniqueAll}  size5head=${sb5 ? (sb5.headRatio * 100).toFixed(1) + '%' : 'n/a'}  size5Tcross=${sb5 ? (sb5.TcrossShare * 100).toFixed(1) + '%' : 'n/a'}  (${elapsed}s)`);
  return { winner, pool, elapsed: Number(elapsed) };
}

function computeVerdict(results) {
  const rows = [];
  for (const key of Object.keys(ARMS)) {
    const w = results[key].winner, p = results[key].pool;
    const breakthrough = w.headRatio !== null && w.headRatio < 0.65;
    const b3Stable = w.uniqueAll && w.avgScore !== null &&
      Math.abs(w.avgScore - BASELINE.avgScore) <= 30 &&
      w.complexShare >= BASELINE.complexShare - 0.001 &&
      Math.abs(w.ratioMean - BASELINE.ratioMean) <= 0.03;
    const headLockDown = p.headLockPool < BASELINE.headLockPool;
    rows.push({
      arm: key, headRatio: w.headRatio, headLockPool: p.headLockPool,
      breakthrough: w.headRatio !== null ? Math.round(w.headRatio * 1000) / 1000 : null,
      breakthroughBelow065: breakthrough, b3Stable, headLockDown,
    });
  }
  const anyPass = rows.some((r) => r.breakthroughBelow065 && r.b3Stable);
  return { rows, anyPass };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-G1 Size4 redirection + Size5 T-archetype suppression（纯实验臂） ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  canonicalProfile=true`);
  console.log(`对照基准(G0 frozen): headRatio=${BASELINE.headRatio} headLockPool=${BASELINE.headLockPool}\n`);

  const results = {};
  for (const key of Object.keys(ARMS)) results[key] = runArm(key, opts);

  const verdict = computeVerdict(results);
  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Math.round(Object.values(results).reduce((a, r) => a + r.elapsed, 0) * 10) / 10 },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true, canonicalProfile: true },
    variable: 'size weights (instance override) + size5BranchSuppress (branch bonus * (1-s))',
    baselineRef: BASELINE,
    arms: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, { weights: ARMS[k].weights, suppress: ARMS[k].suppress, note: ARMS[k].note, ...v.winner, pool: v.pool, elapsed: v.elapsed }])),
    verdict: verdict.rows,
    decision: verdict.anyPass ? 'CONTINUE_B4' : 'FREEZE_B4',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4g1-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`\n判定（对照 baseline headRatio=0.675 headLockPool=10）:`);
  for (const r of verdict.rows) {
    console.log(`  ${r.arm}: head=${(r.headRatio * 100).toFixed(1)}%  <65%?${r.breakthroughBelow065}  b3Stable=${r.b3Stable}  headLockPool=${r.headLockPool}(↓${r.headLockDown})`);
  }
  console.log(`\n决策: ${verdict.anyPass ? 'CONTINUE_B4（至少一臂突破 65% 且 b3 稳）' : 'FREEZE_B4（无臂突破 65% headRatio，自动冻结）'}`);
  console.log(`已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}