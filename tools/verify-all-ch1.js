// 验证第1章所有关卡唯一解
const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');

const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

// 暴力求解器（带笼子约束）
function countSolutions(boardData, cages, maxSolutions = 2) {
  const grid = builder.cloneGrid(boardData);
  let solutions = [];
  
  function solve() {
    if (solutions.length >= maxSolutions) return;
    
    let r = -1, c = -1;
    for (let i = 0; i < SIZE; i++) {
      for (let j = 0; j < SIZE; j++) {
        if (grid[i][j] === 0) { r = i; c = j; break; }
      }
      if (r !== -1) break;
    }
    
    if (r === -1) {
      if (builder.verifyCages(grid, cages)) {
        solutions.push(builder.cloneGrid(grid));
      }
      return;
    }
    
    const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
    for (const n of cands) {
      grid[r][c] = n;
      // 剪枝：检查笼子和值
      let valid = true;
      for (const cage of cages) {
        let s = 0, empty = 0;
        for (const [cr, cc] of cage.cells) {
          if (grid[cr][cc]) s += grid[cr][cc];
          else empty++;
        }
        if (s > cage.sum) { valid = false; break; }
        if (empty === 0 && s !== cage.sum) { valid = false; break; }
        // 剩下空格的最小可能和
        if (empty > 0) {
          let minRem = 0;
          const used = new Set();
          for (const [cr, cc] of cage.cells) if (grid[cr][cc]) used.add(grid[cr][cc]);
          let avail = [];
          for (let v = 1; v <= SIZE; v++) if (!used.has(v)) avail.push(v);
          avail.sort((a,b) => a-b);
          for (let i = 0; i < empty; i++) minRem += avail[i];
          let maxRem = 0;
          avail.sort((a,b) => b-a);
          for (let i = 0; i < empty; i++) maxRem += avail[i];
          if (s + minRem > cage.sum || s + maxRem < cage.sum) { valid = false; break; }
        }
      }
      if (valid) solve();
      grid[r][c] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  
  solve();
  return solutions;
}

// 读取chapters.json
const chaptersPath = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
const ch1 = chapters.find(c => c.chapterId === 1);

console.log('========================================');
console.log('  第1章所有关卡唯一解验证');
console.log('========================================\n');

let allOk = true;
for (const lv of ch1.levels) {
  console.log(`─── ${lv.title} (${lv.levelId}) ───`);
  
  const sols = countSolutions(lv.boardData, lv.cages || [], 3);
  console.log(`  解的数量: ${sols.length}`);
  
  if (sols.length === 1) {
    console.log(`  ✅ 唯一解`);
  } else if (sols.length === 0) {
    console.log(`  ❌ 无解！`);
    allOk = false;
  } else {
    console.log(`  ❌ 多解！找到${sols.length}个解：`);
    for (let i = 0; i < Math.min(sols.length, 3); i++) {
      console.log(`    解${i+1}:`);
      const str = builder.printGrid(sols[i], SIZE).split('\n');
      for (const line of str) console.log(`      ${line}`);
    }
    allOk = false;
  }
  console.log();
}

if (allOk) {
  console.log('🎉 所有关卡都有唯一解！');
} else {
  console.log('⚠️  部分关卡需要修复！');
}
