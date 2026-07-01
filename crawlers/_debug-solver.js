const { solveKillerSudoku } = require('./pipeline');
const data = require('../game-src/data/puzzles/seeds/lmd-killer-sudoku.json');
const p = data.puzzles[0];

console.log('Testing:', p.title);
console.log('cages:', p.cageCount, 'givens:', p.givenCount, 'origCov:', p.originalCoverage);
console.log('board:');
p.boardData.forEach(r => console.log(r.join(' ')));
console.log('\nsolution (first row):', p.solution[0].join(''));
console.log('cages with sum <= 2 (single cells):', p.cages.filter(c => c.cells.length === 1).length);
console.log('first cage:', JSON.stringify(p.cages[0]));

// Count non-zero in board
let nonZero = 0;
for (const row of p.boardData) for (const v of row) if (v !== 0) nonZero++;
console.log('\nnon-zero in boardData:', nonZero);

// Verify cage sums
let badSum = 0;
for (const cage of p.cages) {
  const s = cage.cells.reduce((sum, [r,c]) => sum + p.solution[r][c], 0);
  if (s !== cage.sum) {
    badSum++;
    console.log(`BAD SUM: cage ${cage.id} sum=${cage.sum} actual=${s} cells=${JSON.stringify(cage.cells)}`);
  }
}
console.log('bad sums:', badSum);

// Run solver
const sols = solveKillerSudoku(p.boardData, p.cages, 9, 2);
console.log('\nsolutions found:', sols.length);
if (sols.length >= 1) {
  console.log('first sol row 0:', sols[0][0].join(''));
  console.log('matches given solution:', sols[0].every((row, r) => row.every((v, c) => v === p.solution[r][c])));
}
