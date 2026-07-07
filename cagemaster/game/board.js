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
    this.cageId = null;       // 兼容旧版：取第一个（最外层）笼子ID
    this.cageIds = [];        // 新版：支持嵌套笼，一个格子可属于多个笼子（从外到内排列）

    // 高亮掩码（星衡法则动画专用）
    this.isHighlightMask = false;
    this.highlightType = '';
    this.highlightOpacity = 0;

    // 提示数字（null表示只提示位置，不提示数字）
    this.isHintCell = false;   // 是否是提示格子（绿框目标格）
    this.isHintRegion = false; // 是否是提示关联区域（行/列/宫/笼半透明高亮）
    this.isHintPair = false;   // 是否是数对/链的关键格（需要特殊高亮）
    this.hintNumber = null;    // 提示的数字（null表示只提示位置，不提示数字）

    // 排除过程展示状态（用于 hint step 2 中的逐条排除展示）
    this.isHintEliminated = false;   // 是否标记为排除格（红斜线）
    this.hintEliminatedNum = null;   // 被排除的数字
    this.hintEliminationReason = '';  // 排除原因文字

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
    this.selectedCageId = null; // 当前选中格子所属的笼子ID（兼容旧版：最外层）
    this.selectedCageIds = [];  // 当前选中格子所属的所有笼子ID（嵌套笼用，从外到内）
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
      sfx: true,             // 音效
      bgmVolume: 50,         // BGM音量 0-100
      sfxVolume: 67,         // 音效音量 0-100
      vibration: true        // 触感反馈
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
        cell.cageIds = [];
      }
    }

    // 加载笼子（兼容多种坐标格式：数组[r,c]或字符串"r c"）
    // 经典数独没有笼子，兼容处理
    if (!cages || !Array.isArray(cages) || cages.length === 0) {
      this.cages = [];
      this.cageIdToCells = {};
    } else {
      this.cages = cages;
      this.cageIdToCells = {};
      
      const safeCages = cages.filter(c => c && c.cells);
      safeCages.forEach(cage => {
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
            // 支持嵌套笼：一个格子可属于多个笼子
            const cell = this.cells[r][c];
            cell.cageIds.push(cage.id);
            // 兼容旧版：cageId取最外层（第一个加入的）
            if (cell.cageId === null) cell.cageId = cage.id;
          }
        });
      });
    }
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
    // 同步记录所属笼子（支持嵌套笼：多笼归属）
    this.selectedCageId = cell.cageId;
    this.selectedCageIds = cell.cageIds ? [...cell.cageIds] : [];
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
      this.selectedCageIds = [];
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
    const startCell = this.cells[this.boxStart.r][this.boxStart.c];
    this.selectedCageId = startCell.cageId;
    this.selectedCageIds = startCell.cageIds ? [...startCell.cageIds] : [];
  }

  /**
   * 批量给选中的多个格子切换笔记
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
   * 获取同笼高亮的格子坐标数组（支持嵌套笼：返回所有层的笼子）
   */
  getSameCageHighlightCells() {
    if ((!this.selectedCageId && (!this.selectedCageIds || this.selectedCageIds.length === 0)) || !this.highlightSettings.sameCage) return [];
    if (!this.cageIdToCells) return [];

    const cellSet = new Set();
    const ids = this.selectedCageIds && this.selectedCageIds.length > 0 ? this.selectedCageIds : [this.selectedCageId];
    for (const cid of ids) {
      if (this.cageIdToCells[cid]) {
        for (const [r, c] of this.cageIdToCells[cid]) {
          cellSet.add(`${r},${c}`);
        }
      }
    }
    return Array.from(cellSet).map(s => {
      const [r, c] = s.split(',').map(Number);
      return { r, c };
    });
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
   * 自动清除行/列/宫/笼中所有关联格子的该笔记（可设置开关）
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

    // 自动清除行/列/宫/笼中关联格子的该笔记（受设置控制）
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
      // 笼（支持嵌套笼：遍历所有包含该格子的笼子）
      const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
      for (const cageId of cageIds) {
        if (this.cageIdToCells && this.cageIdToCells[cageId]) {
          for (const [cr, cc] of this.cageIdToCells[cageId]) {
            if ((cr !== r || cc !== c) && this.cells[cr][cc].fillNum === null && this.cells[cr][cc].candidates.has(num)) {
              this.cells[cr][cc].candidates.delete(num);
              historyEntry.relatedCandidates.push({ r: cr, c: cc, num });
            }
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
   * 一键清空所有笔记
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

    // 自动填笔记的撤销
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

    // 回滚被自动清理的关联笔记
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
   * 给选中格写入/移除笔记
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
   * 自动填充所有空格的理论笔记（新手辅助功能）
   * 基于行/列/宫/笼的已填数字做基础排除，不使用高级技巧
   * @returns {number} 填充的格子数量
   */
  autoFillCandidates() {
    // 构建当前grid状态（复用_buildGrid）
    const grid = this._buildGrid();

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

        // 设置笔记（合并已有，不是替换——保留玩家手动标的额外候选）
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
      // 残缺笼和（hiddenSum）不校验和值，只校验数字不重复
      if (!cage.hiddenSum && typeof cage.sum === 'number') {
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
   * 计算单个空格的影响力分数
   * 分数越高，填完这个格后对盘面的推动作用越大
   *
   * 维度及权重：
   * - 笼子剩余空格数倒数 (×0.35)：笼子越接近完成，填完越可能完成整个笼子
   * - 宫/行/列空白数倒数 (×0.25)：空白越少，填完后连锁反应越大
   * - 笔记倒数 (×0.15)：笔记越少越容易确定
   * - 是否涉及多个笼子交叉 (×0.15)：交叉点能同时推进多个笼子
   * - 是否触发星衡法则 (×0.10)：填完能让跨宫笼子的差值显现
   */
  _calcCellInfluence(r, c, grid) {
    const { boxW, boxH } = this.getBoxSize();

    // 1. 笔记
    const candidates = this._getCellCandidates(grid, r, c);
    const candCount = Math.max(candidates.length, 1);
    const candScore = 1 / candCount;

    // 2. 行/列/宫空白数（取三者中最小的，即"最接近完成"的维度）
    let rowEmpty = 0, colEmpty = 0, boxEmpty = 0;
    for (let i = 0; i < this.size; i++) {
      if (grid[r][i] === 0) rowEmpty++;
      if (grid[i][c] === 0) colEmpty++;
    }
    const br = Math.floor(r / boxH) * boxH;
    const bc = Math.floor(c / boxW) * boxW;
    for (let dr = 0; dr < boxH; dr++) {
      for (let dc = 0; dc < boxW; dc++) {
        if (grid[br + dr][bc + dc] === 0) boxEmpty++;
      }
    }
    const minEmpty = Math.min(rowEmpty, colEmpty, boxEmpty);
    const emptyScore = 1 / Math.max(minEmpty, 1);

    // 3. 笼子相关（杀手数独才有）
    let cageScore = 0;
    let cageCrossScore = 0;
    let rule45Score = 0;

    if (this.cages && this.cages.length > 0) {
      // 获取该格所在的所有笼子
      const cell = this.cells[r][c];
      const cageIds = cell.cageIds && cell.cageIds.length > 0
        ? cell.cageIds
        : (cell.cageId !== null ? [cell.cageId] : []);

      if (cageIds.length > 0) {
        // 多笼子交叉点加分
        cageCrossScore = cageIds.length > 1 ? 1 : 0;

        // 找剩余空格最少的笼子（最接近完成的）
        let minCageEmpty = Infinity;
        for (const cid of cageIds) {
          const cage = this.cages.find(cg => cg.id === cid);
          if (!cage) continue;
          let cageEmpty = 0;
          let cageBoxSet = new Set();
          for (const [cr, cc] of cage.cells) {
            if (grid[cr][cc] === 0) cageEmpty++;
            const cbr = Math.floor(cr / boxH);
            const cbc = Math.floor(cc / boxW);
            cageBoxSet.add(`${cbr},${cbc}`);
          }
          if (cageEmpty < minCageEmpty) {
            minCageEmpty = cageEmpty;
          }
          // 星衡法则触发：跨宫笼子，且填完后该笼子接近完成
          if (cageBoxSet.size > 1 && cageEmpty <= 2) {
            rule45Score = Math.max(rule45Score, 0.5 + (2 - cageEmpty) * 0.25);
          }
        }
        cageScore = 1 / Math.max(minCageEmpty, 1);
      }
    }

    // 加权求和
    const total =
      cageScore * 0.35 +
      emptyScore * 0.25 +
      candScore * 0.15 +
      cageCrossScore * 0.15 +
      rule45Score * 0.10;

    return total;
  }

  /**
   * 从多个提示中选影响力最高的
   */
  _pickMostInfluential(hints, grid) {
    if (hints.length === 0) return null;
    if (hints.length === 1) return hints[0];

    let best = hints[0];
    let bestScore = this._calcCellInfluence(best.r, best.c, grid);

    for (let i = 1; i < hints.length; i++) {
      const score = this._calcCellInfluence(hints[i].r, hints[i].c, grid);
      if (score > bestScore) {
        bestScore = score;
        best = hints[i];
      }
    }

    return best;
  }

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
    // 技巧优先级：显单 > 隐曜 > 并蒂锁 > 二连纵横阵
    // 同技巧等级内：选影响力最高的格子（填完后最能推动盘面进展）

    // 1. 显单（Naked Single）：某格只有一个候选
    const nakedHints = this._findAllNakedSingleHints(grid);
    if (nakedHints.length > 0) {
      return this._pickMostInfluential(nakedHints, grid);
    }

    // 2. 隐曜（Hidden Single）：某行/列/宫/笼中某数字只出现在一个格子
    const hiddenHints = this._findAllHiddenSingleHints(grid);
    if (hiddenHints.length > 0) {
      return this._pickMostInfluential(hiddenHints, grid);
    }

    // 3. 并蒂锁（Naked Pair）：同行/列/宫两个格子恰有相同两个候选
    const nakedPairHints = this._findAllNakedPairHints(grid);
    if (nakedPairHints.length > 0) {
      return this._pickMostInfluential(nakedPairHints, grid);
    }

    // 4. 二连纵横阵检测：某数字在两行中只出现在相同的两列（或反之）
    const 二连纵横阵Hints = this._findAllXWingHints(grid);
    if (二连纵横阵Hints.length > 0) {
      return this._pickMostInfluential(二连纵横阵Hints, grid);
    }

    return null; // 星衡法则提示后续再加
  }

  /**
   * 显单提示：计算所有格子的笔记，找只有1个候选的
   */
  _findNakedSingleHint(grid) {
    const { boxW, boxH } = this.getBoxSize();
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const candidates = this._getCellCandidates(grid, r, c);
        if (candidates.length === 1) {
          const answerNum = candidates[0];
          // 孤星：高亮同行+同列+同宫，让玩家看到"其他格子已经占满了所有数字"
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
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              addCell(br + dr, bc + dc);
          // 同笼（支持嵌套笼：所有包含该格的笼子）
          const cell = this.cells[r][c];
          const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
          if (cageIds.length > 0) {
            for (let rr = 0; rr < this.size; rr++) {
              for (let cc = 0; cc < this.size; cc++) {
                const otherCageIds = this.cells[rr][cc].cageIds || [];
                for (const cid of cageIds) {
                  if (otherCageIds.includes(cid) || this.cells[rr][cc].cageId === cid) {
                    addCell(rr, cc);
                    break;
                  }
                }
              }
            }
          }
          const highlightCells = [];
          for (const key of highlightSet) {
            const [rr, cc] = key.split(',').map(Number);
            highlightCells.push([rr, cc]);
          }

          // 生成 eliminationSteps：对每个非答案数字，找出它出现在哪里导致被排除
          const eliminationSteps = [];
          const boxStartR = Math.floor(r / boxH) * boxH;
          const boxStartC = Math.floor(c / boxW) * boxW;
          for (let num = 1; num <= this.size; num++) {
            if (num === answerNum) continue;
            // 查行
            for (let cc = 0; cc < this.size; cc++) {
              if (cc === c) continue;
              if (grid[r][cc] === num) {
                eliminationSteps.push({ r, c: cc, eliminatedNum: num, reason: `同行已有${num}` });
                break; // 找到一个来源即可
              }
            }
            // 查列
            for (let rr = 0; rr < this.size; rr++) {
              if (rr === r) continue;
              if (grid[rr][c] === num) {
                eliminationSteps.push({ r: rr, c, eliminatedNum: num, reason: `同列已有${num}` });
                break;
              }
            }
            // 查宫
            for (let dr = 0; dr < boxH; dr++) {
              let found = false;
              for (let dc = 0; dc < boxW; dc++) {
                const rr = boxStartR + dr, cc = boxStartC + dc;
                if (rr === r && cc === c) continue;
                if (grid[rr][cc] === num) {
                  eliminationSteps.push({ r: rr, c: cc, eliminatedNum: num, reason: `同宫已有${num}` });
                  found = true; break;
                }
              }
              if (found) break;
            }
            // 查笼（支持嵌套笼：所有包含该格的笼子）
            const cageIds2 = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
            for (const cid of cageIds2) {
              if (this.cageIdToCells && this.cageIdToCells[cid]) {
                for (const [cr, cc] of this.cageIdToCells[cid]) {
                  if (cr === r && cc === c) continue;
                  if (grid[cr][cc] === num) {
                    const alreadyHas = eliminationSteps.some(s => s.eliminatedNum === num);
                    if (!alreadyHas) {
                      eliminationSteps.push({ r: cr, c: cc, eliminatedNum: num, reason: `同笼已有${num}` });
                    }
                    break;
                  }
                }
              }
            }
          }

          const hasCages = this.cages && this.cages.length > 0;
          return {
            r, c,
            num: answerNum,
            technique: 'nakedSingle',
            techniqueName: hasCages ? '显性唯一（孤星）' : '显性唯一',
            description: hasCages 
              ? '这个格子的同行、同列、同宫、同笼已经出现了其他所有数字，只剩一个候选'
              : '这个格子的同行、同列、同宫已经出现了其他所有数字，只剩一个候选',
            regionType: 'all',
            highlightCells,
            eliminationSteps
          };
        }
      }
    }
    return null;
  }

  /**
   * 找出所有孤星提示（返回完整提示对象数组）
   */
  _findAllNakedSingleHints(grid) {
    const hints = [];
    const { boxW, boxH } = this.getBoxSize();
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const candidates = this._getCellCandidates(grid, r, c);
        if (candidates.length === 1) {
          const answerNum = candidates[0];
          // 孤星：高亮同行+同列+同宫，让玩家看到"其他格子已经占满了所有数字"
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
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              addCell(br + dr, bc + dc);
          // 同笼（支持嵌套笼：所有包含该格的笼子）
          const cell = this.cells[r][c];
          const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
          if (cageIds.length > 0) {
            for (let rr = 0; rr < this.size; rr++) {
              for (let cc = 0; cc < this.size; cc++) {
                const otherCageIds = this.cells[rr][cc].cageIds || [];
                for (const cid of cageIds) {
                  if (otherCageIds.includes(cid) || this.cells[rr][cc].cageId === cid) {
                    addCell(rr, cc);
                    break;
                  }
                }
              }
            }
          }
          const highlightCells = [];
          for (const key of highlightSet) {
            const [rr, cc] = key.split(',').map(Number);
            highlightCells.push([rr, cc]);
          }

          // 生成 eliminationSteps：对每个非答案数字，找出它出现在哪里导致被排除
          const eliminationSteps = [];
          const boxStartR = Math.floor(r / boxH) * boxH;
          const boxStartC = Math.floor(c / boxW) * boxW;
          for (let num = 1; num <= this.size; num++) {
            if (num === answerNum) continue;
            // 查行
            for (let cc = 0; cc < this.size; cc++) {
              if (cc === c) continue;
              if (grid[r][cc] === num) {
                eliminationSteps.push({ r, c: cc, eliminatedNum: num, reason: `同行已有${num}` });
                break;
              }
            }
            // 查列
            for (let rr = 0; rr < this.size; rr++) {
              if (rr === r) continue;
              if (grid[rr][c] === num) {
                eliminationSteps.push({ r: rr, c, eliminatedNum: num, reason: `同列已有${num}` });
                break;
              }
            }
            // 查宫
            let foundInBox = false;
            for (let dr = 0; dr < boxH && !foundInBox; dr++) {
              for (let dc = 0; dc < boxW && !foundInBox; dc++) {
                const rr = boxStartR + dr, cc = boxStartC + dc;
                if (rr === r && cc === c) continue;
                if (grid[rr][cc] === num) {
                  const alreadyFromRow = eliminationSteps.some(s => s.r === r && s.eliminatedNum === num);
                  const alreadyFromCol = eliminationSteps.some(s => s.c === c && s.eliminatedNum === num);
                  if (!alreadyFromRow && !alreadyFromCol) {
                    eliminationSteps.push({ r: rr, c: cc, eliminatedNum: num, reason: `同宫已有${num}` });
                  }
                  foundInBox = true;
                }
              }
            }
            // 查笼子（杀手数独）
            if (this.cages && this.cages.length > 0 && cageIds.length > 0) {
              let foundInCage = false;
              for (const cid of cageIds) {
                if (foundInCage) break;
                const cage = this.cages.find(cg => cg.id === cid);
                if (!cage) continue;
                for (const [cr, cc] of cage.cells) {
                  if (cr === r && cc === c) continue;
                  if (grid[cr][cc] === num) {
                    const alreadyFromRow = eliminationSteps.some(s => s.r === r && s.eliminatedNum === num);
                    const alreadyFromCol = eliminationSteps.some(s => s.c === c && s.eliminatedNum === num);
                    const alreadyFromBox = eliminationSteps.some(s => {
                      const sbr = Math.floor(s.r / boxH);
                      const sbc = Math.floor(s.c / boxW);
                      return sbr === Math.floor(r / boxH) && sbc === Math.floor(c / boxW) && s.eliminatedNum === num;
                    });
                    if (!alreadyFromRow && !alreadyFromCol && !alreadyFromBox) {
                      eliminationSteps.push({ r: cr, c: cc, eliminatedNum: num, reason: `同笼已有${num}` });
                    }
                    foundInCage = true;
                    break;
                  }
                }
              }
            }
          }

          const hasCages = this.cages && this.cages.length > 0;
          hints.push({
            r, c,
            num: answerNum,
            technique: 'nakedSingle',
            techniqueName: hasCages ? '显性唯一（孤星）' : '显性唯一',
            description: hasCages
              ? '这个格子的同行、同列、同宫、同笼已经出现了其他所有数字，只剩一个候选'
              : '这个格子的同行、同列、同宫已经出现了其他所有数字，只剩一个候选',
            regionType: 'all',
            highlightCells,
            eliminationSteps
          });
        }
      }
    }
    return hints;
  }

  /**
   * 隐曜提示：检查行/列/宫/笼中，某个数字只出现在一个格子
   */
  _findHiddenSingleHint(grid) {
    const { boxW, boxH } = this.getBoxSize();
    const labels = 'ABCDEFGHI';

    // Helper：生成 hidden single 的 eliminationSteps
    // 对于隐曜，展示该单元中其他空格为什么不能填这个数字
    const buildHiddenSingleEliminationSteps = (targetR, targetC, num, unitCells) => {
      const steps = [];
      for (const [ur, uc] of unitCells) {
        if (ur === targetR && uc === targetC) continue;
        if (grid[ur][uc] !== 0) continue;
        // 检查该格子是否有这个候选
        const cands = this._getCellCandidates(grid, ur, uc);
        if (!cands.includes(num)) continue;
        // 检查为什么 num 不能放在 (ur, uc) —— 看行/列/宫中哪个已有 num
        let reason = '';
        // 行检查
        for (let cc = 0; cc < this.size; cc++) {
          if (grid[ur][cc] === num) { reason = `第${ur+1}行已有${num}`; break; }
        }
        if (!reason) {
          for (let rr = 0; rr < this.size; rr++) {
            if (grid[rr][uc] === num) { reason = `第${uc+1}列已有${num}`; break; }
          }
        }
        if (!reason) {
          const bR = Math.floor(ur / boxH) * boxH, bC = Math.floor(uc / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              if (grid[bR + dr][bC + dc] === num) { reason = `第${Math.floor(bR/boxH)*Math.floor(this.size/boxW)+Math.floor(bC/boxW)+1}宫已有${num}`; dr = boxH; break; }
        }
        if (!reason) {
          // 笼子检查
          const cageIdCell = this.cells[ur][uc].cageId;
          if (cageIdCell !== null && this.cageIdToCells && this.cageIdToCells[cageIdCell]) {
            for (const [cr, cc] of this.cageIdToCells[cageIdCell]) {
              if (grid[cr][cc] === num) { reason = `同笼已有${num}`; break; }
            }
          }
        }
        if (reason) {
          steps.push({ r: ur, c: uc, eliminatedNum: num, reason });
        } else {
          // 保险：如果找不到具体原因，给出一般的说明
          steps.push({ r: ur, c: uc, eliminatedNum: num, reason: `受其他约束限制` });
        }
      }
      return steps;
    };

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
          const unitCells = this._getRowCells(r);
          const eliminationSteps = buildHiddenSingleEliminationSteps(r, cols[0], num, unitCells);
          return {
            r, c: cols[0],
            num,
            technique: 'hiddenSingle',
            techniqueName: '找位置法',
            description: `在第${r + 1}行中，数字${num}只能放在这一格`,
            regionType: 'row',
            regionIndex: r,
            highlightCells: this._getRowCells(r),
            eliminationSteps
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
          const unitCells = this._getColCells(c);
          const eliminationSteps = buildHiddenSingleEliminationSteps(rows[0], c, num, unitCells);
          return {
            r: rows[0], c,
            num,
            technique: 'hiddenSingle',
            techniqueName: '找位置法',
            description: `在第${c + 1}列中，数字${num}只能放在这一格`,
            regionType: 'col',
            regionIndex: c,
            highlightCells: this._getColCells(c),
            eliminationSteps
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
            const unitCells = this._getBoxCells(br, bc, boxH, boxW);
            const eliminationSteps = buildHiddenSingleEliminationSteps(positions[0][0], positions[0][1], num, unitCells);
            return {
              r: positions[0][0], c: positions[0][1],
              num,
              technique: 'hiddenSingle',
              techniqueName: '找位置法',
              description: `在第${boxNum}宫中，数字${num}只能放在这一格`,
              regionType: 'box',
              regionIndex: br * boxCols + bc,
              highlightCells: this._getBoxCells(br, bc, boxH, boxW),
              eliminationSteps
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
          const unitCells = cage.cells.slice();
          const eliminationSteps = buildHiddenSingleEliminationSteps(positions[0][0], positions[0][1], num, unitCells);
          
          // 分析难度等级
          let difficulty = 'easy'; // easy: 纯行列宫排除
          let hasCageConstraint = false;
          let hasComplexConstraint = false;
          for (const step of eliminationSteps) {
            if (step.reason === '受其他约束限制') {
              hasComplexConstraint = true;
              difficulty = 'hard';
            } else if (step.reason && step.reason.includes('同笼')) {
              hasCageConstraint = true;
              if (difficulty === 'easy') difficulty = 'medium';
            }
          }
          
          // 计算笼子的可能组合（用于提示引导）
          let cageCombos = null;
          if (hasComplexConstraint) {
            cageCombos = this._getCageCombinations(cage);
          }
          
          return {
            r: positions[0][0], c: positions[0][1],
            num,
            technique: 'hiddenSingle',
            techniqueName: hasComplexConstraint ? '笼子排除法' : '隐性唯一（隐曜）',
            description: `和为${cage.sum}的${cage.cells.length}格笼中，数字${num}只能填在这里`,
            regionType: 'cage',
            regionIndex: cage.id,
            highlightCells: cage.cells.slice(),
            eliminationSteps,
            difficulty,
            cageInfo: {
              sum: cage.sum,
              size: cage.cells.length,
              combos: cageCombos,
              hasNum: true
            }
          };
        }
      }
    }

    return null;
  }

  /**
   * 找出所有隐曜提示（当前版本：复用原函数，找到第一个即返回单元素数组）
   * 后续可优化为真正收集所有隐曜后按影响力排序
   */
  _findAllHiddenSingleHints(grid) {
    const hint = this._findHiddenSingleHint(grid);
    return hint ? [hint] : [];
  }

  /**
   * 并蒂锁提示：在同一行/列/宫中，两个格子恰好有相同的两个笔记
   * 找到后，模拟排除，返回被排除后能确定的那个格子
   */
  _findNakedPairHint(grid) {
    const { boxW, boxH } = this.getBoxSize();
    const labels = 'ABCDEFGHI';

    // 检查一个单元（行/列/宫/笼）内是否有并蒂锁
    const checkUnit = (cells, unitType, unitIndex) => {
      // 获取该单元内所有空格及其笔记
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
            // 找到并蒂锁！模拟排除后看能否确定某个格子
            const pairNums = a.cands;
            // 检查单元内其他格子，排除pairNums后是否出现孤星
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
                // 生成 eliminationSteps
                const eliminationSteps = [];
                // 数对格自身的排除
                eliminationSteps.push({ r: a.r, c: a.c, eliminatedNum: pairNums[0], reason: `数对格之一{${pairNums[0]},${pairNums[1]}}` });
                eliminationSteps.push({ r: a.r, c: a.c, eliminatedNum: pairNums[1], reason: `数对格之一{${pairNums[0]},${pairNums[1]}}` });
                eliminationSteps.push({ r: b.r, c: b.c, eliminatedNum: pairNums[0], reason: `数对格之二{${pairNums[0]},${pairNums[1]}}` });
                eliminationSteps.push({ r: b.r, c: b.c, eliminatedNum: pairNums[1], reason: `数对格之二{${pairNums[0]},${pairNums[1]}}` });
                // 目标格中被排除的数对数字
                if (cands.includes(pairNums[0])) {
                  eliminationSteps.push({ r, c, eliminatedNum: pairNums[0], reason: `数对排除：${labels[a.r]}${a.c+1}/${labels[b.r]}${b.c+1}占用` });
                }
                if (cands.includes(pairNums[1])) {
                  eliminationSteps.push({ r, c, eliminatedNum: pairNums[1], reason: `数对排除：${labels[a.r]}${a.c+1}/${labels[b.r]}${b.c+1}占用` });
                }
                return {
                  r, c,
                  num: filtered[0],
                  technique: 'nakedPair',
                  techniqueName: '并蒂锁',
                  description: `${labels[a.r]}${a.c+1}和${labels[b.r]}${b.c+1}构成数对{${pairNums[0]},${pairNums[1]}}，排除该${regionNames[unitType]}其他格子的这两个数字后，${labels[r]}${c+1}只剩${filtered[0]}`,
                  regionType: unitType,
                  regionIndex: unitIndex,
                  pairCells: [[a.r, a.c], [b.r, b.c]],
                  pairNums,
                  highlightCells,
                  eliminationSteps
                };
              }
            }
            // 没有直接产生孤星，但数对本身值得提示（返回数对中的一个格子作为教学目标）
            const highlightSet = new Set();
            for (const [rr, cc] of cells) highlightSet.add(`${rr},${cc}`);
            const highlightCells = [];
            for (const key of highlightSet) {
              const [rr, cc] = key.split(',').map(Number);
              highlightCells.push([rr, cc]);
            }
            const regionNames = { row: '行', col: '列', box: '宫', cage: '笼' };
            // 生成 eliminationSteps
            const eliminationSteps = [];
            eliminationSteps.push({ r: a.r, c: a.c, eliminatedNum: pairNums[0], reason: `数对格之一{${pairNums[0]},${pairNums[1]}}` });
            eliminationSteps.push({ r: a.r, c: a.c, eliminatedNum: pairNums[1], reason: `数对格之一{${pairNums[0]},${pairNums[1]}}` });
            eliminationSteps.push({ r: b.r, c: b.c, eliminatedNum: pairNums[0], reason: `数对格之二{${pairNums[0]},${pairNums[1]}}` });
            eliminationSteps.push({ r: b.r, c: b.c, eliminatedNum: pairNums[1], reason: `数对格之二{${pairNums[0]},${pairNums[1]}}` });
            return {
              r: a.r, c: a.c,
              num: null, // 不直接给数字，需要看教程
              technique: 'nakedPair',
              techniqueName: '并蒂锁',
              description: `${labels[a.r]}${a.c+1}和${labels[b.r]}${b.c+1}在同一${regionNames[unitType]}形成数对{${pairNums[0]},${pairNums[1]}}，这两个数字可以从该${regionNames[unitType]}其他格子中排除`,
              regionType: unitType,
              regionIndex: unitIndex,
              pairCells: [[a.r, a.c], [b.r, b.c]],
              pairNums,
              highlightCells,
              eliminationSteps
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

  /**
   * 找出所有并蒂锁提示（当前版本：复用原函数，找到第一个即返回单元素数组）
   * 后续可优化为真正收集所有后按影响力排序
   */
  _findAllNakedPairHints(grid) {
    const hint = this._findNakedPairHint(grid);
    return hint ? [hint] : [];
  }

  /**
   * 二连纵横阵检测（轻量版）
   * 对每个数字，检查是否存在两行中该数字只出现在相同的两列，
   * 则这两列的其他行中该数字可以被排除（反之亦然：两列→两行）。
   * @returns {Object|null} hint 对象
   */
  _findXWingHint(grid) {
    const { boxW, boxH } = this.getBoxSize();

    // Helper: 获取某格笔记
    const getCands = (r, c) => {
      if (grid[r][c] !== 0) return [];
      return this._getCellCandidates(grid, r, c);
    };

    for (let num = 1; num <= this.size; num++) {
      // ---- 按行扫描（行→列 二连纵横阵）----
      // 找出每行中 num 出现在哪些列
      const rowCols = []; // [{row, cols: [c1, c2]}]
      for (let r = 0; r < this.size; r++) {
        const cols = [];
        for (let c = 0; c < this.size; c++) {
          if (grid[r][c] === num) { cols.push(c); continue; }
          if (grid[r][c] === 0 && getCands(r, c).includes(num)) {
            cols.push(c);
          }
        }
        if (cols.length === 2) rowCols.push({ row: r, cols: cols.slice() });
      }

      // 找两行有相同两列
      for (let i = 0; i < rowCols.length; i++) {
        for (let j = i + 1; j < rowCols.length; j++) {
          const a = rowCols[i], b = rowCols[j];
          if (a.cols[0] === b.cols[0] && a.cols[1] === b.cols[1]) {
            const col1 = a.cols[0], col2 = a.cols[1];
            // 检查是否能从这两列的其他行中排除 num
            const eliminationSteps = [];
            let hasElimination = false;
            for (let r = 0; r < this.size; r++) {
              if (r === a.row || r === b.row) continue;
              // 在 col1 中
              if (getCands(r, col1).includes(num)) {
                eliminationSteps.push({ r, c: col1, eliminatedNum: num, reason: `二连纵横阵: 行${a.row+1}与行${b.row+1}的${num}仅在第${col1+1}列和第${col2+1}列` });
                hasElimination = true;
              }
              // 在 col2 中
              if (getCands(r, col2).includes(num)) {
                eliminationSteps.push({ r, c: col2, eliminatedNum: num, reason: `二连纵横阵: 行${a.row+1}与行${b.row+1}的${num}仅在第${col1+1}列和第${col2+1}列` });
                hasElimination = true;
              }
            }
            if (hasElimination) {
              const labels = 'ABCDEFGHI';
              const highlightCells = [];
              for (let r = 0; r < this.size; r++) {
                highlightCells.push([r, col1]);
                highlightCells.push([r, col2]);
              }
              // 二连纵横阵也可能直接产生孤星——检查有没有某格排除后只剩一个候选
              let resultNum = null, resultR = null, resultC = null;
              for (let r = 0; r < this.size; r++) {
                if (r === a.row || r === b.row) continue;
                const candsCol1 = getCands(r, col1);
                const candsCol2 = getCands(r, col2);
                const filtered1 = candsCol1.filter(n => n !== num);
                const filtered2 = candsCol2.filter(n => n !== num);
                if (filtered1.length === 1 && candsCol1.length > 1) {
                  resultNum = filtered1[0]; resultR = r; resultC = col1;
                }
                if (!resultNum && filtered2.length === 1 && candsCol2.length > 1) {
                  resultNum = filtered2[0]; resultR = r; resultC = col2;
                }
              }
              if (resultNum) {
                return {
                  r: resultR, c: resultC,
                  num: resultNum,
                  technique: '二连纵横阵',
                  techniqueName: '二连纵横阵',
                  description: `数字${num}在行${a.row+1}和行${b.row+1}中只出现在第${col1+1}列和第${col2+1}列，形成二连纵横阵结构，排除其他行这两列中的${num}后，${labels[resultR]}${resultC+1}只剩${resultNum}`,
                  regionType: 'all',
                  highlightCells,
                  eliminationSteps,
                  二连纵横阵Info: { num, rows: [a.row, b.row], cols: [col1, col2] }
                };
              }
              return {
                r: a.row, c: col1,
                num: null,
                technique: '二连纵横阵',
                techniqueName: '二连纵横阵',
                description: `数字${num}在行${a.row+1}和行${b.row+1}中只出现在第${col1+1}列和第${col2+1}列，形成二连纵横阵结构，可以排除其他行这两列中的${num}`,
                regionType: 'all',
                highlightCells,
                eliminationSteps,
                二连纵横阵Info: { num, rows: [a.row, b.row], cols: [col1, col2] }
              };
            }
          }
        }
      }

      // ---- 按列扫描（列→行 二连纵横阵）----
      const colRows = [];
      for (let c = 0; c < this.size; c++) {
        const rows = [];
        for (let r = 0; r < this.size; r++) {
          if (grid[r][c] === num) { rows.push(r); continue; }
          if (grid[r][c] === 0 && getCands(r, c).includes(num)) {
            rows.push(r);
          }
        }
        if (rows.length === 2) colRows.push({ col: c, rows: rows.slice() });
      }

      for (let i = 0; i < colRows.length; i++) {
        for (let j = i + 1; j < colRows.length; j++) {
          const a = colRows[i], b = colRows[j];
          if (a.rows[0] === b.rows[0] && a.rows[1] === b.rows[1]) {
            const row1 = a.rows[0], row2 = a.rows[1];
            const eliminationSteps = [];
            let hasElimination = false;
            for (let c = 0; c < this.size; c++) {
              if (c === a.col || c === b.col) continue;
              if (getCands(row1, c).includes(num)) {
                eliminationSteps.push({ r: row1, c, eliminatedNum: num, reason: `二连纵横阵: 列${a.col+1}与列${b.col+1}的${num}仅在第${row1+1}行和第${row2+1}行` });
                hasElimination = true;
              }
              if (getCands(row2, c).includes(num)) {
                eliminationSteps.push({ r: row2, c, eliminatedNum: num, reason: `二连纵横阵: 列${a.col+1}与列${b.col+1}的${num}仅在第${row1+1}行和第${row2+1}行` });
                hasElimination = true;
              }
            }
            if (hasElimination) {
              const labels = 'ABCDEFGHI';
              const highlightCells = [];
              for (let c = 0; c < this.size; c++) {
                highlightCells.push([row1, c]);
                highlightCells.push([row2, c]);
              }
              // 检查是否产生孤星
              let resultNum = null, resultR = null, resultC = null;
              for (let c = 0; c < this.size; c++) {
                if (c === a.col || c === b.col) continue;
                const candsRow1 = getCands(row1, c);
                const candsRow2 = getCands(row2, c);
                const filtered1 = candsRow1.filter(n => n !== num);
                const filtered2 = candsRow2.filter(n => n !== num);
                if (filtered1.length === 1 && candsRow1.length > 1) {
                  resultNum = filtered1[0]; resultR = row1; resultC = c;
                }
                if (!resultNum && filtered2.length === 1 && candsRow2.length > 1) {
                  resultNum = filtered2[0]; resultR = row2; resultC = c;
                }
              }
              if (resultNum) {
                return {
                  r: resultR, c: resultC,
                  num: resultNum,
                  technique: '二连纵横阵',
                  techniqueName: '二连纵横阵',
                  description: `数字${num}在第${a.col+1}列和第${b.col+1}列中只出现在行${row1+1}和行${row2+1}，形成二连纵横阵结构，排除其他列这两行中的${num}后，${labels[resultR]}${resultC+1}只剩${resultNum}`,
                  regionType: 'all',
                  highlightCells,
                  eliminationSteps,
                  二连纵横阵Info: { num, rows: [row1, row2], cols: [a.col, b.col] }
                };
              }
              return {
                r: row1, c: a.col,
                num: null,
                technique: '二连纵横阵',
                techniqueName: '二连纵横阵',
                description: `数字${num}在第${a.col+1}列和第${b.col+1}列中只出现在行${row1+1}和行${row2+1}，形成二连纵横阵结构，可以排除其他列这两行中的${num}`,
                regionType: 'all',
                highlightCells,
                eliminationSteps,
                二连纵横阵Info: { num, rows: [row1, row2], cols: [a.col, b.col] }
              };
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * 找出所有二连纵横阵提示（当前版本：复用原函数，找到第一个即返回单元素数组）
   * 后续可优化为真正收集所有后按影响力排序
   */
  _findAllXWingHints(grid) {
    const hint = this._findXWingHint(grid);
    return hint ? [hint] : [];
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
   * 获取某格的笔记（基于已填数字的基础排除）
   * @param {number} r - 行
   * @param {number} c - 列
   * @param {boolean} useCache - 是否使用已有的candidates缓存（默认true）
   * @returns {number[]} 笔记数字数组
   */
  getCandidates(r, c, useCache = true) {
    if (useCache && this.cells[r] && this.cells[r][c]) {
      const cell = this.cells[r][c];
      if (cell.candidates && cell.candidates.size > 0) {
        return [...cell.candidates];
      }
    }
    // 构建当前grid状态
    const grid = this._buildGrid();
    return this._getCellCandidates(grid, r, c);
  }

  /**
   * 更新笔记（单格或全局）
   * @param {Object} options
   * @param {number} [options.r] - 行（不传则更新全部）
   * @param {number} [options.c] - 列
   * @param {number} [options.num] - 排除的数字（填数时自动排除）
   */
  updateCandidates(options = {}) {
    const { r, c, num } = options;
    const grid = this._buildGrid();

    if (r !== undefined && c !== undefined) {
      // 单格更新
      const cell = this.cells[r][c];
      if (cell.fixedNum || cell.fillNum) return;
      const cands = this._getCellCandidates(grid, r, c);
      cell.candidates.clear();
      for (const n of cands) cell.candidates.add(n);
    } else if (num !== undefined) {
      // 排除某个数字（填入数字后自动清理关联候选）
      for (let i = 0; i < this.size; i++) {
        for (let j = 0; j < this.size; j++) {
          const cell = this.cells[i][j];
          if (!cell.fixedNum && !cell.fillNum) {
            cell.candidates.delete(num);
          }
        }
      }
    } else {
      // 全盘更新
      for (let i = 0; i < this.size; i++) {
        for (let j = 0; j < this.size; j++) {
          const cell = this.cells[i][j];
          if (cell.fixedNum || cell.fillNum) continue;
          const cands = this._getCellCandidates(grid, i, j);
          cell.candidates.clear();
          for (const n of cands) cell.candidates.add(n);
        }
      }
    }
  }

  /**
   * 清除笔记（单格或全局）
   * @param {Object} [options]
   * @param {number} [options.r] - 行
   * @param {number} [options.c] - 列
   */
  clearCandidates(options) {
    if (options && options.r !== undefined && options.c !== undefined) {
      // 单格清除
      const { r, c } = options;
      if (this.cells[r] && this.cells[r][c]) {
        this.cells[r][c].candidates.clear();
      }
    } else {
      // 全局清除（调用现有的 clearAllCandidates）
      this.clearAllCandidates();
    }
  }

  /**
   * 构建当前盘面数字矩阵
   */
  _buildGrid() {
    const grid = [];
    for (let r = 0; r < this.size; r++) {
      grid[r] = [];
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        grid[r][c] = cell.fixedNum || cell.fillNum || 0;
      }
    }
    return grid;
  }
  /**
   * 检查数字 num 是否可能出现在笼子的剩余组合中
   * 用数学边界法快速判断，无需生成所有组合
   */
  _canNumBeInCage(num, remainSum, emptyCount, filledNumsSet, maxNum) {
    if (num < 1 || num > maxNum) return false;
    if (filledNumsSet.has(num)) return false;
    if (emptyCount <= 0) return false;
    
    const remainingCount = emptyCount - 1;
    const remainingSum = remainSum - num;
    
    // 如果只剩0格（即这是最后一个空格）
    if (remainingCount === 0) {
      return remainingSum === 0;
    }
    if (remainingCount < 0) return false;
    
    // 计算剩余 remainingCount 个数字的最小可能和（排除num和已填数字）
    let minSum = 0;
    let count = 0;
    for (let i = 1; i <= maxNum && count < remainingCount; i++) {
      if (i !== num && !filledNumsSet.has(i)) {
        minSum += i;
        count++;
      }
    }
    if (count < remainingCount) return false; // 可用数字不够
    
    // 计算剩余 remainingCount 个数字的最大可能和
    let maxSum = 0;
    count = 0;
    for (let i = maxNum; i >= 1 && count < remainingCount; i--) {
      if (i !== num && !filledNumsSet.has(i)) {
        maxSum += i;
        count++;
      }
    }
    
    // remainingSum 必须在 [minSum, maxSum] 范围内
    return remainingSum >= minSum && remainingSum <= maxSum;
  }

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
    // 笼（支持嵌套笼：所有包含该格的笼子）
    const cell = this.cells[r][c];
    const cageIds3 = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
    
    // 收集笼子和值约束（取最严格的那个）
    const cageConstraints = [];
    for (const cid of cageIds3) {
      if (!this.cageIdToCells || !this.cageIdToCells[cid]) continue;
      const cage = this.cages.find(cg => cg.id === cid);
      if (!cage || !cage.sum) continue;
      
      let filledSum = 0;
      let emptyCount = 0;
      const cageFilledNums = new Set();
      for (const [cr, cc] of this.cageIdToCells[cid]) {
        const v = grid[cr][cc];
        if (v !== 0) {
          filledSum += v;
          cageFilledNums.add(v);
        } else {
          emptyCount++;
        }
      }
      const remain = cage.sum - filledSum;
      if (emptyCount > 0 && remain > 0) {
        cageConstraints.push({ remain, emptyCount, filledNums: cageFilledNums });
      }
      
      // 同时收集笼内已填数字（笼内不重复规则）
      for (const [cr, cc] of this.cageIdToCells[cid]) {
        if (grid[cr][cc] !== 0) used.add(grid[cr][cc]);
      }
    }

    const candidates = [];
    for (let num = 1; num <= this.size; num++) {
      if (used.has(num)) continue;
      // 检查笼子和值约束
      let passCageConstraint = true;
      for (const cc of cageConstraints) {
        if (!this._canNumBeInCage(num, cc.remain, cc.emptyCount, cc.filledNums, this.size)) {
          passCageConstraint = false;
          break;
        }
      }
      if (passCageConstraint) {
        candidates.push(num);
      }
    }
    return candidates;
  }

  /**
   * 计算笼子的所有可能数字组合（用于提示引导）
   * 返回：包含 num 的组合 和 不包含 num 的组合
   */
  _getCageCombinations(cage) {
    const size = cage.cells.length;
    const sum = cage.sum;
    const maxNum = this.size;
    
    // 生成所有 size 个不同数字的组合，和为 sum
    const combos = [];
    
    const generate = (start, remaining, currentCombo) => {
      if (currentCombo.length === size) {
        if (remaining === 0) {
          combos.push([...currentCombo]);
        }
        return;
      }
      if (start > maxNum || remaining < 0) return;
      
      for (let i = start; i <= maxNum; i++) {
        currentCombo.push(i);
        generate(i + 1, remaining - i, currentCombo);
        currentCombo.pop();
      }
    };
    
    generate(1, sum, []);
    return combos;
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
        this.cells[r][c].isHintEliminated = false;
        this.cells[r][c].hintEliminatedNum = null;
        this.cells[r][c].hintEliminationReason = '';
      }
    }
  }

  /**
   * 生成完整的正向求解步骤（用于动画演示）
   * 每一步：{ r, c, num, technique, techniqueName, highlightCells, description }
   * @returns {Array} 求解步骤数组
   */
  generateSolutionSteps() {
    // 深拷贝当前盘面状态（用模拟grid来计算）
    const grid = [];
    for (let r = 0; r < this.size; r++) {
      grid[r] = [];
      for (let c = 0; c < this.size; c++) {
        grid[r][c] = this.cells[r][c].fixedNum || this.cells[r][c].fillNum || 0;
      }
    }

    const steps = [];
    const maxSteps = 100; // 防止无限循环

    for (let i = 0; i < maxSteps; i++) {
      // 检查是否完成
      let empty = 0;
      for (let r = 0; r < this.size; r++)
        for (let c = 0; c < this.size; c++)
          if (grid[r][c] === 0) empty++;
      if (empty === 0) break;

      // 用当前的提示引擎找下一步
      const hint = this._findNextHintForSolver(grid);
      if (!hint) break; // 卡住了，剩下的需要更高级技巧

      // 记录这一步
      steps.push({
        r: hint.r,
        c: hint.c,
        num: hint.num,
        technique: hint.technique,
        techniqueName: hint.techniqueName,
        description: hint.description,
        highlightCells: hint.highlightCells || [],
        regionType: hint.regionType
      });

      // 填入数字，继续下一步
      grid[hint.r][hint.c] = hint.num;
    }

    return steps;
  }

  /**
   * 内部：给求解器用的找下一步函数（直接操作grid，不影响真实盘面）
   */
  _findNextHintForSolver(grid) {
    const naked = this._findNakedSingleHintWithGrid(grid);
    if (naked) return naked;

    const hidden = this._findHiddenSingleHintWithGrid(grid);
    if (hidden) return hidden;

    const nakedPair = this._findNakedPairHintWithGrid(grid);
    if (nakedPair) return nakedPair;

    return null;
  }

  // ---- 以下是操作外部grid版本的hint函数（不依赖真实盘面）----

  _findNakedSingleHintWithGrid(grid) {
    const { boxW, boxH } = this.getBoxSize();
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const candidates = this._getCellCandidatesWithGrid(grid, r, c);
        if (candidates.length === 1) {
          const num = candidates[0];
          // 收集高亮格子：同行同列同宫的已填数字
          const highlightCells = [];
          for (let cc = 0; cc < this.size; cc++) if (grid[r][cc] !== 0) highlightCells.push([r, cc]);
          for (let rr = 0; rr < this.size; rr++) if (grid[rr][c] !== 0) highlightCells.push([rr, c]);
          const bR = Math.floor(r / boxH) * boxH, bC = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              if (grid[bR + dr][bC + dc] !== 0) highlightCells.push([bR + dr, bC + dc]);

          return {
            r, c, num,
            technique: 'nakedSingle',
            techniqueName: '显性唯一（孤星）',
            description: `这个格子只能填 ${num}`,
            regionType: 'cell',
            highlightCells
          };
        }
      }
    }
    return null;
  }

  _findHiddenSingleHintWithGrid(grid) {
    const { boxW, boxH } = this.getBoxSize();

    // 行检查
    for (let r = 0; r < this.size; r++) {
      const posMap = new Map();
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidatesWithGrid(grid, r, c);
        for (const num of cands) {
          if (!posMap.has(num)) posMap.set(num, []);
          posMap.get(num).push([r, c]);
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          const highlightCells = [];
          for (let cc = 0; cc < this.size; cc++) highlightCells.push([r, cc]);
          return {
            r: positions[0][0], c: positions[0][1], num,
            technique: 'hiddenSingle',
            techniqueName: '隐性唯一（行）',
            description: `第${r+1}行中，数字${num}只能放这里`,
            regionType: 'row',
            highlightCells
          };
        }
      }
    }

    // 列检查
    for (let c = 0; c < this.size; c++) {
      const posMap = new Map();
      for (let r = 0; r < this.size; r++) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidatesWithGrid(grid, r, c);
        for (const num of cands) {
          if (!posMap.has(num)) posMap.set(num, []);
          posMap.get(num).push([r, c]);
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          const highlightCells = [];
          for (let rr = 0; rr < this.size; rr++) highlightCells.push([rr, c]);
          return {
            r: positions[0][0], c: positions[0][1], num,
            technique: 'hiddenSingle',
            techniqueName: '隐性唯一（列）',
            description: `第${c+1}列中，数字${num}只能放这里`,
            regionType: 'col',
            highlightCells
          };
        }
      }
    }

    // 宫检查
    for (let bR = 0; bR < this.size; bR += boxH) {
      for (let bC = 0; bC < this.size; bC += boxW) {
        const posMap = new Map();
        const cells = [];
        for (let dr = 0; dr < boxH; dr++)
          for (let dc = 0; dc < boxW; dc++) {
            const r = bR + dr, c = bC + dc;
            cells.push([r, c]);
            if (grid[r][c] !== 0) continue;
            const cands = this._getCellCandidatesWithGrid(grid, r, c);
            for (const num of cands) {
              if (!posMap.has(num)) posMap.set(num, []);
              posMap.get(num).push([r, c]);
            }
          }
        for (const [num, positions] of posMap) {
          if (positions.length === 1) {
            return {
              r: positions[0][0], c: positions[0][1], num,
              technique: 'hiddenSingle',
              techniqueName: '隐性唯一（宫）',
              description: `这个宫里，数字${num}只能放这里`,
              regionType: 'box',
              highlightCells: cells
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
        const cands = this._getCellCandidatesWithGrid(grid, r, c);
        for (const num of cands) {
          if (!posMap.has(num)) posMap.set(num, []);
          posMap.get(num).push([r, c]);
        }
      }
      for (const [num, positions] of posMap) {
        if (positions.length === 1) {
          return {
            r: positions[0][0], c: positions[0][1], num,
            technique: 'hiddenSingle',
            techniqueName: '笼子排除法',
            description: `和为${cage.sum}的笼子中，数字${num}只能放这里`,
            regionType: 'cage',
            highlightCells: cage.cells.slice()
          };
        }
      }
    }

    return null;
  }

  _findNakedPairHintWithGrid(grid) {
    // 简化版：检查行/列/宫/笼中的数对
    const checkUnit = (cells) => {
      const emptyCells = [];
      for (const [r, c] of cells) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidatesWithGrid(grid, r, c);
        if (cands.length === 2) {
          emptyCells.push({ r, c, cands });
        }
      }
      for (let i = 0; i < emptyCells.length; i++) {
        for (let j = i + 1; j < emptyCells.length; j++) {
          const a = emptyCells[i], b = emptyCells[j];
          if (a.cands[0] === b.cands[0] && a.cands[1] === b.cands[1]) {
            // 找到数对，模拟排除后看能否确定某个格子
            const pairNums = a.cands;
            for (const [r, c] of cells) {
              if (grid[r][c] !== 0) continue;
              if ((r === a.r && c === a.c) || (r === b.r && c === b.c)) continue;
              let cands = this._getCellCandidatesWithGrid(grid, r, c);
              const filtered = cands.filter(n => n !== pairNums[0] && n !== pairNums[1]);
              if (filtered.length === 1 && cands.length > 1) {
                return {
                  r, c, num: filtered[0],
                  technique: 'nakedPair',
                  techniqueName: '并蒂锁',
                  description: `利用数对{${pairNums[0]},${pairNums[1]}}排除后，此格只剩 ${filtered[0]}`,
                  regionType: 'pair',
                  highlightCells: cells.slice(),
                  pairCells: [[a.r, a.c], [b.r, b.c]],
                  pairNums
                };
              }
            }
          }
        }
      }
      return null;
    };

    // 行
    for (let r = 0; r < this.size; r++) {
      const cells = [];
      for (let c = 0; c < this.size; c++) cells.push([r, c]);
      const result = checkUnit(cells);
      if (result) return result;
    }
    // 列
    for (let c = 0; c < this.size; c++) {
      const cells = [];
      for (let r = 0; r < this.size; r++) cells.push([r, c]);
      const result = checkUnit(cells);
      if (result) return result;
    }
    // 宫
    const { boxW, boxH } = this.getBoxSize();
    for (let bR = 0; bR < this.size; bR += boxH) {
      for (let bC = 0; bC < this.size; bC += boxW) {
        const cells = [];
        for (let dr = 0; dr < boxH; dr++)
          for (let dc = 0; dc < boxW; dc++)
            cells.push([bR + dr, bC + dc]);
        const result = checkUnit(cells);
        if (result) return result;
      }
    }
    // 笼
    for (const cage of this.cages) {
      const result = checkUnit(cage.cells);
      if (result) return result;
    }

    return null;
  }

  /**
   * 基于外部grid计算笔记（不影响真实盘面）
   */
  _getCellCandidatesWithGrid(grid, r, c) {
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
    const bR = Math.floor(r / boxH) * boxH;
    const bC = Math.floor(c / boxW) * boxW;
    for (let dr = 0; dr < boxH; dr++) {
      for (let dc = 0; dc < boxW; dc++) {
        const num = grid[bR + dr][bC + dc];
        if (num !== 0) used.add(num);
      }
    }
    // 笼子（笼内不重复 + 和值约束）
    const cageId = this.cells[r][c].cageId;
    const cageConstraints = [];
    if (cageId !== null && this.cageIdToCells && this.cageIdToCells[cageId]) {
      const cage = this.cages.find(cg => cg.id === cageId);
      if (cage && cage.sum) {
        let filledSum = 0;
        let emptyCount = 0;
        const cageFilledNums = new Set();
        for (const [cr, cc] of this.cageIdToCells[cageId]) {
          const v = grid[cr][cc];
          if (v !== 0) {
            filledSum += v;
            cageFilledNums.add(v);
          } else {
            emptyCount++;
          }
        }
        const remain = cage.sum - filledSum;
        if (emptyCount > 0 && remain > 0) {
          cageConstraints.push({ remain, emptyCount, filledNums: cageFilledNums });
        }
      }
      // 笼内不重复
      for (const [cr, cc] of this.cageIdToCells[cageId]) {
        if (grid[cr][cc] !== 0) used.add(grid[cr][cc]);
      }
    }

    const candidates = [];
    for (let num = 1; num <= this.size; num++) {
      if (used.has(num)) continue;
      let passCageConstraint = true;
      for (const cc of cageConstraints) {
        if (!this._canNumBeInCage(num, cc.remain, cc.emptyCount, cc.filledNums, this.size)) {
          passCageConstraint = false;
          break;
        }
      }
      if (passCageConstraint) {
        candidates.push(num);
      }
    }
    return candidates;
  }
}

// 全局单例
const gameBoard = new Board(9);
window.gameBoard = gameBoard;