// 完整验证第1章所有关卡：唯一解+教学节奏
const fs = require('fs');
const path = require('path');
const builder = require('./level-builder');
const SIZE = 4;
const {bw, bh} = builder.getBox(SIZE);

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
      if (builder.verifyCages(grid, cages)) solutions.push(builder.cloneGrid(grid));
      return;
    }
    const cands = builder.getCands(grid, r, c, SIZE, bw, bh);
    for (const n of cands) {
      grid[r][c] = n;
      let valid = true;
      for (const cage of cages) {
        let s = 0, empty = 0;
        for (const [cr, cc] of cage.cells) {
          if (grid[cr][cc]) s += grid[cr][cc]; else empty++;
        }
        if (s > cage.sum) { valid = false; break; }
        if (empty === 0 && s !== cage.sum) { valid = false; break; }
      }
      if (valid) solve();
      grid[r][c] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  solve();
  return solutions;
}

function simNakedAndCombos(boardData, cages) {
  const grid = builder.cloneGrid(boardData);
  let filled = 0;
  let steps = [];
  while (true) {
    let found = false;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] !== 0) continue;
        let cd = builder.getCands(grid, r, c, SIZE, bw, bh);
        // 检查唯一组合
        for (const cage of cages) {
          const idx = cage.cells.findIndex(([cr,cc]) => cr===r && cc===c);
          if (idx === -1) continue;
          if (cage.cells.length === 2) {
            const uniq = {3:[1,2],4:[1,3],6:[2,4],7:[3,4]};
            if (uniq[cage.sum]) {
              const [n1,n2] = uniq[cage.sum];
              const other = cage.cells[1-idx];
              if (grid[other[0]][other[1]] !== 0) {
                cd = [cage.sum - grid[other[0]][other[1]]];
              } else {
                cd = cd.filter(n => n === n1 || n === n2);
              }
            }
          }
        }
        if (cd.length === 1) {
          steps.push({r,c,n:cd[0]});
          grid[r][c] = cd[0];
          filled++;
          found = true;
        }
      }
    }
    if (!found) break;
  }
  let empty = 0;
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (!grid[r][c]) empty++;
  return {grid, filled, empty, done: empty === 0, steps};
}

function findHidden(grid) {
  const res = [];
  for (let r = 0; r < SIZE; r++) {
    for (let n = 1; n <= SIZE; n++) {
      let pos = [];
      for (let c = 0; c < SIZE; c++) {
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'row'});
    }
  }
  for (let c = 0; c < SIZE; c++) {
    for (let n = 1; n <= SIZE; n++) {
      let pos = [];
      for (let r = 0; r < SIZE; r++) {
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'col'});
    }
  }
  for (let br = 0; br < 2; br++) {
    for (let bc = 0; bc < 2; bc++) {
      for (let n = 1; n <= SIZE; n++) {
        let pos = [];
        for (let dr = 0; dr < 2; dr++) for (let dc = 0; dc < 2; dc++) {
          const r = br*2+dr, c = bc*2+dc;
          if (grid[r][c] === n) { pos = []; break; }
          if (grid[r][c]) continue;
          const cd = builder.getCands(grid, r, c, SIZE, bw, bh);
          if (cd.includes(n)) pos.push([r,c]);
        }
        if (pos.length === 1) res.push({r:pos[0][0],c:pos[0][1],n,where:'box'});
      }
    }
  }
  return res;
}

// 读取chapters.json
const chaptersPath = path.join(__dirname, '..', 'game-src', 'data', 'chapters.json');
const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
const ch1 = chapters.find(c => c.chapterId === 1);

console.log('========================================');
console.log('  第1章深度验证：唯一解 + 教学节奏');
console.log('========================================\n');

let allOk = true;
for (const lv of ch1.levels) {
  console.log(`─── ${lv.title} (${lv.levelId}) ───`);
  console.log(`  模式: ${lv.mode}, 教学目标: ${lv.teachingGoal.substring(0,30)}...`);
  
  const cages = lv.cages || [];
  
  // 1. 终盘合法
  const solOk = builder.isValidSolution(lv.solution, SIZE);
  console.log(`  终盘合法: ${solOk ? '✅' : '❌'}`);
  
  // 2. 笼子和值
  const cageOk = builder.verifyCages(lv.solution, cages);
  console.log(`  笼子和值: ${cageOk ? '✅' : '❌'}`);
  
  // 3. 唯一解
  const sols = countSolutions(lv.boardData, cages, 2);
  const unique = sols.length === 1;
  console.log(`  唯一解: ${unique ? '✅' : '❌'} (找到${sols.length}个解)`);
  
  // 4. 教学节奏检查
  if (lv.mode === 'endgame') {
    const keyOk = lv.keyCells && lv.keyCells.length > 0;
    const keyEmpty = lv.keyCells ? lv.keyCells.every(([r,c]) => lv.boardData[r][c] === 0) : false;
    console.log(`  残局关关键格: ${keyOk && keyEmpty ? '✅' : '❌'}`);
  } else {
    const sim = simNakedAndCombos(lv.boardData, cages);
    console.log(`  开局裸单+唯一组合可填: ${sim.filled}个`);
    if (sim.done) {
      console.log(`  ⚠️  裸单直接解完，没有破局点！`);
      if (lv.levelId >= 104) allOk = false; // 104之后应该有破局
    } else {
      const hiddens = findHidden(sim.grid);
      console.log(`  卡壳后隐单数量: ${hiddens.length}`);
      if (hiddens.length > 0) {
        const testG = builder.cloneGrid(sim.grid);
        testG[hiddens[0].r][hiddens[0].c] = hiddens[0].n;
        const after = simNakedAndCombos(testG, cages);
        console.log(`  第一个隐单(${hiddens[0].r},${hiddens[0].c})=${hiddens[0].n}后连锁: ${after.filled}格, 收官:${after.done ? '✅' : '剩'+after.empty+'格'}`);
      }
    }
  }
  
  if (!solOk || !cageOk || !unique) allOk = false;
  console.log();
}

console.log(allOk ? '🎉 所有关卡验证通过！' : '⚠️ 存在问题需要修复');
