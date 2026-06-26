// 快速调试401关生成问题
const fs = require('fs');
const path = require('path');
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

function isCageConnected(cells) {
  if (cells.length <= 1) return true;
  const cellSet = new Set(cells.map(([r, c]) => `${r},${c}`));
  const visited = new Set();
  const queue = [cells[0]];
  visited.add(`${cells[0][0]},${cells[0][1]}`);
  while (queue.length > 0) {
    const [r, c] = queue.shift();
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const key = `${r + dr},${c + dc}`;
      if (cellSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push([r + dr, c + dc]);
      }
    }
  }
  return visited.size === cells.length;
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

function validateCages(cages, solution) {
  const covered = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  let totalCells = 0;
  for (const cage of cages) {
    const nums = new Set();
    for (const [r, c] of cage.cells) {
      if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return false;
      if (covered[r][c]) return false;
      covered[r][c] = true;
      totalCells++;
      nums.add(solution[r][c]);
    }
    if (nums.size !== cage.cells.length) return false;
    if (cage.sum !== calcCageSum(cage.cells, solution)) return false;
    if (!isCageConnected(cage.cells)) return false;
  }
  if (totalCells !== SIZE * SIZE) return false;
  return true;
}

function hasUniqueSolution(cages) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  const solver = new KillerSudokuSolver(grid, cages);
  solver.solve(2);
  return solver.getResult().unique;
}

function findSingleInnieOutie(cages, regionType, regionId) {
  const regionCells = new Set();
  if (regionType === 'row') {
    for (let c = 0; c < SIZE; c++) regionCells.add(`${regionId},${c}`);
  } else if (regionType === 'col') {
    for (let r = 0; r < SIZE; r++) regionCells.add(`${r},${regionId}`);
  } else if (regionType === 'box') {
    const br = Math.floor(regionId / 3) * 3;
    const bc = (regionId % 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) regionCells.add(`${r},${c}`);
    }
  }

  let insideSum = 0;
  const innieCells = [];
  const outieCells = [];

  for (const cage of cages) {
    let inside = 0;
    let outside = 0;
    const insideCellsArr = [];
    const outsideCellsArr = [];
    for (const [r, c] of cage.cells) {
      if (regionCells.has(`${r},${c}`)) {
        inside++;
        insideCellsArr.push([r, c]);
      } else {
        outside++;
        outsideCellsArr.push([r, c]);
      }
    }

    if (inside === cage.cells.length) {
      insideSum += cage.sum;
    } else if (inside > 0 && outside > 0) {
      if (inside === 1) {
        innieCells.push({ cell: insideCellsArr[0], cageSum: cage.sum, outsideCount: outside });
      }
      if (outside === 1) {
        outieCells.push({ cell: outsideCellsArr[0], cageSum: cage.sum, insideCount: inside });
      }
    }
  }

  if (innieCells.length === 1 && outieCells.length === 0) {
    return { type: 'innie', cell: innieCells[0].cell, value: 45 - insideSum };
  }
  if (outieCells.length === 1 && innieCells.length === 0) {
    const outie = outieCells[0];
    return { type: 'outie', cell: outie.cell, value: outie.cageSum + insideSum - 45 };
  }

  return null;
}

function rateDifficulty(cages) {
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  return quickRateDifficulty(grid, cages);
}

// 调试：生成100个401关候选，统计各阶段通过率
function debug401() {
  let totalAttempts = 200;
  let stats = {
    solution: 0,
    fixedCagesOk: 0,
    fillOk: 0,
    validateOk: 0,
    unique: 0,
    row45: 0,
    valueCorrect: 0,
    difficultyOk: 0
  };

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    const solution = generateSolution();
    stats.solution++;

    // 检查固定笼子的数字不重复条件
    if (solution[0][0] === solution[0][1]) continue;
    if (solution[0][2] === solution[0][3]) continue;
    if (solution[0][4] === solution[0][5]) continue;
    if (solution[0][6] === solution[0][7]) continue;
    if (solution[0][8] === solution[1][8]) continue;
    stats.fixedCagesOk++;

    const fixedCages = [
      { id: 1, sum: solution[0][0] + solution[0][1], cells: [[0, 0], [0, 1]] },
      { id: 2, sum: solution[0][2] + solution[0][3], cells: [[0, 2], [0, 3]] },
      { id: 3, sum: solution[0][4] + solution[0][5], cells: [[0, 4], [0, 5]] },
      { id: 4, sum: solution[0][6] + solution[0][7], cells: [[0, 6], [0, 7]] },
      { id: 5, sum: solution[0][8] + solution[1][8], cells: [[0, 8], [1, 8]] },
    ];

    const cages = fillRemainingCages(solution, fixedCages, 2, 3);
    if (!cages) continue;
    stats.fillOk++;

    if (!validateCages(cages, solution)) continue;
    stats.validateOk++;

    if (!hasUniqueSolution(cages)) continue;
    stats.unique++;

    const row0Result = findSingleInnieOutie(cages, 'row', 0);
    if (!row0Result) continue;
    stats.row45++;

    const [vr, vc] = row0Result.cell;
    if (row0Result.value !== solution[vr][vc]) continue;
    stats.valueCorrect++;

    const rating = rateDifficulty(cages);
    if (rating.difficulty !== '简单' && rating.score > 40) continue;
    stats.difficultyOk++;

    if (stats.difficultyOk === 1) {
      console.log('找到第一个符合条件的关卡！');
      console.log('  笼子数:', cages.length);
      console.log('  行0 45法则结果:', row0Result);
      console.log('  难度评分:', rating.score, rating.difficulty);
    }
  }

  console.log('\n=== 401关生成统计（200次尝试）===');
  console.log(`  生成解: ${stats.solution}`);
  console.log(`  固定笼合法: ${stats.fixedCagesOk}`);
  console.log(`  填充剩余成功: ${stats.fillOk}`);
  console.log(`  笼子验证通过: ${stats.validateOk}`);
  console.log(`  唯一解: ${stats.unique}`);
  console.log(`  行0有45法则: ${stats.row45}`);
  console.log(`  45法则值正确: ${stats.valueCorrect}`);
  console.log(`  难度符合(简单): ${stats.difficultyOk}`);
}

debug401();
