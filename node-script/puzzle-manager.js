// ==========================================
// 杀手数独题目生成器
// 用法：node puzzle-manager.js [难度] [数量] [模式]
// 难度：简单(默认) / 中等 / 困难
// 模式：append(追加) / replace(替换)
// 生成合法题目（解正确、笼子和值正确、笼内不重复、无重叠、唯一解）并写入 levels.json
// ==========================================

const fs = require('fs');
const path = require('path');
const { KillerSudokuSolver } = require('./solver-rater');

// ---------- 工具函数 ----------
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

// ---------- 第一步：生成合法完整数独解（回溯+随机化）----------
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

// ---------- 第二步：将81格划分为连通笼子 ----------
// 难度 → 笼子目标大小范围
// 杀手数独：笼子越小给的信息越多 → 越简单；笼子越大给的信息越少 → 越难
const DIFFICULTY_CONFIG = {
  // 简单：小笼子多，信息量大，入门友好（以显单/隐单即可解题）
  '简单': { minSize: 1, maxSize: 3, namePrefix: '档案' },
  // 中等：中等笼子，需要基础45法则
  '中等': { minSize: 2, maxSize: 3, namePrefix: '卷宗' },
  // 困难：大笼子多，信息量少，需要高级技巧
  '困难': { minSize: 3, maxSize: 4, namePrefix: '密令' }
};

function generateCages(solution, difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG['简单'];
  const assigned = Array.from({ length: 9 }, () => Array(9).fill(false));
  const cages = [];
  let cageId = 1;

  // 按随机顺序遍历所有格子作为笼子种子
  const allCells = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      allCells.push([r, c]);
    }
  }
  const seedOrder = shuffle(allCells);

  for (const [sr, sc] of seedOrder) {
    if (assigned[sr][sc]) continue;

    // 开启新笼子
    const targetSize = randInt(config.minSize, config.maxSize);
    const cageCells = [[sr, sc]];
    const cageNums = new Set([solution[sr][sc]]);
    assigned[sr][sc] = true;

    // 随机生长：从当前笼子边界向未分配的相邻格扩展
    // 优先选择不导致数字重复的邻居（提升笼内不重复的概率）
    while (cageCells.length < targetSize) {
      const candidates = [];
      const safeCandidates = []; // 不会导致数字重复的候选
      for (const [cr, cc] of cageCells) {
        const neighbors = [[cr - 1, cc], [cr + 1, cc], [cr, cc - 1], [cr, cc + 1]];
        for (const [nr, nc] of neighbors) {
          if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && !assigned[nr][nc]) {
            const key = `${nr},${nc}`;
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

      // 优先从安全候选（不重复）里选
      const pool = safeCandidates.length > 0 ? safeCandidates : candidates;
      const pick = pool[randInt(0, pool.length - 1)];
      cageCells.push(pick);
      cageNums.add(solution[pick[0]][pick[1]]);
      assigned[pick[0]][pick[1]] = true;
    }

    // 按行列排序，使坐标有序输出
    cageCells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    // 计算笼子和值
    const sum = cageCells.reduce((s, [r, c]) => s + solution[r][c], 0);
    cages.push({ id: cageId, sum, cells: cageCells });
    cageId++;
  }

  return cages;
}

// ---------- 第三步：组装完整关卡对象 ----------
function generateLevel(id, difficulty) {
  const solution = generateSolution();
  const cages = generateCages(solution, difficulty);

  // 题面 cells 全部为 0（玩家需要自行推导填入）
  const cells = Array.from({ length: 9 }, () => Array(9).fill(0));

  const config = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG['简单'];
  const name = `${config.namePrefix} #${String(id).padStart(2, '0')} · ${difficulty}`;

  return { id, name, difficulty, cells, cages, _solution: solution };
}

// ---------- 第四步：校验生成题目合法性 ----------
function validateLevel(level, options = {}) {
  const { checkUnique = true } = options;
  const errors = [];

  // 1. 所有格子恰好归属一个笼子（无重叠、无遗漏）
  const cellMap = new Map();
  let totalCells = 0;
  for (const cage of level.cages) {
    for (const [r, c] of cage.cells) {
      const key = `${r},${c}`;
      if (cellMap.has(key)) {
        errors.push(`笼子重叠：[${r},${c}] 出现在 cage${cellMap.get(key)} 和 cage${cage.id}`);
      }
      cellMap.set(key, cage.id);
      totalCells++;
    }
  }
  if (totalCells !== 81) {
    errors.push(`笼子未覆盖全部81格：实际覆盖 ${totalCells} 格`);
  }

  // 2. 每个笼子大小不超过9（因为1-9不能重复）
  for (const cage of level.cages) {
    if (cage.cells.length > 9) {
      errors.push(`笼子 ${cage.id} 超过9格（${cage.cells.length}格）`);
    }
  }

  // 3. 笼内数字不重复校验
  // 如果有 _solution 就用它校验，否则跳过（只有生成器内部才有 _solution）
  if (level._solution) {
    for (const cage of level.cages) {
      const nums = new Set();
      for (const [r, c] of cage.cells) {
        const val = level._solution[r][c];
        if (nums.has(val)) {
          errors.push(`笼子 ${cage.id} 内数字重复：${val} 出现多次`);
          break;
        }
        nums.add(val);
      }
    }
  }

  // 如果有基本错误，直接返回，不用求解器了
  if (errors.length > 0) {
    return { valid: false, errors, unique: false };
  }

  // 4. 单解验证（用回溯求解器）
  if (checkUnique) {
    const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
    const solver = new KillerSudokuSolver(grid, level.cages);
    solver.solve(2); // 找2个解，找到第2个就停止
    const result = solver.getResult();
    if (!result.solved) {
      errors.push('题目无解');
      return { valid: false, errors, unique: false };
    }
    if (!result.unique) {
      errors.push('题目有多解');
      return { valid: true, errors, unique: false, solution: result.solution };
    }
    return { valid: true, errors: [], unique: true, solution: result.solution };
  }

  return { valid: true, errors, unique: null };
}

// ---------- 第五步：写入 levels.json ----------
function writeToLevels(newLevels, mode) {
  const filePath = path.join(__dirname, '..', 'game-src', 'data', 'levels.json');

  let existing = [];
  if (mode === 'append') {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      existing = JSON.parse(raw);
    } catch (e) {
      existing = [];
    }
  }

  // 追加模式：自动递增 id
  let nextId = existing.length > 0 ? Math.max(...existing.map(l => l.id)) + 1 : 1;
  const toAdd = newLevels.map((lvl, i) => {
    // 去掉内部字段 _solution
    const { _solution, ...clean } = lvl;
    return { ...clean, id: nextId + i };
  });

  const merged = [...existing, ...toAdd];
  fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
  console.log(`✅ 已写入 ${toAdd.length} 关到 levels.json（当前共 ${merged.length} 关）`);
  return toAdd;
}

