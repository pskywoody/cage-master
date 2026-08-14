/**
 * ============================================================
 *  cage-audit.cjs — Cage Generator 观察层（Step 3.5 Step A）
 * ============================================================
 *
 *  不修改生成算法，只做「观察」。回答三个问题：
 *    1. 现在生成了什么？（size / operation 分布）
 *    2. 哪里不足？（大笼占比、操作多样性、难度覆盖）
 *    3. 哪些规则导致退化？（退化规则定位 + red flags）
 *
 *  分析对象：
 *    - 已上线 9×9 关卡（data/levels/*.json，默认全量）
 *    - 可选：用固定 seed 现跑 N 关新鲜生成，做「存量 vs 新生成」对比
 *
 *  每个关卡输出：
 *    {
 *      size_distribution:      { 1,2,3,4,"5+" }  笼数
 *      operation_distribution: { "+","-","*","/" } 操作笼数
 *      min_large_cage_ratio:   size>=4 笼占比（对照 0.15 阈值）
 *      difficulty_score:       solver 综合难度分（0-1000）
 *      logic_required:         求解路径命中的技巧（去裸单）
 *    }
 *
 *  用法:
 *    node scripts/cage-audit.cjs                # 审计全部 9x9 关卡
 *    node scripts/cage-audit.cjs --static       # 只做静态分析，不跑 solver（快）
 *    node scripts/cage-audit.cjs --sample 8     # 额外现跑 8 关对比（固定 seed）
 *    node scripts/cage-audit.cjs -o data/cage-audit-report.json
 *
 * ============================================================
 */
const path = require('path');
const fs = require('fs');

const DEFAULT_SAMPLE = 0;      // 默认不现跑生成
const SAMPLE_SEED = 20260810;  // 固定 seed，保证可复现
const LARGE_CAGE_MIN = 4;      // size>=4 视为大笼
const LARGE_CAGE_RATIO_TARGET = 0.15; // 9×9 目标：size>=4 笼占比 >= 15%
// Killer Sudoku 专属技巧：笼的和唯一组合 / 45法则（星衡）。这些才代表"玩家真的在用 cage"。
const CAGE_REASONING_TECHS = ['cageUnique', 'rule45'];

