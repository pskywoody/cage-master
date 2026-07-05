// ==========================================
//  杀手数独题库质量审计脚本（快速版）
// ==========================================
// 快速检查：笼子冲突、数字重复、笼子和值错误
// 唯一解验证：每个文件抽样5题

const fs = require('fs');
const path = require('path');

// ========== 快速唯一解验证器（带组合表加速） ==========
function createFastSolver() {
  // 预计算笼子组合
  const CAGE_COMBOS = {};
  function generateCombos(size, target, start = 1, current = []) {
    if (size === 0) {
      if (target === 0) return [current.slice()];
      return [];
    }
    const results = [];
    for (let i = start; i <= 9; i++) {
      if (i > target) break;
      current.push(i);
      results.push(...generateCombos(size - 1, target - i, i + 1, current));
      current.pop();
    }
    return results;
  }
  for (let s = 1; s <= 9; s++) {
    CAGE_COMBOS[s] = {};
    for (let sum = s; sum <= s * 9 - (s - 1) * s / 2; sum++) {
      CAGE_COMBOS[s][sum] = generateCombos(s, sum);
    }
  }

  function solve(board, cages) {
    // 找候选最少的格子
    let bestRow = -1, bestCol = -1, bestCandidates = null;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === 0) {
          const cands = getCandidates(board, cages, r, c);
          if (cands.length === 0) return false;
          if (bestCandidates === null || cands.length < bestCandidates.length) {
            bestRow = r;
            bestCol = c;
            bestCandidates = cands;
            if (cands.length === 1) break;
          }
        }
      }
      if (bestCandidates && bestCandidates.length === 1) break;
    }

    if (bestRow === -1) return true; // 完成

    for (const num of bestCandidates) {
      board[bestRow][bestCol] = num;
      if (solve(board, cages)) return true;
      board[bestRow][bestCol] = 0;
    }
    return false;
  }

  function getCandidates(board, cages, row, col) {
    const used = new Set();
    // 行/列/宫
    for (let i = 0; i < 9; i++) {
      if (board[row][i]) used.add(board[row][i]);
      if (board[i][col]) used.add(board[i][col]);
    }
    const br = Math.floor(row / 3) * 3, bc = Math.floor(col / 3) * 3;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[br+i][bc+j]) used.add(board[br+i][bc+j]);
      }
    }
    const cands = [];
    for (let n = 1; n <= 9; n++) {
      if (!used.has(n)) cands.push(n);
    }
    // 笼子约束
    if (cages) {
      for (const cage of cages) {
        const inCage = cage.cells.some(c => c[0] === row && c[1] === col);
        if (inCage) {
          let currentSum = 0;
          let emptyCount = 0;
          const cageUsed = new Set();
          for (const cell of cage.cells) {
            const v = board[cell[0]][cell[1]];
            if (v === 0) {
              emptyCount++;
            } else {
              currentSum += v;
              cageUsed.add(v);
            }
          }
          const remaining = cage.sum - currentSum;
          // 过滤不可能的数字
          return cands.filter(n => {
            if (cageUsed.has(n)) return false;
            const minRest = emptyCount === 1 ? 0 : (emptyCount - 1) * emptyCount / 2;
            const maxRest = emptyCount === 1 ? 0 : (9 + (9 - emptyCount + 2)) * (emptyCount - 1) / 2;
            if (n + minRest > remaining) return false;
            if (n + maxRest < remaining) return false;
            return true;
          });
        }
      }
    }
    return cands;
  }

  function countSolutions(board, cages, limit = 2) {
    const boardCopy = board.map(r => [...r]);
    let count = 0;

    function backtrack() {
      if (count >= limit) return;
      let bestR = -1, bestC = -1, bestCands = null;
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (boardCopy[r][c] === 0) {
            const cands = getCandidates(boardCopy, cages, r, c);
            if (cands.length === 0) return;
            if (bestCands === null || cands.length < bestCands.length) {
              bestR = r; bestC = c; bestCands = cands;
              if (cands.length === 1) break;
            }
          }
        }
        if (bestCands && bestCands.length === 1) break;
      }
      if (bestR === -1) {
        count++;
        return;
      }
      for (const n of bestCands) {
        boardCopy[bestR][bestC] = n;
        backtrack();
        boardCopy[bestR][bestC] = 0;
        if (count >= limit) return;
      }
    }

    backtrack();
    return count;
  }

  return { solve, countSolutions };
}

