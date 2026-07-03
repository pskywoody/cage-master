// ==========================================
// Killer Sudoku 完整 Pipeline v3
// ==========================================
// 流程：种子题 → 验证 → 筛选分级 → 变体扩充 → 残局生成 → 入库
//
// 输入：种子题库（LMD爬取/手工制作/生成）
// 输出：分级题库 + 残局题库
// ==========================================

const fs = require('fs');
const path = require('path');
const { createSolver, getCageCombos } = require('./killer-generator');
const { HumanSimulator } = require('../node-script/human-simulator.js');
const { transformPuzzle, generateVariants } = require('./variant-engine.js');

const SIZE = 9;
const BOX = 3;

// ==========================================
// 1. 验证题目
// ==========================================
function validatePuzzle(board, cages, expectedSolution = null) {
  const solve = createSolver(cages);
  const result = solve(board, 2, 5000); // 5秒超时
  
  if (result.timeout) {
    return { ok: false, reason: 'timeout' };
  }
  
  if (result.count === 0) {
    return { ok: false, reason: 'no solution' };
  }
  
  if (result.count > 1) {
    return { ok: false, reason: 'multiple solutions' };
  }
  
  // 验证笼子和值是否正确
  for (const cage of cages) {
    let sum = 0;
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      const v = result.solutions[0][r][c];
      sum += v;
      if (nums.has(v)) {
        return { ok: false, reason: `cage ${cage.id} has duplicate ${v}` };
      }
      nums.add(v);
    }
    if (sum !== cage.sum) {
      return { ok: false, reason: `cage ${cage.id} sum mismatch: ${sum} vs ${cage.sum}` };
    }
  }
  
  // 如果有期望解，验证是否匹配
  if (expectedSolution) {
    const sol = result.solutions[0];
    let match = true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (sol[r][c] !== expectedSolution[r][c]) {
          match = false;
          break;
        }
      }
      if (!match) break;
    }
    if (!match) {
      return { ok: false, reason: 'solution mismatch' };
    }
  }
  
  return { ok: true, solution: result.solutions[0] };
}

// ==========================================
// 2. 难度评级（基于HumanSimulator）
// ==========================================
function ratePuzzle(board, cages) {
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  const sim = new HumanSimulator(board, normCages);
  const result = sim.solve(500); // 最多500步
  const rating = sim.getDifficultyRating();
  
  return {
    solvable: result.complete,
    level: rating.level,
    score: rating.score,
    emptyCells: rating.emptyCells,
    steps: sim.steps.length,
    techniques: {
      nakedSingle: rating.techniques.nakedSingle || 0,
      hiddenSingle: rating.techniques.hiddenSingle || 0,
      nakedPair: rating.techniques.nakedPair || 0,
      hiddenPair: rating.techniques.hiddenPair || 0,
      pointingClaiming: rating.techniques.pointingClaiming || 0,
      rule45: rating.techniques.rule45 || 0,
      elimination: rating.techniques.elimination || 0
    }
  };
}

// ==========================================
// 3. 挖洞（从完整解生成题目）
// ==========================================
function digToTarget(solution, cages, targetGivens) {
  const solve = createSolver(cages);
  const board = solution.map(row => [...row]);
  let givens = SIZE * SIZE;
  
  // 收集所有位置，随机打乱
  const positions = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      positions.push([r, c]);
    }
  }
  
  for (let i = positions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  
  // 逐个挖掉
  for (const [r, c] of positions) {
    if (givens <= targetGivens) break;
    
    const saved = board[r][c];
    board[r][c] = 0;
    
    const result = solve(board, 2, 1000);
    if (result.count === 1) {
      givens--;
    } else {
      board[r][c] = saved;
    }
  }
  
  return { board, givens };
}

// ==========================================
// 4. 残局生成
// ==========================================
function generateEndgame(solution, cages, targetEmpties) {
  const solve = createSolver(cages);
  
  let best = null;
  let bestScore = 0;
  const maxAttempts = 30;
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const targetGivens = 81 - targetEmpties + Math.floor(Math.random() * 5) - 2;
    const { board, givens } = digToTarget(solution, cages, targetGivens);
    const empties = 81 - givens;
    
    if (empties < 8 || empties > 20) continue;
    
    const valid = validatePuzzle(board, cages, solution);
    if (!valid.ok) continue;
    
    const rating = ratePuzzle(board, cages);
    if (!rating.solvable) continue;
    
    // 计算质量分数
    const techs = rating.techniques;
    const nonTrivial = techs.hiddenSingle + techs.nakedPair + techs.hiddenPair + 
      techs.pointingClaiming + techs.rule45;
    
    // 质量 = 非平凡技巧数 + 难度分数加权
    const qualityScore = nonTrivial * 2 + rating.score * 0.1;
    
    if (qualityScore > bestScore) {
      bestScore = qualityScore;
      best = { board, givens, empties, rating, qualityScore };
    }
    
    if (qualityScore >= 30) break;
  }
  
  if (best) {
    return { board: best.board, givens: best.givens, empties: best.empties, rating: best.rating };
  }
  return null;
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
          cageCount: cages.length,
          isPure: p.isPure !== undefined ? p.isPure : (p.coverage >= 78 || cages.length > 20)
        });
      }
    } catch (e) {
      console.error(`加载 ${file} 失败:`, e.message);
    }
  }
  
  return puzzles;
}

