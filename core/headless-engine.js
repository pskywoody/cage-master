// ==========================================
// HeadlessEngine - UI-independent Board wrapper
// ==========================================
// 该模块封装 Board 类，提供与 UI 无关的纯逻辑 API。
//
// board.js 加载方式（双环境，game.html 依赖此行为）：
//   - Node.js：通过动态 import('fs') 读取本地 board.js 并用 eval 执行，
//     使其在 Node 环境中可用（保持原行为）。
//   - 浏览器：静态 import 'fs' 无法解析，改为依赖页面先以
//     <script src="core/board.js"></script> 加载的全局 Board（window.Board）。
//     模块实例化前会检查 window.Board 是否存在并给出提示。

const IS_NODE = typeof process !== 'undefined' && process.versions && process.versions.node;

if (IS_NODE) {
  const [fsMod, pathMod, urlMod] = await Promise.all([
    import('fs'),
    import('path'),
    import('url'),
  ]);

  // board.js 末尾引用了 window 对象，Node.js 中不可用，故先设置 polyfill。
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }

  const __dirname = pathMod.dirname(urlMod.fileURLToPath(import.meta.url));
  const boardJsPath = pathMod.join(__dirname, 'board.js');
  const boardJsCode = fsMod.readFileSync(boardJsPath, 'utf8');
  eval(boardJsCode);
} else {
  // 浏览器：board.js 需由页面以全局脚本先加载（game.html: <script src="core/board.js"></script>）
  if (typeof window === 'undefined' || typeof window.Board === 'undefined') {
    console.warn('[HeadlessEngine] 浏览器环境未找到全局 Board：请在页面中先以 <script src="core/board.js"></script> 加载 Board。');
  }
}

// 此时 Board、Cell 类已在全局可用

// V4.3.25：棋盘坐标转"a1"式标签（(0,0)→a1，(2,3)→c4）
// 行→字母（0=a），列→数字+1（0=1）
function cellTag(r, c) {
  return String.fromCharCode(97 + r) + (c + 1);
}

// ---------------------------------------------------------------------------
// 2. HeadlessEngine 类
// ---------------------------------------------------------------------------

class HeadlessEngine {
    constructor(size) {
    /** @type {Board} 底层 Board 实例 */
    this.board = new Board(size || 9);
    /** @private 最近一次加载的关卡原始数据 */
    this._levelData = null;
    /** @private 错题本：记录所有错误填数/笔记操作 */
    this._errorLog = [];
    /** @private 教学完成状态记录（用于重新教学功能） */
    this._lessonCompletionMap = {};
    /**
     * Teaching AI Phase 14.5-GateA：可选只读事件钩子（Puzzle 来源）。
     * 缺省 null → 不采集，零行为改变。由 RuntimeEventBridge 注入。
     * @type {((raw:Object)=>void)|null}
     */
    this.eventHook = null;
  }

  // -----------------------------------------------------------------------
  // 关卡管理
  // -----------------------------------------------------------------------

  /**
   * 加载关卡（V4 格式 JSON）
   * @param {Object} levelData - 关卡数据
   * @param {number[][]} levelData.cells - 9x9 固定数字矩阵（0=空格）
   * @param {Array} [levelData.cages] - 笼子数组 [{id, sum, cells}]
   * @param {number[][]} [levelData.solution] - 9x9 完整解答矩阵
   * @param {string} [levelData.levelId] - 关卡 ID
   */
  loadLevel(levelData) {
    if (!levelData) {
      throw new Error('loadLevel: levelData must be provided');
    }
    // 兼容 V4 迁移数据：支持 boardData 和 cells 两种字段名
    const normalized = { ...levelData };
    if (normalized.boardData && !normalized.cells) {
      normalized.cells = normalized.boardData;
    }
    if (!normalized.cells) {
      throw new Error('loadLevel: levelData must contain a cells or boardData array');
    }
    // 兼容 V4 迁移数据：支持 lessonPlan 和 lesson 两种字段名
    if (normalized.lessonPlan && !normalized.lesson) {
      normalized.lesson = normalized.lessonPlan;
    }
    this._levelData = normalized;
    // 新关卡加载时重置错题本
    this._errorLog = [];
    // 检测 gridSize，如果与当前 Board 尺寸不一致则重新创建
    const gridSize = normalized.gridSize || normalized.cells.length;
    if (gridSize && gridSize !== this.board.size) {
      this.board = new Board(gridSize);
    }
    this.board.loadLevel(normalized);
  }

