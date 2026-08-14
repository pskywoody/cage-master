/**
 * ============================================================
 *  b3c2-size-shift.cjs — Step B3-C2 Size Distribution Shift（最后一个 supply 杠杆）
 * ============================================================
 *
 *  目的：验证「把 sizeWeights 质量从 canonical 尺寸（2/3/5）推向 size-4」
 *  能否把 top4Share 从 ~54% 压向 45% 以下，且不拖垮 difficulty/ratio/unique。
 *
 *  背景修正（相对 b3c1c 的 baseline 认知）：
 *    _getCageSizeWeights() 按 targetStar 返回，star=4 实际是
 *        { 2:0.10, 3:0.25, 4:0.30, 5:0.33 }   （size-4+5 已占 0.63）
 *    而非用户消息假设的 {2:.30,3:.30,4:.20,5:.10}。
 *    top-4 canonical 覆盖：domino=size2、L/straight=size3、T=size5。
 *    故降 top4 的杠杆 = 压低 2/3/5、提高 4（size4 多为 rect/zigzag/hook，非 top-4）。
 *
 *  方法：不修改 generator 源码。构造后对实例覆盖 _getCageSizeWeights()，
 *    返回本配置的自定义 weights。纯实验 shim（与 backend audit 思路一致）。
 *  单变量：仅动 sizeWeights。shapeDiversityWeight=0（先隔离 size 效应）。
 *     generator 冻结：v1 + gb=0.4 + λ=25 + suppress + proposal off + star=4
 *  后续可叠加 W=0.2 的组合实验由手动接入决定。
 *
 *  指标：top4Share / entropyH / complexShare / singletonRatio / ratioMean / avgScore /
 *        uniqueAll / sizeHistogram（size 分布漂移是 size shift 的预期内变化，非退化）
 *
 *  用法:
 *    node scripts/b3c2-size-shift.cjs --count 20 --seed 20260810 --collected 8
 *  输出: data/b3c2-size-shift.json
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

function cageFeatures(cells) {
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const size = pts.length;
  const boxes = new Set(pts.map(([r, c]) => Math.floor(r / 3) + ',' + Math.floor(c / 3)));
  return { size, crossHouse: boxes.size > 1 };
}

const CONFIGS = [
  { name: 'control', desc: 'star=4 当前 baseline', weights: { 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 } },
  { name: 's1', desc: '压 2/3 推 4（温和）', weights: { 2: 0.06, 3: 0.20, 4: 0.42, 5: 0.32 } },
  { name: 's2', desc: '深推 4（激进）', weights: { 2: 0.04, 3: 0.16, 4: 0.48, 5: 0.32 } },
  { name: 's3', desc: '用户参考配置', weights: { 2: 0.15, 3: 0.25, 4: 0.35, 5: 0.25 } },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 20, seed: 20260810, collected: 8, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--collected') o.collected = parseInt(args[++i], 10) || 8;
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function analyze(batch) {
  const shapeMap = new Map();
  const sizeHist = {};
  let totalCages = 0, singleton = 0, complexNum = 0;
  const ratios = [], scores = [];
  let uniqueAll = true;
  for (const lv of batch) {
    ratios.push(lv._objective ? lv._objective.cageReasoningRatio : 0);
    if (lv.difficultyInfo && lv.difficultyInfo.score !== undefined) scores.push(lv.difficultyInfo.score);
    if (lv.meta && lv.meta.unique === false) uniqueAll = false;
    for (const cage of lv.cages || []) {
      const cells = cage.cells || [];
      const feats = cageFeatures(cells);
      const size = feats.size;
      sizeHist[size] = (sizeHist[size] || 0) + 1;
      shapeMap.set(canonicalize(cells), (shapeMap.get(canonicalize(cells)) || 0) + 1);
      totalCages++;
      if (size === 1) singleton++;
      if (feats.crossHouse && size >= 4) complexNum++;
    }
  }
  const shapes = [...shapeMap.values()].sort((a, b) => b - a);
  let top4 = 0;
  for (let i = 0; i < Math.min(4, shapes.length); i++) top4 += shapes[i];
  let H = 0;
  for (const c of shapeMap.values()) { const p = c / totalCages; H -= p * Math.log(p); }
  const meanR = ratios.reduce((a, b) => a + b, 0) / (ratios.length || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const sizeShare = {};
  for (const k of Object.keys(sizeHist)) sizeShare[k] = sizeHist[k] / totalCages;
  return {
    levels: batch.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
    sizeHist,
    sizeShare,
  };
}

function run(opts, weights) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const objective = { enabled: true, ratioWeight: 100, topologyWeight: 25, maxCollected: opts.collected };
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true, objective, growthBias: 0.4, topologyScoreVersion: 1,
    shapeDiversityWeight: 0, // B3-C2 先隔离 size 效应，不混入 C1c
  });
  // 纯 shim：覆盖 sizeWeights 来源，不改源码
  gen._getCageSizeWeights = () => weights;
  const batch = [];
  const originalSeed = gen.seed;
  for (let i = 0; i < opts.count; i++) {
    gen.seed = originalSeed !== null ? originalSeed + i * 1000 : Date.now() + i;
    const lv = gen.generate({});
    batch.push(lv);
    if (opts.verbose) {
      console.log(`    [${i + 1}/${opts.count}] score=${lv.difficultyInfo ? lv.difficultyInfo.score : '?'}`);
    }
  }
  gen.seed = originalSeed;
  return analyze(batch);
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-C2 Size Distribution Shift A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  collected=${opts.collected}`);
  console.log(`generator frozen: v1 + gb=0.4 + λ=25 + suppress + proposal off + star=4 + W=0\n`);

  const t0 = Date.now();
  const rows = [];
  for (const cfg of CONFIGS) {
    const t = Date.now();
    const r = run(opts, cfg.weights);
    const dt = ((Date.now() - t) / 1000).toFixed(1);
    rows.push({ name: cfg.name, desc: cfg.desc, weights: cfg.weights, ...r });
    const fmtSize = Object.keys(r.sizeShare).sort((a, b) => a - b).map((k) => `s${k}=${(r.sizeShare[k] * 100).toFixed(0)}%`).join(' ');
    console.log(`${cfg.name.padEnd(8)} ${cfg.desc.padEnd(22)} ${dt}s  top4=${(r.top4Share * 100).toFixed(1)}%  H=${r.entropyH}  comp=${(r.complexShare * 100).toFixed(1)}%  ratio=${(r.ratioMean * 100).toFixed(1)}%  score=${r.avgScore}  [${fmtSize}]`);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const control = rows[0];
  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  console.log('\n--- 对照表 ---');
  console.log(`  ${'cfg'.padEnd(8)} ${'top4'.padEnd(8)} ${'comp'.padEnd(8)} ${'H'.padEnd(7)} ${'sing'.padEnd(8)} ${'ratio'.padEnd(8)} ${'score'.padEnd(8)} ${'unique'}`);
  for (const r of rows) {
    console.log(`  ${r.name.padEnd(8)} ${fmtPct(r.top4Share).padEnd(8)} ${fmtPct(r.complexShare).padEnd(8)} ${r.entropyH.toFixed(3).padEnd(7)} ${fmtPct(r.singletonRatio).padEnd(8)} ${fmtPct(r.ratioMean).padEnd(8)} ${String(r.avgScore).padEnd(8)} ${r.uniqueAll}`);
  }

  const gates = {};
  for (const r of rows) {
    gates[r.name] = {
      top4_lt_45: r.top4Share < 0.45,
      top4_lt_48: r.top4Share < 0.48,
      entropy_ge_control: r.entropyH >= control.entropyH,
      complex_keep: r.complexShare >= control.complexShare - 0.03,
      singleton_lt_05: r.singletonRatio < 0.05,
      difficulty_pm5: r.avgScore >= control.avgScore - 30 && r.avgScore <= control.avgScore + 30,
      ratio_not_regress: r.ratioMean >= control.ratioMean - 0.02,
      unique: r.uniqueAll,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, collected: opts.collected, elapsedSeconds: Number(elapsed) },
    rows,
    gates,
    verdict:
      'B3-C2 验证：sizeWeights 单变量 shift 能否把 top4Share 压向 <45%。' +
      '若某 cfg top4<45 且 difficulty/ratio/unique 不退化 → size 分布是真正的 canonical 主因，采纳为 supply 杠杆；' +
      '若全部 >45 → size 分布非主因，top4 由 growCage 形状生成空间决定 → 判定 architecture ceiling，停调参。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3c2-size-shift.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}