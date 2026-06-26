// 调试401关难度分布
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

// 统计不同配置下的难度分布
const configs = [
  { name: '2-3格笼，固定行0设计', minSize: 2, maxSize: 3, hasFixed: true },
  { name: '1-3格笼，固定行0设计', minSize: 1, maxSize: 3, hasFixed: true },
  { name: '2-3格笼，无固定', minSize: 2, maxSize: 3, hasFixed: false },
  { name: '1-2格笼，无固定', minSize: 1, maxSize: 2, hasFixed: false },
];

for (const config of configs) {
  const scores = [];
  let uniqueCount = 0;
  let attempts = 0;
  
  while (uniqueCount < 30 && attempts < 300) {
    attempts++;
    const solution = generateSolution();
    
    let fixedCages = [];
    if (config.hasFixed) {
      if (solution[0][0] === solution[0][1]) continue;
      if (solution[0][2] === solution[0][3]) continue;
      if (solution[0][4] === solution[0][5]) continue;
      if (solution[0][6] === solution[0][7]) continue;
      if (solution[0][8] === solution[1][8]) continue;

      fixedCages = [
        { id: 1, sum: solution[0][0] + solution[0][1], cells: [[0, 0], [0, 1]] },
        { id: 2, sum: solution[0][2] + solution[0][3], cells: [[0, 2], [0, 3]] },
        { id: 3, sum: solution[0][4] + solution[0][5], cells: [[0, 4], [0, 5]] },
        { id: 4, sum: solution[0][6] + solution[0][7], cells: [[0, 6], [0, 7]] },
        { id: 5, sum: solution[0][8] + solution[1][8], cells: [[0, 8], [1, 8]] },
      ];
    }

    const cages = fillRemainingCages(solution, fixedCages, config.minSize, config.maxSize);
    if (!cages) continue;

    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    const solver = new KillerSudokuSolver(grid, cages);
    solver.solve(2);
    if (solver.solutions.length !== 1) continue;
    
    uniqueCount++;
    const rating = quickRateDifficulty(grid, cages);
    scores.push(rating.score);
  }
  
  scores.sort((a, b) => a - b);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const min = scores[0];
  const max = scores[scores.length - 1];
  const median = scores[Math.floor(scores.length / 2)];
  
  console.log(`\n=== ${config.name} ===`);
  console.log(`  样本数: ${uniqueCount} (尝试${attempts}次)`);
  console.log(`  分数范围: ${min} - ${max}`);
  console.log(`  平均分: ${avg.toFixed(1)}`);
  console.log(`  中位数: ${median}`);
  console.log(`  简单(<=42): ${scores.filter(s => s <= 42).length}`);
  console.log(`  中等(43-64): ${scores.filter(s => s > 42 && s < 65).length}`);
  console.log(`  困难(>=65): ${scores.filter(s => s >= 65).length}`);
}
