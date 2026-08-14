/**
 * ============================================================
 *  b3b1b-phase2-proposal.cjs — Step B3-B1b Phase2 Topology Proposal A/B
 * ============================================================
 *
 *  目的：验证「supply 侧 topology proposal 注入」能否改变 candidate pool
 *  的拓扑分布（这是 Phase 1 selection 做不到的）。
 *
 *  单变量：control 与 experiment 唯一差异 = topologyProposal channel。
 *    control    = suppress=true + objective(λ=25 topology ranking) + 无 proposal
 *    experiment = 上述 + topologyProposal（ratio / maxPer 可扫）
 *
 *  不碰 difficulty / rating / uniqueness / selection formula。
 *
 *  指标：
 *    top4Share        Gate B: 57% → <50%（先证明 builder 有杠杆）
 *    complexShare     目标 >45%
 *    singletonRatio   Gate A: <5%（保持 B3-B1a）
 *    ratio            笼推理率不退化
 *    avgScore         难度 ±5% 内
 *    unique           唯一解全过
 *
 *  用法:
 *    node scripts/b3b1b-phase2-proposal.cjs --count 20 --seed 20260810 --ratios 0.1,0.2,0.3 --maxPer 3 --collected 8
 *  输出: data/b3b1b-phase2-proposal.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

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

function cageFeatures(cells) {
  const pts = cells.map((x) => [Number(x[0]), Number(x[1])]);
  const size = pts.length;
  const boxes = new Set(pts.map(([r, c]) => Math.floor(r / 3) + ',' + Math.floor(c / 3)));
  return { size, crossHouse: boxes.size > 1 };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 20, seed: 20260810, ratios: [0.1, 0.2, 0.3], maxPer: 3, collected: 8, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--ratios') o.ratios = (args[++i] || '').split(',').map(Number).filter((n) => !isNaN(n));
    else if (args[i] === '--maxPer') o.maxPer = parseInt(args[++i], 10) || 3;
    else if (args[i] === '--collected') o.collected = parseInt(args[++i], 10) || 8;
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

function run(opts, useProposal, proposalConfig) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  // λ=25 固定（Phase 1 已采纳）。experiment 额外开 proposal channel。
  const objective = { enabled: true, ratioWeight: 0, topologyWeight: 25, maxCollected: opts.collected };
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true,
    objective,
    topologyProposal: useProposal ? { enabled: true, ratio: proposalConfig.ratio, maxPer: proposalConfig.maxPer } : { enabled: false },
  });
  const batch = gen.generateBatch(opts.count, {});
  return analyze(batch);
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-B1b Phase2 Topology Proposal A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  ratios=${opts.ratios.join(',')}  maxPer=${opts.maxPer}  collected=${opts.collected}\n`);

  const t0 = Date.now();
  const control = run(opts, false);
  const t1 = Date.now();
  console.log(`control (λ25, no proposal)  ${control.levels} 关（${((t1 - t0) / 1000).toFixed(1)}s）`);

  const rows = [];
  for (const ratio of opts.ratios) {
    const t = Date.now();
    const r = run(opts, true, { ratio, maxPer: opts.maxPer });
    const dt = ((Date.now() - t) / 1000).toFixed(1);
    console.log(`proposal r=${ratio}  ${r.levels} 关（${dt}s）  top4=${(r.top4Share * 100).toFixed(1)}%  comp=${(r.complexShare * 100).toFixed(1)}%  ratio=${(r.ratioMean * 100).toFixed(1)}%  score=${r.avgScore}`);
    rows.push({ ratio, ...r });
  }

  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  console.log('\n--- 对照表 ---');
  console.log(`  ${'ratio'.padEnd(6)} ${'top4Share'.padEnd(10)} ${'singleton'.padEnd(10)} ${'complex'.padEnd(9)} ${'H'.padEnd(7)} ${'ratioMean'.padEnd(10)} ${'avgScore'.padEnd(9)} ${'unique'}`);
  console.log(`  ${'ctr'.padEnd(6)} ${fmtPct(control.top4Share).padEnd(10)} ${fmtPct(control.singletonRatio).padEnd(10)} ${fmtPct(control.complexShare).padEnd(9)} ${control.entropyH.toFixed(3).padEnd(7)} ${fmtPct(control.ratioMean).padEnd(10)} ${control.avgScore} ${control.uniqueAll}`);
  for (const r of rows) {
    console.log(`  ${String(r.ratio).padEnd(6)} ${fmtPct(r.top4Share).padEnd(10)} ${fmtPct(r.singletonRatio).padEnd(10)} ${fmtPct(r.complexShare).padEnd(9)} ${r.entropyH.toFixed(3).padEnd(7)} ${fmtPct(r.ratioMean).padEnd(10)} ${r.avgScore} ${r.uniqueAll}`);
  }

  const best = rows.slice().sort((a, b) => (a.top4Share - b.top4Share) || (b.complexShare - a.complexShare))[0];
  const gates = {
    GateA_singleton_le_5pct: best && best.singletonRatio <= 0.05,
    GateB_top4_lt_50pct: best && best.top4Share < 0.5,
    GateC_top4_lt_45pct: best && best.top4Share < 0.45,
    GateC_complex_gt_45pct: best && best.complexShare > 0.45,
    GateC_difficulty_pm5: best && best.avgScore >= control.avgScore - 30 && best.avgScore <= control.avgScore + 30,
    Gate_ratio_no_regress: best && best.ratioMean >= control.ratioMean - 0.01,
    Gate_unique: best && best.uniqueAll,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, ratios: opts.ratios, maxPer: opts.maxPer, collected: opts.collected },
    control_phase1: control,
    phase2: rows,
    best: best ? { ratio: best.ratio, top4Share: best.top4Share, complexShare: best.complexShare } : null,
    gates,
    verdict:
      'Phase2 验证：proposal 注入能否改变 topology supply。Gate B 看 top4<50% 是否证明 builder 有杠杆；' +
      '若 top4 仍高但 complex 升，说明提案方向对但浓度需加强；若全不动，说明 reshape 未进入候选池（查 ratio/maxCollected）。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3b1b-phase2-proposal.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}