// ========================================================
//  依赖加载（与 pool 生成器一致：eval 加载 board.js，require tech-rater.js）
// ========================================================
function _loadCoreDeps() {
  // board.js / tech-rater.js 引用 window 全局导出，Node 下补一个 window 指向 globalThis
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

// ========================================================
//  静态分析：笼子结构（不依赖 solver）
// ========================================================

/** 推断笼操作：数据里只有 sum 时按加法(+)；显式 op 字段则透传。 */
function inferOperation(cage) {
  if (cage && cage.op) return cage.op;
  return '+';
}

/** 计算单个关卡的笼子统计。solution 可用来做减法/除法判定（当前未用）。 */
function analyzeCages(cages = []) {
  const sizeDist = { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 };
  const opDist = { '+': 0, '-': 0, '*': 0, '/': 0 };
  let maxSize = 0, bigCount = 0, singleCount = 0, totalCells = 0;

  for (const cage of cages) {
    const sz = (cage.cells || []).length;
    const bucket = sz >= 5 ? '5+' : String(sz);
    if (sizeDist[bucket] !== undefined) sizeDist[bucket]++;
    if (sz > maxSize) maxSize = sz;
    if (sz >= LARGE_CAGE_MIN) bigCount++;
    if (sz === 1) singleCount++;
    totalCells += sz;

    const op = inferOperation(cage);
    if (opDist[op] !== undefined) opDist[op]++;
    else opDist[op] = 1;
  }

  const cageCount = cages.length;
  const bigCageRatio = cageCount > 0 ? bigCount / cageCount : 0;

  return {
    cageCount,
    totalCells,
    size_distribution: sizeDist,
    operation_distribution: opDist,
    maxCageSize: maxSize,
    bigCageCount: bigCount,
    bigCageRatio,
    bigCagePass: bigCageRatio >= LARGE_CAGE_RATIO_TARGET,
    singleCellCageCount: singleCount,
  };
}

// ========================================================
//  求解分析：难度 + 逻辑要求（依赖 solver）
// ========================================================

/** 用 TechRater 完整求解，返回难度与逻辑要求。 */
function solveLevel(deps, level) {
  const grid = level.boardData;
  const cages = level.cages;
  const size = level.gridSize || 9;
  try {
    const board = new deps.Board(size);
    board.loadLevel({ cells: grid, cages });
    const solver = new deps.TechRater(board);
    solver.solve(2000);
    const r = solver.getRating();
    // logic_required：命中的技巧，去掉裸单（裸单是纯排他，不算 cage 推理）
    const techCount = r.techCount || {};
    const logicList = Object.keys(techCount).filter((t) => t !== 'nakedSingle');
    // cage 推理：笼和唯一组合 / 45法则 命中步数占比 + 是否使用
    const totalSteps = r.totalSteps || 0;
    const cageRationaleSteps = CAGE_REASONING_TECHS.reduce((s, t) => s + (techCount[t] || 0), 0);
    return {
      solvable: !!r.solvable,
      difficulty_score: Math.round((r.score != null ? r.score : 0) * 10) / 10,
      difficulty_norm: Math.max(0, Math.min(10, Math.round((r.score != null ? r.score : 0) / 100 * 10) / 10)),
      difficulty_level: r.level != null ? r.level : null,
      totalSteps,
      cage_reasoning_used: cageRationaleSteps > 0,
      cage_reasoning_ratio: totalSteps > 0 ? Math.round((cageRationaleSteps / totalSteps) * 1000) / 1000 : 0,
      nonTrivialRatio: Math.round((r.nonTrivialRatio || 0) * 100) / 100,
      maxTechLevel: r.maxTechLevel || 0,
      remainingCells: r.remainingCells != null ? r.remainingCells : -1,
      logic_required: logicList,
      techCount,
    };
  } catch (e) {
    return { solvable: false, error: e && e.message, difficulty_score: 0, logic_required: [] };
  }
}

// ========================================================
//  单关综合分析
// ========================================================

function analyzeLevel(deps, level, opts) {
  const staticPart = analyzeCages(level.cages || []);
  const out = {
    levelId: level.levelId,
    gridSize: level.gridSize,
    difficulty: level.difficulty || null,
    difficultyLevel: level.difficultyLevel || null,
    ...staticPart,
  };
  if (!opts.static) {
    const s = solveLevel(deps, level);
    out.solvable = s.solvable;
    out.difficulty_score = s.difficulty_score;
    out.difficulty_norm = s.difficulty_norm;
    out.difficulty_level = s.difficulty_level;
    out.totalSteps = s.totalSteps;
    out.nonTrivialRatio = s.nonTrivialRatio;
    out.maxTechLevel = s.maxTechLevel;
    out.remainingCells = s.remainingCells;
    out.logic_required = s.logic_required;
    out.techCount = s.techCount;
    out.cage_reasoning_used = s.cage_reasoning_used;
    out.cage_reasoning_ratio = s.cage_reasoning_ratio;
    if (s.error) out.solveError = s.error;
  }
  return out;
}

// ========================================================
//  汇总
// ========================================================

function aggregate(levels) {
  const agg = {
    totalLevels: levels.length,
    size_distribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5+': 0 },
    operation_distribution: { '+': 0, '-': 0, '*': 0, '/': 0 },
    operation_pct: {},
    bigCageRatio: { avg: 0, perLevel: [], passRatio: 0 },
    difficulty: { avg: 0, min: Infinity, max: -Infinity, count: 0, bands: { '1星': 0, '2星': 0, '3星': 0, '4星': 0, '5星': 0 } },
    logic_required: {},      // tech -> 命中关卡数
    distinctLogic: [],
    red_flags: [],
  };

  for (const lv of levels) {
    for (const k of Object.keys(agg.size_distribution)) {
      agg.size_distribution[k] += (lv.size_distribution[k] || 0);
    }
    for (const k of Object.keys(agg.operation_distribution)) {
      agg.operation_distribution[k] += (lv.operation_distribution[k] || 0);
    }
    agg.bigCageRatio.perLevel.push(lv.bigCageRatio);
    if (lv.difficulty_score != null) {
      agg.difficulty.avg += lv.difficulty_score;
      agg.difficulty.count++;
      if (lv.difficulty_score < agg.difficulty.min) agg.difficulty.min = lv.difficulty_score;
      if (lv.difficulty_score > agg.difficulty.max) agg.difficulty.max = lv.difficulty_score;
      if (lv.difficulty_level && agg.difficulty.bands[lv.difficulty_level] !== undefined) {
        agg.difficulty.bands[lv.difficulty_level]++;
      }
    }
    for (const t of (lv.logic_required || [])) {
      agg.logic_required[t] = (agg.logic_required[t] || 0) + 1;
    }
  }

  // 操作百分比
  const totalOps = Object.values(agg.operation_distribution).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(agg.operation_pct)) { delete agg.operation_pct[k]; }
  for (const k of Object.keys(agg.operation_distribution)) {
    agg.operation_pct[k] = totalOps > 0 ? Math.round((agg.operation_distribution[k] / totalOps) * 1000) / 10 : 0;
  }

  // 大笼占比
  const n = agg.bigCageRatio.perLevel.length;
  agg.bigCageRatio.avg = n > 0 ? agg.bigCageRatio.perLevel.reduce((a, b) => a + b, 0) / n : 0;
  agg.bigCageRatio.avg = Math.round(agg.bigCageRatio.avg * 1000) / 1000;
  agg.bigCageRatio.passRatio = n > 0
    ? Math.round((agg.bigCageRatio.perLevel.filter((v) => v >= LARGE_CAGE_RATIO_TARGET).length / n) * 1000) / 10
    : 0;

  // 难度均值
  if (agg.difficulty.count > 0) agg.difficulty.avg = Math.round((agg.difficulty.avg / agg.difficulty.count) * 10) / 10;
  if (agg.difficulty.min === Infinity) { agg.difficulty.min = 0; agg.difficulty.max = 0; }

  // distinct logic（按命中关卡数降序）
  agg.distinctLogic = Object.entries(agg.logic_required).sort((a, b) => b[1] - a[1]).map(([t, c]) => ({ tech: t, levels: c }));

  // ---- red flags ----
  // 1. 操作单一
  const nonPlus = Object.keys(agg.operation_distribution).filter((k) => k !== '+' && agg.operation_distribution[k] > 0);
  if (nonPlus.length === 0) agg.red_flags.push('操作单一：仅加法(+ )笼，无 - / * 变体，Sudoku 价值有限');
  // 2. 大笼占比不足
  if (agg.bigCageRatio.avg < LARGE_CAGE_RATIO_TARGET) {
    agg.red_flags.push(`大笼占比不足：均值 ${(agg.bigCageRatio.avg * 100).toFixed(1)}% < 目标 ${(LARGE_CAGE_RATIO_TARGET * 100).toFixed(0)}%（size>=4）`);
  }
  // 3. 单格笼（纯提示，价值低）
  const singleTotal = levels.reduce((a, l) => a + (l.singleCellCageCount || 0), 0);
  if (singleTotal > 0) agg.red_flags.push(`存在单格笼 ${singleTotal} 个（纯裸单提示，Sudoku 价值低）`);
  // 4. 需试错求解（非纯演绎，solver 无法纯逻辑推完）
  const unsolvable = levels.filter((l) => l.solvable === false);
  if (unsolvable.length) agg.red_flags.push(`有 ${unsolvable.length} 关需试错求解（纯演绎推不完，剩余格 ${unsolvable.map((l) => l.remainingCells).join('/')}）`);
  // 5. 难度覆盖（星档分布集中，无区分度）
  const trivial = agg.difficulty.bands['1星'] || 0;
  if (agg.difficulty.count > 0 && trivial / agg.difficulty.count >= 0.8) {
    agg.red_flags.push(`难度覆盖不足：${trivial}/${agg.difficulty.count} 关为 1星（纯裸单），无中高等难度梯度`);
  }

  return agg;
}

