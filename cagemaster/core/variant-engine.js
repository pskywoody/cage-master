/**
 * ============================================================
 *  VariantEngine - 全局变体引擎
 * ============================================================
 *
 *  每关存储一份"黄金残局"，玩家每次进入时动态生成等价不同形的盘面，
 *  提升重复可玩性。变体前后技巧卡点不变、求解路径不变、级联序列不变。
 *
 *  等价变体操作白名单（不改变约束图拓扑）：
 *  - 数字置换：1↔7, 2↔5 等，所有数字按映射替换
 *  - 行交换（同一宫内）：同一 3×3 宫内的两行互换
 *  - 列交换（同一宫内）：同一 3×3 宫内的两列互换
 *  - 宫交换（同宫带/同宫堆）：整个 3×3 宫互换，只能在同一大行带或大列堆内
 *  - 整体旋转 90°/180°/270°：整个盘面旋转
 *  - 水平/垂直镜像：整个盘面镜像翻转
 *
 *  杀手笼同步变换规则：
 *  - 数字置换：笼子和值同步重算（基于 solution）
 *  - 行/列/宫交换：笼子坐标同步交换
 *  - 旋转/镜像：笼子坐标同步变换
 *
 * ============================================================
 */

// ============================================================
//  VariantEngine 类
// ============================================================

class VariantEngine {
  // ========================================================
  //  配置
  // ========================================================

  /** 默认网格大小 */
  static DEFAULT_GRID_SIZE = 9;

  /** 宫大小 */
  static BOX_SIZE = 3;

  // ========================================================
  //  公开 API - 核心变换
  // ========================================================

  /**
   * 生成一个变体
   * @param {Object} puzzle - 谜题数据 { boardData, cages, solution }
   *   - boardData: 9x9 二维数组，0 表示空格
   *   - cages: 杀手笼数组 [{ id, sum, cells: [[r,c],...] }]
   *   - solution: 9x9 二维数组，完整解（用于重算笼子和值）
   * @param {string|number} seed - 字符串种子
   * @returns {Object} { board, cages, solution, mapping }
   */
  static transform(puzzle, seed) {
    const gridSize = puzzle.gridSize || puzzle.boardData?.length || this.DEFAULT_GRID_SIZE;
    const mapping = this._generateMapping(seed, gridSize);

    // 变换棋盘
    const board = this._applyBoardTransform(puzzle.boardData || puzzle.cells || puzzle.board, mapping);

    // 变换 solution
    let solution = null;
    if (puzzle.solution) {
      solution = this._applyBoardTransform(puzzle.solution, mapping);
    }

    // 变换笼子
    let cages = puzzle.cages || [];
    if (cages.length > 0) {
      cages = this.transformCages(cages, mapping, puzzle.solution);
    }

    return {
      board,
      boardData: board,
      cells: board,
      cages,
      solution,
      mapping,
    };
  }

  /**
   * 仅变换棋盘（不含笼子）
   * @param {number[][]} board - 9x9 二维数组
   * @param {string|number} seed - 种子
   * @returns {number[][]} 变换后的棋盘
   */
  static transformBoard(board, seed) {
    const gridSize = board.length;
    const mapping = this._generateMapping(seed, gridSize);
    return this._applyBoardTransform(board, mapping);
  }

