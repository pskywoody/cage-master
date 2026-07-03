const { TechRaterSolver } = require('./tech-rater.js');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('../game-src/data/puzzles/seeds/lmd-pure-killers.json', 'utf-8'));
const puzzles = data.puzzles || data;

console.log('LMD纯杀手题解题路径分析\n');

let totalPuzzles = 0;
let solvableCount = 0;
let totalSteps = 0;
let totalNonNaked = 0;

for (let i = 0; i < Math.min(10, puzzles.length); i++) {
  const p = puzzles[i];
  const cages = p.cages.map((c, idx) => ({ id: idx+1, sum: c.sum, cells: c.cells }));
  
  const solver = new TechRaterSolver(p.boardData, cages);
  const result = solver.solve(200);
  
  const empties = result.remaining;
  const filled = 81 - empties;
  
  const nonNaked = solver.steps.filter(s => s.technique !== 'nakedSingle').length;
  const density = solver.steps.length > 0 ? nonNaked / solver.steps.length : 0;
  
  // 技巧分布
  const techCount = {};
  for (const s of solver.steps) {
    techCount[s.technique] = (techCount[s.technique] || 0) + 1;
  }
  
  console.log('#' + (i+1) + ' ' + p.id + ': ' + p.givenCount + '预填, ' + p.cages.length + '笼');
  console.log('  解了' + result.steps + '步, 剩' + empties + '空, 可解=' + result.complete);
  console.log('  非裸单: ' + nonNaked + '步 (' + (density * 100).toFixed(0) + '%)');
  console.log('  技巧分布:', JSON.stringify(techCount));
  
  totalPuzzles++;
  if (result.complete) solvableCount++;
  totalSteps += result.steps;
  totalNonNaked += nonNaked;
  
  console.log('');
}

console.log('=== 统计 ===');
console.log('总题数: ' + totalPuzzles);
console.log('可解: ' + solvableCount);
console.log('平均步数: ' + (totalSteps / totalPuzzles).toFixed(0));
console.log('平均非裸单: ' + (totalNonNaked / totalPuzzles).toFixed(0));
console.log('平均密度: ' + (totalNonNaked / totalSteps * 100).toFixed(1) + '%');