// ========================================================
//  主逻辑
// ========================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const o = { static: false, sample: DEFAULT_SAMPLE, output: null, levelsDir: null };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--static') o.static = true;
    else if (args[i] === '--sample') o.sample = parseInt(args[++i], 10) || 0;
    else if (args[i] === '-o' || args[i] === '--output') o.output = args[++i];
    else if (args[i] === '--levels-dir') o.levelsDir = args[++i];
  }
  return o;
}

function main() {
  const opts = parseArgs();
  const deps = _loadCoreDeps();
  if (!deps.Board || !deps.TechRater) {
    console.error('FAIL: 未加载到 Board / TechRater');
    process.exit(1);
  }

  const levelsDir = opts.levelsDir || path.join(__dirname, '..', 'data', 'levels');
  const files = fs.readdirSync(levelsDir).filter((f) => f.endsWith('.json'));
  const levels = [];
  for (const f of files) {
    try {
      const lv = JSON.parse(fs.readFileSync(path.join(levelsDir, f), 'utf-8'));
      if (lv.gridSize === 9) levels.push(lv);
    } catch (e) { /* 跳过坏文件 */ }
  }

  console.log(`=== Cage Generator 观察层（Step A）===`);
  console.log(`9×9 关卡数: ${levels.length}  求解: ${opts.static ? '跳过(static)' : '完整'}`);
  console.log('');

  const report = { generatedAt: new Date().toISOString(), scope: { gridSize: 9, totalLevels: levels.length }, thresholds: { largeCageMin: LARGE_CAGE_MIN, largeCageRatioTarget: LARGE_CAGE_RATIO_TARGET } };

  // 逐个分析
  const perLevel = [];
  for (const lv of levels) perLevel.push(analyzeLevel(deps, lv, opts));
  report.per_level = perLevel;
  report.aggregate = aggregate(perLevel);
  report.aggregate.op_key = 'op'; // 占位避免后续误用

  // 可选：现跑样本对比
  if (opts.sample > 0) {
    try {
      const { CageFixer } = require('./cage-generator-v9.cjs');
      const gen = new CageFixer({ gridSize: 9, seed: SAMPLE_SEED, targetStar: 4, enableRhythmValidation: false, timeoutMs: 15000, maxAttempts: 30 });
      const sample = [];
      let attempts = 0;
      while (sample.length < opts.sample && attempts < opts.sample * 20) {
        attempts++;
        const lv = gen.generate();
        if (!lv) continue;
        sample.push(analyzeLevel(deps, lv, opts));
      }
      report.generator_sample = { seed: SAMPLE_SEED, requested: opts.sample, generated: sample.length, attempts, per_level: sample, aggregate: aggregate(sample) };
      console.log(`现跑样本: 生成 ${sample.length}/${opts.sample} 关（seed=${SAMPLE_SEED}）`);
    } catch (e) {
      console.warn('WARN: 现跑样本失败:', e && e.message);
    }
  }

  const outPath = opts.output || path.join(__dirname, '..', 'data', 'cage-audit-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log('');
  console.log('=== 存量 9×9 关卡汇总 ===');
  printAggregate(report.aggregate);
  if (report.generator_sample) {
    console.log('');
    console.log('=== 现跑新生成样本汇总 ===');
    printAggregate(report.generator_sample.aggregate);
  }
  console.log('');
  console.log(`报告已保存: ${outPath}`);
}

function printAggregate(agg) {
  console.log(`  size_distribution      : ${JSON.stringify(agg.size_distribution)}`);
  console.log(`  operation_distribution : ${JSON.stringify(agg.operation_distribution)}`);
  console.log(`  operation_pct          : ${JSON.stringify(agg.operation_pct)}`);
  console.log(`  大笼占比(size>=4)       : avg=${(agg.bigCageRatio.avg * 100).toFixed(1)}%  passRatio=${agg.bigCageRatio.passRatio}%`);
  console.log(`  难度分                 : avg=${agg.difficulty.avg}  min=${agg.difficulty.min}  max=${agg.difficulty.max}`);
  console.log(`  星档分布               : ${JSON.stringify(agg.difficulty.bands)}`);
  console.log(`  logic_required 命中     : ${JSON.stringify(agg.logic_required)}`);
  console.log(`  red_flags              : ${agg.red_flags.length ? '' : '无'}`);
  for (const f of agg.red_flags) console.log('    - ' + f);
}

if (require.main === module) {
  main();
}