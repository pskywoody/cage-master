// ==========================================
// Killer Sudoku Pipeline v6
// ==========================================
// 核心：增强求解器（45法则+显性数对） + 5级难度分级 + 卡壳点残局
//
// 残局定义：从纯杀手题出发，解到卡壳
//   - 不能全解（必须有卡壳点）
//   - 剩余10-60空
//   - 非裸单比例 >= 5%
//   - 最高技巧 >= L2
// ==========================================

const fs = require('fs');
const path = require('path');
const { createSolver } = require('./killer-generator');
const { TechRaterSolver, TECHNIQUES, TECH_PRIORITY } = require('./tech-rater-v2.js');
const { transformPuzzle, generateVariants } = require('./variant-engine.js');

// HumanSimulator（用于卡壳点残局生成）
const { HumanSimulator } = require('../node-script/human-simulator.js');

const SIZE = 9;

// ==========================================
// 1. 验证题目
// ==========================================
function validatePuzzle(board, cages, expectedSolution = null) {
  const solve = createSolver(cages);
  const result = solve(board, 2, 5000);
  
  if (result.timeout) return { ok: false, reason: 'timeout' };
  if (result.count === 0) return { ok: false, reason: 'no solution' };
  if (result.count > 1) return { ok: false, reason: 'multiple solutions' };
  
  // 验证笼子
  for (const cage of cages) {
    let sum = 0;
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      const v = result.solutions[0][r][c];
      sum += v;
      if (nums.has(v)) return { ok: false, reason: `cage ${cage.id} dup ${v}` };
      nums.add(v);
    }
    if (sum !== cage.sum) return { ok: false, reason: `cage ${cage.id} sum ${sum}!=${cage.sum}` };
  }
  
  if (expectedSolution) {
    const sol = result.solutions[0];
    let match = true;
    for (let r = 0; r < SIZE && match; r++)
      for (let c = 0; c < SIZE && match; c++)
        if (sol[r][c] !== expectedSolution[r][c]) match = false;
    if (!match) return { ok: false, reason: 'solution mismatch' };
  }
  
  return { ok: true, solution: result.solutions[0] };
}

// ==========================================
// 2. 卡壳点残局生成
// ==========================================
// 卡壳点残局生成
// 从纯杀手题出发，用TechRaterSolver解题，解到卡壳
// 卡壳时的盘面就是天然残局——玩家解到这里也会卡住
//
// 质量标准：
//   - 不能全解（必须有卡壳点）
//   - 最高技巧等级 >= L2（至少需要笼子唯一组合）
//   - 非裸单比例 >= 5%
//   - 剩余空格 10-60（太满太空都不算残局）
// ==========================================
function generateStuckEndgame(solution, cages, options = {}) {
  const {
    minEmpties = 10,    // 最少空格数
    maxEmpties = 60,    // 最多空格数
    minNonTrivialPct = 0.05, // 最低非裸单比例
    minMaxTech = 2     // 最低最高技巧等级
  } = options;
  
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  // 用TechRaterSolver从0预填开始解题（已验证正确）
  const emptyBoard = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  const solver = new TechRaterSolver(emptyBoard, normCages);
  const result = solver.solve(500);
  
  const filled = result.steps;
  const empties = result.remaining;
  
  // 检查基本条件
  if (result.complete) return null; // 全解了就不是残局
  if (empties < minEmpties || empties > maxEmpties) return null;
  
  const rating = solver.getRating();
  
  // 检查技巧等级
  if (rating.maxTechLevel < minMaxTech) return null;
  
  // 检查非裸单比例
  const nonTrivial = filled - (rating.techCount.nakedSingle || 0);
  const nonTrivialPct = filled > 0 ? nonTrivial / filled : 0;
  if (nonTrivialPct < minNonTrivialPct) return null;
  
  // 提取当前盘面
  const board = solver.grid.map(row => [...row]);
  
  // 验证唯一解
  const valid = validatePuzzle(board, cages, solution);
  if (!valid.ok) return null;
  
  return {
    board,
    givenCount: filled,
    empties,
    rating,
    nonTrivialPct,
    nonTrivialCount: nonTrivial
  };
}

