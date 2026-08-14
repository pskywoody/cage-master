/**
 * ============================================================
 *  b3b4-crosshouse-diversity.cjs — Step B3-B4 CrossHouse Diversity A/B
 * ============================================================
 *
 *  目的：验证「crossHouse diversity penalty」能否提升整局 shape diversity (H)，
 *  而非继续堆复杂笼（B3-B3 v2 已证明 mode-seeking 路线失败）。
 *
 *  单变量：control(v1) vs experiment(crossHouseDiversity=true)，gb 皆 0.4，
 *  topologyScoreVersion 皆 1（v1）。唯一差异 = crossHouse 奖励随局内浓度衰减。
 *
 *  不碰 solver / rule45 / merge / λ / growthBias / sizeWeights / selection。
 *
 *  目标（用户 B3-B4 定义）：
 *    H ≥ 2.75
 *    top4 ≤ 48%
 *    complex ≈ 40+（不冲 45）
 *
 *  用法:
 *    node scripts/b3b4-crosshouse-diversity.cjs --count 20 --seed 20260810 --collected 8
 *  输出: data/b3b4-crosshouse-diversity.json
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
  const o = { count: 20, seed: 20260810, collected: 8, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
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

function run(opts, crossHouseDiversity) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const objective = { enabled: true, ratioWeight: 0, topologyWeight: 25, maxCollected: opts.collected };
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    suppressSingletons: true,
    objective,
    growthBias: 0.4,
    topologyScoreVersion: 1,
    crossHouseDiversity,
  });
  const batch = gen.generateBatch(opts.count, {});
  return analyze(batch);
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-B4 CrossHouse Diversity A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  gb=0.4  v1  collected=${opts.collected}\n`);

  const t0 = Date.now();
  const ctrl = run(opts, false);
  const t1 = Date.now();
  console.log(`control (v1, div=false)  ${ctrl.levels} 关（${((t1 - t0) / 1000).toFixed(1)}s）  top4=${(ctrl.top4Share * 100).toFixed(1)}%  comp=${(ctrl.complexShare * 100).toFixed(1)}%  H=${ctrl.entropyH}  ratio=${(ctrl.ratioMean * 100).toFixed(1)}%  score=${ctrl.avgScore}`);

  const exp = run(opts, true);
  const t2 = Date.now();
  console.log(`div=true                  ${exp.levels} 关（${((t2 - t1) / 1000).toFixed(1)}s）  top4=${(exp.top4Share * 100).toFixed(1)}%  comp=${(exp.complexShare * 100).toFixed(1)}%  H=${exp.entropyH}  ratio=${(exp.ratioMean * 100).toFixed(1)}%  score=${exp.avgScore}`);

  const fmtPct = (v) => (Number(v) * 100).toFixed(1) + '%';
  console.log('\n--- 对照表 ---');
  console.log(`  ${'arm'.padEnd(6)} ${'top4Share'.padEnd(10)} ${'complex'.padEnd(9)} ${'H'.padEnd(7)} ${'singleton'.padEnd(10)} ${'ratioMean'.padEnd(10)} ${'avgScore'.padEnd(9)} ${'unique'}`);
  console.log(`  ${'ctrl'.padEnd(6)} ${fmtPct(ctrl.top4Share).padEnd(10)} ${fmtPct(ctrl.complexShare).padEnd(9)} ${ctrl.entropyH.toFixed(3).padEnd(7)} ${fmtPct(ctrl.singletonRatio).padEnd(10)} ${fmtPct(ctrl.ratioMean).padEnd(10)} ${ctrl.avgScore} ${ctrl.uniqueAll}`);
  console.log(`  ${'div'.padEnd(6)} ${fmtPct(exp.top4Share).padEnd(10)} ${fmtPct(exp.complexShare).padEnd(9)} ${exp.entropyH.toFixed(3).padEnd(7)} ${fmtPct(exp.singletonRatio).padEnd(10)} ${fmtPct(exp.ratioMean).padEnd(10)} ${exp.avgScore} ${exp.uniqueAll}`);

  const gates = {
    target_H_ge_275: exp.entropyH >= 2.75,
    target_top4_le_48: exp.top4Share <= 0.48,
    target_complex_ge_40: exp.complexShare >= 0.40,
    // 硬门
    GateA_singleton_le_5pct: exp.singletonRatio <= 0.05,
    GateB_top4_lt_50pct: exp.top4Share < 0.5,
    Gate_difficulty_pm5: exp.avgScore >= ctrl.avgScore - 30 && exp.avgScore <= ctrl.avgScore + 30,
    Gate_ratio_no_regress: exp.ratioMean >= ctrl.ratioMean - 0.01,
    Gate_unique: exp.uniqueAll,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, growthBias: 0.4, topologyScoreVersion: 1, collected: opts.collected },
    control_v1: ctrl,
    experiment_diversity: exp,
    gates,
    verdict:
      'B3-B4 目标：H≥2.75、top4≤48、complex≥40。若 div 提升 H 且 top4 降 → 多样性杠杆有效，可继续强化；' +
      '若 H 不升或 complex 崩 → 局级浓度衰减不够/过强，需调衰减曲线或 size 杠杆。',
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3b4-crosshouse-diversity.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nGates: ${JSON.stringify(gates, null, 2)}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}