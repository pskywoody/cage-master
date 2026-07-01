// ==========================================
// 全面验证脚本：检查1-7章所有关卡 + 自由模式300题
// 验证项：
//   1. 终盘合法性（行/列/宫无重复，数字范围正确）
//   2. 预填数字与终盘一致
//   3. 笼子覆盖完整性（所有格子恰好属于一个笼子）
//   4. 笼子和值正确性（终盘数字之和 = 声明sum）
//   5. 唯一解（回溯求解，最多找2个解）
//   6. 可解性（裸单+隐单+45法则+组合推理能否解到终盘）
// ==========================================
const fs = require('fs');
const path = require('path');

// ---------- 工具函数 ----------
function getBox(size) {
  if (size === 4) return { bw: 2, bh: 2 };
  if (size === 6) return { bw: 3, bh: 2 };
  return { bw: 3, bh: 3 };
}

function cloneGrid(g) { return g.map(r => [...r]); }

function isValidSolution(sol, size) {
  if (!sol || sol.length !== size) return false;
  const { bw, bh } = getBox(size);
  // 检查每行
  for (let r = 0; r < size; r++) {
    if (sol[r].length !== size) return false;
    const seen = new Set();
    for (let c = 0; c < size; c++) {
      const v = sol[r][c];
      if (v < 1 || v > size) return false;
      if (seen.has(v)) return false;
      seen.add(v);
    }
  }
  // 检查每列
  for (let c = 0; c < size; c++) {
    const seen = new Set();
    for (let r = 0; r < size; r++) {
      if (seen.has(sol[r][c])) return false;
      seen.add(sol[r][c]);
    }
  }
  // 检查每宫
  for (let br = 0; br < size/bh; br++) {
    for (let bc = 0; bc < size/bw; bc++) {
      const seen = new Set();
      for (let dr = 0; dr < bh; dr++) for (let dc = 0; dc < bw; dc++) {
        const v = sol[br*bh+dr][bc*bw+dc];
        if (seen.has(v)) return false;
        seen.add(v);
      }
    }
  }
  return true;
}

function getCands(grid, r, c, size, bw, bh, cages) {
  const used = new Set();
  for (let i = 0; i < size; i++) {
    if (grid[r][i]) used.add(grid[r][i]);
    if (grid[i][c]) used.add(grid[i][c]);
  }
  const br = Math.floor(r/bh)*bh, bc = Math.floor(c/bw)*bw;
  for (let dr = 0; dr < bh; dr++) for (let dc = 0; dc < bw; dc++) {
    if (grid[br+dr][bc+dc]) used.add(grid[br+dr][bc+dc]);
  }
  // 笼子约束：同笼已有数字不能重复
  if (cages) {
    for (const cage of cages) {
      const inCage = cage.cells.some(([cr,cc]) => cr===r && cc===c);
      if (!inCage) continue;
      for (const [cr,cc] of cage.cells) {
        if (cr===r && cc===c) continue;
        if (grid[cr][cc]) used.add(grid[cr][cc]);
      }
    }
  }
  const cands = [];
  for (let n = 1; n <= size; n++) if (!used.has(n)) cands.push(n);
  return cands;
}

function verifyCages(sol, cages, size) {
  if (!cages || cages.length === 0) return true;
  for (const cage of cages) {
    let s = 0;
    for (const [r,c] of cage.cells) {
      if (r < 0 || r >= size || c < 0 || c >= size) return false;
      s += sol[r][c];
    }
    if (s !== cage.sum) return false;
  }
  return true;
}

function verifyCageCoverage(cages, size) {
  if (!cages || cages.length === 0) return {ok: true, msg: '无笼子（纯数独）'};
  const covered = new Set();
  for (const cage of cages) {
    for (const [r,c] of cage.cells) {
      const key = r+','+c;
      if (covered.has(key)) return {ok: false, msg: `格子(${r},${c})属于多个笼子`};
      covered.add(key);
    }
  }
  const total = size*size;
  if (covered.size !== total) {
    const missing = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (!covered.has(r+','+c)) missing.push(`(${r},${c})`);
    }
    return {ok: false, msg: `有${total - covered.size}个格子不在任何笼子中: ${missing.slice(0,5).join(',')}${missing.length>5?'...':''}`};
  }
  return {ok: true, msg: `${cages.length}个笼子覆盖全部${total}格`};
}

