/**
 * ============================================================
 *  generate-pool.cjs — 精选关卡池生成器（v9 扩展）
 * ============================================================
 *
 *  离线批量生成高品质关卡，通过多层美学筛选，存入精选池。
 *
 *  用法:
 *    node scripts/generate-pool.cjs
 *      --technique xWing
 *      --count 200
 *      --aesthetics-threshold 0.7
 *      --timeout 15000
 *      --output data/pool-xwing.json
 *
 *  可选:
 *    --seed <number>           随机种子
 *    --maxAttempts 50          每关最大尝试次数
 *    --no-rhythm               跳过节奏验证（省时）
 *    --progress                显示进度条
 *
 *  落地说明（2026-08-04）：
 *    - 依据用户提供的黄金筛选标准实现（7 维美学评分）
 *    - 修复 1：board.js 无 CommonJS export，改用 eval 加载（与 v9 _loadDeps 一致）
 *    - 修复 2：level.difficultyInfo 无 techCount，非裸单比例改为重解获取
 *    - 扩展名 .cjs：项目 package.json 为 "type": "module"，.js 会被当 ESM
 *    - 性能：v9 优化后关均 ~330ms，池子模式 200 关约 1-2 分钟
 *
 * ============================================================
 */

const path = require('path');
const fs = require('fs');
const { CageFixer } = require('./cage-generator-v9.cjs');

// ========================================================
//  依赖加载（与 v9 _loadDeps 一致）
// ========================================================

function _loadCoreDeps() {
  const deps = {};
  // board.js 无 CommonJS export，eval 加载挂到 global
  if (typeof Board !== 'undefined') {
    deps.Board = Board;
  } else {
    const boardPath = path.join(__dirname, '..', 'core', 'board.js');
    const boardCode = fs.readFileSync(boardPath, 'utf-8');
    eval.call(global, boardCode);
    deps.Board = global.Board || (typeof window !== 'undefined' ? window.Board : null);
  }

  // tech-rater.js 有 CommonJS export
  if (typeof TechRater !== 'undefined') {
    deps.TechRater = TechRater;
  } else {
    try {
      const trMod = require(path.join(__dirname, '..', 'core', 'tech-rater.js'));
      deps.TechRater = trMod.TechRater || global.TechRater || globalThis.TechRater;
    } catch (e) {
      const trPath = path.join(__dirname, '..', 'core', 'tech-rater.js');
      const trCode = fs.readFileSync(trPath, 'utf-8');
      eval.call(global, trCode);
      deps.TechRater = global.TechRater || globalThis.TechRater;
    }
  }
  return deps;
}

// ========================================================
//  美学评分扩展（基于 v9 _validateAesthetics 升级版）
// ========================================================

/**
 * 对已生成的关卡进行完整美学评分
 * 7 维加权（权重和 = 1.0）：
 *   对称性 0.20 / 开局流畅 0.15 / 破局点 0.15 / 技巧多样性 0.15 /
 *   笼子分布 0.10 / 预填均匀 0.10 / 非裸单 0.15
 * @param {Object} level - CageFixer 生成的关卡对象
 * @param {number} gridSize - 盘面大小
 * @returns {Object} { passed, score, details }
 */