  // -----------------------------------------------------------------------
  // 核心操作
  // -----------------------------------------------------------------------

  /**
   * 在指定格子填入数字
   * @param {number} r - 行号（0-based）
   * @param {number} c - 列号（0-based）
   * @param {number} num - 填入的数字（1-9）
   * @returns {{success: boolean, error: string|null}}
   */
  fillCell(r, c, num) {
    if (r < 0 || r >= this.board.size || c < 0 || c >= this.board.size) {
      return { success: false, error: `Cell ${cellTag(r, c)} out of bounds` };
    }
    if (num < 1 || num > this.board.size) {
      return { success: false, error: `Number ${num} out of range 1-${this.board.size}` };
    }

    const cell = this.board.cells[r][c];
    if (cell.fixedNum) {
      return { success: false, error: `Cell ${cellTag(r, c)} is a fixed/given cell` };
    }
    if (cell.isLocked) {
      return { success: false, error: `Cell ${cellTag(r, c)} is locked` };
    }

    const result = this.board.setNumberAt(r, c, num, {
      recordHistory: false,
      // 2026-08-04：填数自动消除关联笔记（同行/列/宫/笼的该数字笔记）——跟随 board.settings.autoClearCandidates
    });

    if (result === false) {
      // V4.3.25：区分"重复填数"（格子已是该数）与其他失败，返回友好错误
      if (cell.fillNum === num) {
        return { success: false, error: `Cell ${cellTag(r, c)} already has ${num}` };
      }
      this._emitPuzzleEvent(r, c, num, false, 1);
      return { success: false, error: `Failed to set number ${num} at ${cellTag(r, c)}` };
    }

    // 重新校验冲突
    this.board.checkConflicts();

    // V4.3.32：追加"解比对"——玩家填的数若与唯一解不符，即使无行列宫冲突也标红
    //（修复填错数字显示蓝色而非红色的问题；cell.isError 由 checkConflicts 与这里共同决定）
    const solRow = this._levelData && this._levelData.solution && this._levelData.solution[r];
    if (solRow && solRow[c] != null && num !== solRow[c]) {
      cell.isError = true;
    }

    // 结算信号：盘面是否已完整
    let solved = false;
    try {
      const b = this.board.cells;
      solved = b.every((row) => row.every((cl) => cl.fixedNum || cl.fillNum));
    } catch (e) { solved = false; }
    this._emitPuzzleEvent(r, c, num, !cell.isError, cell.isError ? 1 : 0, solved);

    return { success: true, error: null };
  }

  /** Phase 14.5-GateA：Puzzle 来源只读事件钩子（solve=填对 / fail=填错 + mistake + solve 完成信号） */
  _emitPuzzleEvent(r, c, num, ok, mistakes, solved) {
    if (!this.eventHook) return;
    try {
      this.eventHook({
        source: 'Puzzle',
        technique: null,
        actionType: ok ? 'solve' : 'fail',
        success: ok,
        mistakes: mistakes || 0,
        solveTime: solved ? Date.now() : null,
        solved,
        metadata: { row: r, col: c, num },
      });
    } catch (e) { /* 只读采集，忽略异常 */ }
  }

  /**
   * 切换格子的候选数（笔记模式）
   * @param {number} r - 行号（0-based）
   * @param {number} c - 列号（0-based）
   * @param {number} num - 候选数字（1-9）
   * @returns {{success: boolean, error: string|null}}
   */
  toggleNote(r, c, num) {
    if (r < 0 || r >= this.board.size || c < 0 || c >= this.board.size) {
      return { success: false, error: `Cell ${cellTag(r, c)} out of bounds` };
    }
    if (num < 1 || num > this.board.size) {
      return { success: false, error: `Number ${num} out of range 1-${this.board.size}` };
    }

    const cell = this.board.cells[r][c];
    if (cell.fixedNum) {
      return { success: false, error: `Cell ${cellTag(r, c)} is a fixed/given cell` };
    }
    if (cell.fillNum) {
      return { success: false, error: `Cell ${cellTag(r, c)} already has fill number ${cell.fillNum}` };
    }
    if (cell.isLocked) {
      return { success: false, error: `Cell ${cellTag(r, c)} is locked` };
    }

    // 临时选中该格，调用 toggleCandidate，然后取消选中
    this.board.selectedCell = { r, c };
    this.board.toggleCandidate(num);
    this.board.selectedCell = null;

    return { success: true, error: null };
  }

