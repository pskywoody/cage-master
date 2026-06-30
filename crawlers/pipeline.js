// ==========================================
// Final Pipeline: Merge all puzzle sources → game-ready levels.json
// 合并所有题目来源 → 验证 → 分配难度 → 输出游戏可用的levels.json
// ==========================================

const fs = require('fs');
const path = require('path');

const SEEDS_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
const OUTPUT_FILE = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'levels-killer.json');
const FINAL_LEVELS = path.join(__dirname, '..', 'game-src', 'data', 'levels.json');

// ---- 导入求解器 ----
const { createSolver } = require('./killer-generator');

// ---- 加载所有种子 ----
function loadSeeds() {
  const all = [];
  
  // 1. 加载爬虫结果
  const crawlerFile = path.join(SEEDS_DIR, 'lmd-killer-sudoku.json');
  if (fs.existsSync(crawlerFile)) {
    const data = JSON.parse(fs.readFileSync(crawlerFile, 'utf-8'));
    for (const p of data.puzzles || []) {
      all.push({ ...p, _source: 'lmd' });
    }
    console.log(`Loaded ${data.count || 0} puzzles from LMD crawler`);
  }
  
  // 2. 加载纯杀手
  const pureFile = path.join(SEEDS_DIR, 'lmd-pure-killers.json');
  if (fs.existsSync(pureFile)) {
    const data = JSON.parse(fs.readFileSync(pureFile, 'utf-8'));
    // These are already included in lmd-killer-sudoku.json, skip
  }
  
  // 3. 加载生成的题目
  const genFile = path.join(SEEDS_DIR, 'generated-killers.json');
  if (fs.existsSync(genFile)) {
    const data = JSON.parse(fs.readFileSync(genFile, 'utf-8'));
    for (const p of data.puzzles || []) {
      all.push({ ...p, _source: 'generated' });
    }
    console.log(`Loaded ${data.count || 0} puzzles from generator`);
  }
  
  return all;
}

// ---- 验证题目 ----
function validatePuzzle(p) {
  const size = p.gridSize || 9;
  if (size !== 9) return { ok: false, reason: 'not 9x9' };
  
  const board = p.boardData || Array.from({length: size}, () => Array(size).fill(0));
  const cages = p.cages || [];
  const solution = p.solution;
  
  if (cages.length < 8) return { ok: false, reason: 'too few cages' };
  
  // 检查cage覆盖
  const covered = new Set();
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      if (r < 0 || r >= size || c < 0 || c >= size) return { ok: false, reason: 'out of bounds' };
      const key = r * size + c;
      if (covered.has(key)) return { ok: false, reason: 'cage overlap' };
      covered.add(key);
    }
  }
  if (covered.size !== size * size) return { ok: false, reason: `coverage ${covered.size}/81` };
  
  // 检查cage sum正确性
  if (solution) {
    for (const cage of cages) {
      const actual = cage.cells.reduce((s, [r,c]) => s + solution[r][c], 0);
      if (cage.sum !== actual) return { ok: false, reason: 'cage sum mismatch' };
    }
  }
  
  // 验证唯一解（用快速求解器）
  const solve = createSolver(cages);
  const t0 = Date.now();
  const result = solve(board, 2, 10000);
  const solveTime = Date.now() - t0;
  
  if (result.timeout) return { ok: false, reason: 'solve timeout' };
  if (result.count === 0) return { ok: false, reason: 'no solution' };
  if (result.count > 1) return { ok: false, reason: 'multiple solutions' };
  
  return { ok: true, solveTime };
}

// ---- 难度分配 ----
function assignDifficulty(p, solveTime) {
  // 如果已有LMD星级评分，优先使用
  if (p._source === 'lmd' && p.difficulty >= 1 && p.difficulty <= 5) {
    // LMD 1-5星映射到我们的1-5级
    return Math.min(5, p.difficulty);
  }
  
  // 生成的题目：根据笼子数量和求解时间判断
  const cages = p.cageCount || 25;
  const avgSize = 81 / cages;
  
  if (avgSize < 2.6) return 1;
  if (avgSize < 3.0) return 2;
  if (avgSize < 3.5) return 3;
  if (solveTime < 2000) return 3;
  if (solveTime < 5000) return 4;
  return 5;
}

// ---- 转换为游戏格式 ----
const DIFF_NAMES = { 1: '入门', 2: '简单', 3: '中等', 4: '困难', 5: '地狱' };