function scoreAesthetics(level, gridSize = 9) {
  const grid = level.boardData;
  const cages = level.cages;
  const rating = level.difficultyInfo;

  const details = {};
  let scoreSum = 0;
  let scoreCount = 0;

  // ---- 1. 高级对称性（预填格转置对称率） ----
  // 只统计预填格：预填格集合 S 与转置集合 T={(c,r)|(r,c)∈S} 的
  // 对称率 = |S∩T| / |S∪T|。原实现统计全盘（含空格），预填仅 4-10 格时
  // 空格对角都算"一致"，对称性天然 85%+，指标失真（实测 100% 通过率）。
  const filledSet = new Set();
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c] !== 0) filledSet.add(r + ',' + c);
    }
  }
  let symOverlap = 0;
  for (const key of filledSet) {
    const [r, c] = key.split(',').map(Number);
    if (filledSet.has(c + ',' + r)) symOverlap++;
  }
  const symRatio = filledSet.size > 0 ? symOverlap / filledSet.size : 0;
  details.symmetry = symRatio;
  const symScore = Math.min(1, Math.max(0, (symRatio - 0.10) / 0.40)); // 0.10→0, 0.50→1
  scoreSum += symScore * 0.20;
  scoreCount += 0.20;

  // ---- 2. 开局流畅度（前 5 步可填数） ----
  // 注意：solver.solve(N) 的 N 是最大步数上限，不是"前几步"。
  // 用 solve(5) 统计前 5 步内实际 fill 数（原实现 solve(20) 统计 20 步
  // 内 fill，几乎恒等于全程流畅度，指标失真——实测 100% 通过率）。
  let openingFills = 0;
  try {
    const deps = _loadCoreDeps();
    const board = new deps.Board(gridSize);
    board.loadLevel({ cells: grid, cages: cages });
    const solver = new deps.TechRater(board);
    solver.solve(5);
    const steps = solver.getSteps() || [];
    openingFills = steps.filter(s => s.type === 'fill').length;
  } catch (e) {
    openingFills = 0;
  }
  details.openingFills = openingFills;
  const openScore = Math.min(1, Math.max(0, (openingFills - 1) / 4)); // 1→0, 5→1
  scoreSum += openScore * 0.15;
  scoreCount += 0.15;

  // ---- 3. 破局点时机（breakthrough 在总步数中的位置） ----
  const breakpointPos = level.rhythm ? level.rhythm.breakpointPos || 0 : 0;
  details.breakpointPos = breakpointPos;
  let bpScore = 0;
  if (breakpointPos >= 50 && breakpointPos <= 70) bpScore = 1;
  else if (breakpointPos < 50) bpScore = Math.max(0, breakpointPos / 50);
  else bpScore = Math.max(0, 1 - (breakpointPos - 70) / 30);
  scoreSum += bpScore * 0.15;
  scoreCount += 0.15;

  // ---- 4. 技巧多样性（求解路径中技巧种类数） ----
  const techTypes = new Set(rating.techniquesUsed || []);
  const techCount = techTypes.size;
  details.techCount = techCount;
  const techScore = Math.min(1, Math.max(0, (techCount - 2) / 4)); // 2→0, 6→1
  scoreSum += techScore * 0.15;
  scoreCount += 0.15;

  // ---- 5. 笼子大小分布（最大笼子占比） ----
  let maxCageSize = 0;
  let totalCells = 0;
  for (const cage of cages) {
    const sz = cage.cells.length;
    if (sz > maxCageSize) maxCageSize = sz;
    totalCells += sz;
  }
  const maxCageRatio = totalCells > 0 ? maxCageSize / totalCells : 0;
  details.maxCageRatio = maxCageRatio;
  const cageScore = Math.max(0, 1 - (maxCageRatio - 0.10) / 0.30); // 0.10→1, 0.40→0
  scoreSum += cageScore * 0.10;
  scoreCount += 0.10;

  // ---- 6. 预填分布均匀性（行/列预填数方差） ----
  let rowSums = Array(gridSize).fill(0), colSums = Array(gridSize).fill(0);
  let totalPrefilled = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (grid[r][c] !== 0) { rowSums[r]++; colSums[c]++; totalPrefilled++; }
    }
  }
  // 期望按实际预填数计算（原实现用 gridSize/2=4.5 作期望，预填仅 4-10 格
  // 时每行期望约 0.7，方差恒巨大导致 varScore 恒 0，指标失真）
  const expectedPerLine = totalPrefilled / gridSize;
  const rowVar = rowSums.reduce((s, v) => s + (v - expectedPerLine) ** 2, 0) / gridSize;
  const colVar = colSums.reduce((s, v) => s + (v - expectedPerLine) ** 2, 0) / gridSize;
  const avgVar = (rowVar + colVar) / 2;
  details.varScore = avgVar;
  const varScore = Math.max(0, 1 - avgVar / 2.5); // 均匀(≈0.1-0.3)→1, 集中(>2.5)→0
  scoreSum += varScore * 0.10;
  scoreCount += 0.10;

  // ---- 7. 非裸单比例（重解获取完整 techCount） ----
  let nonNaked = 0;
  try {
    const deps = _loadCoreDeps();
    const board = new deps.Board(gridSize);
    board.loadLevel({ cells: grid, cages: cages });
    const solver = new deps.TechRater(board);
    solver.solve(2000);
    const fullRating = solver.getRating();
    const nakedCount = fullRating.techCount && fullRating.techCount.nakedSingle ? fullRating.techCount.nakedSingle : 0;
    const totalTechSteps = solver.getSteps().length;
    if (totalTechSteps > 0) {
      nonNaked = 1 - nakedCount / totalTechSteps;
    }
  } catch (e) {
    nonNaked = 0;
  }
  details.nonNakedRatio = nonNaked;
  const nakedScore = Math.min(1, Math.max(0, (nonNaked - 0.10) / 0.30)); // 0.10→0, 0.40→1
  scoreSum += nakedScore * 0.15;
  scoreCount += 0.15;

  // 综合评分
  const finalScore = scoreCount > 0 ? scoreSum / scoreCount : 0;
  details.score = finalScore;

  return {
    score: finalScore,
    details,
    passed: finalScore >= 0.6, // 默认及格线（外部用 threshold 覆盖）
  };
}

