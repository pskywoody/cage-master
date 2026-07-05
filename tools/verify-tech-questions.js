// 验证技巧分类题库的质量
const fs = require('fs');
const path = require('path');

const baseDir = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'by-technique');

const files = [
  'technique-nakedSingle.json',
  'technique-cageUnique.json',
  'technique-hiddenSingle.json',
  'technique-rule45.json',
  'technique-nakedPair.json',
];

let total = 0;
let errors = 0;

console.log('验证技巧分类题库质量...');
console.log('');

for (const file of files) {
  const filePath = path.join(baseDir, file);
  if (!fs.existsSync(filePath)) continue;
  
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const puzzles = data.puzzles || [];
  
  console.log(data.name + ' (' + file + '): ' + puzzles.length + ' 道');
  
  let fileErrors = 0;
  
  for (let i = 0; i < Math.min(puzzles.length, 5); i++) {
    const p = puzzles[i];
    
    // 检查必要字段
    if (!p.boardData || !p.cages || !p.solution) {
      console.log('  ✗ [' + p.id + '] 缺少必要字段');
      fileErrors++;
      continue;
    }
    
    // 检查笼子覆盖
    const cellSet = new Set();
    for (const cage of p.cages) {
      for (const cell of cage.cells) {
        cellSet.add(cell[0] + ',' + cell[1]);
      }
    }
    if (cellSet.size !== 81) {
      console.log('  ⚠ [' + p.id + '] 笼子覆盖: ' + cellSet.size + '/81');
    }
    
    // 检查笼子和值
    let sumErrors = 0;
    for (const cage of p.cages) {
      let sum = 0;
      for (const cell of cage.cells) {
        sum += p.solution[cell[0]][cell[1]];
      }
      if (sum !== cage.sum) {
        sumErrors++;
      }
    }
    if (sumErrors > 0) {
      console.log('  ✗ [' + p.id + '] ' + sumErrors + ' 个笼子和值错误');
      fileErrors++;
    }
    
    // 检查solution是否合法数独
    let valid = true;
    for (let r = 0; r < 9 && valid; r++) {
      const rowSet = new Set();
      const colSet = new Set();
      for (let c = 0; c < 9 && valid; c++) {
        if (p.solution[r][c] < 1 || p.solution[r][c] > 9) valid = false;
        if (rowSet.has(p.solution[r][c])) valid = false;
        rowSet.add(p.solution[r][c]);
        if (colSet.has(p.solution[c][r])) valid = false;
        colSet.add(p.solution[c][r]);
      }
    }
    if (!valid) {
      console.log('  ✗ [' + p.id + '] solution不是合法数独');
      fileErrors++;
    }
    
    // 检查techCount
    if (!p.techCount) {
      console.log('  ⚠ [' + p.id + '] 缺少techCount');
    }
  }
  
  total += puzzles.length;
  errors += fileErrors;
  
  if (fileErrors === 0) {
    console.log('  ✓ 抽样 5 题全部合格');
  }
  console.log('');
}

console.log('总计: ' + total + ' 道题');
console.log('抽样错误: ' + errors);
console.log(errors === 0 ? '✓ 质量合格' : '⚠ 存在质量问题');