  /**
   * 变换笼子坐标和和值
   * @param {Array} cages - 笼子数组
   * @param {Object} mapping - 映射对象
   * @param {number[][]} [originalSolution] - 原始解（用于重算和值）
   * @returns {Array} 变换后的笼子数组
   */
  static transformCages(cages, mapping, originalSolution = null) {
    const newCages = cages.map((cage, idx) => {
      // 变换每个格子的位置
      const newCells = cage.cells.map(([r, c]) => this.mapCell(r, c, mapping));

      // 计算新的和值
      let newSum = cage.sum;
      if (originalSolution) {
        // 用原始 solution + 数字映射重算
        newSum = 0;
        for (const [r, c] of cage.cells) {
          const origVal = originalSolution[r][c];
          newSum += this.mapDigit(origVal, mapping);
        }
      } else if (mapping.originalToVariant.digits) {
        // 没有 solution 时，尝试用数字映射 + 原始和值估算（不准确，仅兼容）
        // 注意：笼子和值不能简单通过数字映射转换，因为和值是多个数字的和
        // 所以这里保留原值，需要调用方传入 solution
        console.warn('[VariantEngine] 警告：未提供 solution，笼子和值可能不正确');
      }

      return {
        id: cage.id !== undefined ? cage.id : idx + 1,
        sum: newSum,
        cells: newCells,
      };
    });

    // 按位置排序（保持一致性）
    newCages.sort((a, b) => {
      const [ar, ac] = a.cells[0];
      const [br, bc] = b.cells[0];
      if (ar !== br) return ar - br;
      return ac - bc;
    });

    // 重新编号
    return newCages.map((c, i) => ({ ...c, id: i + 1 }));
  }

  // ========================================================
  //  坐标映射
  // ========================================================

  /**
   * 坐标从原始→变体
   * @param {number} row - 原始行号
   * @param {number} col - 原始列号
   * @param {Object} mapping - 映射对象
   * @returns {[number, number]} [新行号, 新列号]
   */
  static mapCell(row, col, mapping) {
    const rows = mapping.originalToVariant.rows;
    const cols = mapping.originalToVariant.cols;
    const rotate = mapping.originalToVariant.rotate || 0;
    const reflect = mapping.originalToVariant.reflect || 'none';
    const gridSize = mapping.gridSize || 9;

    // 先应用行列置换
    let r = rows[row];
    let c = cols[col];

    // 再应用旋转
    [r, c] = this._rotateCoord(r, c, rotate, gridSize);

    // 再应用镜像
    [r, c] = this._reflectCoord(r, c, reflect, gridSize);

    return [r, c];
  }

  /**
   * 坐标从变体→原始
   * @param {number} row - 变体行号
   * @param {number} col - 变体列号
   * @param {Object} mapping - 映射对象
   * @returns {[number, number]} [原始行号, 原始列号]
   */
  static unmapCell(row, col, mapping) {
    const rows = mapping.variantToOriginal.rows;
    const cols = mapping.variantToOriginal.cols;
    const rotate = mapping.originalToVariant.rotate || 0;
    const reflect = mapping.originalToVariant.reflect || 'none';
    const gridSize = mapping.gridSize || 9;

    // 逆镜像
    let r = row;
    let c = col;
    [r, c] = this._reflectCoord(r, c, reflect, gridSize); // 镜像自逆

    // 逆旋转
    const invRotate = (4 - (rotate % 4)) % 4;
    [r, c] = this._rotateCoord(r, c, invRotate, gridSize);

    // 逆行列置换
    r = rows[r];
    c = cols[c];

    return [r, c];
  }

  // ========================================================
  //  数字映射
  // ========================================================

  /**
   * 数字从原始→变体
   * @param {number} digit - 原始数字
   * @param {Object} mapping - 映射对象
   * @returns {number} 变体数字
   */
  static mapDigit(digit, mapping) {
    if (digit === 0 || digit === null || digit === undefined) return digit;
    const digits = mapping.originalToVariant.digits;
    return digits[digit] !== undefined ? digits[digit] : digit;
  }

  /**
   * 数字从变体→原始
   * @param {number} digit - 变体数字
   * @param {Object} mapping - 映射对象
   * @returns {number} 原始数字
   */
  static unmapDigit(digit, mapping) {
    if (digit === 0 || digit === null || digit === undefined) return digit;
    const digits = mapping.variantToOriginal.digits;
    return digits[digit] !== undefined ? digits[digit] : digit;
  }

  // ========================================================
  //  生成随机映射
  // ========================================================