// ========================================================
//  命令行解析
// ========================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    technique: 'xWing',
    count: 100,
    aestheticsThreshold: 0.75,
    timeout: 15000,
    output: null,
    seed: null,
    maxAttempts: 30,
    noRhythm: false,
    progress: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--technique':
      case '-t': options.technique = args[++i]; break;
      case '--count':
      case '-n': options.count = parseInt(args[++i], 10); break;
      case '--aesthetics-threshold':
        options.aestheticsThreshold = parseFloat(args[++i]); break;
      case '--timeout':
        options.timeout = parseInt(args[++i], 10); break;
      case '--output':
      case '-o': options.output = args[++i]; break;
      case '--seed':
        options.seed = parseInt(args[++i], 10); break;
      case '--maxAttempts':
        options.maxAttempts = parseInt(args[++i], 10); break;
      case '--no-rhythm':
        options.noRhythm = true; break;
      case '--progress':
        options.progress = true; break;
      case '--help':
      case '-h':
        console.log(`
用法: node scripts/generate-pool.cjs [选项]

选项:
  -t, --technique <name>       目标技巧 (默认: xWing)
  -n, --count <number>         目标池子大小 (默认: 100)
  --aesthetics-threshold <num> 美学评分阈值 (0-1, 默认: 0.75)
  --timeout <ms>               单关生成超时 (默认: 15000)
  -o, --output <file>          输出文件路径 (默认: data/pool-{technique}.json)
  --seed <number>              随机种子
  --maxAttempts <number>       每关最大尝试次数 (默认: 30)
  --no-rhythm                  跳过节奏验证 (加速)
  --progress                   显示进度条
  -h, --help                   显示帮助
        `);
        process.exit(0);
        break;
    }
  }
  return options;
}

// ========================================================
//  主函数
// ========================================================

async function main() {
  const opts = parseArgs();

  if (!opts.output) {
    opts.output = `data/pool-${opts.technique}.json`;
  }

  console.log(`=== 精选关卡池生成器 ===`);
  console.log(`技巧: ${opts.technique}`);
  console.log(`目标池大小: ${opts.count}`);
  console.log(`美学阈值: ${opts.aestheticsThreshold}`);
  console.log(`超时: ${opts.timeout}ms`);
  console.log(`输出: ${opts.output}`);
  console.log('');

  // 创建生成器
  const generator = new CageFixer({
    gridSize: 9,
    guidedTechnique: opts.technique,
    targetStar: 4,
    seed: opts.seed || undefined,
    timeoutMs: opts.timeout,
    maxAttempts: opts.maxAttempts,
    enableRhythmValidation: !opts.noRhythm,
    targetSteps: 75,
    minAvalancheSize: 12,
    aestheticsStrict: false,
  });

  const pool = [];
  let generated = 0;
  let passed = 0;
  let totalAttempts = 0;
  const startTime = Date.now();

  while (passed < opts.count && totalAttempts < opts.count * 10) {
    totalAttempts++;
    if (opts.progress) {
      process.stdout.write(`\r尝试 ${totalAttempts} / 通过 ${passed} / 目标 ${opts.count}`);
    }

    const level = generator.generate();
    if (!level) continue;

    generated++;

    // 应用美学评分
    const aes = scoreAesthetics(level);
    if (aes.score >= opts.aestheticsThreshold) {
      passed++;
      // 移除超大字段（保留必要信息）
      const slim = {
        levelId: `pool-${String(passed).padStart(4, '0')}`,
        gridSize: level.gridSize,
        difficulty: level.difficulty,
        boardData: level.boardData,
        cages: level.cages,
        solution: level.solution,
        difficultyInfo: {
          level: level.difficultyInfo.level,
          score: level.difficultyInfo.score,
          techniquesUsed: level.difficultyInfo.techniquesUsed,
        },
        rhythm: level.rhythm || null,
        aestheticsScore: aes.score,
        aestheticsDetails: aes.details,
        threeAct: level.threeAct || null,
        generatedAt: new Date().toISOString(),
      };
      pool.push(slim);
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log(`\n\n生成完成！`);
  console.log(`总尝试: ${totalAttempts}`);
  console.log(`生成候选: ${generated}`);
  console.log(`通过筛选: ${passed}`);
  console.log(`通过率: ${(passed / totalAttempts * 100).toFixed(1)}%`);
  console.log(`耗时: ${elapsed.toFixed(1)} 秒`);

  // 保存池子
  const poolData = {
    metadata: {
      technique: opts.technique,
      aestheticsThreshold: opts.aestheticsThreshold,
      generatedAt: new Date().toISOString(),
      totalAttempts,
      generated,
      passed,
      poolSize: pool.length,
      elapsedSeconds: elapsed,
    },
    pool,
  };

  const outputPath = path.resolve(opts.output);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(poolData, null, 2));
  console.log(`池子已保存: ${outputPath}`);
}

// ========================================================
//  执行
// ========================================================

if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
