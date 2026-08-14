/**
 * ============================================================
 *  b4f1-tiling-audit.cjs — B4-F1 Tiling Source Audit（纯测量）
 * ============================================================
 *
 *  目的：**不做干预**，验证 70% headRatio 是否主要由 cage size / shape
 *  分布决定。分解 head 的来源：size 桶、shape family、P(head|size)。
 *
 *  背景（B4-F0 结论）：
 *    difficulty/inRange gate 不淘汰 non-head（head 21.4% vs nonHead 22.1%）。
 *    head 主导(~70%)是 partitionCages birth tiling 的结构不变量。
 *    F1 进一步定位：head 来自哪些 size / shape？
 *
 *  本脚本只读生成器，不引入 candidateAudit / 不调 weight / 不接 selection。
 *  逐笼计算 size + archetype + canonical shape + head 标志，跨关聚合。
 *
 *  协议：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，
 *  与 B3-FINAL / F0 完全一致（纯测量，无臂）。
 *
 *  判定方向（A/B/C 三类）：
 *    A. head 明确来自某类 tiling（如 size-2/3 小笼）→ 设计最小硬约束实验
 *    B. head 与 size/shape 无明显相关 → 向更底层 generator 随机过程调查
 *    C. 多个结构因素共同贡献 → 做 factor isolation
 *
 *  用法:
 *    node scripts/b4f1-tiling-audit.cjs --count 30 --seed 20260810
 *  输出: data/b4f1-tiling-audit.json（约 6-7min，单臂）
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

function main() {
  const opts = parseArgs();
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    canonicalProfile: true, // 与 B3-FINAL 一致，采集 winner pool 指标仅作参考
  });
  const t0 = Date.now();
  console.log(`=== B4-F1 Tiling Source Audit（纯测量，无干预） ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  suppressSingletons=true`);
  const batch = gen.generateBatch(opts.count, { prefix: 'B4F1' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ---- 逐笼聚合 ----
  // sizeHist: size -> { count, headCount, nonHeadCount, archetype: {archetype: count} }
  const sizeHist = {};
  // shapeFam: canonical family -> { count, size: {size: count} }
  const shapeFam = new Map();
  const archetypeHist = {};
  let totalCages = 0, totalHead = 0, totalNonHead = 0;

  for (const lv of batch) {
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const size = cells.length;
      const a = classifyArchetype(cells);
      const head = CANONICAL_SHAPE_SET.has(a);
      totalCages++; if (head) totalHead++; else totalNonHead++;

      if (!sizeHist[size]) sizeHist[size] = { count: 0, headCount: 0, nonHeadCount: 0, archetype: {} };
      sizeHist[size].count++;
      if (head) sizeHist[size].headCount++; else sizeHist[size].nonHeadCount++;
      sizeHist[size].archetype[a] = (sizeHist[size].archetype[a] || 0) + 1;

      archetypeHist[a] = (archetypeHist[a] || 0) + 1;

      if (head) {
        const fam = canonicalize(cells);
        if (!shapeFam.has(fam)) shapeFam.set(fam, { count: 0, size: {} });
        const e = shapeFam.get(fam);
        e.count++;
        e.size[size] = (e.size[size] || 0) + 1;
      }
    }
  }

  // ---- size 桶聚合（含 grouped：2 / 3 / >=4）----
  const bucket = (sizes) => {
    let count = 0, headCount = 0, nonHeadCount = 0;
    const archetype = {};
    for (const s of sizes) {
      const h = sizeHist[s];
      if (!h) continue;
      count += h.count; headCount += h.headCount; nonHeadCount += h.nonHeadCount;
      for (const [k, v] of Object.entries(h.archetype)) archetype[k] = (archetype[k] || 0) + v;
    }
    return {
      count,
      headCount,
      nonHeadCount,
      headRatio: count ? Math.round((headCount / count) * 1000) / 1000 : null,
      nonHeadRatio: count ? Math.round((nonHeadCount / count) * 1000) / 1000 : null,
      archetypeShare: Object.fromEntries(Object.entries(archetype)
        .map(([k, v]) => [k, count ? Math.round((v / count) * 1000) / 1000 : null])
        .sort((a, b) => b[1] - a[1])),
      pHeadGivenSize: count ? Math.round((headCount / count) * 1000) / 1000 : null,
      pNonHeadGivenSize: count ? Math.round((nonHeadCount / count) * 1000) / 1000 : null,
    };
  };

  const sizeBuckets = {};
  for (const s of Object.keys(sizeHist).map(Number).sort((a, b) => a - b)) {
    sizeBuckets[s] = bucket([s]);
  }
  const groupedBuckets = {
    '2': bucket([2]),
    '3': bucket([3]),
    '>=4': bucket([4, 5, 6, 7, 8, 9]),
  };

  // ---- head 来源分解（head 笼按 size 桶占比）----
  const headSource = {};
  for (const [label, b] of Object.entries(groupedBuckets)) {
    headSource[label] = totalHead ? Math.round((b.headCount / totalHead) * 1000) / 1000 : null;
  }
  const nonHeadSource = {};
  for (const [label, b] of Object.entries(groupedBuckets)) {
    nonHeadSource[label] = totalNonHead ? Math.round((b.nonHeadCount / totalNonHead) * 1000) / 1000 : null;
  }

  // ---- shape family 分布 ----
  const shapeFamilyList = [...shapeFam.entries()]
    .map(([fam, e]) => ({
      family: fam,
      count: e.count,
      sizeHist: e.size,
      sharedOfHead: totalHead ? Math.round((e.count / totalHead) * 1000) / 1000 : null,
    }))
    .sort((a, b) => b.count - a.count);

  // ---- P(head | archetype) / P(archetype) ----
  const archetypeAnalysis = Object.entries(archetypeHist)
    .map(([a, count]) => ({
      archetype: a,
      count,
      share: Math.round((count / totalCages) * 1000) / 1000,
      head: CANONICAL_SHAPE_SET.has(a),
    }))
    .sort((a, b) => b.count - a.count);

  const overall = {
    totalCages,
    headCount: totalHead,
    nonHeadCount: totalNonHead,
    headRatio: Math.round((totalHead / totalCages) * 1000) / 1000,
    nonHeadRatio: Math.round((totalNonHead / totalCages) * 1000) / 1000,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true },
    overall,
    sizeBuckets,
    groupedBuckets,
    headSource,
    nonHeadSource,
    shapeFamily: shapeFamilyList,
    archetypeAnalysis,
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4f1-tiling-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // console 摘要
  console.log(`\noverall: headRatio=${overall.headRatio}  (head ${totalHead} / nonHead ${totalNonHead} / ${totalCages})  ${elapsed}s`);
  console.log(`size buckets (count / headRatio):`);
  for (const [label, b] of Object.entries(groupedBuckets)) {
    console.log(`  size=${label}: count=${b.count}  head=${b.headCount}  headRatio=${b.headRatio}  P(head|size)=${b.pHeadGivenSize}`);
  }
  console.log(`head source by size bucket:`);
  for (const [label, v] of Object.entries(headSource)) console.log(`  size=${label}: headContribution=${v}`);
  console.log(`archetype analysis (count / share / head):`);
  for (const a of archetypeAnalysis) {
    console.log(`  ${a.archetype.padEnd(9)} count=${String(a.count).padStart(5)}  share=${a.share}  head=${a.head}`);
  }
  console.log(`\n已保存: ${outPath}`);
}

main();