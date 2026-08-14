/**
 * ============================================================
 *  cage-density-forensics.cjs — Step B2-A Cage Density Forensics
 * ============================================================
 *
 *  不改 generator。用现有 generator 批量产出 N 个样本，做"笼密度法医分析"，
 *  回答用户提出的核心问题：
 *
 *    「为什么 cage 明明存在，但 solver 不需要用它？」
 *
 *  分析维度（对应用户 B2-A 清单）：
 *    1. Cage size distribution
 *       平均笼格数 / 单格笼比 / 2格笼比 / 3格笼比 / 大笼(4+)比
 *    2. Cage sum tightness
 *       每个笼的和唯一组合数 combos（n 个不同数字∈[1,9] 和为 S 的方案数）
 *       笼熵 entropy = log2(combos)；tight = combos<=2
 *    3. Cage candidate entropy
 *       全盘平均笼熵 / 熵分布 / tight 笼占比
 *    4. cageUnique / rule45 触发位置
 *       求解路径中首次出现的技术步索引 + 出现步数
 *    5. Solver step attribution
 *       nakedSingle% / cageUnique% / rule45% / 其他% 的步数占比
 *
 *  用法:
 *    node scripts/cage-density-forensics.cjs --count 200 --target 4 --seed 20260810 [-o out.json]
 *
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

const DEFAULT_COUNT = 200;
const DEFAULT_TARGET = 4;
const DEFAULT_SEED = 20260810;

// 依赖加载（与 cage-audit 一致）
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

// 笼和唯一组合计数：n 个互异数字∈[1,9] 和为 S 的方案数
function countCombos(n, sum, maxDigit = 9) {
  if (n <= 0) return 0;
  const memo = new Map();
  function dfs(depth, remaining, minDigit) {
    if (depth === 0) return remaining === 0 ? 1 : 0;
    if (remaining < minDigit * depth) return 0;
    if (remaining > maxDigit * depth) return 0;
    const key = depth + ',' + remaining + ',' + minDigit;
    if (memo.has(key)) return memo.get(key);
    let c = 0;
    for (let d = minDigit; d <= maxDigit; d++) {
      c += dfs(depth - 1, remaining - d, d + 1);
    }
    memo.set(key, c);
    return c;
  }
  return dfs(n, sum, 1);
}

// 笼熵 = log2(combos)，combos<=2 视为 tight 强约束
function entropy(combos) {
  return combos > 1 ? Math.log2(combos) : 0;
}

// 单关法医分析
function analyzeLevel(deps, level) {
  const cages = level.cages || [];
  const grid = level.boardData;
  const size = level.gridSize || 9;

  // ---- 1. cage size distribution ----
  const sizeDist = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  let sumCells = 0, single = 0, two = 0, three = 0, large = 0, maxCage = 0;
  const cageSizes = [];
  for (const c of cages) {
    const sz = (c.cells || []).length;
    const bucket = sz >= 5 ? '5+' : String(sz);
    if (sizeDist[bucket] !== undefined) sizeDist[bucket]++;
    sumCells += sz;
    cageSizes.push(sz);
    if (sz === 1) single++;
    if (sz === 2) two++;
    if (sz === 3) three++;
    if (sz >= 4) large++;
    if (sz > maxCage) maxCage = sz;
  }
  const cageCount = cages.length;

  // ---- 2/3. cage sum tightness + entropy ----
  let entropySum = 0, tightCount = 0, maxEntropy = -Infinity;
  const entropyHist = { low: 0, mid: 0, high: 0 }; // low<=1, mid<=3, high>3 (bits)
  for (const c of cages) {
    const sz = (c.cells || []).length;
    const sum = c.sum;
    const combos = countCombos(sz, sum);
    const ent = entropy(combos);
    entropySum += ent;
    if (combos <= 2) tightCount++;
    if (ent > maxEntropy) maxEntropy = ent;
    if (ent <= 1) entropyHist.low++;
    else if (ent <= 3) entropyHist.mid++;
    else entropyHist.high++;
  }

  // ---- 4/5. solve + step attribution ----
  let solveInfo = null;
  try {
    const board = new deps.Board(size);
    board.loadLevel({ cells: grid, cages });
    const solver = new deps.TechRater(board);
    solver.solve(2000);
    const steps = solver.getSteps() || [];
    const techCount = {};
    let naked = 0, cageUnique = 0, rule45 = 0, other = 0;
    const cageTechPositions = []; // [stepIndex, techId]
    for (let i = 0; i < steps.length; i++) {
      const t = steps[i].technique || '?';
      techCount[t] = (techCount[t] || 0) + 1;
      if (t === 'nakedSingle') naked++;
      else if (t === 'cageUnique') { cageUnique++; cageTechPositions.push([i, 'cageUnique']); }
      else if (t === 'rule45') { rule45++; cageTechPositions.push([i, 'rule45']); }
      else other++;
    }
    const total = steps.length;
    const rating = solver.getRating();
    solveInfo = {
      totalSteps: total,
      solvable: !!rating.solvable,
      score: rating.score,
      levelStar: rating.level,
      step_attribution: {
        nakedSingle: total > 0 ? Math.round((naked / total) * 1000) / 1000 : 0,
        cageUnique: total > 0 ? Math.round((cageUnique / total) * 1000) / 1000 : 0,
        rule45: total > 0 ? Math.round((rule45 / total) * 1000) / 1000 : 0,
        other: total > 0 ? Math.round((other / total) * 1000) / 1000 : 0,
      },
      cage_reasoning_count: cageUnique + rule45,
      cage_reasoning_ratio: total > 0 ? Math.round(((cageUnique + rule45) / total) * 1000) / 1000 : 0,
      first_cage_tech_index: cageTechPositions.length > 0 ? cageTechPositions[0][0] : null,
      cage_tech_positions: cageTechPositions,
    };
  } catch (e) {
    solveInfo = { error: e && e.message };
  }

  return {
    levelId: level.levelId,
    cageCount,
    cage_sizes: cageSizes,
    size_distribution: sizeDist,
    avg_cage_size: cageCount > 0 ? Math.round((sumCells / cageCount) * 1000) / 1000 : 0,
    single_cell_ratio: cageCount > 0 ? Math.round((single / cageCount) * 1000) / 1000 : 0,
    two_cell_ratio: cageCount > 0 ? Math.round((two / cageCount) * 1000) / 1000 : 0,
    three_cell_ratio: cageCount > 0 ? Math.round((three / cageCount) * 1000) / 1000 : 0,
    large_cell_ratio: cageCount > 0 ? Math.round((large / cageCount) * 1000) / 1000 : 0,
    max_cage_size: maxCage,
    avg_cage_entropy: cageCount > 0 ? Math.round((entropySum / cageCount) * 1000) / 1000 : 0,
    max_cage_entropy: maxEntropy,
    tight_cage_ratio: cageCount > 0 ? Math.round((tightCount / cageCount) * 1000) / 1000 : 0,
    entropy_histogram: entropyHist,
    solve: solveInfo,
  };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { count: DEFAULT_COUNT, target: DEFAULT_TARGET, seed: DEFAULT_SEED, output: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count') o.count = parseInt(args[++i], 10) || DEFAULT_COUNT;
    else if (args[i] === '--target') o.target = parseInt(args[++i], 10) || DEFAULT_TARGET;
    else if (args[i] === '--seed') o.seed = parseInt(args[++i], 10);
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
  }
  o.count = Math.min(500, Math.max(1, o.count));
  return o;
}

function avg(arr) {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 1000) / 1000;
}

function main() {
  const opts = parseArgs();
  const deps = _loadCoreDeps();
  if (!deps.Board || !deps.TechRater) { console.error('FAIL: 未加载到 Board / TechRater'); process.exit(1); }

  const { CageFixer } = require('./cage-generator-v9.cjs');
  const generator = new CageFixer({
    gridSize: 9, seed: opts.seed, targetStar: opts.target,
    enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30,
  });

  console.log(`=== B2-A Cage Density Forensics ===`);
  console.log(`样本: ${opts.count}  目标星: ${opts.target}  seed: ${opts.seed}\n`);

  const perLevel = [];
  const startAll = Date.now();
  // 用 generateBatch 而非循环 generate()：固定 seed 下循环 generate() 每次重置
  // seed 从 attempt=1 重跑，会产出完全相同的关卡。generateBatch 内部按
  // seed + i*1000 偏移，保证样本互异且可复现。
  const batch = generator.generateBatch(opts.count, {});
  for (let k = 0; k < batch.length; k++) {
    const lv = batch[k];
    perLevel.push(analyzeLevel(deps, lv));
    if (opts.count > 20 && (k + 1) % 20 === 0) {
      process.stdout.write(`\r  已分析 ${k + 1}/${batch.length}（${((Date.now() - startAll) / 1000).toFixed(1)}s）`);
    }
  }
  if (opts.count > 20) process.stdout.write('\r' + ' '.repeat(60) + '\r');

  // ---- 聚合 ----
  const n = perLevel.length;
  const agg = {
    sampleCount: n,
    elapsedSeconds: Math.round((Date.now() - startAll) / 1000),
    cage_size: {
      avg_cage_size: avg(perLevel.map((l) => l.avg_cage_size)),
      single_cell_ratio: avg(perLevel.map((l) => l.single_cell_ratio)),
      two_cell_ratio: avg(perLevel.map((l) => l.two_cell_ratio)),
      three_cell_ratio: avg(perLevel.map((l) => l.three_cell_ratio)),
      large_cell_ratio: avg(perLevel.map((l) => l.large_cell_ratio)),
      max_cage_size: Math.max(...perLevel.map((l) => l.max_cage_size)),
      size_histogram: {
        '1': perLevel.reduce((s, l) => s + l.size_distribution['1'], 0),
        '2': perLevel.reduce((s, l) => s + l.size_distribution['2'], 0),
        '3': perLevel.reduce((s, l) => s + l.size_distribution['3'], 0),
        '4': perLevel.reduce((s, l) => s + l.size_distribution['4'], 0),
        '5+': perLevel.reduce((s, l) => s + l.size_distribution['5+'], 0),
      },
    },
    cage_tightness: {
      avg_cage_entropy: avg(perLevel.map((l) => l.avg_cage_entropy)),
      max_cage_entropy: Math.max(...perLevel.map((l) => l.max_cage_entropy)),
      tight_cage_ratio: avg(perLevel.map((l) => l.tight_cage_ratio)),
      entropy_histogram: {
        low: perLevel.reduce((s, l) => s + l.entropy_histogram.low, 0),
        mid: perLevel.reduce((s, l) => s + l.entropy_histogram.mid, 0),
        high: perLevel.reduce((s, l) => s + l.entropy_histogram.high, 0),
      },
    },
    step_attribution: {
      avg_naked_single: avg(perLevel.map((l) => l.solve && l.solve.step_attribution ? l.solve.step_attribution.nakedSingle : 0)),
      avg_cage_unique: avg(perLevel.map((l) => l.solve && l.solve.step_attribution ? l.solve.step_attribution.cageUnique : 0)),
      avg_rule45: avg(perLevel.map((l) => l.solve && l.solve.step_attribution ? l.solve.step_attribution.rule45 : 0)),
      avg_other: avg(perLevel.map((l) => l.solve && l.solve.step_attribution ? l.solve.step_attribution.other : 0)),
      cage_reasoning_ratio: avg(perLevel.map((l) => l.solve ? l.solve.cage_reasoning_ratio : 0)),
      levels_with_zero_cage_reasoning: perLevel.filter((l) => l.solve && l.solve.cage_reasoning_count === 0).length,
    },
    trigger_position: {
      levels_with_cage_tech: perLevel.filter((l) => l.solve && l.solve.cage_tech_positions && l.solve.cage_tech_positions.length > 0).length,
      avg_first_cage_tech_index: avg(perLevel.map((l) => (l.solve && l.solve.first_cage_tech_index !== null ? l.solve.first_cage_tech_index : null)).filter((v) => v !== null)),
      avg_total_steps: avg(perLevel.map((l) => l.solve ? l.solve.totalSteps : 0)),
    },
  };

  console.log(`生成成功: ${n}/${opts.count}（耗时 ${agg.elapsedSeconds}s）\n`);
  console.log('--- Cage size ---');
  console.log(`  avg_cage_size=${agg.cage_size.avg_cage_size}  single=${(agg.cage_size.single_cell_ratio * 100).toFixed(1)}%  two=${(agg.cage_size.two_cell_ratio * 100).toFixed(1)}%  three=${(agg.cage_size.three_cell_ratio * 100).toFixed(1)}%  large(4+) =${(agg.cage_size.large_cell_ratio * 100).toFixed(1)}%`);
  console.log(`  size_histogram=${JSON.stringify(agg.cage_size.size_histogram)}`);
  console.log('\n--- Cage sum tightness / entropy ---');
  console.log(`  avg_cage_entropy=${agg.cage_tightness.avg_cage_entropy} bits  tight(combos<=2)=${(agg.cage_tightness.tight_cage_ratio * 100).toFixed(1)}%`);
  console.log(`  entropy_histogram(low<=1/mid<=3/high>3)=${JSON.stringify(agg.cage_tightness.entropy_histogram)}`);
  console.log('\n--- Solver step attribution ---');
  console.log(`  nakedSingle=${(agg.step_attribution.avg_naked_single * 100).toFixed(1)}%  cageUnique=${(agg.step_attribution.avg_cage_unique * 100).toFixed(1)}%  rule45=${(agg.step_attribution.avg_rule45 * 100).toFixed(1)}%`);
  console.log(`  cage_reasoning_ratio=${(agg.step_attribution.cage_reasoning_ratio * 100).toFixed(1)}%  avg_total_steps=${agg.trigger_position.avg_total_steps}`);
  console.log('\n--- Trigger position ---');
  console.log(`  出现 cage 推理的关卡: ${agg.trigger_position.levels_with_cage_tech}/${n}`);
  if (agg.trigger_position.avg_first_cage_tech_index !== null) {
    console.log(`  首次 cage 推理步索引 avg=${agg.trigger_position.avg_first_cage_tech_index}（总步数 avg=${agg.trigger_position.avg_total_steps}）`);
  }

  const outPath = opts.output || path.join(__dirname, '..', 'data', 'cage-density-forensics.json');
  const report = { generatedAt: new Date().toISOString(), config: { count: opts.count, targetStar: opts.target, seed: opts.seed }, aggregate: agg, per_level: perLevel };
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\n结果已保存: ${outPath}`);
}

if (require.main === module) {
  main();
}