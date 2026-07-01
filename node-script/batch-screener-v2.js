// ==========================================
// 批量筛选脚本 v2：高质量杀手数独生成
// 流程：生成完整解 → 分笼子（无单格笼）→ 挖洞法减初始数字（保唯一解）→ 写入
// ==========================================
const fs = require('fs');
const path = require('path');
const { KillerSudokuSolver } = require('./solver-rater.js');

const OUTPUT_PATH = path.join(__dirname, '..', 'game-src', 'data', 'levels.json');
const BACKUP_PATH = path.join(__dirname, '..', 'game-src', 'data', 'levels.backup.json');

const TARGET_PER_DIFF = 100;
const DEBUG = false;

// 改进后的难度配置：更合理的提示数范围，禁止单格笼（单格笼直接暴露数字，太简单）
const DIFFICULTY_CONFIG = {
  '简单': { minSize: 1, maxSize: 3, namePrefix: '档案', givensMin: 30, givensMax: 38, singleCellMax: 6 },
  '中等': { minSize: 2, maxSize: 4, namePrefix: '卷宗', givensMin: 16, givensMax: 26, singleCellMax: 0 },
  '困难': { minSize: 2, maxSize: 5, namePrefix: '密令', givensMin: 6, givensMax: 16, singleCellMax: 0 }
};

// ==========================================
// 工具函数
// ==========================================
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function cloneGrid(g) { return g.map(r => r.slice()); }

// ==========================================
// 第一步：生成完整数独解
// ==========================================
function isValidPlacement(grid, r, c, num) {
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === num) return false;
    if (grid[i][c] === num) return false;
  }
  const boxR = Math.floor(r / 3) * 3, boxC = Math.floor(c / 3) * 3;
  for (let i = boxR; i < boxR + 3; i++)
    for (let j = boxC; j < boxC + 3; j++)
      if (grid[i][j] === num) return false;
  return true;
}

function fillGrid(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const nums = shuffle([1,2,3,4,5,6,7,8,9]);
        for (const num of nums) {
          if (isValidPlacement(grid, r, c, num)) {
            grid[r][c] = num;
            if (fillGrid(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function generateSolution() {
  const grid = Array.from({length:9}, () => Array(9).fill(0));
  fillGrid(grid);
  return grid;
}

// ==========================================
// 第二步：分笼子（改进版：控制单格笼数量）
// ==========================================
function generateCages(solution, config) {
  const assigned = Array.from({length:9}, () => Array(9).fill(false));
  const cages = [];
  let cageId = 1;
  let singleCellCount = 0;

  const allCells = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      allCells.push([r, c]);
  const seedOrder = shuffle(allCells);

  for (const [sr, sc] of seedOrder) {
    if (assigned[sr][sc]) continue;

    // 控制单格笼数量
    let minSize = config.minSize;
    if (singleCellCount >= config.singleCellMax) {
      minSize = Math.max(minSize, 2);
    }

    let targetSize = randInt(minSize, config.maxSize);
    // 检查剩余格子数，避免最后剩下1个无法分配
    const remaining = 81 - cages.reduce((s, c) => s + c.cells.length, 0) - 1;
    if (remaining < targetSize) targetSize = remaining;
    if (targetSize < 1) targetSize = 1;

    const cageCells = [[sr, sc]];
    const cageNums = new Set([solution[sr][sc]]);
    assigned[sr][sc] = true;

    while (cageCells.length < targetSize) {
      const candidates = [];
      const safeCandidates = [];
      for (const [cr, cc] of cageCells) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !assigned[nr][nc]) {
            if (!candidates.some(x => x[0] === nr && x[1] === nc)) {
              candidates.push([nr, nc]);
              if (!cageNums.has(solution[nr][nc])) {
                safeCandidates.push([nr, nc]);
              }
            }
          }
        }
      }
      if (candidates.length === 0) break;
      const pool = safeCandidates.length > 0 ? safeCandidates : candidates;
      const pick = pool[randInt(0, pool.length - 1)];
      cageCells.push(pick);
      cageNums.add(solution[pick[0]][pick[1]]);
      assigned[pick[0]][pick[1]] = true;
    }

    if (cageCells.length === 1) singleCellCount++;

    cageCells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const sum = cageCells.reduce((s, [r, c]) => s + solution[r][c], 0);
    cages.push({ id: cageId, sum, cells: cageCells });
    cageId++;
  }

  return cages;
}

function validateCages(solution, cages) {
  const cellMap = new Map();
  let total = 0;
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      const key = `${r},${c}`;
      if (cellMap.has(key)) return false;
      cellMap.set(key, cage.id);
      total++;
    }
  }
  if (total !== 81) return false;
  for (const cage of cages) {
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      if (nums.has(solution[r][c])) return false;
      nums.add(solution[r][c]);
    }
  }
  return true;
}

// ==========================================
// 第三步：挖洞法生成初始盘面（保唯一解）
// 从满盘开始，逐个挖去数字，每挖一个就检查唯一解
// ==========================================
function digGivens(solution, cages, targetMin, targetMax) {
  const target = randInt(targetMin, targetMax);
  
  // 从全满开始
  const grid = cloneGrid(solution);
  
  // 随机排列挖洞顺序
  const positions = shuffle(
    Array.from({length:81}, (_, i) => [Math.floor(i/9), i%9])
  );

  let givensCount = 81;
  
  for (const [r, c] of positions) {
    if (givensCount <= target) break;
    
    // 尝试挖掉这个格子
    const backup = grid[r][c];
    grid[r][c] = 0;
    
    // 快速检查唯一解
    const testGrid = cloneGrid(grid);
    const solver = new KillerSudokuSolver(testGrid, cages);
    solver.solve(2);
    
    if (solver.solutions.length === 1) {
      // 挖洞成功，保持唯一解
      givensCount--;
    } else {
      // 挖洞后多解，恢复
      grid[r][c] = backup;
    }
  }

  // 统计实际givens
  let actualGivens = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] !== 0) actualGivens++;

  return { givensGrid: grid, actualGivens };
}

