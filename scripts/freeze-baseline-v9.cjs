/**
 * ============================================================
 *  freeze-baseline-v9.cjs — Step B3-0 Freeze real-sample baseline
 * ============================================================
 *
 *  B3-0 目的：把 B2-A 的"真实互异样本"结论固化为回归 baseline。
 *  在进入 B3 objective injection 之前，必须先冻结当前分布，
 *  否则后续优化无法证明提升来自 generator，而非采样方式变化。
 *
 *  输入：data/cage-density-forensics.json（B2-A 已产出，100 个互异样本）
 *        该文件由 scripts/cage-density-forensics.cjs 生成，seed=20260810，
 *        generateBatch 内部按 seed + i*1000 偏移，样本可复现。
 *  输出：tests/cage_generator/baseline-v9-forensics.json（冻结基线）
 *
 *  本脚本不改 generator，只做归一化 + 补充 ratio 分布统计。
 *  用法：
 *    node scripts/freeze-baseline-v9.cjs            # 读已有 forensics 输出
 *    node scripts/freeze-baseline-v9.cjs --run100   # 重新跑 100 样本再冻结
 *
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

const FORENSICS_PATH = path.join(__dirname, '..', 'data', 'cage-density-forensics.json');
const OUT_PATH = path.join(__dirname, '..', 'tests', 'cage_generator', 'baseline-v9-forensics.json');
const BASE_SEED = 20260810;

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function buildBaseline(forensics) {
  const perLevel = forensics.per_level || [];
  const ratios = perLevel
    .map((l) => (l.solve && l.solve.cage_reasoning_ratio != null ? l.solve.cage_reasoning_ratio : null))
    .filter((v) => v !== null)
    .sort((a, b) => a - b);

  const n = ratios.length;
  const sum = ratios.reduce((a, b) => a + b, 0);
  const mean = n > 0 ? sum / n : 0;
  const median = n > 0 ? (n % 2 === 1 ? ratios[(n - 1) / 2] : (ratios[n / 2 - 1] + ratios[n / 2]) / 2) : null;

  // 每样本可复现 seed offset（generateBatch: base + i*1000）
  const seedOffsets = perLevel.map((_, i) => BASE_SEED + i * 1000);

  // ratio 分桶直方图（5% 步长）
  const bucket = {};
  for (const r of ratios) {
    const b = Math.floor(r * 100 / 5) * 5;
    bucket[`${b}`] = (bucket[`${b}`] || 0) + 1;
  }

  return {
    baseline: 'v9-forensics',
    scope: 'B3-0',
    frozen_at: new Date().toISOString(),
    description: 'B2-A 真实互异样本基线（100 samples）。B3 objective injection 的对照基准。',
    generator: {
      version: 'v9',
      count: perLevel.length,
      base_seed: BASE_SEED,
      seed_derivation: 'generateBatch: seed = base + i*1000; generate(): rngSeed = seed + attempt',
      sample_count_source: forensics.config ? `${forensics.config.count}` : '100',
    },
    // 关键指标快照（B3 之后逐项对比）
    key_metrics: {
      cage_reasoning_appear_rate: forensics.aggregate.step_attribution
        ? (perLevel.filter((l) => l.solve && l.solve.cage_reasoning_count > 0).length / perLevel.length)
        : 0,
      cage_reasoning_ratio: {
        min: n > 0 ? ratios[0] : null,
        median: median ? Math.round(median * 1000) / 1000 : null,
        mean: n > 0 ? Math.round(mean * 1000) / 1000 : null,
        max: n > 0 ? ratios[n - 1] : null,
        p90: percentile(ratios, 90),
      },
      ratio_threshold_pass_rate: {
        ge_20: n > 0 ? (ratios.filter((r) => r >= 0.20).length / n) : 0,
        ge_30: n > 0 ? (ratios.filter((r) => r >= 0.30).length / n) : 0,
        ge_40: n > 0 ? (ratios.filter((r) => r >= 0.40).length / n) : 0,
      },
      step_attribution: forensics.aggregate.step_attribution || null,
      cage_structure: forensics.aggregate.cage_size || null,
      cage_tightness: forensics.aggregate.cage_tightness || null,
      trigger_position: forensics.aggregate.trigger_position || null,
      ratio_distribution: {
        histogram_5pct: bucket,
        sorted: ratios,
      },
    },
    ratio_ceiling_note:
      'B3-0 修正：B2-A 文档曾写"max 28%、≥30% 全为 0%"（由聚合均值误推）。逐关扫描 per_level 后，' +
      '真实分布为 min=7.5% / median=17.3% / max=37.3%，≥30% 有 3 关（32.4%/34.5%/37.3%），≥40% 仍为 0%。' +
      '真实天花板约 37% 而非 30%。B3-A 目标不变：先验证 objective 能否把中位从 17% 推到 25%，再谈突破 40%。',
    per_sample_seeds: seedOffsets,
  };
}

function main() {
  const args = process.argv.slice(2);
  const rerun = args.includes('--run100');

  let forensics;
  if (rerun) {
    console.log('重新跑 100 互异样本（约 6 分钟）...');
    const { execSync } = require('child_process');
    const script = path.join(__dirname, 'cage-density-forensics.cjs');
    execSync(`node "${script}" --count 100 --target 4 --seed 20260810`, { stdio: 'inherit' });
  }
  if (!fs.existsSync(FORENSICS_PATH)) {
    console.error(`FAIL: 未找到 ${FORENSICS_PATH}，请先运行 cage-density-forensics.cjs`);
    process.exit(1);
  }
  forensics = JSON.parse(fs.readFileSync(FORENSICS_PATH, 'utf-8'));

  const baseline = buildBaseline(forensics);
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(baseline, null, 2));

  const k = baseline.key_metrics;
  console.log('=== B3-0 Baseline v9 frozen ===');
  console.log(`样本: ${baseline.generator.count}`);
  console.log(`ratio: min=${k.cage_reasoning_ratio.min}  median=${k.cage_reasoning_ratio.median}  mean=${k.cage_reasoning_ratio.mean}  p90=${k.cage_reasoning_ratio.p90}  max=${k.cage_reasoning_ratio.max}`);
  console.log(`threshold: ≥20%=${(k.ratio_threshold_pass_rate.ge_20 * 100).toFixed(1)}%  ≥30%=${(k.ratio_threshold_pass_rate.ge_30 * 100).toFixed(1)}%  ≥40%=${(k.ratio_threshold_pass_rate.ge_40 * 100).toFixed(1)}%`);
  console.log(`step: nakedSingle=${(k.step_attribution.avg_naked_single * 100).toFixed(1)}%  cage=${(k.step_attribution.cage_reasoning_ratio * 100).toFixed(1)}%`);
  console.log(`\n已冻结: ${OUT_PATH}`);
}

if (require.main === module) {
  main();
}