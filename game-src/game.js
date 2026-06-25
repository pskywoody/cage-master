// ==========================================
// 杀手数独 核心游戏逻辑 / 数据层
// ==========================================

/**
 * 单格子类：所有字段一次性定义完整
 */
class Cell {
  constructor(r, c) {
    // 拓扑坐标
    this.r = r;
    this.c = c;
    this.belongsToRow = r;
    this.belongsToCol = c;
    this.cageId = null;

    // 高亮掩码（45法则动画专用）
    this.isHighlightMask = false;
    this.highlightType = '';
    this.highlightOpacity = 0;

    // 选中状态
    this.isSelected = false;

    // 盘面数据
    this.fixedNum = null;
    this.fillNum = null;
    this.candidates = new Set();
    this.isError = false;
  }
}

/**
 * 棋盘全局类
 */
class Board {
  constructor(size = 9) {
    this.size = size;
    this.cells = [];
    this.cages = [];

    // 高亮缓存
    this.highlightRowCache = new Map();
    this.highlightColCache = new Map();

    // 选中与历史记录
    this.selectedCell = null;
    this.selectedCageId = null; // 当前选中格子所属的笼子ID
    this.history = [];

    // 输入模式：normal 正式填数 / candidate 候选标记
    this.inputMode = 'normal';

    this._init();
  }

  _init() {
    for (let r = 0; r < this.size; r++) {
      this.cells[r] = [];
      for (let c = 0; c < this.size; c++) {
        this.cells[r][c] = new Cell(r, c);
      }
    }

    for (let r = 0; r < this.size; r++) {
      this.highlightRowCache.set(r, this.cells[r]);
    }
    for (let c = 0; c < this.size; c++) {
      const colCells = [];
      for (let r = 0; r < this.size; r++) {
        colCells.push(this.cells[r][c]);
      }
      this.highlightColCache.set(c, colCells);
    }
  }

