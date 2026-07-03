// ==========================================
// Killer Sudoku Pipeline v4
// ==========================================
// 核心原则：取"最低可用技巧"，而非"最快可解路径"
//
// 流程：
// 1. 加载种子题库（爬虫/手工/生成）
// 2. 验证唯一解
// 3. 技巧评级（基于最低可用技巧原则）
// 4. 生成变体（数字置换+行列互换）
// 5. 生成残局（卡壳点法：解题到卡住的状态即为天然残局）
// 6. 分类入库
// ==========================================

const fs = require('fs');
const path = require('path');
const { createSolver } = require('./killer-generator');
const { TechRaterSolver, TECHNIQUES, TECH_PRIORITY } = require('./tech-rater.js');
const { transformPuzzle, generateVariants } = require('./variant-engine.js');

const SIZE = 9;

// ==========================================
// 1. 验证题目（唯一解 + 笼子合法）
// ==========================================
function validatePuzzle(board, cages, expectedSolution = null) {
  const solve = createSolver(cages);
  const result = solve(board, 2, 5000);
  
  if (result.timeout) {
    return { ok: false, reason: 'timeout' };
  }
  
  if (result.count === 0) {
    return { ok: false, reason: 'no solution' };
  }
  
  if (result.count > 1) {
    return { ok: false, reason: 'multiple solutions' };
  }
  
  // 验证笼子和值
  for (const cage of cages) {
    let sum = 0;
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      const v = result.solutions[0][r][c];
      sum += v;
      if (nums.has(v)) {
        return { ok: false, reason: `cage ${cage.id} duplicate ${v}` };
      }
      nums.add(v);
    }
    if (sum !== cage.sum) {
      return { ok: false, reason: `cage ${cage.id} sum ${sum}!=${cage.sum}` };
    }
  }
  
  // 验证期望解
  if (expectedSolution) {
    const sol = result.solutions[0];
    let match = true;
    for (let r = 0; r < SIZE && match; r++) {
      for (let c = 0; c < SIZE && match; c++) {
        if (sol[r][c] !== expectedSolution[r][c]) match = false;
      }
    }
    if (!match) return { ok: false, reason: 'solution mismatch' };
  }
  
  return { ok: true, solution: result.solutions[0] };
}

// ==========================================
// 2. 技巧评级
// ==========================================
function ratePuzzle(board, cages) {
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  const solver = new TechRaterSolver(board, normCages);
  solver.solve(500);
  return solver.getRating();
}

// ==========================================
// 3. 卡壳点残局生成
// ==========================================
// 思路：从0预填（或低预填）开始解题，解到卡壳
// 卡壳时的盘面就是"需要新技巧才能推进"的天然残局
// 这样的残局每一步都需要思考，而不是裸单填到底
//
// 参数：
//   minEmpties / maxEmpties: 空格数范围
//   minNonTrivialPct: 最低非裸单比例
// ==========================================
function generateStuckEndgame(solution, cages, options = {}) {
  const {
    minEmpties = 15,
    maxEmpties = 50,
    minNonTrivialPct = 0.15,
    maxAttempts = 5
  } = options;
  
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  let best = null;
  let bestScore = -1;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 从0预填开始（纯杀手）
    const emptyBoard = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
    
    const solver = new TechRaterSolver(emptyBoard, normCages);
    const result = solver.solve(500);
    
    const empties = result.remaining;
    const filled = 81 - empties;
    
    // 检查空格数是否在范围内
    if (empties < minEmpties || empties > maxEmpties) {
      // 如果空格太少（题太简单），跳过
      // 如果空格太多（题太难），也跳过
      continue;
    }
    
    // 计算非裸单比例
    const totalSteps = solver.steps.length;
    const nonTrivial = solver.steps.filter(s => s.technique !== 'nakedSingle').length;
    const nonTrivialPct = totalSteps > 0 ? nonTrivial / totalSteps : 0;
    
    if (nonTrivialPct < minNonTrivialPct) continue;
    
    // 提取当前盘面（卡壳状态）
    const board = solver.grid.map(row => [...row]);
    
    // 验证唯一解
    const valid = validatePuzzle(board, cages, solution);
    if (!valid.ok) continue;
    
    // 计算质量分数
    const score = nonTrivialPct * 100 + (empties < 30 ? (30 - empties) * 0.5 : 0);
    
    if (score > bestScore) {
      bestScore = score;
      best = {
        board,
        givenCount: filled,
        empties,
        rating: solver.getRating(),
        nonTrivialPct,
        stuckStep: totalSteps
      };
    }
  }
  
  return best;
}

