/**
 * 批量生成关卡并筛选
 * 按难度分级生成，输出可用关卡池
 */

const path = require('path');
const fs = require('fs');

// ========================================================
//  依赖加载（参考 cage-fixer-v6 的加载方式）
// ========================================================

const deps = {};

function _loadDeps() {
  const baseDir = path.join(__dirname, '..');

  // 模拟浏览器环境（给 board.js 用）
  if (typeof window === 'undefined') {
    global.window = global;
  }

  // 1. Board（只有全局赋值，无 CommonJS 导出）
  const boardPath = path.join(baseDir, 'game', 'board.js');
  const boardCode = fs.readFileSync(boardPath, 'utf8');
  eval.call(global, boardCode);
  deps.Board = global.Board || window.Board;

  // 2. TechRater（有 CommonJS 导出）
  const techRaterModule = require(path.join(baseDir, 'game', 'tech-rater.js'));
  deps.TechRater = techRaterModule.TechRater || techRaterModule;

  // 3. LevelValidator（直接导出类）
  const LevelValidatorClass = require(path.join(baseDir, 'game', 'level-validator.js'));
  deps.LevelValidator = LevelValidatorClass;

  // 4. CageFixer（{ CageFixer } 形式导出）
  const cfModule = require(path.join(baseDir, 'tools', 'cage-fixer-v6.js'));
  deps.CageFixer = cfModule.CageFixer;
}

_loadDeps();

const CageFixer = deps.CageFixer;
const LevelValidator = deps.LevelValidator;
const validator = new LevelValidator();
validator.setDependencies({
  Board: deps.Board,
  TechRater: deps.TechRater,
});

// ========================================================
//  生成配置
// ========================================================

const batches = [
  // 第1章替换：4×4 入门关
  { difficulty: 'easy', star: 1, size: 4, count: 10, label: '4x4_1star' },

  // 第2章替换：6×6 入门 + 9×9 简单
  { difficulty: 'easy', star: 1, size: 6, count: 8, label: '6x6_1star' },
  { difficulty: 'easy', star: 2, size: 9, count: 10, label: '9x9_2star' },

  // 第3章替换：9×9 2-3星
  { difficulty: 'medium', star: 2, size: 9, count: 12, label: '9x9_2star_med' },
  { difficulty: 'medium', star: 3, size: 9, count: 15, label: '9x9_3star' },

  // 第4-5章替换：9×9 3-4星
  { difficulty: 'hard', star: 3, size: 9, count: 12, label: '9x9_3star_hard' },
  { difficulty: 'hard', star: 4, size: 9, count: 15, label: '9x9_4star' },

  // 第6章 + 隐藏关：9×9 4-5星
  { difficulty: 'expert', star: 4, size: 9, count: 10, label: '9x9_4star_exp' },
  { difficulty: 'expert', star: 5, size: 9, count: 10, label: '9x9_5star' },
];

const allResults = {};
let totalAttempts = 0;
let totalValid = 0;

console.log('='.repeat(60));
console.log('  Caged Cipher - 批量关卡生成');
console.log('='.repeat(60));

const startTime = Date.now();

for (const batch of batches) {
  console.log(`\n📦 ${batch.label} (${batch.size}×${batch.size}, ${batch.star}星, 目标${batch.count}个)`);
  console.log('-'.repeat(50));

  const results = [];
  const generator = new CageFixer({
    gridSize: batch.size,
    targetStar: batch.star,
    targetDifficulty: batch.difficulty,
    maxAttempts: 30,
    timeoutMs: 15000,
  });

  let successCount = 0;
  let attempt = 0;
  const maxTries = batch.count * 3;

  while (successCount < batch.count && attempt < maxTries) {
    attempt++;
    try {
      const level = generator.generate();
      if (level && level.boardData) {
        const levelData = {
          gridSize: batch.size,
          boardData: level.boardData,
          cages: level.cages.map((c, i) => ({
            id: i,
            sum: c.sum,
            cells: c.cells
          })),
        };

        const validation = validator.validateLevel(levelData);
        if (validation.valid) {
          successCount++;
          results.push({
            ...level,
            validation,
            batchLabel: batch.label,
          });
          const score = level.difficultyInfo?.score ?? '?';
          const cages = level.stats?.totalCages ?? '?';
          process.stdout.write(`  ✅ ${successCount}/${batch.count} (尝试${attempt}) 分数:${score} 笼子:${cages}\r`);
        }
      }
    } catch (e) {
      // 跳过失败
    }
  }

  console.log(`\n  完成: ${successCount} 个有效 (尝试 ${attempt} 次)`);
  allResults[batch.label] = results;
  totalAttempts += attempt;
  totalValid += successCount;
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);

// ========================================================
//  结果汇总
// ========================================================

console.log('\n');
console.log('='.repeat(60));
console.log('  生成结果总览');
console.log('='.repeat(60));
console.log(`  总尝试: ${totalAttempts} 次`);
console.log(`  有效关卡: ${totalValid} 个`);
console.log(`  成功率: ${((totalValid / totalAttempts) * 100).toFixed(1)}%`);
console.log(`  总耗时: ${totalTime}s`);
console.log('');

console.log('  各批次详情:');
console.log('  ' + '-'.repeat(56));
for (const [label, results] of Object.entries(allResults)) {
  if (results.length > 0) {
    const avgScore = results.reduce((s, r) => s + (r.difficultyInfo?.score || 0), 0) / results.length;
    const avgCages = results.reduce((s, r) => s + (r.stats?.totalCages || 0), 0) / results.length;
    const avgFilled = results.reduce((s, r) => s + (r.stats?.preFilledCount || 0), 0) / results.length;
    console.log(`    ${label.padEnd(18)} ${String(results.length).padStart(3)}个  均分:${String(Math.round(avgScore)).padStart(4)}  均笼:${avgCages.toFixed(1)}  均填:${avgFilled.toFixed(1)}`);
  }
}

// ========================================================
//  保存结果
// ========================================================

const outputPath = path.join(__dirname, '..', 'data', 'generated-level-pool.json');
const pool = {};
for (const [label, results] of Object.entries(allResults)) {
  pool[label] = results.map(r => ({
    gridSize: r.gridSize,
    grid: r.boardData,
    cages: r.cages.map((c, i) => ({ id: i, sum: c.sum, cells: c.cells })),
    solution: r.solution,
    difficulty: r.difficultyInfo,
    stats: r.stats,
  }));
}

fs.writeFileSync(outputPath, JSON.stringify(pool, null, 2), 'utf8');
console.log(`\n💾 关卡池已保存: data/generated-level-pool.json`);
console.log(`   文件大小: ${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB`);
