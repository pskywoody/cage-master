/**
 * ============================================================
 *  acceptance-gate-test.cjs — Step B1 诊断驱动
 * ============================================================
 *
 *  用现有 generator（v9，不改动）产出 N 关，跑过 solver-aware acceptance gate，
 *  统计每档通过率，回答核心问题：
 *
 *    「是 acceptance 层缺失（生产链路问题），还是 generator 本身不足？」
 *
 *  判定逻辑：
 *    - G1 通过率高（几乎全过）→ 生成器能产出「玩家会用 cage」的谜题，问题在选库/生产链路
 *    - G3 通过率低            → 4 星质量的产出稀缺，需 generator 侧补足 or 放宽规格
 *
 *  用法:
 *    node scripts/acceptance-gate-test.cjs --count 24 --target 4
 *      --count    生成候选数量（默认 24）
 *      --target   目标星档（默认 4）
 *      --seed     固定 seed（默认 20260810）
 *      -o         输出 JSON 路径
 *
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

const DEFAULT_COUNT = 24;
const DEFAULT_SEED = 20260810;

// 依赖加载（与 cage-audit 一致：eval board.js，require tech-rater.js）
function _loadCoreDeps() {
  if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
  const deps = {};
  if (typeof Board !== 'undefined') deps.Board = Board;
  else {
    const bp = path.join(__dirname, '..', 'core', 'board.js');
    eval.call(global, fs.readFileSync(bp, 'utf-8'));
    deps.Board = global.Board || (typeof window !== 'undefined' ? window.Board : null);
  }
  if (typeof TechRater !== 'undefined') deps.TechRater = TechRater;
  else {
    try {
      const tr = require(path.join(__dirname, '..', 'core', 'tech-rater.js'));
      deps.TechRater = tr.TechRater || global.TechRater || globalThis.TechRater;
    } catch (e) {
      eval.call(global, fs.readFileSync(path.join(__dirname, '..', 'core', 'tech-rater.js'), 'utf-8'));
      deps.TechRater = global.TechRater || globalThis.TechRater;
    }
  }
  return deps;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: DEFAULT_COUNT, target: 4, seed: DEFAULT_SEED, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || DEFAULT_COUNT;
    else if (args[i] === '--target') o.target = parseInt(args[++i], 10) || 4;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  return o;
}

// 加载 acceptance 模块（hybrid 导出：require 或 globalThis 兜底）
function _loadAcceptance() {
  const p = path.join(__dirname, '..', 'core', 'solver-aware-acceptance.js');
  try {
    const m = require(p);
    if (m && m.evaluateAcceptance) return m;
  } catch (e) { /* 继续走 globalThis */ }
  // 文件执行时已通过 hybrid 导出挂到 globalThis（依赖 _loadCoreDeps 先设 globalThis.window）
  if (globalThis.SolverAwareAcceptance) return globalThis.SolverAwareAcceptance;
  eval.call(global, fs.readFileSync(p, 'utf-8'));
  return globalThis.SolverAwareAcceptance;
}

function main() {
  const opts = parseArgs();
  const deps = _loadCoreDeps();
  if (!deps.Board || !deps.TechRater) { console.error('FAIL: 未加载到 Board / TechRater'); process.exit(1); }

  const { evaluateAcceptance, DEFAULT_GATES } = _loadAcceptance();
  const { CageFixer } = require('./cage-generator-v9.cjs');

  const generator = new CageFixer({
    gridSize: 9,
    seed: opts.seed,
    targetStar: opts.target,
    enableRhythmValidation: false,
    timeoutMs: 15000,
    maxAttempts: 30,
  });

  console.log(`=== Step B1 Solver-aware Acceptance 诊断 ===`);
  console.log(`生成候选: ${opts.count}  目标星: ${opts.target}  seed: ${opts.seed}\n`);

  const results = [];
  let attempts = 0;
  while (results.length < opts.count && attempts < opts.count * 20) {
    attempts++;
    const lv = generator.generate();
    if (!lv) continue;
    const res = evaluateAcceptance(lv, { deps, gates: DEFAULT_GATES });
    results.push({
      levelId: lv.levelId || results.length + 1,
      accepted: res.accepted,
      tierIndex: res.tierIndex,
      acceptedTier: res.acceptedTier,
      metrics: res.metrics,
      gates: res.gates,
    });
  }

  // ---- 汇总 ----
  const n = results.length;
  const passCount = (idx) => results.filter((r) => r.tierIndex >= idx && r.tierIndex !== -1).length;
  const tierTable = DEFAULT_GATES.map((g, i) => {
    const c = passCount(i);
    return { name: g.name, pass: c, passRatio: n > 0 ? Math.round((c / n) * 1000) / 10 : 0 };
  });

  // 生成器自身星档分布
  const starDist = {};
  let cageUsed = 0;
  let ratioSum = 0;
  for (const r of results) {
    const star = (r.metrics && r.metrics.level) || '?';
    starDist[star] = (starDist[star] || 0) + 1;
    if (r.metrics) {
      if (r.metrics.cage_reasoning_used) cageUsed++;
      ratioSum += r.metrics.cage_reasoning_ratio || 0;
    }
  }
  const avgRatio = n > 0 ? Math.round((ratioSum / n) * 1000) / 1000 : 0;

  console.log(`生成成功: ${n}/${opts.count}（尝试 ${attempts} 次）\n`);
  console.log('generator 产出星档分布:', JSON.stringify(starDist));
  console.log(`笼推理命中: ${cageUsed}/${n}  平均推理率: ${(avgRatio * 100).toFixed(1)}%\n`);
  console.log('--- Acceptance Gate 通过率 ---');
  for (const t of tierTable) {
    console.log(`  ${t.name}: ${t.pass}/${n} (${t.passRatio}%)`);
  }

  // 诊断结论
  const g1 = n > 0 ? passCount(0) / n : 0;
  const g3 = n > 0 ? passCount(2) / n : 0;
  console.log('\n=== 诊断 ===');
  if (g1 >= 0.8) {
    console.log('▶ G1 高通过率 → 生成器能产出「玩家必须用 cage」的谜题。');
    console.log('  问题在【生产链路】：能生成，但没进正确分布/库。');
  } else {
    console.log('▶ G1 通过率不足 → 生成器本身产出 cage 推理谜题的能力有限。');
    console.log('  需 generator 侧补足（不是纯选库问题）。');
  }
  if (g3 < 0.3) {
    console.log(`▶ G3（4星完整规格）通过率仅 ${(g3 * 100).toFixed(0)}% → 4 星质量产出稀缺，`);
    console.log('  提升 4 星产量需放宽规格或增强 generator 的 cage 推理密度。');
  } else {
    console.log('▶ G3 通过率可观 → generator 已具备 4 星生产能力，选对即可。');
  }

  // 输出
  const outPath = opts.output || path.join(__dirname, '..', 'data', 'acceptance-gate-result.json');
  const report = {
    generatedAt: new Date().toISOString(),
    config: { count: opts.count, targetStar: opts.target, seed: opts.seed, attempts },
    tierTable,
    starDistribution: starDist,
    cage_reasoning: { used: cageUsed, total: n, avg_ratio: avgRatio },
    diagnosis: { g1_pass_ratio: g1, g3_pass_ratio: g3 },
    per_level: results,
  };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n结果已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}