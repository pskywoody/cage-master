/**
 * ============================================================
 *  b3c1c-shape-pressure.cjs — Step B3-C1c Growth-time Shape Usage Pressure
 * ============================================================
 *
 *  目的：验证「growCage frontier pick 内加局级 shape usage soft pressure」
 *  能否降低 canonical 簇浓度（top4Share），而不 post-hoc 修形。
 *
 *  单变量：control 与 experiment 唯一差异 = shapeDiversityWeight（growCage 内注入）。
 *    generator 冻结：v1 + gb=0.4 + λ=25 + suppress=true + proposal off
 *    fitness = diff - ratio*100 - topo*25（selection 不变）
 *    growCage：weight *= 1/(1 + used*W)，W ∈ {0,0.1,0.2,0.3,0.5}
 *
 *  shapeUsage = 局内已放置笼的 canonical shape 计数（currentShapeUsage()）。
 *  lookahead：cageCells + candidate → canonicalizeShape → 查 usage → 衰减权重。
 *  只对已重复的 canonical shape 减吸引，不禁止、不新建 shape。
 *
 *  不碰 difficulty / rating / uniqueness / builder / selection formula / growthBias。
 *
 *  指标：
 *    top4Share                   目标 51.5 → <48（Gate C）
 *    entropyH                    目标 2.64  → >2.75
 *    complexShare                保持 ~37-40（不退化）
 *    singletonRatio              保持 <5%
 *    ratioMean                   不退化
 *    avgScore                    难度 ±5% 内（~520±30）
 *    uniqueAll                   唯一解全过
 *
 *  用法:
 *    node scripts/b3c1c-shape-pressure.cjs --count 20 --seed 20260810 --weights 0,0.1,0.2,0.3,0.5 --collected 8
 *  输出: data/b3c1c-shape-pressure.json
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

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 20, seed: 20260810, weights: [0, 0.1, 0.2, 0.3, 0.5], collected: 8, output: null, verbose: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--weights') o.weights = (args[++i] || '').split(',').map(Number).filter((n) => !isNaN(n));
    else if (args[i] === '--collected') o.collected = parseInt(args[++i], 10) || 8;
    else if (args[i] === '--verbose') o.verbose = true;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function analyze(batch) {
  const shapeMap = new Map();
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
      shapeMap.set(canonicalize(cells), (shapeMap.get(canonicalize(cells)) || 0) + 1);
      totalCages++;
      if (feats.size === 1) singleton++;
      if (feats.crossHouse && feats.size >= 4) complexNum++;
    }
  }
  const shapes = [...shapeMap.values()].sort((a, b) => b - a);
  let top4 = 0;
  for (let i = 0; i < Math.min(4, shapes.length); i++) top4 += shapes[i];
  let H = 0;
  for (const c of shapeMap.values()) { const p = c / totalCages; H -= p * Math.log(p); }
  const rs = ratios.slice().sort((a, b) => a - b);
  const n = rs.length;
  const meanR = ratios.reduce((a, b) => a + b, 0) / (n || 1);
  const avgScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  return {
    levels: batch.length, totalCages, uniqueShapes: shapeMap.size,
    entropyH: Math.round(H * 1000) / 1000,
    singletonRatio: singleton / totalCages,
    top4Share: top4 / totalCages,
    complexShare: complexNum / totalCages,
    ratioMean: meanR,
    avgScore: avgScore ? Math.round(avgScore * 10) / 10 : null,
    uniqueAll,
  };
}

function run(opts, weight) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const objective = { enabled: true, ratioWeight: 100, topologyWeight: 25, maxCollected: opts.collected };
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true, objective, growthBias: 0.4, topologyScoreVersion: 1,
    shapeDiversityWeight: weight,
  });
  // 复刻 generateBatch 的 seed 推进，保证互异样本
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
  console.log(`=== B3-C1c Growth-time Shape Usage Pressure A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  weights=${opts.weights.join(',')}  collected=${opts.collected}`);
  console.log(`generator frozen: v1 + gb=0.4 + λ=25 + suppress=true + proposal off\n`);

  const t0 = Date.now();
  const control = run(opts, 0);
  const t1 = Date.now();
  console.log(`control (W=0)  ${control.levels} 关（${((t1 - t0) / 1000).toFixed(1)}s）  top4=${(control.top4Share * 100).toFixed(1)}%  comp=${(control.complexShare * 100).toFixed(1)}%  H=${control.entropyH}  ratio=${(control.ratioMean * 100).toFixed(1)}%  score=${control.avgScore}`);

  const rows = [];
  for (const w of opts.weights) {
    if (w === 0) { rows.push({ weight: 0, ...control }); continue; }
    const t = Date.now();
    const r = run(opts, w);
    const dt = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`shape pressure W=${w}  ${r.levels} 关（${dt}s）  top4=${(r.top4Share * 100).toFixed(1)}%  comp=${(r.complexShare * 100).toFixed(1)}%  H=${r.entropyH}  ratio=${(r.ratioMean * 100).toFixed(1)}%  score=${r.avgScore}`);
    rows.push({ weight: w, ...r });
  }

  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  console.log('\n--- 对照表 ---');
  console.log(`  ${'W'.padEnd(6)} ${'top4'.padEnd(8)} ${'comp'.padEnd(8)} ${'H'.padEnd(7)} ${'sing'.padEnd(8)} ${'ratio'.padEnd(8)} ${'score'.padEnd(8)} ${'unique'}`);
  for (const r of rows) {
    console.log(`  ${String(r.weight).padEnd(6)} ${fmtPct(r.top4Share).padEnd(8)} ${fmtPct(r.complexShare).padEnd(8)} ${r.entropyH.toFixed(3).padEnd(7)} ${fmtPct(r.singletonRatio).padEnd(8)} ${fmtPct(r.ratioMean).padEnd(8)} ${String(r.avgScore).padEnd(8)} ${r.uniqueAll}`);
  }

  const gates = {};
  for (const r of rows) {
    gates[`W${r.weight}`] = {
      top4_lt_48: r.top4Share < 0.48,
      entropy_gt_275: r.entropyH > 2.75,
      complex_keep: r.complexShare >= control.complexShare - 0.03,
      singleton_lt_05: r.singletonRatio < 0.05,
      difficulty_pm5: r.avgScore >= control.avgScore - 30 && r.avgScore <= control.avgScore + 30,
      unique: r.uniqueAll,
    };
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, weights: opts.weights, collected: opts.collected },
    control: control,
    rows: rows,
    gates,
    verdict:
      'B3-C1c 验证：growCage frontier pick 内加局级 shape usage soft pressure 能否降 top4Share/提 H。' +
      '若 top4 降且 H 升、complex 不退化 → 有效，确立 supply 侧 diversity controller；' +
      '若 top4 不降 → 1-step lookahead 无法改变最终 shape（需 depth-2 或改 target 形状选择）；' +
      '若 complex 明显退化 → 压力误伤 L/T 复杂形（需收紧只罚 pure canonical）。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3c1c-shape-pressure.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}