// ==========================================
// 3. 题目分类
// ==========================================
function classifyPuzzle(board, rating) {
  const givens = board.flat().filter(v => v > 0).length;
  
  // 纯杀手（0预填）按难度分级
  if (givens === 0) {
    const level = rating.level || '3星';
    return 'pure-' + level.charAt(0) + 'star';
  }
  
  // 非纯杀手按预填数分
  if (givens <= 10) return 'light';
  if (givens <= 25) return 'standard';
  if (givens <= 45) return 'heavy';
  return 'endgame';
}

// ==========================================
// 4. 加载种子题库
// ==========================================
function loadSeedPuzzles(seedDir) {
  const puzzles = [];
  
  // 优先加载统一种子库
  const allSeedsFile = path.join(seedDir, 'all-killer-seeds.json');
  if (fs.existsSync(allSeedsFile)) {
    const data = JSON.parse(fs.readFileSync(allSeedsFile, 'utf-8'));
    for (const p of data.puzzles) {
      // 只加载标准杀手数独（排除混合变体题）
      if (p.isStandardKiller === false) continue;
      
      puzzles.push({
        id: p.id,
        source: p.source,
        title: p.title || '',
        author: p.author || '',
        difficulty: p.difficulty || 0,
        board: p.boardData,
        cages: p.cages,
        solution: p.solution,
        givenCount: p.givenCount,
        cageCount: p.cageCount
      });
    }
    return puzzles;
  }
  
  // 备用：从目录中逐个加载
  const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(seedDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const list = data.puzzles || data;
      
      for (const p of list) {
        const board = p.boardData || p.board || p.grid;
        const cages = p.cages;
        
        if (!board || !cages || !Array.isArray(cages)) continue;
        if (cages.length === 0) continue;
        
        puzzles.push({
          id: p.id || `${file}_${puzzles.length}`,
          source: p.source || file.replace('.json', ''),
          title: p.title || '',
          author: p.author || '',
          difficulty: p.difficulty || 0,
          board,
          cages: cages.map((c, i) => ({
            id: c.id || i + 1,
            sum: c.sum,
            cells: c.cells
          })),
          solution: p.solution,
          givenCount: p.givenCount || board.flat().filter(v => v > 0).length,
          cageCount: cages.length
        });
      }
    } catch (e) {
      console.error(`加载 ${file} 失败:`, e.message);
    }
  }
  
  return puzzles;
}

