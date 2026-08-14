/**
 * ============================================================
 *  b4f2-partition-audit.cjs — B4-F2 Partition Growth Termination Audit（纯测量）
 * ============================================================
 *
 *  目的：**不做干预**，解释 size=2/3 小笼的来源 —— 是「算法自然 bias」（A）
 *  还是「为满足后续约束被迫停止」（B），或二者共同（C）。
 *
 *  背景（B4-F1 结论）：
 *    P(head|size=2)=1.0、P(head|size=3)=1.0：小笼天生 head。
 *    head 是 cage size distribution 的确定性函数。但 F1 未回答：
 *    partitionCages 为什么产生这么多 size=2/3？
 *
 *  本脚本用 generator 的 partitionTrace 仪器（纯测量，默认关闭，开启不改
 *  生成逻辑、不调 weight、不接 objective/selection），逐笼采集 growCage 的
 *  生命周期：targetSize / finalSize / stopReason / loop / accepted。
 *
 *  协议：N=30，seed=20260810，λ=25/gb=0.4/W=0.2/suppress/objective 冻结，
 *  与 B3-FINAL / F0 / F1 完全一致（单臂纯测量）。
 *
 *  判定（A/B/C）：
 *    A. 多数 size-2/3 = 生成器按 targetCounts（weights）**本就要 2/3**，reached_target
 *    B. 多数 size-2/3 = 从更大 target 提前停止（no_valid_neighbor / absorb_exhausted）
 *    C. 二者共同作用
 *
 *  用法:
 *    node scripts/b4f2-partition-audit.cjs --count 30 --seed 20260810
 *  输出: data/b4f2-partition-audit.json（约 6-7min，单臂）
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: 30, seed: 20260810, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || o.count;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

// ---- 复现 partitionCages 的 targetCounts 计算（只读公式，验算自然 bias）----
function intendedTargetCounts(totalCells, minSize, maxSize, weights, compensation, suppressSingletons) {
  const effMinSize = suppressSingletons ? Math.max(2, minSize) : minSize;
  const targetCounts = {};
  for (let s = effMinSize; s <= maxSize; s++) {
    const w = weights[s] || 0;
    const comp = compensation[s] || 1;
    targetCounts[s] = Math.max(0, Math.round((totalCells * w * comp) / s));
  }
  let totalTargetCells = 0;
  for (let s = effMinSize; s <= maxSize; s++) totalTargetCells += targetCounts[s] * s;
  if (totalTargetCells > totalCells) {
    const ratio = totalCells / totalTargetCells;
    for (let s = effMinSize; s <= maxSize; s++) targetCounts[s] = Math.max(0, Math.floor(targetCounts[s] * ratio));
  }
  return { targetCounts, totalTargetCells };
}

function main() {
  const opts = parseArgs();
  const { CageFixer } = require('./cage-generator-v9.cjs');
  const gen = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: 4,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
    objective: { canonicalNoveltyWeight: 0 },
    partitionTrace: true, // B4-F2：采集 growCage 生命周期（纯测量，不改行为）
  });
  const t0 = Date.now();
  console.log(`=== B4-F2 Partition Growth Termination Audit（纯测量，无干预） ===`);
  console.log(`count=${opts.count}  seed=${opts.seed}  λ=25  gb=0.4  W=0.2  objective=true  suppressSingletons=true`);

  // 复现 generateBatch（seed+i*1000），但逐关取 trace，避免跨关混叠。
  const levels = [];
  const originalSeed = gen.seed;
  for (let i = 0; i < opts.count; i++) {
    gen.seed = originalSeed + i * 1000;
    gen._partitionTraceArr = []; // 逐关重置
    const lv = gen.generate();
    if (lv) {
      lv.levelId = `B4F2-${String(i + 1).padStart(3, '0')}`;
      lv._partitionTrace = gen._partitionTraceArr.slice();
      levels.push(lv);
    }
  }
  gen.seed = originalSeed;
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  // ---- 把 trace 事件配对成 attempt：growth 事件(loop=null) + 紧随的 accept 事件 ----
  // growth 事件：stopReason ∈ reached_target / absorb_exhausted / no_valid_neighbor / template
  const GROWTH_REASONS = new Set(['reached_target', 'absorb_exhausted', 'no_valid_neighbor', 'template']);
  const attemptsByLevel = [];
  let totalAttempts = 0;
  for (const lv of levels) {
    const trace = lv._partitionTrace || [];
    const attempts = [];
    let pendingGrowth = null;
    for (const e of trace) {
      if (e.accepted === null || e.accepted === undefined) {
        // growth 事件（loop:null）
        pendingGrowth = e;
      } else {
        // accept 事件（loop 非 null）
        attempts.push({
          targetSize: pendingGrowth ? pendingGrowth.targetSize : e.targetSize,
          finalSize: e.finalSize,
          loop: e.loop,
          accepted: e.accepted,
          growthStopReason: pendingGrowth ? pendingGrowth.stopReason : (e.stopReason.startsWith('rejected') ? 'rejected_na' : e.stopReason),
        });
        pendingGrowth = null;
      }
    }
    attemptsByLevel.push(attempts);
    totalAttempts += attempts.length;
  }

  // ---- 聚合 ----
  const byLoop = {};
  const finalCageBySize = {};   // accepted 笼：finalSize -> count
  // 对 final size 2/3（headLock 来源）做成因分解
  const size23Origin = { 2: null, 3: null }; // 初始化

  const accSize23 = (size) => {
    if (!size23Origin[size]) {
      size23Origin[size] = { count: 0, intended: 0, premature: 0, byGrowthReason: {}, byLoop: {}, byTargetSize: {} };
    }
    return size23Origin[size];
  };

  for (const attempts of attemptsByLevel) {
    for (const a of attempts) {
      if (!byLoop[a.loop]) byLoop[a.loop] = { attempts: 0, accepted: 0, rejected: 0, acceptedByFinalSize: {} };
      const bl = byLoop[a.loop];
      bl.attempts++;
      if (a.accepted) bl.accepted++; else bl.rejected++;
      if (a.accepted) {
        finalCageBySize[a.finalSize] = (finalCageBySize[a.finalSize] || 0) + 1;
        bl.acceptedByFinalSize[a.finalSize] = (bl.acceptedByFinalSize[a.finalSize] || 0) + 1;
        if (a.finalSize === 2 || a.finalSize === 3) {
          const acc = accSize23(a.finalSize);
          acc.count++;
          if (a.finalSize === a.targetSize) acc.intended++;
          else acc.premature++;
          acc.byGrowthReason[a.growthStopReason] = (acc.byGrowthReason[a.growthStopReason] || 0) + 1;
          acc.byLoop[a.loop] = (acc.byLoop[a.loop] || 0) + 1;
          acc.byTargetSize[a.targetSize] = (acc.byTargetSize[a.targetSize] || 0) + 1;
        }
      }
    }
  }

  // 归一化 size23 origin
  const size23Final = {};
  for (const [s, acc] of Object.entries(size23Origin)) {
    if (!acc) continue;
    size23Final[Number(s)] = {
      count: acc.count,
      intendedRatio: acc.count ? Math.round((acc.intended / acc.count) * 1000) / 1000 : null,
      prematureRatio: acc.count ? Math.round((acc.premature / acc.count) * 1000) / 1000 : null,
      byGrowthReason: Object.fromEntries(Object.entries(acc.byGrowthReason)
        .map(([k, v]) => [k, { count: v, share: acc.count ? Math.round((v / acc.count) * 1000) / 1000 : null }])
        .sort((a, b) => b[1].count - a[1].count)),
      byLoop: Object.fromEntries(Object.entries(acc.byLoop)
        .map(([k, v]) => [k, { count: v, share: acc.count ? Math.round((v / acc.count) * 1000) / 1000 : null }])
        .sort((a, b) => b[1].count - a[1].count)),
      byTargetSize: Object.fromEntries(Object.entries(acc.byTargetSize)
        .map(([k, v]) => [k, { count: v, share: acc.count ? Math.round((v / acc.count) * 1000) / 1000 : null }])
        .sort((a, b) => b[1].count - a[1].count)),
    };
  }

  // ---- 验算 star=4 的 weight 驱动的自然 bias（与 _getCageSizeWeights(4) 一致）----
  const weightsRef = { 1: 0.02, 2: 0.10, 3: 0.25, 4: 0.30, 5: 0.33 }; // targetStar=4
  const compensationRef = { 1: 0.5, 2: 1.2, 3: 1.1, 4: 1.0, 5: 1.2 };
  const intended = intendedTargetCounts(81, 1, 5, weightsRef, compensationRef, true);
  const weightBias = {
    weights: weightsRef,
    targetCounts: intended.targetCounts,
    totalTargetCells: intended.totalTargetCells,
    size2CellsPlanned: (intended.targetCounts[2] || 0) * 2,
    size3CellsPlanned: (intended.targetCounts[3] || 0) * 3,
    smallCellShare: Math.round(((intended.targetCounts[2] || 0) * 2 + (intended.targetCounts[3] || 0) * 3) / 81 * 1000) / 1000,
    note: 'star=4 的 weight 预算为 大笼偏置（size4+size5=0.63），size2/3 是其中被明确预算的两位，非隐藏约束',
  };

  // ---- 最终 size 分布（来自 level.cages，交叉验证 trace 的 accepted）----
  const finalSizeDist = {};
  for (const lv of levels) {
    for (const c of lv.cages || []) {
      const s = c.cells.length;
      finalSizeDist[s] = (finalSizeDist[s] || 0) + 1;
    }
  }
  const finalSizeShare = Object.fromEntries(Object.entries(finalSizeDist)
    .map(([k, v]) => [k, { count: v, share: Math.round((v / Object.values(finalSizeDist).reduce((a, b) => a + b, 0)) * 1000) / 1000 }])
    .sort((a, b) => a[0] - b[0]));

  // ---- verdict ----
  // 判定 A/B/C：看 size=2/3 final 笼中 intendedReached（reached_target 且 target==final）占比
  const s2 = size23Final[2] || { count: 0, intendedRatio: 0 };
  const s3 = size23Final[3] || { count: 0, intendedRatio: 0 };
  const combinedCount = (s2.count || 0) + (s3.count || 0);
  const combinedIntended = Math.round((((s2.count || 0) * (s2.intendedRatio || 0)) + ((s3.count || 0) * (s3.intendedRatio || 0))) * 1000) / 1000;
  let verdict;
  if (combinedCount === 0) {
    verdict = 'N/A（无 size-2/3 笼？）';
  } else if (combinedIntended >= 0.7) {
    verdict = 'Case A：size=2/3 是算法自然 bias（targetCounts 本就要求 2/3，reached_target 为主）';
  } else if (combinedIntended <= 0.3) {
    verdict = 'Case B：size=2/3 是后续约束压力导致（从更大 target 提前停止）';
  } else {
    verdict = `Case C：二者共同作用（intendedReached=${combinedIntended}）`;
  }

  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, seed: opts.seed, elapsedSeconds: Number(elapsed) },
    frozen: { lambda: 25, growthBias: 0.4, shapeDiversityWeight: 0.2, objective: 'enabled', suppressSingletons: true },
    genre: 'partition growth termination audit（纯测量）',
    totalAttempts,
    byLoop,
    finalCageBySize,
    size23Origin: size23Final,
    finalSizeDist: finalSizeShare,
    weightBias,
    verdict,
  };
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'b4f2-partition-audit.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  // console 摘要
  console.log(`\ntotalAttempts=${totalAttempts}  ${elapsed}s`);
  console.log('byLoop (attempts / accepted / rejected):');
  for (const [loop, b] of Object.entries(byLoop)) {
    console.log(`  ${String(loop).padEnd(9)} attempts=${String(b.attempts).padStart(5)}  acc=${String(b.accepted).padStart(4)}  rej=${String(b.rejected).padStart(4)}`);
  }
  console.log(`finalCageBySize:`, JSON.stringify(finalCageBySize));
  console.log('\nsize=2/3 成因分解（intended = 本就要 2/3，premature = 从更大 target 提前停）:');
  for (const [s, o] of Object.entries(size23Final)) {
    console.log(`  size=${s}: count=${o.count}  intended=${o.intendedRatio}  premature=${o.prematureRatio}`);
    console.log(`    byGrowthReason:`, JSON.stringify(o.byGrowthReason));
    console.log(`    byLoop:      `, JSON.stringify(o.byLoop));
    console.log(`    byTargetSize:`, JSON.stringify(o.byTargetSize));
  }
  console.log(`\nweightBias.targetCounts:`, JSON.stringify(weightBias.targetCounts), ` smallCellShare=${weightBias.smallCellShare}`);
  console.log(`\n最终 size 分布:`, JSON.stringify(finalSizeShare));
  console.log(`\n判定: ${verdict}`);
  console.log(`\n已保存: ${outPath}`);
}

main();