  /**
   * 加载关卡数据
   * @param {Object} puzzle { cells: number[][], cages: [{id,sum,cells:[[r,c]]}] }
   */
  loadLevel(puzzle) {
    const { cells, cages } = puzzle;
    this.history = [];
    this.selectedCell = null;
    this.selectedCageId = null;
    this.inputMode = 'normal';

    // 加载数字
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        cell.fixedNum = cells[r][c] !== 0 ? cells[r][c] : null;
        cell.fillNum = null;
        cell.candidates.clear();
        cell.isError = false;
        cell.isSelected = false;
        cell.cageId = null;
      }
    }

    // 加载笼子
    this.cages = cages;
    cages.forEach(cage => {
      cage.cells.forEach(([r, c]) => {
        this.cells[r][c].cageId = cage.id;
      });
    });
  }

  /**
   * 选中格子
   */
  selectCell(r, c) {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return;

    // 清除之前的选中
    if (this.selectedCell) {
      const { r: pr, c: pc } = this.selectedCell;
      this.cells[pr][pc].isSelected = false;
    }

    // 设置新选中
    const cell = this.cells[r][c];
    cell.isSelected = true;
    this.selectedCell = { r, c };
    // 同步记录所属笼子
    this.selectedCageId = cell.cageId;
  }

  /**
   * 给选中格填数字
   */
  setNumber(num) {
    if (!this.selectedCell) return;
    const { r, c } = this.selectedCell;
    const cell = this.cells[r][c];
    if (cell.fixedNum) return; // 固定数字不能改

    // 保存历史用于撤销
    this.history.push({
      r, c,
      oldFill: cell.fillNum,
      oldCandidates: new Set(cell.candidates)
    });

    cell.fillNum = num;
    cell.candidates.clear();
  }

  /**
   * 擦除选中格
   */
  eraseNumber() {
    if (!this.selectedCell) return;
    const { r, c } = this.selectedCell;
    const cell = this.cells[r][c];
    if (cell.fixedNum) return;

    this.history.push({
      r, c,
      oldFill: cell.fillNum,
      oldCandidates: new Set(cell.candidates)
    });

    cell.fillNum = null;
    cell.candidates.clear();
  }

  /**
   * 撤销上一步
   */
  undo() {
    if (this.history.length === 0) return;
    const last = this.history.pop();
    const cell = this.cells[last.r][last.c];
    cell.fillNum = last.oldFill;
    cell.candidates = last.oldCandidates;
  }

  /**
   * 切换输入模式
   */
  toggleInputMode() {
    this.inputMode = this.inputMode === 'normal' ? 'candidate' : 'normal';
    return this.inputMode;
  }

  /**
   * 给选中格写入/移除候选数
   */
  toggleCandidate(num) {
    if (!this.selectedCell) return;
    const { r, c } = this.selectedCell;
    const cell = this.cells[r][c];
    if (cell.fixedNum) return;
    if (cell.fillNum) return; // 已有正式数字时不能写候选

    this.history.push({
      r, c,
      oldFill: cell.fillNum,
      oldCandidates: new Set(cell.candidates)
    });

    if (cell.candidates.has(num)) {
      cell.candidates.delete(num);
    } else {
      cell.candidates.add(num);
    }
  }

  /**
   * 检测盘面冲突：同行、同列、同宫内重复的 fillNum，标记 isError
   * 每次操作后调用，重新扫描并更新所有格子的 isError 状态
   */
  checkConflicts() {
    // 先清除所有错误标记
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.cells[r][c].isError = false;
      }
    }

    // 行冲突
    for (let r = 0; r < this.size; r++) {
      const seen = {};
      for (let c = 0; c < this.size; c++) {
        const val = this.cells[r][c].fillNum;
        if (!val) continue;
        if (seen[val] !== undefined) {
          this.cells[r][c].isError = true;
          this.cells[r][seen[val]].isError = true;
        } else {
          seen[val] = c;
        }
      }
    }

    // 列冲突
    for (let c = 0; c < this.size; c++) {
      const seen = {};
      for (let r = 0; r < this.size; r++) {
        const val = this.cells[r][c].fillNum;
        if (!val) continue;
        if (seen[val] !== undefined) {
          this.cells[r][c].isError = true;
          this.cells[seen[val]][c].isError = true;
        } else {
          seen[val] = r;
        }
      }
    }

    // 3×3宫冲突
    for (let boxR = 0; boxR < 3; boxR++) {
      for (let boxC = 0; boxC < 3; boxC++) {
        const seen = {};
        for (let r = boxR * 3; r < boxR * 3 + 3; r++) {
          for (let c = boxC * 3; c < boxC * 3 + 3; c++) {
            const val = this.cells[r][c].fillNum;
            if (!val) continue;
            if (seen[val]) {
              this.cells[r][c].isError = true;
              this.cells[seen[val][0]][seen[val][1]].isError = true;
            } else {
              seen[val] = [r, c];
            }
          }
        }
      }
    }
  }

  /**
   * 移动选中格（方向键用）
   */
  moveSelection(dr, dc) {
    if (!this.selectedCell) {
      this.selectCell(0, 0);
      return;
    }
    const { r, c } = this.selectedCell;
    const nr = Math.max(0, Math.min(this.size - 1, r + dr));
    const nc = Math.max(0, Math.min(this.size - 1, c + dc));
    this.selectCell(nr, nc);
  }

  // ---------- 测试辅助方法 ----------
  testHighlightRow(rowIndex, opacity = 0.3) {
    const rowCells = this.highlightRowCache.get(rowIndex);
    rowCells.forEach(cell => {
      cell.isHighlightMask = true;
      cell.highlightType = 'row';
      cell.highlightOpacity = opacity;
    });
  }

  clearAllHighlight() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        cell.isHighlightMask = false;
        cell.highlightType = '';
        cell.highlightOpacity = 0;
      }
    }
  }
}

// 全局单例
const gameBoard = new Board(9);
window.gameBoard = gameBoard;