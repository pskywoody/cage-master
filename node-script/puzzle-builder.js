// ==========================================
// Seed Puzzle Constructor
// 手工构造高级技巧示范题，自动验证
// ==========================================

const FACT = require('./puzzle-transformer');

// 辅助：创建空网格
function emptyGrid(size = 9) {
  return Array.from({ length: size }, () => new Array(size).fill(0));
}

// 辅助：深拷贝网格
function cloneGrid(grid) {
  return grid.map(row => [...row]);
}

// 基础求解器：用约束传播+回溯验证唯一解
function solve(grid, size = 9, allSolutions = false) {
  const boxH = size === 9 ? 3 : size === 6 ? 2 : 2;
  const boxW = size === 9 ? 3 : size === 6 ? 3 : 2;

  const solutions = [];
  const g = cloneGrid(grid);

  function getCandidates(r, c) {
    if (g[r][c] !== 0) return new Set([g[r][c]]);
    const used = new Set();
    // 行
    for (let i = 0; i < size; i++) { if (g[r][i]) used.add(g[r][i]); }
    // 列
    for (let i = 0; i < size; i++) { if (g[i][c]) used.add(g[i][c]); }
    // 宫
    const br = Math.floor(r / boxH) * boxH;
    const bc = Math.floor(c / boxW) * boxW;
    for (let i = br; i < br + boxH; i++)
      for (let j = bc; j < bc + boxW; j++)
        if (g[i][j]) used.add(g[i][j]);
    const cands = new Set();
    for (let v = 1; v <= size; v++) if (!used.has(v)) cands.add(v);
    return cands;
  }

  function getAllCandidates() {
    const cands = [];
    for (let r = 0; r < size; r++) {
      cands[r] = [];
      for (let c = 0; c < size; c++) {
        cands[r][c] = getCandidates(r, c);
      }
    }
    return cands;
  }

  function nakedSingles() {
    let progress = false;
    const cands = getAllCandidates();
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (g[r][c] === 0 && cands[r][c].size === 1) {
          g[r][c] = [...cands[r][c]][0];
          progress = true;
        }
      }
    }
    return progress;
  }

  function hiddenSingles() {
    let progress = false;
    // 行
    for (let r = 0; r < size; r++) {
      for (let v = 1; v <= size; v++) {
        let count = 0, col = -1;
        for (let c = 0; c < size; c++) {
          if (g[r][c] === v) { count = 2; break; }
          if (g[r][c] === 0 && getCandidates(r, c).has(v)) { count++; col = c; }
        }
        if (count === 1) { g[r][col] = v; progress = true; }
      }
    }
    // 列
    for (let c = 0; c < size; c++) {
      for (let v = 1; v <= size; v++) {
        let count = 0, row = -1;
        for (let r = 0; r < size; r++) {
          if (g[r][c] === v) { count = 2; break; }
          if (g[r][c] === 0 && getCandidates(r, c).has(v)) { count++; row = r; }
        }
        if (count === 1) { g[row][c] = v; progress = true; }
      }
    }
    return progress;
  }

  function solveConstraints() {
    let progress = true;
    while (progress) {
      progress = false;
      if (nakedSingles()) progress = true;
      if (hiddenSingles()) progress = true;
    }
  }

  function findEmpty() {
    let minCands = size + 1, bestR = -1, bestC = -1;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (g[r][c] === 0) {
          const cs = getCandidates(r, c);
          if (cs.size < minCands) { minCands = cs.size; bestR = r; bestC = c; }
        }
      }
    }
    return [bestR, bestC, minCands];
  }

  function backtrack() {
    solveConstraints();
    const [r, c, n] = findEmpty();
    if (r === -1) { solutions.push(cloneGrid(g)); return solutions.length >= 2; }
    if (n === 0) return false;
    const cands = [...getCandidates(r, c)];
    for (const v of cands) {
      g[r][c] = v;
      const snapshot = cloneGrid(g);
      if (backtrack()) return true;
      for (let i = 0; i < size; i++) g[i] = [...snapshot[i]];
      g[r][c] = 0;
    }
    return false;
  }

  backtrack();
  return solutions;
}

// 验证笼子合法性
function validateCages(cages, solution, size = 9) {
  const errors = [];
  const covered = new Set();

  for (const cage of cages) {
    let actualSum = 0;
    for (const [r, c] of cage.cells) {
      if (r < 0 || r >= size || c < 0 || c >= size) {
        errors.push(`Cage ${cage.id} has out-of-bounds cell (${r},${c})`);
        continue;
      }
      const key = `${r},${c}`;
      if (covered.has(key)) errors.push(`Cell (${r},${c}) in multiple cages`);
      covered.add(key);
      actualSum += solution[r][c];
    }
    if (actualSum !== cage.sum) {
      errors.push(`Cage ${cage.id} sum=${cage.sum} but actual=${actualSum}`);
    }
  }

  if (covered.size !== size * size) {
    errors.push(`Cages cover ${covered.size}/${size * size} cells`);
  }

  return { valid: errors.length === 0, errors };
}

// 打印网格
function printGrid(grid, size = 9) {
  for (let r = 0; r < size; r++) {
    console.log(grid[r].map(v => v === 0 ? '.' : v).join(' '));
  }
}

// 导出
module.exports = { emptyGrid, cloneGrid, solve, validateCages, printGrid, FACT };