// ==========================================
// 4. 题目分类
// ==========================================
function classifyPuzzle(board, rating) {
  const givens = board.flat().filter(v => v > 0).length;
  const maxLevel = rating.maxTechLevel || 0;
  
  // 按预填数分类
  if (givens === 0) {
    // 纯杀手，按技巧等级细分
    if (maxLevel <= 2) return 'pure-easy';
    if (maxLevel <= 4) return 'pure-medium';
    return 'pure-hard';
  }
  
  if (givens <= 10) return 'light';
  if (givens <= 25) return 'standard';
  if (givens <= 45) return 'heavy';
  return 'endgame';
}

// ==========================================
// 5. 加载种子题库
// ==========================================
function loadSeedPuzzles(seedDir) {
  const puzzles = [];
  const files = fs.readdirSync(seedDir).filter(f => f.endsWith('.json'));
  
  for (const file of files) {
    const filePath = path.join(seedDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const list = data.puzzles || data;
      
      for (const p of list) {
        const board = p.boardData || p.board || p.grid;
        const cages = p.cages;
        const solution = p.solution;
        
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
          solution,
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
// 6. 处理单道种子题
// ==========================================
function processSeedPuzzle(seed, options = {}) {
  const {
    variantsPerSeed = 10,
    generateStuckEndgames = true,
    endgamesPerSeed = 2
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
  
  // 评级
  const rating = ratePuzzle(seed.board, cageObjs);
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
      
      const vRating = ratePuzzle(v.board, vCages);
      
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
  
  // 生成卡壳点残局
  if (generateStuckEndgames && seed.givenCount === 0) {
    // 只对纯杀手题生成卡壳点残局
    for (let i = 0; i < endgamesPerSeed; i++) {
      const endgame = generateStuckEndgame(solution, cageObjs, {
        minEmpties: 15,
        maxEmpties: 50,
        minNonTrivialPct: 0.1,
        maxAttempts: 3
      });
      
      if (endgame) {
        results.endgames.push({
          id: `${seed.id}_se${i}`,
          source: 'stuck-endgame',
          parentId: seed.id,
          board: endgame.board,
          cages: seed.cages,
          solution,
          givenCount: endgame.givenCount,
          cageCount: seed.cages.length,
          targetEmpties: endgame.empties,
          nonTrivialPct: endgame.nonTrivialPct,
          stuckStep: endgame.stuckStep,
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
  }
  
  return results;
}

// ==========================================
// 7. 辅助：字符串hash
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

// ==========================================
// 8. 格式化输出
// ==========================================
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
    type: puzzle.type,
    nonTrivialPct: puzzle.nonTrivialPct,
    stuckStep: puzzle.stuckStep
  };
}

// ==========================================
// 9. 主流程
// ==========================================
function main() {
  const seedDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
  const outDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'v4');
  
  console.log('=== Killer Sudoku Pipeline v4 ===\n');
  console.log('核心原则：最低可用技巧评级 + 卡壳点残局\n');
  
  // 1. 加载种子题
  console.log('1. 加载种子题库...');
  const seeds = loadSeedPuzzles(seedDir);
  console.log(`   加载了 ${seeds.length} 道种子题`);
  
  const bySource = {};
  for (const s of seeds) bySource[s.source] = (bySource[s.source] || 0) + 1;
  console.log('   按来源: ' + JSON.stringify(bySource) + '\n');
  
  // 2. 处理
  console.log('2. 处理种子题...');
  
  const categories = {
    'pure-easy': [],
    'pure-medium': [],
    'pure-hard': [],
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
    generateStuckEndgames: true,
    endgamesPerSeed: 2
  };
  
  const startTime = Date.now();
  
  for (const seed of seeds) {
    processed++;
    const result = processSeedPuzzle(seed, options);
    
    if (result.error) {
      failed++;
      if (processed % 20 === 0 || processed === seeds.length) {
        console.log(`   [${processed}/${seeds.length}] 失败:${failed} 变体:${totalVariants} 残局:${totalEndgames}`);
      }
      continue;
    }
    
    totalVariants += result.stats.variants;
    totalEndgames += result.stats.endgames;
    
    // 收集
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
      version: '4.0',
      generatedAt: new Date().toISOString(),
      ratingSystem: 'minimum-technique',
      count: categories[type].length,
      puzzles: categories[type]
    };
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`   ${type}: ${categories[type].length} 道 → killer-${type}.json`);
  }
  
  console.log('\n✅ Pipeline v4 完成!');
}

if (require.main === module) {
  main();
}

module.exports = {
  validatePuzzle,
  ratePuzzle,
  generateStuckEndgame,
  classifyPuzzle,
  loadSeedPuzzles,
  processSeedPuzzle,
  main
};