  /**
   * 生成随机映射
   * @param {string|number} seed - 种子
   * @param {number} [gridSize=9] - 网格大小
   * @returns {Object} mapping 对象
   */
  static _generateMapping(seed, gridSize = 9) {
    const rng = this._createRNG(seed);
    const boxSize = gridSize === 9 ? 3 : gridSize === 6 ? 2 : 3;
    const numBands = Math.floor(gridSize / boxSize);

    const operations = [];

    // 1. 数字置换
    const digitArr = this._shuffle(
      Array.from({ length: gridSize }, (_, i) => i + 1),
      rng
    );
    const digitMap = {};
    const digitMapInv = {};
    for (let i = 1; i <= gridSize; i++) {
      digitMap[i] = digitArr[i - 1];
      digitMapInv[digitArr[i - 1]] = i;
    }
    operations.push('digitPerm');

    // 2. 宫带（大行）排列
    const bandPerm = this._shuffle(
      Array.from({ length: numBands }, (_, i) => i),
      rng
    );
    operations.push('bandPerm');

    // 3. 宫堆（大列）排列
    const stackPerm = this._shuffle(
      Array.from({ length: numBands }, (_, i) => i),
      rng
    );
    operations.push('stackPerm');

    // 4. 每个宫带内的行排列
    const rowPerms = [];
    for (let b = 0; b < numBands; b++) {
      rowPerms.push(
        this._shuffle(
          Array.from({ length: boxSize }, (_, i) => i),
          rng
        )
      );
      operations.push(`rowSwap${b}`);
    }

    // 5. 每个宫堆内的列排列
    const colPerms = [];
    for (let s = 0; s < numBands; s++) {
      colPerms.push(
        this._shuffle(
          Array.from({ length: boxSize }, (_, i) => i),
          rng
        )
      );
      operations.push(`colSwap${s}`);
    }

    // 6. 旋转角度（0, 1, 2, 3 对应 0°, 90°, 180°, 270°）
    const rotate = Math.floor(rng() * 4);
    if (rotate > 0) {
      operations.push(`rotate${rotate * 90}`);
    }

    // 7. 镜像类型
    const reflectTypes = ['none', 'h', 'v'];
    const reflect = reflectTypes[Math.floor(rng() * reflectTypes.length)];
    if (reflect !== 'none') {
      operations.push(`reflect_${reflect}`);
    }

    // 构建行映射：原始行 → 变体行（先行列置换，再旋转镜像）
    // 注意：这里的 rows/cols 是行列置换部分的映射，不包含旋转镜像
    // 旋转镜像在 mapCell 中单独处理
    const rowMapping = new Array(gridSize);
    const rowMappingInv = new Array(gridSize);

    for (let origBand = 0; origBand < numBands; origBand++) {
      const newBand = bandPerm.indexOf(origBand);
      for (let origPos = 0; origPos < boxSize; origPos++) {
        const origRow = origBand * boxSize + origPos;
        const newPos = rowPerms[origBand].indexOf(origPos);
        const newRow = newBand * boxSize + newPos;
        rowMapping[origRow] = newRow;
        rowMappingInv[newRow] = origRow;
      }
    }

    // 构建列映射
    const colMapping = new Array(gridSize);
    const colMappingInv = new Array(gridSize);

    for (let origStack = 0; origStack < numBands; origStack++) {
      const newStack = stackPerm.indexOf(origStack);
      for (let origPos = 0; origPos < boxSize; origPos++) {
        const origCol = origStack * boxSize + origPos;
        const newPos = colPerms[origStack].indexOf(origPos);
        const newCol = newStack * boxSize + newPos;
        colMapping[origCol] = newCol;
        colMappingInv[newCol] = origCol;
      }
    }

    return {
      gridSize,
      originalToVariant: {
        rows: rowMapping,
        cols: colMapping,
        digits: digitMap,
        rotate,
        reflect,
      },
      variantToOriginal: {
        rows: rowMappingInv,
        cols: colMappingInv,
        digits: digitMapInv,
      },
      operations,
      bandPerm,
      stackPerm,
      rowPerms,
      colPerms,
    };
  }

