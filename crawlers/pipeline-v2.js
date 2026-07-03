// ==========================================
// Pipeline v2 - 挖洞法生成不同类型题目
// 
// 思路：
// 1. 从现有种子题出发（已有唯一解）
// 2. 从solution出发，通过"挖洞"（减少预填）或"填洞"（增加预填）生成不同类型
// 3. 每一步都验证唯一解
// 4. 用HumanSimulator评级
// ==========================================

const fs = require('fs');
const path = require('path');

const SEEDS_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds');
const OUTPUT_DIR = path.join(__dirname, '..', 'game-src', 'data', 'puzzles');
const GAME_FILE = path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json');

const { createSolver } = require('./killer-generator');
const { HumanSimulator } = require('../node-script/human-simulator.js');

const SIZE = 9;

// ==========================================
// 工具函数
// ==========================================

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 从完整解出发，挖洞到目标预填数（确保唯一解）
function digToTarget(solution, cages, targetGivens) {
  const solve = createSolver(cages);
  
  // 从完整解开始
  const board = solution.map(row => [...row]);
  let givens = SIZE * SIZE; // 81
  
  // 随机打乱格子顺序
  const positions = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      positions.push([r, c]);
  
  const shuffled = shuffle(positions);
  
  for (const [r, c] of shuffled) {
    if (givens <= targetGivens) break;
    
    const saved = board[r][c];
    board[r][c] = 0;
    
    // 验证仍然唯一解
    const result = solve(board, 2, 2000);
    if (result.count === 1) {
      givens--;
    } else {
      // 不唯一，恢复
      board[r][c] = saved;
    }
  }
  
  return { board, givens };
}

// ==========================================
// 质量验证 + 难度评级
// ==========================================

function validatePuzzle(board, cages, solution) {
  const solve = createSolver(cages);
  const result = solve(board, 2, 5000);
  
  if (result.timeout) return { ok: false, reason: 'timeout' };
  if (result.count === 0) return { ok: false, reason: 'no solution' };
  if (result.count > 1) return { ok: false, reason: 'multiple solutions' };
  
  // 验证解匹配
  if (solution) {
    const matches = result.solutions[0].every((row, r) =>
      row.every((v, c) => v === solution[r][c])
    );
    if (!matches) return { ok: false, reason: 'solution mismatch' };
  }
  
  return { ok: true, solution: result.solutions[0] };
}

function ratePuzzle(board, cages) {
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  const sim = new HumanSimulator(board, normCages);
  const result = sim.solve(500);
  const rating = sim.getDifficultyRating();
  
  return {
    solvable: result.complete,
    score: rating.score,
    level: rating.level,
    emptyCells: rating.emptyCells,
    techniques: { ...result.techniques },
    totalSteps: result.totalSteps || 0
  };
}

// ==========================================
// 题型分类
// ==========================================

const LEVEL_TO_DIFF = { '入门': 1, '简单': 2, '中等': 3, '困难': 4, '地狱': 5 };

function getTypeByGivens(givens) {
  if (givens === 0) return 'pure';
  if (givens <= 15) return 'light';
  if (givens <= 30) return 'standard';
  if (givens <= 45) return 'heavy';
  if (givens <= 60) return 'late';
  return 'endgame';
}

const TYPE_NAMES = {
  pure: '纯杀手',
  light: '轻量题',
  standard: '标准题',
  heavy: '重残局',
  late: '后残局',
  endgame: '残局'
};

const DIFF_NAMES = { 1: '入门', 2: '简单', 3: '中等', 4: '困难', 5: '地狱' };

// ==========================================
// 残局质量检查
// ==========================================

function checkEndgameQuality(board, cages, rating) {
  const givens = board.flat().filter(v => v > 0).length;
  const empties = 81 - givens;
  
  // 1. 空格数 8~20
  if (empties < 8 || empties > 20) return false;
  
  // 2. 可解（HumanSimulator能解出来）
  if (!rating.solvable) return false;
  
  // 3. 技巧密度：非裸单技巧次数 / 空格数 >= 0.5
  const techs = rating.techniques;
  const nonNakedSingle = techs.hiddenSingle + techs.nakedPair + techs.hiddenPair + 
    techs.pointingClaiming + techs.rule45;
  const density = nonNakedSingle / empties;
  
  if (density < 0.3) return false;
  
  return true;
}

