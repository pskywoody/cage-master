// ==========================================
// Seed Puzzle Generator - 从完整解生成杀手数独
// 使用种子生长法生成自然的笼子布局
// ==========================================

const fs = require('fs');
const path = require('path');
const { solve, validateCages, printGrid, cloneGrid } = require('./puzzle-builder');

// 生成一个有效的杀手数独解
function generateSolution(seed = null) {
  if (seed) {
    // 使用简单的固定种子解
    const s = [
      [4,8,3,9,2,1,6,5,7],
      [9,6,7,3,4,5,8,2,1],
      [2,5,1,8,7,6,4,9,3],
      [5,4,8,1,3,2,9,7,6],
      [7,2,9,5,6,4,1,3,8],
      [1,3,6,7,9,8,2,4,5],
      [3,7,2,6,8,9,5,1,4],
      [8,1,4,2,5,3,7,6,9],
      [6,9,5,4,1,7,3,8,2]
    ];
    // 用数字映射变换
    return mapDigits(s);
  }
  return generateRandomSolution();
}

function mapDigits(grid) {
  const perm = [1,2,3,4,5,6,7,8,9].sort(() => Math.random() - 0.5);
  const map = [0, ...perm];
  return grid.map(row => row.map(v => map[v]));
}

function generateRandomSolution() {
  const g = Array.from({length:9}, () => new Array(9).fill(0));
  function isValid(r,c,v) {
    for (let i=0;i<9;i++) { if(g[r][i]===v||g[i][c]===v) return false; }
    const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3;
    for(let i=br;i<br+3;i++) for(let j=bc;j<bc+3;j++) if(g[i][j]===v) return false;
    return true;
  }
  function fill(idx) {
    if (idx >= 81) return true;
    const r=Math.floor(idx/9), c=idx%9;
    const nums=[1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5);
    for (const n of nums) {
      if (isValid(r,c,n)) { g[r][c]=n; if(fill(idx+1)) return true; g[r][c]=0; }
    }
    return false;
  }
  fill(0);
  return g;
}

// 种子生长法生成自然笼子布局
function generateCages(solution, targetCageSize = {min:2, max:5}) {
  const size = 9;
  const visited = Array.from({length:size}, () => new Array(size).fill(false));
  const cages = [];
  let id = 1;
  const dirs = [[0,1],[1,0],[0,-1],[-1,0]];

  // 获取所有未访问格子
  function getUnvisited() {
    const cells = [];
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (!visited[r][c]) cells.push([r,c]);
    return cells;
  }

  while (true) {
    const unvisited = getUnvisited();
    if (unvisited.length === 0) break;

    // 选一个起始格子（随机）
    const startIdx = Math.floor(Math.random() * unvisited.length);
    const [sr, sc] = unvisited[startIdx];
    
    // 随机决定笼子大小
    const maxSize = Math.min(targetCageSize.max, Math.min(
      Math.floor(Math.random() * (targetCageSize.max - targetCageSize.min + 1)) + targetCageSize.min,
      unvisited.length
    ));
    
    const cageCells = [[sr, sc]];
    visited[sr][sc] = true;
    let sum = solution[sr][sc];

    // 生长：从笼子边缘随机选择相邻未访问格子
    while (cageCells.length < maxSize) {
      const frontier = [];
      for (const [r, c] of cageCells) {
        for (const [dr, dc] of dirs) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < size && nc >= 0 && nc < size && !visited[nr][nc]) {
            // 检查是否已在frontier
            if (!frontier.some(([fr,fc]) => fr===nr && fc===nc)) {
              frontier.push([nr, nc]);
            }
          }
        }
      }
      if (frontier.length === 0) break;
      const nextIdx = Math.floor(Math.random() * frontier.length);
      const [nr, nc] = frontier[nextIdx];
      cageCells.push([nr, nc]);
      visited[nr][nc] = true;
      sum += solution[nr][nc];
    }

    cages.push({ id: id++, sum, cells: cageCells });
  }

  return cages;
}

// 通过移除数字来生成谜题（保留足够的数字使唯一解）
function generatePuzzle(solution, cages, difficulty = 'medium') {
  const givens = cloneGrid(solution);
  const removalTargets = {
    'easy': 30,
    'medium': 40,
    'hard': 50
  };
  const targetRemovals = removalTargets[difficulty] || 40;
  
  // 逐个移除数字，保持唯一解
  const positions = [];
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      positions.push([r, c]);
  positions.sort(() => Math.random() - 0.5);

  let removed = 0;
  for (const [r, c] of positions) {
    if (removed >= targetRemovals) break;
    const backup = givens[r][c];
    givens[r][c] = 0;
    // 检查唯一解（简化：使用简单约束传播检查，如果还有唯一解就保留）
    const solutions = solve(givens, 9);
    if (solutions.length !== 1) {
      givens[r][c] = backup; // 放回
    } else {
      removed++;
    }
  }

  return givens;
}

// 生成一道完整的杀手数独
function generateKillerSudoku(difficulty = 'medium') {
  const solution = generateSolution();
  const cages = generateCages(solution);
  const boardData = generatePuzzle(solution, cages, difficulty);
  
  // 验证
  const cageValidation = validateCages(cages, solution);
  if (!cageValidation.valid) {
    console.error('Cage validation failed:', cageValidation.errors);
    return null;
  }
  
  const solutions = solve(boardData);
  if (solutions.length !== 1) {
    console.error('No unique solution!');
    return null;
  }

  return {
    gridSize: 9,
    solution,
    cages,
    boardData,
    difficulty
  };
}

// 生成多道题
function generateBatch(count, difficulty = 'medium') {
  const puzzles = [];
  for (let i = 0; i < count; i++) {
    let p = null;
    let attempts = 0;
    while (!p && attempts < 20) {
      p = generateKillerSudoku(difficulty);
      attempts++;
    }
    if (p) puzzles.push(p);
  }
  return puzzles;
}

// CLI入口
if (require.main === module) {
  const args = process.argv.slice(2);
  const count = parseInt(args[0]) || 5;
  const diff = args[1] || 'medium';
  
  console.log(`Generating ${count} ${diff} killer sudoku puzzles...`);
  const puzzles = generateBatch(count, diff);
  console.log(`Generated ${puzzles.length} puzzles.`);
  
  if (puzzles.length > 0) {
    const p = puzzles[0];
    console.log('\nFirst puzzle:');
    printGrid(p.boardData);
    console.log(`Givens: ${p.boardData.flat().filter(v=>v>0).length}`);
    console.log(`Cages: ${p.cages.length}`);
    console.log('Cage validation:', validateCages(p.cages, p.solution).valid);
  }
  
  // 保存
  const outPath = path.join(__dirname, '..', 'game-src', 'data', 'puzzles', 'generated.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(puzzles, null, 2));
  console.log(`\nSaved to ${outPath}`);
}

module.exports = { generateSolution, generateCages, generatePuzzle, generateKillerSudoku, generateBatch, mapDigits };
