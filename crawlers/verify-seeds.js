// 验证抓取到的杀手数独谜题
const fs = require('fs');
const path = require('path');

const filepath = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'seeds', 'lmd-killer-sudoku.json');
const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

console.log(`Total puzzles: ${data.count}`);
console.log(`Source: ${data.source}`);
console.log(`Crawled at: ${data.crawledAt}\n`);

let totalCages = 0;
for (let i = 0; i < data.puzzles.length; i++) {
  const p = data.puzzles[i];
  totalCages += p.cageCount;
  
  // 验证cage和
  let cageSumOK = true;
  for (const cage of p.cages) {
    const actual = cage.cells.reduce((s, [r, c]) => s + p.solution[r][c], 0);
    if (actual !== cage.sum) { cageSumOK = false; break; }
  }
  
  // 验证数独合法性
  let sudokuOK = true;
  const sol = p.solution;
  for (let r = 0; r < 9; r++) {
    const seen = new Set();
    for (let c = 0; c < 9; c++) {
      if (seen.has(sol[r][c])) { sudokuOK = false; break; }
      seen.add(sol[r][c]);
    }
    if (!sudokuOK) break;
  }
  for (let c = 0; c < 9 && sudokuOK; c++) {
    const seen = new Set();
    for (let r = 0; r < 9; r++) {
      if (seen.has(sol[r][c])) { sudokuOK = false; break; }
      seen.add(sol[r][c]);
    }
  }
  
  console.log(`${i+1}. "${p.title}" by ${p.author}`);
  console.log(`   Cages: ${p.cageCount}, Givens: ${p.givenCount}, Format: ${p.format}`);
  console.log(`   Sudoku valid: ${sudokuOK ? '✓' : '✗'}, Cage sums: ${cageSumOK ? '✓' : '✗'}`);
  console.log(`   LMD ID: ${p.lmdId}, Pad ID: ${p.sudokuPadId}`);
  if (p.ruleset) console.log(`   Rules: ${p.ruleset.substring(0, 80)}...`);
  console.log();
}

console.log(`\nTotal cages across all puzzles: ${totalCages}`);
console.log(`Average cages per puzzle: ${(totalCages / data.puzzles.length).toFixed(1)}`);
