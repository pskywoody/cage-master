// ==========================================
// 批量筛选脚本：各难度各生成 100 道合法题目
// 流程：生成完整解+笼子 → 挖洞加初始数字 → 验证唯一解 → 写入
// ==========================================
const fs = require('fs');
const path = require('path');
const { KillerSudokuSolver } = require('./solver-rater.js');

// 输出文件
const OUTPUT_PATH = path.join(__dirname, '..', 'game-src', 'data', 'levels.json');
const BACKUP_PATH = path.join(__dirname, '..', 'game-src', 'data', 'levels.backup.json');

// 各难度目标数
const TARGET_PER_DIFF = 100;
const BUFFER = 20;
const DEBUG = false; // 打开调试输出

// 各难度笼子大小配置
const DIFFICULTY_CONFIG = {
  '简单': { minSize: 1, maxSize: 3, namePrefix: '档案', givensMin: 45, givensMax: 52 },
  '中等': { minSize: 2, maxSize: 3, namePrefix: '卷宗', givensMin: 32, givensMax: 38 },
  '困难': { minSize: 3, maxSize: 4, namePrefix: '密令', givensMin: 22, givensMax: 28 }
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

// ==========================================
// 第一步：生成完整数独解
// ==========================================

function isValidGrid(grid, r, c, num) {
  for (let i = 0; i < 9; i++) {
    if (grid[r][i] === num) return false;
    if (grid[i][c] === num) return false;
  }
  const boxR = Math.floor(r / 3) * 3;
  const boxC = Math.floor(c / 3) * 3;
  for (let i = boxR; i < boxR + 3; i++) {
    for (let j = boxC; j < boxC + 3; j++) {
      if (grid[i][j] === num) return false;
    }
  }
  return true;
}

function fillGrid(grid) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (grid[r][c] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const num of nums) {
          if (isValidGrid(grid, r, c, num)) {
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
  const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
  fillGrid(grid);
  return grid;
}

// ==========================================
// 第二步：分笼子
// ==========================================

function generateCages(solution, config) {
  const assigned = Array.from({ length: 9 }, () => Array(9).fill(false));
  const cages = [];
  let cageId = 1;

  const allCells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      allCells.push([r, c]);
    }
  }
  const seedOrder = shuffle(allCells);

  for (const [sr, sc] of seedOrder) {
    if (assigned[sr][sc]) continue;

    const targetSize = randInt(config.minSize, config.maxSize);
    const cageCells = [[sr, sc]];
    const cageNums = new Set([solution[sr][sc]]);
    assigned[sr][sc] = true;

    while (cageCells.length < targetSize) {
      const candidates = [];
      const safeCandidates = [];
      for (const [cr, cc] of cageCells) {
        const neighbors = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !assigned[nr][nc]) {
            if (!candidates.some(c => c[0] === nr && c[1] === nc)) {
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

    cageCells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const sum = cageCells.reduce((s, [r, c]) => s + solution[r][c], 0);
    cages.push({ id: cageId, sum, cells: cageCells });
    cageId++;
  }

  return cages;
}

// ==========================================
// 第三步：笼子合法性检查
// ==========================================

function validateCages(solution, cages) {
  // 1. 全覆盖无重叠
  const cellMap = new Map();
  let totalCells = 0;
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      const key = `${r},${c}`;
      if (cellMap.has(key)) return false;
      cellMap.set(key, cage.id);
      totalCells++;
    }
  }
  if (totalCells !== 81) return false;

  // 2. 笼内数字不重复
  for (const cage of cages) {
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      const val = solution[r][c];
      if (nums.has(val)) return false;
      nums.add(val);
    }
  }

  return true;
}

// ==========================================
// 第四步：挖洞加初始数字（保证唯一解）
// ==========================================

function checkUnique(givensGrid, cages) {
  const solver = new KillerSudokuSolver(givensGrid, cages);
  solver.solve(2);
  return solver.solutions.length === 1;
}

function addGivens(solution, cages, targetRange) {
  const target = randInt(targetRange.givensMin, targetRange.givensMax);

  // 从空盘面开始，加 target 个数字（从 solution 随机位置取）
  const givensGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
  const allPos = shuffle(
    Array.from({ length: 9 }, (_, r) =>
      Array.from({ length: 9 }, (_, c) => [r, c])
    ).flat()
  );

  let added = 0;
  for (const [r, c] of allPos) {
    if (added >= target) break;
    givensGrid[r][c] = solution[r][c];
    added++;
  }

  let actual = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (givensGrid[r][c] !== 0) actual++;

  return { givensGrid, actualGivens: actual };
}

