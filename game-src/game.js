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

    // 提示状态
    this.isHintCell = false;   // 是否是提示格子（绿框目标格）
    this.isHintRegion = false; // 是否是提示关联区域（行/列/宫/笼半透明高亮）
    this.isHintPair = false;   // 是否是数对/链的关键格（需要特殊高亮）
    this.hintNumber = null;    // 提示的数字（null表示只提示位置，不提示数字）

    // 选中状态
    this.isSelected = false;

    // 盘面数据
    this.fixedNum = null;
    this.fillNum = null;
    this.candidates = new Set();
    this.isError = false;

    // 残局教学关：非关键格锁定（不可点击、不可操作）
    this.isLocked = false;
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
    this.selectedCells = [];    // 多选框选的格子数组
    this.isBoxSelecting = false; // 是否正在框选
    this.history = [];

    // 高亮设置（可通过设置页开关）
    this.highlightSettings = {
      sameRow: true,         // 同行高亮
      sameCol: true,         // 同列高亮
      sameBox: true,         // 同宫高亮
      sameNumber: true,      // 同数字高亮
      sameCage: true         // 同笼高亮（原已有）
    };

    // 全局设置
    this.settings = {
      conflictRed: true,     // 冲突标红
      autoClearCandidates: true,  // 自动清除关联候选
      muteAll: false,        // 一键静音
      bgm: true,             // 背景音乐
      sfx: true              // 音效
    };

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
    this.selectedCells = [];
    this.isBoxSelecting = false;
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

    // 加载笼子（兼容多种坐标格式：数组[r,c]或字符串"r c"）
    this.cages = cages;
    // 构建 cageId -> cells 索引，加速查找
    this.cageIdToCells = {};
    cages.forEach(cage => {
      // 标准化坐标格式：支持 [r,c] 数组和 "r c" 字符串两种格式
      const normalizedCells = cage.cells.map(cell => {
        if (Array.isArray(cell)) return [cell[0]|0, cell[1]|0];
        if (typeof cell === 'string') {
          const parts = cell.split(/[ ,]+/).filter(Boolean).map(Number);
          return [parts[0]|0, parts[1]|0];
        }
        return [cell[0]|0, cell[1]|0];
      });
      cage.cells = normalizedCells;
      this.cageIdToCells[cage.id] = normalizedCells;
      normalizedCells.forEach(([r, c]) => {
        if (r >= 0 && r < this.size && c >= 0 && c < this.size && this.cells[r] && this.cells[r][c]) {
          this.cells[r][c].cageId = cage.id;
        }
      });
    });
  }

  /**
   * 选中单个格子（同时清除多选状态）
   */
  selectCell(r, c) {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return;

    // 残局教学关：锁定格子不可选中
    const cell = this.cells[r][c];
    if (cell.isLocked) return;

    // 清除之前的多选
    this.clearBoxSelection();

    // 设置新选中
    cell.isSelected = true;
    this.selectedCell = { r, c };
    // 同步记录所属笼子
    this.selectedCageId = cell.cageId;
  }

  /**
   * 可靠获取当前选中的格子（支持 selectedCell 引用 + isSelected 遍历双重查找）
   * 防止selectedCell引用丢失但isSelected标记仍在的情况
   */
  getActiveCell() {
    // 先尝试直接引用
    if (this.selectedCell) {
      const { r, c } = this.selectedCell;
      if (r >= 0 && r < this.size && c >= 0 && c < this.size && this.cells[r][c].isSelected) {
        return this.selectedCell;
      }
    }
    // Fallback: 遍历找isSelected的格子
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.cells[r][c].isSelected) {
          this.selectedCell = { r, c };
          return this.selectedCell;
        }
      }
    }
    // 没有选中格子
    this.selectedCell = null;
    return null;
  }

  /**
   * 清除所有多选状态
   */
  clearBoxSelection() {
    for (const { r, c } of this.selectedCells) {
      this.cells[r][c].isSelected = false;
    }
    this.selectedCells = [];
    if (this.selectedCell) {
      const { r, c } = this.selectedCell;
      this.cells[r][c].isSelected = false;
      this.selectedCell = null;
      this.selectedCageId = null;
    }
  }

  /**
   * 开始框选
   */
  startBoxSelect(r, c) {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return;
    this.clearBoxSelection();
    this.isBoxSelecting = true;
    this.boxStart = { r, c };
    this.boxEnd = { r, c };
    this._updateBoxSelection();
  }

  /**
   * 更新框选范围
   */
  updateBoxSelect(r, c) {
    if (!this.isBoxSelecting) return;
    r = Math.max(0, Math.min(this.size - 1, r));
    c = Math.max(0, Math.min(this.size - 1, c));
    this.boxEnd = { r, c };
    this._updateBoxSelection();
  }

  /**
   * 结束框选
   */
  endBoxSelect() {
    this.isBoxSelecting = false;
  }

  /**
   * 内部：根据 boxStart 和 boxEnd 更新选中状态
   */
  _updateBoxSelection() {
    // 清除旧的多选
    for (const { r, c } of this.selectedCells) {
      this.cells[r][c].isSelected = false;
    }
    this.selectedCells = [];

    const minR = Math.min(this.boxStart.r, this.boxEnd.r);
    const maxR = Math.max(this.boxStart.r, this.boxEnd.r);
    const minC = Math.min(this.boxStart.c, this.boxEnd.c);
    const maxC = Math.max(this.boxStart.c, this.boxEnd.c);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        this.cells[r][c].isSelected = true;
        this.selectedCells.push({ r, c });
      }
    }

    // 多选时，selectedCell 设为起始格（用于兼容现有逻辑）
    this.selectedCell = { r: this.boxStart.r, c: this.boxStart.c };
    this.selectedCageId = this.cells[this.boxStart.r][this.boxStart.c].cageId;
  }

  /**
   * 批量给选中的多个格子切换候选数
   * 用于框选后批量操作
   */
  toggleCandidateForSelection(num) {
    if (this.selectedCells.length === 0) return;

    const historyEntry = {
      type: 'batchToggleCandidate',
      num,
      cells: []
    };

    for (const { r, c } of this.selectedCells) {
      const cell = this.cells[r][c];
      if (cell.fixedNum) continue;
      if (cell.fillNum) continue;
      historyEntry.cells.push({
        r, c,
        oldCandidates: new Set(cell.candidates)
      });
      if (cell.candidates.has(num)) {
        cell.candidates.delete(num);
      } else {
        cell.candidates.add(num);
      }
    }

    if (historyEntry.cells.length > 0) {
      this.history.push(historyEntry);
    }
  }

  /**
   * 批量擦除选中的多个格子
   */
  eraseSelection() {
    if (this.selectedCells.length === 0) return;

    const historyEntry = {
      type: 'batchErase',
      cells: []
    };

    for (const { r, c } of this.selectedCells) {
      const cell = this.cells[r][c];
      if (cell.fixedNum) continue;
      historyEntry.cells.push({
        r, c,
        oldFill: cell.fillNum,
        oldCandidates: new Set(cell.candidates)
      });
      cell.fillNum = null;
      cell.candidates.clear();
    }

    if (historyEntry.cells.length > 0) {
      this.history.push(historyEntry);
    }
  }

  /**
   * 获取宫的尺寸（宽、高）
   */
  getBoxSize() {
    if (this.size === 4) return { boxW: 2, boxH: 2 };
    if (this.size === 6) return { boxW: 3, boxH: 2 };
    return { boxW: 3, boxH: 3 }; // 9x9 默认
  }

  /**
   * 获取同行列宫高亮的格子坐标数组（不含选中格本身）
   */
  getRowColBoxHighlightCells() {
    if (!this.selectedCell) return [];
    const { r, c } = this.selectedCell;
    const hs = this.highlightSettings;
    if (!hs.sameRow && !hs.sameCol && !hs.sameBox) return [];

    const { boxW, boxH } = this.getBoxSize();
    const boxR = Math.floor(r / boxH) * boxH;
    const boxC = Math.floor(c / boxW) * boxW;
    const result = [];
    const seen = new Set();

    // 行
    if (hs.sameRow) {
      for (let i = 0; i < this.size; i++) {
        if (i !== c) {
          const key = `${r},${i}`;
          if (!seen.has(key)) { seen.add(key); result.push({ r, c: i }); }
        }
      }
    }
    // 列
    if (hs.sameCol) {
      for (let i = 0; i < this.size; i++) {
        if (i !== r) {
          const key = `${i},${c}`;
          if (!seen.has(key)) { seen.add(key); result.push({ r: i, c }); }
        }
      }
    }
    // 宫
    if (hs.sameBox) {
      for (let i = boxR; i < boxR + boxH; i++) {
        for (let j = boxC; j < boxC + boxW; j++) {
          if (i !== r || j !== c) {
            const key = `${i},${j}`;
            if (!seen.has(key)) { seen.add(key); result.push({ r: i, c: j }); }
          }
        }
      }
    }
    return result;
  }

  /**
   * 获取同数字高亮的格子坐标数组
   * 选中格有数字时，所有相同数字的格子高亮
   * 连填激活时，高亮连填数字的所有格子
   */
  getSameNumberHighlightCells() {
    let num = null;
    let skipSelf = false;
    let centerR, centerC;

    // 优先：连填模式高亮
    if (this._quickFillHighlightNum) {
      num = this._quickFillHighlightNum;
      skipSelf = false;
    }
    // 其次：选中格高亮
    else if (this.selectedCell && this.highlightSettings.sameNumber) {
      const { r, c } = this.selectedCell;
      const cell = this.cells[r][c];
      num = cell.fixedNum || cell.fillNum;
      centerR = r;
      centerC = c;
      skipSelf = true;
    }

    if (!num) return [];

    const result = [];
    for (let i = 0; i < this.size; i++) {
      for (let j = 0; j < this.size; j++) {
        const val = this.cells[i][j].fixedNum || this.cells[i][j].fillNum;
        if (val === num) {
          if (skipSelf && i === centerR && j === centerC) continue;
          result.push({ r: i, c: j });
        }
      }
    }
    return result;
  }

  /**
   * 获取同笼高亮的格子坐标数组
   */
  getSameCageHighlightCells() {
    if (!this.selectedCageId || !this.highlightSettings.sameCage) return [];
    if (!this.cageIdToCells || !this.cageIdToCells[this.selectedCageId]) return [];
    const cells = this.cageIdToCells[this.selectedCageId];
    return cells.map(([r, c]) => ({ r, c }));
  }

  /**
   * 获取指定格子"看到"的所有数字（同行、同列、同宫的已填数字）
   * 返回 { row: Set, col: Set, box: Set, all: Set }
   */
  getSeenNumbers(r, c) {
    const rowNums = new Set();
    const colNums = new Set();
    const boxNums = new Set();
    const allNums = new Set();

    // 行
    for (let i = 0; i < this.size; i++) {
      if (i !== c) {
        const cell = this.cells[r][i];
        const num = cell.fixedNum || cell.fillNum;
        if (num) {
          rowNums.add(num);
          allNums.add(num);
        }
      }
    }

    // 列
    for (let i = 0; i < this.size; i++) {
      if (i !== r) {
        const cell = this.cells[i][c];
        const num = cell.fixedNum || cell.fillNum;
        if (num) {
          colNums.add(num);
          allNums.add(num);
        }
      }
    }

    // 宫
    const { boxW, boxH } = this.getBoxSize();
    const boxR = Math.floor(r / boxH) * boxH;
    const boxC = Math.floor(c / boxW) * boxW;
    for (let i = boxR; i < boxR + boxH; i++) {
      for (let j = boxC; j < boxC + boxW; j++) {
        if (i !== r || j !== c) {
          const cell = this.cells[i][j];
          const num = cell.fixedNum || cell.fillNum;
          if (num) {
            boxNums.add(num);
            allNums.add(num);
          }
        }
      }
    }

    return { row: rowNums, col: colNums, box: boxNums, all: allNums };
  }

  /**
   * 给选中格填数字
   * 自动清除行/列/宫/笼中所有关联格子的该候选数（可设置开关）
   */
  setNumber(num) {
    const selected = this.getActiveCell();
    if (!selected) return;
    const { r, c } = selected;
    const cell = this.cells[r][c];
    if (cell.fixedNum) return; // 固定数字不能改
    if (cell.isLocked) return; // 残局教学关：锁定格不能填

    // 保存历史用于撤销
    const historyEntry = {
      r, c,
      oldFill: cell.fillNum,
      oldCandidates: new Set(cell.candidates),
      relatedCandidates: [] // 被自动清理的关联候选
    };

    cell.fillNum = num;
    cell.candidates.clear();

    // 自动清除行/列/宫/笼中关联格子的该候选数（受设置控制）
    if (this.settings.autoClearCandidates) {
      const { boxW, boxH } = this.getBoxSize();
      // 行
      for (let i = 0; i < this.size; i++) {
        if (i !== c && this.cells[r][i].fillNum === null && this.cells[r][i].candidates.has(num)) {
          this.cells[r][i].candidates.delete(num);
          historyEntry.relatedCandidates.push({ r, c: i, num });
        }
      }
      // 列
      for (let i = 0; i < this.size; i++) {
        if (i !== r && this.cells[i][c].fillNum === null && this.cells[i][c].candidates.has(num)) {
          this.cells[i][c].candidates.delete(num);
          historyEntry.relatedCandidates.push({ r: i, c, num });
        }
      }
      // 宫
      const boxR = Math.floor(r / boxH) * boxH;
      const boxC = Math.floor(c / boxW) * boxW;
      for (let i = boxR; i < boxR + boxH; i++) {
        for (let j = boxC; j < boxC + boxW; j++) {
          if ((i !== r || j !== c) && this.cells[i][j].fillNum === null && this.cells[i][j].candidates.has(num)) {
            this.cells[i][j].candidates.delete(num);
            historyEntry.relatedCandidates.push({ r: i, c: j, num });
          }
        }
      }
      // 笼
      const cageId = cell.cageId;
      if (cageId !== null && this.cageIdToCells && this.cageIdToCells[cageId]) {
        for (const [cr, cc] of this.cageIdToCells[cageId]) {
          if ((cr !== r || cc !== c) && this.cells[cr][cc].fillNum === null && this.cells[cr][cc].candidates.has(num)) {
            this.cells[cr][cc].candidates.delete(num);
            historyEntry.relatedCandidates.push({ r: cr, c: cc, num });
          }
        }
      }
    }

    this.history.push(historyEntry);
  }

  /**
   * 擦除选中格
   */
  eraseNumber() {
    const selected = this.getActiveCell();
    if (!selected) return;
    const { r, c } = selected;
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
   * 一键清空所有候选数
   * 记录所有被清空的候选到历史，支持一次性撤销
   */
  clearAllCandidates() {
    const historyEntry = {
      type: 'clearAllCandidates',
      oldCandidates: []
    };

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null && cell.candidates.size > 0) {
          historyEntry.oldCandidates.push({
            r, c,
            candidates: new Set(cell.candidates)
          });
          cell.candidates.clear();
        }
      }
    }

    if (historyEntry.oldCandidates.length > 0) {
      this.history.push(historyEntry);
    }
  }

  /**
   * 撤销上一步
   * 恢复选中格的数字和候选，同时回滚被自动清理的关联候选
   * 支持一键清空候选的批量撤销
   */
  undo() {
    if (this.history.length === 0) return;
    const last = this.history.pop();

    // 一键清空候选的撤销：批量恢复所有候选
    if (last.type === 'clearAllCandidates') {
      for (const { r, c, candidates } of last.oldCandidates) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.candidates = new Set(candidates);
        }
      }
      return;
    }

    // 批量切换候选的撤销
    if (last.type === 'batchToggleCandidate') {
      for (const { r, c, oldCandidates } of last.cells) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.candidates = new Set(oldCandidates);
        }
      }
      return;
    }

    // 自动填充候选的撤销
    if (last.type === 'autoFillCandidates') {
      for (const { r, c, oldCandidates } of last.cells) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.candidates = new Set(oldCandidates);
        }
      }
      return;
    }

    // 批量擦除的撤销
    if (last.type === 'batchErase') {
      for (const { r, c, oldFill, oldCandidates } of last.cells) {
        const cell = this.cells[r][c];
        if (cell.fixedNum) continue;
        cell.fillNum = oldFill;
        cell.candidates = new Set(oldCandidates);
      }
      return;
    }

    // 普通单格操作的撤销
    const cell = this.cells[last.r][last.c];
    cell.fillNum = last.oldFill;
    cell.candidates = last.oldCandidates;

    // 回滚被自动清理的关联候选数
    if (last.relatedCandidates && last.relatedCandidates.length > 0) {
      for (const { r, c, num } of last.relatedCandidates) {
        if (this.cells[r][c].fillNum === null) {
          this.cells[r][c].candidates.add(num);
        }
      }
    }
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
    const selected = this.getActiveCell();
    if (!selected) return;
    const { r, c } = selected;
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
   * 自动填充所有空格的理论候选数（新手辅助功能）
   * 基于行/列/宫/笼的已填数字做基础排除，不使用高级技巧
   * @returns {number} 填充的格子数量
   */
  autoFillCandidates() {
    // 先构建当前grid状态
    const grid = [];
    for (let r = 0; r < this.size; r++) {
      grid[r] = [];
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        grid[r][c] = cell.fixedNum || cell.fillNum || 0;
      }
    }

    let filledCount = 0;
    const historyEntry = {
      type: 'autoFillCandidates',
      cells: []
    };

    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        if (cell.fixedNum || cell.fillNum) continue; // 已有数字的格子跳过

        const oldCands = new Set(cell.candidates);
        const cands = this._getCellCandidates(grid, r, c);

        // 保存历史
        historyEntry.cells.push({
          r, c,
          oldFill: cell.fillNum,
          oldCandidates: oldCands
        });

        // 设置候选数（合并已有，不是替换——保留玩家手动标的额外候选）
        // 但对于自动填充，我们直接设置为理论候选，这样最准确
        cell.candidates.clear();
        for (const n of cands) {
          cell.candidates.add(n);
        }
        filledCount++;
      }
    }

    if (historyEntry.cells.length > 0) {
      this.history.push(historyEntry);
    }

    return filledCount;
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

    // 行冲突（固定数字 + 用户填的数字）
    for (let r = 0; r < this.size; r++) {
      const seen = {};
      for (let c = 0; c < this.size; c++) {
        const val = this.cells[r][c].fillNum || this.cells[r][c].fixedNum;
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
        const val = this.cells[r][c].fillNum || this.cells[r][c].fixedNum;
        if (!val) continue;
        if (seen[val] !== undefined) {
          this.cells[r][c].isError = true;
          this.cells[seen[val]][c].isError = true;
        } else {
          seen[val] = r;
        }
      }
    }

    // 宫冲突
    const { boxW, boxH } = this.getBoxSize();
    const boxRows = Math.ceil(this.size / boxH);
    const boxCols = Math.ceil(this.size / boxW);
    for (let boxR = 0; boxR < boxRows; boxR++) {
      for (let boxC = 0; boxC < boxCols; boxC++) {
        const seen = {};
        for (let r = boxR * boxH; r < boxR * boxH + boxH; r++) {
          for (let c = boxC * boxW; c < boxC * boxW + boxW; c++) {
            const val = this.cells[r][c].fillNum || this.cells[r][c].fixedNum;
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

    // 笼内重复检测
    for (const cage of this.cages) {
      const seen = {};
      let filledCount = 0;
      let currentSum = 0;
      for (const [r, c] of cage.cells) {
        const val = this.cells[r][c].fillNum || this.cells[r][c].fixedNum;
        if (!val) continue;
        filledCount++;
        currentSum += val;
        if (seen[val] !== undefined) {
          this.cells[r][c].isError = true;
          // 找到同笼中之前出现该数字的格子也标红
          for (const [pr, pc] of cage.cells) {
            const pv = this.cells[pr][pc].fillNum || this.cells[pr][pc].fixedNum;
            if (pv === val && (pr !== r || pc !== c)) {
              this.cells[pr][pc].isError = true;
            }
          }
        } else {
          seen[val] = true;
        }
      }
      // 笼和校验：当笼子所有格子都已填满时，检查和值是否正确
      if (filledCount === cage.cells.length && currentSum !== cage.sum) {
        for (const [r, c] of cage.cells) {
          this.cells[r][c].isError = true;
        }
      }
      // 笼和校验：即使未填满，如果当前和已超过目标和，也标记错误
      if (currentSum > cage.sum) {
        for (const [r, c] of cage.cells) {
          const val = this.cells[r][c].fillNum || this.cells[r][c].fixedNum;
          if (val) this.cells[r][c].isError = true;
        }
      }
    }
  }

  /**
   * 移动选中格（方向键用）
   */
  moveSelection(dr, dc) {
    const current = this.getActiveCell();
    if (!current) {
      this.selectCell(0, 0);
      return;
    }
    const { r, c } = current;
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

  // ---------- 提示系统 ----------
  /**
   * 计算下一步提示
   * @returns {Object|null} { r, c, num, technique, scope } 或 null
   */
  getNextHint() {
    // 先构建当前盘面状态
    const grid = [];
    for (let r = 0; r < this.size; r++) {
      grid[r] = [];
      for (let c = 0; c < this.size; c++) {
        grid[r][c] = this.cells[r][c].fixedNum || this.cells[r][c].fillNum || 0;
      }
    }

    // 用轻量版的提示引擎计算下一步
    // 技巧优先级：显单 > 隐单 > 45法则

    // 1. 显单（Naked Single）：某格只有一个候选
    const naked = this._findNakedSingleHint(grid);
    if (naked) return naked;

    // 2. 隐单（Hidden Single）：某行/列/宫/笼中某数字只出现在一个格子
    const hidden = this._findHiddenSingleHint(grid);
    if (hidden) return hidden;

    // 3. 显性数对（Naked Pair）：同行/列/宫两个格子恰有相同两个候选
    const nakedPair = this._findNakedPairHint(grid);
    if (nakedPair) return nakedPair;

    return null; // 45法则提示后续再加
  }

  /**
   * 显单提示：计算所有格子的候选数，找只有1个候选的
   */
  _findNakedSingleHint(grid) {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const candidates = this._getCellCandidates(grid, r, c);
        if (candidates.length === 1) {
          // 裸单：高亮同行+同列+同宫，让玩家看到"其他格子已经占满了所有数字"
          const highlightSet = new Set();
          const addCell = (rr, cc) => {
            if (rr >= 0 && rr < this.size && cc >= 0 && cc < this.size) {
              highlightSet.add(`${rr},${cc}`);
            }
          };
          // 同行
          for (let cc = 0; cc < this.size; cc++) addCell(r, cc);
          // 同列
          for (let rr = 0; rr < this.size; rr++) addCell(rr, c);
          // 同宫
          const { boxW, boxH } = this.getBoxSize();
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              addCell(br + dr, bc + dc);
          // 同笼
          const cell = this.cells[r][c];
          if (cell.cageId !== null) {
            for (let rr = 0; rr < this.size; rr++) {
              for (let cc = 0; cc < this.size; cc++) {
                if (this.cells[rr][cc].cageId === cell.cageId) addCell(rr, cc);
              }
            }
          }
          const highlightCells = [];
          for (const key of highlightSet) {
            const [rr, cc] = key.split(',').map(Number);
            highlightCells.push([rr, cc]);
          }
          return {
            r, c,
            num: candidates[0],
            technique: 'nakedSingle',
            techniqueName: '显性唯一（裸单）',
            description: '这个格子的同行、同列、同宫、同笼已经出现了其他所有数字，只剩一个候选',
            regionType: 'all',
            highlightCells
          };
        }
      }
    }
    return null;
  }

  /**
   * 隐单提示：检查行/列/宫/笼中，某个数字只出现在一个格子
   */
  _findHiddenSingleHint(grid) {
    const { boxW, boxH } = this.getBoxSize();
    const labels = 'ABCDEFGHI';

    // 行检查
    for (let r = 0; r < this.size; r++) {
      const posMap = new Map();
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidates(grid, r, c);
        for (const num of cands) {
          if (!posMap.has(num)) posMap.set(num, []);
          posMap.get(num).push(c);
        }
      }
      for (const [num, cols] of posMap) {
        if (cols.length === 1) {
          return {
            r, c: cols[0],
            num,
            technique: 'hiddenSingle',
            techniqueName: '隐性唯一（隐单）',
            description: `${labels[r]}行中，数字${num}只能填在这个格子`,
            regionType: 'row',
            regionIndex: r,
            highlightCells: this._getRowCells(r)
          };
        }
      }
    }

    // 列检查
    for (let c = 0; c < this.size; c++) {
      const posMap = new Map();
      for (let r = 0; r < this.size; r++) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidates(grid, r, c);
        for (const num of cands) {
          if (!posMap.has(num)) posMap.set(num, []);
          posMap.get(num).push(r);
        }
      }
      for (const [num, rows] of posMap) {
        if (rows.length === 1) {
          return {
            r: rows[0], c,
            num,
            technique: 'hiddenSingle',
            techniqueName: '隐性唯一（隐单）',
            description: `第${c + 1}列中，数字${num}只能填在这个格子`,
            regionType: 'col',
            regionIndex: c,
            highlightCells: this._getColCells(c)
          };
        }
      }
    }

    // 宫检查
    const boxRows = Math.ceil(this.size / boxH);
    const boxCols = Math.ceil(this.size / boxW);
    for (let br = 0; br < boxRows; br++) {
      for (let bc = 0; bc < boxCols; bc++) {
        const posMap = new Map();
        for (let r = br * boxH; r < br * boxH + boxH; r++) {
          for (let c = bc * boxW; c < bc * boxW + boxW; c++) {
            if (grid[r][c] !== 0) continue;
            const cands = this._getCellCandidates(grid, r, c);
            for (const num of cands) {
              if (!posMap.has(num)) posMap.set(num, []);
              posMap.get(num).push([r, c]);
            }
          }
        }
        for (const [num, positions] of posMap) {
          if (positions.length === 1) {
            const boxNum = br * boxCols + bc + 1;
            return {
              r: positions[0][0], c: positions[0][1],
              num,
              technique: 'hiddenSingle',
              techniqueName: '隐性唯一（隐单）',
              description: `第${boxNum}宫中，数字${num}只能填在这个格子`,
              regionType: 'box',
              regionIndex: br * boxCols + bc,
              highlightCells: this._getBoxCells(br, bc, boxH, boxW)
            };
          }
        }
      }
    }

    // 笼子检查
    for (const cage of this.cages) {
      const posMap = new Map();
      for (const [r, c] of cage.cells) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidates(grid, r, c);
        for (const num of cands) {
          if (!posMap.has(num)) posMap.set(num, []);
          posMap.get(num).push([r, c]);
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          return {
            r: positions[0][0], c: positions[0][1],
            num,
            technique: 'hiddenSingle',
            techniqueName: '隐性唯一（隐单）',
            description: `和为${cage.sum}的笼子中，数字${num}只能填在这里`,
            regionType: 'cage',
            regionIndex: cage.id,
            highlightCells: cage.cells.slice()
          };
        }
      }
    }

    return null;
  }

  /**
   * 显性数对提示：在同一行/列/宫中，两个格子恰好有相同的两个候选数
   * 找到后，模拟排除，返回被排除后能确定的那个格子
   */
  _findNakedPairHint(grid) {
    const { boxW, boxH } = this.getBoxSize();
    const labels = 'ABCDEFGHI';

    // 检查一个单元（行/列/宫/笼）内是否有显性数对
    const checkUnit = (cells, unitType, unitIndex) => {
      // 获取该单元内所有空格及其候选数
      const emptyCells = [];
      for (const [r, c] of cells) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidates(grid, r, c);
        if (cands.length === 2) {
          emptyCells.push({ r, c, cands });
        }
      }
      // 找两个候选完全相同的格子
      for (let i = 0; i < emptyCells.length; i++) {
        for (let j = i + 1; j < emptyCells.length; j++) {
          const a = emptyCells[i], b = emptyCells[j];
          if (a.cands[0] === b.cands[0] && a.cands[1] === b.cands[1]) {
            // 找到显性数对！模拟排除后看能否确定某个格子
            const pairNums = a.cands;
            // 检查单元内其他格子，排除pairNums后是否出现裸单
            for (const [r, c] of cells) {
              if (grid[r][c] !== 0) continue;
              if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
              let cands = this._getCellCandidates(grid, r, c);
              const filtered = cands.filter(n => n !== pairNums[0] && n !== pairNums[1]);
              if (filtered.length === 1 && cands.length > 1) {
                // 排除后只剩一个候选！这就是要填的格子
                const highlightSet = new Set();
                for (const [rr, cc] of cells) highlightSet.add(`${rr},${cc}`);
                const highlightCells = [];
                for (const key of highlightSet) {
                  const [rr, cc] = key.split(',').map(Number);
                  highlightCells.push([rr, cc]);
                }
                const regionNames = { row: '行', col: '列', box: '宫', cage: '笼' };
                return {
                  r, c,
                  num: filtered[0],
                  technique: 'nakedPair',
                  techniqueName: '显性数对',
                  description: `${labels[a.r]}${a.c+1}和${labels[b.r]}${b.c+1}构成数对{${pairNums[0]},${pairNums[1]}}，排除该${regionNames[unitType]}其他格子的这两个数字后，${labels[r]}${c+1}只剩${filtered[0]}`,
                  regionType: unitType,
                  regionIndex: unitIndex,
                  pairCells: [[a.r, a.c], [b.r, b.c]],
                  pairNums,
                  highlightCells
                };
              }
            }
            // 没有直接产生裸单，但数对本身值得提示（返回数对中的一个格子作为教学目标）
            const highlightSet = new Set();
            for (const [rr, cc] of cells) highlightSet.add(`${rr},${cc}`);
            const highlightCells = [];
            for (const key of highlightSet) {
              const [rr, cc] = key.split(',').map(Number);
              highlightCells.push([rr, cc]);
            }
            const regionNames = { row: '行', col: '列', box: '宫', cage: '笼' };
            return {
              r: a.r, c: a.c,
              num: null, // 不直接给数字，需要看教程
              technique: 'nakedPair',
              techniqueName: '显性数对',
              description: `${labels[a.r]}${a.c+1}和${labels[b.r]}${b.c+1}在同一${regionNames[unitType]}形成数对{${pairNums[0]},${pairNums[1]}}，这两个数字可以从该${regionNames[unitType]}其他格子中排除`,
              regionType: unitType,
              regionIndex: unitIndex,
              pairCells: [[a.r, a.c], [b.r, b.c]],
              pairNums,
              highlightCells
            };
          }
        }
      }
      return null;
    };

    // 检查所有行
    for (let r = 0; r < this.size; r++) {
      const result = checkUnit(this._getRowCells(r), 'row', r);
      if (result) return result;
    }
    // 检查所有列
    for (let c = 0; c < this.size; c++) {
      const result = checkUnit(this._getColCells(c), 'col', c);
      if (result) return result;
    }
    // 检查所有宫
    for (let br = 0; br < this.size / boxH; br++) {
      for (let bc = 0; bc < this.size / boxW; bc++) {
        const result = checkUnit(this._getBoxCells(br, bc, boxH, boxW), 'box', br * Math.floor(this.size / boxW) + bc);
        if (result) return result;
      }
    }
    return null;
  }

  /** 获取某行所有格子坐标 */
  _getRowCells(r) {
    const cells = [];
    for (let c = 0; c < this.size; c++) cells.push([r, c]);
    return cells;
  }
  /** 获取某列所有格子坐标 */
  _getColCells(c) {
    const cells = [];
    for (let r = 0; r < this.size; r++) cells.push([r, c]);
    return cells;
  }
  /** 获取某宫所有格子坐标 */
  _getBoxCells(br, bc, boxH, boxW) {
    const cells = [];
    for (let r = br * boxH; r < br * boxH + boxH; r++)
      for (let c = bc * boxW; c < bc * boxW + boxW; c++)
        cells.push([r, c]);
    return cells;
  }

  /**
   * 获取某格的候选数（基于已填数字的基础排除）
   */
  _getCellCandidates(grid, r, c) {
    const used = new Set();
    const { boxW, boxH } = this.getBoxSize();

    // 行
    for (let i = 0; i < this.size; i++) {
      if (grid[r][i] !== 0) used.add(grid[r][i]);
    }
    // 列
    for (let i = 0; i < this.size; i++) {
      if (grid[i][c] !== 0) used.add(grid[i][c]);
    }
    // 宫
    const boxR = Math.floor(r / boxH) * boxH;
    const boxC = Math.floor(c / boxW) * boxW;
    for (let i = boxR; i < boxR + boxH; i++) {
      for (let j = boxC; j < boxC + boxW; j++) {
        if (grid[i][j] !== 0) used.add(grid[i][j]);
      }
    }
    // 笼
    const cageId = this.cells[r][c].cageId;
    if (cageId !== null && this.cageIdToCells && this.cageIdToCells[cageId]) {
      for (const [cr, cc] of this.cageIdToCells[cageId]) {
        if (grid[cr][cc] !== 0) used.add(grid[cr][cc]);
      }
    }

    const candidates = [];
    for (let num = 1; num <= this.size; num++) {
      if (!used.has(num)) candidates.push(num);
    }
    return candidates;
  }

  /**
   * 显示提示（三层递进式）
   * @param {number|boolean} level - 1=仅位置, 2=技巧+区域高亮, 3=显示数字; 兼容旧的boolean(true=显示数字)
   * @returns {Object|null} 提示信息
   */
  showHint(level = 1) {
    // 兼容旧API：true等价于3，false等价于1
    if (level === true) level = 3;
    if (level === false) level = 1;

    // 先清除所有提示状态
    this.clearHints();

    const hint = this.getNextHint();
    if (!hint) return null;

    // 标记目标格
    const cell = this.cells[hint.r][hint.c];
    cell.isHintCell = true;

    // 第2层及以上：高亮关联区域（行/列/宫/笼）
    if (level >= 2 && hint.highlightCells) {
      for (const [r, c] of hint.highlightCells) {
        const rc = this.cells[r][c];
        if (r === hint.r && c === hint.c) continue; // 目标格本身用isHintCell样式
        // 数对格用pair样式，其他用region样式
        if (hint.pairCells && hint.pairCells.some(([pr, pc]) => pr === r && pc === c)) {
          rc.isHintPair = true;
        } else {
          rc.isHintRegion = true;
        }
      }
    }

    // 第3层：显示答案数字（如果有）
    if (level >= 3 && hint.num !== null && hint.num !== undefined) {
      cell.hintNumber = hint.num;
    }

    hint.level = level;
    return hint;
  }

  /**
   * 清除所有提示状态（目标格+区域高亮+提示数字）
   */
  clearHints() {
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        this.cells[r][c].isHintCell = false;
        this.cells[r][c].isHintRegion = false;
        this.cells[r][c].isHintPair = false;
        this.cells[r][c].hintNumber = null;
      }
    }
  }
}

// 全局单例
const gameBoard = new Board(9);
window.gameBoard = gameBoard;