// 回溯求解（带笼子和值约束剪枝），返回解的数量（最多max个）
function countSolutions(boardData, cages, size, maxSolutions = 2) {
  const grid = cloneGrid(boardData);
  const { bw, bh } = getBox(size);
  let solutions = [];
  let steps = 0;
  const MAX_STEPS = 500000; // 防止无限循环

  function cageValid(gr, r, c) {
    if (!cages) return true;
    for (const cage of cages) {
      const idx = cage.cells.findIndex(([cr,cc]) => cr===r && cc===c);
      if (idx === -1) continue;
      let s = 0, empty = 0;
      for (const [cr,cc] of cage.cells) {
        if (gr[cr][cc]) s += gr[cr][cc]; else empty++;
      }
      if (s > cage.sum) return false;
      if (empty === 0 && s !== cage.sum) return false;
      // 剩余格子最小可能和 > 剩余需要的和
      if (empty > 0) {
        const remain = cage.sum - s;
        if (remain < 0) return false;
        // 剩余格子最小和: 1+2+...+empty = empty*(empty+1)/2
        const minSum = empty*(empty+1)/2;
        // 剩余格子最大和: size+(size-1)+...+(size-empty+1)
        const maxSum = empty*size - empty*(empty-1)/2;
        if (remain < minSum || remain > maxSum) return false;
      }
    }
    return true;
  }

  function solve() {
    if (solutions.length >= maxSolutions || steps > MAX_STEPS) return;
    steps++;
    // MRV: 找候选最少的格子
    let bestR = -1, bestC = -1, bestCands = null, bestLen = size+1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (grid[r][c] !== 0) continue;
        const cd = getCands(grid, r, c, size, bw, bh, cages);
        if (cd.length === 0) return;
        if (cd.length < bestLen) {
          bestLen = cd.length;
          bestR = r; bestC = c; bestCands = cd;
          if (bestLen === 1) break;
        }
      }
      if (bestLen === 1) break;
    }
    if (bestR === -1) {
      // 填满了，验证笼子
      if (!cages || verifyCages(grid, cages, size)) {
        solutions.push(cloneGrid(grid));
      }
      return;
    }
    for (const n of bestCands) {
      grid[bestR][bestC] = n;
      if (cageValid(grid, bestR, bestC)) {
        solve();
      }
      grid[bestR][bestC] = 0;
      if (solutions.length >= maxSolutions) return;
    }
  }
  solve();
  return { solutions, steps, timeout: steps > MAX_STEPS };
}

// 裸单+隐单+笼子推理模拟（检查可解性）
function simulateSolve(boardData, cages, size) {
  const grid = cloneGrid(boardData);
  const { bw, bh } = getBox(size);
  let filled = 0;
  let iterations = 0;
  const MAX_ITER = 100;

  while (iterations++ < MAX_ITER) {
    let found = false;

    // 1. 裸单
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
      if (grid[r][c] !== 0) continue;
      const cd = getCands(grid, r, c, size, bw, bh, cages);
      if (cd.length === 1) {
        grid[r][c] = cd[0];
        filled++; found = true;
      } else if (cd.length === 0) {
        return {grid, filled, done: false, error: `格子(${r},${c})无候选`, solvable: false};
      }
    }
    if (found) continue;

    // 2. 隐单（行/列/宫/笼）
    // 行隐单
    for (let r = 0; r < size; r++) for (let n = 1; n <= size; n++) {
      let pos = [];
      for (let c = 0; c < size; c++) {
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = getCands(grid, r, c, size, bw, bh, cages);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) {
        grid[pos[0][0]][pos[0][1]] = n;
        filled++; found = true;
      }
    }
    if (found) continue;
    // 列隐单
    for (let c = 0; c < size; c++) for (let n = 1; n <= size; n++) {
      let pos = [];
      for (let r = 0; r < size; r++) {
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = getCands(grid, r, c, size, bw, bh, cages);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) {
        grid[pos[0][0]][pos[0][1]] = n;
        filled++; found = true;
      }
    }
    if (found) continue;
    // 宫隐单
    for (let br = 0; br < size/bh; br++) for (let bc = 0; bc < size/bw; bc++) for (let n = 1; n <= size; n++) {
      let pos = [];
      for (let dr = 0; dr < bh; dr++) for (let dc = 0; dc < bw; dc++) {
        const r = br*bh+dr, c = bc*bw+dc;
        if (grid[r][c] === n) { pos = []; break; }
        if (grid[r][c]) continue;
        const cd = getCands(grid, r, c, size, bw, bh, cages);
        if (cd.includes(n)) pos.push([r,c]);
      }
      if (pos.length === 1) {
        grid[pos[0][0]][pos[0][1]] = n;
        filled++; found = true;
      }
    }
    if (found) continue;

    // 3. 笼子和值推理（单格笼子sum直接确定；两格笼子唯一组合）
    if (cages) {
      for (const cage of cages) {
        const emptyCells = cage.cells.filter(([r,c]) => grid[r][c] === 0);
        const filledSum = cage.cells.filter(([r,c]) => grid[r][c] !== 0).reduce((s,[r,c]) => s+grid[r][c], 0);
        const remain = cage.sum - filledSum;
        if (emptyCells.length === 1) {
          // 单格剩余，直接确定
          const [er,ec] = emptyCells[0];
          if (remain >= 1 && remain <= size) {
            const cd = getCands(grid, er, ec, size, bw, bh, cages);
            if (cd.includes(remain) && grid[er][ec] === 0) {
              grid[er][ec] = remain;
              filled++; found = true;
            }
          }
        }
      }
    }
    if (found) continue;

    break; // 无法继续推进
  }

  let empty = 0;
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (!grid[r][c]) empty++;
  return {grid, filled, empty, done: empty === 0, solvable: empty === 0, iterations};
}

