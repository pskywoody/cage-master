/**
 * ============================================================
 *  b4c0-benchmark.cjs — B4-C0 Generation Gap Quantification
 * ============================================================
 *
 *  目的：判断 generation 缺的是「family 数量」还是「family 组合结构」。
 *  纯测量，不改生成、不改 selection、不加权。
 *
 *  背景：B4-A/B/D1 三次独立失败都指向「候选池缺有效 family 维度」，
 *  但还没量化到底是【family 数量少】还是【family 存在但组合窄】。
 *  C0 回答这个，C1 才有明确靶点。
 *
 *  测量（基于 canonicalProfile instrumentation）：
 *    1. candidate family coverage
 *         uniqueFamiliesInPool（候选池探索到的 family 并集）
 *         uniqueFamiliesInWinners（winner 实际使用的 family 并集）
 *         coverage = winners / pool（winner 是否只用 pool 子集）
 *    2. candidate composition
 *         uniqueFamilyCombosInPool（不同 family 组合数）
 *         avg candidates per level
 *    3. missing-family rate
 *         pool vs winners 的差异 family
 *    4. family rank head concentration
 *         familyRank（候选池内 family 出现次数分布，验证 head basin 锁死）
 *
 *  C0 gate（决定 C1 方向）：
 *    family coverage 低      → C1 扩大 generation（family 数量缺失）
 *    coverage 高但组合低      → 改 partition/search path（组合缺失）
 *    coverage 和组合都高      → 回头查 selection objective
 *
 *  用法:
 *    node scripts/b4c0-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4c0-benchmark.json
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

function analyze(batch, poolCoverage) {
  // winner 实际使用的 family 并集
  const winnerFamilies = new Set();
  const winnerCombos = new Set();
  let avgCandidates = 0, levelsWithPool = 0;
  for (const lv of batch) {
    const cp = lv._canonicalPool;
    if (cp && cp.candidateCount > 0) {
      avgCandidates += cp.candidateCount;
      levelsWithPool++;
    }
    const w = cp && cp.winner;
    if (w && w.families) {
      for (const fam of w.families) winnerFamilies.add(fam);
      if (w.families.length > 0) winnerCombos.add(w.families.slice().sort().join('|'));
    }
  }
  const poolFamilies = poolCoverage ? poolCoverage.uniqueFamiliesInPool : 0;
  const poolCombos = poolCoverage ? poolCoverage.uniqueFamilyCombosInPool : 0;
  const familyRank = poolCoverage ? poolCoverage.familyRank : {};
  // head concentration：候选池内 family 出现次数 top 分布
  const rankVals = Object.values(familyRank).sort((a, b) => b - a);
  let headLockPool = 0;
  const totalCandidateFamilyHits = rankVals.reduce((a, b) => a + b, 0);
  for (const c of rankVals) if (c / batch.length >= 0.8) headLockPool++;
  let top4pool = 0, top1pool = 0;
  for (let i = 0; i < rankVals.length; i++) {
    if (i === 0) top1pool = rankVals[0];
    if (i < 4) top4pool += rankVals[i];
  }
  return {
    levels: batch.length,
    levelsWithPool,
    avgCandidatesPerLevel: levelsWithPool ? Math.round((avgCandidates / levelsWithPool) * 10) / 10 : null,
    families: {
      uniqueFamiliesInPool: poolFamilies,
      uniqueFamiliesInWinners: winnerFamilies.size,
      coverage_winners_over_pool: poolFamilies ? Math.round((winnerFamilies.size / poolFamilies) * 1000) / 1000 : null,
    },
    composition: {
      uniqueFamilyCombosInPool: poolCombos,
      uniqueFamilyCombosInWinners: winnerCombos.size,
    },
    headConcentration: {
      familyRank,
      headLockPool: headLockPool, // 候选池内出现率>=80% 的 family 数
      top1FamilyHitShare: totalCandidateFamilyHits ? Math.round((top1pool / totalCandidateFamilyHits) * 1000) / 1000 : null,
      top4FamilyHitShare: totalCandidateFamilyHits ? Math.round((top4pool / totalCandidateFamilyHits) * 1000) / 1000 : null,
    },
  };
}

function computeVerdict(a) {
  const coverage = a.families.coverage_winners_over_pool;
  const poolFams = a.families.uniqueFamiliesInPool;
  const combos = a.composition.uniqueFamilyCombosInPool;
  const headLock = a.headConcentration.headLockPool;
  // 覆盖率高（winner 用了 pool 大部分）→ 不缺 family 数量，问题在组合或 selection
  if (coverage === null) return 'NO DATA：instrumentation 未生效。';
  if (coverage >= 0.8) {
    return combos <= 3
      ? `C0 → 改 partition/search path：family coverage 高（${coverage}）但组合极窄（${combos}）→ 缺 family 组合结构，不是 family 数量。`
      : `C0 → 回头查 selection objective：family coverage 高（${coverage}）且组合多样（${combos}）→ generation 不缺，问题在 selection。`;
  }
  return `C0 → C1 扩大 generation：family coverage 低（${coverage}，winner仅用pool ${a.families.uniqueFamiliesInWinners}/${poolFams}）→ 缺 family 数量，headLock=${headLock}。`;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-C0 Generation Gap Quantification (纯测量) ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  NO weight\n`);

  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    canonicalProfile: true,
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4C0' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const poolCoverage = gen.getPoolCoverage();
  const a = analyze(batch, poolCoverage);

  console.log(`耗时 ${elapsed}s，${a.levels} 关`);
  console.log(`\n[family] 候选池 unique=${a.families.uniqueFamiliesInPool}  winner unique=${a.families.uniqueFamiliesInWinners}  coverage=${a.families.coverage_winners_over_pool}`);
  console.log(`[组合] pool combos=${a.composition.uniqueFamilyCombosInPool}  winner combos=${a.composition.uniqueFamilyCombosInWinners}`);
  console.log(`[head] headLockPool=${a.headConcentration.headLockPool}  top1Hit=${a.headConcentration.top1FamilyHitShare}  top4Hit=${a.headConcentration.top4FamilyHitShare}`);
  console.log(`[候选] avgCandidates/level=${a.avgCandidatesPerLevel}`);
  console.log(`\nfamilyRank (候选池内 family 出现次数):`);
  for (const [fam, c] of Object.entries(a.headConcentration.familyRank)) {
    console.log(`  ${c}  ${fam}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true },
    variable: { none: 'measurement only' },
    result: a,
    verdict: computeVerdict(a),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4c0-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nVerdict: ${report.verdict}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}