/**
 * ============================================================
 *  b4d0-benchmark.cjs — B4-D0 Candidate Topology Instrumentation
 * ============================================================
 *
 *  目的：确认 selection 候选池里【是否已经存在】canonical family diversity，
 *  只是最终 diff 择优把它淘汰了。纯测量，不加权，不改 selection。
 *
 *  分叉判断：
 *    pool Hfamily 高（>阈值） + winner Hfamily 低
 *        → candidate pool 已丰富，selection objective 淘汰了 diversity
 *        → 进 B4-D1（multi-objective selection 加权）
 *    pool Hfamily 本身低
 *        → candidate pool 已塌缩，selection 无能为力
 *        → 回 B4-C（generation/search）
 *
 *  协议：seed same / λ=25 / gb=0.4 / W=0.2 / objective=true 冻结，
 *  不加任何多目标权重（canonicalNoveltyWeight=0）。
 *
 *  指标（per level）：
 *    _canonicalPool.poolHfamily   = 全部 inRange 候选的 per-cage family 分布熵均值
 *    _canonicalPool.winner.entropy = 最终 winner 的 per-cage family 分布熵
 *    candidateCount                 = selection 实际评估的 inRange 候选数
 *
 *  用法:
 *    node scripts/b4d0-benchmark.cjs --count 30 --seed 20260810
 *  输出: data/b4d0-benchmark.json
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

function analyze(batch) {
  const poolHs = [], winnerHs = [], candCounts = [];
  let poolHighWinnerLow = 0; // pool均值 > winner 且差 >0.1 的关数
  let poolCollapsed = 0;     // pool均值 <= 0.5 的关数（塌缩信号）
  for (const lv of batch) {
    const cp = lv._canonicalPool;
    if (cp && cp.candidateCount > 0) {
      poolHs.push(cp.poolHfamily);
      candCounts.push(cp.candidateCount);
      if (cp.winner) winnerHs.push(cp.winner.entropy);
      if (cp.poolHfamily > 0.5) {
        if (cp.winner && cp.poolHfamily - cp.winner.entropy > 0.1) poolHighWinnerLow++;
      } else {
        poolCollapsed++;
      }
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const poolAvg = mean(poolHs);
  const winnerAvg = mean(winnerHs);
  const candAvg = mean(candCounts);
  const withPool = poolHs.length;
  return {
    levels: batch.length,
    withPool: withPool,
    poolHfamilyMean: Math.round(poolAvg * 1000) / 1000,
    winnerHfamilyMean: Math.round(winnerAvg * 1000) / 1000,
    deltaPoolMinusWinner: Math.round((poolAvg - winnerAvg) * 1000) / 1000,
    poolHighWinnerLow: poolHighWinnerLow,
    poolCollapsed: poolCollapsed,
    poolCollapsedShare: withPool ? Math.round((poolCollapsed / withPool) * 1000) / 1000 : null,
    avgCandidatesPerLevel: Math.round(candAvg * 10) / 10,
  };
}

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

function computeVerdict(a) {
  if (a.withPool === 0) {
    return 'NO DATA：无 inRange 候选被评估，instrumentation 未生效。';
  }
  // 设计阈值：pool 均值 >0.5 视为「候选池已含 diversity」；
  //        pool 均值 <=0.5 视为「候选池塌缩」。
  if (a.poolHfamilyMean > 0.5) {
    return (a.deltaPoolMinusWinner >= 0.1)
      ? `B4-D0 分叉 → B4-D1：候选池已丰富（poolH=${a.poolHfamilyMean}），winner 更低（${a.winnerHfamilyMean}）→ selection 淘汰了 diversity，进 multi-objective 加权。`
      : `B4-D0 分叉 → 待定：候选池已丰富（poolH=${a.poolHfamilyMean}），但 winner 未显著更低（Δ=${a.deltaPoolMinusWinner}）→ selection 未明显淘汰 diversity，需复查阈值。`;
  }
  return `B4-D0 分叉 → B4-C：候选池塌缩（poolH=${a.poolHfamilyMean} ≤0.5）→ selection 无能为力，回 generation/search。`;
}

function main() {
  const opts = parseArgs();
  console.log(`=== B4-D0 Candidate Topology Instrumentation ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  NO multi-objective weight\n`);

  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 }, // B4-D0 不加权
    canonicalProfile: true,                   // B4-D0 开启 instrumentation
  });
  const t0 = Date.now();
  const batch = gen.generateBatch(opts.count, { prefix: 'B4D0' });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const a = analyze(batch);
  console.log(`耗时 ${elapsed}s，${batch.length} 关`);
  for (const lv of batch) {
    const cp = lv._canonicalPool;
    if (cp && opts.verbose) {
      console.log(`  ${lv.levelId} cand=${cp.candidateCount} poolH=${cp.poolHfamily} winH=${cp.winner ? cp.winner.entropy : '-'}`);
    }
  }
  console.log(`\nbatch 统计:`);
  console.log(`  poolHfamily.mean=${a.poolHfamilyMean}  winnerHfamily.mean=${a.winnerHfamilyMean}  Δ=${a.deltaPoolMinusWinner}`);
  console.log(`  候选池含diversity且winner更低关数=${a.poolHighWinnerLow}/${a.withPool}  候选池塌缩关数=${a.poolCollapsed}（share=${a.poolCollapsedShare}）`);
  console.log(`  平均每关 inRange 候选数=${a.avgCandidatesPerLevel}`);

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', canonicalNoveltyWeight: 0, suppressSingletons: true },
    variable: { canonicalProfile: true },
    result: a,
    verdict: computeVerdict(a),
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4d0-benchmark.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nVerdict: ${report.verdict}`);
  console.log(`\n已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}