function toGameFormat(p, index) {
  const cages = p.cages.map((c, i) => ({
    id: i + 1,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  const givens = p.givens || Array.from({length:9},()=>Array(9).fill(0));
  return {
    id: index + 1,
    name: `残局 #${String(index + 1).padStart(3,'0')} · ${DIFF_NAMES[p.difficulty] || '中等'}`,
    title: p.title || `Killer Sudoku #${index + 1}`,
    author: p.author || 'Unknown',
    source: p._source || 'unknown',
    difficulty: DIFF_NAMES[p.difficulty] || '中等',
    difficultyLevel: p.difficulty || 2,
    cells: givens,
    cages: cages,
    solution: p.solution ? p.solution.map(row => [...row]) : null,
  };
}

// ---- 去重 ----
function deduplicate(puzzles) {
  const seen = new Set();
  const unique = [];
  for (const p of puzzles) {
    // 用solution的81位字符串作为指纹
    if (!p.solution) continue;
    const fp = p.solution.flat().join('') + '|' + p.cages.map(c => c.cells.map(([r,c])=>r*9+c).sort((a,b)=>a-b).join(',')).sort().join(';');
    if (seen.has(fp)) continue;
    seen.add(fp);
    unique.push(p);
  }
  return unique;
}

// ---- 主流程 ----
function main() {
  console.log('========================================');
  console.log('  Killer Sudoku Pipeline');
  console.log('========================================\n');
  
  // 1. 加载
  const seeds = loadSeeds();
  console.log(`Total raw puzzles: ${seeds.length}\n`);
  
  // 2. 验证
  console.log('Validating puzzles...');
  const valid = [];
  const rejected = [];
  for (let i = 0; i < seeds.length; i++) {
    const p = seeds[i];
    const result = validatePuzzle(p);
    if (result.ok) {
      p._solveTime = result.solveTime;
      p.difficulty = assignDifficulty(p, result.solveTime);
      valid.push(p);
      process.stdout.write(`\r[${i+1}/${seeds.length}] ✓ ${(p.title||'').substring(0,30).padEnd(30)} diff=${p.difficulty} time=${result.solveTime}ms`);
    } else {
      rejected.push({ ...p, _rejectReason: result.reason });
    }
  }
  
  console.log(`\n\nValidation: ${valid.length} valid, ${rejected.length} rejected`);
  
  // 3. 去重
  const unique = deduplicate(valid);
  console.log(`After dedup: ${unique.length} unique puzzles`);
  
  // 4. 按难度排序
  unique.sort((a, b) => {
    if (a.difficulty !== b.difficulty) return a.difficulty - b.difficulty;
    return (a._solveTime || 0) - (b._solveTime || 0);
  });
  
  // 5. 转换为游戏格式
  const levels = unique.map((p, i) => toGameFormat(p, i));
  
  // 6. 统计
  const byDiff = {};
  for (const p of unique) byDiff[p.difficulty] = (byDiff[p.difficulty] || 0) + 1;
  console.log('\nDifficulty distribution:');
  for (let d = 1; d <= 5; d++) console.log(`  Level ${d} (${'★'.repeat(d)}): ${byDiff[d] || 0}`);
  
  const bySource = {};
  for (const p of unique) bySource[p._source] = (bySource[p._source] || 0) + 1;
  console.log('\nBy source:');
  for (const [s, c] of Object.entries(bySource)) console.log(`  ${s}: ${c}`);
  
  // 7. 保存
  if (!fs.existsSync(path.dirname(OUTPUT_FILE))) fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify({
    type: 'killer-sudoku',
    count: levels.length,
    builtAt: new Date().toISOString(),
    levels
  }, null, 2));
  console.log(`\n✓ Saved ${levels.length} puzzles to ${OUTPUT_FILE}`);
  
  // 7b. 也保存游戏可直接加载的数组格式 (data/levels-killer.json)
  const GAME_KILLER_FILE = path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json');
  // 输出数组格式，每个元素有 id/name/difficulty/cells/cages
  const gameFormat = levels.map(l => ({
    id: l.id,
    name: l.name,
    difficulty: l.difficulty,
    difficultyLevel: l.difficultyLevel,
    cells: l.cells,
    cages: l.cages,
    source: l.source,
    author: l.author,
  }));
  fs.writeFileSync(GAME_KILLER_FILE, JSON.stringify(gameFormat, null, 2));
  console.log(`✓ Saved game-ready format to ${GAME_KILLER_FILE}`);
  
  // 8. 也输出rejection统计
  const rejectReasons = {};
  for (const r of rejected) rejectReasons[r._rejectReason] = (rejectReasons[r._rejectReason] || 0) + 1;
  console.log('\nRejection reasons:');
  for (const [reason, count] of Object.entries(rejectReasons).sort((a,b)=>b[1]-a[1])) {
    console.log(`  ${reason}: ${count}`);
  }
  
  return { levels, rejected, byDiff };
}

const result = main();
