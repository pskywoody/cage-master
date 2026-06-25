// 给现有题目添加初始数字（从正解中挖洞，保证唯一解）
const { KillerSudokuSolver } = require('./solver-rater.js');
const fs = require('fs');
const path = require('path');

const levelsPath = path.join(__dirname, '..', 'game-src', 'data', 'levels.json');
const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf-8'));

console.log('当前', levels.length, '道题，重新生成带初始数字的版本...\n');

const diffGivens = {
  '简单': { min: 45, max: 52 },
  '中等': { min: 32, max: 38 },
  '困难': { min: 22, max: 28 }
};

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function checkUnique(givensGrid, cages) {
  const solver = new KillerSudokuSolver(givensGrid, cages);
  solver.solve(2);
  return solver.solutions.length === 1;
}

const newLevels = [];

for (let i = 0; i < levels.length; i++) {
  const level = levels[i];
  const emptyGrid = Array.from({length:9},()=>Array(9).fill(0));
  const solver = new KillerSudokuSolver(emptyGrid, level.cages);
  solver.solve();
  
  if (solver.solutions.length === 0) {
    console.log('  ⚠️  关卡', level.id, '无解，跳过');
    continue;
  }

  const solution = solver.solutions[0];
  const range = diffGivens[level.difficulty] || { min: 8, max: 12 };
  const targetGivens = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;

  // 策略：从全满开始，随机挖洞，每挖一个验证是否还唯一解
  // 这样比从空开始加要快，因为初始就是唯一解的
  let givensGrid = solution.map(row => row.slice());
  let allPositions = [];
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      allPositions.push([r, c]);
    }
  }
  allPositions = shuffle(allPositions);

  let removed = 0;
  const targetRemove = 81 - targetGivens;

  for (const [r, c] of allPositions) {
    if (removed >= targetRemove) break;
    
    const oldVal = givensGrid[r][c];
    givensGrid[r][c] = 0;
    
    if (checkUnique(givensGrid, level.cages)) {
      removed++;
    } else {
      // 不能挖，填回去
      givensGrid[r][c] = oldVal;
    }
  }

  let actualGivens = 0;
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (givensGrid[r][c] !== 0) actualGivens++;
    }
  }

  newLevels.push({
    id: level.id,
    name: level.name,
    difficulty: level.difficulty,
    cells: givensGrid,
    cages: level.cages
  });

  console.log('  ✅ 关卡', level.id, '-', level.difficulty, '- 初始数字:', actualGivens, '个');
}

fs.writeFileSync(levelsPath, JSON.stringify(newLevels, null, 2));
console.log('\n✅ 已保存', newLevels.length, '道带初始数字的题目（全部唯一解）');
