// ============================================================
//  ThreePointLineManager - 三点连线 Boss 战系统 v2.0（纯逻辑）
// ============================================================
//  v2.0 规则（定稿）：
//    据点 = 核心格定位 + 四个争夺维度（行/列/宫/笼）
//    城堡开局可见；2 个隐藏据点需核心格填对才显现
//    维度占领：一方填对数 > 维度空格数一半（永久，不可抢回）
//    据点占领：一方占领 ≥3 维度；2:2 平局 → 据点迁移到干净位置
//    绝杀：占领全部 3 据点 + 棋盘满 + 手动连线（AI 按领先/落后/持平决策）
//    全局解题：棋盘满 + 不绝杀 → 按归属格数（持平按失误）
//    强制结算：迁移失败 + 棋盘满 + 无人达成 A/B
//
//  设计约束：
//    - core/ 模块不依赖 renderer/ 或 ui/，纯逻辑
//    - 所有事件通过 onEvent 回调消费
//    - 棋盘操作接口：HeadlessEngine 的 Board 实例（cells 含 cageId）
//    - 纯 ES Module 语法
// ============================================================

// ---------------------------------------------------------------------------
// 1. 事件类型常量（保留旧事件名兼容控制器/UI，新增 v2.0 事件）
// ---------------------------------------------------------------------------
export const TPL_EVENTS = Object.freeze({
  HUB_REVEALED: 'hub_revealed',           // 隐藏据点显现 { hubId, r, c }
  HUB_DIM_OCCUPIED: 'hub_dim_occupied',   // 维度被占领 { hubId, dim, side, count }
  HUB_OCCUPIED: 'hub_occupied',           // 据点被占领 { hubId, side }
  HUB_MIGRATED: 'hub_migrated',           // 据点迁移 { hubId, from: {r,c}, to: {r,c} }
  HUB_MIGRATE_FAIL: 'hub_migrate_fail',   // 迁移失败（进入填满比多模式）{ hubId }
  LINE_READY: 'line_ready',               // 可绝杀（占领全部3据点）{ side, playerHubs, boardFull? }
  THREE_POINT_LINE: 'three_point_line',   // 连线绝杀触发 { side }
  FULL_BOARD_WIN: 'full_board_win',       // 全局解题胜利 { side, reason }
  FORCE_SETTLE: 'force_settle',           // 强制结算 { winner, reason, stats }
  CELL_OCCUPIED: 'cell_occupied',         // 格子被永久占领 { r, c, side }
  CELL_STEAL_ATTEMPT: 'cell_steal_attempt', // 抢格尝试 { r, c, attacker, defender, result }
  CELL_ERROR: 'cell_error',               // 填错 { r, c, side, lockDuration }
  CELL_STEAL_SUCCESS: 'cell_steal_success', // 抢格成功 { r, c, attacker, defender }
  CELL_STEAL_FAIL: 'cell_steal_fail',     // 抢占失败（格子恢复空白）
  GHOST_APPEARED: 'ghost_appeared',       // 幽灵格出现（错误格可抢）{ r, c, side }
  GHOST_AUTO_CORRECTED: 'ghost_auto_corrected', // 错误窗结束自动修正
  NEAR_FULL: 'near_full',                 // 续20：近满盘（≤3 空格）提示 { near, count, cells:[{r,c}] }
  GAME_END: 'game_end',                   // 游戏结束 { winner, path, stats }
  // ---- 兼容旧事件（v2.0 不再触发，保留常量防 UI 报错） ----
  HUB_TRANSFERRED: 'hub_transferred',
  HUB_LOCKED: 'hub_locked',
  HUB_LOCK_ENDED: 'hub_lock_ended',
  HUB_DISAPPEARED: 'hub_disappeared',
  HUB_REBORN: 'hub_reborn',
  CASTLE_REWARD: 'castle_reward',
  CASTLE_DOUBLING: 'castle_doubling',
  CASTLE_DOUBLING_END: 'castle_doubling_end',
  COMBO_MILESTONE: 'combo_milestone',
  HOME_FIELD_BONUS: 'home_field_bonus',
});

const DIMS = ['row', 'col', 'box', 'cage'];

function cellTag(r, c) {
  return String.fromCharCode(97 + r) + (c + 1);
}

function getBlockRowCol(blockIdx, size) {
  const boxH = size <= 6 ? 2 : 3;
  const boxW = size / boxH;
  return { br: Math.floor(blockIdx / boxH) * boxH, bc: (blockIdx % boxH) * boxW, boxH, boxW };
}

function getBlockCells(blockIdx, size) {
  const { br, bc, boxH, boxW } = getBlockRowCol(blockIdx, size);
  const cells = [];
  for (let dr = 0; dr < boxH; dr++) {
    for (let dc = 0; dc < boxW; dc++) {
      cells.push({ r: br + dr, c: bc + dc });
    }
  }
  return cells;
}

// 默认 3 个据点核心格（对角线拓扑：三大行+三大列互不相同）
function pickDefaultCoreCells(size, board, cageCells, cellCage) {
  const boxH = size <= 6 ? 2 : 3;
  const boxW = size / boxH;

  // 维度（行/列/宫/笼∩宫）内是否有可填空格（非固定格）—— 保证四维都可争夺
  const dimEmpty = (cells2) => {
    for (const { r, c } of cells2) {
      const cell = board && board.cells && board.cells[r] && board.cells[r][c];
      if (cell && !cell.fixedNum) return true;
    }
    return false;
  };

  // 某核心格的笼维度 = 核心格所在笼 ∩ 所在宫（含至少一个可填空格才算可争）
  const isContestable = (r, c) => {
    const brs = Math.floor(r / boxH) * boxH;
    const bcs = Math.floor(c / boxW) * boxW;
    const row = []; for (let i = 0; i < size; i++) row.push({ r, c: i });
    if (!dimEmpty(row)) return false;
    const col = []; for (let i = 0; i < size; i++) col.push({ r: i, c });
    if (!dimEmpty(col)) return false;
    const box = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) box.push({ r: brs + dr, c: bcs + dc });
    if (!dimEmpty(box)) return false;
    const key = (cellCage || {})[r + ',' + c];
    const cage = (key != null && cageCells && cageCells[key]) ? cageCells[key] : [];
    const inBox = cage.filter(({ r: cr, c: cc }) => cr >= brs && cr < brs + boxH && cc >= bcs && cc < bcs + boxW);
    return dimEmpty(inBox);
  };

  // 块内优先取中心进而找第一个"四维可争"的核心格
  const blockCore = (br, bc) => {
    const brs = br * boxH, bcs = bc * boxW;
    const cells = [];
    for (let dr = 0; dr < boxH; dr++) for (let dc = 0; dc < boxW; dc++) cells.push({ r: brs + dr, c: bcs + dc });
    const center = cells.find(x => x.r === brs + Math.floor(boxH / 2) && x.c === bcs + Math.floor(boxW / 2));
    if (center) { cells.splice(cells.indexOf(center), 1); cells.unshift(center); }
    return cells.find(x => isContestable(x.r, x.c)) || null;
  };

  const blocks = [];
  for (let br = 0; br < boxH; br++) for (let bc = 0; bc < boxW; bc++) blocks.push({ br, bc });
  const viable = blocks.map(b => ({ br: b.br, bc: b.bc, core: blockCore(b.br, b.bc) })).filter(v => v.core !== null);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };

  // 三种情况：主方案打散三块（两两不同行不同列）；放宽；最后回退块中心
  function pickCombo(allow) {
    const pool = shuffle(viable);
    const usedR = new Set(), usedC = new Set();
    const out = [];
    for (const v of pool) {
      if (out.length >= 3) break;
      if (!allow(usedR, usedC, v)) continue;
      out.push(v.core);
      usedR.add(v.br); usedC.add(v.bc);
    }
    return out;
  }
  let cores = pickCombo((uR, uC, v) => !(uR.has(v.br) || uC.has(v.bc)));
  if (cores.length < 3) cores = pickCombo(() => true);
  if (cores.length < 3) {
    const seen = new Set();
    for (const b of shuffle(blocks)) {
      if (cores.length >= 3) break;
      const core = blockCore(b.br, b.bc) || { r: b.br * boxH + Math.floor(boxH / 2), c: b.bc * boxW + Math.floor(boxW / 2) };
      const key = core.r + ',' + core.c;
      if (seen.has(key)) continue;
      seen.add(key);
      cores.push(core);
    }
  }
  return cores.slice(0, 3);
}