// ========== 质量检查函数 ==========

function checkCageOverlap(cages) {
  const cellSet = new Set();
  const overlaps = [];
  for (const cage of cages) {
    for (const cell of cage.cells) {
      const key = cell[0] + ',' + cell[1];
      if (cellSet.has(key)) {
        overlaps.push(key);
      }
      cellSet.add(key);
    }
  }
  return overlaps;
}

function checkCageBounds(cages) {
  const errors = [];
  for (let i = 0; i < cages.length; i++) {
    const cage = cages[i];
    for (const cell of cage.cells) {
      if (cell[0] < 0 || cell[0] > 8 || cell[1] < 0 || cell[1] > 8) {
        errors.push('笼子' + (cage.id || i) + '的格子(' + cell[0] + ',' + cell[1] + ')越界');
      }
    }
  }
  return errors;
}

function checkCageSums(cages, solution) {
  if (!solution) return [];
  const errors = [];
  for (let i = 0; i < cages.length; i++) {
    const cage = cages[i];
    let sum = 0;
    for (const cell of cage.cells) {
      sum += solution[cell[0]][cell[1]];
    }
    if (sum !== cage.sum) {
      errors.push('笼子' + (cage.id || i) + '和值错误：标记' + cage.sum + '，实际' + sum);
    }
  }
  return errors;
}

function checkGivenNumbers(board) {
  const errors = [];
  for (let i = 0; i < 9; i++) {
    const rowSet = new Set();
    const colSet = new Set();
    for (let j = 0; j < 9; j++) {
      if (board[i][j] !== 0) {
        if (rowSet.has(board[i][j])) errors.push('第' + i + '行重复数字 ' + board[i][j]);
        rowSet.add(board[i][j]);
      }
      if (board[j][i] !== 0) {
        if (colSet.has(board[j][i])) errors.push('第' + i + '列重复数字 ' + board[j][i]);
        colSet.add(board[j][i]);
      }
    }
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const boxSet = new Set();
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
          const v = board[br*3+i][bc*3+j];
          if (v !== 0) {
            if (boxSet.has(v)) errors.push('宫(' + br + ',' + bc + ')重复数字 ' + v);
            boxSet.add(v);
          }
        }
      }
    }
  }
  return errors;
}

function getBoard(puzzle) {
  return puzzle.boardData || puzzle.cells || puzzle.board;
}

