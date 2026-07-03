/**
 * 调试：验证求解器是否正确工作
 * 拿一道有solution字段的题，验证求解器能否找到这个解
 */

const fs = require('fs');
const path = require('path');
const { createSolver } = require(path.join(__dirname, '..', 'crawlers', 'killer-generator.js'));

const levels = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'game-src', 'data', 'levels-killer.json'),
  'utf-8'
));

// 拿一道入门级的题，它有solution字段
const lv = levels[0];
console.log('题目:', lv.name);
console.log('ID:', lv.id);
console.log('有solution字段:', !!lv.solution);

// 构造笼子
const cages = lv.cages.map(c => ({
  id: c.id,
  sum: c.sum,
  cells: c.cells
}));

console.log('笼子数:', cages.length);
console.log('第一个笼子:', JSON.stringify(cages[0]));

// 用求解器
try {
  const solver = createSolver(cages);
  console.log('\n求解器创建成功，开始求解（找前3个解）...');
  console.time('求解耗时');
  const sols = solver(lv.cells, 3, 10000);
  console.timeEnd('求解耗时');

  console.log(`找到 ${sols.length} 个解`);

  // 对比第一个解和solution字段
  if (sols.length > 0 && lv.solution) {
    console.log('\n=== 解对比 ===');
    let match = true;
    for (let r = 0; r < 9; r++) {
      const solRow = sols[0][r].join(' ');
      const refRow = lv.solution[r].join(' ');
      const rowMatch = solRow === refRow;
      if (!rowMatch) match = false;
      console.log(`  求解器: ${solRow} ${rowMatch ? '✅' : '❌'}`);
      console.log(`  参考:   ${refRow}`);
    }
    console.log(`\n解匹配: ${match ? '✅ 一致' : '❌ 不一致'}`);
  }

  // 如果有多个解，打印前2个解的差异
  if (sols.length >= 2) {
    console.log('\n=== 前2个解的差异 ===');
    let diffCount = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (sols[0][r][c] !== sols[1][r][c]) {
          diffCount++;
          if (diffCount <= 10) {
            console.log(`  (${r},${c}): ${sols[0][r][c]} vs ${sols[1][r][c]}`);
          }
        }
      }
    }
    console.log(`总差异格数: ${diffCount}`);
  }
} catch (e) {
  console.log('求解器报错:', e.message);
  console.log(e.stack);
}