// ==========================================
// 第四步：生成一道完整题目
// ==========================================
function generateOnePuzzle(config) {
  const solution = generateSolution();

  // 分笼子
  let cages;
  let cageAttempts = 200;
  do {
    cages = generateCages(solution, config);
    cageAttempts--;
  } while (!validateCages(solution, cages) && cageAttempts > 0);

  if (cageAttempts <= 0) return null;

  // 挖洞法生成初始数字
  const result = digGivens(solution, cages, config.givensMin, config.givensMax);
  
  if (result.actualGivens < config.givensMin - 3) return null;

  // 最终唯一解验证
  const verifyGrid = cloneGrid(result.givensGrid);
  const verifier = new KillerSudokuSolver(verifyGrid, cages);
  verifier.solve(2);
  if (verifier.solutions.length !== 1) return null;

  return {
    givensGrid: result.givensGrid,
    cages,
    actualGivens: result.actualGivens,
    fullSolution: solution
  };
}

// ==========================================
// 主流程
// ==========================================
async function main() {
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.copyFileSync(OUTPUT_PATH, BACKUP_PATH);
    console.log('📦 已备份现有题目到 levels.backup.json');
  }

  const allLevels = [];
  let totalAttempts = 0;
  let idCounter = 1;
  const startTime = Date.now();

  for (const [diffLabel, config] of Object.entries(DIFFICULTY_CONFIG)) {
    console.log(`\n🎯 难度：${diffLabel}`);
    console.log(`   笼子大小：${config.minSize}-${config.maxSize} 格（单格笼上限：${config.singleCellMax}）`);
    console.log(`   初始数字：${config.givensMin}-${config.givensMax} 个`);

    const collected = [];
    const maxAttempts = TARGET_PER_DIFF * 50;
    let attempts = 0;
    let lastReport = Date.now();

    while (collected.length < TARGET_PER_DIFF && attempts < maxAttempts) {
      attempts++;
      totalAttempts++;

      if (attempts % 50 === 0) {
        const elapsed = ((Date.now() - lastReport) / 1000).toFixed(1);
        process.stderr.write(`   [${diffLabel}] 尝试 ${attempts} 次，已收集 ${collected.length}/${TARGET_PER_DIFF} (${elapsed}s)...\n`);
        lastReport = Date.now();
      }

      const puzzle = generateOnePuzzle(config);
      if (!puzzle) continue;

      collected.push({
        id: idCounter++,
        name: `${config.namePrefix} #${String(collected.length + 1).padStart(2, '0')} · ${diffLabel}`,
        difficulty: diffLabel,
        cells: puzzle.givensGrid,
        cages: puzzle.cages
      });

      if (DEBUG) console.log(`   ✅ #${collected.length}: ${puzzle.actualGivens} givens, ${puzzle.cages.length} cages`);
    }

    console.log(`   ✅ ${diffLabel}：成功 ${collected.length} 道（尝试 ${attempts} 次）`);
    allLevels.push(...collected);
  }

  allLevels.sort((a, b) => a.id - b.id);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allLevels, null, 2), 'utf-8');
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n💾 已写入 ${OUTPUT_PATH}（耗时 ${elapsed}s）`);

  // 最终验证
  console.log(`\n🔍 最终验证：`);
  let passCount = 0;
  let failCount = 0;
  const diffStats = {};

  for (const level of allLevels) {
    const grid = cloneGrid(level.cells);
    const solver = new KillerSudokuSolver(grid, level.cages);
    solver.solve(2);

    const givens = level.cells.flat().filter(v => v !== 0).length;
    if (!diffStats[level.difficulty]) {
      diffStats[level.difficulty] = { count: 0, minG: 81, maxG: 0, sumG: 0, cages: 0 };
    }
    diffStats[level.difficulty].count++;
    diffStats[level.difficulty].minG = Math.min(diffStats[level.difficulty].minG, givens);
    diffStats[level.difficulty].maxG = Math.max(diffStats[level.difficulty].maxG, givens);
    diffStats[level.difficulty].sumG += givens;
    diffStats[level.difficulty].cages += level.cages.length;

    if (solver.solutions.length === 1) {
      passCount++;
    } else {
      failCount++;
      console.log(`   ❌ 关卡 ${level.id}「${level.name}」验证失败（${solver.solutions.length}个解）`);
    }
  }

  for (const [diff, stats] of Object.entries(diffStats)) {
    const avgG = (stats.sumG / stats.count).toFixed(1);
    const avgCages = (stats.cages / stats.count).toFixed(1);
    console.log(`   ${diff}: ${stats.count}题, 提示数 ${stats.minG}-${stats.maxG}(均${avgG}), 笼数均${avgCages}`);
  }

  console.log(`\n   通过：${passCount} / ${allLevels.length}`);
  if (failCount === 0) {
    console.log('🎉 全部通过！');
  } else {
    console.log(`❌ ${failCount} 道题有问题！`);
  }
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => {
    console.error('❌ 失败：', e);
    process.exit(1);
  });
}

module.exports = { generateOnePuzzle, DIFFICULTY_CONFIG };