  // ========================================================
  //  验证变体前后技巧一致性（开发用）
  // ========================================================

  /**
   * 验证变体前后技巧一致性
   * @param {Object} original - 原始谜题 { boardData, cages, solution }
   * @param {Object} variant - 变体谜题 { board, cages, solution, mapping }
   * @param {Array} cages - 原始笼子（可选，从 original 读取）
   * @param {Function} TechRaterSolverClass - 技巧评级求解器类
   * @returns {Object} { valid, originalTechs, variantTechs, diffs }
   */
  static validateVariant(original, variant, cages, TechRaterSolverClass) {
    if (typeof TechRaterSolverClass === 'undefined') {
      console.warn('[VariantEngine] 未提供 TechRaterSolverClass，跳过技巧验证');
      return { valid: true, skipped: true };
    }

    try {
      // 评估原始题目的技巧
      const originalResult = TechRaterSolverClass.rate
        ? TechRaterSolverClass.rate(original.boardData || original.cells, original.cages || [])
        : null;

      // 评估变体题目的技巧
      const variantResult = TechRaterSolverClass.rate
        ? TechRaterSolverClass.rate(variant.board || variant.boardData, variant.cages || [])
        : null;

      if (!originalResult || !variantResult) {
        return { valid: true, skipped: true, reason: '评级器返回空结果' };
      }

      // 比较技巧集合（顺序可能不同，但集合应该相同）
      const origTechs = new Set(originalResult.techniques?.map(t => t.name) || []);
      const varTechs = new Set(variantResult.techniques?.map(t => t.name) || []);

      const diffs = [];
      for (const t of origTechs) {
        if (!varTechs.has(t)) diffs.push(`缺少技巧: ${t}`);
      }
      for (const t of varTechs) {
        if (!origTechs.has(t)) diffs.push(`多余技巧: ${t}`);
      }

      // 比较难度等级
      const sameDifficulty = originalResult.difficulty === variantResult.difficulty;

      return {
        valid: diffs.length === 0 && sameDifficulty,
        originalTechs: Array.from(origTechs),
        variantTechs: Array.from(varTechs),
        originalDifficulty: originalResult.difficulty,
        variantDifficulty: variantResult.difficulty,
        diffs,
      };
    } catch (e) {
      console.error('[VariantEngine] 验证失败:', e);
      return { valid: false, error: e.message };
    }
  }

  // ========================================================
  //  内部方法 - 棋盘变换
  // ========================================================

  /**
   * 应用变换到棋盘
   * @param {number[][]} board - 原始棋盘
   * @param {Object} mapping - 映射对象
   * @returns {number[][]} 变换后的棋盘
   */
  static _applyBoardTransform(board, mapping) {
    const gridSize = board.length;
    const newBoard = Array.from({ length: gridSize }, () => new Array(gridSize).fill(0));

    for (let r = 0; r < gridSize; r++) {
      for (let c = 0; c < gridSize; c++) {
        const val = board[r][c];
        if (val !== 0 && val !== null && val !== undefined) {
          const [nr, nc] = this.mapCell(r, c, mapping);
          const nv = this.mapDigit(val, mapping);
          newBoard[nr][nc] = nv;
        }
      }
    }

    return newBoard;
  }

  // ========================================================
  //  内部方法 - 坐标变换
  // ========================================================

  /**
   * 旋转坐标
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {number} times - 旋转次数（0-3，每次90°顺时针）
   * @param {number} size - 网格大小
   * @returns {[number, number]} [新行, 新列]
   */
  static _rotateCoord(r, c, times, size) {
    const n = size - 1;
    switch (times % 4) {
      case 0: return [r, c];
      case 1: return [c, n - r];    // 90° 顺时针
      case 2: return [n - r, n - c]; // 180°
      case 3: return [n - c, r];    // 270° 顺时针（90° 逆时针）
      default: return [r, c];
    }
  }