// ==========================================
// 5. 处理单道种子题
// ==========================================
function processSeedPuzzle(seed, options = {}) {
  const {
    variantsPerSeed = 10,
    generateStuckEndgames = true
  } = options;
  
  const results = {
    seed: null,
    variants: [],
    endgames: [],
    stats: { validated: 0, failed: 0, variants: 0, endgames: 0 }
  };
  
  // 验证
  const cageObjs = seed.cages.map((c, i) => ({ id: i + 1, sum: c.sum, cells: c.cells }));
  const valid = validatePuzzle(seed.board, cageObjs, seed.solution);
  
  if (!valid.ok) {
    results.stats.failed++;
    return { ...results, error: valid.reason };
  }
  
  const solution = seed.solution || valid.solution;
  
  // v2评级
  const normCages = cageObjs.map((c, i) => ({
    id: i, sum: c.sum, cells: c.cells.map(([r, c]) => [r, c])
  }));
  const solver = new TechRaterSolver(seed.board, normCages);
  solver.solve(500);
  const rating = solver.getRating();
  
  const type = classifyPuzzle(seed.board, rating);
  
  results.seed = {
    ...seed,
    solution,
    rating: {
      level: rating.level,
      score: rating.score,
      solvable: rating.solvable,
      maxTechLevel: rating.maxTechLevel,
      totalSteps: rating.totalSteps,
      remainingCells: rating.remainingCells,
      techCount: rating.techCount,
      totalDepth: rating.totalDepth
    },
    type
  };
  results.stats.validated++;
  
  // 生成变体
  if (variantsPerSeed > 0) {
    const puzzleForVariant = {
      board: seed.board,
      cages: seed.cages,
      solution,
      id: seed.id
    };
    
    const seedBase = Math.abs(hashCode(seed.id));
    const variants = generateVariants(puzzleForVariant, variantsPerSeed, seedBase);
    
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const vCages = v.cages.map((c, idx) => ({ id: idx + 1, sum: c.sum, cells: c.cells }));
      
      const vValid = validatePuzzle(v.board, vCages, v.solution);
      if (!vValid.ok) continue;
      
      // v2评级
      const vNormCages = vCages.map((c, j) => ({
        id: j, sum: c.sum, cells: c.cells.map(([r, c]) => [r, c])
      }));
      const vSolver = new TechRaterSolver(v.board, vNormCages);
      vSolver.solve(500);
      const vRating = vSolver.getRating();
      
      results.variants.push({
        id: `${seed.id}_v${i}`,
        source: 'variant',
        parentId: seed.id,
        variantSeed: v.variantSeed,
        board: v.board,
        cages: v.cages,
        solution: v.solution,
        givenCount: v.board.flat().filter(x => x > 0).length,
        cageCount: v.cages.length,
        rating: {
          level: vRating.level,
          score: vRating.score,
          solvable: vRating.solvable,
          maxTechLevel: vRating.maxTechLevel,
          totalSteps: vRating.totalSteps,
          remainingCells: vRating.remainingCells,
          techCount: vRating.techCount,
          totalDepth: vRating.totalDepth
        },
        type: classifyPuzzle(v.board, vRating)
      });
      
      results.stats.variants++;
    }
  }
  
  // 生成卡壳点残局（只对纯杀手题）
  if (generateStuckEndgames && seed.givenCount === 0) {
    const endgame = generateStuckEndgame(solution, cageObjs, {
      minEmpties: 10,
      maxEmpties: 60,
      minNonTrivialPct: 0.05,
      minMaxTech: 2
    });
    
    if (endgame) {
      results.endgames.push({
        id: `${seed.id}_se0`,
        source: 'stuck-endgame',
        parentId: seed.id,
        board: endgame.board,
        cages: seed.cages,
        solution,
        givenCount: endgame.givenCount,
        cageCount: seed.cages.length,
        empties: endgame.empties,
        nonTrivialPct: endgame.nonTrivialPct,
        nonTrivialCount: endgame.nonTrivialCount,
        rating: {
          level: endgame.rating.level,
          score: endgame.rating.score,
          solvable: endgame.rating.solvable,
          maxTechLevel: endgame.rating.maxTechLevel,
          totalSteps: endgame.rating.totalSteps,
          remainingCells: endgame.rating.remainingCells,
          techCount: endgame.rating.techCount,
          totalDepth: endgame.rating.totalDepth
        },
        type: 'stuck-endgame'
      });
      
      results.stats.endgames++;
    }
  }
  
  return results;
}

// ==========================================
// 辅助
// ==========================================
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

function formatForOutput(puzzle) {
  return {
    id: puzzle.id,
    source: puzzle.source,
    parentId: puzzle.parentId,
    title: puzzle.title,
    author: puzzle.author,
    boardData: puzzle.board,
    cages: puzzle.cages,
    solution: puzzle.solution,
    givenCount: puzzle.givenCount,
    cageCount: puzzle.cageCount,
    difficulty: puzzle.rating?.level || 'unknown',
    difficultyScore: puzzle.rating?.score || 0,
    solvable: puzzle.rating?.solvable || false,
    maxTechLevel: puzzle.rating?.maxTechLevel || 0,
    techCount: puzzle.rating?.techCount || {},
    totalDepth: puzzle.rating?.totalDepth || 0,
    type: puzzle.type,
    nonTrivialPct: puzzle.nonTrivialPct,
    nonTrivialCount: puzzle.nonTrivialCount
  };
}