// ---------------------------------------------------------------------------
// 2. ThreePointLineManager 主类
// ---------------------------------------------------------------------------
export class ThreePointLineManager {
  /**
   * @param {Object} board - HeadlessEngine 的 Board 实例（cells 含 cageId）
   * @param {number[][]} solution - 唯一解
   * @param {Object} [options]
   * @param {Array<{r:number,c:number}>} [options.hubCoreCells] - 手动指定 3 个核心格
   * @param {Array<number>} [options.hubBlocks] - 兼容：以宫索引指定据点（转宫中心为核心格）
   * @param {number} [options.errorLockDuration=2500] - 红叉窗口基础毫秒（2.5s/4s/6s 递增）
   * @param {boolean} [options.headless] - 同步模式（跳过时间延迟）
   */
  constructor(board, solution, options = {}) {
    this._board = board;
    this._solution = solution;
    this._size = board.size || 9;
    this._options = options;
    this._onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
    this._logger = typeof options.logger === 'function' ? options.logger : () => {};

    this._errorLockDuration = options.errorLockDuration ?? 2500;
    this._headless = options.headless === true;
    if (this._headless) {
      this._errorLockDuration = 0;
    }

    // ---- 状态 ----
    this._ended = false;
    this._winner = null;
    this._winPath = null;
    this._lineReady = false;       // 可绝杀状态（占3据点+棋盘满）
    this._lineReadySide = null;
    this._lineDeclined = false;    // 已选择不绝杀
    this._migrationFailed = false; // 据点迁移失败（进入填满比多模式）
    this._boardFillWatchdog = null; // 满盘含错格兜底：红叉窗口后强制结算定时器
    this._boardFillWatchdogReArm = 0; // 续22：兜底定时器重计时次数（防极端反复重计时挂死）
    this._boardFillWatchdogMaxReArm = 12; // 续22：最多重计时 12 次（约 12×8s≈96s 后强制收口，杜绝永不结算）
    this._boardStallWatchdog = null; // 续20：近满盘死锁兜底（仍有空格但双方均无进展→强制结算）
    this._lastProgressTs = Date.now(); // 续20：最近一次有效落子（填对/填错/自动修正/抢占）时间戳
    this._stallMs = 8000; // 续20：近满盘无进展多少毫秒后强制结算（与满盘兜底一致）
    this._nearFullActive = false; // 续20：近满盘闪烁提示是否已激活（避免重复 emit）

    // ---- 归属 ----
    this._playerOwned = [];
    this._aiOwned = [];
    this._initGrids();

    // ---- 错误锁定 ----
    this._playerErrorLock = {};
    this._aiErrorLock = {};
    this._playerConsecutiveErrors = 0;
    this._aiConsecutiveErrors = 0;
    this._playerTotalErrors = 0;
    this._aiTotalErrors = 0;

    // ---- 幽灵（可抢占的目标=错误格） ----
    this._playerGhosts = new Set(); // 玩家可抢的格（AI 错误格）
    this._aiGhosts = new Set();     // AI 可抢的格（玩家错误格）

    // ---- 笼索引 ----
    this._cageCells = {};  // cageId -> [{r,c}]
    this._cellCage = {};   // 'r,c' -> cageId
    this._initCageIndex();

    // ---- 据点（核心格定位） ----
    this._initHubs(options);

    // ---- 初始空格总数（不含固定格） ----
    this._totalEmpty = 0;
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (cell && !cell.fixedNum) this._totalEmpty++;
      }
    }

    this._log(`ThreePointLineManager v2.0 初始化，size=${this._size}，核心格=${this._hubs.map(h => cellTag(h.coreCell.r, h.coreCell.c)).join(',')}`);
  }

  // ---- 初始化 ----

  _initGrids() {
    for (let r = 0; r < this._size; r++) {
      this._playerOwned[r] = [];
      this._aiOwned[r] = [];
      for (let c = 0; c < this._size; c++) {
        this._playerOwned[r][c] = false;
        this._aiOwned[r][c] = false;
      }
    }
  }

  _initCageIndex() {
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (!cell) continue;
        const cageId = cell.cageId ?? (Array.isArray(cell.cageIds) && cell.cageIds.length ? cell.cageIds[0] : null);
        if (cageId != null) {
          const key = cageId + '';
          if (!this._cageCells[key]) this._cageCells[key] = [];
          this._cageCells[key].push({ r, c });
          this._cellCage[`${r},${c}`] = key;
        }
      }
    }
  }

  _initHubs(options) {
    let cores;
    if (Array.isArray(options.hubCoreCells) && options.hubCoreCells.length >= 3) {
      cores = options.hubCoreCells.slice(0, 3);
    } else if (Array.isArray(options.hubBlocks) && options.hubBlocks.length >= 3) {
      cores = options.hubBlocks.slice(0, 3).map(blockIdx => {
        const { br, bc, boxH, boxW } = getBlockRowCol(blockIdx, this._size);
        return { r: br + Math.floor(boxH / 2), c: bc + Math.floor(boxW / 2) };
      });
    } else {
      cores = pickDefaultCoreCells(this._size, this._board, this._cageCells, this._cellCage);
    }

    this._hubs = cores.map((core, i) => {
      // 核心格为固定提示格时开局即显现：玩家无法"填对触发显现"，
      // 若仍保持隐藏则该据点整关不可争夺（用户反馈 2-9 只有 1 个据点争夺）
      const coreCell = this._board.cells?.[core.r]?.[core.c];
      const coreFixed = !!(coreCell && coreCell.fixedNum);
      return {
        id: i,
        coreCell: { r: core.r, c: core.c },
        visible: i === 0 || coreFixed,     // 城堡（第1个）开局可见；固定格核心也开局可见
        castle: i === 0,
        occupiedBy: null,             // 'player'|'boss'|null（永久）
        migrated: false,
        dims: this._buildDims(core.r, core.c),
      };
    });
  }

  /**
   * 构建某核心格的四维数据（行/列/宫/笼），空格数取初始棋盘（不含固定数）
   */
  _buildDims(r, c) {
    const dims = {};
    const rowCells = [];
    const colCells = [];
    const boxCells = [];
    const boxH = this._size <= 6 ? 2 : 3;
    const boxW = this._size / boxH;
    const br0 = Math.floor(r / boxH) * boxH;
    const bc0 = Math.floor(c / boxW) * boxW;

    for (let i = 0; i < this._size; i++) {
      rowCells.push({ r, c: i });
      colCells.push({ r: i, c });
    }
    for (let dr = 0; dr < boxH; dr++) {
      for (let dc = 0; dc < boxW; dc++) {
        boxCells.push({ r: br0 + dr, c: bc0 + dc });
      }
    }
    // 笼维度：核心格所在笼 ∩ 据点宫（仅笼在宫内的部分，outies 不计）
    const cageKey = this._cellCage[`${r},${c}`];
    const cageCells = (cageKey != null && this._cageCells[cageKey]) ? this._cageCells[cageKey] : [];
    const cageInBox = cageCells.filter(({ r: cr, c: cc }) => cr >= br0 && cr < br0 + boxH && cc >= bc0 && cc < bc0 + boxW);

    const groups = { row: rowCells, col: colCells, box: boxCells, cage: cageInBox };
    for (const dim of DIMS) {
      const cells = groups[dim];
      let empty = 0;
      for (const { r: cr, c: cc } of cells) {
        const cell = this._board.cells?.[cr]?.[cc];
        if (cell && !cell.fixedNum) empty++;
      }
      dims[dim] = {
        cells,                // 维度格子
        empty,                // 初始空格数（不含固定数）
        player: 0,            // 显现后玩家累计归属
        boss: 0,              // 显现后 AI 累计归属
        owner: null,          // 'player'|'boss'|null（永久）
      };
    }
    return dims;
  }

  // ============================================================
  //  3. 填数仲裁
  // ============================================================

  onPlayerFill(r, c, num) {
    if (this._ended) return { success: false, event: 'game_ended', details: {} };
    return this._processFill('player', r, c, num);
  }

  onAIFill(r, c, num) {
    if (this._ended) return { success: false, event: 'game_ended', details: {} };
    return this._processFill('boss', r, c, num);
  }

  _processFill(side, r, c, num) {
    const cell = this._board.cells?.[r]?.[c];
    if (!cell) return { success: false, event: 'invalid_cell', details: {} };
    const ghostKey = `${r},${c}`;

    // 抢占检测：对方幽灵格（红叉窗口内的错误格）→ 可抢占
    const opponentGhosts = side === 'player' ? this._aiGhosts : this._playerGhosts;
    const isStealAttempt = opponentGhosts.has(ghostKey);

    // 永久归属格不可重复填（v2.0 4.3：对方填对 → 拒绝）
    if ((this._playerOwned[r][c] || this._aiOwned[r][c]) && !isStealAttempt) {
      return { success: false, event: 'cell_occupied', details: { owner: this._playerOwned[r][c] ? 'player' : 'boss' } };
    }

    // 错误锁定检查（锁定的错误格：己方不能再填，对方可抢）
    const errorLock = side === 'player' ? this._playerErrorLock : this._aiErrorLock;
    if (errorLock[ghostKey] && Date.now() < errorLock[ghostKey]) {
      return { success: false, event: 'error_locked', details: { remainingMs: errorLock[ghostKey] - Date.now() } };
    }

    if (cell.fixedNum) {
      return { success: false, event: 'fixed_cell', details: {} };
    }

    // 已实填且非抢占
    if (cell.fillNum && !isStealAttempt) {
      return { success: false, event: 'already_filled', details: { fillNum: cell.fillNum } };
    }
    if (isStealAttempt && cell.fillNum) {
      delete cell.fillNum;
    }

    // 正确性
    const correctValue = this._solution?.[r]?.[c];
    const isCorrect = correctValue != null && num === correctValue;

    if (isCorrect) {
      // ---- 填对：永久归属 ----
      if (side === 'player') {
        this._playerOwned[r][c] = true;
        this._aiGhosts.delete(ghostKey);
      } else {
        this._aiOwned[r][c] = true;
        this._playerGhosts.delete(ghostKey);
      }
      // 抢占成功
      if (isStealAttempt) {
        if (side === 'player') this._aiOwned[r][c] = false;
        else this._playerOwned[r][c] = false;
        opponentGhosts.delete(ghostKey);
        this._emit(TPL_EVENTS.CELL_STEAL_SUCCESS, {
          r, c, attacker: side, defender: side === 'player' ? 'boss' : 'player',
        });
        this._log(`抢占成功：${side} 抢回 (${cellTag(r, c)})`);
      }

      // 重置对方连续错误（v2.0 4.2：任意一次填对后连续计数清零——对方视角）
      if (side === 'player') this._aiConsecutiveErrors = 0;
      else this._playerConsecutiveErrors = 0;

      // 隐藏据点显现检查：核心格被正确填写 → 显现
      this._checkHubReveal(r, c, side);

      // 维度进度累计（仅对已显现据点）
      this._accumulateDimCounts(r, c, side);

      this._emit(TPL_EVENTS.CELL_OCCUPIED, { r, c, side });

      // 检查隐藏据点显现后是否立即达成维度/据点占领
      this._checkAllHubs();

      // 续20：有效落子（填对）→ 刷新最近进展时间戳（驱动死锁兜底）
      this._lastProgressTs = Date.now();

      // 棋盘满检查（v2.0 6.x 胜利判定）
      this._checkBoardFull();

      return { success: true, event: 'cell_occupied', details: { r, c, num, side } };
    } else {
      // ---- 填错 ----
      if (side === 'player') {
        this._playerConsecutiveErrors++;
        this._playerTotalErrors++;
      } else {
        this._aiConsecutiveErrors++;
        this._aiTotalErrors++;
      }

      // 红叉窗口 2.5s/4s/6s（连续错误递增；任意填对清零见上）
      const consec = side === 'player' ? this._playerConsecutiveErrors : this._aiConsecutiveErrors;
      let lockDuration = this._errorLockDuration;
      if (consec >= 3) lockDuration = 6000;
      else if (consec >= 2) lockDuration = 4000;
      errorLock[ghostKey] = Date.now() + lockDuration;

      this._emit(TPL_EVENTS.CELL_ERROR, {
        r, c, side, num, correctValue, lockDuration, consecutiveErrors: consec,
      });

      // 抢占失败（v2.0 4.3）：格子恢复空白，抢占方记 1 次失误，不自动修正
      if (isStealAttempt) {
        opponentGhosts.delete(ghostKey);
        const cellRef = this._board.cells?.[r]?.[c];
        if (cellRef) {
          delete cellRef.fillNum;
          cellRef.isAiFilled = false;
          cellRef._aiMistake = false;
        }
        this._playerOwned[r][c] = false;
        this._aiOwned[r][c] = false;
        this._emit(TPL_EVENTS.CELL_STEAL_FAIL, {
          r, c, attacker: side, defender: side === 'player' ? 'boss' : 'player',
        });
        this._log(`抢占失败：${side} 填错，(${cellTag(r, c)}) 恢复空白`);
        this._lastProgressTs = Date.now(); // 续20：抢占失败也算一次进展（红叉窗口内）
        return { success: false, event: 'steal_failed', details: { r, c, num, correctValue, lockDuration } };
      }

      // 普通填错 → 红叉格可被对方抢占（加幽灵）
      if (side === 'player') this._playerGhosts.add(ghostKey);
      else this._aiGhosts.add(ghostKey);
      this._emit(TPL_EVENTS.GHOST_APPEARED, {
        r, c, side: side === 'player' ? 'boss' : 'player',
      });

      // 红叉窗口结束自动修正（v2.0 2.3；未被抢占则修正为正确数字，归属原填数方）
      const correctValueForAuto = correctValue;
      setTimeout(() => {
        if (this._ended) return;
        if (this._playerOwned[r][c] || this._aiOwned[r][c]) return; // 已被抢占
        const currentLock = (side === 'player' ? this._playerErrorLock : this._aiErrorLock)[ghostKey];
        if (currentLock && Date.now() < currentLock) return; // 仍在锁定
        const cellRef = this._board.cells?.[r]?.[c];
        if (!cellRef || cellRef.fixedNum) return;
        // 已是正确数则无需修正（玩家路径：引擎落下的错误 fillNum 必不等于正确值，
        // 故下方会覆盖为正确数字并归属原填数方；此前 `|| cellRef.fillNum` 会因残留
        // 错误数字而提前 return，导致错误格永不自动修正、玩家归属恒为 0 —— 即"你 0/54"）
        if (cellRef.fillNum === correctValueForAuto) return;
        this._lastProgressTs = Date.now(); // 续20：自动修正（填对）→ 刷新进展时间戳
        if (side === 'player') {
          cellRef.fillNum = correctValueForAuto;
        } else {
          // v2.0 2.2：对方数字不可见 → AI 格仅标记幽灵
          cellRef.isAiFilled = true;
          cellRef._aiNum = correctValueForAuto;
          cellRef._aiMistake = false;
        }
        if (side === 'player') this._playerOwned[r][c] = true;
        else this._aiOwned[r][c] = true;
        this._playerGhosts.delete(ghostKey);
        this._aiGhosts.delete(ghostKey);
        this._emit(TPL_EVENTS.GHOST_AUTO_CORRECTED, { r, c, side, correctValue: correctValueForAuto });
        // 续18 修复：自动修正视同"填对"——核心格被填对即显现隐藏据点
        // （含对手 AI 路径：任一方把核心格填对都须让据点显现，契约见续8）
        this._checkHubReveal(r, c, side);
        this._log(`错误格 (${cellTag(r, c)}) 自动修正，归属 ${side}`);
        // 修正也算一次"填对"效果：维度累计 + 棋盘满检查
        this._accumulateDimCounts(r, c, side);
        this._checkAllHubs();
        this._checkBoardFull();
      }, lockDuration + 100);

      // 续20：有效落子（填错→幽灵）→ 刷新最近进展时间戳
      this._lastProgressTs = Date.now();

      // 错格也可能使棋盘"填满"（含错格）→ 触发满盘兜底结算检测
      this._checkBoardFull();
      return { success: false, event: 'wrong_number', details: { r, c, num, correctValue, lockDuration } };
    }
  }

  // ============================================================
  //  4. 据点机制（四维争夺）
  // ============================================================

  /**
   * 隐藏据点显现：核心格被正确填写时显现（v2.0 3.1）
   * 显现后维度进度从 0 开始累计（不追溯历史）
   */
  _checkHubReveal(r, c, side) {
    for (const hub of this._hubs) {
      if (hub.visible) continue;
      if (hub.coreCell.r === r && hub.coreCell.c === c) {
        hub.visible = true;
        hub.dims = this._buildDims(r, c); // 重新建维度（进度从 0）
        this._emit(TPL_EVENTS.HUB_REVEALED, { hubId: hub.id, r, c, side });
        this._log(`隐藏据点 ${hub.id} 显现（核心格 ${cellTag(r, c)} 被 ${side} 填对）`);
      }
    }
  }

  /**
   * 棋盘全盘落定时的最终显现：仍隐藏的据点全部显现，并按当前归属重算维度。
   * 修复"填完了据点却一直隐藏 → 玩家永远凑不齐 3 据点 → 划线绝杀无法触发"。
   */
  _finalizeHiddenHubs() {
    let revealedAny = false;
    for (const hub of this._hubs) {
      if (hub.visible) continue;
      hub.visible = true;
      hub.dims = this._buildDimsFromOwnership(hub.coreCell.r, hub.coreCell.c);
      revealedAny = true;
      this._emit(TPL_EVENTS.HUB_REVEALED, {
        hubId: hub.id, r: hub.coreCell.r, c: hub.coreCell.c, side: 'board_full',
      });
      this._log(`[TPL] 棋盘已全盘落定，隐藏据点 ${hub.id} 最终显现（核心 ${cellTag(hub.coreCell.r, hub.coreCell.c)}）`);
    }
    if (revealedAny) this._checkAllHubs();
  }

  /**
   * 按当前棋盘归属重建维度计数（含玩家/AI 已占领格，未归属格计为空格）。
   * 仅用于最终显现——让隐藏据点历史上填对的格也计入占领。
   */
  _buildDimsFromOwnership(r, c) {
    const base = this._buildDims(r, c);
    for (const dim of DIMS) {
      let player = 0, boss = 0, empty = 0;
      for (const { r: cr, c: cc } of base[dim].cells) {
        const cell = this._board.cells?.[cr]?.[cc];
        if (cell && cell.fixedNum) continue;
        if (this._playerOwned[cr] && this._playerOwned[cr][cc]) { player++; continue; }
        if (this._aiOwned[cr] && this._aiOwned[cr][cc]) { boss++; continue; }
        empty++;
      }
      base[dim].player = player;
      base[dim].boss = boss;
      base[dim].empty = empty;
      base[dim].owner = null;
    }
    return base;
  }

  /**
   * 已填对格累计到各可见据点的维度计数
   */
  _accumulateDimCounts(r, c, side) {
    for (const hub of this._hubs) {
      if (!hub.visible) continue;
      for (const dim of DIMS) {
        if (hub.dims[dim].owner) continue; // 维度已占领，永久不变（dim 是字符串，须经 hub.dims 取 owner）
        const dimCells = hub.dims[dim].cells;
        if (dimCells.some(({ r: cr, c: cc }) => cr === r && cc === c)) {
          if (side === 'player') hub.dims[dim].player++;
          else hub.dims[dim].boss++;
        }
      }
    }
  }

  /**
   * 检查所有据点的维度占领 / 据点占领 / 迁移（v2.0 3.3-3.5）
   */
  _checkAllHubs() {
    for (let i = 0; i < this._hubs.length; i++) {
      this._checkHub(i);
    }
  }

  /**
   * 检查三点连线绝杀就绪条件：玩家占领全部3个据点
   * 不依赖棋盘填满状态，提前触发绝杀权（划线处决）
   */
  _checkLineReady() {
    if (this._ended || this._lineReady) return;
    const playerHubs = this._hubs.filter(h => h.occupiedBy === 'player').length;
    if (playerHubs >= 3) {
      this._lineReady = true;
      this._lineReadySide = 'player';
      this._emit(TPL_EVENTS.LINE_READY, { side: 'player', playerHubs, boardFull: this._isBoardFullyFilled() });
      this._log(`[TPL] 三点连线就绪：玩家占领全部 ${playerHubs} 据点，可划线绝杀`);
    }
  }

  _checkHub(hubIdx) {
    const hub = this._hubs[hubIdx];
    if (!hub || !hub.visible) return;
    if (hub.occupiedBy) return; // 已被永久占领

    // 维度占领检查
    let playerDims = 0;
    let bossDims = 0;
    for (const dim of DIMS) {
      const d = hub.dims[dim];
      if (d.owner) {
        if (d.owner === 'player') playerDims++;
        else bossDims++;
        continue;
      }
      // 占领条件：填对数 > 空格数一半（v2.0 3.3）
      if (d.empty > 0) {
        if (d.player > d.empty / 2) {
          d.owner = 'player';
          playerDims++;
          this._emit(TPL_EVENTS.HUB_DIM_OCCUPIED, { hubId: hub.id, dim, side: 'player', count: d.player, empty: d.empty });
          this._log(`据点${hub.id} 维度「${dim}」被玩家占领（${d.player}/${d.empty}）`);
        } else if (d.boss > d.empty / 2) {
          d.owner = 'boss';
          bossDims++;
          this._emit(TPL_EVENTS.HUB_DIM_OCCUPIED, { hubId: hub.id, dim, side: 'boss', count: d.boss, empty: d.empty });
          this._log(`据点${hub.id} 维度「${dim}」被 AI 占领（${d.boss}/${d.empty}）`);
        }
      }
    }

    // 据点占领判定（v2.0 3.4）
    if (playerDims >= 3) {
      hub.occupiedBy = 'player';
      this._emit(TPL_EVENTS.HUB_OCCUPIED, { hubId: hub.id, side: 'player' });
      this._log(`据点${hub.id} 被玩家占领（${playerDims} 维）`);
      this._checkLineReady(); // 检查是否全部3据点已被占领 → 可绝杀
    } else if (bossDims >= 3) {
      hub.occupiedBy = 'boss';
      this._emit(TPL_EVENTS.HUB_OCCUPIED, { hubId: hub.id, side: 'boss' });
      this._log(`据点${hub.id} 被 AI 占领（${bossDims} 维）`);
    } else if (playerDims === 2 && bossDims === 2) {
      // 2:2 平局 → 据点迁移（v2.0 3.5）
      this._migrateHub(hubIdx);
    }
    // 0-1 维：继续争夺
  }

  /**
   * 据点迁移：2:2 时当前据点无效化，随机选干净位置（v2.0 3.5）
   */
  _migrateHub(hubIdx) {
    const hub = this._hubs[hubIdx];
    const from = { ...hub.coreCell };

    const candidates = this._findCleanCells();
    if (candidates.length === 0) {
      this._migrationFailed = true;
      this._emit(TPL_EVENTS.HUB_MIGRATE_FAIL, { hubId: hub.id });
      this._log(`据点${hub.id} 迁移失败：无干净位置，进入填满比多模式`);
      return;
    }

    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    hub.coreCell = { r: pick.r, c: pick.c };
    hub.visible = true;            // 新据点继承已显现状态
    hub.occupiedBy = null;
    hub.migrated = true;
    hub.dims = this._buildDims(pick.r, pick.c); // 四维进度从 0 重新开始
    this._emit(TPL_EVENTS.HUB_MIGRATED, { hubId: hub.id, from, to: { r: pick.r, c: pick.c } });
    this._log(`据点${hub.id} 迁移：(${cellTag(from.r, from.c)}) → (${cellTag(pick.r, pick.c)})`);
  }

  /**
   * 寻找干净位置（v2.0 3.5）：
   * 非固定格；不属于任何已有据点；四维无任何一方占领；至少一个维度有空格
   */
  _findCleanCells() {
    const results = [];
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (!cell || cell.fixedNum) continue;
        if (this._hubs.some(h => h.coreCell.r === r && h.coreCell.c === c)) continue;
        if (this._isCleanCell(r, c)) results.push({ r, c });
      }
    }
    return results;
  }

  /**
   * 判断 (r,c) 是否干净：以其定位的行/列/宫/笼未被任何现有据点的占领维度覆盖
   */
  _isCleanCell(r, c) {
    // 候选格的四维格子集合
    const cageKey = this._cellCage[`${r},${c}`];
    const boxH = this._size <= 6 ? 2 : 3;
    const boxW = this._size / boxH;
    const br0 = Math.floor(r / boxH) * boxH;
    const bc0 = Math.floor(c / boxW) * boxW;

    const rowSet = new Set();
    const colSet = new Set();
    const boxSet = new Set();
    const cageSet = new Set();
    for (let i = 0; i < this._size; i++) {
      rowSet.add(`${r},${i}`);
      colSet.add(`${i},${c}`);
    }
    for (let dr = 0; dr < boxH; dr++) {
      for (let dc = 0; dc < boxW; dc++) {
        boxSet.add(`${br0 + dr},${bc0 + dc}`);
      }
    }
    if (cageKey != null && this._cageCells[cageKey]) {
      for (const { r: cr, c: cc } of this._cageCells[cageKey]) {
        if (cr >= br0 && cr < br0 + boxH && cc >= bc0 && cc < bc0 + boxW) {
          cageSet.add(`${cr},${cc}`);
        }
      }
    }
    const candSets = [rowSet, colSet, boxSet, cageSet];

    // v2.0 加固：笼维度为空（empty=0）的位置不算干净——空笼永远中立无法被占领，
    // 迁移到该位置会让据点只剩 3 个可争维度、更难占领（3 维需全占）。
    const cageKeyNow = this._cellCage[`${r},${c}`];
    const cageCellsNow = (cageKeyNow != null && this._cageCells[cageKeyNow]) ? this._cageCells[cageKeyNow] : [];
    const cageEmpty = cageCellsNow.filter(({ r: cr, c: cc }) => {
      if (!(cr >= br0 && cr < br0 + boxH && cc >= bc0 && cc < bc0 + boxW)) return false;
      const cell = this._board.cells?.[cr]?.[cc];
      return cell && !cell.fixedNum;
    }).length;
    if (cageEmpty === 0) return false;

    // 任何现有据点的已占领维度，若覆盖了候选格的对应维度 → 不干净
    for (const hub of this._hubs) {
      for (const dim of DIMS) {
        if (!hub.dims[dim].owner) continue;
        const ownedCells = hub.dims[dim].cells.map(({ r: cr, c: cc }) => `${cr},${cc}`);
        const dimSet = new Set(ownedCells);
        // 候选格对应的维度（行→行, 列→列, 宫→宫, 笼→候选笼∩宫）是否与占领维度重叠
        const idx = DIMS.indexOf(dim);
        const candSet = candSets[idx];
        for (const k of dimSet) {
          if (candSet.has(k)) return false;
        }
      }
    }

    // 至少一个维度有空格
    let hasEmpty = false;
    for (const set of candSets) {
      for (const k of set) {
        const [cr, cc] = k.split(',').map(Number);
        const cell = this._board.cells?.[cr]?.[cc];
        if (cell && !cell.fixedNum) { hasEmpty = true; break; }
      }
      if (hasEmpty) break;
    }
    return hasEmpty;
  }

  // ============================================================
  //  5. 胜利判定（v2.0 6.x）
  // ============================================================

  /**
   * 棋盘满检查：所有非固定格被正确填写（错误格/红叉锁定不算已填）
   * 修复（续20+续22）：
   *  1. 续20：AI 正确格仅标记 isAiFilled/_aiNum（不写 fillNum），需计入
   *  2. 续22：必须把 _playerOwned/_aiOwned 也算「已正确填」——因为控制器
   *     在 tpl._processFill 返回**之后**才写 cell.isAiFilled/_aiNum/_aiMistake；
   *     _checkBoardFull 在 _processFill 内调用时这些标志尚未设置（玩家路径
   *     的 cell.fillNum 也会被控制器临时清除）。仅有 isAiFilled 检查会在
   *     "AI 最后一手填满"时误判未满 → 走 8s 兜底而非立即结算（用户实测
   *     level-109 盘面全满却永挂兜底）。归属标记由 _processFill 在
   *     _checkBoardFull 之前写入，时序安全，可作为「时序安全捷径」使用。
   */
  _isBoardFullyFilled() {
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (!cell || cell.fixedNum) continue;
        const sol = this._solution?.[r]?.[c];
        // 续22：时序安全捷径——玩家/AI 归属已写入即视为该格已正确（归属只在
        // 正确路径设置），无需依赖 fillNum/isAiFilled 这些由控制器后写的字段
        if (this._playerOwned[r][c] || this._aiOwned[r][c]) continue;
        // 续20：玩家正确格：fillNum === 解
        const playerCorrect = cell.fillNum != null && sol != null && cell.fillNum === sol;
        // 续20：AI 正确格：isAiFilled 且非失误（_aiNum === 解，自动修正后亦是解）
        const aiCorrect = cell.isAiFilled && cell._aiMistake !== true
          && sol != null && cell._aiNum != null && cell._aiNum === sol;
        if (playerCorrect || aiCorrect) continue;
        return false; // 空格或错误格
      }
    }
    return true;
  }

  /**
   * 棋盘是否已"填无空格"：所有非固定格都已有归属 / 数字 / 幽灵标记。
   * 注意时序：本方法在 _processFill 内（fillNum 被 UI 控制器临时清除以做归属仲裁）
   * 也会被调用，故不能只依赖 fillNum——必须同时计入 _playerOwned/_aiOwned
   * （正确格）与 _playerGhosts/_aiGhosts（错误格，红叉窗口内）。AI 幽灵格以
   * isAiFilled 标记。用于检测"盘面全满却含错格"的死锁场景，触发强制结算兜底。
   */
  _isBoardFilledNoEmpty() {
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (!cell || cell.fixedNum) continue;
        const key = r + ',' + c;
        const filled = cell.fillNum != null
          || cell.isAiFilled
          || this._playerOwned[r][c]
          || this._aiOwned[r][c]
          || this._playerGhosts.has(key)
          || this._aiGhosts.has(key);
        if (!filled) return false;
      }
    }
    return true;
  }

  /** 是否仍存在处于红叉锁定窗口内的错误格（锁定期间不应强制结算） */
  _hasActiveErrorLock() {
    const now = Date.now();
    for (const k in this._playerErrorLock) {
      if (this._playerErrorLock[k] && this._playerErrorLock[k] > now) return true;
    }
    for (const k in this._aiErrorLock) {
      if (this._aiErrorLock[k] && this._aiErrorLock[k] > now) return true;
    }
    return false;
  }

  /**
   * 满盘含错格兜底：棋盘已填无空格但非全对（玩家错格 / AI 错格），
   * 双方均无空格可落子 → 战斗已无进展空间。红叉窗口结束后强制结算，
   * 确保 Boss 战必能收口，避免"盘面全满却永不结算"的死锁。
   * 仅当棋盘仍填无空格且红叉窗口已过才结算；否则重新计时（玩家可能正在修正）。
   * 同时作为绝杀就绪 UI 倒计时（declineLine）的兜底：若 UI 未触发也照样收口。
   */
  _scheduleBoardSettleWatchdog() {
    if (this._ended || this._boardFillWatchdog) return;
    if (!this._isBoardFilledNoEmpty()) { this._boardFillWatchdogReArm = 0; return; }
    this._boardFillWatchdog = setTimeout(() => {
      this._boardFillWatchdog = null;
      if (this._ended) return;
      if (!this._isBoardFilledNoEmpty()) { this._boardFillWatchdogReArm = 0; return; } // 玩家已擦除错格，回到可解状态
      if (this._hasActiveErrorLock()) {
        // 续22：红叉窗口仍活跃 → 上限内可重计时（玩家可能正在修正）；
        // 超过上限则强制收口，杜绝极端情况下反复重计时导致永不结算。
        this._boardFillWatchdogReArm++;
        if (this._boardFillWatchdogReArm > this._boardFillWatchdogMaxReArm) {
          this._forceSettle('board_filled');
        } else {
          this._scheduleBoardSettleWatchdog();
        }
        return;
      }
      this._boardFillWatchdogReArm = 0;
      this._forceSettle('board_filled');
      }, 8000);
  }

  /**
   * 续20：近满盘死锁兜底。
   * 当盘面仅余少量空格（≤3）但长时间（_stallMs）无任何有效进展——玩家停手、
   * AI 又无法推演出剩余格——时，强制结算，避免"Boss 战填满却永不结算"。
   * 满盘无空格（含错格）由 _scheduleBoardSettleWatchdog 处理，此处仅覆盖"仍有空格"的死锁。
   * 仍有较多空格时不触发，以免打断正常思考中的对局。
   */
  _scheduleStallWatchdog() {
    if (this._ended || this._boardStallWatchdog) return;
    const empty = this._countEmptyCells();
    if (empty === 0 || empty > 3) return; // 满盘走另一兜底；空格较多=玩家仍在思考
    const idle = Date.now() - this._lastProgressTs;
    if (idle >= this._stallMs) {
      this._forceSettle('stall');
      return;
    }
    this._boardStallWatchdog = setTimeout(() => {
      this._boardStallWatchdog = null;
      if (this._ended) return;
      const idleNow = Date.now() - this._lastProgressTs;
      if (idleNow >= this._stallMs) {
        this._forceSettle('stall');
      } else {
        this._scheduleStallWatchdog();
      }
    }, this._stallMs - idle);
  }

  /** 续20：统计真正"无任何归属/数字/幽灵"的空格（用于死锁判定） */
  _countEmptyCells() {
    let n = 0;
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        const cell = this._board.cells?.[r]?.[c];
        if (!cell || cell.fixedNum) continue;
        const key = r + ',' + c;
        const filled = cell.fillNum != null
          || cell.isAiFilled
          || this._playerOwned[r][c]
          || this._aiOwned[r][c]
          || this._playerGhosts.has(key)
          || this._aiGhosts.has(key);
        if (!filled) n++;
      }
    }
    return n;
  }

  /**
   * 续20：近满盘闪烁提示。
   * 当真正空格数 ∈ (0, 3]（接近满盘）时，把剩余空格坐标发给 UI 高亮，
   * 引导玩家填完最后几格；空格数 >3 或棋盘结束/填满则发 near:false 令 UI 清除。
   * 仅在状态翻转时 emit，避免每次落子重复刷。
   */
  _emitNearFullState() {
    if (this._ended) {
      if (this._nearFullActive) {
        this._nearFullActive = false;
        this._emit(TPL_EVENTS.NEAR_FULL, { near: false });
      }
      return;
    }
    const empty = this._countEmptyCells();
    if (empty > 0 && empty <= 3) {
      const cells = [];
      for (let r = 0; r < this._size; r++) {
        for (let c = 0; c < this._size; c++) {
          const cell = this._board.cells?.[r]?.[c];
          if (!cell || cell.fixedNum) continue;
          const key = r + ',' + c;
          const filled = cell.fillNum != null
            || cell.isAiFilled
            || this._playerOwned[r][c]
            || this._aiOwned[r][c]
            || this._playerGhosts.has(key)
            || this._aiGhosts.has(key);
          if (!filled) cells.push({ r, c });
        }
      }
      this._nearFullActive = true;
      this._emit(TPL_EVENTS.NEAR_FULL, { near: true, count: empty, cells });
    } else if (this._nearFullActive) {
      this._nearFullActive = false;
      this._emit(TPL_EVENTS.NEAR_FULL, { near: false });
    }
  }

  _checkBoardFull() {
    if (this._ended) return;

    // 续20：近满盘死锁兜底——盘面仅余少量空格但双方均无进展（玩家停手/AI 无法推演）
    // 时，避免"35/36 永远不结算"。与满盘含错格兜底共用 8s 静默窗口。
    this._scheduleStallWatchdog();
    // 续20：近满盘闪烁提示——把剩余空格坐标发给 UI 高亮（引导玩家填最后几格）
    this._emitNearFullState();

    // 全盘落定（无空格）→ 隐藏据点最终显现并重算维度，让玩家累计的占领优势
    // 计入，划线绝杀才可能真正就绪（否则隐藏据点永远不显现，无法凑齐 3 据点）。
    if (this._isBoardFilledNoEmpty()) {
      this._finalizeHiddenHubs();
    }

    // 绝杀就绪且棋盘已无空格（即使含错格）→ 提示玩家划线处决，超时自动全局解题。
    // 同时挂兜底定时器：若 UI 倒计时未触发 declineLine，8s 后强制收口。
    if (this._lineReady && this._isBoardFilledNoEmpty()) {
      this._emit(TPL_EVENTS.LINE_READY, { side: this._lineReadySide, boardFull: true });
      this._scheduleBoardSettleWatchdog();
      return;
    }

    if (this._isBoardFullyFilled()) {
      // 绝杀已就绪（玩家占领全部3据点）：棋盘也满了，通知UI但不结束游戏
      // 玩家仍可划线触发三点连线绝杀（成就不同），UI层处理超时自动全局解题
      if (this._lineReady) {
        this._emit(TPL_EVENTS.LINE_READY, { side: this._lineReadySide, boardFull: true });
        this._scheduleBoardSettleWatchdog();
        return;
      }

      // 检查AI是否可绝杀（AI占领据点数领先）
      const playerHubs = this._hubs.filter(h => h.occupiedBy === 'player').length;
      const bossHubs = this._hubs.filter(h => h.occupiedBy === 'boss').length;
      if (bossHubs > playerHubs) {
        this._lineReady = true;
        this._lineReadySide = 'boss';
        this._emit(TPL_EVENTS.LINE_READY, { side: 'boss', playerHubs, bossHubs, boardFull: true });
        this._scheduleBoardSettleWatchdog();
        return;
      }

      // 路径C：迁移失败 + 棋盘满 → 强制结算
      if (this._migrationFailed) {
        this._forceSettle('migration_failed');
        return;
      }

      // 路径B：全局解题（棋盘满 + 无人可绝杀）
      this._fullBoardWin();
      return;
    }

    // 新增（bug 修复）：棋盘已填无空格（含玩家错格 / AI 错格）但非全对 →
    // 双方均无空格可落子，战斗已无进展空间。挂兜底定时器，红叉窗口后强制结算。
    if (this._isBoardFilledNoEmpty()) {
      this._scheduleBoardSettleWatchdog();
    }
  }

  /**
   * 触发三点连线绝杀（v2.0 6.1 手动/AI 连线操作）
   */
  triggerLineWin(side) {
    if (this._ended) return { success: false, reason: 'ended' };
    if (!this._lineReady) return { success: false, reason: 'not-ready' };
    if (this._lineReadySide !== side) return { success: false, reason: 'not-your-line' };
    this._endGame(side, 'three_point_line');
    this._emit(TPL_EVENTS.THREE_POINT_LINE, { side });
    this._log(`三点连线绝杀！${side} 获胜`);
    return { success: true };
  }

  /**
   * 放弃绝杀（v2.0 6.2：选择不绝杀 → 走全局解题）
   */
  declineLine() {    if (this._ended || !this._lineReady) return { success: false };
    this._lineDeclined = true;
    this._log('选择不绝杀，进入全局解题判定');
    this._fullBoardWin();
    return { success: true };
  }

  /**
   * 是否处于"可绝杀"状态（驱动/控制器据此让 AI 决策）
   */
  canLineWin(side) {
    return this._lineReady && this._lineReadySide === side;
  }

  /** v2.0：是否已进入可绝杀等待状态 */
  isLineReady() {
    return this._lineReady;
  }

  getLineReadySide() {
    return this._lineReadySide;
  }

  /**
   * 路径 B：全局解题（v2.0 6.2）——总归属格多者胜，持平按失误少者胜
   */
  _fullBoardWin() {
    let playerTotal = 0;
    let aiTotal = 0;
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        if (this._playerOwned[r][c]) playerTotal++;
        if (this._aiOwned[r][c]) aiTotal++;
      }
    }
    if (playerTotal > aiTotal) {
      this._endGame('player', 'full_board');
      this._emit(TPL_EVENTS.FULL_BOARD_WIN, { side: 'player', playerTotal, aiTotal });
    } else if (aiTotal > playerTotal) {
      this._endGame('boss', 'full_board');
      this._emit(TPL_EVENTS.FULL_BOARD_WIN, { side: 'boss', playerTotal, aiTotal });
    } else {
      // 持平 → 失误少者胜
      if (this._playerTotalErrors < this._aiTotalErrors) {
        this._endGame('player', 'full_board');
        this._emit(TPL_EVENTS.FULL_BOARD_WIN, { side: 'player', playerTotal, aiTotal, by: 'fewer_errors' });
      } else if (this._aiTotalErrors < this._playerTotalErrors) {
        this._endGame('boss', 'full_board');
        this._emit(TPL_EVENTS.FULL_BOARD_WIN, { side: 'boss', playerTotal, aiTotal, by: 'fewer_errors' });
      } else {
        this._forceSettle('full_board_tie');
      }
    }
  }

  /**
   * 路径 C：强制结算（v2.0 6.3）——据点数量 → 归属格数 → 失误数 → 平局
   * （归属格优先于失误：占住更多正确格 = 解得更多，与 full_board 判据一致）
   */
  _forceSettle(trigger) {
    if (this._ended) return;
    const playerHubs = this._hubs.filter(h => h.occupiedBy === 'player').length;
    const bossHubs = this._hubs.filter(h => h.occupiedBy === 'boss').length;
    let winner = 'draw';
    let reason = 'tie';

    if (playerHubs > bossHubs) { winner = 'player'; reason = 'more_hubs'; }
    else if (bossHubs > playerHubs) { winner = 'boss'; reason = 'more_hubs'; }
    else {
      let playerTotal = 0, aiTotal = 0;
      for (let r = 0; r < this._size; r++) {
        for (let c = 0; c < this._size; c++) {
          if (this._playerOwned[r][c]) playerTotal++;
          if (this._aiOwned[r][c]) aiTotal++;
        }
      }
      if (playerTotal > aiTotal) { winner = 'player'; reason = 'more_cells'; }
      else if (aiTotal > playerTotal) { winner = 'boss'; reason = 'more_cells'; }
      else if (this._playerTotalErrors < this._aiTotalErrors) { winner = 'player'; reason = 'fewer_errors'; }
      else if (this._aiTotalErrors < this._playerTotalErrors) { winner = 'boss'; reason = 'fewer_errors'; }
    }

    this._endGame(winner, 'force_settle');
    this._emit(TPL_EVENTS.FORCE_SETTLE, { winner, reason, trigger });
    this._log(`强制结算（${trigger}）：${winner}，原因 ${reason}`);
  }

  _endGame(winner, path) {
    if (this._ended) return;
    this._ended = true;
    if (this._boardFillWatchdog) { clearTimeout(this._boardFillWatchdog); this._boardFillWatchdog = null; }
    if (this._boardStallWatchdog) { clearTimeout(this._boardStallWatchdog); this._boardStallWatchdog = null; }
    this._boardFillWatchdogReArm = 0; // 续22：结束即清零，避免影响下一局
    this._winner = winner;
    this._winPath = path;
    this._emit(TPL_EVENTS.GAME_END, { winner, path, stats: this.getStats() });
    this._log(`游戏结束！胜者: ${winner}，路径: ${path}`);
  }

  // ============================================================
  //  6. 公共查询接口
  // ============================================================

  isEnded() {
    return this._ended;
  }

  getWinner() {
    return this._winner;
  }

  getWinPath() {
    return this._winPath;
  }

  getCurrentLeader() {
    const playerHubs = this._hubs.filter(h => h.occupiedBy === 'player').length;
    const bossHubs = this._hubs.filter(h => h.occupiedBy === 'boss').length;
    if (playerHubs > bossHubs) return 'player';
    if (bossHubs > playerHubs) return 'boss';
    return 'draw';
  }

  getPlayerOwnedGrid() {
    return this._playerOwned;
  }

  getAIOwnedGrid() {
    return this._aiOwned;
  }

  /** 完整据点数据（UI/驱动用） */
  getHubs() {
    return this._hubs.map(h => ({
      id: h.id,
      coreCell: { ...h.coreCell },
      visible: h.visible,
      castle: h.castle,
      occupiedBy: h.occupiedBy,
      migrated: h.migrated,
      dims: this._dimPublicState(h.dims),
    }));
  }

  _dimPublicState(dims) {
    const out = {};
    for (const dim of DIMS) {
      const d = dims[dim];
      out[dim] = { owner: d.owner, player: d.player, boss: d.boss, empty: d.empty };
    }
    return out;
  }

  /** 兼容旧接口：据点状态（blockIdx 为核心格所在宫） */
  getHubState() {
    return this._hubs.map(h => {
      const player = DIMS.reduce((s, d) => s + (h.dims[d].owner === 'player' ? 1 : 0), 0);
      const boss = DIMS.reduce((s, d) => s + (h.dims[d].owner === 'boss' ? 1 : 0), 0);
      return {
        blockIdx: this._blockIndexOf(h.coreCell.r, h.coreCell.c),
        coreCell: { ...h.coreCell },
        visible: h.visible,
        castle: h.castle,
        occupiedBy: h.occupiedBy,
        playerCount: player,   // 占领维度数（兼容 UI 角标）
        aiCount: boss,
        dims: this._dimPublicState(h.dims),
      };
    });
  }

  getHubOwnership() {
    return this._hubs.map(h => ({
      hubId: h.id,
      coreCell: { ...h.coreCell },
      occupiedBy: h.occupiedBy,
      visible: h.visible,
    }));
  }

  _blockIndexOf(r, c) {
    const boxH = this._size <= 6 ? 2 : 3;
    const boxW = this._size / boxH;
    return Math.floor(r / boxH) * boxH + Math.floor(c / boxW);
  }

  /** 兼容旧接口：据点宫索引数组 */
  getHubBlocks() {
    return this._hubs.map(h => this._blockIndexOf(h.coreCell.r, h.coreCell.c));
  }

  /** 兼容旧接口：城堡据点索引（v2.0：第 0 个据点） */
  getCastleHubIdx() {
    return 0;
  }

  /** 兼容旧接口：统计（playerCombo/aiCombo 恒 0，v2.0 无连击系统） */
  getStats() {
    let playerTotal = 0;
    let aiTotal = 0;
    for (let r = 0; r < this._size; r++) {
      for (let c = 0; c < this._size; c++) {
        if (this._playerOwned[r][c]) playerTotal++;
        if (this._aiOwned[r][c]) aiTotal++;
      }
    }
    return {
      playerOwned: playerTotal,
      aiOwned: aiTotal,
      playerErrors: this._playerTotalErrors,
      aiErrors: this._aiTotalErrors,
      playerCombo: 0,
      aiCombo: 0,
      playerHubs: this._hubs.filter(h => h.occupiedBy === 'player').length,
      aiHubs: this._hubs.filter(h => h.occupiedBy === 'boss').length,
      hubStates: this.getHubOwnership(),
      ended: this._ended,
      winner: this._winner,
      winPath: this._winPath,
    };
  }

  /** 获取指定方可抢占的幽灵格（红叉错误格） */
  getGhostCells(side) {
    const ghostSet = side === 'player' ? this._aiGhosts : this._playerGhosts;
    return [...ghostSet].map(k => {
      const [r, c] = k.split(',').map(Number);
      return { r, c };
    });
  }

  /**
   * CM4-R5：手动添加一个幽灵格（供 DramaEventManager 等外部系统使用）。
   * 不会触发错误计数/连击等副作用，仅加入可抢占集合。
   * @param {number} r
   * @param {number} c
   * @param {string} side - 'player' | 'boss'  幽灵归属于哪一方（对方可抢）
   */
  addGhostCell(r, c, side) {
    const key = `${r},${c}`;
    if (side === 'player') this._playerGhosts.add(key);
    else this._aiGhosts.add(key);
  }

  /**
   * CM4-R5：手动移除一个幽灵格（供 DramaEventManager 过期/清理使用）。
   * @param {number} r
   * @param {number} c
   * @param {string} side - 'player' | 'boss'
   */
  removeGhostCell(r, c, side) {
    const key = `${r},${c}`;
    if (side === 'player') this._playerGhosts.delete(key);
    else this._aiGhosts.delete(key);
  }

  /** v2.0 4.3：玩家是否可在此格填数（AI 占领格仅红叉窗口可抢占） */
  canPlayerFillCell(r, c) {
    if (this._ended) return false;
    if (this._playerOwned[r][c] || !this._aiOwned[r][c]) return true;
    return this._aiGhosts.has(`${r},${c}`);
  }

  /** 据点当前进度（AI 决策/驱动用）：各据点维度占领数 */
  getHubProgress() {
    return this._hubs.map(h => ({
      id: h.id,
      coreCell: { ...h.coreCell },
      visible: h.visible,
      occupiedBy: h.occupiedBy,
      playerDims: DIMS.filter(d => h.dims[d].owner === 'player').length,
      bossDims: DIMS.filter(d => h.dims[d].owner === 'boss').length,
    }));
  }

  /**
   * v2.0：各据点维度占领计数（AI 策略状态机选薄弱/危险据点用）
   * 返回 [{ id, player, boss, playerDims, bossDims, visible, occupiedBy }]
   */
  getHubCounts() {
    return this._hubs.map(h => ({
      id: h.id,
      player: DIMS.filter(d => h.dims[d].owner === 'player').length,
      boss: DIMS.filter(d => h.dims[d].owner === 'boss').length,
      playerDims: DIMS.filter(d => h.dims[d].owner === 'player').length,
      bossDims: DIMS.filter(d => h.dims[d].owner === 'boss').length,
      visible: h.visible,
      occupiedBy: h.occupiedBy,
    }));
  }

  /** v2.0：据点迁移是否已失败（进入"填满比多"模式）——AI 全局解题策略触发条件 */
  isMigrationFailed() {
    return this._migrationFailed;
  }

  // ============================================================
  //  7. 内部辅助
  // ============================================================

  _emit(event, data) {
    this._onEvent(event, data);
  }

  _log(...args) {
    this._logger(`[TPL]`, ...args);
  }
}

export default ThreePointLineManager;