// ---------- CLI 入口 ----------
function main() {
  const args = process.argv.slice(2);
  const difficulty = args[0] || '简单';
  const count = parseInt(args[1]) || 1;
  const mode = args[2] || 'append'; // append | replace

  if (!DIFFICULTY_CONFIG[difficulty]) {
    console.error(`❌ 未知难度：${difficulty}，可选：简单 / 中等 / 困难`);
    process.exit(1);
  }

  console.log(`🎲 开始生成 ${count} 道「${difficulty}」难度题目...`);
  console.log(`   校验标准：笼内不重复 + 覆盖81格 + 唯一解\n`);

  const levels = [];
  let totalAttempts = 0;

  for (let i = 0; i < count; i++) {
    let level;
    let result;
    let attempts = 0;
    const maxAttempts = 200;

    // 重试直到生成合法且单解的题目
    do {
      level = generateLevel(i + 1, difficulty);
      result = validateLevel(level, { checkUnique: true });
      attempts++;
      totalAttempts++;
    } while ((!result.valid || !result.unique) && attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      console.error(`❌ 第 ${i + 1} 关生成失败，已重试 ${attempts} 次`);
      if (result.errors.length > 0) {
        console.error(`   最后一次错误: ${result.errors[0]}`);
      }
      continue;
    }

    // 把验证出的解存进去（供存档/提示使用，外部不可见）
    level._solution = result.solution;
    levels.push(level);

    const cageSizes = level.cages.map(c => c.cells.length);
    const avgSize = (cageSizes.reduce((a, b) => a + b, 0) / cageSizes.length).toFixed(1);
    console.log(`  ✓ 关卡 ${level.id}：「${level.name}」`);
    console.log(`     ${level.cages.length}个笼子 | 均${avgSize}格 | 尝试${attempts}次`);
  }

  if (levels.length === 0) {
    console.error('❌ 没有成功生成任何关卡');
    process.exit(1);
  }

  console.log(`\n📊 生成统计：成功 ${levels.length}/${count}，总尝试 ${totalAttempts} 次`);
  console.log(`   成功率：${((levels.length / totalAttempts) * 100).toFixed(1)}%`);

  writeToLevels(levels, mode);
}

// 导出供其他模块使用
module.exports = { generateLevel, validateLevel, generateSolution, generateCages, writeToLevels, DIFFICULTY_CONFIG };

// 直接运行时执行 CLI
if (require.main === module) {
  main();
}