// ==========================================
// 主流程
// ==========================================
function main() {
  const seedDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
  const outDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'v6');
  
  console.log('=== Killer Sudoku Pipeline v6 ===\n');
  console.log('核心：增强求解器 + 5级分级 + 卡壳点残局\n');
  
  // 1. 加载
  console.log('1. 加载种子题库...');
  const seeds = loadSeedPuzzles(seedDir);
  console.log(`   加载了 ${seeds.length} 道种子题`);
  
  const bySource = {};
  for (const s of seeds) bySource[s.source] = (bySource[s.source] || 0) + 1;
  console.log('   按来源: ' + JSON.stringify(bySource) + '\n');
  
  // 2. 处理
  console.log('2. 处理种子题...');
  
  const categories = {
    'pure-1star': [],
    'pure-2star': [],
    'pure-3star': [],
    'pure-4star': [],
    'pure-5star': [],
    'light': [],
    'standard': [],
    'heavy': [],
    'endgame': [],
    'stuck-endgame': []
  };
  
  let processed = 0;
  let totalVariants = 0;
  let totalEndgames = 0;
  let failed = 0;
  
  const options = {
    variantsPerSeed: 10,
    generateStuckEndgames: true
  };
  
  const startTime = Date.now();
  
  for (const seed of seeds) {
    processed++;
    const result = processSeedPuzzle(seed, options);
    
    if (result.error) {
      failed++;
    } else {
      totalVariants += result.stats.variants;
      totalEndgames += result.stats.endgames;
      
      if (result.seed) {
        const t = result.seed.type;
        if (categories[t]) categories[t].push(formatForOutput(result.seed));
      }
      for (const v of result.variants) {
        const t = v.type;
        if (categories[t]) categories[t].push(formatForOutput(v));
      }
      for (const e of result.endgames) {
        categories['stuck-endgame'].push(formatForOutput(e));
      }
    }
    
    if (processed % 20 === 0 || processed === seeds.length) {
      const pct = ((processed / seeds.length) * 100).toFixed(0);
      console.log(`   [${processed}/${seeds.length}] ${pct}% 失败:${failed} 变体:${totalVariants} 残局:${totalEndgames}`);
    }
  }
  
  const totalTime = Date.now() - startTime;
  
  // 3. 统计
  console.log(`\n3. 结果统计:`);
  console.log(`   种子题: ${seeds.length} (失败 ${failed})`);
  console.log(`   变体: ${totalVariants}`);
  console.log(`   卡壳残局: ${totalEndgames}`);
  console.log(`   总计: ${seeds.length - failed + totalVariants + totalEndgames}`);
  console.log(`   总耗时: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   平均每题: ${(totalTime / seeds.length).toFixed(0)}ms\n`);
  
  console.log('   分类统计:');
  for (const type of Object.keys(categories)) {
    console.log(`     ${type}: ${categories[type].length} 道`);
  }
  
  // 4. 保存
  console.log(`\n4. 保存到 ${outDir}...`);
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  for (const type of Object.keys(categories)) {
    if (categories[type].length === 0) continue;
    const outFile = path.join(outDir, `killer-${type}.json`);
    const data = {
      version: '5.0',
      generatedAt: new Date().toISOString(),
      ratingSystem: 'minimum-technique-v2',
      count: categories[type].length,
      puzzles: categories[type]
    };
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`   ${type}: ${categories[type].length} 道 → killer-${type}.json`);
  }
  
  console.log('\n✅ Pipeline v6 完成!');
}

if (require.main === module) {
  main();
}

module.exports = {
  validatePuzzle,
  generateStuckEndgame,
  classifyPuzzle,
  loadSeedPuzzles,
  processSeedPuzzle,
  main
};