// ==========================================
// 6. 处理单道种子题：验证 + 评级 + 生成变体 + 生成残局
// ==========================================
function processSeedPuzzle(seed, options = {}) {
  const { 
    variantsPerSeed = 20, 
    generateEndgames = true,
    endgamesPerSeed = 5
  } = options;
  
  const results = {
    seed: null,
    variants: [],
    endgames: [],
    stats: {
      validated: 0,
      failed: 0,
      variantsGenerated: 0,
      endgamesGenerated: 0
    }
  };
  
  // 1. 验证种子题
  const cageObjs = seed.cages.map((c, i) => ({ id: i + 1, sum: c.sum, cells: c.cells }));
  const valid = validatePuzzle(seed.board, cageObjs, seed.solution);
  
  if (!valid.ok) {
    results.stats.failed++;
    return { ...results, error: valid.reason };
  }
  
  // 如果没有solution，用验证得到的解
  const solution = seed.solution || valid.solution;
  
  // 2. 评级
  const rating = ratePuzzle(seed.board, cageObjs);
  
  const seedResult = {
    ...seed,
    solution,
    rating: {
      level: rating.level,
      score: rating.score,
      solvable: rating.solvable,
      techniques: rating.techniques
    },
    type: classifyPuzzle(seed.board, cageObjs, rating)
  };
  
  results.seed = seedResult;
  results.stats.validated++;
  
  // 3. 生成变体
  if (variantsPerSeed > 0) {
    const puzzleForVariant = {
      board: seed.board,
      cages: seed.cages,
      solution,
      id: seed.id
    };
    
    // 分批生成，避免一次性生成太多
    const batchSize = 10;
    for (let batch = 0; batch < Math.ceil(variantsPerSeed / batchSize); batch++) {
      const startIdx = batch * batchSize;
      const count = Math.min(batchSize, variantsPerSeed - startIdx);
      const seedBase = Math.abs(hashCode(seed.id)) + startIdx * 1000;
      
      const variants = generateVariants(puzzleForVariant, count, seedBase);
      
      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const vCages = v.cages.map((c, idx) => ({ id: idx + 1, sum: c.sum, cells: c.cells }));
        
        // 验证变体
        const vValid = validatePuzzle(v.board, vCages, v.solution);
        if (!vValid.ok) continue;
        
        const vRating = ratePuzzle(v.board, vCages);
        
        results.variants.push({
          id: `${seed.id}_v${startIdx + i}`,
          source: 'variant',
          parentId: seed.id,
          variantSeed: v.variantSeed,
          board: v.board,
          cages: v.cages,
          solution: v.solution,
          givenCount: v.board.flat().filter(x => x > 0).length,
          cageCount: v.cages.length,
          isPure: seed.isPure,
          rating: {
            level: vRating.level,
            score: vRating.score,
            solvable: vRating.solvable,
            techniques: vRating.techniques
          },
          type: classifyPuzzle(v.board, vCages, vRating)
        });
        
        results.stats.variantsGenerated++;
      }
    }
  }
  
  // 4. 生成残局
  if (generateEndgames && solution) {
    for (let i = 0; i < endgamesPerSeed; i++) {
      const targetEmpties = 10 + Math.floor(Math.random() * 8); // 10-17空
      const endgame = generateEndgame(solution, cageObjs, targetEmpties);
      
      if (endgame) {
        results.endgames.push({
          id: `${seed.id}_e${i}`,
          source: 'endgame',
          parentId: seed.id,
          board: endgame.board,
          cages: seed.cages,
          solution,
          givenCount: endgame.givens,
          cageCount: seed.cages.length,
          isPure: seed.isPure,
          targetEmpties,
          actualEmpties: endgame.empties,
          rating: {
            level: endgame.rating.level,
            score: endgame.rating.score,
            solvable: endgame.rating.solvable,
            techniques: endgame.rating.techniques
          },
          type: 'endgame'
        });
        
        results.stats.endgamesGenerated++;
      }
    }
  }
  
  return results;
}

