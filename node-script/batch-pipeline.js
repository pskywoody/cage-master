// ==========================================
// 批量流水线：生成 → 求解验证 → 难度评估 → 入库
// ==========================================

const fs = require('fs');
const path = require('path');
const { KillerSudokuSolver } = require('./solver-rater.js');
const { HumanSimulator } = require('./human-simulator.js');

// 配置
const CONFIG = {
  targetCount: 30,        // 目标生成数量
  difficulty: {
    简单: { minScore: 0, maxScore: 30 },
    中等: { minScore: 30, maxScore: 60 },
    困难: { minScore: 60, maxScore: 100 }
  },
  outputFile: path.join(__dirname, '..', 'game-src', 'data', 'levels.json'),
  maxAttempts: 500       // 最多尝试次数
};

// 难度名称列表
const DIFFICULTY_LEVELS = ['简单', '中等', '困难'];

// ==========================================
// 主流程
// ==========================================
async function runPipeline() {
  console.log('🏭 批量流水线启动');
  console.log(`🎯 目标：生成 ${CONFIG.targetCount} 道题（每难度 ~${Math.round(CONFIG.targetCount / 3)} 道）`);
  console.log('');

  const results = {
    简单: [],
    中等: [],
    困难: []
  };

  let attempts = 0;
  let generated = 0;

  // 读取现有题目，避免重复
  const existingLevels = loadExistingLevels();
  console.log(`📦 已有题目：${existingLevels.length} 道`);

  while (attempts < CONFIG.maxAttempts && generated < CONFIG.targetCount) {
    attempts++;

    try {
      // 1. 生成一道题（用 puzzle-manager 的生成逻辑）
      const puzzle = generatePuzzle();
      if (!puzzle) continue;

      // 2. 验证有解
      const emptyGrid = Array.from({ length: 9 }, () => Array(9).fill(0));
      const solver = new KillerSudokuSolver(emptyGrid, puzzle.cages);
      const solution = solver.solve();
      if (!solution) continue;

      // 3. 难度评估
      const grid = Array.from({ length: 9 }, () => Array(9).fill(0));
      const sim = new HumanSimulator(grid, puzzle.cages);
      sim.solve();
      const rating = sim.getDifficultyRating();

      // 4. 判断难度档位
      const level = rating.level;
      if (!results[level]) continue;

      // 5. 检查该难度是否已满
      const perDiffTarget = Math.ceil(CONFIG.targetCount / 3);
      if (results[level].length >= perDiffTarget) continue;

      // 6. 入队
      const puzzleRecord = {
        id: existingLevels.length + generated + 1,
        name: generatePuzzleName(existingLevels.length + generated + 1, level),
        difficulty: level,
        cages: puzzle.cages,
        cells: solution, // 正解（cells 存完整答案，前端展示时用 fixedNum 区分）
        stats: {
          score: rating.score,
          techniques: rating.techniques,
          totalSteps: rating.totalSteps,
          solvable: rating.solvable,
          emptyCells: rating.emptyCells
        }
      };

      results[level].push(puzzleRecord);
      generated++;

      console.log(`  ✅ [${attempts}/${CONFIG.maxAttempts}] 生成成功：难度=${level}，分数=${rating.score}，累计=${generated}`);

    } catch (e) {
      // 生成失败，继续
      continue;
    }
  }

  // 合并所有难度的题目，按难度排序
  const allPuzzles = [
    ...results['简单'],
    ...results['中等'],
    ...results['困难']
  ];

  console.log('');
  console.log('📊 生成统计：');
  for (const diff of DIFFICULTY_LEVELS) {
    console.log(`  ${diff}: ${results[diff].length} 道`);
  }
  console.log(`  总计: ${allPuzzles.length} 道`);
  console.log(`  尝试次数: ${attempts}`);

  // 保存到文件
  if (allPuzzles.length > 0) {
    // 把 stats 去掉，只保留必要字段
    const outputPuzzles = allPuzzles.map(p => ({
      id: p.id,
      name: p.name,
      difficulty: p.difficulty,
      cages: p.cages,
      cells: p.cells
    }));

    fs.writeFileSync(CONFIG.outputFile, JSON.stringify(outputPuzzles, null, 2), 'utf-8');
    console.log('');
    console.log(`💾 已保存到 ${CONFIG.outputFile}`);
  }

  return allPuzzles;
}

// ==========================================
// 生成一道题（简化版：随机分笼子）
// ==========================================
function generatePuzzle() {
  const size = 9;
  const cages = [];
  const visited = Array.from({ length: size }, () => Array(size).fill(false));
  let cageId = 1;

  // 从每个格子开始，随机生长笼子
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (visited[r][c]) continue;

      const cageCells = [];
      const maxSize = Math.floor(Math.random() * 4) + 1; // 1-4格
      growCage(r, c, cageCells, visited, maxSize);

      if (cageCells.length > 0) {
        // 随机和值（简单估算：每格平均 5，上下浮动）
        const avg = 5 * cageCells.length;
        const variance = Math.floor(cageCells.length * 2.5);
        let sum = avg + Math.floor(Math.random() * variance * 2) - variance;
        // 限制在合理范围内
        const minSum = sumFrom1(cageCells.length);
        const maxSum = sumFrom9(cageCells.length);
        sum = Math.max(minSum, Math.min(maxSum, sum));

        cages.push({
          id: cageId++,
          sum,
          cells: cageCells
        });
      }
    }
  }

  return { cages };
}

// DFS 生长笼子
function growCage(r, c, cageCells, visited, maxSize) {
  const size = 9;
  if (r < 0 || r >= size || c < 0 || c >= size) return;
  if (visited[r][c]) return;
  if (cageCells.length >= maxSize) return;

  visited[r][c] = true;
  cageCells.push([r, c]);

  // 随机打乱方向
  const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  shuffleArray(dirs);

  for (const [dr, dc] of dirs) {
    // 有概率继续生长
    if (Math.random() < 0.7) {
      growCage(r + dr, c + dc, cageCells, visited, maxSize);
    }
    if (cageCells.length >= maxSize) break;
  }
}

// ==========================================
// 工具函数
// ==========================================
function sumFrom1(n) {
  let sum = 0;
  for (let i = 1; i <= n; i++) sum += i;
  return sum;
}

function sumFrom9(n) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (9 - i);
  return sum;
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function loadExistingLevels() {
  try {
    const raw = fs.readFileSync(CONFIG.outputFile, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

function generatePuzzleName(id, difficulty) {
  const prefixes = {
    '简单': '初级',
    '中等': '进阶',
    '困难': '挑战'
  };
  const prefix = prefixes[difficulty] || '关卡';
  return `${prefix} #${String(id).padStart(2, '0')}`;
}

// CLI 入口
if (require.main === module) {
  runPipeline().then(() => {
    console.log('\n🎉 流水线完成');
    process.exit(0);
  }).catch(e => {
    console.error('❌ 流水线失败：', e);
    process.exit(1);
  });
}

module.exports = { runPipeline, generatePuzzle };