// ==========================================
// 智能生成残局（确保步步需技）
// ==========================================
// 核心思路：
// 1. 从一道中等题出发，用HumanSimulator解题，记录每一步用了什么技巧
// 2. 解题顺序：先技巧题 → 中盘技巧 → 后盘裸单
// 3. 做残局：把后盘的裸单都填上，只留下前面需要技巧的格子
// 4. 这样剩下的空格每一个都需要技巧才能填

function generateSmartEndgame(solution, cages, targetEmpties) {
  const SIZE = 9;
  const solve = createSolver(cages);
  
  const normCages = cages.map((c, i) => ({
    id: c.id !== undefined ? c.id : i,
    sum: c.sum,
    cells: c.cells.map(([r, c]) => [r, c])
  }));
  
  // 1. 先挖一道中等难度的题（22-28预填）作为起点
  const startGivens = 22 + Math.floor(Math.random() * 8);
  const startResult = digToTarget(solution, cages, startGivens);
  const startBoard = startResult.board;
  
  // 2. 用HumanSimulator解题，记录步骤
  const sim = new HumanSimulator(startBoard, normCages);
  const simResult = sim.solve(500);
  
  if (!simResult.complete || !sim.steps || sim.steps.length < 15) {
    // 解不出来，fallback
    return fallbackEndgame(solution, cages, targetEmpties, solve);
  }
  
  // 3. 分析步骤，给每个格子标"技巧等级"
  //    等级越高越难：nakedSingle(1) < elimination(2) < hiddenSingle(3) 
  //    < pointingClaiming(4) < nakedPair(5) < hiddenPair(6) < rule45(7)
  const techLevel = {
    nakedSingle: 1,
    elimination: 2,
    hiddenSingle: 3,
    pointingClaiming: 4,
    nakedPair: 5,
    hiddenPair: 6,
    rule45: 7
  };
  
  const cellTechLevel = {}; // key: r*9+c -> level
  const fillOrder = []; // 按解题顺序
  
  for (const step of sim.steps) {
    if (step.row !== undefined && step.col !== undefined) {
      const key = step.row * 9 + step.col;
      if (cellTechLevel[key] === undefined) {
        const tech = step.technique || 'nakedSingle';
        const level = techLevel[tech] || 1;
        cellTechLevel[key] = level;
        fillOrder.push([step.row, step.col, level]);
      }
    }
  }
  
  // 4. 策略：留下"难的"格子作为空格，把"简单的"都填上
  //    按难度从高到低选 targetEmpties 个格子保持空格
  //    其他都填上
  
  // 按难度排序（难的在前）
  const sortedByDifficulty = [...fillOrder].sort((a, b) => b[2] - a[2]);
  
  // 选出要留空的格子（最难的 targetEmpties 个）
  const keepEmpty = new Set();
  for (let i = 0; i < sortedByDifficulty.length && i < targetEmpties; i++) {
    const [r, c] = sortedByDifficulty[i];
    keepEmpty.add(r * 9 + c);
  }
  
  // 5. 构造残局棋盘：起点 + 填上除了keepEmpty之外的所有格子
  const board = startBoard.map(row => [...row]);
  let empties = 0;
  
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === 0 && !keepEmpty.has(r * 9 + c)) {
        board[r][c] = solution[r][c];
      }
      if (board[r][c] === 0) empties++;
    }
  }
  
  // 6. 验证唯一解
  const valid = validatePuzzle(board, cages, solution);
  
  if (valid.ok && empties >= 8 && empties <= 20) {
    const rating = ratePuzzle(board, cages);
    if (rating.solvable) {
      const techs = rating.techniques;
      const nonNaked = techs.hiddenSingle + techs.nakedPair + techs.hiddenPair + 
        techs.pointingClaiming + techs.rule45;
      const density = nonNaked / empties;
      
      if (density >= 0.3) {
        return { board, givens: 81 - empties, empties };
      }
    }
  }
  
  // 如果不理想，调整一下：多留几个或者少留几个
  for (let adjust = 1; adjust <= 5; adjust++) {
    // 试试多留几个（增加技巧密度）
    for (const extra of [adjust, -adjust]) {
      const target = targetEmpties + extra;
      if (target < 8 || target > 20) continue;
      
      const keepSet = new Set();
      for (let i = 0; i < sortedByDifficulty.length && i < target; i++) {
        const [r, c] = sortedByDifficulty[i];
        keepSet.add(r * 9 + c);
      }
      
      const b = startBoard.map(row => [...row]);
      let emp = 0;
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (b[r][c] === 0 && !keepSet.has(r * 9 + c)) {
            b[r][c] = solution[r][c];
          }
          if (b[r][c] === 0) emp++;
        }
      }
      
      const v = validatePuzzle(b, cages, solution);
      if (v.ok && emp >= 8 && emp <= 20) {
        const r = ratePuzzle(b, cages);
        if (r.solvable) {
          const t = r.techniques;
          const nonN = t.hiddenSingle + t.nakedPair + t.hiddenPair + t.pointingClaiming + t.rule45;
          const dens = nonN / emp;
          if (dens >= 0.3) {
            return { board: b, givens: 81 - emp, empties: emp };
          }
        }
      }
    }
  }
  
  // 还是不行，fallback
  return fallbackEndgame(solution, cages, targetEmpties, solve);
}

