// ==========================================
// WhatIfManager - 迁移自 cagemaster3/game/WhatIfManager.js
// 转换为 ES Module 格式
// ==========================================
'use strict';

  class WhatIfManager {
    /**
     * @param {Object} [board] - 棋盘引用（可选，可通过 setBoard 后续设置）
     * @param {Object} [options]
     * @param {number} [options.maxSnapshots=3] - 最大快照数量
     * @param {Function} [options.onRender] - 快照应用后需要重绘时的回调（可选）
     * @param {Function} [options.screenshotFn] - 截图函数，返回 data URL 或 Promise<data URL>，每个快照创建时调用
     */
    constructor(board = null, options = {}) {
      this._board = board;
      this._maxSnapshots = options.maxSnapshots || 3;
      this._onRender = options.onRender || null;
      this._screenshotFn = typeof options.screenshotFn === 'function' ? options.screenshotFn : null;
      // v2.0：快照变化回调（快照新增/应用/回退/重置/退出后触发，宿主刷新快照卡片 UI）
      this._onSnapshotsChanged = typeof options.onSnapshotsChanged === 'function' ? options.onSnapshotsChanged : null;

      // 核心属性
      this.isActive = false;
      this.snapshots = [];
      this.currentSnapshotIndex = -1; // -1 表示当前是最新状态

      // 内部：根快照（进入 What If 模式时保存的初始状态）
      this._rootSnapshot = null;

      // V4.3.42：喘息机会预算——连续填错最多允许 maxChances 次（默认3）。
      // 每次填错回退（退到上一快照，或根时自动撤销该步）消耗1次；新建快照恢复1次（上限maxChances）。
      // 用尽后填错不再回退，计入真实错误（_levelMistakes）。
      this.maxChances = options.maxChances || 3;
      this.chancesLeft = 0;
    }

    /**
     * 设置棋盘引用
     * @param {Object} board
     */
    setBoard(board) {
      this._board = board;
    }

    /**
     * 设置渲染回调（快照应用后由宿主重绘棋盘）
     * @param {Function|null} cb - (board) => void
     */
    setOnRender(cb) {
      this._onRender = (typeof cb === 'function') ? cb : null;
    }

    /**
     * 获取棋盘引用
     * @returns {Object|null}
     */
    getBoard() {
      return this._board;
    }

    /**
     * 激活 What If 模式
     * 保存当前棋盘状态为根快照，清空分支快照栈。
     * @returns {boolean} 是否成功激活
     */
    activate() {
      if (this.isActive) return false;
      if (!this._board) return false;

      this._rootSnapshot = this._createBoardSnapshot('root');
      this.snapshots = [];
      this.currentSnapshotIndex = -1;
      this.isActive = true;
      // V4.3.42：进入假设模式即获得满额喘息机会
      this.chancesLeft = this.maxChances;

      this._dispatchEvent('whatif:activated');
      return true;
    }

    /**
     * V4.3.41：关卡重载/切换前调用——退出假设模式并丢弃所有快照（含根快照）。
     * 关键：不把旧会话的根快照回写到共享棋盘。
     * （修复"重玩本关后盘面残留玩家已填数字"：复用同一棋盘实例时，
     *  旧根快照会在 levelStart 的 deactivate(false) 中覆盖刚清空的引擎盘面。
     *  此处通过在 deactivate 前丢弃根快照，阻断该回写。）
     * 保留 _board 引用，下次 activate() 会基于当前棋盘重新建立根快照。
     * @returns {boolean}
     */
    detachFromBoard() {
      const wasActive = this.isActive;
      const hadRoot = !!this._rootSnapshot;
      this.isActive = false;
      this._rootSnapshot = null;
      this.snapshots = [];
      this.currentSnapshotIndex = -1;
      this.chancesLeft = 0;

      if (hadRoot) {
        this._dispatchEvent('whatif:deactivated', { adopt: false, discarded: true });
      }
      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 退出 What If 模式并重置
     * @param {boolean} [adopt=false] - 是否采纳当前更改（true=保留，false=回退到根状态）
     * @returns {boolean} 是否成功退出
     */
    deactivate(adopt = false) {
      if (!this.isActive) return false;

      if (!adopt && this._rootSnapshot) {
        // 回退到根状态
        this._restoreBoardSnapshot(this._rootSnapshot);
      }

      const wasActive = this.isActive;
      this.isActive = false;
      this._rootSnapshot = null;
      this.snapshots = [];
      this.currentSnapshotIndex = -1;
      this.chancesLeft = 0;

      if (wasActive) {
        this._dispatchEvent('whatif:deactivated', { adopt });
      }
      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 创建当前盘面快照
     * 超出最大数量时覆盖最旧的快照。
     * @param {string} [label=''] - 快照标签
     * @returns {Object|null} 新创建的快照对象，失败返回 null
     */
    createSnapshot(label = '') {
      if (!this.isActive || !this._board) return null;

      const snap = this._createBoardSnapshot(label);
      if (!snap) return null;

      // 滚动覆盖：超过上限时移除最旧的
      if (this.snapshots.length >= this._maxSnapshots) {
        this.snapshots.shift();
      }

      this.snapshots.push(snap);
      this.currentSnapshotIndex = -1; // -1 表示当前是最新状态

      // V4.3.42：新建快照恢复一次喘息机会（上限为 maxChances）
      if (this.chancesLeft < this.maxChances) this.chancesLeft++;

      this._notifySnapshotsChanged();
      return snap;
    }

    /**
     * 应用指定索引的快照
     * @param {number} index - 快照索引（0-based）
     * @returns {boolean} 是否成功应用
     */
    applySnapshot(index) {
      if (!this.isActive) return false;
      if (index < 0 || index >= this.snapshots.length) return false;

      const snap = this.snapshots[index];
      if (!snap) return false;

      this.currentSnapshotIndex = index;
      this._restoreBoardSnapshot(snap);
      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 回退到指定快照（丢弃该快照及其后的所有快照）
     * 用户语义：点快照 N → 恢复"快照 N 创建时"的盘面，快照 N 及之后全部删除。
     * @param {number} index - 快照索引（0-based）
     * @returns {boolean} 是否成功
     */
    revertTo(index) {
      if (!this.isActive) return false;
      if (index < 0 || index >= this.snapshots.length) return false;

      const snap = this.snapshots[index];
      if (!snap) return false;

      // 恢复该快照的盘面（= 该假设层点 + 号创建时的状态）
      this._restoreBoardSnapshot(snap);
      // 丢弃该快照及其之后的所有快照（快照 N 的"假设动作"作废）
      this.snapshots = this.snapshots.slice(0, index);
      this.currentSnapshotIndex = -1;

      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 更新最新快照的标签（填数打标签：'if a1=9'）
     * 仅在最新快照标签为空时生效（每个假设层只记第一个数字）。
     * @param {string} label
     * @returns {boolean} 是否已更新
     */
    setLatestSnapshotLabel(label) {
      if (!this.isActive || this.snapshots.length === 0) return false;
      const latest = this.snapshots[this.snapshots.length - 1];
      if (!latest || latest.label) return false;
      latest.label = label || '';
      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 采纳当前分支（将假设变正式）
     * 退出 What If 模式，保留当前棋盘状态。
     * @returns {boolean} 是否成功
     */
    accept() {
      if (!this.isActive) return false;
      return this.deactivate(true);
    }

    /**
     * V4.3.42：WhatIf 填错时消耗一次喘息机会并回退（不退出模式）
     * 有分支快照 → 退到上一快照（= 该快照建立时刻）；无分支（已退到根）→ 自动撤销刚填错的那一步。
     * 机会用尽（chancesLeft<=0）→ 返回 false，宿主转入"记真实错误"。
     * @returns {boolean} true=已回退；false=机会用尽，应计真实错误
     */
    revertBreath() {
      if (!this.isActive) return false;
      if (this.chancesLeft <= 0) return false;

      if (this.snapshots.length > 0) {
        // 有分支快照 → 弹出一张，退到上一分支（保留模式）
        this.snapshots.pop();
        if (this.snapshots.length > 0) {
          const prevSnap = this.snapshots[this.snapshots.length - 1];
          this.currentSnapshotIndex = this.snapshots.length - 1;
          this._restoreBoardSnapshot(prevSnap);
        } else {
          this.currentSnapshotIndex = -1;
          if (this._rootSnapshot) this._restoreBoardSnapshot(this._rootSnapshot);
        }
      } else if (this._board && typeof this._board.undo === 'function') {
        // 已退到根、无分支快照 → 用棋盘撤销回退刚填错的那一步（兜底，仍计入喘息次数）
        this._board.undo();
      } else {
        return false;
      }

      this.chancesLeft--;
      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 回退一步（回到上一个快照）
     * 如果没有更多快照，则回到根状态。
     * @returns {boolean} 是否成功回退
     */
    undo() {
      if (!this.isActive) return false;

      if (this.snapshots.length === 0) {
        // 没有快照了，回退到根状态并退出
        return this.deactivate(false);
      }

      // 弹出最新快照
      this.snapshots.pop();

      if (this.snapshots.length > 0) {
        // 恢复到上一个快照
        const prevSnap = this.snapshots[this.snapshots.length - 1];
        this.currentSnapshotIndex = this.snapshots.length - 1;
        this._restoreBoardSnapshot(prevSnap);
      } else {
        // 回到根状态
        this.currentSnapshotIndex = -1;
        if (this._rootSnapshot) {
          this._restoreBoardSnapshot(this._rootSnapshot);
        }
      }

      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 彻底回退（回到进入时的根状态，但不退出模式）
     * 清空所有分支快照。
     * @returns {boolean} 是否成功
     */
    reset() {
      if (!this.isActive || !this._rootSnapshot) return false;

      this._restoreBoardSnapshot(this._rootSnapshot);
      this.snapshots = [];
      this.currentSnapshotIndex = -1;
      this._notifySnapshotsChanged();
      return true;
    }

    /**
     * 检查当前棋盘状态与根快照相比是否有变化
     * @returns {boolean}
     */
    hasChangesFromRoot() {
      if (!this._board || !this._rootSnapshot || !this._rootSnapshot.cells) return false;
      for (let r = 0; r < this._board.size; r++) {
        for (let c = 0; c < this._board.size; c++) {
          const src = this._rootSnapshot.cells[r][c];
          const dst = this._board.cells[r][c];
          if (src.fillNum !== dst.fillNum) return true;
          if (src.candidates.size !== dst.candidates.size) return true;
        }
      }
      return false;
    }

    /**
     * 获取根快照（只读）
     * @returns {Object|null}
     */
    getRootSnapshot() {
      return this._rootSnapshot;
    }

    /**
     * 获取最大快照数
     * @returns {number}
     */
    getMaxSnapshots() {
      return this._maxSnapshots;
    }

    // ============================================================
    //  内部方法
    // ============================================================

    /**
     * 创建棋盘快照（深拷贝关键状态）
     * @param {string} label
     * @returns {Object|null}
     */
    _createBoardSnapshot(label) {
      if (!this._board) return null;
      const snapshot = {
        label: label || '',
        // 深拷贝格子数据
        cells: this._board.cells.map(row => row.map(cell => ({
          fillNum: cell.fillNum,
          fixedNum: cell.fixedNum,
          candidates: new Set(cell.candidates),
          eliminations: new Set(cell.eliminations),
          isError: cell.isError,
          isCageSumError: cell.isCageSumError,
          tempWrongNum: cell.tempWrongNum,
          isLocked: cell.isLocked,
        }))),
        // 选中状态
        selectedCell: this._board.selectedCell ? { ...this._board.selectedCell } : null,
        selectedCells: this._board.selectedCells.map(c => ({ ...c })),
        selectedCageId: this._board.selectedCageId,
        selectedCageIds: [...(this._board.selectedCageIds || [])],
        // 历史记录
        history: this._board.history ? [...this._board.history] : [],
        redoStack: this._board.redoStack ? [...this._board.redoStack] : [],
        // 时间戳
        timestamp: Date.now(),
        // 快照缩略图（data URL，由 _screenshotFn 提供）
        screenshot: null,
      };

      // 同步截图：_screenshotFn 返回 data URL
      if (typeof this._screenshotFn === 'function') {
        try {
          const result = this._screenshotFn();
          if (result && typeof result === 'string') {
            snapshot.screenshot = result;
          }
        } catch (e) {
          // 截图失败不影响快照创建
        }
      }

      return snapshot;
    }

    /**
     * 从快照恢复棋盘状态
     * @param {Object} snapshot
     */
    _restoreBoardSnapshot(snapshot) {
      if (!this._board || !snapshot) return;

      // 恢复格子数据
      for (let r = 0; r < this._board.size; r++) {
        for (let c = 0; c < this._board.size; c++) {
          const src = snapshot.cells[r][c];
          const dst = this._board.cells[r][c];
          dst.fillNum = src.fillNum;
          dst.fixedNum = src.fixedNum;
          dst.candidates = new Set(src.candidates);
          dst.eliminations = new Set(src.eliminations);
          dst.isError = src.isError;
          dst.isCageSumError = src.isCageSumError;
          dst.tempWrongNum = src.tempWrongNum;
          dst.isLocked = src.isLocked;
          dst.isSelected = false;
        }
      }

      // 恢复选中状态
      this._board.selectedCell = snapshot.selectedCell ? { ...snapshot.selectedCell } : null;
      this._board.selectedCells = snapshot.selectedCells.map(c => ({ ...c }));
      this._board.selectedCageId = snapshot.selectedCageId;
      this._board.selectedCageIds = [...(snapshot.selectedCageIds || [])];

      // 重新设置选中标记
      if (this._board.selectedCell) {
        const { r, c } = this._board.selectedCell;
        if (this._board.cells[r] && this._board.cells[r][c]) {
          this._board.cells[r][c].isSelected = true;
        }
      }
      for (const sc of this._board.selectedCells) {
        if (this._board.cells[sc.r] && this._board.cells[sc.r][sc.c]) {
          this._board.cells[sc.r][sc.c].isSelected = true;
        }
      }

      // 恢复历史
      this._board.history = snapshot.history ? [...snapshot.history] : [];
      this._board.redoStack = snapshot.redoStack ? [...snapshot.redoStack] : [];

      // 通知需要重绘
      if (typeof this._onRender === 'function') {
        this._onRender(this._board);
      }
    }

    /**
     * 派发自定义事件
     * @param {string} type
     * @param {Object} [detail]
     */
    _dispatchEvent(type, detail = {}) {
      if (typeof document !== 'undefined' && document.dispatchEvent) {
        const evt = new CustomEvent(type, { detail });
        document.dispatchEvent(evt);
      }
    }

    /**
     * 通知宿主刷新快照卡片 UI（快照栈变化后调用）
     * @private
     */
    _notifySnapshotsChanged() {
      if (typeof this._onSnapshotsChanged === 'function') {
        try { this._onSnapshotsChanged(this.snapshots, this.currentSnapshotIndex); } catch (e) { console.warn('[WhatIf] snapshots changed:', e); }
      }
    }
  }

  // 暴露到全局

export { WhatIfManager };
