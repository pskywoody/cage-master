/**
 * ============================================================
 *  freeze-cage-audit.cjs — 固化 Step A「Cage Generator 审计回归基线」
 * ============================================================
 *
 *  读取 data/cage-audit-report.json（由 cage-audit.cjs 产出），
 *  冻结为两个回归文件：
 *
 *    tests/cage_generator/baseline.json        —— 精简的「Baseline v0 指标契约」
 *    tests/cage_generator/audit_snapshot.json  —— 完整审计快照（48 存量 + 8 新生成样本）
 *
 *  以后任何 generator 改动，都应对照这两个文件回答：
 *    「是真的提升，还是只是随机波动？」
 *
 *  用法:
 *    node scripts/freeze-cage-audit.cjs
 *      --report data/cage-audit-report.json   # 默认读这个
 *
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const DEFAULT_REPORT = path.join(ROOT, 'data', 'cage-audit-report.json');
const OUT_DIR = path.join(ROOT, 'tests', 'cage_generator');

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { report: DEFAULT_REPORT };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--report') o.report = args[++i];
  }
  return o;
}

/** 从完整报告里抽出「基线契约」所需的精简聚合指标。 */
function buildBaseline(report) {
  const agg = report.aggregate;
  const sampleAgg = report.generator_sample ? report.generator_sample.aggregate : null;
  // cage 推理率：用同一套口径，从存量与样本分别聚合
  const shipped = report.per_level;
  return {
    baseline: 'v0',
    frozen_at: new Date().toISOString(),
    dataset: { shipped_9x9_levels: report.scope.totalLevels },
    generator: {
      version: 'v9',
      sample_seed: report.generator_sample ? report.generator_sample.seed : null,
      sample_size: report.generator_sample ? report.generator_sample.per_level.length : null,
    },
    metrics: {
      cage_size_distribution: agg.size_distribution,
      operation_distribution: {
        counts: agg.operation_distribution,
        pct: agg.operation_pct,
      },
      difficulty_distribution: {
        score: { avg: agg.difficulty.avg, min: agg.difficulty.min, max: agg.difficulty.max },
        stars: agg.difficulty.bands,
      },
      logic_required: {
        tech_hit_level_count: agg.logic_required,
        distinct: agg.distinctLogic,
      },
      cage_reasoning_rate: {
        shipped: {
          used_level_count: shipped.filter((l) => l.cage_reasoning_used === true).length,
          avg_ratio: shipped.length
            ? Math.round((shipped.reduce((s, l) => s + (l.cage_reasoning_ratio || 0), 0) / shipped.length) * 1000) / 1000
            : 0,
        },
        generated_sample: sampleAgg
          ? {
              used_level_count: report.generator_sample.per_level.filter((l) => l.cage_reasoning_used === true).length,
              avg_ratio: report.generator_sample.per_level.length
                ? Math.round((report.generator_sample.per_level.reduce((s, l) => s + (l.cage_reasoning_ratio || 0), 0) / report.generator_sample.per_level.length) * 1000) / 1000
                : 0,
            }
          : null,
        cage_reasoning_techs: ['cageUnique', 'rule45'],
      },
      constraints: {
        large_cage_min: report.thresholds.largeCageMin,
        large_cage_ratio_target: report.thresholds.largeCageRatioTarget,
        big_cage_ratio: { avg: agg.bigCageRatio.avg, passRatio: agg.bigCageRatio.passRatio },
        single_cell_cages: shipped.reduce((s, l) => s + (l.singleCellCageCount || 0), 0),
      },
    },
    red_flags: agg.red_flags,
  };
}

function main() {
  const opts = parseArgs();
  if (!fs.existsSync(opts.report)) {
    console.error(`FAIL: 找不到报告 ${opts.report}，请先运行 node scripts/cage-audit.cjs --sample 8`);
    process.exit(1);
  }
  const report = JSON.parse(fs.readFileSync(opts.report, 'utf-8'));

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const baseline = buildBaseline(report);
  const baselinePath = path.join(OUT_DIR, 'baseline.json');
  fs.writeFileSync(baselinePath, JSON.stringify(baseline, null, 2));

  // 完整快照：报告本身 + 冻结时间戳
  const snapshot = {
    snapshot: 'v0',
    frozen_at: new Date().toISOString(),
    source_report: path.relative(ROOT, opts.report),
    report,
  };
  const snapshotPath = path.join(OUT_DIR, 'audit_snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

  console.log('=== 固化 Step A 审计回归基线 ===');
  console.log(`  baseline.json      : ${path.relative(ROOT, baselinePath)}`);
  console.log(`  audit_snapshot.json: ${path.relative(ROOT, snapshotPath)}`);
  console.log('');
  console.log(`Baseline v0 摘要:`);
  console.log(`  数据集  : ${baseline.dataset.shipped_9x9_levels} 关 9×9 已发布`);
  console.log(`  生成器  : v9, sample_seed=${baseline.generator.sample_seed}, n=${baseline.generator.sample_size}`);
  console.log(`  星档(存量): ${JSON.stringify(baseline.metrics.difficulty_distribution.stars)}`);
  console.log(`  操作    : ${JSON.stringify(baseline.metrics.operation_distribution.pct)}`);
  console.log(`  red_flags(${baseline.red_flags.length}):`);
  for (const f of baseline.red_flags) console.log('    - ' + f);
}

if (require.main === module) {
  main();
}