function auditFile(filePath, label, sampleCount = 5) {
  console.log('\n' + '='.repeat(60));
  console.log('审计: ' + label);
  console.log('文件: ' + path.basename(filePath));
  console.log('='.repeat(60));

  if (!fs.existsSync(filePath)) {
    console.log('✗ 文件不存在');
    return null;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const puzzles = data.puzzles || data;
  const solver = createFastSolver();

  const total = puzzles.length;
  let structuralErrors = 0;
  let sumErrors = 0;
  let multiSolution = 0;
  const errorSamples = [];

  console.log('总题数: ' + total);
  console.log('');

  for (let i = 0; i < total; i++) {
    const puzzle = puzzles[i];
    const board = getBoard(puzzle);
    const cages = puzzle.cages;
    const solution = puzzle.solution;

    if (!board || !cages) continue;

    const errors = [];

    // 结构检查
    const boundErrors = checkCageBounds(cages);
    if (boundErrors.length > 0) errors.push(...boundErrors);

    const overlaps = checkCageOverlap(cages);
    if (overlaps.length > 0) {
      errors.push('笼子重叠: ' + overlaps.length + '个格子');
    }

    const givenErrors = checkGivenNumbers(board);
    if (givenErrors.length > 0) errors.push(...givenErrors);

    // 和值检查
    if (solution) {
      const sumErrs = checkCageSums(cages, solution);
      if (sumErrs.length > 0) {
        sumErrors++;
        errors.push(...sumErrs);
      }
    }

    if (errors.length > 0) {
      structuralErrors++;
      if (errorSamples.length < 3) {
        errorSamples.push({
          index: i,
          id: puzzle.id || puzzle.name || '#' + i,
          errors: errors
        });
      }
    }

    if ((i + 1) % 200 === 0) {
      console.log('  进度: ' + (i + 1) + '/' + total);
    }
  }

  // 抽样唯一解验证
  console.log('\n抽样验证唯一解 (' + sampleCount + '题)...');
  let sampleChecked = 0;
  for (let i = 0; i < total && sampleChecked < sampleCount; i++) {
    const puzzle = puzzles[i];
    const board = getBoard(puzzle);
    const cages = puzzle.cages;
    if (!board || !cages) continue;

    const t0 = Date.now();
    const count = solver.countSolutions(board, cages, 2);
    const t = Date.now() - t0;

    const id = puzzle.id || puzzle.name || '#' + i;
    if (count === 0) {
      console.log('  ✗ [' + id + '] 无解 (' + t + 'ms)');
      multiSolution++;
    } else if (count > 1) {
      console.log('  ⚠ [' + id + '] 多解 (至少' + count + '个, ' + t + 'ms)');
      multiSolution++;
    } else {
      console.log('  ✓ [' + id + '] 唯一解 (' + t + 'ms)');
    }
    sampleChecked++;
  }

  console.log('\n审计结果:');
  console.log('  结构错误: ' + structuralErrors + '/' + total);
  if (sumErrors > 0 || (puzzles[0] && puzzles[0].solution)) {
    console.log('  和值错误: ' + sumErrors + '/' + total);
  }
  console.log('  抽样多解/无解: ' + multiSolution + '/' + sampleChecked);

  if (errorSamples.length > 0) {
    console.log('\n错误样本:');
    for (const s of errorSamples) {
      console.log('  [' + s.id + ']');
      for (const e of s.errors) console.log('    ✗ ' + e);
    }
  }

  const passed = structuralErrors === 0 && multiSolution === 0;
  console.log(passed ? '\n✓ 合格' : '\n✗ 不合格');

  return { total, structuralErrors, sumErrors, multiSolution, passed };
}

// ========== 主程序 ==========

const baseDir = path.join(__dirname, '..', 'game-src', 'data');

const files = [
  { path: path.join(baseDir, 'levels-killer.json'), label: '主关卡 levels-killer.json', sample: 3 },
  { path: path.join(baseDir, 'levels.json'), label: '扩展关卡 levels.json', sample: 3 },
  { path: path.join(baseDir, 'puzzles', 'v6', 'killer-pure-1star.json'), label: 'V6 纯杀手1星', sample: 2 },
  { path: path.join(baseDir, 'puzzles', 'v6', 'killer-pure-2star.json'), label: 'V6 纯杀手2星', sample: 2 },
  { path: path.join(baseDir, 'puzzles', 'v6', 'killer-pure-3star.json'), label: 'V6 纯杀手3星', sample: 2 },
  { path: path.join(baseDir, 'puzzles', 'v6', 'killer-pure-4star.json'), label: 'V6 纯杀手4星', sample: 2 },
  { path: path.join(baseDir, 'puzzles', 'v6', 'killer-pure-5star.json'), label: 'V6 纯杀手5星', sample: 2 },
  { path: path.join(baseDir, 'puzzles', 'seeds', 'all-killer-seeds.json'), label: '种子题库', sample: 5 },
];

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║           杀手数独题库质量审计（快速版）                   ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('检查项: 笼子重叠/越界、预填数字冲突、笼子和值错误、唯一解抽样');

let grandTotal = 0;
let grandErrors = 0;
let allPassed = true;

for (const file of files) {
  const result = auditFile(file.path, file.label, file.sample);
  if (result) {
    grandTotal += result.total;
    grandErrors += result.structuralErrors;
    if (!result.passed) allPassed = false;
  }
}

console.log('\n\n' + '='.repeat(60));
console.log('总审计结果');
console.log('='.repeat(60));
console.log('总题数: ' + grandTotal);
console.log('结构错误: ' + grandErrors);
console.log('合格率: ' + ((grandTotal - grandErrors) / grandTotal * 100).toFixed(2) + '%');
console.log('');
console.log(allPassed ? '✓ 所有题库质量合格' : '⚠ 存在质量问题，建议重新生成');

process.exit(allPassed ? 0 : 1);
