/**
 * ============================================================
 *  cage-topology-entropy.cjs — Step B3-B0 Topology Entropy Audit
 * ============================================================
 *
 *  Audit Only。不改 generator / cage builder / fitness。
 *
 *  目标：回答「当前生成器是不是大量重复低价值 cage topology？」
 *
 *  对每个 cage：
 *    1. 提取原始 shape signature（cells [[r,c],...]）
 *    2. Canonical normalization（平移 + 8 个 dihedral 变换取最小形）→ shapeID
 *    3. 聚合：unique permit、熵 H、shapeDistribution、shapeReasoningMap
 *
 *  关联维度（每个 shape）：
 *    count           出现次数
 *    avgSize         平均格数
 *    avgEntropy      平均笼熵（同 B2-A：log2(combos)）
 *    crossHouseRate  跨宫比例（span >1 box）
 *    avgLevelRatio   该 shape 所在关卡的 avg cageReasoningRatio
 *
 *  判定门（Case 1/2/3）：
 *    H 低 + top10 占 >70%            → Topology Collapse → B3-B1
 *    H 高 + 高 ratio shape 很少      → Topology 丰富但未偏向 reasoning → shape-aware weighting
 *    H 高 + 高 ratio shape 普遍存在  → selection 仍不足 → 回 B3-A+
 *
 *  用法:
 *    node scripts/cage-topology-entropy.cjs --count 100 --seed 20260810
 *  输出: data/cage-topology-entropy-v9.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

// ---- cage 组合计数（同 B2-A）----
function countCombos(n, sum) {
  if (n <= 0) return 0;
  const memo = new Map();
  function dfs(depth, remaining, minDigit) {
    if (depth === 0) return remaining === 0 ? 1 : 0;
    if (remaining < minDigit * depth) return 0;
    if (remaining > 9 * depth) return 0;
    const key = depth + ',' + remaining + ',' + minDigit;
    if (memo.has(key)) return memo.get(key);
    let c = 0;
    for (let d = minDigit; d <= 9; d++) c += dfs(depth - 1, remaining - d, d + 1);
    memo.set(key, c);
    return c;
  }
  return dfs(n, sum, 1);
}

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

// ---- 笼结构特征 ----
function cageFeatures(cells) {
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const size = pts.length;
  // 跨宫：span >1 box（9x9 boxH=boxW=3）
  const boxes = new Set(pts.map(([r, c]) => Math.floor(r / 3) + ',' + Math.floor(c / 3)));
  return { size, spanBoxes: boxes.size, crossHouse: boxes.size > 1 };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 100, seed: 20260810, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function main() {
  const opts = parseArgs();
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, {});
  console.log(`=== B3-B0 Topology Entropy Audit ===`);
  console.log(`样本: ${opts.count}  seed: ${opts.seed}\n`);

  // shape → { count, sizeSum, entropySum, crossHouseCount, ratioSum, elems }
  const shapeMap = new Map();
  let totalCages = 0;
  for (const lv of batch) {
    const levelRatio = lv._objective ? lv._objective.cageReasoningRatio : 0;
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const shapeID = canonicalize(cells);
      const feats = cageFeatures(cells);
      const combos = countCombos(feats.size, cage.sum);
      const ent = combos > 1 ? Math.log2(combos) : 0;
      totalCages++;
      const rec = shapeMap.get(shapeID) || {
        shapeID, count: 0, sizeSum: 0, entropySum: 0, crossHouseCount: 0, ratioSum: 0,
      };
      rec.count++;
      rec.sizeSum += feats.size;
      rec.entropySum += ent;
      if (feats.crossHouse) rec.crossHouseCount++;
      rec.ratioSum += levelRatio;
      shapeMap.set(shapeID, rec);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ---- 聚合 ----
  const shapes = Array.from(shapeMap.values()).map((s) => ({
    shapeID: s.shapeID,
    count: s.count,
    avgSize: Math.round((s.sizeSum / s.count) * 1000) / 1000,
    avgEntropy: Math.round((s.entropySum / s.count) * 1000) / 1000,
    crossHouseRate: Math.round((s.crossHouseCount / s.count) * 1000) / 1000,
    avgLevelRatio: Math.round((s.ratioSum / s.count) * 1000) / 1000,
    share: Math.round((s.count / totalCages) * 1000) / 1000,
  })).sort((a, b) => b.count - a.count);

  const uniqueShapes = shapes.length;
  // 熵 H = -Σ p log2 p
  let entropy = 0;
  for (const s of shapes) {
    const p = s.count / totalCages;
    entropy -= p * Math.log2(p);
  }
  // top10 占比
  const top10Share = shapes.slice(0, 10).reduce((a, s) => a + s.count, 0) / totalCages;
  // 高 ratio shape（avgLevelRatio >= 0.25）数量与占比
  const highRatioShapes = shapes.filter((s) => s.avgLevelRatio >= 0.25);
  const highRatioShare = highRatioShapes.reduce((a, s) => a + s.count, 0) / totalCages;

  console.log(`耗时 ${elapsed}s`);
  console.log(`totalCages   = ${totalCages}`);
  console.log(`uniqueShapes = ${uniqueShapes}`);
  console.log(`entropy H    = ${entropy.toFixed(3)} bits`);
  console.log(`top10 share  = ${(top10Share * 100).toFixed(1)}%`);
  console.log(`high-ratio(≥25%) shapes = ${highRatioShapes.length}，cage 占比 ${(highRatioShare * 100).toFixed(1)}%`);

  // ---- 判定门 ----
  let caseLabel = '';
  if (entropy < 2.5 && top10Share > 0.70) {
    caseLabel = 'Case 1: Topology Collapse → B3-B1（shape mutation / entropy injection）';
  } else if (entropy >= 2.5 && highRatioShapes.length < 3) {
    caseLabel = 'Case 2: Topology 丰富但未偏向 reasoning topology → shape-aware weighting';
  } else if (entropy >= 2.5 && highRatioShapes.length >= 3) {
    caseLabel = 'Case 3: Topology 丰富且高 ratio shape 普遍存在 → selection 仍不足，回 B3-A+';
  } else {
    caseLabel = 'Edge: 需人工复核（H 与 top10 混合状态）';
  }
  console.log(`\n判定: ${caseLabel}`);

  // ---- 输出 ----
  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    totalCages,
    uniqueShapes,
    entropy: Math.round(entropy * 1000) / 1000,
    top10Share: Math.round(top10Share * 1000) / 1000,
    highRatioShapeCount: highRatioShapes.length,
    highRatioCageShare: Math.round(highRatioShare * 1000) / 1000,
    verdict: caseLabel,
    // 仅保留 top 40 + 高 ratio shapes，避免文件过大
    shapeDistribution: shapes.slice(0, 40),
    highRatioShapes: highRatioShapes.slice(0, 20),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'cage-topology-entropy-v9.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}