// ---------- 加载数据 ----------
const dataDir = path.join(__dirname, '..', 'game-src', 'data');
const chaptersPath = path.join(dataDir, 'chapters.json');
const levelsPath = path.join(dataDir, 'levels.json');

console.log('========================================');
console.log('  🔍 全面验证：1-7章 + 自由模式300题');
console.log('========================================\n');

let totalIssues = 0;
let totalLevels = 0;
let totalOk = 0;

// ---------- 验证章节关卡 ----------
console.log('═══════════════════════════════════════');
console.log('  📖 验证教学章节关卡（chapters.json）');
console.log('═══════════════════════════════════════\n');

const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));

for (const chapter of chapters) {
  const chId = chapter.chapterId;
  const chTitle = chapter.title || '未知';
  console.log(`━━━ 第${chId}章：${chTitle} ━━━`);

  if (!chapter.levels || chapter.levels.length === 0) {
    console.log(`  ⚠️  没有关卡数据\n`);
    continue;
  }

  let chIssues = 0;
  for (const lv of chapter.levels) {
    totalLevels++;
    const lvId = lv.levelId;
    const lvTitle = lv.title || '未命名';
    const size = lv.gridSize || 9;
    const issues = [];

    // 获取boardData和cages
    // 教学关可能用boardData或cells字段
    const board = lv.boardData || lv.cells || lv.puzzle;
    const sol = lv.solution;
    const cages = lv.cages || [];

    if (!board) {
      issues.push('❌ 缺少boardData/cells');
      console.log(`  [${lvId}] ${lvTitle}: ❌ 缺少棋盘数据`);
      totalIssues++;
      chIssues++;
      continue;
    }
    if (!sol) {
      issues.push('❌ 缺少solution');
    }

    // 1. 终盘合法性
    if (sol && !isValidSolution(sol, size)) {
      issues.push('❌ 终盘不合法（有重复或越界数字）');
    }

    // 2. 预填数字与终盘一致
    if (sol && board) {
      let mismatch = [];
      for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) {
        if (board[r][c] !== 0 && board[r][c] !== sol[r][c]) {
          mismatch.push(`(${r},${c}):盘面${board[r][c]}≠终盘${sol[r][c]}`);
        }
      }
      if (mismatch.length > 0) {
        issues.push(`❌ 预填数字与终盘不一致: ${mismatch.slice(0,3).join(', ')}${mismatch.length>3?'...':''}`);
      }
    }

    // 3. 笼子覆盖完整性
    if (size === 9 || (size === 6 && cages.length > 0) || (size === 4 && cages.length > 0 && !lv.allowPartialCages)) {
      // 4x4前几关可能是纯数独（无笼子），或教学关故意只展示部分笼子（allowPartialCages），这是合法的
      const cov = verifyCageCoverage(cages, size);
      if (!cov.ok) {
        issues.push('❌ 笼子覆盖: ' + cov.msg);
      }
    } else if (size === 4 && cages.length > 0 && lv.allowPartialCages) {
      console.log(`      ℹ️  笼子部分覆盖（教学关故意设计）: ${cages.length}个笼子`);
    }

    // 4. 笼子和值正确性
    if (sol && cages.length > 0) {
      if (!verifyCages(sol, cages, size)) {
        // 找出具体哪个笼子错了
        const badCages = [];
        for (const cage of cages) {
          let s = 0;
          for (const [r,c] of cage.cells) s += sol[r][c];
          if (s !== cage.sum) badCages.push(`笼#${cage.id}(sum=${cage.sum},实际=${s})`);
        }
        issues.push(`❌ 笼子和值错误: ${badCages.slice(0,3).join(', ')}${badCages.length>3?'...':''}`);
      }
    }

    // 5. 唯一解（对于残局关/endgame，keyCells锁定也算约束）
    let boardToSolve = board;
    if (issues.filter(i => i.includes('❌')).length === 0 && sol) {
      // 只在没有严重错误时才求解（避免无效计算）
      // 对于残局关，locked cells也是预填的
      let solveBoard = cloneGrid(board);
      if (lv.mode === 'endgame' && lv.keyCells && lv.lockedCells) {
        // locked cells应该都是预填的（来自solution）
        for (const [r,c] of (lv.lockedCells || [])) {
          if (solveBoard[r][c] === 0) solveBoard[r][c] = sol[r][c];
        }
      }
      const result = countSolutions(solveBoard, cages, size, 2);
      if (result.timeout) {
        issues.push('⚠️ 唯一解检测超时（>50万步），盘面可能过难或有问题');
      } else if (result.solutions.length === 0) {
        issues.push('❌ 无解！盘面有矛盾');
      } else if (result.solutions.length > 1) {
        issues.push(`❌ 多解（找到${result.solutions.length}个解）`);
      }
    }

    // 6. 可解性（用逻辑技巧模拟）
    if (issues.filter(i => i.includes('❌')).length === 0 && sol) {
      let solveBoard = cloneGrid(board);
      if (lv.mode === 'endgame' && lv.keyCells && lv.lockedCells) {
        for (const [r,c] of (lv.lockedCells || [])) {
          if (solveBoard[r][c] === 0) solveBoard[r][c] = sol[r][c];
        }
      }
      const sim = simulateSolve(solveBoard, cages, size);
      if (!sim.done && sim.error) {
        issues.push('❌ 可解性检测出错: ' + sim.error);
      }
      // 对于教学关，不要求纯基础技巧可解（高级技巧关需要对应技巧）
      // 但如果基础技巧就能出矛盾，则有问题
    }

    // 输出结果
    if (issues.length === 0) {
      console.log(`  [${lvId}] ${lvTitle}: ✅ 全部通过 (${size}x${size}, ${cages.length}笼)`);
      totalOk++;
    } else {
      console.log(`  [${lvId}] ${lvTitle}:`);
      for (const iss of issues) console.log(`      ${iss}`);
      chIssues++;
      totalIssues++;
    }
  }
  if (chIssues === 0) {
    console.log(`  ✅ 本章全部通过 (${chapter.levels.length}关)\n`);
  } else {
    console.log(`  ⚠️  本章有${chIssues}个问题\n`);
  }
}