function fallbackEndgame(solution, cages, targetEmpties, solve) {
  const SIZE = 9;
  let best = null;
  let bestDensity = 0;
  
  for (let attempt = 0; attempt < 30; attempt++) {
    const targetGivens = 81 - targetEmpties + Math.floor(Math.random() * 6) - 3;
    const { board, givens } = digToTarget(solution, cages, targetGivens);
    const empties = 81 - givens;
    
    if (empties < 8 || empties > 20) continue;
    
    const valid = validatePuzzle(board, cages, solution);
    if (!valid.ok) continue;
    
    const rating = ratePuzzle(board, cages);
    if (!rating.solvable) continue;
    
    const techs = rating.techniques;
    const nonNakedSingle = techs.hiddenSingle + techs.nakedPair + techs.hiddenPair + 
      techs.pointingClaiming + techs.rule45;
    const density = nonNakedSingle / empties;
    
    if (density > bestDensity) {
      bestDensity = density;
      best = { board, givens, empties, density, rating };
    }
    
    if (density >= 0.4) break;
  }
  
  if (best && bestDensity >= 0.2) {
    return { board: best.board, givens: best.givens, empties: best.empties };
  }
  return null;
}

// ==========================================
// 主流程
// ==========================================

function main() {
  console.log('========================================');
  console.log('  Killer Sudoku Pipeline v2 (挖洞法)');
  console.log('========================================\n');

  // ---- 1. 加载种子题 ----
  console.log('[1/6] 加载种子题...');
  const seeds = [];
  
  // 加载LMD爬虫结果
  const crawlerFile = path.join(SEEDS_DIR, 'lmd-killer-sudoku.json');
  if (fs.existsSync(crawlerFile)) {
    const data = JSON.parse(fs.readFileSync(crawlerFile, 'utf-8'));
    for (const p of data.puzzles || []) {
      if (p.solution && p.cages) {
        seeds.push({
          solution: p.solution,
          cages: p.cages.map((c, i) => ({ id: i+1, sum: c.sum, cells: c.cells })),
          _source: 'lmd',
          title: p.title || 'LMD Puzzle'
        });
      }
    }
    console.log(`  LMD爬虫: ${data.puzzles?.length || 0} 道 (有效 ${seeds.length} 道)`);
  }
  
  // 加载生成器种子
  const genFile = path.join(SEEDS_DIR, 'generated-killers.json');
  let genStart = seeds.length;
  if (fs.existsSync(genFile)) {
    const data = JSON.parse(fs.readFileSync(genFile, 'utf-8'));
    for (const p of data.puzzles || []) {
      if (p.solution && p.cages) {
        seeds.push({
          solution: p.solution,
          cages: p.cages.map((c, i) => ({ id: i+1, sum: c.sum, cells: c.cells })),
          _source: 'generated',
          title: p.title || 'Generated Puzzle'
        });
      }
    }
    console.log(`  生成器种子: ${data.puzzles?.length || 0} 道 (有效 ${seeds.length - genStart} 道)`);
  }
  
  console.log(`  总计种子: ${seeds.length} 道\n`);
  
  if (seeds.length === 0) {
    console.log('  错误：没有可用的种子题！');
    return;
  }

  // ---- 2. 从每道种子题挖洞生成不同类型 ----
  console.log('[2/6] 挖洞生成不同题型...');
  
  // 目标：每类题型生成多少道
  const targets = {
    pure: 50,      // 纯杀手题
    light: 100,     // 轻量题
    standard: 150,  // 标准题
    heavy: 120,     // 重残局题
    endgame: 80     // 残局题
  };
  
  const generated = {
    pure: [],
    light: [],
    standard: [],
    heavy: [],
    endgame: []
  };
  
  // 目标预填数（取范围中间值，实际会有波动）
  const targetGivens = {
    pure: 0,
    light: 8,
    standard: 22,
    heavy: 38,
    endgame: 65
  };
  
  let totalProcessed = 0;
  
  for (let seedIdx = 0; seedIdx < seeds.length; seedIdx++) {
    const seed = seeds[seedIdx];
    const solution = seed.solution;
    const cages = seed.cages;
    
    // 检查这道种子题本身是否合法（有solution和cages）
    const v = validatePuzzle(
      Array.from({length: SIZE}, () => Array(SIZE).fill(0)),
      cages,
      solution
    );
    if (!v.ok) continue;
    
    // 对每种目标类型，尝试挖洞
    for (const [type, targetCount] of Object.entries(targets)) {
      if (generated[type].length >= targetCount) continue;
      
      const tg = targetGivens[type];
      
      let board, givens;
      
      if (type === 'endgame') {
        // 残局题：用智能挖洞
        const result = generateSmartEndgame(solution, cages, 81 - tg);
        if (!result) continue;
        board = result.board;
        givens = result.givens;
      } else {
        // 其他题：普通挖洞
        const dug = digToTarget(solution, cages, tg);
        board = dug.board;
        givens = dug.givens;
      }
      
      // 验证唯一解
      const valid = validatePuzzle(board, cages, solution);
      if (!valid.ok) continue;
      
      // 评级
      const rating = ratePuzzle(board, cages);
      
      // 对于残局题，额外检查质量
      if (type === 'endgame') {
        if (!checkEndgameQuality(board, cages, rating)) continue;
      }
      
      // 记录
      generated[type].push({
        boardData: board,
        solution,
        cages,
        givenCount: givens,
        cageCount: cages.length,
        _source: seed._source + '-dug',
        _seedIdx: seedIdx,
        _type: type,
        _rating: rating,
        _score: rating.score,
        _difficulty: LEVEL_TO_DIFF[rating.level] || 3,
        _difficultyName: rating.level,
        _solvable: rating.solvable
      });
    }
    
    totalProcessed++;
    if ((seedIdx + 1) % 10 === 0) {
      const total = Object.values(generated).reduce((s, arr) => s + arr.length, 0);
      process.stdout.write(`\r  已处理 ${seedIdx + 1}/${seeds.length} 种子题, 生成 ${total} 道`);
    }
    
    // 检查是否所有类型都达标了
    const allDone = Object.entries(targets).every(([t, c]) => generated[t].length >= c);
    if (allDone) break;
  }
  
  const totalGen = Object.values(generated).reduce((s, arr) => s + arr.length, 0);
  console.log(`\r  处理 ${totalProcessed} 道种子题，生成 ${totalGen} 道新题\n`);
  
  // 输出生成情况
  console.log('  各题型生成情况:');
  for (const [type, list] of Object.entries(generated)) {
    const target = targets[type];
    // 按难度分布
    const byDiff = {};
    for (const p of list) {
      const d = p._difficultyName || '中等';
      byDiff[d] = (byDiff[d] || 0) + 1;
    }
    const diffStr = Object.entries(byDiff)
      .sort((a, b) => (LEVEL_TO_DIFF[a[0]] || 3) - (LEVEL_TO_DIFF[b[0]] || 3))
      .map(([d, c]) => `${d}${c}`)
      .join(' ');
    console.log(`    ${TYPE_NAMES[type]}: ${list.length}/${target} (${diffStr})`);
  }
  console.log('');

  // ---- 3. 合并所有题目 ----
  console.log('[3/6] 合并 + 去重...');
  
  const allPuzzles = [];
  for (const list of Object.values(generated)) {
    allPuzzles.push(...list);
  }
  
  // 去重（基于solution + cages指纹）
  const seen = new Set();
  const unique = [];
  for (const p of allPuzzles) {
    const fp = p.solution.flat().join('') + '|' + 
      p.cages.map(c => c.cells.map(([r,c]) => r * 9 + c).sort((a,b) => a - b).join(',')).sort().join(';');
    if (seen.has(fp)) continue;
    seen.add(fp);
    unique.push(p);
  }
  console.log(`  去重后: ${unique.length} 道\n`);

  // ---- 4. 按题型 + 难度排序 ----
  console.log('[4/6] 分类排序...');
  
  const typeOrder = ['pure', 'light', 'standard', 'heavy', 'endgame'];
  unique.sort((a, b) => {
    const ta = typeOrder.indexOf(a._type || 'standard');
    const tb = typeOrder.indexOf(b._type || 'standard');
    if (ta !== tb) return ta - tb;
    return (a._score || 0) - (b._score || 0);
  });

  // ---- 5. 输出游戏格式 ----
  console.log('[5/6] 输出游戏格式...');
  
  const typeCounters = {};
  for (const t of typeOrder) typeCounters[t] = 0;
  
  const levels = unique.map((p, i) => {
    const type = p._type || 'standard';
    typeCounters[type]++;
    const typeName = TYPE_NAMES[type] || '标准题';
    const typeNum = typeCounters[type];
    
    return {
      id: i + 1,
      name: `${typeName} #${String(typeNum).padStart(3, '0')} · ${p._difficultyName || '中等'}`,
      title: `${typeName} #${typeNum}`,
      author: 'Generator',
      source: p._source || 'generated',
      difficulty: p._difficultyName || '中等',
      difficultyLevel: p._difficulty || 3,
      type: type,
      typeName: typeName,
      cells: p.boardData,
      cages: p.cages.map((c, i) => ({ id: i+1, sum: c.sum, cells: c.cells })),
      solution: p.solution.map(row => [...row]),
      givenCount: p.givenCount || 0,
      cageCount: p.cageCount || 0,
      score: p._score || 0
    };
  });
  
  // 保存完整格式
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  
  const fullOutput = {
    type: 'killer-sudoku',
    count: levels.length,
    builtAt: new Date().toISOString(),
    pipeline: 'v2-dug',
    levels
  };
  
  fs.writeFileSync(path.join(OUTPUT_DIR, 'levels-killer.json'), JSON.stringify(fullOutput, null, 2));
  console.log(`  完整格式: ${OUTPUT_DIR}/levels-killer.json`);
  
  // 保存游戏格式
  const gameFormat = levels.map(l => ({
    id: l.id,
    name: l.name,
    title: l.title,
    difficulty: l.difficulty,
    difficultyLevel: l.difficultyLevel,
    type: l.type,
    typeName: l.typeName,
    cells: l.cells,
    cages: l.cages,
    source: l.source,
    author: l.author,
    givenCount: l.givenCount,
    cageCount: l.cageCount,
    score: l.score
  }));
  
  fs.writeFileSync(GAME_FILE, JSON.stringify(gameFormat, null, 2));
  console.log(`  游戏格式: ${GAME_FILE}`);
  console.log(`  总计: ${levels.length} 道题\n`);

  // ---- 6. 统计汇总 ----
  console.log('[6/6] 统计汇总...');
  
  const byType = {};
  for (const l of levels) {
    if (!byType[l.type]) byType[l.type] = [];
    byType[l.type].push(l);
  }
  
  console.log('\n  最终题库分布:');
  console.log('  ' + '─'.repeat(60));
  console.log('  题型        数量   入门  简单  中等  困难  地狱');
  console.log('  ' + '─'.repeat(60));
  
  let total = 0;
  for (const type of typeOrder) {
    const list = byType[type] || [];
    const byDiff = [0, 0, 0, 0, 0];
    for (const l of list) {
      byDiff[l.difficultyLevel - 1]++;
    }
    total += list.length;
    console.log(`  ${(TYPE_NAMES[type]||type).padEnd(10)}  ${String(list.length).padEnd(4)}   ` +
      byDiff.map((c, i) => String(c).padEnd(4 + (i===0?0:0))).join('  '));
  }
  console.log('  ' + '─'.repeat(60));
  console.log(`  总计        ${total}`);
  
  console.log('\n========================================');
  console.log('  完成！');
  console.log('========================================');
  
  return { levels, byType };
}

if (require.main === module) {
  main();
}

module.exports = {
  digToTarget,
  generateSmartEndgame,
  validatePuzzle,
  ratePuzzle,
  getTypeByGivens,
  checkEndgameQuality,
  main
};
