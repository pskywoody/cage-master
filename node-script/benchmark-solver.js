// Quick benchmark of solver speed
const { KillerSudokuSolver } = require('./solver-rater.js');
const fs = require('fs');
const path = require('path');

// Load existing levels to test solver speed
const levels = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game-src', 'data', 'levels.json'), 'utf-8'));

// Test a few puzzles with different given counts
const testCases = [
  levels.find(l => l.difficulty === '简单'),
  levels.find(l => l.difficulty === '中等'),
  levels.find(l => l.difficulty === '困难'),
];

for (const level of testCases) {
  const givens = level.cells.flat().filter(v => v !== 0).length;
  const start = Date.now();
  const solver = new KillerSudokuSolver(level.cells.map(r => r.slice()), level.cages);
  solver.solve(2);
  const elapsed = Date.now() - start;
  console.log(`${level.difficulty} (${givens} givens, ${level.cages.length} cages): ${solver.solutions.length} solution(s) in ${elapsed}ms`);
}

// Test with 0 givens (hardest case) - see how long it takes
console.log('\n测试极端情况（少givens）...');
const hardLevel = levels.find(l => l.difficulty === '困难');
// Remove most givens to test solver speed with sparse grid
const sparseGrid = hardLevel.cells.map(r => r.slice());
let removed = 0;
for (let r = 0; r < 9 && removed < 20; r++) {
  for (let c = 0; c < 9 && removed < 20; c++) {
    if (sparseGrid[r][c] !== 0 && Math.random() < 0.8) {
      sparseGrid[r][c] = 0;
      removed++;
    }
  }
}
const sparseGivens = sparseGrid.flat().filter(v => v !== 0).length;
const t0 = Date.now();
const s2 = new KillerSudokuSolver(sparseGrid, hardLevel.cages);
s2.solve(2);
console.log(`Sparse (${sparseGivens} givens): ${s2.solutions.length} solution(s) in ${Date.now() - t0}ms`);