  /**
   * 擦除指定格子的填入数字和候选数
   * @param {number} r - 行号（0-based）
   * @param {number} c - 列号（0-based）
   * @returns {{success: boolean, error: string|null}}
   */
  eraseCell(r, c) {
    if (r < 0 || r >= this.board.size || c < 0 || c >= this.board.size) {
      return { success: false, error: `Cell ${cellTag(r, c)} out of bounds` };
    }

    const cell = this.board.cells[r][c];
    if (cell.fixedNum) {
      return { success: false, error: `Cell ${cellTag(r, c)} is a fixed/given cell` };
    }

    // 直接清除（不经过 Board.eraseNumber，因为后者依赖选中状态）
    cell.fillNum = null;
    cell.candidates.clear();
    cell.eliminations.clear();
    cell.isError = false;
    cell.isCageSumError = false;

    this.board.checkConflicts();

    return { success: true, error: null };
  }

  /**
   * Loop② 推导响应：检测有效笔记收敛到唯一候选的空格
   * 由 UI 层在填/擦/笔记切换后调用；首次调用建立基线、不抛出。
   * @returns {Array<{r:number,c:number,value:number}>} 本次新收敛的格子
   */
  refreshDeductions() {
    return this.board.refreshDeductions();
  }

  // -----------------------------------------------------------------------
  // 状态查询与序列化
  // -----------------------------------------------------------------------

  /**
   * 获取完整棋盘状态
   * @returns {Object} 状态对象
   */
  getState() {
    const size = this.board.size;
    const cells = [];

    let errorCount = 0;
    let filledCount = 0;
    let emptyCount = 0;

    for (let r = 0; r < size; r++) {
      cells[r] = [];
      for (let c = 0; c < size; c++) {
        const cell = this.board.cells[r][c];
        cells[r][c] = {
          fixedNum: cell.fixedNum,
          fillNum: cell.fillNum,
          candidates: Array.from(cell.candidates),
          isError: cell.isError,
          isLocked: cell.isLocked,
          isCageSumError: cell.isCageSumError,
          // V4.3.18：Boss 战幽灵格标记透传（AI 走棋后渲染层需感知占领状态）
          isAiFilled: !!cell.isAiFilled,
          _aiNum: (cell._aiNum !== undefined && cell._aiNum !== null) ? cell._aiNum : null,
          _aiMistake: !!cell._aiMistake,
        };

        if (cell.isError) errorCount++;
        if (cell.fillNum) filledCount++;
        if (!cell.fixedNum && !cell.fillNum) emptyCount++;
      }
    }

    const isComplete = emptyCount === 0 && errorCount === 0;

    // 构建 lesson 信息
    let lesson = null;
    if (this._levelData && this._levelData.lesson) {
      const totalCells = size * size;
      const fixedCells = this._levelData.cells.flat().filter(v => v !== 0).length;
      const progress = (totalCells - fixedCells) > 0
        ? filledCount / (totalCells - fixedCells)
        : 0;
      const phases = this._levelData.lesson.phases;
      let currentPhase = 1;
      if (phases) {
        if (progress >= (phases.toPhase3 || 0.6)) currentPhase = 3;
        else if (progress >= (phases.toPhase2 || 0.3)) currentPhase = 2;
      }

      lesson = {
        currentPhase,
        guidedTarget: this._levelData.lesson.guidedTarget || null,
        ...this._levelData.lesson,
      };
    }

    return {
      cells,
      validation: {
        isComplete,
        errorCount,
        hasErrors: errorCount > 0,
        filledCount,
        emptyCount,
      },
      lesson,
      levelId: this._levelData?.levelId || null,
    };
  }

