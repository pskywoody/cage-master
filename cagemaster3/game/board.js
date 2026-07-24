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
    this.eliminations = new Set();  // 排除标记：绝对不可能的数字
    this.isError = false;           // 行/列/宫/笼内数字重复错误
    this.isCageSumError = false;    // 笼子和值超限错误（仅笼和相关，不含数字重复）

    // 残局教学关：非关键格锁定（不可点击、不可操作）
    this.isLocked = false;

    // 临时错误数字（不写入正式 fillNum，闪烁后消失）
    this.tempWrongNum = null;
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
    this.isPaintSelecting = false; // 是否正在画笔选格（滑过即选）
    this.paintedCells = new Set(); // 画笔模式下已涂过的格子集合（"r,c"字符串）
    this.history = [];
    this.redoStack = [];         // 重做栈：undo 时推入，redo 时弹出
    this.MAX_HISTORY = 500;      // 最大历史记录数（FIFO 丢弃最早的）

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
      instantErrorCheck: true, // 即时错误检测（填错立即标红）
      autoClearCandidates: false,  // 自动清除关联候选（默认关闭，玩家手动管理笔记）
      muteAll: false,        // 一键静音
      bgm: true,             // 背景音乐
      sfx: true,             // 音效
      bgmVolume: 50,         // BGM音量 0-100
      sfxVolume: 67,         // 音效音量 0-100
      vibration: true,       // 触感反馈
      keepWrongNumber: false, // 错误数字保留（false=300ms闪烁清除，true=800ms后清除）
    };

    // 关卡标识（用于渲染缓存等）
    this.levelId = null;

    // 事件回调
    this.onConflict = null;  // 即时冲突回调 (r, c, num, conflictCells) => void

    // 输入模式：normal 正式填数 / candidate 候选笔记 / elimination 排除标记
    this.inputMode = 'normal';

    // ============================================================
    //  Boss 战特殊机制扩展字段
    //  按需初始化，默认 null/空，不影响普通关卡性能
    // ============================================================

    // ---- 第1章：机关锁格 ----
    // 锁定的笼子列表：{cageId, releaseEvent, released}
    this._lockCells = null;

    // ---- 第3章：伪逻辑幻影格 ----
    this._fakeCells = null;          // [{r, c, fakeNum, realNum, exposed}]
    this._suspectedFakeCells = [];   // 玩家长按标记为"可疑"的格子
    this._isFakeCellMode = false;    // 是否处于质疑模式

    // ---- 第4章：三人联动锁 ----
    this._regionLocks = null;        // [{id, region, locked, condition, cells, candidates}]

    // ---- 第5章：嵌套笼坍缩 ----
    this._cageCollapse = null;       // {active, progress, targetCageId}

    // ---- 第6章：双解路径 ----
    this._dualPath = null;           // {active, chosen, mergeAt, left:{solution,hint,color}, right:{...}}

    // ---- 第7章：三阶段 ----
    this._phase = 1;                 // 1 | 2 | 3
    this._phaseThresholds = null;    // {toPhase2, toPhase3}
    this._autoEliminateCount = 0;    // 一键排除剩余次数
    this._autoEliminateUsed = 0;     // 已使用次数

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
   * 推入历史记录（内部工具方法）
   * - 自动清空 redo 栈（新操作后之前的 redo 失效）
   * - 超过 MAX_HISTORY 时丢弃最早的记录（FIFO）
   * @param {Object} entry - 历史记录条目
   */
  _pushHistory(entry) {
    // 新操作清空重做栈
    this.redoStack.length = 0;
    this.history.push(entry);
    // FIFO：超过上限则丢弃最早的记录
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    }
  }

  /**
   * 加载关卡数据
   * @param {Object} puzzle { cells: number[][], cages: [{id,sum,cells:[[r,c]]}] }
   */
  loadLevel(puzzle) {
    const { cells, cages } = puzzle;
    this.levelId = puzzle.levelId || null;
    this.history = [];
    this.redoStack = [];
    this.selectedCell = null;
    this.selectedCageId = null;
    this.selectedCells = [];
    this.isBoxSelecting = false;
    this.isPaintSelecting = false;
    this.paintedCells = new Set();
    this.inputMode = 'normal';

    // 加载数字
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const cell = this.cells[r][c];
        cell.fixedNum = cells[r][c] !== 0 ? cells[r][c] : null;
        cell.isLocked = cell.fixedNum !== null;
        cell.fillNum = null;
        cell.candidates.clear();
        cell.eliminations.clear();
        cell.isError = false;
        cell.isCageSumError = false;
        cell.isSelected = false;
        cell.tempWrongNum = null;
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

    // ===== Boss战特殊机制数据加载 =====
    // 第1章：机关锁格
    if (puzzle.lockCells && Array.isArray(puzzle.lockCells)) {
      this._lockCells = puzzle.lockCells.map(lc => ({
        cageId: lc.cageId,
        releaseEvent: lc.releaseEvent || 'gear_default',
        released: false,
      }));
    } else {
      this._lockCells = null;
    }

    // 第3章：幻影格
    if (puzzle.fakeCells && Array.isArray(puzzle.fakeCells)) {
      this._fakeCells = puzzle.fakeCells.map(fc => ({
        r: fc.r,
        c: fc.c,
        fakeNum: fc.fakeNum,
        realNum: fc.realNum,
        exposed: false,
      }));
      this._suspectedFakeCells = [];
      this._isFakeCellMode = false;
    } else {
      this._fakeCells = null;
      this._suspectedFakeCells = [];
      this._isFakeCellMode = false;
    }

    // 第4章：三人联动锁
    if (puzzle.regionLocks && Array.isArray(puzzle.regionLocks)) {
      this._regionLocks = puzzle.regionLocks.map(rl => ({
        id: rl.id,
        region: rl.region,
        locked: true,
        condition: rl.condition || 'nakedPair',
        cells: rl.cells || [],
        candidates: rl.candidates || [],
      }));
    } else {
      this._regionLocks = null;
    }

    // 第5章：嵌套笼坍缩
    if (puzzle.cageCollapse) {
      this._cageCollapse = {
        active: false,
        progress: 0,
        targetCageId: puzzle.cageCollapse.targetCageId || null,
      };
    } else {
      this._cageCollapse = null;
    }

    // 第6章：双解路径
    if (puzzle.dualPath) {
      this._dualPath = {
        active: true,
        chosen: null,
        mergeAt: puzzle.dualPath.mergeAt || null,
        left: puzzle.dualPath.left || { solution: null, hint: '', color: '#94a3b8' },
        right: puzzle.dualPath.right || { solution: null, hint: '', color: '#f59e0b' },
      };
    } else {
      this._dualPath = null;
    }

    // 第7章：三阶段
    if (puzzle.phases) {
      this._phase = 1;
      this._phaseThresholds = {
        toPhase2: puzzle.phases.toPhase2 || 0.30,
        toPhase3: puzzle.phases.toPhase3 || 0.60,
      };
      this._autoEliminateCount = puzzle.phases.autoEliminateCount || 0;
      this._autoEliminateUsed = 0;
    } else {
      this._phase = 1;
      this._phaseThresholds = null;
      this._autoEliminateCount = 0;
      this._autoEliminateUsed = 0;
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
   * 开始画笔选格（滑过即选）
   */
  startPaintSelect(r, c) {
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return;
    this.clearBoxSelection();
    this.isPaintSelecting = true;
    this.paintedCells = new Set();
    // 起始格加入选中
    this._addPaintedCell(r, c);
  }

  /**
   * 更新画笔选格（滑过的格子都加选）
   */
  updatePaintSelect(r, c) {
    if (!this.isPaintSelecting) return;
    if (r < 0 || r >= this.size || c < 0 || c >= this.size) return;
    this._addPaintedCell(r, c);
  }

  /**
   * 结束画笔选格
   */
  endPaintSelect() {
    this.isPaintSelecting = false;
  }

  /**
   * 内部：添加一个画笔涂过的格子
   */
  _addPaintedCell(r, c) {
    const key = `${r},${c}`;
    if (this.paintedCells.has(key)) return;
    this.paintedCells.add(key);
    const cell = this.cells[r][c];
    cell.isSelected = true;
    this.selectedCells.push({ r, c });
    // 第一个选中的格子作为 selectedCell
    if (this.selectedCells.length === 1) {
      this.selectedCell = { r, c };
      this.selectedCageId = cell.cageId;
      this.selectedCageIds = cell.cageIds ? [...cell.cageIds] : [];
    }
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
   * 逻辑：全部都有 → 全部删除；否则 → 全部添加
   * 这样保证批量操作的结果是统一的，不会出现有的加有的删
   */
  toggleCandidateForSelection(num) {
    if (this.selectedCells.length === 0) return;

    const historyEntry = {
      type: 'batchToggleCandidate',
      num,
      cells: []
    };

    // 第一步：统计有多少个可操作的格子已经有这个数字
    let hasCount = 0;
    let totalCount = 0;
    for (const { r, c } of this.selectedCells) {
      const cell = this.cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      totalCount++;
      if (cell.candidates.has(num)) hasCount++;
    }

    if (totalCount === 0) return;

    // 第二步：决定操作方向
    // 如果所有格子都有这个数字 → 全部删除
    // 否则（部分有或都没有） → 全部添加
    const shouldRemove = hasCount === totalCount;

    for (const { r, c } of this.selectedCells) {
      const cell = this.cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      historyEntry.cells.push({
        r, c,
        oldCandidates: new Set(cell.candidates)
      });
      if (shouldRemove) {
        cell.candidates.delete(num);
      } else {
        cell.candidates.add(num);
      }
    }

    if (historyEntry.cells.length > 0) {
      this._pushHistory(historyEntry);
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
        oldCandidates: new Set(cell.candidates),
        oldEliminations: new Set(cell.eliminations),
      });
      cell.fillNum = null;
      cell.candidates.clear();
      cell.eliminations.clear();
    }

    // 擦除后重新计算所有受影响笼子的错误状态
    if (historyEntry.cells.length > 0) {
      const affectedCages = new Set();
      for (const { r, c } of historyEntry.cells) {
        const cell = this.cells[r][c];
        const cageIds = cell.cageIds && cell.cageIds.length > 0
          ? cell.cageIds
          : (cell.cageId !== null ? [cell.cageId] : []);
        for (const cid of cageIds) affectedCages.add(cid);
        cell.isError = false;
        cell.isCageSumError = false;
      }
      for (const cid of affectedCages) {
        this._validateCageSum(cid);
      }
    }

    if (historyEntry.cells.length > 0) {
      this._pushHistory(historyEntry);
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
      oldEliminations: new Set(cell.eliminations),
      relatedCandidates: [], // 被自动清理的关联候选
      relatedEliminations: [], // 被自动添加的关联排除
    };

    cell.fillNum = num;
    cell.candidates.clear();
    cell.eliminations.clear();

    // 即时错误检测
    const validateResult = this._validateCell(r, c);
    if (validateResult.hasConflict && this.onConflict) {
      this.onConflict(r, c, num, validateResult.conflictCells);
    }

    // 自动清除行/列/宫/笼中关联格子的该笔记（受设置控制）
    // 同时自动添加排除标记
    if (this.settings.autoClearCandidates) {
      const { boxW, boxH } = this.getBoxSize();
      // 行
      for (let i = 0; i < this.size; i++) {
        if (i !== c && this.cells[r][i].fillNum === null) {
          if (this.cells[r][i].candidates.has(num)) {
            this.cells[r][i].candidates.delete(num);
            historyEntry.relatedCandidates.push({ r, c: i, num });
          }
          if (!this.cells[r][i].eliminations.has(num)) {
            this.cells[r][i].eliminations.add(num);
            historyEntry.relatedEliminations.push({ r, c: i, num });
          }
        }
      }
      // 列
      for (let i = 0; i < this.size; i++) {
        if (i !== r && this.cells[i][c].fillNum === null) {
          if (this.cells[i][c].candidates.has(num)) {
            this.cells[i][c].candidates.delete(num);
            historyEntry.relatedCandidates.push({ r: i, c, num });
          }
          if (!this.cells[i][c].eliminations.has(num)) {
            this.cells[i][c].eliminations.add(num);
            historyEntry.relatedEliminations.push({ r: i, c, num });
          }
        }
      }
      // 宫
      const boxR = Math.floor(r / boxH) * boxH;
      const boxC = Math.floor(c / boxW) * boxW;
      for (let i = boxR; i < boxR + boxH; i++) {
        for (let j = boxC; j < boxC + boxW; j++) {
          if ((i !== r || j !== c) && this.cells[i][j].fillNum === null) {
            if (this.cells[i][j].candidates.has(num)) {
              this.cells[i][j].candidates.delete(num);
              historyEntry.relatedCandidates.push({ r: i, c: j, num });
            }
            if (!this.cells[i][j].eliminations.has(num)) {
              this.cells[i][j].eliminations.add(num);
              historyEntry.relatedEliminations.push({ r: i, c: j, num });
            }
          }
        }
      }
      // 笼（支持嵌套笼：遍历所有包含该格子的笼子）
      const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
      for (const cageId of cageIds) {
        if (this.cageIdToCells && this.cageIdToCells[cageId]) {
          for (const [cr, cc] of this.cageIdToCells[cageId]) {
            if ((cr !== r || cc !== c) && this.cells[cr][cc].fillNum === null) {
              if (this.cells[cr][cc].candidates.has(num)) {
                this.cells[cr][cc].candidates.delete(num);
                historyEntry.relatedCandidates.push({ r: cr, c: cc, num });
              }
              if (!this.cells[cr][cc].eliminations.has(num)) {
                this.cells[cr][cc].eliminations.add(num);
                historyEntry.relatedEliminations.push({ r: cr, c: cc, num });
              }
            }
          }
        }
      }
    }

    this._pushHistory(historyEntry);
  }

  /**
   * 在指定位置填数（不依赖选中格，供能力系统等调用）
   * @param {number} r - 行索引
   * @param {number} c - 列索引
   * @param {number} num - 数字
   * @param {Object} options - 选项
   * @param {boolean} options.recordHistory - 是否记入历史（默认true）
   * @param {boolean} options.autoClear - 是否自动清除关联笔记（默认true，跟随设置）
   * @returns {boolean} 是否成功
   */
  setNumberAt(r, c, num, options = {}) {
    const cell = this.cells[r]?.[c];
    if (!cell || cell.fixedNum || cell.isLocked) return false;
    if (cell.fillNum === num) return false; // 已经是这个数

    const recordHistory = options.recordHistory !== false;
    const autoClear = options.autoClear !== false && this.settings.autoClearCandidates;

    const historyEntry = {
      r, c,
      oldFill: cell.fillNum,
      oldCandidates: new Set(cell.candidates),
      oldEliminations: new Set(cell.eliminations),
      relatedCandidates: [],
      relatedEliminations: [],
    };

    cell.fillNum = num;
    cell.candidates.clear();
    cell.eliminations.clear();

    // 即时错误检测
    const validateResultAt = this._validateCell(r, c);
    if (validateResultAt.hasConflict && this.onConflict) {
      this.onConflict(r, c, num, validateResultAt.conflictCells);
    }

    // 自动清除行/列/宫/笼关联笔记 + 自动添加排除标记
    if (autoClear) {
      const { boxW, boxH } = this.getBoxSize();
      // 行
      for (let i = 0; i < this.size; i++) {
        if (i !== c && this.cells[r][i].fillNum === null) {
          if (this.cells[r][i].candidates.has(num)) {
            this.cells[r][i].candidates.delete(num);
            historyEntry.relatedCandidates.push({ r, c: i, num });
          }
          if (!this.cells[r][i].eliminations.has(num)) {
            this.cells[r][i].eliminations.add(num);
            historyEntry.relatedEliminations.push({ r, c: i, num });
          }
        }
      }
      // 列
      for (let i = 0; i < this.size; i++) {
        if (i !== r && this.cells[i][c].fillNum === null) {
          if (this.cells[i][c].candidates.has(num)) {
            this.cells[i][c].candidates.delete(num);
            historyEntry.relatedCandidates.push({ r: i, c, num });
          }
          if (!this.cells[i][c].eliminations.has(num)) {
            this.cells[i][c].eliminations.add(num);
            historyEntry.relatedEliminations.push({ r: i, c, num });
          }
        }
      }
      // 宫
      const boxR = Math.floor(r / boxH) * boxH;
      const boxC = Math.floor(c / boxW) * boxW;
      for (let i = boxR; i < boxR + boxH; i++) {
        for (let j = boxC; j < boxC + boxW; j++) {
          if ((i !== r || j !== c) && this.cells[i][j].fillNum === null) {
            if (this.cells[i][j].candidates.has(num)) {
              this.cells[i][j].candidates.delete(num);
              historyEntry.relatedCandidates.push({ r: i, c: j, num });
            }
            if (!this.cells[i][j].eliminations.has(num)) {
              this.cells[i][j].eliminations.add(num);
              historyEntry.relatedEliminations.push({ r: i, c: j, num });
            }
          }
        }
      }
      // 笼
      const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
      for (const cageId of cageIds) {
        if (this.cageIdToCells && this.cageIdToCells[cageId]) {
          for (const [cr, cc] of this.cageIdToCells[cageId]) {
            if ((cr !== r || cc !== c) && this.cells[cr][cc].fillNum === null) {
              if (this.cells[cr][cc].candidates.has(num)) {
                this.cells[cr][cc].candidates.delete(num);
                historyEntry.relatedCandidates.push({ r: cr, c: cc, num });
              }
              if (!this.cells[cr][cc].eliminations.has(num)) {
                this.cells[cr][cc].eliminations.add(num);
                historyEntry.relatedEliminations.push({ r: cr, c: cc, num });
              }
            }
          }
        }
      }
    }

    if (recordHistory) {
      this._pushHistory(historyEntry);
    }

    // 触发填数成功事件（供 PathTracker 等外部系统监听）
    try {
      const event = new CustomEvent('board:numberSet', {
        detail: { r, c, value: num, board: this }
      });
      window.dispatchEvent(event);
    } catch (e) {}

    return true;
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

    this._pushHistory({
      r, c,
      oldFill: cell.fillNum,
      oldCandidates: new Set(cell.candidates),
      oldEliminations: new Set(cell.eliminations),
    });

    cell.fillNum = null;
    cell.candidates.clear();
    cell.eliminations.clear();

    // 擦除后重新计算错误状态
    this._clearCellError(r, c);
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
      this._pushHistory(historyEntry);
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

    // 创建重做条目（保存当前状态，redo 时恢复）
    const redoEntry = this._createRedoEntry(last);
    this.redoStack.push(redoEntry);

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

    // 单格切换排除标记的撤销
    if (last.type === 'toggleElimination') {
      const cell = this.cells[last.r][last.c];
      if (cell.fillNum === null && cell.fixedNum === null) {
        cell.eliminations = new Set(last.oldEliminations);
        cell.candidates = new Set(last.oldCandidates);
      }
      return;
    }

    // 批量切换排除标记的撤销
    if (last.type === 'batchToggleElimination') {
      for (const { r, c, oldEliminations, oldCandidates } of last.cells) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.eliminations = new Set(oldEliminations);
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
      for (const { r, c, oldFill, oldCandidates, oldEliminations } of last.cells) {
        const cell = this.cells[r][c];
        if (cell.fixedNum) continue;
        cell.fillNum = oldFill;
        cell.candidates = new Set(oldCandidates);
        if (oldEliminations) {
          cell.eliminations = new Set(oldEliminations);
        }
      }
      // 批量擦除后重算笼子和值错误
      this._revalidateCagesForCells(last.cells.map(c => ({ r: c.r, c: c.c })));
      return;
    }

    // 普通单格操作的撤销
    const cell = this.cells[last.r][last.c];
    cell.fillNum = last.oldFill;
    cell.candidates = last.oldCandidates;
    if (last.oldEliminations) {
      cell.eliminations = new Set(last.oldEliminations);
    }

    // 回滚被自动清理的关联笔记
    if (last.relatedCandidates && last.relatedCandidates.length > 0) {
      for (const { r, c, num } of last.relatedCandidates) {
        if (this.cells[r][c].fillNum === null) {
          this.cells[r][c].candidates.add(num);
        }
      }
    }

    // 回滚被自动添加的关联排除
    if (last.relatedEliminations && last.relatedEliminations.length > 0) {
      for (const { r, c, num } of last.relatedEliminations) {
        if (this.cells[r][c].fillNum === null) {
          this.cells[r][c].eliminations.delete(num);
        }
      }
    }

    // 撤销后重新校验笼子和值错误
    this._revalidateCagesForCells([{ r: last.r, c: last.c }]);
  }

  /**
   * 重做上一步撤销的操作
   * 与 undo 对称：从 redoStack 弹出，恢复操作后的状态
   */
  redo() {
    if (this.redoStack.length === 0) return;
    const redoEntry = this.redoStack.pop();

    // 把当前状态 push 回 history（以便可以再次 undo）
    // 注意：这里直接用 history.push 不走 _pushHistory，避免清空 redoStack
    this.history.push(redoEntry.undoEntry);

    // 应用重做
    if (redoEntry.type === 'clearAllCandidates') {
      for (let r = 0; r < this.size; r++) {
        for (let c = 0; c < this.size; c++) {
          const cell = this.cells[r][c];
          if (cell.fillNum === null && cell.fixedNum === null) {
            cell.candidates.clear();
          }
        }
      }
      return;
    }

    if (redoEntry.type === 'batchToggleCandidate') {
      for (const { r, c, newCandidates } of redoEntry.cells) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.candidates = new Set(newCandidates);
        }
      }
      return;
    }

    if (redoEntry.type === 'toggleElimination') {
      const cell = this.cells[redoEntry.r][redoEntry.c];
      if (cell.fillNum === null && cell.fixedNum === null) {
        cell.eliminations = new Set(redoEntry.newEliminations);
        cell.candidates = new Set(redoEntry.newCandidates);
      }
      return;
    }

    if (redoEntry.type === 'batchToggleElimination') {
      for (const { r, c, newEliminations, newCandidates } of redoEntry.cells) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.eliminations = new Set(newEliminations);
          cell.candidates = new Set(newCandidates);
        }
      }
      return;
    }

    if (redoEntry.type === 'autoFillCandidates') {
      // redo autoFill: 重新计算候选并设置
      // 简化处理：直接用保存的新候选
      for (const { r, c, newCandidates } of redoEntry.cells) {
        const cell = this.cells[r][c];
        if (cell.fillNum === null && cell.fixedNum === null) {
          cell.candidates = new Set(newCandidates);
        }
      }
      return;
    }

    if (redoEntry.type === 'batchErase') {
      for (const { r, c } of redoEntry.cells) {
        const cell = this.cells[r][c];
        if (cell.fixedNum) continue;
        cell.fillNum = null;
        cell.candidates.clear();
        cell.eliminations.clear();
      }
      this._revalidateCagesForCells(redoEntry.cells.map(c => ({ r: c.r, c: c.c })));
      return;
    }

    // 普通单格操作的重做
    if (redoEntry.type === 'setNumber' || !redoEntry.type) {
      const cell = this.cells[redoEntry.r][redoEntry.c];
      cell.fillNum = redoEntry.newFill;
      cell.candidates = new Set(redoEntry.newCandidates);
      if (redoEntry.newEliminations) {
        cell.eliminations = new Set(redoEntry.newEliminations);
      }

      // 重新应用关联候选清理和排除
      if (redoEntry.relatedCandidates && redoEntry.relatedCandidates.length > 0) {
        for (const { r, c, num } of redoEntry.relatedCandidates) {
          if (this.cells[r][c].fillNum === null) {
            this.cells[r][c].candidates.delete(num);
          }
        }
      }
      if (redoEntry.relatedEliminations && redoEntry.relatedEliminations.length > 0) {
        for (const { r, c, num } of redoEntry.relatedEliminations) {
          if (this.cells[r][c].fillNum === null) {
            this.cells[r][c].eliminations.add(num);
          }
        }
      }

      // 重做后重新校验笼子和值错误
      this._revalidateCagesForCells([{ r: redoEntry.r, c: redoEntry.c }]);
    }
  }

  /**
   * 创建重做条目（在 undo 时调用）
   * 捕获当前状态，以便 redo 时恢复
   */
  _createRedoEntry(undoEntry) {
    const redoEntry = {
      type: undoEntry.type,
      undoEntry: undoEntry, // 保存原始 undo 条目，以便 redo 后 push 回 history
    };

    if (undoEntry.type === 'clearAllCandidates') {
      // 重做就是再清空一次，不需要额外信息
      return redoEntry;
    }

    if (undoEntry.type === 'batchToggleCandidate') {
      redoEntry.cells = undoEntry.cells.map(({ r, c }) => ({
        r, c,
        newCandidates: new Set(this.cells[r][c].candidates),
      }));
      return redoEntry;
    }

    if (undoEntry.type === 'toggleElimination') {
      const cell = this.cells[undoEntry.r][undoEntry.c];
      redoEntry.r = undoEntry.r;
      redoEntry.c = undoEntry.c;
      redoEntry.newEliminations = new Set(cell.eliminations);
      redoEntry.newCandidates = new Set(cell.candidates);
      return redoEntry;
    }

    if (undoEntry.type === 'batchToggleElimination') {
      redoEntry.cells = undoEntry.cells.map(({ r, c }) => ({
        r, c,
        newEliminations: new Set(this.cells[r][c].eliminations),
        newCandidates: new Set(this.cells[r][c].candidates),
      }));
      return redoEntry;
    }

    if (undoEntry.type === 'autoFillCandidates') {
      redoEntry.cells = undoEntry.cells.map(({ r, c }) => ({
        r, c,
        newCandidates: new Set(this.cells[r][c].candidates),
      }));
      return redoEntry;
    }

    if (undoEntry.type === 'batchErase') {
      redoEntry.cells = undoEntry.cells.map(({ r, c, oldFill, oldCandidates, oldEliminations }) => ({
        r, c,
      }));
      return redoEntry;
    }

    // 普通单格操作（setNumber / erase / toggleCandidate 等）
    const cell = this.cells[undoEntry.r][undoEntry.c];
    redoEntry.r = undoEntry.r;
    redoEntry.c = undoEntry.c;
    redoEntry.newFill = cell.fillNum;
    redoEntry.newCandidates = new Set(cell.candidates);
    redoEntry.newEliminations = new Set(cell.eliminations);
    redoEntry.relatedCandidates = undoEntry.relatedCandidates ? [...undoEntry.relatedCandidates] : [];
    redoEntry.relatedEliminations = undoEntry.relatedEliminations ? [...undoEntry.relatedEliminations] : [];

    return redoEntry;
  }

  /**
   * 重新校验指定格子所属所有笼子的和值错误
   * 用于 undo/redo/batchErase 后更新错误状态
   */
  _revalidateCagesForCells(cells) {
    const affectedCages = new Set();
    for (const { r, c } of cells) {
      const cell = this.cells[r]?.[c];
      if (!cell) continue;
      const cageIds = cell.cageIds && cell.cageIds.length > 0
        ? cell.cageIds
        : (cell.cageId !== null ? [cell.cageId] : []);
      for (const cid of cageIds) affectedCages.add(cid);
      // 先清当前格的错误标记（笼子重算会重新设置）
      cell.isCageSumError = false;
    }
    for (const cid of affectedCages) {
      this._validateCageSum(cid);
    }
  }

  /**
   * 切换输入模式（三态循环：normal → candidate → elimination → normal）
   */
  toggleInputMode() {
    if (this.inputMode === 'normal') {
      this.inputMode = 'candidate';
    } else if (this.inputMode === 'candidate') {
      this.inputMode = 'elimination';
    } else {
      this.inputMode = 'normal';
    }
    return this.inputMode;
  }

  /**
   * 设置输入模式
   * @param {string} mode - normal / candidate / elimination
   */
  setInputMode(mode) {
    if (['normal', 'candidate', 'elimination'].includes(mode)) {
      this.inputMode = mode;
    }
    return this.inputMode;
  }

  /**
   * 给选中格切换排除标记
   * @param {number} num - 数字
   */
  toggleElimination(num) {
    const selected = this.getActiveCell();
    if (!selected) return;
    const { r, c } = selected;
    const cell = this.cells[r][c];
    if (cell.fixedNum) return;
    if (cell.fillNum) return;

    this._pushHistory({
      type: 'toggleElimination',
      r, c,
      oldEliminations: new Set(cell.eliminations),
      oldCandidates: new Set(cell.candidates),
    });

    if (cell.eliminations.has(num)) {
      cell.eliminations.delete(num);
    } else {
      cell.eliminations.add(num);
      // 同时从候选中移除该数字（排除了就不可能是候选）
      if (cell.candidates.has(num)) {
        cell.candidates.delete(num);
      }
    }
  }

  /**
   * 批量给选中的多个格子切换排除标记
   */
  toggleEliminationForSelection(num) {
    if (this.selectedCells.length === 0) return;

    const historyEntry = {
      type: 'batchToggleElimination',
      num,
      cells: []
    };

    // 第一步：统计有多少个可操作的格子已经有这个排除标记
    let hasCount = 0;
    let totalCount = 0;
    for (const { r, c } of this.selectedCells) {
      const cell = this.cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      totalCount++;
      if (cell.eliminations.has(num)) hasCount++;
    }

    if (totalCount === 0) return;

    // 第二步：决定操作方向（全部都有→删除，否则→添加）
    const shouldRemove = hasCount === totalCount;

    for (const { r, c } of this.selectedCells) {
      const cell = this.cells[r][c];
      if (cell.fixedNum || cell.fillNum) continue;
      historyEntry.cells.push({
        r, c,
        oldEliminations: new Set(cell.eliminations),
        oldCandidates: new Set(cell.candidates),
      });
      if (shouldRemove) {
        cell.eliminations.delete(num);
      } else {
        cell.eliminations.add(num);
        // 同时从候选中移除
        if (cell.candidates.has(num)) {
          cell.candidates.delete(num);
        }
      }
    }

    if (historyEntry.cells.length > 0) {
      this._pushHistory(historyEntry);
    }
  }

  /**
   * 给选中格写入/移除笔记
   */
  toggleCandidate(num) {
    // 优先使用 selectedCell（更可靠），fallback 到 getActiveCell
    let selected = null;
    if (this.selectedCell) {
      const { r, c } = this.selectedCell;
      if (r >= 0 && r < this.size && c >= 0 && c < this.size) {
        selected = this.selectedCell;
      }
    }
    if (!selected) {
      selected = this.getActiveCell();
    }
    if (!selected) return;
    const { r, c } = selected;
    const cell = this.cells[r][c];
    if (cell.fixedNum) return;
    if (cell.fillNum) return; // 已有正式数字时不能写候选
    if (cell.isLocked) return; // 锁定的格子不能写候选

    this._pushHistory({
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
      this._pushHistory(historyEntry);
    }

    return filledCount;
  }

  /**
   * 校验单个笼子的和值约束（填数/擦除后调用）
   * 检查笼子当前和是否可能达到目标和：
   *   - 当前和 + 剩余格子最小可能和 > 目标和 → 错误（和已经太大）
   *   - 当前和 + 剩余格子最大可能和 < 目标和 → 错误（和永远达不到）
   * 最小/最大可能和：剩余空格数 × 最小/最大可能数字（1~size，排除已用数字）
   * 单格笼：填入后立即比对，不相等就标错
   *
   * @param {*} cageId - 笼子ID
   * @returns {boolean} - 是否有笼子和值错误
   */
  _validateCageSum(cageId) {
    if (!this.settings.instantErrorCheck) return false;
    if (!this.cageIdToCells || !this.cageIdToCells[cageId]) return false;

    const cage = this.cages.find(c => c.id === cageId);
    if (!cage || cage.hiddenSum || typeof cage.sum !== 'number') return false;

    const cells = this.cageIdToCells[cageId];
    const targetSum = cage.sum;
    const totalCells = cells.length;

    // 收集已填数字和未填格子数
    let currentSum = 0;
    let emptyCount = 0;
    const usedNums = new Set();

    for (const [r, c] of cells) {
      const val = this.cells[r][c].fillNum || this.cells[r][c].fixedNum;
      if (val) {
        currentSum += val;
        usedNums.add(val);
      } else {
        emptyCount++;
      }
    }

    // 计算剩余空格的最小可能和与最大可能和
    // 可用数字：1~size 排除已用数字
    let availableCount = 0;
    let minRestSum = 0;
    let maxRestSum = 0;

    if (emptyCount > 0) {
      // 从 1 开始累加最小的 emptyCount 个可用数字
      let minPicked = 0;
      for (let n = 1; n <= this.size && minPicked < emptyCount; n++) {
        if (!usedNums.has(n)) {
          minRestSum += n;
          minPicked++;
        }
      }
      // 从 size 开始累加最大的 emptyCount 个可用数字
      let maxPicked = 0;
      for (let n = this.size; n >= 1 && maxPicked < emptyCount; n--) {
        if (!usedNums.has(n)) {
          maxRestSum += n;
          maxPicked++;
        }
      }
      // 如果可用数字不够填剩余空格（笼内重复），也算不可能
      if (minPicked < emptyCount || maxPicked < emptyCount) {
        // 数字不够，肯定凑不出来，标记错误
        for (const [r, c] of cells) {
          const cell = this.cells[r][c];
          if (cell.fillNum || cell.fixedNum) {
            cell.isCageSumError = true;
            cell.isError = true; // 同步到 isError，确保渲染层显示
          }
        }
        return true;
      }
    }

    // 判断是否有和值错误
    const minPossible = currentSum + minRestSum;
    const maxPossible = currentSum + maxRestSum;
    const hasError = minPossible > targetSum || maxPossible < targetSum;

    // 更新所有已填格子的 isCageSumError 标记
    for (const [r, c] of cells) {
      const cell = this.cells[r][c];
      if (cell.fillNum || cell.fixedNum) {
        cell.isCageSumError = hasError;
        if (hasError) {
          cell.isError = true; // 同步到 isError，确保渲染层显示
        }
      } else {
        cell.isCageSumError = false; // 空格不标笼和错误
      }
    }

    return hasError;
  }

  /**
   * 即时校验单个格子的冲突（填数后立即调用）
   * 仅检查该格所在行/列/宫/笼内是否有重复
   * 性能优于全盘 checkConflicts，且反馈更及时
   * @param {number} r - 行
   * @param {number} c - 列
   * @returns {Object} { hasConflict: boolean, conflictCells: [{r, c}] }
   */
  _validateCell(r, c) {
    if (!this.settings.instantErrorCheck) {
      return { hasConflict: false, conflictCells: [] };
    }

    const cell = this.cells[r]?.[c];
    if (!cell) return { hasConflict: false, conflictCells: [] };

    const num = cell.fillNum;
    if (!num) {
      cell.isError = false;
      return { hasConflict: false, conflictCells: [] };
    }

    const conflictCells = [];
    const { boxW, boxH } = this.getBoxSize();

    // 行冲突
    for (let i = 0; i < this.size; i++) {
      if (i !== c) {
        const other = this.cells[r][i];
        const otherVal = other.fillNum || other.fixedNum;
        if (otherVal === num) {
          conflictCells.push({ r, c: i });
        }
      }
    }

    // 列冲突
    for (let i = 0; i < this.size; i++) {
      if (i !== r) {
        const other = this.cells[i][c];
        const otherVal = other.fillNum || other.fixedNum;
        if (otherVal === num) {
          conflictCells.push({ r: i, c });
        }
      }
    }

    // 宫冲突
    const boxR = Math.floor(r / boxH) * boxH;
    const boxC = Math.floor(c / boxW) * boxW;
    for (let i = boxR; i < boxR + boxH; i++) {
      for (let j = boxC; j < boxC + boxW; j++) {
        if (i !== r || j !== c) {
          const other = this.cells[i][j];
          const otherVal = other.fillNum || other.fixedNum;
          if (otherVal === num) {
            // 避免重复（行/列已加过的就不加了，但为了简单直接去重）
            if (!conflictCells.some(cc => cc.r === i && cc.c === j)) {
              conflictCells.push({ r: i, c: j });
            }
          }
        }
      }
    }

    // 笼冲突
    const cageIds = cell.cageIds && cell.cageIds.length > 0 ? cell.cageIds : (cell.cageId !== null ? [cell.cageId] : []);
    for (const cageId of cageIds) {
      if (this.cageIdToCells && this.cageIdToCells[cageId]) {
        for (const [cr, cc] of this.cageIdToCells[cageId]) {
          if (cr !== r || cc !== c) {
            const other = this.cells[cr][cc];
            const otherVal = other.fillNum || other.fixedNum;
            if (otherVal === num) {
              if (!conflictCells.some(cell => cell.r === cr && cell.c === cc)) {
                conflictCells.push({ r: cr, c: cc });
              }
            }
          }
        }
      }
    }

    // 标记当前格的错误状态
    cell.isError = conflictCells.length > 0;

    // 同时把冲突格也标红（双向标红，体验更好）
    for (const { r: cr, c: cc } of conflictCells) {
      this.cells[cr][cc].isError = true;
    }

    // 笼子和值校验：检查该格所属所有笼子的和约束
    const cageIdsForSum = cell.cageIds && cell.cageIds.length > 0
      ? cell.cageIds
      : (cell.cageId !== null ? [cell.cageId] : []);
    for (const cid of cageIdsForSum) {
      this._validateCageSum(cid);
    }

    return { hasConflict: conflictCells.length > 0, conflictCells };
  }

  /**
   * 清除单个格子的即时错误标记（擦除数字时调用）
   * 同时清除该格影响范围内其他格子的错误标记（如果它们只因这一格而冲突）
   * 并重新计算受影响笼子的和值错误状态
   */
  _clearCellError(r, c) {
    const cell = this.cells[r]?.[c];
    if (!cell) return;

    cell.isError = false;
    cell.isCageSumError = false;

    // 重新校验该格所属所有笼子的和值（擦除后状态可能恢复）
    const cageIdsForSum = cell.cageIds && cell.cageIds.length > 0
      ? cell.cageIds
      : (cell.cageId !== null ? [cell.cageId] : []);
    for (const cid of cageIdsForSum) {
      this._validateCageSum(cid);
    }

    // 注意：不清除其他格子的错误，因为它们可能还和别的格子冲突
    // 全盘错误由 checkConflicts() 统一维护
    // 这里只清当前格的即时错误标记
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
        this.cells[r][c].isCageSumError = false;
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

    // 笼内重复检测 + 笼和校验
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
      // 笼和校验：使用统一的 _validateCageSum 逻辑（考虑最小/最大可能和）
      if (!cage.hiddenSum && typeof cage.sum === 'number') {
        this._validateCageSum(cage.id);
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

  /**
   * 扩展选中（Shift+方向键用）
   * 从当前选中格向指定方向扩展多选区域
   */
  extendSelection(dr, dc) {
    const current = this.getActiveCell();
    if (!current) {
      this.selectCell(0, 0);
      return;
    }

    const { r, c } = current;
    const nr = Math.max(0, Math.min(this.size - 1, r + dr));
    const nc = Math.max(0, Math.min(this.size - 1, c + dc));

    if (nr === r && nc === c) return;

    // 如果还没有多选，从当前格开始
    if (this.selectedCells.length <= 1) {
      this.startBoxSelect(r, c);
    }

    // 计算新的框选范围
    const startR = this.boxStart ? this.boxStart.r : r;
    const startC = this.boxStart ? this.boxStart.c : c;
    this.boxEnd = { r: nr, c: nc };
    this.boxStart = { r: startR, c: startC };
    this._updateBoxSelection();
  }

  /**
   * 清除多选（别名，兼容 guide.js 中的调用）
   */
  clearMultiSelect() {
    this.clearBoxSelection();
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
   * 轻量深拷贝（仅复制数值和标志位，不携带 UI/DOM 引用）
   * ⚠️ 性能关键：被 TechRaterAdapter 和 AIPlayer 高频调用
   * 克隆内容：grid数值、cages引用（只读共享）、size、候选数状态
   * @returns {Object} 轻量棋盘数据对象 { size, grid, cages, cells }
   */
  clone() {
    const size = this.size;

    // 1. 数值 grid（0=空, 数字=已填）
    const grid = new Array(size);
    const cells = new Array(size);

    for (let r = 0; r < size; r++) {
      grid[r] = new Array(size);
      cells[r] = new Array(size);
      for (let c = 0; c < size; c++) {
        const cell = this.cells[r][c];
        const val = cell.fixedNum || cell.fillNum;
        grid[r][c] = val || 0;

        // 只复制关键数据字段，不复制 UI 状态
        cells[r][c] = {
          r: r,
          c: c,
          fixedNum: cell.fixedNum,
          fillNum: cell.fillNum,
          cageId: cell.cageId,
          cageIds: cell.cageIds ? cell.cageIds.slice() : null,
          candidates: cell.candidates ? new Set(cell.candidates) : new Set(),
        };
      }
    }

    // 2. cages 数据（只读，共享引用即可）
    // 但为了安全，还是做浅拷贝（不拷贝cells数组内部）
    const cages = this.cages ? this.cages.map(cage => ({
      id: cage.id,
      sum: cage.sum,
      cells: cage.cells, // 格子坐标数组只读，共享引用
    })) : [];

    // 返回一个轻量对象，结构与 Board 兼容（只有 TechRater 需要的字段）
    return {
      size: size,
      grid: grid,
      cells: cells,
      cages: cages,
      // 标记为克隆体，防止意外修改
      __isClone: true,
    };
  }

  /**
   * 计算下一步提示（已重构：底层委托给 TechRater）
   * 保留此方法用于向后兼容，新代码请使用 HintSystem
   * @returns {Object|null} { r, c, num, technique, techniqueName, description, highlightCells, eliminationSteps } 或 null
   */
  getNextHint() {
    // 委托给 TechRater（如果可用）
    try {
      const TechRaterClass = typeof TechRater !== 'undefined' ? TechRater : (window.TechRater || null);
      if (TechRaterClass) {
        const rater = new TechRaterClass(this);
        const step = rater.findNextStep();
        if (step) {
          const { row, col, num, technique, techniqueName, evidence } = step;
          // 构建 highlightCells（同行+同列+同宫）
          const { boxW, boxH } = this.getBoxSize();
          const highlightSet = new Set();
          const addCell = (rr, cc) => {
            if (rr >= 0 && rr < this.size && cc >= 0 && cc < this.size) {
              highlightSet.add(`${rr},${cc}`);
            }
          };
          for (let cc = 0; cc < this.size; cc++) addCell(row, cc);
          for (let rr = 0; rr < this.size; rr++) addCell(rr, col);
          const br = Math.floor(row / boxH) * boxH;
          const bc = Math.floor(col / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              addCell(br + dr, bc + dc);
          const highlightCells = [];
          for (const key of highlightSet) {
            const [rr, cc] = key.split(',').map(Number);
            highlightCells.push([rr, cc]);
          }
          return {
            r: row,
            c: col,
            num,
            technique,
            techniqueName: techniqueName || technique,
            description: evidence && evidence.reason ? evidence.reason : `${techniqueName}技巧`,
            regionType: evidence && evidence.scopeType ? evidence.scopeType : 'all',
            highlightCells,
            eliminationSteps: evidence && evidence.eliminated ? evidence.eliminated.length : 0,
            evidence: evidence || null,
          };
        }
        return null;
      }
    } catch (e) {
      console.warn('Board.getNextHint: TechRater 调用失败', e);
    }

    // 降级：用基础候选数计算找裸单（确保向后兼容）
    const grid = this._buildGrid();
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (grid[r][c] !== 0) continue;
        const cands = this._getCellCandidates(grid, r, c);
        if (cands.length === 1) {
          const { boxW, boxH } = this.getBoxSize();
          const highlightCells = [];
          for (let cc = 0; cc < this.size; cc++) highlightCells.push([r, cc]);
          for (let rr = 0; rr < this.size; rr++) highlightCells.push([rr, c]);
          const br = Math.floor(r / boxH) * boxH;
          const bc = Math.floor(c / boxW) * boxW;
          for (let dr = 0; dr < boxH; dr++)
            for (let dc = 0; dc < boxW; dc++)
              highlightCells.push([br + dr, bc + dc]);
          return {
            r, c,
            num: cands[0],
            technique: 'nakedSingle',
            techniqueName: '显性唯一',
            description: '这个格子只剩一个候选数',
            regionType: 'all',
            highlightCells,
            eliminationSteps: 0,
          };
        }
      }
    }
    return null;
  }

  // （旧的技巧检测函数已移除，统一使用 TechRater）
  // 如需提示功能，请使用 HintSystem 或 getNextHint()


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
    // 使用 TechRater 求解（如果可用）
    try {
      const TechRaterClass = typeof TechRater !== 'undefined' ? TechRater : (window.TechRater || null);
      if (TechRaterClass) {
        const rater = new TechRaterClass(this);
        const result = rater.solve(200);
        if (result && result.steps && result.steps.length > 0) {
          return result.steps.map(s => ({
            r: s.row,
            c: s.col,
            num: s.num,
            technique: s.technique,
            techniqueName: s.techniqueName || s.technique,
            description: s.technique ? s.techniqueName + '技巧' : '',
            highlightCells: [],
            regionType: s.evidence && s.evidence.scopeType ? s.evidence.scopeType : 'cell'
          }));
        }
      }
    } catch (e) {
      console.warn('Board.generateSolutionSteps: TechRater 失败', e);
    }

    // 降级：用基础候选数计算找裸单
    const grid = this._buildGrid();
    const steps = [];
    const maxSteps = 100;

    for (let i = 0; i < maxSteps; i++) {
      let empty = 0;
      for (let r = 0; r < this.size; r++)
        for (let c = 0; c < this.size; c++)
          if (grid[r][c] === 0) empty++;
      if (empty === 0) break;

      let found = null;
      for (let r = 0; r < this.size && !found; r++) {
        for (let c = 0; c < this.size && !found; c++) {
          if (grid[r][c] !== 0) continue;
          const cands = this._getCellCandidates(grid, r, c);
          if (cands.length === 1) {
            found = { r, c, num: cands[0] };
          }
        }
      }
      if (!found) break;

      steps.push({
        r: found.r,
        c: found.c,
        num: found.num,
        technique: 'nakedSingle',
        techniqueName: '显性唯一',
        description: '只剩一个候选数',
        highlightCells: [],
        regionType: 'cell'
      });
      grid[found.r][found.c] = found.num;
    }
    return steps;
  }

  // （旧的 *WithGrid 提示函数已移除，统一使用 TechRater）


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

// 全局导出
window.Board = Board;
window.Cell = Cell;
const gameBoard = new Board(9);
window.gameBoard = gameBoard;