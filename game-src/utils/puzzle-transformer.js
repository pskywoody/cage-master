// ==========================================
// PuzzleTransformer - 谜题魔术师（浏览器版）
// 对杀手数独/标准数独题目进行数学置换，生成无穷变体
// 支持：数字映射、宫内行列互换、宫块互换、旋转、镜像
// ==========================================

const PuzzleTransformer = {
  /**
   * 生成随机数字映射（1-9的置换）
   */
  randomDigitMap() {
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    const map = new Array(10);
    map[0] = 0;
    for (let d = 1; d <= 9; d++) {
      map[d] = digits[d - 1];
    }
    return map;
  },

  /**
   * 生成随机宫内行互换方案
   */
  randomRowPermutation(size = 9) {
    const boxH = size === 9 ? 3 : size === 6 ? 2 : 2;
    const numBands = size / boxH;
    const bands = this._shuffle(Array.from({ length: numBands }, (_, i) => i));
    const rowSwaps = [];
    for (let b = 0; b < numBands; b++) {
      rowSwaps.push(this._shuffle(Array.from({ length: boxH }, (_, i) => i)));
    }
    return (row) => {
      const band = Math.floor(row / boxH);
      const posInBand = row % boxH;
      const newBand = bands.indexOf(band);
      return newBand * boxH + rowSwaps[newBand].indexOf(posInBand);
    };
  },

  /**
   * 生成随机宫内列互换方案
   */
  randomColPermutation(size = 9) {
    const boxW = size === 9 ? 3 : size === 6 ? 3 : 2;
    const numStacks = size / boxW;
    const stacks = this._shuffle(Array.from({ length: numStacks }, (_, i) => i));
    const colSwaps = [];
    for (let s = 0; s < numStacks; s++) {
      colSwaps.push(this._shuffle(Array.from({ length: boxW }, (_, i) => i)));
    }
    return (col) => {
      const stack = Math.floor(col / boxW);
      const posInStack = col % boxW;
      const newStack = stacks.indexOf(stack);
      return newStack * boxW + colSwaps[newStack].indexOf(posInStack);
    };
  },

  /**
   * 旋转变换
   */
  rotationTransform(angle, size = 9) {
    return (r, c) => {
      switch (angle % 4) {
        case 0: return [r, c];
        case 1: return [c, size - 1 - r];
        case 2: return [size - 1 - r, size - 1 - c];
        case 3: return [size - 1 - c, r];
      }
    };
  },

  /**
   * 镜像变换
   */
  reflectionTransform(type, size = 9) {
    return (r, c) => {
      switch (type) {
        case 'none': return [r, c];
        case 'h': return [size - 1 - r, c];
        case 'v': return [r, size - 1 - c];
        case 'd1': return [c, r];
        case 'd2': return [size - 1 - c, size - 1 - r];
      }
    };
  },

  /**
   * 组合多个坐标变换
   */
  composeTransforms(...transforms) {
    return (r, c) => {
      let nr = r, nc = c;
      for (const t of transforms) {
        [nr, nc] = t(nr, nc);
      }
      return [nr, nc];
    };
  },

  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  _makeGrid(size) {
    return Array.from({ length: size }, () => new Array(size).fill(0));
  },

  /**
   * 对题目执行随机变换
   * @param {Object} puzzle - {gridSize, boardData, solution, cages}
   * @param {Object} options - {digitMap, rowPerm, colPerm, rotate, reflect, randomize}
   */
  transform(puzzle, options = {}) {
    const { gridSize = 9 } = puzzle;
    const size = gridSize;

    const digitMap = options.digitMap !== undefined ? options.digitMap :
      (options.randomize !== false ? this.randomDigitMap() : null);
    const rowFn = options.rowPerm ||
      (options.randomize !== false ? this.randomRowPermutation(size) : (r) => r);
    const colFn = options.colPerm ||
      (options.randomize !== false ? this.randomColPermutation(size) : (c) => c);
    const rotateType = options.rotate !== undefined ? options.rotate :
      (options.randomize !== false ? Math.floor(Math.random() * 4) : 0);
    const reflectType = options.reflect ||
      (options.randomize !== false ? ['none', 'h', 'v'][Math.floor(Math.random() * 3)] : 'none');

    const rotFn = this.rotationTransform(rotateType, size);
    const refFn = this.reflectionTransform(reflectType, size);
    const coordFn = this.composeTransforms(rotFn, refFn);

    const fullCoordFn = (r, c) => {
      const nr = rowFn(r);
      const nc = colFn(c);
      return coordFn(nr, nc);
    };

    // 变换boardData
    const newBoard = this._makeGrid(size);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const v = puzzle.boardData[r][c];
        const [nr, nc] = fullCoordFn(r, c);
        newBoard[nr][nc] = v > 0 && digitMap ? digitMap[v] : v;
      }
    }

    // 变换solution
    const newSolution = this._makeGrid(size);
    if (puzzle.solution) {
      for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
          const v = puzzle.solution[r][c];
          const [nr, nc] = fullCoordFn(r, c);
          newSolution[nr][nc] = digitMap ? digitMap[v] : v;
        }
      }
    }

    // 变换cages
    const newCages = [];
    if (puzzle.cages) {
      puzzle.cages.forEach((cage, idx) => {
        const newCells = cage.cells.map(([r, c]) => fullCoordFn(r, c));
        let newSum = cage.sum;
        if (digitMap && puzzle.solution) {
          newSum = 0;
          for (const [r, c] of cage.cells) {
            const origVal = puzzle.solution[r][c];
            newSum += digitMap[origVal];
          }
        }
        newCages.push({
          id: idx + 1,
          sum: newSum,
          cells: newCells
        });
      });
    }

    return {
      gridSize: size,
      boardData: newBoard,
      solution: puzzle.solution ? newSolution : null,
      cages: newCages,
      _transform: { digitMap, rotateType, reflectType }
    };
  },

  /**
   * 从一个种子生成N个变体
   */
  generateVariants(seedPuzzle, count = 10) {
    const variants = [];
    for (let i = 0; i < count; i++) {
      variants.push(this.transform(seedPuzzle));
    }
    return variants;
  }
};

// 浏览器端全局导出
if (typeof window !== 'undefined') {
  window.PuzzleTransformer = PuzzleTransformer;
}
