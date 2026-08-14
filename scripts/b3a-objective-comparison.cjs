/**
 * ============================================================
 *  b3a-objective-comparison.cjs — Step B3-A objective A/B test
 * ============================================================
 *
 *  目的：验证 B3-A objective injection 是否能让 selection 选中更高
 *  cageReasoningRatio 的候选。只改 generator 的候选择优目标，不改
 *  cage builder / solver。
 *
 *  对照：
 *    baseline  = objective OFF（fitness === difficultyDistance，旧行为）
 *    objective = objective ON （fitness = difficultyDistance - ratio*weight）
 *
 *  同一 seed / 同一 count，用 generateBatch 保证样本互异可复现。
 *  ratio 直接读 generator 自带的 _objective.cageReasoningRatio（与 selection
 *  用同一求解，保证一致），不需额外求解。
 *
 *  用法:
 *    node scripts/b3a-objective-comparison.cjs --count 30 --seed 20260810 --weight 100 --maxCollected 8
 *
 *  输出: data/b3a-objective-comparison.json + 控制台对照表
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 30, seed: 20260810, weight: 100, maxCollected: 8, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '--weight') o.weight = parseFloat(args[++i]);
    else if (args[i] === '--maxCollected') o.maxCollected = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

function stats(ratios) {
  const n = ratios.length;
  if (n === 0) return null;
  const sorted = ratios.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p = (q) => sorted[Math.min(n - 1, Math.max(0, Math.ceil((q / 100) * n) - 1))];
  return {
    n,
    min: Math.round(sorted[0] * 1000) / 1000,
    mean: Math.round((sum / n) * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    p90: Math.round(p(90) * 1000) / 1000,
    max: Math.round(sorted[n - 1] * 1000) / 1000,
    ge_20: Math.round((sorted.filter((r) => r >= 0.20).length / n) * 1000) / 1000,
    ge_30: Math.round((sorted.filter((r) => r >= 0.30).length / n) * 1000) / 1000,
    ge_40: Math.round((sorted.filter((r) => r >= 0.40).length / n) * 1000) / 1000,
  };
}

function run(opts, objectiveConfig) {
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: objectiveConfig,
  });
  const batch = gen.generateBatch(opts.count, {});
  const ratios = [];
  const scores = [];
  for (const lv of batch) {
    const r = lv._objective ? lv._objective.cageReasoningRatio : 0;
    ratios.push(r);
    scores.push(lv.difficultyInfo ? lv.difficultyInfo.score : null);
  }
  const scoreV = scores.filter((s) => s !== null);
  return {
    stats: stats(ratios),
    avgScore: scoreV.length ? Math.round((scoreV.reduce((a, b) => a + b, 0) / scoreV.length) * 10) / 10 : null,
    minScore: scoreV.length ? Math.min(...scoreV) : null,
    maxScore: scoreV.length ? Math.max(...scoreV) : null,
    generated: batch.length,
  };
}

function main() {
  const opts = parseArgs();
  console.log(`=== B3-A Objective A/B ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  weight=${opts.weight}  maxCollected=${opts.maxCollected}\n`);

  const t0 = Date.now();
  const baseline = run(opts, { enabled: false });
  const t1 = Date.now();
  const objective = run(opts, { enabled: true, ratioWeight: opts.weight, maxCollected: opts.maxCollected });
  const t2 = Date.now();

  console.log(`baseline 生成 ${baseline.generated} 关（${((t1 - t0) / 1000).toFixed(1)}s）`);
  console.log(`objective 生成 ${objective.generated} 关（${((t2 - t1) / 1000).toFixed(1)}s）\n`);

  const B = baseline.stats, O = objective.stats;
  const row = (k, fmt) => {
    const b = B ? B[k] : 0, o = O ? O[k] : 0;
    const delta = typeof b === 'number' && typeof o === 'number' ? ((o - b) * 100).toFixed(1) + 'pp' : '';
    console.log(`  ${k.padEnd(8)} baseline=${formatCell(b, fmt)}   objective=${formatCell(o, fmt)}   ${delta}`);
  };
  const formatCell = (v, fmt) => (fmt === 'pct' ? (Number(v) * 100).toFixed(1) + '%' : Number(v).toFixed(3));

  console.log('--- cageReasoningRatio 分布 ---');
  row('median', 'pct');
  row('mean', 'pct');
  row('p90', 'pct');
  row('max', 'pct');
  row('ge_20', 'pct');
  row('ge_30', 'pct');
  row('ge_40', 'pct');
  console.log('\n--- difficulty score（保持 ±5% 内）---');
  console.log(`  baseline  avg=${baseline.avgScore} [${baseline.minScore},${baseline.maxScore}]`);
  console.log(`  objective avg=${objective.avgScore} [${objective.minScore},${objective.maxScore}]`);

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, weight: opts.weight, maxCollected: opts.maxCollected },
    baseline_off: baseline,
    objective_on: objective,
    verdict: {
      median_pp: (O.median - B.median),
      median_ratio_up: O.median > B.median,
      // 判定：median 移动 > 3pp 视为 selection 有效；否则倾向 topology 瓶颈
      selection_effective: (O.median - B.median) >= 0.03,
      note:
        'median 提升 ≥3pp → selection 有效（B3-A 成功，可强化为 cageReasoningScore）。' +
        'median 几乎不动 → 瓶颈在 cage topology distribution（进入 B3-B topology entropy audit）。',
    },
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b3a-objective-comparison.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}