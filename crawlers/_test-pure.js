const { solveKillerSudoku } = require('./pipeline');
const data = require('../game-src/data/puzzles/seeds/lmd-killer-sudoku.json');

// Test pure killers
for (const p of data.puzzles) {
  if (p.isPure && p.givenCount === 0) {
    console.log(`\n=== ${p.title} (${p.author}) ===`);
    console.log(`cages=${p.cageCount}, cov=${p.originalCoverage}, givens=${p.givenCount}`);
    const t0 = Date.now();
    const sols = solveKillerSudoku(p.boardData, p.cages, 9, 2);
    const t = Date.now() - t0;
    console.log(`solutions=${sols.length}, time=${t}ms`);
    if (sols.length === 1) {
      const matches = sols[0].every((row, r) => row.every((v, c) => v === p.solution[r][c]));
      console.log(`matches source solution: ${matches}`);
    }
  }
}
