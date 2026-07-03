const fs = require('fs');
const path = require('path');

const v4Dir = '../game-src/data/puzzles/v4';

console.log('=== v4 题库质量验证 ===\n');

// 列出所有文件
const files = fs.readdirSync(v4Dir).filter(f => f.endsWith('.json'));
console.log('文件列表: ' + files.join(', ') + '\n');

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(v4Dir, file), 'utf-8'));
  const puzzles = data.puzzles;
  
  const type = file.replace('killer-', '').replace('.json', '');
  console.log('--- ' + type + ' ---');
  console.log('  总数: ' + puzzles.length);
  
  // 难度分布
  const diffs = {};
  let solvableCount = 0;
  let totalScore = 0;
  let totalGiven = 0;
  let totalMaxTech = 0;
  
  for (const p of puzzles) {
    const d = p.difficulty || 'unknown';
    diffs[d] = (diffs[d] || 0) + 1;
    if (p.solvable) solvableCount++;
    totalScore += p.difficultyScore || 0;
    totalGiven += p.givenCount || 0;
    totalMaxTech += p.maxTechLevel || 0;
  }
  
  console.log('  难度分布: ' + JSON.stringify(diffs));
  console.log('  可解率: ' + (solvableCount / puzzles.length * 100).toFixed(1) + '%');
  console.log('  平均分数: ' + (totalScore / puzzles.length).toFixed(0));
  console.log('  平均预填: ' + (totalGiven / puzzles.length).toFixed(1));
  console.log('  平均最高技巧等级: L' + (totalMaxTech / puzzles.length).toFixed(1));
  
  // 抽样技巧分布
  if (puzzles.length > 0 && puzzles[0].techCount) {
    console.log('  抽样技巧: ' + JSON.stringify(puzzles[0].techCount));
  }
  
  // 如果是卡壳残局，详细看看
  if (type === 'stuck-endgame') {
    console.log('\n  残局详情:');
    for (let i = 0; i < puzzles.length; i++) {
      const p = puzzles[i];
      console.log('    #' + (i+1) + ' ' + p.id + ': ' + p.givenCount + '预填/' + (81-p.givenCount) + '空');
      console.log('       难度: ' + p.difficulty + ' (' + p.difficultyScore + '分), 最高技巧: L' + p.maxTechLevel);
      console.log('       非裸单比例: ' + (p.nonTrivialPct ? (p.nonTrivialPct * 100).toFixed(0) + '%' : 'N/A'));
      console.log('       卡壳步数: ' + (p.stuckStep || 'N/A'));
      console.log('       技巧分布: ' + JSON.stringify(p.techCount));
    }
  }
  
  console.log('');
}
