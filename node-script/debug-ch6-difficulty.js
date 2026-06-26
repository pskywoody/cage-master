// 测试3-5格笼的难度分布
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

function testConfig(minSize, maxSize, label, targetUnique = 30, maxAttempts = 300) {
  let uniqueCount = 0;
  let attempts = 0;
  const scores = [];

  console.log(`\n=== ${label} (${minSize}-${maxSize}格笼) ===`);
  const startTime = Date.now();

  while (uniqueCount < targetUnique && attempts < maxAttempts) {
    attempts++;
    const solution = generateSolution();
    const cages = fillRemainingCages(solution, [], minSize, maxSize);
    if (!cages) continue;

    const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
    const solver = new KillerSudokuSolver(grid, cages);
    solver.solve(2);
    if (solver.solutions.length !== 1) continue;

    uniqueCount++;
    const rating = quickRateDifficulty(grid, cages);
    scores.push(rating.score);
  }

  const elapsed = (Date.now() - startTime) / 1000;
  scores.sort((a, b) => a - b);
  console.log(`  唯一解: ${uniqueCount}/${attempts} (${(uniqueCount/attempts*100).toFixed(1)}%)`);
  console.log(`  耗时: ${elapsed.toFixed(1)}s`);
  if (scores.length > 0) {
    console.log(`  分数: ${scores[0]} - ${scores[scores.length-1]}`);
    console.log(`  中位数: ${scores[Math.floor(scores.length/2)]}`);
    console.log(`  平均分: ${(scores.reduce((a,b)=>a+b,0)/scores.length).toFixed(1)}`);
    console.log(`  80+: ${scores.filter(s => s >= 80).length}`);
    console.log(`  85+: ${scores.filter(s => s >= 85).length}`);
    console.log(`  90+: ${scores.filter(s => s >= 90).length}`);
  }
}

testConfig(2, 3, '2-3格笼');
testConfig(2, 4, '2-4格笼');
testConfig(3, 4, '3-4格笼');
testConfig(3, 5, '3-5格笼');