// ==========================================
// 7. 题目分类
// ==========================================
function classifyPuzzle(board, cages, rating) {
  const givens = board.flat().filter(v => v > 0).length;
  
  if (givens === 0) {
    return rating.score >= 70 ? 'heavy' : 'standard';
  }
  if (givens <= 10) return 'light';
  if (givens <= 20) return 'standard';
  if (givens <= 35) return 'heavy';
  return 'endgame';
}

// ==========================================
// 8. 辅助函数：字符串hash
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
// 9. 主流程
// ==========================================
function main() {
  const seedDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
  const outDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles');
  
  console.log('=== Killer Sudoku Pipeline v3 ===\n');
  
  // 1. 加载种子题
  console.log('1. 加载种子题库...');
  const seeds = loadSeedPuzzles(seedDir);
  console.log(`   加载了 ${seeds.length} 道种子题\n`);
  
  // 2. 处理每道种子题
  console.log('2. 处理种子题（验证+评级+变体+残局）...');
  
  const allPuzzles = {
    pureKiller: [],     // 纯杀手（0预填）
    light: [],          // 轻量（1-10预填）
    standard: [],       // 标准（11-20预填）
    heavy: [],          // 重型（21-35预填）
    endgame: []         // 残局（>35预填）
  };
  
  let processed = 0;
  let totalVariants = 0;
  let totalEndgames = 0;
  
  const options = {
    variantsPerSeed: 10,    // 每道种子题生成10个变体
    generateEndgames: true,
    endgamesPerSeed: 3      // 每道种子题生成3个残局
  };
  
  for (const seed of seeds) {
    processed++;
    const result = processSeedPuzzle(seed, options);
    
    if (result.error) {
      console.log(`   [${processed}/${seeds.length}] ${seed.id}: 失败 (${result.error})`);
      continue;
    }
    
    totalVariants += result.stats.variantsGenerated;
    totalEndgames += result.stats.endgamesGenerated;
    
    // 收集种子题
    if (result.seed) {
      const type = result.seed.type;
      if (allPuzzles[type]) {
        allPuzzles[type].push(formatForOutput(result.seed));
      }
    }
    
    // 收集变体
    for (const v of result.variants) {
      const type = v.type;
      if (allPuzzles[type]) {
        allPuzzles[type].push(formatForOutput(v));
      }
    }
    
    // 收集残局
    for (const e of result.endgames) {
      allPuzzles.endgame.push(formatForOutput(e));
    }
    
    const pct = ((processed / seeds.length) * 100).toFixed(0);
    console.log(`   [${processed}/${seeds.length}] ${seed.id}: OK (变体=${result.stats.variantsGenerated}, 残局=${result.stats.endgamesGenerated}) ${pct}%`);
  }
  
  console.log(`\n3. 统计结果:`);
  console.log(`   种子题: ${seeds.length}`);
  console.log(`   变体: ${totalVariants}`);
  console.log(`   残局: ${totalEndgames}`);
  console.log(`   总计: ${seeds.length + totalVariants + totalEndgames}`);
  
  console.log(`\n   分类统计:`);
  for (const type of Object.keys(allPuzzles)) {
    console.log(`     ${type}: ${allPuzzles[type].length} 道`);
  }
  
  // 4. 保存结果
  console.log(`\n4. 保存到 ${outDir}...`);
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  
  for (const type of Object.keys(allPuzzles)) {
    const outFile = path.join(outDir, `killer-${type}.json`);
    const data = {
      version: '3.0',
      generatedAt: new Date().toISOString(),
      count: allPuzzles[type].length,
      puzzles: allPuzzles[type]
    };
    fs.writeFileSync(outFile, JSON.stringify(data, null, 2));
    console.log(`   ${type}: ${allPuzzles[type].length} 道 → killer-${type}.json`);
  }
  
  console.log('\n✅ Pipeline 完成!');
}

// ==========================================
// 格式化输出（精简字段）
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
    isPure: puzzle.isPure,
    difficulty: puzzle.rating?.level || 'unknown',
    difficultyScore: puzzle.rating?.score || 0,
    solvable: puzzle.rating?.solvable || false,
    techniques: puzzle.rating?.techniques || {},
    type: puzzle.type
  };
}

// 直接运行
if (require.main === module) {
  main();
}

module.exports = {
  validatePuzzle,
  ratePuzzle,
  digToTarget,
  generateEndgame,
  loadSeedPuzzles,
  processSeedPuzzle,
  classifyPuzzle,
  main
};