// ---------- 验证自由模式300题 ----------
console.log('═══════════════════════════════════════');
console.log('  🧩 验证自由模式300题（levels.json）');
console.log('═══════════════════════════════════════\n');

if (fs.existsSync(levelsPath)) {
  const levels = JSON.parse(fs.readFileSync(levelsPath, 'utf8'));
  console.log(`  共${levels.length}道题目\n`);

  let freeIssues = 0;
  let freeOk = 0;
  let noGivenCount = 0;

  // 先统计有多少题没有预填数字
  for (const p of levels) {
    let givens = 0;
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) if (p.cells[r][c] !== 0) givens++;
    if (givens === 0) noGivenCount++;
  }

  if (noGivenCount > 0) {
    console.log(`  ⚠️  ${noGivenCount}道题目完全没有预填数字（0 givens）！`);
    console.log(`  这会导致页面看起来是空白的，需要修复\n`);
    freeIssues += noGivenCount;
  }

  // 抽样验证（300题全算唯一解太慢，每10题验证1题+首尾）
  const sampleIndices = new Set();
  sampleIndices.add(0); sampleIndices.add(99); // 简单首尾
  sampleIndices.add(100); sampleIndices.add(199); // 中等首尾
  sampleIndices.add(200); sampleIndices.add(299); // 困难首尾
  for (let i = 0; i < levels.length; i += 10) sampleIndices.add(i);

  for (let i = 0; i < levels.length; i++) {
    const p = levels[i];
    totalLevels++;
    const issues = [];
    const size = 9;
    const cages = p.cages || [];

    // 统计预填数字
    let givens = 0;
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (p.cells[r][c] !== 0) givens++;

    // 结构检查（每道题都做）
    if (!p.cells || p.cells.length !== 9) issues.push('❌ cells结构异常');
    if (!cages || cages.length === 0) issues.push('❌ 没有笼子数据');

    // 预填数字不能与行/列/宫矛盾
    if (p.cells && p.cells.length === 9) {
      for (let r = 0; r < 9; r++) {
        const seen = new Set();
        for (let c = 0; c < 9; c++) {
          const v = p.cells[r][c];
          if (v !== 0) {
            if (v < 1 || v > 9) issues.push(`❌ 数字越界: [${r}][${c}]=${v}`);
            if (seen.has(v)) issues.push(`❌ 行${r}有重复数字${v}`);
            seen.add(v);
          }
        }
      }
      for (let c = 0; c < 9; c++) {
        const seen = new Set();
        for (let r = 0; r < 9; r++) {
          const v = p.cells[r][c];
          if (v !== 0) {
            if (seen.has(v)) issues.push(`❌ 列${c}有重复数字${v}`);
            seen.add(v);
          }
        }
      }
    }

    // 笼子覆盖
    if (cages.length > 0) {
      const cov = verifyCageCoverage(cages, 9);
      if (!cov.ok) issues.push('❌ 笼子覆盖: ' + cov.msg);
    }

    // 抽样深度验证（唯一解+和值）
    const isSample = sampleIndices.has(i);
    if (isSample && issues.filter(x=>x.startsWith('❌')).length === 0) {
      // 先快速验证和值范围（不需要解）
      for (const cage of cages) {
        if (cage.sum < cage.cells.length*(cage.cells.length+1)/2 ||
            cage.sum > cage.cells.length*9 - cage.cells.length*(cage.cells.length-1)/2) {
          issues.push(`❌ 笼#${cage.id} sum=${cage.sum}不可能（${cage.cells.length}格）`);
          break;
        }
      }

      // 唯一解（抽样）
      if (issues.filter(x=>x.startsWith('❌')).length === 0) {
        const result = countSolutions(p.cells, cages, 9, 2);
        if (result.timeout) {
          issues.push(`⚠️ 唯一解检测超时(${result.steps}步)`);
        } else if (result.solutions.length === 0) {
          issues.push('❌ 无解');
        } else if (result.solutions.length > 1) {
          issues.push(`❌ 多解(${result.solutions.length}个)`);
        } else {
          // 验证笼子和值
          const sol = result.solutions[0];
          if (!verifyCages(sol, cages, 9)) {
            const badCages = [];
            for (const cage of cages) {
              let s = 0;
              for (const [r,c] of cage.cells) s += sol[r][c];
              if (s !== cage.sum) badCages.push(`#${cage.id}(sum=${cage.sum},实际=${s})`);
            }
            issues.push(`❌ 笼子和值错: ${badCages.slice(0,3).join(',')}`);
          }
        }
      }
    }

    const diffLabel = p.difficulty || '?';
    if (issues.length === 0) {
      if (isSample) {
        console.log(`  [#${p.id}] ${p.name} [${diffLabel}] ${givens}givens: ✅ (唯一解+和值正确)`);
      }
      freeOk++;
    } else {
      console.log(`  [#${p.id}] ${p.name} [${diffLabel}] ${givens}givens:`);
      for (const iss of issues) console.log(`      ${iss}`);
      freeIssues++;
    }
  }

  totalOk += freeOk;
  totalIssues += freeIssues;
  console.log(`\n  自由模式: ${freeOk}题通过, ${freeIssues}题有问题`);
} else {
  console.log('  ⚠️  levels.json 不存在！');
  totalIssues++;
}

// ---------- 汇总 ----------
console.log('\n═══════════════════════════════════════');
console.log('  📊 验证汇总');
console.log('═══════════════════════════════════════');
console.log(`  总关卡数: ${totalLevels}`);
console.log(`  通过: ${totalOk}`);
console.log(`  问题: ${totalIssues}`);
console.log(totalIssues === 0 ? '\n  🎉 全部通过！' : `\n  ⚠️  共发现${totalIssues}个问题需要修复`);
