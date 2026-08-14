/**
 * ============================================================
 *  b3c1a-shape-histogram.cjs — Step B3-C1a Shape Histogram Instrumentation
 * ============================================================
 *
 *  目的：观察型 diversity controller（不影响生成）。回答用户问题：
 *    "top4 到底由什么组成？是 domino 过量，还是 straight3 过量？"
 *
 *  对每个 cage 做 canonicalize + archetype 分类，聚合整批样本的：
 *    archetypeHistogram   archetype 分布（domino/straight/rect/L/T/zigzag/hook/cross/irregular）
 *    topShapes            全局 top 10 canonical shape（含 archetype 归属）
 *    top4Composition      top-4 形状各自的 archetype + share（回答 A vs B）
 *
 *  不改 generator / topologyBiasWeight / growthBias。只读 batch。
 *  用冻结基线配置（suppress=true + λ=25 + gb=0.4 + v1）保证分布真实。
 *
 *  用法:
 *    node scripts/b3c1a-shape-histogram.cjs --count 100 --seed 20260810 --collected 8
 *  输出: data/b3c1a-shape-histogram.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

// ---- canonicalize（统一 dihedral 形）----
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

// ---- archetype 分类 ----
function classifyArchetype(cells) {
  const pts = cells.map(([r, c]) => [Number(r), Number(c)]);
  const n = pts.length;
  if (n === 1) return 'singleton';
  const rows = new Set(pts.map((p) => p[0]));
  const cols = new Set(pts.map((p) => p[1]));
  const minR = Math.min(...rows), maxR = Math.max(...rows);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  const w = maxC - minC + 1, h = maxR - minR + 1;
  const straight = rows.size === 1 || cols.size === 1;
  const fullRect = rows.size * cols.size === n;
  // 内部邻接统计
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
  if (straight) return 'straight'; // straight3/4/5
  if (fullRect) return 'rect'; // 2x2 / 2x3 / 3x3 filled
  if (maxDeg >= 4) return 'cross';
  if (maxDeg >= 3) return 'T';
  if (n === 3) return 'L';
  if (turns >= 2) return 'zigzag';
  if (turns >= 1) return 'hook';
  return 'irregular';
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 100, seed: 20260810, collected: 8, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--collected') o.collected = parseInt(args[++i], 10) || 8;
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-C1a Shape Histogram (observation only) ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  collected=${opts.collected}  (frozen baseline: v1 + gb0.4 + λ25)\n`);

  const { CageFixer } = require('./cage-generator-v9.cjs');
  const objective = { enabled: true, ratioWeight: 0, topologyWeight: 25, maxCollected: opts.collected };
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true, objective, growthBias: 0.4, topologyScoreVersion: 1,
  });
  const t0 = Date.now();
  const batch = [];
  const originalSeed = gen.seed;
  for (let i = 0; i < opts.count; i++) {
    // 复刻 generateBatch 的 seed 推进（seed+i*1000），保证互异样本
    gen.seed = originalSeed !== null ? originalSeed + i * 1000 : Date.now() + i;
    const lv = gen.generate({});
    batch.push(lv);
    if (opts.verbose) {
      const dt = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`  [${i + 1}/${opts.count}] ${dt}s  score=${lv.difficultyInfo ? lv.difficultyInfo.score : '?'}  cages=${(lv.cages || []).length}`);
    }
  }
  gen.seed = originalSeed;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // 聚合
  const shapeMap = new Map(); // shapeID -> {count, archetype}
  const archetypeMap = new Map(); // archetype -> count
  let totalCages = 0, singleton = 0, complexNum = 0;
  const ratios = [], scores = [];
  let uniqueAll = true;
  for (const lv of batch) {
    ratios.push(lv._objective ? lv._objective.cageReasoningRatio : 0);
    if (lv.difficultyInfo && lv.difficultyInfo.score !== undefined) scores.push(lv.difficultyInfo.score);
    if (lv.meta && lv.meta.unique === false) uniqueAll = false;
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const sid = canonicalize(cells);
      const arch = classifyArchetype(cells);
      totalCages++;
      const rec = shapeMap.get(sid) || { count: 0, archetype: arch };
      rec.count++;
      shapeMap.set(sid, rec);
      archetypeMap.set(arch, (archetypeMap.get(arch) || 0) + 1);
      if (cells.length === 1) singleton++;
      const boxes = new Set(cells.map((x) => Math.floor(Number(x[0]) / 3) + ',' + Math.floor(Number(x[1]) / 3)));
      if (boxes.size > 1 && cells.length >= 4) complexNum++;
    }
  }

  // 指标
  const topShapes = [...shapeMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 10)
    .map(([sid, r]) => ({ shapeID: sid, archetype: r.archetype, count: r.count, share: r.count / totalCages }));
  let top4 = 0;
  const top4Arr = [];
  for (const [sid, r] of [...shapeMap.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 4)) {
    top4 += r.count;
    top4Arr.push({ archetype: r.archetype, count: r.count, share: r.count / totalCages });
  }
  let H = 0;
  for (const c of shapeMap.values()) { const p = c.count / totalCages; H -= p * Math.log(p); }
  const meanR = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const archetypeHistogram = [...archetypeMap.entries()].sort((a, b) => b[1] - a[1])
    .map(([arch, count]) => ({ archetype: arch, count, share: count / totalCages }));

  console.log(`耗时 ${elapsed}s，${totalCages} 笼`);
  console.log(`archetype 分布：`);
  for (const h of archetypeHistogram) console.log(`  ${h.archetype.padEnd(10)} ${h.count.toString().padEnd(6)} ${(h.share * 100).toFixed(1)}%`);
  console.log(`\ntop10 canonical shapes：`);
  for (const s of topShapes) console.log(`  ${s.shapeID}  [${s.archetype}]  ${s.count}  ${(s.share * 100).toFixed(1)}%`);
  console.log(`\ntop4 composition（回答 A/B）：`);
  for (const t of top4Arr) console.log(`  [${t.archetype}]  ${t.count}  ${(t.share * 100).toFixed(1)}%`);

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, collected: opts.collected, elapsedSeconds: Number(elapsed) },
    totalCages,
    uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    top4Share: Math.round((top4 / totalCages) * 1000) / 1000,
    top4Composition: top4Arr,
    complexShare: Math.round((complexNum / totalCages) * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    ratioMean: Math.round(meanR * 1000) / 1000,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
    archetypeHistogram,
    topShapes,
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3c1a-shape-histogram.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}