// ==========================================
// 第五步：生成一道完整题目
// ==========================================

function generateOnePuzzle(config) {
  const solution = generateSolution();

  // 分笼子
  let cages;
  let maxCageAttempts = 100;
  do {
    cages = generateCages(solution, config);
    maxCageAttempts--;
  } while (!validateCages(solution, cages) && maxCageAttempts > 0);

  if (maxCageAttempts <= 0) {
    if (DEBUG) console.error('    ❌ 笼子生成失败（100次尝试均未通过验证）');
    return null;
  }

  // 挖洞加初始数字
  const result = addGivens(solution, cages, config);
  if (!result) return null;

  // Cage 自身唯一解 → 用全空题面，写满 0 也是合法题
  // 普通情况：初始数字不能太少
  if (result.actualGivens > 0 && result.actualGivens < config.givensMin - 10) {
    if (DEBUG) process.stderr.write('    ❌ 初始数字不足：actual=' + result.actualGivens + ' min=' + (config.givensMin - 10) + '\n');
    return null;
  }

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
  // 备份现有题目
  if (fs.existsSync(OUTPUT_PATH)) {
    fs.copyFileSync(OUTPUT_PATH, BACKUP_PATH);
    console.log('📦 已备份现有题目到 levels.backup.json');
  }

  const allLevels = [];
  let totalAttempts = 0;
  let totalGenerated = 0;
  let idCounter = 1;

  for (const [diffLabel, config] of Object.entries(DIFFICULTY_CONFIG)) {
    console.log(`\n🎯 难度：${diffLabel}`);
    console.log(`   目标：${TARGET_PER_DIFF} 道`);
    console.log(`   笼子大小：${config.minSize}-${config.maxSize} 格`);
    console.log(`   初始数字：${config.givensMin}-${config.givensMax} 个`);

    const collected = [];
    const maxAttempts = TARGET_PER_DIFF * 30; // 扩大尝试空间
    let attempts = 0;

    while (collected.length < TARGET_PER_DIFF && attempts < maxAttempts) {
      attempts++;
      totalAttempts++;

      if (attempts % 100 === 0) {
        process.stderr.write(`   已尝试 ${attempts} 次，已有 ${collected.length} 道...\n`);
      }

      const puzzle = generateOnePuzzle(config);
      if (!puzzle) continue;

      // 最终验证
      const verifyGrid = puzzle.givensGrid.map(row => row.slice());
      const verifier = new KillerSudokuSolver(verifyGrid, puzzle.cages);
      verifier.solve(2);

      if (verifier.solutions.length !== 1) continue;
      const solution = verifier.solutions[0];

      collected.push({
        id: idCounter++,
        name: `${config.namePrefix} #${String(collected.length + 1).padStart(2, '0')} · ${diffLabel}`,
        difficulty: diffLabel,
        cells: puzzle.givensGrid,
        cages: puzzle.cages
      });

      totalGenerated++;
    }

    console.log(`   ✅ ${diffLabel}：成功 ${collected.length} 道（尝试 ${attempts} 次）`);
    allLevels.push(...collected);
  }

  // 写入
  console.log(`\n📊 生成统计：`);
  console.log(`   目标：${TARGET_PER_DIFF * 3} 道`);
  console.log(`   实际：${allLevels.length} 道`);
  console.log(`   总尝试：${totalAttempts} 次`);

  // 按 id 排序
  allLevels.sort((a, b) => a.id - b.id);

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allLevels, null, 2), 'utf-8');
  console.log(`\n💾 已写入 ${OUTPUT_PATH}`);

  // 最终全面验证
  console.log(`\n🔍 最终验证：`);
  let passCount = 0;
  let failCount = 0;

  for (const level of allLevels) {
    const grid = level.cells.map(row => row.slice());
    const solver = new KillerSudokuSolver(grid, level.cages);
    solver.solve(2);

    if (solver.solutions.length === 1) {
      passCount++;
    } else {
      failCount++;
      console.log(`   ❌ 关卡 ${level.id}「${level.name}」验证失败`);
    }
  }

  console.log(`   通过：${passCount} / ${allLevels.length}`);
  if (failCount === 0) {
    console.log('🎉 全部通过！');
  } else {
    console.log(`❌ ${failCount} 道题有问题！`);
  }

  return allLevels;
}

if (require.main === module) {
  main().then(() => process.exit(0)).catch(e => {
    console.error('❌ 失败：', e);
    process.exit(1);
  });
}
