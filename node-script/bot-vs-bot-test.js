// ==========================================
// 双 Bot 自动对战测试（后端版）
// 用 HumanSimulator 独立解两遍题，验证正确性
// ==========================================
const { HumanSimulator } = require('./human-simulator.js');
const { KillerSudokuSolver } = require('./solver-rater.js');
const fs = require('fs');
const path = require('path');

const levelsPath = path.join(__dirname, '..', 'game-src', 'data', 'levels.json');
const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf-8'));

console.log('🤖 === 双 Bot 自动对战测试 ===\n');

const difficulties = { '简单': [], '中等': [], '困难': [] };
levels.forEach(l => {
  if (difficulties[l.difficulty]) difficulties[l.difficulty].push(l);
});

let totalTests = 0;
let passedTests = 0;
let failedTests = [];

for (const [diffLabel, diffLevels] of Object.entries(difficulties)) {
  console.log(`📊 ${diffLabel}（${diffLevels.length} 关）`);

  for (const level of diffLevels) {
    totalTests++;
    const levelErrors = [];

    // ===== 测试1: Bot1 解题 =====
    const sim1 = new HumanSimulator(level.cells, level.cages);
    const result1 = sim1.solve(500);

    // ===== 测试2: Bot2 解题 =====
    const sim2 = new HumanSimulator(level.cells, level.cages);
    const result2 = sim2.solve(500);

    // ===== 最终验证 =====
    // 验证最终盘面是否合法
    const v1 = validateGrid(sim1.grid, level.cages, level.cells);
    const v2 = validateGrid(sim2.grid, level.cages, level.cells);

    if (!result1.complete) {
      levelErrors.push(`Bot1 未能解完（填了 ${countFilled(sim1.grid)}/81 格）`);
      // 检查卡住原因
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (sim1.grid[r][c] === 0 && sim1.candidates[r][c].size === 0) {
            levelErrors.push(`  Bot1 在(${r},${c})候选数为空`);
          }
        }
      }
    }
    if (!result2.complete) {
      levelErrors.push(`Bot2 未能解完（填了 ${countFilled(sim2.grid)}/81 格）`);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (sim2.grid[r][c] === 0 && sim2.candidates[r][c].size === 0) {
            levelErrors.push(`  Bot2 在(${r},${c})候选数为空`);
          }
        }
      }
    }

    if (!v1.valid) levelErrors.push(`Bot1 盘面不合法：${v1.reason}`);
    if (!v2.valid) levelErrors.push(`Bot2 盘面不合法：${v2.reason}`);

    // 用 solver 验证
    if (result1.complete && v1.valid) {
      const solver1 = new KillerSudokuSolver(sim1.grid, level.cages);
      solver1.solve();
      if (solver1.solutions.length === 0) {
        levelErrors.push('Bot1 完成但 solver 认为无解（矛盾！）');
      } else {
        // 检查与最终解是否一致
        const solGrid = solver1.solutions[0];
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (sim1.grid[r][c] !== solGrid[r][c]) {
              levelErrors.push(`Bot1 在(${r},${c})填入${sim1.grid[r][c]}，但最终解为${solGrid[r][c]}`);
            }
          }
        }
      }
    }
    if (result2.complete && v2.valid) {
      const solver2 = new KillerSudokuSolver(sim2.grid, level.cages);
      solver2.solve();
      if (solver2.solutions.length === 0) {
        levelErrors.push('Bot2 完成但 solver 认为无解（矛盾！）');
      } else {
        const solGrid = solver2.solutions[0];
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (sim2.grid[r][c] !== solGrid[r][c]) {
              levelErrors.push(`Bot2 在(${r},${c})填入${sim2.grid[r][c]}，但最终解为${solGrid[r][c]}`);
            }
          }
        }
      }
    }

    // 输出
    const filled1 = countFilled(sim1.grid);
    const filled2 = countFilled(sim2.grid);
    if (levelErrors.length === 0) {
      console.log(`  ✅ [${level.id}] ${level.name} Bot1=${filled1}/81 Bot2=${filled2}/81`);
      passedTests++;
    } else {
      console.log(`  ❌ [${level.id}] ${level.name}:`);
      levelErrors.forEach(e => console.log(`     ${e}`));
      failedTests.push({ id: level.id, name: level.name, diff: diffLabel, errors: levelErrors });
    }
  }
}

console.log(`\n📋 ==== 汇总 ====`);
console.log(`总测试: ${totalTests}`);
console.log(`通过:   ${passedTests}`);
console.log(`失败:   ${failedTests.length}`);

if (failedTests.length > 0) {
  console.log(`\n❌ 失败详情:`);
  failedTests.forEach(f => {
    console.log(`  [${f.diff}] ${f.name}:`);
    f.errors.forEach(e => console.log(`    ${e}`));
  });
  process.exit(1);
} else {
  console.log('🎉 全部通过！');
}

// ==========================================
// 辅助函数
// ==========================================

function countFilled(grid) {
  let n = 0;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] !== 0) n++;
  return n;
}

function validateGrid(grid, cages, initialCells) {
  // 行列宫唯一性
  for (let r = 0; r < 9; r++) {
    const nums = [];
    for (let c = 0; c < 9; c++) if (grid[r][c] !== 0) nums.push(grid[r][c]);
    if (new Set(nums).size !== nums.length)
      return { valid: false, reason: `行${r+1}重复: [${nums.join(',')}]` };
  }
  for (let c = 0; c < 9; c++) {
    const nums = [];
    for (let r = 0; r < 9; r++) if (grid[r][c] !== 0) nums.push(grid[r][c]);
    if (new Set(nums).size !== nums.length)
      return { valid: false, reason: `列${c+1}重复` };
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const nums = [];
      for (let r = br*3; r < br*3+3; r++)
        for (let c = bc*3; c < bc*3+3; c++)
          if (grid[r][c] !== 0) nums.push(grid[r][c]);
      if (new Set(nums).size !== nums.length)
        return { valid: false, reason: `宫(${br+1},${bc+1})重复` };
    }
  }

  // 笼子
  for (const cage of cages) {
    let sum = 0;
    let count = 0;
    const nums = [];
    for (const [r, c] of cage.cells) {
      if (grid[r][c] !== 0) { sum += grid[r][c]; count++; nums.push(grid[r][c]); }
    }
    if (new Set(nums).size !== nums.length)
      return { valid: false, reason: `笼#${cage.id}数字重复: [${nums.join(',')}]` };
    if (count === cage.cells.length && sum !== cage.sum)
      return { valid: false, reason: `笼#${cage.id}和值错误: ${sum} != ${cage.sum}` };
  }

  // 初始数字
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (initialCells[r][c] !== 0 && grid[r][c] !== initialCells[r][c])
        return { valid: false, reason: `修改了初始数字(${r},${c}): ${initialCells[r][c]}→${grid[r][c]}` };

  return { valid: true };
}
