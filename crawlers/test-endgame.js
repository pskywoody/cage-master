const { TechRaterSolver } = require('./tech-rater.js');
const fs = require('fs');

const data = JSON.parse(fs.readFileSync('../game-src/data/puzzles/seeds/generated-killers.json', 'utf-8'));
const puzzles = data.puzzles || data;

console.log('卡壳点残局思路验证\n');
console.log('思路：从0预填开始解题，解到卡壳，这时盘面就是需要新技巧才能推进的残局\n');

let totalEndgames = 0;
let goodEndgames = 0;

for (let i = 0; i < 10; i++) {
  const p = puzzles[i];
  const cages = p.cages.map((c, idx) => ({ id: idx+1, sum: c.sum, cells: c.cells }));
  
  const solver = new TechRaterSolver(p.boardData, cages);
  const result = solver.solve(100);
  
  const empties = result.remaining;
  const filled = 81 - empties;
  
  // 统计最后5步的技巧
  const lastSteps = solver.steps.slice(-5);
  const lastTechs = {};
  for (const s of lastSteps) {
    lastTechs[s.technique] = (lastTechs[s.technique] || 0) + 1;
  }
  
  // 非裸单占比
  const nonNaked = solver.steps.filter(s => s.technique !== 'nakedSingle').length;
  const density = solver.steps.length > 0 ? nonNaked / solver.steps.length : 0;
  
  console.log('#' + (i+1) + ' ' + p.id + ': ' + filled + '预填, ' + empties + '空');
  console.log('  解了' + result.steps + '步, 非裸单' + nonNaked + '步, 密度=' + density.toFixed(2));
  console.log('  最后5步技巧:', JSON.stringify(lastTechs));
  
  totalEndgames++;
  
  // 判定是否是好残局：至少有3个非裸单技巧，且空格在8-30之间
  if (empties >= 8 && empties <= 30 && nonNaked >= 3) {
    goodEndgames++;
    console.log('  ✅ 好残局候选');
  }
  console.log('');
}

console.log('好残局比例: ' + goodEndgames + '/' + totalEndgames);