  /**
   * 从快照恢复棋盘状态
   * @param {Object} snapshot - 之前由 getState() 返回的状态对象
   */
  restoreState(snapshot) {
    if (!snapshot || !snapshot.cells) {
      throw new Error('restoreState: invalid snapshot (missing cells)');
    }

    const { cells } = snapshot;

    for (let r = 0; r < Math.min(this.board.size, cells.length); r++) {
      const row = cells[r];
      if (!row) continue;
      for (let c = 0; c < Math.min(this.board.size, row.length); c++) {
        const state = row[c];
        if (!state) continue;

        const cell = this.board.cells[r][c];
        cell.fixedNum = state.fixedNum || null;
        cell.fillNum = state.fillNum || null;
        cell.candidates = new Set(state.candidates || []);
        cell.isError = state.isError || false;
        cell.isLocked = state.isLocked || false;
        cell.isCageSumError = state.isCageSumError || false;
      }
    }

    this.board.checkConflicts();
  }

  /**
   * 获取原始 Board 实例（用于高级操作）
   * @returns {Board}
   */
  getBoard() {
    return this.board;
  }

  // -----------------------------------------------------------------------
  // 雪崩自动补全（Avalanche Auto-Fill）
  // 依据手册 4.2.1：当剩余空格全部为"裸单"（唯一候选数）时，
  // 自动补全剩余格子，避免玩家在收官阶段做机械劳动。
  // -----------------------------------------------------------------------

  /**
   * 获取当前所有空格的候选数
   * @returns {Array<{r:number,c:number,candidates:number[]}>} 空格及其候选数
   */
  getEmptyCellCandidates() {
    const size = this.board.size;
    const grid = this.board._buildGrid ? this.board._buildGrid() : null;
    const result = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = this.board.cells[r][c];
        if (cell.fixedNum || cell.fillNum) continue; // 已有数字跳过

        let cands;
        if (grid && typeof this.board._getCellCandidates === 'function') {
          cands = this.board._getCellCandidates(grid, r, c);
        } else {
          // 回退：使用当前候选集
          cands = Array.from(cell.candidates || []);
        }
        result.push({ r, c, candidates: cands });
      }
    }
    return result;
  }

  /**
   * 检测是否满足雪崩补全条件
   * 条件：所有空格均为裸单（唯一候选数），且总数 > 0
   * @returns {{ready:boolean, emptyCount:number, nakedSingles:number}}
   */
  checkAvalancheReady() {
    const empties = this.getEmptyCellCandidates();
    let nakedSingles = 0;
    for (const e of empties) {
      if (e.candidates.length === 1) nakedSingles++;
    }
    return {
      ready: empties.length > 0 && nakedSingles === empties.length,
      emptyCount: empties.length,
      nakedSingles,
    };
  }

  /**
   * 获取雪崩补全序列（按行优先排序）
   * 仅在所有空格均为裸单时可调用，否则返回 null
   * @returns {Array<{r:number,c:number,num:number}>|null}
   */
  getAvalancheSequence() {
    const empties = this.getEmptyCellCandidates();
    if (empties.length === 0) return [];
    for (const e of empties) {
      if (e.candidates.length !== 1) return null;
    }
    return empties
      .map(e => ({ r: e.r, c: e.c, num: e.candidates[0] }))
      .sort((a, b) => (a.r - b.r) || (a.c - b.c));
  }

  /**
   * 执行雪崩自动补全：按序列填入所有裸单格
   * @param {Object} [opts] - { sequence } 可选，不传则自动计算
   * @returns {{filled:number, sequence:Array|null, complete:boolean}}
   */
  triggerAvalanche(opts) {
    const sequence = (opts && opts.sequence) ? opts.sequence : this.getAvalancheSequence();
    if (!sequence) {
      return { filled: 0, sequence: null, complete: false };
    }

    let filled = 0;
    for (const step of sequence) {
      const res = this.fillCell(step.r, step.c, step.num);
      if (res.success) filled++;
    }

    return {
      filled,
      sequence,
      complete: filled === sequence.length,
    };
  }

}

// ---------------------------------------------------------------------------
// 3. 导出
// ---------------------------------------------------------------------------
export { HeadlessEngine };
export default HeadlessEngine;
