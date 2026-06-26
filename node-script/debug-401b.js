// 调试401关
const { KillerSudokuSolver, quickRateDifficulty } = require('./solver-rater');

const SIZE = 9;

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function isValidPlacement(grid, r, c, num) {
  for (let i = 0; i < SIZE; i++) {
    if (grid[r][i] === num) return false;
    if (grid[i][c] === num) return false;
  }
  const boxR = Math.floor(r / 3) * 3;
  const boxC = Math.floor(c / 3) * 3;
  for (let i = boxR; i < boxR + 3; i++) {
    for (let j = boxC; j < boxC + 3; j++) {
      if (grid[i][j] === num) return false;
    }
  }
  return true;
}

function fillGrid(grid) {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) {
        const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
        for (const num of nums) {
          if (isValidPlacement(grid, r, c, num)) {
            grid[r][c] = num;
            if (fillGrid(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function generateSolution() {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  fillGrid(grid);
  return grid;
}

function calcCageSum(cells, solution) {
  return cells.reduce((sum, [r, c]) => sum + solution[r][c], 0);
}

function getAssignedCells(cages) {
  const assigned = new Set();
  for (const cage of cages) {
    for (const [r, c] of cage.cells) {
      assigned.add(`${r},${c}`);
    }
  }
  return assigned;
}

function fillRemainingCages(solution, fixedCages, minSize, maxSize) {
  const assignedSet = getAssignedCells(fixedCages);
  const cages = [...fixedCages];
  let nextId = cages.length > 0 ? Math.max(...cages.map(c => c.id)) + 1 : 1;

  const unassigned = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!assignedSet.has(`${r},${c}`)) {
        unassigned.push([r, c]);
      }
    }
  }

  const seedOrder = shuffle(unassigned);

  for (const [sr, sc] of seedOrder) {
    if (assignedSet.has(`${sr},${sc}`)) continue;

    const targetSize = randInt(minSize, maxSize);
    const cageCells = [[sr, sc]];
    assignedSet.add(`${sr},${sc}`);
    const cageNums = new Set([solution[sr][sc]]);

    const frontier = [[sr, sc]];
    while (cageCells.length < targetSize && frontier.length > 0) {
      const idx = randInt(0, frontier.length - 1);
      const [cr, cc] = frontier[idx];

      const neighbors = [];
      const safeNeighbors = [];
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        const nr = cr + dr, nc = cc + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && !assignedSet.has(`${nr},${nc}`)) {
          neighbors.push([nr, nc]);
          if (!cageNums.has(solution[nr][nc])) {
            safeNeighbors.push([nr, nc]);
          }
        }
      }

      if (neighbors.length === 0) {
        frontier.splice(idx, 1);
        continue;
      }

      const pool = safeNeighbors.length > 0 ? safeNeighbors : neighbors;
      const pick = pool[randInt(0, pool.length - 1)];
      cageCells.push(pick);
      cageNums.add(solution[pick[0]][pick[1]]);
      assignedSet.add(`${pick[0]},${pick[1]}`);
      frontier.push(pick);
    }

    cageCells.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    cages.push({
      id: nextId++,
      sum: calcCageSum(cageCells, solution),
      cells: cageCells
    });
  }

  const allAssigned = assignedSet.size === SIZE * SIZE;
  if (!allAssigned) return null;

  return cages;
}

function analyze45Rule(cages, regionType, regionId) {
  const regionCells = new Set();
  if (regionType === 'row') {
    for (let c = 0; c < SIZE; c++) regionCells.add(`${regionId},${c}`);
  }
  
  let fullyInsideSum = 0;
  const insideCrossingCells = [];
  const outsideCrossingCells = [];
  
  for (const cage of cages) {
    let inside = 0;
    let outside = 0;
    const inCells = [];
    const outCells = [];
    
    for (const [r, c] of cage.cells) {
      if (regionCells.has(`${r},${c}`)) {
        inside++;
        inCells.push([r, c]);
      } else {
        outside++;
        outCells.push([r, c]);
      }
    }
    
    if (outside === 0) {
      fullyInsideSum += cage.sum;
    } else if (inside > 0) {
      insideCrossingCells.push(...inCells);
      outsideCrossingCells.push(...outCells);
    }
  }
  
  return {
    fullyInsideSum,
    insideCrossingCount: insideCrossingCells.length,
    outsideCrossingCount: outsideCrossingCells.length,
    insideCrossingCells,
    outsideCrossingCells
  };
}

// 测试：生成100次，统计各阶段
let stats = {
  attempts: 0,
  unique: 0,
  row0_has_1_cross_inside: 0,
  row0_has_1_cross_outside: 0,
  value_correct: 0,
  easy_difficulty: 0
};

for (let i = 0; i < 200; i++) {
  const solution = generateSolution();
  stats.attempts++;

  if (solution[0][0] === solution[0][1]) continue;
  if (solution[0][2] === solution[0][3]) continue;
  if (solution[0][4] === solution[0][5]) continue;
  if (solution[0][6] === solution[0][7]) continue;
  if (solution[0][8] === solution[1][8]) continue;

  const fixedCages = [
    { id: 1, sum: solution[0][0] + solution[0][1], cells: [[0, 0], [0, 1]] },
    { id: 2, sum: solution[0][2] + solution[0][3], cells: [[0, 2], [0, 3]] },
    { id: 3, sum: solution[0][4] + solution[0][5], cells: [[0, 4], [0, 5]] },
    { id: 4, sum: solution[0][6] + solution[0][7], cells: [[0, 6], [0, 7]] },
    { id: 5, sum: solution[0][8] + solution[1][8], cells: [[0, 8], [1, 8]] },
  ];

  const cages = fillRemainingCages(solution, fixedCages, 2, 3);
  if (!cages) continue;

  // 检查唯一解
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const solver = new KillerSudokuSolver(grid, cages);
  solver.solve(2);
  if (solver.solutions.length !== 1) continue;
  stats.unique++;

  // 检查行0的45法则
  const row0Analysis = analyze45Rule(cages, 'row', 0);
  
  if (stats.unique <= 5) {
    console.log(`\n样本 ${stats.unique}:`);
    console.log(`  行0完全在内部的笼子和: ${row0Analysis.fullyInsideSum}`);
    console.log(`  行0内跨笼格数: ${row0Analysis.insideCrossingCount}`);
    console.log(`  行0外跨笼格数: ${row0Analysis.outsideCrossingCount}`);
    console.log(`  行0内跨笼格: ${JSON.stringify(row0Analysis.insideCrossingCells)}`);
  }
  
  if (row0Analysis.insideCrossingCount === 1) {
    stats.row0_has_1_cross_inside++;
    const val = 45 - row0Analysis.fullyInsideSum;
    const [r, c] = row0Analysis.insideCrossingCells[0];
    if (val === solution[r][c]) stats.value_correct++;
  }
  if (row0Analysis.outsideCrossingCount === 1) {
    stats.row0_has_1_cross_outside++;
  }

  // 难度
  const rating = quickRateDifficulty(grid, cages);
  if (rating.score <= 42) stats.easy_difficulty++;
}

console.log('\n=== 401关生成统计 ===');
console.log(`  总尝试: ${stats.attempts}`);
console.log(`  唯一解: ${stats.unique}`);
console.log(`  行0恰好1个跨笼格(在内): ${stats.row0_has_1_cross_inside}`);
console.log(`  行0恰好1个跨笼格(在外): ${stats.row0_has_1_cross_outside}`);
console.log(`  值正确: ${stats.value_correct}`);
console.log(`  简单难度(≤42分): ${stats.easy_difficulty}`);
