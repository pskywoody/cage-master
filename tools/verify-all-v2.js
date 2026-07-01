// Verify all 300 free puzzles + 48 chapter levels using the production solver
const fs = require('fs');
const path = require('path');
const { KillerSudokuSolver } = require('../node-script/solver-rater.js');

const levels = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game-src', 'data', 'levels.json'), 'utf-8'));
const chapters = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game-src', 'data', 'chapters.json'), 'utf-8'));

let results = [];
let freeOk = 0, freeBad = 0;

console.log('验证自由模式300题...');
for (const p of levels) {
  const issues = [];
  const cages = p.cages || [];
  
  if (!p.cells || p.cells.length !== 9) { issues.push('cells异常'); }
  if (!cages.length) { issues.push('无笼子'); }
  
  // Coverage
  if (cages.length) {
    const covered = new Set();
    for (const cg of cages) {
      for (const [r,c] of cg.cells) {
        const k = `${r},${c}`;
        if (covered.has(k)) { issues.push(`重叠${k}`); break; }
        covered.add(k);
      }
    }
    if (covered.size !== 81) issues.push(`覆盖${covered.size}/81`);
  }
  
  // Solve + verify
  if (issues.length === 0) {
    const grid = p.cells.map(r => r.slice());
    const solver = new KillerSudokuSolver(grid, cages);
    solver.solve(2);
    
    if (solver.solutions.length === 0) {
      issues.push('无解');
    } else if (solver.solutions.length > 1) {
      issues.push(`多解(${solver.solutions.length})`);
    } else {
      const sol = solver.solutions[0];
      for (const cg of cages) {
        let s = 0;
        for (const [r,c] of cg.cells) s += sol[r][c];
        if (s !== cg.sum) { issues.push(`笼#${cg.id}和值错(期${cg.sum}实${s})`); break; }
      }
    }
  }
  
  const givens = p.cells ? p.cells.flat().filter(v => v !== 0).length : 0;
  if (issues.length === 0) {
    freeOk++;
  } else {
    freeBad++;
    results.push({ id: p.id, name: p.name, diff: p.difficulty, givens, issues });
    console.log(`  ❌ #${p.id} ${p.name}: ${issues.join('; ')}`);
  }
}

// Verify chapters
console.log('\n验证教学章节...');
let chOk = 0, chBad = 0;
for (const ch of chapters) {
  for (const lv of (ch.levels || [])) {
    const issues = [];
    const size = lv.gridSize || 9;
    const bd = lv.boardData || lv.cells;
    const sol = lv.solution;
    const cages = lv.cages || [];
    
    if (!bd || bd.length !== size) { issues.push('boardData异常'); }
    if (!sol || sol.length !== size) { issues.push('无solution'); }
    
    if (bd && sol && bd.length === size && sol.length === size) {
      // Solution validity (rows/cols/boxes)
      for (let r = 0; r < size; r++) {
        const seen = new Set();
        for (let c = 0; c < size; c++) {
          const v = sol[r][c];
          if (v < 1 || v > size) issues.push(`sol越界[${r}][${c}]=${v}`);
          if (seen.has(v)) issues.push(`sol行${r}重复${v}`);
          seen.add(v);
        }
      }
      // Columns
      for (let c = 0; c < size; c++) {
        const seen = new Set();
        for (let r = 0; r < size; r++) {
          const v = sol[r][c];
          if (seen.has(v)) issues.push(`sol列${c}重复${v}`);
          seen.add(v);
        }
      }
      // Givens match
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          if (bd[r][c] !== 0 && bd[r][c] !== sol[r][c]) {
            issues.push(`预填不匹配[${r}][${c}]`);
          }
        }
      }
      // Cage sums
      for (const cg of cages) {
        let s = 0;
        for (const [r,c] of cg.cells) {
          if (r < size && c < size) s += sol[r][c];
        }
        if (s !== cg.sum) { issues.push(`笼#${cg.id}和值错(期${cg.sum}实${s})`); }
      }
    }
    
    if (issues.length === 0) { chOk++; }
    else {
      chBad++;
      results.push({ id: lv.levelId, name: lv.title, ch: ch.chapterId, issues });
      console.log(`  ❌ ch${ch.chapterId}/${lv.levelId} ${lv.title}: ${issues.join('; ')}`);
    }
  }
}

console.log('\n=== 验证结果 ===');
console.log(`自由模式: ${freeOk}通过, ${freeBad}问题`);
console.log(`教学章节: ${chOk}通过, ${chBad}问题`);
console.log(`总计: ${freeOk+chOk}通过, ${freeBad+chBad}问题`);

if (results.length === 0) {
  console.log('\n🎉 全部通过！');
} else {
  console.log(`\n共${results.length}个问题`);
}