  /**
   * 镜像坐标
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {string} type - 镜像类型 'none' | 'h' | 'v'
   * @param {number} size - 网格大小
   * @returns {[number, number]} [新行, 新列]
   */
  static _reflectCoord(r, c, type, size) {
    const n = size - 1;
    switch (type) {
      case 'none': return [r, c];
      case 'h': return [n - r, c];    // 水平镜像（上下翻转）
      case 'v': return [r, n - c];    // 垂直镜像（左右翻转）
      default: return [r, c];
    }
  }

  // ========================================================
  //  内部方法 - 随机数与工具
  // ========================================================

  /**
   * 创建基于种子的伪随机数生成器（mulberry32）
   * @param {string|number} seed - 种子
   * @returns {Function} 返回 0-1 之间随机数的函数
   */
  static _createRNG(seed) {
    // 将字符串种子转换为数字
    let s;
    if (typeof seed === 'number') {
      s = seed | 0;
    } else {
      // 简单的字符串哈希
      s = 0;
      const str = String(seed);
      for (let i = 0; i < str.length; i++) {
        s = ((s << 5) - s + str.charCodeAt(i)) | 0;
      }
    }
    if (s === 0) s = 1; // 避免 0 种子

    return function () {
      s |= 0;
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /**
   * Fisher-Yates 洗牌
   * @param {Array} arr - 数组
   * @param {Function} rng - 随机数生成器
   * @returns {Array} 打乱后的新数组
   */
  static _shuffle(arr, rng) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ========================================================
  //  工具方法 - 验证数独合法性
  // ========================================================

  /**
   * 验证棋盘是否满足数独规则（行/列/宫不重复）
   * @param {number[][]} board - 棋盘
   * @returns {boolean}
   */
  static isValidSudoku(board) {
    const size = board.length;
    const boxSize = size === 9 ? 3 : size === 6 ? 2 : 3;

    // 检查行
    for (let r = 0; r < size; r++) {
      const seen = new Set();
      for (let c = 0; c < size; c++) {
        const v = board[r][c];
        if (v === 0) continue;
        if (seen.has(v)) return false;
        seen.add(v);
      }
    }

    // 检查列
    for (let c = 0; c < size; c++) {
      const seen = new Set();
      for (let r = 0; r < size; r++) {
        const v = board[r][c];
        if (v === 0) continue;
        if (seen.has(v)) return false;
        seen.add(v);
      }
    }

    // 检查宫
    const numBoxes = size / boxSize;
    for (let br = 0; br < numBoxes; br++) {
      for (let bc = 0; bc < numBoxes; bc++) {
        const seen = new Set();
        for (let r = br * boxSize; r < (br + 1) * boxSize; r++) {
          for (let c = bc * boxSize; c < (bc + 1) * boxSize; c++) {
            const v = board[r][c];
            if (v === 0) continue;
            if (seen.has(v)) return false;
            seen.add(v);
          }
        }
      }
    }

    return true;
  }

  /**
   * 验证笼子和值是否正确（基于 solution）
   * @param {Array} cages - 笼子数组
   * @param {number[][]} solution - 解
   * @returns {boolean}
   */
  static validateCageSums(cages, solution) {
    for (const cage of cages) {
      let sum = 0;
      for (const [r, c] of cage.cells) {
        sum += solution[r][c];
      }
      if (sum !== cage.sum) {
        console.warn(`[VariantEngine] 笼子 ${cage.id} 和值不匹配: 期望 ${cage.sum}, 实际 ${sum}`);
        return false;
      }
    }
    return true;
  }
}

// ============================================================
//  浏览器环境：导出到全局
// ============================================================
if (typeof window !== 'undefined') {
  window.VariantEngine = VariantEngine;
}

// ============================================================
//  Node.js 环境：导出模块
// ============================================================
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VariantEngine;
}
