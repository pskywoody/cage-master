// ==========================================
// Killer Sudoku 变体引擎
// ==========================================
// 基于标准数独的合法变换，生成视觉不同但逻辑等价的题目
// 支持变换：数字置换、行互换、列互换、三行组互换、三列组互换
// 注意：Killer Sudoku需要同步变换笼子的位置和和值

const SIZE = 9;
const BOX = 3;

// ==========================================
// 随机数生成器（基于seed，确保可复现）
// ==========================================
function mulberry32(seed) {
  return function() {
    seed |= 0;
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ==========================================
// 生成随机排列
// ==========================================
function randomPermutation(n, rng) {
  const arr = Array.from({length: n}, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ==========================================
// 生成变换参数
// ==========================================
function generateTransformParams(seed) {
  const rng = mulberry32(seed);
  
  // 1. 数字置换：1-9的随机排列
  const digitPerm = randomPermutation(9, rng);
  // digitPerm[0] = 新的1对应原来的digitPerm[0]+1
  // 即：newDigit = digitPerm[oldDigit - 1] + 1
  
  // 2. 三行组排列：3个三行组的顺序
  const bandPerm = randomPermutation(3, rng);
  
  // 3. 三列组排列：3个三列组的顺序
  const stackPerm = randomPermutation(3, rng);
  
  // 4. 每个三行组内的行排列
  const rowPerms = [];
  for (let b = 0; b < 3; b++) {
    rowPerms.push(randomPermutation(3, rng));
  }
  
  // 5. 每个三列组内的列排列
  const colPerms = [];
  for (let b = 0; b < 3; b++) {
    colPerms.push(randomPermutation(3, rng));
  }
  
  return { digitPerm, bandPerm, stackPerm, rowPerms, colPerms };
}

// ==========================================
// 计算行映射：旧行号 -> 新行号
// ==========================================
function getRowMapping(params) {
  const { bandPerm, rowPerms } = params;
  const rowMap = new Array(SIZE);
  
  for (let newBand = 0; newBand < 3; newBand++) {
    const oldBand = bandPerm[newBand];
    for (let newRow = 0; newRow < 3; newRow++) {
      const oldRow = oldBand * 3 + rowPerms[oldBand][newRow];
      const newRowIdx = newBand * 3 + newRow;
      rowMap[oldRow] = newRowIdx;
    }
  }
  
  return rowMap;
}

// ==========================================
// 计算列映射：旧列号 -> 新列号
// ==========================================
function getColMapping(params) {
  const { stackPerm, colPerms } = params;
  const colMap = new Array(SIZE);
  
  for (let newStack = 0; newStack < 3; newStack++) {
    const oldStack = stackPerm[newStack];
    for (let newCol = 0; newCol < 3; newCol++) {
      const oldCol = oldStack * 3 + colPerms[oldStack][newCol];
      const newColIdx = newStack * 3 + newCol;
      colMap[oldCol] = newColIdx;
    }
  }
  
  return colMap;
}

// ==========================================
// 数字置换：旧数字 -> 新数字
// ==========================================
function getDigitMapping(params) {
  const { digitPerm } = params;
  // digitPerm[i] 表示原来的 (i+1) 变成 digitPerm[i] + 1
  // 不对，应该反过来：新数字 = digitPerm[旧数字-1] + 1
  const digitMap = new Array(10); // 1-9
  for (let old = 1; old <= 9; old++) {
    digitMap[old] = digitPerm[old - 1] + 1;
  }
  return digitMap;
}

// ==========================================
// 变换棋盘
// ==========================================
function transformBoard(board, params) {
  const rowMap = getRowMapping(params);
  const colMap = getColMapping(params);
  const digitMap = getDigitMapping(params);
  
  const newBoard = Array.from({length: SIZE}, () => Array(SIZE).fill(0));
  
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== 0) {
        const newR = rowMap[r];
        const newC = colMap[c];
        const newDigit = digitMap[board[r][c]];
        newBoard[newR][newC] = newDigit;
      }
    }
  }
  
  return newBoard;
}

// ==========================================
// 变换笼子
// ==========================================
function transformCages(cages, params) {
  const rowMap = getRowMapping(params);
  const colMap = getColMapping(params);
  const digitMap = getDigitMapping(params);
  
  return cages.map(cage => {
    // 变换每个格子的位置
    const newCells = cage.cells.map(([r, c]) => [rowMap[r], colMap[c]]);
    
    // 计算新的和值：每个数字都变了，所以和值也要重新计算
    // 但笼子的和值是"数字之和"，数字置换后和值也会变
    // 等等，不对！笼子的和值是固定的，不随数字置换而变
    // 因为笼子的和值是"1-9数字的和"，数字置换后数字变了，但和值也变了
    // 比如原来笼子是[1,2,3]和为6，置换后变成[4,5,6]和为15
    
    // 所以我们需要重新计算笼子的和值
    // 但我们没有原始笼子里的数字... 等等，我们有solution吗？
    
    // 不对，笼子的和值是题目的一部分，数字置换后和值确实会变
    // 因为笼子里的数字都变了，它们的和自然也变了
    
    // 所以如果只有笼子布局没有solution，我们无法直接计算新的和值
    // 但如果有solution，我们可以根据solution来计算新的和值
    
    // 这里先返回变换后的位置，和值需要额外计算
    return {
      id: cage.id,
      sum: cage.sum, // 暂时保留原值，需要用solution重新计算
      cells: newCells
    };
  });
}

// ==========================================
// 根据solution重新计算笼子的和值
// ==========================================
function recalculateCageSums(cages, solution) {
  return cages.map(cage => {
    let sum = 0;
    for (const [r, c] of cage.cells) {
      sum += solution[r][c];
    }
    return {
      ...cage,
      sum
    };
  });
}

// ==========================================
// 完整变换：棋盘 + 笼子 + solution
// ==========================================
function transformPuzzle(puzzle, seed) {
  const params = generateTransformParams(seed);
  
  // 变换棋盘
  const newBoard = transformBoard(puzzle.board || puzzle.grid, params);
  
  // 变换solution（如果有）
  let newSolution = null;
  if (puzzle.solution) {
    newSolution = transformBoard(puzzle.solution, params);
  }
  
  // 变换笼子位置
  const cages = puzzle.cages || [];
  let newCages = transformCages(cages, params);
  
  // 如果有solution，重新计算笼子和值
  if (newSolution) {
    newCages = recalculateCageSums(newCages, newSolution);
  }
  
  // 按位置排序笼子（保持一致性）
  newCages.sort((a, b) => {
    const [ar, ac] = a.cells[0];
    const [br, bc] = b.cells[0];
    if (ar !== br) return ar - br;
    return ac - bc;
  });
  
  // 重新编号
  newCages = newCages.map((c, i) => ({ ...c, id: i + 1 }));
  
  return {
    board: newBoard,
    grid: newBoard,
    cages: newCages,
    solution: newSolution,
    variantSeed: seed,
    originalId: puzzle.id || puzzle.originalId
  };
}

// ==========================================
// 生成多个变体
// ==========================================
function generateVariants(puzzle, count, startSeed = 0) {
  const variants = [];
  for (let i = 0; i < count; i++) {
    const seed = startSeed + i;
    variants.push(transformPuzzle(puzzle, seed));
  }
  return variants;
}

// ==========================================
// 验证变体是否有效（唯一解、可解）
// ==========================================
function validateVariant(variant, createSolverFn) {
  const solve = createSolverFn(variant.cages);
  const result = solve(variant.board, 2, 3000);
  
  if (result.count !== 1) {
    return { ok: false, reason: `解的数量=${result.count}` };
  }
  
  // 验证solution是否匹配
  if (variant.solution) {
    const sol = result.solutions[0];
    let match = true;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (sol[r][c] !== variant.solution[r][c]) {
          match = false;
          break;
        }
      }
      if (!match) break;
    }
    if (!match) {
      return { ok: false, reason: 'solution不匹配' };
    }
  }
  
  return { ok: true };
}

module.exports = {
  generateTransformParams,
  transformBoard,
  transformCages,
  transformPuzzle,
  generateVariants,
  validateVariant,
  recalculateCageSums,
  getRowMapping,
  getColMapping,
  getDigitMapping,
  mulberry32
};
